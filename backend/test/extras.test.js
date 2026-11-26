'use strict';
/* Bigger bookings and trip options: reservations (drop off now, pick up later, paid once), booking groups,
   delivery QR and PINs by SMS/email, rentals with a driver, barangay at signup. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';

test('reservation: one price for both trips + daily hold, the pick-up goes to the same driver, prepaid, vehicle held', async () => {
  const t = await setup();
  t.S.cfg.holdFee = 400;
  const r = await t.booking('c1@t.ph', { dt: future(20), tm: '09:00', ret: { dt: future(23), tm: '15:00', dr: 'Tetuan, Zamboanga City' } });
  assert.ok(r.ok, r.err);
  const b = t.bk(r.id),
    rb = t.bk(b.pkg.ret);
  assert.equal(b.pkg.days, 4);
  assert.equal(b.pkg.hold, 1600);
  assert.equal(b.tot, Math.round((b.pkg.fare1 + b.pkg.fare2 + 1600) * 100) / 100);
  assert.equal(rb.tot, 0);
  assert.equal(rb.pkgOf, b.id);
  assert.match((await t.act('d1@t.ph', 'accept', { id: rb.id })).err, /reserved for the driver/);
  assert.ok((await t.act('d1@t.ph', 'accept', { id: b.id })).ok);
  assert.equal(rb.drvUser, 'd1@t.ph', 'the pick-up goes to the same driver');
  /* the vehicle is held in between */
  assert.ok(t.d.h.heldOn(b.veh, future(21)));
  const other = await t.booking('c2@t.ph', { dt: future(21) });
  assert.match((await t.act('d1@t.ph', 'accept', { id: other.id })).err, /free for this schedule/);
  /* the prepaid pick-up collects nothing */
  await t.act('d1@t.ph', 'step', { id: rb.id, to: 'On the Way to Pickup' });
  await t.act('d1@t.ph', 'step', { id: rb.id, to: 'Awaiting Down Payment' });
  assert.equal(rb.st, 'Down Payment Confirmed');
  assert.match((await t.act('d1@t.ph', 'driverPay', { id: rb.id, kind: 'down', g: 0, c: 0 })).err, /already recorded|prepaid|only be recorded/);
});

test('reservation: cancelling the drop-off cancels the pick-up; the pick-up cannot be cancelled alone', async () => {
  const t = await setup();
  const r = await t.booking('c1@t.ph', { dt: future(20), ret: { dt: future(22), tm: '10:00' } });
  const b = t.bk(r.id);
  assert.match((await t.act('c1@t.ph', 'cancelBooking', { id: b.pkg.ret })).err, /part of reservation/);
  assert.ok((await t.act('c1@t.ph', 'cancelBooking', { id: b.id })).ok);
  assert.equal(t.bk(b.pkg.ret).st, 'Cancelled');
});

test('booking groups link several vehicles or drop-offs of one move', async () => {
  const t = await setup();
  const a = (await t.booking('c1@t.ph', { dt: future(25) })).id;
  const b = await t.booking('c1@t.ph', { dt: future(25), dr: 'Sta. Maria, Zamboanga City', grp: a });
  assert.ok(b.ok, b.err);
  assert.equal(t.bk(a).grp, a);
  assert.equal(t.bk(b.id).grp, a);
  assert.match((await t.booking('c2@t.ph', { grp: a })).err, /group was not found/);
});

test('delivery: the PIN is sent by SMS and email, and the driver can scan the customer’s QR code', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  const b = t.bk(id);
  await t.act('d1@t.ph', 'accept', { id });
  b.st = 'Arrived at Destination';
  const pin = (await t.act('c1@t.ph', 'dNewPin', { id })).pin;
  assert.ok(t.S.nt.some(n => n.sim == 'SMS' && n.b.includes(pin)) && t.S.nt.some(n => n.sim == 'Email' && n.b.includes(pin)));
  assert.match((await t.act('d1@t.ph', 'dDeliver', { id, input: `ZMD:BK-OTHER:${pin}`, note: 'All delivered fine' })).err, /another booking/);
  assert.ok((await t.act('d1@t.ph', 'dDeliver', { id, input: `ZMD:${id}:${pin}`, note: 'All delivered fine' })).ok);
  assert.equal(b.st, 'Delivery Confirmation');
});

test('rental with a driver: valid ID only, driver rate added, the owner names the driver, no renter return', async () => {
  const t = await setup();
  assert.ok((await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000, drv: 800 })).ok);
  const base = { veh: 'V2', s: future(20), e: future(21), pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City', ip: pic };
  const r = await t.act('c1@t.ph', 'createRental', { ...base, withDrv: true });
  assert.ok(r.ok, r.err);
  const rn = t.S.rn.find(x => x.id == r.id);
  assert.equal(rn.tot, 2 * (2000 + 800));
  assert.ok(rn.withDrv && !rn.lic);
  assert.match((await t.act('c1@t.ph', 'createRental', { ...base, s: future(30), e: future(30) })).err, /license/);
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id: r.id, act: 'approve' })).err, /Choose which of your drivers/);
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id: r.id, act: 'approve', driver: 'd2@t.ph' })).ok);
  assert.equal(rn.withDrv.em, 'd2@t.ph');
});

test('signup records the barangay and its location', async () => {
  const t = await setup();
  const base = { name: 'Nina Nuevo', dob: '1995-01-01', ph: '09171239999', ad: 'Purok 2, Putik, Zamboanga City', em: 'nina@t.ph', pw: 'Passw0rd!x', terms: true };
  assert.match((await t.d.auth.signup({ ...base, brgy: 'Nowhere' })).err, /barangay/);
  const r = await t.d.auth.signup({ ...base, brgy: 'Putik, Zamboanga City' });
  assert.ok(r.ok, r.err);
  const u = t.d.h.U('nina@t.ph');
  assert.equal(u.brgy, 'Putik, Zamboanga City');
  assert.ok(Array.isArray(u.loc));
});
