'use strict';
/* Driver ↔ vehicle assignments: owner request or admin assignment, driver acceptance, signed agreement,
   admin activation with document checks, ending; recommendations linked to applications; document expiry. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, world, driver, van, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const sig = 'data:image/png;base64,SIGN';
const past = d => future(-d);

/* the standard world plus an unassigned approved van V3 and a pool driver P (no vehicle) */
async function pool() {
  const w = world();
  w.vh.push(van('V3', 'o@t.ph', 'CCC 3333'));
  w.users.push({ ...driver('Pia Pool', 'p@t.ph'), dx: { lic: future(400), clr: future(200) } });
  w.dp['p@t.ph'] = { avail: 'Unavailable' };
  return setup(w);
}
const A = (t, id) => t.S.asg.find(x => x.id == id);
const signBoth = async (t, id) => {
  assert.ok((await t.act('p@t.ph', 'assignSign', { id, name: 'Pia Pool', sig, agree: true })).ok);
  return t.act('o@t.ph', 'assignSign', { id, name: 'Olga Owner', sig, agree: true });
};

test('owner assigns a pool driver: admin approves → driver accepts → both sign → admin activates', async () => {
  const t = await pool();
  const req = x => t.act('o@t.ph', 'reqAssign', { vehicle: 'V3', driver: 'p@t.ph', mode: 'assign', pct: 35, fuel: 'Driver', ...x });
  assert.match((await req({ pct: 95 })).err, /10% and 85%/);
  assert.match((await t.act('c1@t.ph', 'reqAssign', { vehicle: 'V3', driver: 'p@t.ph', mode: 'assign' })).err, /approved vehicle owner/);
  const id = (await req()).id;
  assert.equal(A(t, id).st, 'Pending Admin Review');
  assert.match((await req()).err, /already an open request/);
  assert.match((await t.act('p@t.ph', 'assignRespond', { id, act: 'accept' })).err, /no offer/);
  assert.ok((await t.act('a@t.ph', 'assignDecision', { id, act: 'approve' })).ok);
  assert.equal(A(t, id).st, 'Awaiting Driver');
  assert.match((await t.act('p@t.ph', 'assignRespond', { id, act: 'decline', reason: '' })).err, /why you decline/);
  const r = await t.act('p@t.ph', 'assignRespond', { id, act: 'accept' });
  assert.ok(r.ok && /^DA-/.test(r.no));
  const ag = A(t, id).ag;
  assert.deepEqual([ag.terms.pct, ag.terms.fuel, ag.terms.veh.plate, ag.terms.driver.name], [35, 'Driver', 'CCC 3333', 'Pia Pool']);
  assert.ok(ag.terms.clauses.length >= 10 && /^[0-9a-f]{64}$/.test(ag.h));
  assert.match((await t.act('a@t.ph', 'assignActivate', { id })).err, /not ready/);
  assert.match((await t.act('c1@t.ph', 'assignSign', { id, name: 'Carla Cust', sig, agree: true })).err, /Only the driver or the vehicle owner/);
  assert.match((await t.act('p@t.ph', 'assignSign', { id, name: 'Pia', sig, agree: true })).err, /exactly as on your account/);
  assert.ok((await signBoth(t, id)).done);
  assert.equal(A(t, id).st, 'Pending Activation');
  assert.match((await t.act('o@t.ph', 'assignActivate', { id })).err, /Administrator/);
  assert.ok((await t.act('a@t.ph', 'assignActivate', { id })).ok);
  assert.equal(A(t, id).st, 'Active');
  assert.equal(t.d.h.asgOf('p@t.ph').vehicle, 'V3', 'the driver can now take bookings with V3');
});

test('admin assigns directly; the driver may decline', async () => {
  const t = await pool();
  assert.match((await t.act('o@t.ph', 'adminAssignVehicle', { vehicle: 'V3', driver: 'p@t.ph' })).err, /Administrator/);
  assert.match((await t.act('a@t.ph', 'adminAssignVehicle', { vehicle: 'V3', driver: 'c1@t.ph' })).err, /approved, active driver/);
  const id = (await t.act('a@t.ph', 'adminAssignVehicle', { vehicle: 'V3', driver: 'p@t.ph' })).id;
  assert.deepEqual([A(t, id).st, A(t, id).mode, A(t, id).terms.pct], ['Awaiting Driver', 'Admin assignment', 20]);
  assert.ok(t.S.nt.some(n => n.to == 'o@t.ph' && /proposed Pia Pool/.test(JSON.stringify(n))), 'owner is told');
  assert.ok((await t.act('p@t.ph', 'assignRespond', { id, act: 'decline', reason: 'Too far from my home' })).ok);
  assert.equal(A(t, id).st, 'Declined');
});

test('owner records a signed paper agreement; activation replaces the vehicle’s previous driver', async () => {
  const t = await pool();
  const id = (await t.act('a@t.ph', 'adminAssignVehicle', { vehicle: 'V1', driver: 'p@t.ph' })).id;
  await t.act('p@t.ph', 'assignRespond', { id, act: 'accept' });
  assert.match((await t.act('p@t.ph', 'assignSign', { id, how: 'paper', photo: pic })).err, /Only the owner/);
  assert.ok((await t.act('o@t.ph', 'assignSign', { id, how: 'paper', photo: pic })).done);
  assert.ok((await t.act('a@t.ph', 'assignActivate', { id })).ok);
  assert.equal(t.S.asg.find(x => x.id == 'S1').st, 'Ended', 'Dina’s old assignment of V1 ended');
});

