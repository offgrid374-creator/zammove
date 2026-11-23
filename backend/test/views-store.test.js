'use strict';
/* Data isolation in the role-scoped views, and the persistence layer (diffing, rollback, Supabase adapter, HTTP auth). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, world, future } = require('./_setup');
const { State, emptyState } = require('../src/state');
const { memoryStore, supabaseStore } = require('../src/store');
const createDomain = require('../src/domain');
process.env.GEO_OFFLINE = '1'; // never call OpenStreetMap from tests
const { createApp } = require('../src/app');
const { hashPassword } = require('../src/util');

test('customers only see their own records; secrets never leave the server', async () => {
  const t = await setup();
  const a = (await t.booking('c1@t.ph')).id,
    b = (await t.booking('c2@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id: a });
  await t.act('d1@t.ph', 'step', { id: a, to: 'On the Way to Pickup' });
  t.me('c1@t.ph').pw = hashPassword('Passw0rd1');
  const v1 = t.d.view(t.me('c1@t.ph'));
  assert.deepEqual(
    v1.bk.map(x => x.id),
    [a]
  );
  assert.ok(!v1.nt.some(n => n.to != 'c1@t.ph'));
  assert.ok(!v1.users.some(u => u.em == 'c2@t.ph'), 'other customers are not listed');
  assert.ok(
    v1.users.some(u => u.em == 'd1@t.ph'),
    'own driver is listed'
  );
  const dv = t.d.view(t.me('d2@t.ph'));
  const open = dv.bk.find(x => x.id == b);
  assert.ok(open && !open.cu, 'open requests hide the customer');
  for (const em of ['c1@t.ph', 'd1@t.ph', 'o@t.ph', 'k@t.ph', 'a@t.ph']) {
    const json = JSON.stringify(t.d.view(t.me(em)));
    assert.ok(!json.includes('scrypt$'), 'no password hash for ' + em);
    assert.ok(!/"pw":/.test(json), 'no pw field for ' + em);
  }
  assert.equal(t.d.view(null).bk.length, 0, 'logged-out view is empty');
});

test('commit writes only changed rows; a failing database write rolls the state back', async () => {
  const writes = [];
  const base = memoryStore();
  let fail = false;
  const store = {
    kind: 'spy',
    loadAll: base.loadAll,
    async write(u, d) {
      if (fail) throw new Error('db down');
      writes.push({ u, d });
      return base.write(u, d);
    },
  };
  const t = await setup(world(), store);
  writes.length = 0;
  await t.act('d1@t.ph', 'setAvail', { s: 'Unavailable' });
  const tables = Object.keys(writes[0].u);
  assert.deepEqual(tables.sort(), ['audit_log', 'driver_status']);
  fail = true;
  await assert.rejects(t.act('d1@t.ph', 'setAvail', { s: 'Available' }));
  assert.equal(t.S.dp['d1@t.ph'].avail, 'Unavailable', 'rolled back');
  fail = false;
  const st2 = await new State(base).init();
  assert.equal(st2.S.dp['d1@t.ph'].avail, 'Unavailable', 'reloaded from the store');
});

test('Supabase adapter: paged load, chunked upsert and delete (fake client)', async () => {
  const calls = [];
  const db = { users: [{ id: 'a@t.ph', data: { em: 'a@t.ph', name: 'A' } }] };
  const q = t => ({
    select() {
      return this;
    },
    order() {
      return this;
    },
    range(a, b) {
      calls.push(['range', t, a, b]);
      return Promise.resolve({ data: (db[t] || []).slice(a, b + 1), error: null });
    },
    upsert(rows, o) {
      calls.push(['upsert', t, rows.length, o.onConflict]);
      return Promise.resolve({ error: null });
    },
    delete() {
      return {
        in: (c, ids) => {
          calls.push(['delete', t, ids.length]);
          return Promise.resolve({ error: null });
        },
      };
    },
  });
  const s = supabaseStore('', '', { from: q });
  const rows = await s.loadAll(['users', 'bookings']);
  assert.equal(rows.users[0].data.name, 'A');
  await s.write(
    { bookings: Array.from({ length: 1200 }, (_, i) => ({ id: 'B' + i, data: {} })) },
    { payments: ['P1'] }
  );
  assert.deepEqual(
    calls.filter(c => c[0] == 'upsert').map(c => c[2]),
    [500, 500, 200]
  );
  assert.ok(calls.some(c => c[0] == 'delete' && c[1] == 'payments'));
  const bad = supabaseStore('', '', {
    from: () => ({ upsert: () => Promise.resolve({ error: { message: 'permission denied' } }) }),
  });
  await assert.rejects(bad.write({ users: [{ id: 'x', data: {} }] }, {}), /permission denied/);
});

test('HTTP: login gives a token; actions need it; a forged identity in the body is ignored', async () => {
  const st = await new State(memoryStore()).init();
  const data = world();
  data.users.forEach(u => (u.pw = hashPassword('Passw0rd1')));
  await st.run(() => st.replace({ ...emptyState(), ...data }));
  const app = createApp({
    state: st,
    domain: createDomain(st.S),
    cfg: { tokenSecret: 'test-secret', frontendDir: __dirname },
  });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port + '/api';
  const post = (p, body, tok) =>
    fetch(base + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
      body: JSON.stringify(body),
    }).then(async r => ({ status: r.status, ...(await r.json()) }));
  try {
    assert.equal((await post('/act/setAvail', { s: 'Unavailable' })).status, 401);
    const login = await post('/auth/login', { em: 'c1@t.ph', pw: 'Passw0rd1' });
    assert.ok(login.token && login.state.users.length);
    const r = await post(
      '/act/createBooking',
      {
        pu: 'Tetuan, Zamboanga City',
        dr: 'Putik, Zamboanga City',
        dt: future(),
        tm: '09:00',
        vid: 'l3',
        it: 'Sofa and 2 boxes',
        sz: 'M',
        cu: 'c2@t.ph',
      },
      login.token
    );
    assert.ok(r.ok, r.err);
    assert.equal(st.S.bk[0].cu, 'c1@t.ph', 'customer comes from the token, not the body');
    assert.equal((await post('/act/staffAdd', { em: 'c1@t.ph', role: 'admin' }, login.token)).ok, false);
    assert.equal((await post('/act/nope', {}, login.token)).status, 404);
    assert.equal((await post('/act/setAvail', { s: 'Available' }, login.token + 'x')).status, 401);
    const tr = await post('/public/track', { ref: st.S.bk[0].id });
    assert.equal(tr.b.st, 'Pending');
    assert.ok(!tr.b.cu);
  } finally {
    srv.close();
  }
});
