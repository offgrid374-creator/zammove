'use strict';
/* In-browser stand-in for backend/src/app.js. It answers the same requests the real server answers
   (GET /state, POST /auth/:op, POST /act/:name, POST /public/track, GET /geo/*), running the SAME business
   rules (backend/src/domain, bundled into engine.js). Data is kept in this browser (localStorage) and shared
   between windows of the same demo, so a customer window and a driver window see each other's changes. */
const createDomain = require('./domain');
const geo = require('./geo');
const { signToken, readToken, hashPassword } = require('./util');

const KEY = 'zammove-demo-state'; // localStorage fallback only (browsers without IndexedDB on file pages)
const COLL = ['users', 'apps', 'vh', 'asg', 'bk', 'rn', 'pay', 'inc', 'rev', 'nt', 'rem', 'au'];
/* a booking waits a day for a driver in the demo (the real default is 30 minutes) so it never times out mid-presentation */
const DEFAULT_CFG = { coShare: 80, pendMin: 1440, comm: 15, drvPct: 20 };
const PASSWORD = 'Demo1234';
const S = {};
let version = 0,
  stamp = '', // id of the data this window holds; every save gets a new one
  storageFull = false;

const empty = () => ({ ...Object.fromEntries(COLL.map(k => [k, []])), dp: {}, cfg: { ...DEFAULT_CFG } });
const replace = x => {
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, empty(), x, { cfg: { ...DEFAULT_CFG, ...((x && x.cfg) || {}) } });
};
function seed() {
  const d = window.ZM_SEED();
  d.users.forEach(u => {
    u.pw = hashPassword(PASSWORD);
    u.tv = u.tv || 0;
  });
  return { ...d, seededAt: new Date().toISOString() };
}
const newStamp = () => {
  version++;
  stamp = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
};
const valid = x => x && Array.isArray(x.users) && x.users.length;

/* Storage shared by every window of the demo. Each request runs inside ONE IndexedDB read-write transaction
   (read the newest data, apply the rules, write back). The browser runs such transactions one after another
   across windows, so a background request in one window (a GPS ping) can never overwrite what another window
   just saved. localStorage is not used for this: Chrome copies it between windows with a delay. */
let dbp = null;
const openDb = () =>
  dbp ||
  (dbp = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no IndexedDB'));
    const r = indexedDB.open('zammove-demo', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));

/* fallback: this window only (still saved for a reload) */
function lsTx(work) {
  if (!stamp) {
    let x = null;
    try {
      x = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) {}
    replace(valid(x) ? x : seed());
    newStamp();
  }
  const o = work();
  if (o.dirty) {
    newStamp();
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      storageFull = false;
    } catch (e) {
      storageFull = true;
    }
  }
  return o.out;
}

/* work() runs synchronously on the newest data and returns { out, dirty } */
async function tx(work) {
  let db;
  try {
    db = await openDb();
  } catch (e) {
    return lsTx(work);
  }
  return new Promise((res, rej) => {
    let out,
      wrote = false;
    const t = db.transaction('kv', 'readwrite'),
      kv = t.objectStore('kv');
    const go = () => {
      let o;
      try {
        o = work();
      } catch (e) {
        t.abort();
        return rej(e);
      }
      out = o.out;
      if (o.dirty) {
        newStamp();
        wrote = true;
        kv.put(S, 'data'); // stored as a copy taken right now
        kv.put(stamp, 'stamp');
      }
    };
    const g = kv.get('stamp');
    g.onsuccess = () => {
      const v = g.result;
      if (v && v == stamp) return go(); // this window already has the newest data
      const d = kv.get('data');
      d.onsuccess = () => {
        if (valid(d.result)) {
          replace(d.result);
          stamp = v;
          version++; // the page's poll sees a new version and redraws
          go();
        } else {
          replace(seed()); // first start: the example data
          const w = work;
          work = () => ({ ...w(), dirty: true });
          go();
        }
      };
    };
    t.oncomplete = () => {
      if (wrote) storageFull = false;
      res(out);
    };
    t.onabort = t.onerror = () => {
      const e = t.error;
      if (e && e.name == 'QuotaExceededError') storageFull = true;
      stamp = ''; // what this window holds was not saved: read it again next time
      rej(e || new Error('storage error'));
    };
  });
}