test('recommendation waits for the application and moves to the driver when it is approved', async () => {
  const t = await pool();
  const r = await t.act('o@t.ph', 'reqAssign', { vehicle: 'V3', driver: 'c2@t.ph', mode: 'recommend' });
  assert.ok(r.ok && r.waiting);
  assert.equal(A(t, r.id).st, 'Waiting for Application');
  assert.ok(t.S.nt.some(n => n.to == 'c2@t.ph' && /recommends you/.test(JSON.stringify(n))));
  assert.match((await t.act('a@t.ph', 'assignDecision', { id: r.id, act: 'approve' })).err, /not approved yet/);
  const docs = { driver: [pic, pic, pic, pic] };
  const apply = x => t.act('c2@t.ph', 'apply', { roles: ['driver'], phone: '0917', address: 'Tetuan', license: 'N01-99-123456', licExp: future(500), clrExp: future(300), docs, ...x });
  assert.match((await apply({ licExp: past(3) })).err, /license expiry/);
  assert.match((await apply({ clrExp: '' })).err, /clearance/);
  assert.ok((await apply()).ok);
  const app = t.S.apps.find(a => a.user == 'c2@t.ph');
  assert.deepEqual(app.rec, [r.id], 'the application shows the recommendation');
  for (const act of ['verify', 'interview', 'orient', 'orientdone', 'approve'])
    assert.ok((await t.act('a@t.ph', 'appAction', { id: app.id, act, when: '2026-12-01T10:00', where: 'Office' })).ok, act);
  assert.equal(A(t, r.id).st, 'Awaiting Driver');
  assert.equal(t.S.users.find(u => u.em == 'c2@t.ph').dx.lic, future(500));
});

test('expired documents block accepting, activation and new bookings; renewal fixes it', async () => {
  const t = await pool();
  const id = (await t.act('a@t.ph', 'adminAssignVehicle', { vehicle: 'V3', driver: 'p@t.ph' })).id;
  const pia = t.S.users.find(u => u.em == 'p@t.ph');
  pia.dx.lic = past(1);
  assert.match((await t.act('p@t.ph', 'assignRespond', { id, act: 'accept' })).err, /license expired/);
  assert.match((await t.act('p@t.ph', 'driverDocUpdate', { kind: 'lic', exp: past(1), file: pic })).err, /in the future/);
  assert.match((await t.act('p@t.ph', 'driverDocUpdate', { kind: 'lic', exp: future(900) })).err, /photo/);
  assert.ok((await t.act('p@t.ph', 'driverDocUpdate', { kind: 'lic', exp: future(900), file: pic })).ok);
  assert.ok((await t.act('p@t.ph', 'assignRespond', { id, act: 'accept' })).ok);
  await signBoth(t, id);
  t.S.vh.find(v => v.id == 'V3').regExp = past(2);
  assert.match((await t.act('a@t.ph', 'assignActivate', { id })).err, /registration expired/);
  /* an active driver whose vehicle registration expires cannot accept bookings */
  t.S.vh.find(v => v.id == 'V1').regExp = past(2);
  const bk = (await t.booking('c1@t.ph')).id;
  assert.match((await t.act('d1@t.ph', 'accept', { id: bk })).err, /registration are valid/);
});

test('ending: open requests are cancelled; an active assignment ends with a reason, not during a trip', async () => {
  const t = await pool();
  assert.match((await t.act('c1@t.ph', 'assignEnd', { id: 'S1', reason: 'xxxxxxxxxxxx' })).err, /not found/);
  assert.match((await t.act('d1@t.ph', 'assignEnd', { id: 'S1', reason: 'short' })).err, /10\+ characters/);
  const bk = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id: bk });
  await t.act('d1@t.ph', 'step', { id: bk, to: 'On the Way to Pickup' });
  assert.match((await t.act('o@t.ph', 'assignEnd', { id: 'S1', reason: 'Selling the vehicle next week' })).err, /trip in progress/);
  assert.ok((await t.act('o@t.ph', 'assignEnd', { id: 'S2', reason: 'Selling the vehicle next week' })).ok);
  assert.equal(t.S.asg.find(x => x.id == 'S2').st, 'Ended');
  const id = (await t.act('a@t.ph', 'adminAssignVehicle', { vehicle: 'V3', driver: 'p@t.ph' })).id;
  assert.ok((await t.act('p@t.ph', 'assignEnd', { id, reason: 'I found another vehicle' })).ok);
  assert.equal(A(t, id).st, 'Cancelled');
});

test('owners see a driver’s verification status, never their documents', async () => {
  const t = await pool();
  const v = t.d.view(t.me('o@t.ph'));
  const p = v.users.find(u => u.em == 'p@t.ph');
  assert.equal(p.licExp, future(400));
  assert.ok(!('dx' in p) && !('dxh' in p) && !JSON.stringify(v.apps || []).includes('p@t.ph'));
});
