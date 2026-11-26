'use strict';
/* Owner-drivers: drivers can register their own vehicles (and become owners when one is approved),
   owners who are also drivers can drive their own vehicles at once, and admins can put an owner on their own vehicle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, world, driver, user, van, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const car = x => ({
  kg: 400,
  type: 'l3',
  brand: 'Mitsubishi',
  model: 'L300',
  plate: 'ZDR 1001',
  color: 'White',
  year: 2021,
  regExp: future(400),
  doc: pic,
  ins: 'CTPL-778899', insDoc: pic, cpcDoc: pic, insExp: future(300), cpc: 'CPC-2024-0001', cpcExp: future(500),
  seats: 3,
  trans: 'Manual',
  fuel: 'Diesel',
  ...x,
});

/* standard world + Rico (approved driver AND owner, valid documents) with an unassigned van R1,
   and Pia (approved driver only, no vehicle) */
async function od() {
  const w = world();
  w.users.push({
    ...user('Rico Both', 'r@t.ph', {
      roles: [
        { t: 'driver', st: 'approved' },
        { t: 'owner', st: 'approved' },
      ],
    }),
    dx: { lic: future(400), clr: future(200) },
  });
  w.users.push({ ...driver('Pia Pool', 'p@t.ph'), dx: { lic: future(400), clr: future(200) } });
  w.vh.push(van('R1', 'r@t.ph', 'RRR 1111'));
  return setup(w);
}
const A = (t, em) => t.S.asg.find(a => a.driver == em && a.st == 'Active');

test('a driver can register a vehicle and becomes its owner (and its driver) when an admin approves it', async () => {
  const t = await od();
  assert.match((await t.act('c1@t.ph', 'addVehicle', car())).err, /approved vehicle owners and drivers/);
  const r = await t.act('p@t.ph', 'addVehicle', car({ self: true }));
  assert.ok(r.ok && r.ownerOnApproval, r.err);
  const v = t.S.vh.find(x => x.id == r.id);
  assert.equal(v.owner, 'p@t.ph');
  assert.equal(v.approval, 'Pending Approval');
  assert.ok(t.S.nt.some(n => n.to == 'a@t.ph' && /ZDR 1001/.test(JSON.stringify(n))), 'admins are told to verify it');
  assert.ok(!t.d.view(t.me('p@t.ph')).asg.some(a => a.vehicle == v.id), 'not driving it before approval');

  assert.ok((await t.act('a@t.ph', 'vehicleDecision', { id: v.id, act: 'approve' })).ok);
  const roles = t.me('p@t.ph').roles.map(x => x.t + ':' + x.st).sort();
  assert.deepEqual(roles, ['driver:approved', 'owner:approved'], 'the driver is now also an owner');
  const a = A(t, 'p@t.ph');
  assert.ok(a && a.vehicle == v.id && a.mode == 'Owner-driver' && a.self, 'and drives the vehicle at once');
  assert.ok(t.S.nt.some(n => n.to == 'p@t.ph' && /now also a vehicle owner/.test(JSON.stringify(n))));
});

test('a driver who registers a vehicle without "drive it myself" only becomes its owner', async () => {
  const t = await od();
  const r = await t.act('p@t.ph', 'addVehicle', car({ plate: 'ZDR 2002' }));
  assert.ok((await t.act('a@t.ph', 'vehicleDecision', { id: r.id, act: 'approve' })).ok);
  assert.ok(t.me('p@t.ph').roles.some(x => x.t == 'owner' && x.st == 'approved'));
  assert.ok(!A(t, 'p@t.ph'));
  /* later they choose to drive it themselves */
  assert.ok((await t.act('p@t.ph', 'selfAssign', { vehicle: r.id })).ok);
  assert.equal(A(t, 'p@t.ph').vehicle, r.id);
});

test('an owner who is also a driver drives their own vehicle at once; the rules still apply', async () => {
  const t = await od();
  assert.match((await t.act('o@t.ph', 'selfAssign', { vehicle: 'V1' })).err, /driver role/, 'owner without a driver role');
  assert.match((await t.act('p@t.ph', 'selfAssign', { vehicle: 'R1' })).err, /approved vehicle owner/);
  assert.match((await t.act('r@t.ph', 'selfAssign', { vehicle: 'V1' })).err, /not found/, 'not their vehicle');

  t.me('r@t.ph').dx.lic = future(-2);
  assert.match((await t.act('r@t.ph', 'selfAssign', { vehicle: 'R1' })).err, /license expired/);
  t.me('r@t.ph').dx.lic = future(400);

  const r = await t.act('r@t.ph', 'selfAssign', { vehicle: 'R1' });
  assert.ok(r.ok, r.err);
  const a = A(t, 'r@t.ph');
  assert.ok(a.self && a.mode == 'Owner-driver' && !a.ag, 'active with no agreement to sign with themselves');
  assert.match((await t.act('r@t.ph', 'selfAssign', { vehicle: 'R1' })).err, /already drive/);
  /* the old way (assign yourself by email) gives the same result */
  const t2 = await od();
  assert.ok((await t2.act('r@t.ph', 'reqAssign', { vehicle: 'R1', driver: 'r@t.ph', mode: 'assign' })).self);
  assert.ok(A(t2, 'r@t.ph'));
});

test('an owner cannot take a vehicle that another driver is driving; ending that first works', async () => {
  const t = await od();
  t.S.asg.push({ id: 'SX', vehicle: 'R1', driver: 'p@t.ph', st: 'Active', hist: [] });
  assert.match((await t.act('r@t.ph', 'selfAssign', { vehicle: 'R1' })).err, /Pia Pool drives this vehicle/);
  assert.ok((await t.act('r@t.ph', 'assignEnd', { id: 'SX', reason: 'I will drive it myself now.' })).ok);
  assert.ok((await t.act('r@t.ph', 'selfAssign', { vehicle: 'R1' })).ok);
});

test('an admin can put an owner-driver on their own vehicle directly, or assign a pool driver', async () => {
  const t = await od();
  const r = await t.act('a@t.ph', 'adminAssignVehicle', { vehicle: 'R1', driver: 'r@t.ph' });
  assert.ok(r.ok && r.self, r.err);
  assert.equal(A(t, 'r@t.ph').vehicle, 'R1');
  assert.ok(t.S.nt.some(n => n.to == 'r@t.ph' && /your own/.test(JSON.stringify(n))));
  /* someone else's vehicle still goes through the offer and agreement */
  const t2 = await od();
  const r2 = await t2.act('a@t.ph', 'adminAssignVehicle', { vehicle: 'R1', driver: 'p@t.ph' });
  assert.ok(r2.ok && !r2.self);
  assert.equal(t2.S.asg.find(a => a.id == r2.id).st, 'Awaiting Driver');
});