/* one action at a time; on an error the data is put back exactly as it was */
const run = fn =>
  tx(() => {
    const before = JSON.stringify(S);
    try {
      return { out: fn(), dirty: true };
    } catch (e) {
      console.error('[zammove demo]', e);
      replace(JSON.parse(before));
      return { out: [500, { ok: false, err: 'Something went wrong. Nothing was changed.' }], dirty: false };
    }
  }).catch(e => [500, { ok: false, err: storageFull ? 'The browser storage is full. Open the Demo panel → Data → Reset.' : 'Could not save in this browser: ' + ((e && e.message) || e) }]);
const domain = createDomain(S);
const userOf = token => {
  const p = readToken(token);
  if (!p) return null;
  const u = S.users.find(x => x.em == p.em);
  return u && (u.tv || 0) === p.tv && u.status != 'suspended' ? u : null;
};
const view = me => ({ ...domain.view(me), version });
const AUTH = { signup: 'signup', login: 'login', forgot: 'forgot', reset: 'resetPassword', 'owner-setup': 'ownerSetup' };
const ROAD = new Set(['quote', 'createBooking']);
const pt = s => {
  const m = String(s || '').match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  return m ? [+m[1], +m[2]] : null;
};

/* returns [httpStatus, json] like the real server */
async function handle(method, url, body, token) {
  const [path, qs] = String(url).split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  let m;
  if (method == 'GET' && path == '/health') return [200, { ok: true, store: 'browser (demo)', version }];
  if (method == 'GET' && path == '/state') {
    return tx(() => {
      const dirty = !!domain.h.sweep();
      const me = token ? userOf(token) : null;
      if (token && !me) return { out: [401, { ok: false, err: 'Your session ended. Please log in again.' }], dirty };
      return { out: [200, { ok: true, state: view(me) }], dirty };
    }).catch(() => [503, { ok: false, err: 'Could not read the demo data in this browser.' }]);
  }
  if (method == 'POST' && (m = path.match(/^\/auth\/([a-z-]+)$/))) {
    const fn = AUTH[m[1]];
    if (!fn) return [404, { ok: false, err: 'Unknown request.' }];
    return run(() => {
      const r = domain.auth[fn](body || {}, '');
      const { user, ...rest } = r;
      if (r.ok && user) return [200, { ...rest, token: signToken({ em: user.em, tv: user.tv || 0 }), state: view(user) }];
      return [200, rest];
    });
  }
  if (method == 'POST' && (m = path.match(/^\/act\/(\w+)$/))) {
    const fn = Object.prototype.hasOwnProperty.call(domain.actions, m[1]) && domain.actions[m[1]];
    if (!fn) return [404, { ok: false, err: 'Unknown action.' }];
    const b = { ...(body || {}) };
    delete b.__road;
    if (ROAD.has(m[1])) {
      const rk = await geo.roadKm(String(b.pu || '').slice(0, 200), String(b.dr || '').slice(0, 200));
      if (rk) b.__road = rk;
    }
    return run(() => {
      const me = userOf(token);
      if (!me) return [401, { ok: false, err: 'Please log in again.', auth: true }];
      domain.h.sweep();
      const r = fn(me, b);
      return [200, { ...r, state: view(userOf(token)) }];
    });
  }
  if (method == 'POST' && path == '/public/track') return tx(() => ({ out: [200, domain.publicTrack(body || {})], dirty: false }));
  if (method == 'GET' && path.startsWith('/geo/')) {
    try {
      if (path == '/geo/search') return [200, { ok: true, results: await geo.search(q.q) }];
      if (path == '/geo/reverse') return [200, { ok: true, place: await geo.reverse(q.lat, q.lng) }];
      if (path == '/geo/route') return [200, { ok: true, route: await geo.route(pt(q.a), pt(q.b), pt(q.c), pt(q.d)) }];
    } catch (e) {
      return [503, { ok: false, err: 'The map service is not reachable right now. Pick a place from the list instead.' }];
    }
  }
  return [404, { ok: false, err: 'Unknown request.' }];
}

window.ZM_ENGINE = {
  handle,
  password: PASSWORD,
  version: () => version,
  storageFull: () => storageFull,
  seededAt: () => S.seededAt,
  /* back to the example data (fresh dates) */
  reset: () =>
    tx(() => {
      replace(seed());
      return { out: true, dirty: true };
    }),
};
