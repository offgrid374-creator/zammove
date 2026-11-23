'use strict';
/* HTTP API. Every change goes through POST /api/act/:name, which runs a server-side rule as the logged-in user. */
const express = require('express');
const geo = require('./geo');
const path = require('path');
const { signToken, readToken, hashPassword } = require('./util');
const { emptyState } = require('./state');

function createApp({ state, domain, cfg }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      /* other sites see only our origin (e.g. http://localhost:3000), never the page path. OpenStreetMap's tile
         servers require a Referer and block map tiles without one ('same-origin' sent none). */
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  app.use(express.json({ limit: '8mb' }));

  const api = express.Router();
  const tokenOf = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  /* resolve the user from the token against the CURRENT state (tokens die on password reset or suspension) */
  const userOf = token => {
    const p = readToken(token, cfg.tokenSecret);
    if (!p) return null;
    const u = state.S.users.find(x => x.em == p.em);
    return u && (u.tv || 0) === p.tv && u.status != 'suspended' ? u : null;
  };
  const view = me => ({ ...domain.view(me), version: state.version });
  const fail = (res, e) => {
    console.error('[zammove]', e);
    res.status(500).json({ ok: false, err: 'Could not save. Nothing was changed. Please try again.' });
  };

  api.get('/health', (req, res) => res.json({ ok: true, store: state.store.kind, version: state.version }));

  api.get('/state', async (req, res) => {
    const token = tokenOf(req);
    try {
      await state.run(() => domain.h.sweep());
      const me = token ? userOf(token) : null;
      if (token && !me)
        return res.status(401).json({ ok: false, err: 'Your session ended. Please log in again.' });
      res.json({ ok: true, state: view(me) });
    } catch (e) {
      fail(res, e);
    }
  });

  const AUTH = {
    signup: 'signup',
    login: 'login',
    forgot: 'forgot',
    reset: 'resetPassword',
    'owner-setup': 'ownerSetup',
  };
  api.post('/auth/:op', async (req, res) => {
    const fn = AUTH[req.params.op];
    if (!fn) return res.status(404).json({ ok: false, err: 'Unknown request.' });
    try {
      const r = await state.run(() => domain.auth[fn](req.body || {}, cfg.ownerSetupCode));
      const { user, ...rest } = r;
      if (r.ok && user)
        return res.json({
          ...rest,
          token: signToken({ em: user.em, tv: user.tv || 0 }, cfg.tokenSecret),
          state: view(user),
        });
      res.json(rest);
    } catch (e) {
      fail(res, e);
    }
  });

  /* ---- OpenStreetMap: address search, reverse lookup and road routes (proxied, cached, rate-limited) ---- */
  const hits = new Map();
  const limited = req => {
    const k = req.ip || 'x',
      now = Date.now(),
      e = hits.get(k) || { n: 0, t: now + 6e4 };
    if (now > e.t) Object.assign(e, { n: 0, t: now + 6e4 });
    e.n++;
    hits.set(k, e);
    if (hits.size > 5000) hits.clear();
    return e.n > 90; // per minute and address
  };
  const geoRoute = fn => async (req, res) => {
    if (limited(req))
      return res.status(429).json({ ok: false, err: 'Too many map requests. Wait a minute.' });
    try {
      res.json({ ok: true, ...(await fn(req.query)) });
    } catch (e) {
      res.status(503).json({
        ok: false,
        err: 'The map service is not reachable right now. Pick a place from the list instead.',
      });
    }
  };
  const pt = s => {
    const m = String(s || '').match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    return m ? [+m[1], +m[2]] : null;
  };
  api.get(
    '/geo/search',
    geoRoute(async q => ({ results: await geo.search(q.q) }))
  );
  api.get(
    '/geo/reverse',
    geoRoute(async q => ({ place: await geo.reverse(q.lat, q.lng) }))
  );
  api.get(
    '/geo/route',
    geoRoute(async q => ({ route: await geo.route(pt(q.a), pt(q.b), pt(q.c), pt(q.d)) }))
  );

  /* actions that price a trip get the road distance from OSRM first (computed here, never trusted from the browser) */
  const ROAD = new Set(['quote', 'createBooking', 'requote']);

  api.post('/act/:name', async (req, res) => {
    const fn =
      Object.prototype.hasOwnProperty.call(domain.actions, req.params.name) &&
      domain.actions[req.params.name];
    if (!fn) return res.status(404).json({ ok: false, err: 'Unknown action.' });
    const token = tokenOf(req);
    const body = { ...(req.body || {}) };
    delete body.__road;
    if (ROAD.has(req.params.name)) {
      const rk = await geo.roadKm(String(body.pu || '').slice(0, 200), String(body.dr || '').slice(0, 200));
      if (rk) body.__road = rk;
    }
    try {
      let me = null;
      const r = await state.run(() => {
        me = userOf(token);
        if (!me) return { ok: false, err: 'Please log in again.', auth: true };
        domain.h.sweep();
        return fn(me, body);
      });
      if (r.auth) return res.status(401).json(r);
      res.json({ ...r, state: view(userOf(token)) });
    } catch (e) {
      fail(res, e);
    }
  });

  api.post('/public/track', (req, res) => res.json(domain.publicTrack(req.body || {})));

  /* PROTOTYPE ONLY: no SMS/email provider is connected, so messages a provider would deliver (verification and
     reset codes, a recipient's Delivery PIN) are kept here, looked up by phone number or email. Disabled in production;
     replace with a real provider (e.g. Semaphore for SMS) before going live. */
  if (!cfg.production)
    api.get('/dev/inbox', (req, res) => {
      const to = String(req.query.to || '').trim().toLowerCase();
      if (to.length < 5) return res.json({ ok: false, err: 'Enter a phone number or email.' });
      res.json({ ok: true, messages: state.S.nt.filter(n => n.sim && n.addr == to).slice(0, 20).map(n => ({ ch: n.sim, t: n.t, b: n.b })) });
    });

  /* test-only: replace all data (never enabled in production) */
  if (cfg.allowTestSeed) {
    api.post('/test/seed', async (req, res) => {
      const { data = {}, passwords = {} } = req.body || {};
      await state.run(S => {
        const next = { ...emptyState(), ...data, cfg: { ...emptyState().cfg, ...(data.cfg || {}) } };
        next.users = (next.users || []).map(u => ({
          tv: 0,
          roles: [],
          ...u,
          pw: passwords[u.em] ? hashPassword(passwords[u.em]) : u.pw || '',
        }));
        state.replace(next);
      });
      res.json({ ok: true });
    });
  }

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ ok: false, err: 'Not found.' }));
  app.get('/', (req, res) => res.redirect('/customer/'));
  app.use(express.static(cfg.frontendDir, { extensions: ['html'], index: 'index.html' }));
  return app;
}

module.exports = { createApp };
