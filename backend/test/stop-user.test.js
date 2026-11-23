'use strict';
/* Taking people out of service without stranding customers:
   suspending a driver or owner, removing a role, and documents that expire after a job was accepted. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, world, future } = require('./_setup');

const accepted = async (t, drv = 'd1@t.ph', x = {}) => {
  const id = (await t.booking('c1@t.ph', x)).id;
  assert.ok((await t.act(drv, 'accept', { id })).ok);
  return id;
};

test('suspending a driver reopens their upcoming jobs for other drivers', async () => {
  const t = await setup();
  const id = await accepted(t);
  const r = await t.act('a@t.ph', 'userStatus', { em: 'd1@t.ph', status: 'suspended', reason: 'Document check' });
  assert.ok(r.ok, r.err);
  const b = t.bk(id);
  assert.equal(b.st, 'Pending');
  assert.equal(b.drvUser, '');
  assert.equal(b.veh, '');
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /open again/.test(n.b)), 'customer is told');
});

test('a driver with a trip under way cannot be suspended until it ends', async () => {
  const t = await setup();
  const id = await accepted(t);
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  const r = await t.act('a@t.ph', 'userStatus', { em: 'd1@t.ph', status: 'suspended', reason: 'Document check' });
  assert.match(r.err, /trip in progress/);
  assert.equal(t.me('d1@t.ph').status, undefined);
});

test('removing the driver role reopens upcoming jobs instead of blocking', async () => {
  const t = await setup();
  const id = await accepted(t);
  const r = await t.act('a@t.ph', 'roleRevoke', { em: 'd1@t.ph', role: 'driver', reason: 'Expired license' });
  assert.ok(r.ok, r.err);
  assert.equal(t.bk(id).st, 'Pending');
});

test('a suspended owner’s vehicles stop taking trips, and their upcoming trips reopen', async () => {
  const t = await setup();
  const id = await accepted(t, 'd2@t.ph'); // V2 belongs to the owner
  const r = await t.act('a@t.ph', 'userStatus', { em: 'o@t.ph', status: 'suspended', reason: 'Unpaid fines' });
  assert.ok(r.ok, r.err);
  assert.equal(t.bk(id).st, 'Pending');
  assert.ok(t.S.nt.some(n => n.to == 'd2@t.ph' && /owner is no longer active/.test(n.b)), 'driver is told');
  assert.equal(t.d.h.vOper(t.d.h.vOf('V1')), false);
  assert.equal(t.d.h.fleetOf('l3').length, 0, 'no vehicle of that type is bookable');
  const again = await t.act('d2@t.ph', 'accept', { id });
  assert.match(again.err, /vehicle is approved and operational/);
  /* reactivating brings the vehicles back */
  assert.ok((await t.act('a@t.ph', 'userStatus', { em: 'o@t.ph', status: 'active', reason: 'Fines paid' })).ok);
  assert.ok((await t.act('d2@t.ph', 'accept', { id })).ok);
});

test('removing the owner role takes the vehicles out of service', async () => {
  const t = await setup();
  const r = await t.act('a@t.ph', 'roleRevoke', { em: 'o@t.ph', role: 'owner', reason: 'Franchise cancelled' });
  assert.ok(r.ok, r.err);
  assert.equal(t.d.h.vOper(t.d.h.vOf('V2')), false);
});

test('an owner with a trip under way on their vehicle, or a running rental, cannot be suspended', async () => {
  const t = await setup();
  const id = await accepted(t);
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  let r = await t.act('a@t.ph', 'userStatus', { em: 'o@t.ph', status: 'suspended', reason: 'Unpaid fines' });
  assert.match(r.err, /in progress on one of this owner/);

  const w = world();
  w.rn = [{ id: 'RN1', cu: 'c1@t.ph', veh: 'V1', owner: 'o@t.ph', s: future(), e: future(32), st: 'Active', hist: [] }];
  const t2 = await setup(w);
  r = await t2.act('a@t.ph', 'userStatus', { em: 'o@t.ph', status: 'suspended', reason: 'Unpaid fines' });
  assert.match(r.err, /approved or running rental/);
});

test('pending rental requests on a suspended owner’s vehicles are cancelled', async () => {
  const w = world();
  w.rn = [{ id: 'RN1', cu: 'c1@t.ph', veh: 'V1', owner: 'o@t.ph', s: future(), e: future(32), st: 'Pending', hist: [] }];
  const t = await setup(w);
  assert.ok((await t.act('a@t.ph', 'userStatus', { em: 'o@t.ph', status: 'suspended', reason: 'Unpaid fines' })).ok);
  assert.equal(t.S.rn[0].st, 'Cancelled');
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /rental request was cancelled/.test(n.b)));
});

test('documents that expired after the job was accepted stop the trip from starting', async () => {
  const t = await setup();
  const id = await accepted(t);
  t.me('d1@t.ph').dx = { lic: '2020-01-01', clr: '' }; // the license expired since accepting
  const r = await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  assert.match(r.err, /cannot start this trip/);
  assert.equal(t.bk(id).st, 'Accepted');
  /* the driver can still hand it back so another driver takes it */
  assert.ok((await t.act('d1@t.ph', 'handBack', { id, reason: 'License renewal' })).ok);

  const t2 = await setup();
  const id2 = await accepted(t2);
  t2.S.vh.find(v => v.id == 'V1').regExp = '2020-01-01';
  assert.match((await t2.act('d1@t.ph', 'step', { id: id2, to: 'On the Way to Pickup' })).err, /registration expired/);
});
