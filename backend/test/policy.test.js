'use strict';
/* Phase 1-2 rules: rental cancellation refunds, request expiry, auto-complete, refund deadlines, payment and
   no-show disputes, owner remittance pause, booking reschedule, rental date changes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const PH = Object.fromEntries(['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, 'data:image/jpeg;base64,PH' + k]));
const hrs = h => new Date(Date.now() - h * 36e5).toISOString();

async function rental(t, s = future(20), e = s) {
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000 });
  const r = await t.act('c1@t.ph', 'createRental', { veh: 'V2', s, e, pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City', lic: 'N01-23-456789', exp: future(400), ip: pic, lp: pic });
  assert.ok(r.ok, r.err);
  return r.id;
}
const rn = (t, id) => t.S.rn.find(x => x.id == id);
async function approvedPaid(t, s, e) {
  const id = await rental(t, s, e);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  await t.act('o@t.ph', 'rentalSign', { id, how: 'paper', photo: pic });
  await t.act('c1@t.ph', 'rentalPay', { id, amount: t.d.h.rentBal(rn(t, id)), method: 'Cash' });
  for (const p of t.S.pay.filter(p => p.bid == id && p.status == 'Submitted')) await t.act('o@t.ph', 'payVerify', { id: p.id, ok: true });
  return id;
}
const refunds = (t, id) => t.S.pay.filter(p => p.bid == id && p.kind == 'refund');

test('cancelling a paid rental early refunds everything; the owner sends it and the renter confirms', async () => {
  const t = await setup();
  const id = await approvedPaid(t);
  const paid = t.d.h.paySum(id);
  const r = await t.act('c1@t.ph', 'rentalCancel', { id });
  assert.ok(r.ok, r.err);
  assert.equal(r.fee, 0);
  assert.equal(rn(t, id).st, 'Cancelled');
  const [x] = refunds(t, id);
  assert.equal(x.amount, paid);
  assert.equal(x.from, 'o@t.ph');
  assert.ok((await t.act('o@t.ph', 'rentalRefund', { id: x.id, method: 'Cash' })).ok);
  assert.ok((await t.act('c1@t.ph', 'rentalRefundAck', { id: x.id, ok: true })).ok);
  assert.equal(t.d.h.ownerBal('o@t.ph').due, 0, 'nothing owed either way after a free cancellation');
});

test('cancelling within 48 hours of pickup: the owner keeps one day and refunds the rest', async () => {
  const t = await setup();
  const id = await approvedPaid(t, future(1), future(2));
  const paid = t.d.h.paySum(id);
  const r = await t.act('c1@t.ph', 'rentalCancel', { id });
  assert.ok(r.ok, r.err);
  assert.equal(r.fee, 2000);
  assert.equal(refunds(t, id)[0].amount, paid - 2000);
  assert.ok(rn(t, id).split && rn(t, id).split.cxl);
  /* after the refund the owner holds the fee; ZamMove's commission on it is owed */
  await t.act('o@t.ph', 'rentalRefund', { id: refunds(t, id)[0].id, method: 'Cash' });
  assert.equal(t.d.h.ownerBal('o@t.ph').due, -rn(t, id).split.zc);
});

test('a request the owner does not answer in 24 hours expires and frees the dates', async () => {
  const t = await setup();
  const id = await rental(t);
  t.d.h.sweep();
  assert.equal(rn(t, id).st, 'Pending');
  rn(t, id).cr = hrs(25);
  t.d.h.sweep();
  assert.equal(rn(t, id).st, 'Cancelled');
  assert.equal(rn(t, id).expired, 'owner');
  assert.equal(t.d.h.rentClash('V2', rn(t, id).s, rn(t, id).e), '', 'the dates are free again');
});

test('an approved rental not fully paid 12 hours before pickup is cancelled with a full refund', async () => {
  const t = await setup();
  const id = await rental(t, future(1), future(1));
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  await t.act('c1@t.ph', 'rentalPay', { id, amount: 1000, method: 'Cash' });
  await t.act('o@t.ph', 'payVerify', { id: t.S.pay.find(p => p.bid == id).id, ok: true });
  /* pickup is tomorrow 8 AM; pretend it is 11 hours away */
  rn(t, id).s = rn(t, id).e = new Date(Date.now() + 8 * 36e5 + 11 * 36e5).toISOString().slice(0, 10);
  const pickup = new Date(rn(t, id).s + 'T08:00:00+08:00').getTime();
  if (pickup - Date.now() > 12 * 36e5) rn(t, id).s = rn(t, id).e = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
  t.d.h.sweep();
  assert.equal(rn(t, id).st, 'Cancelled');
  assert.equal(rn(t, id).expired, 'unpaid');
  assert.equal(refunds(t, id)[0].amount, 1000, 'no fee: the full partial payment comes back');
});

test('confirming a payment after cancellation refunds it', async () => {
  const t = await setup();
  const id = await rental(t);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  await t.act('c1@t.ph', 'rentalPay', { id, amount: 1500, method: 'Cash' });
  await t.act('c1@t.ph', 'rentalCancel', { id });
  assert.equal(refunds(t, id).length, 0);
  assert.ok((await t.act('o@t.ph', 'payVerify', { id: t.S.pay.find(p => p.bid == id && p.kind != 'refund').id, ok: true })).ok);
  assert.equal(refunds(t, id)[0].amount, 1500);
});

test('the rental completes by itself after the claim window, and refund deadlines remind then alert', async () => {
  const t = await setup();
  const id = await approvedPaid(t);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH });
  await t.act('c1@t.ph', 'rentalReturn', { id, odo: 1100, fuel: 'Full', ph: PH });
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', match: true });
  t.d.h.sweep();
  assert.equal(rn(t, id).st, 'Returned');
  rn(t, id).back.t = hrs(24 * 3 + 1);
  t.d.h.sweep();
  assert.equal(rn(t, id).st, 'Completed');
  const x = t.S.pay.find(p => p.bid == id && p.kind == 'deposit_refund');
  x.t = hrs(25);
  t.d.h.sweep();
  assert.ok(x.rem1 && !x.alert, 'reminder after 24 hours');
  x.t = hrs(49);
  t.d.h.sweep();
  assert.ok(x.alert, 'ZamMove alerted after 48 hours');
  assert.ok(t.S.nt.some(n => n.h == 'Refund overdue'));
});

test('a refund the renter says never arrived is decided by staff', async () => {
  const t = await setup();
  const id = await approvedPaid(t);
  await t.act('c1@t.ph', 'rentalCancel', { id });
  const [x] = refunds(t, id);
  await t.act('o@t.ph', 'rentalRefund', { id: x.id, method: 'Cash' });
  await t.act('c1@t.ph', 'rentalRefundAck', { id: x.id, ok: false, note: 'Nothing was handed to me' });
  assert.match((await t.act('k@t.ph', 'moneyDecide', { id: x.id, ok: false, note: '' })).err, /reason/);
  assert.ok((await t.act('k@t.ph', 'moneyDecide', { id: x.id, ok: false, note: 'Owner has no proof of the cash hand-over' })).ok);
  assert.equal(x.status, 'Due', 'the owner has to send it again');
});

test('the renter can contest a payment the owner marked as not received', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'ownerGcash', { no: '09171234567', name: 'Oscar Owner' });
  const id = await rental(t);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  await t.act('c1@t.ph', 'rentalPay', { id, amount: 1000, method: 'GCash', ref: '1231231231' });
  const x = t.S.pay.find(p => p.bid == id);
  await t.act('o@t.ph', 'payVerify', { id: x.id, ok: false, note: 'Nothing arrived in my GCash' });
  assert.match((await t.act('c1@t.ph', 'rentalPayDispute', { id: x.id, note: 'short' })).err, /at least 10/);
  assert.ok((await t.act('c1@t.ph', 'rentalPayDispute', { id: x.id, note: 'Sent at 3 PM, GCash receipt attached', pf: pic })).ok);
  assert.equal(x.status, 'Disputed');
  assert.match((await t.act('o@t.ph', 'moneyDecide', { id: x.id, ok: true, note: 'it came' })).err, /Only a cashier/);
  assert.ok((await t.act('k@t.ph', 'moneyDecide', { id: x.id, ok: true, note: 'The GCash receipt matches the owner number' })).ok);
  assert.equal(x.status, 'Verified');
  assert.equal(x.coll, 'o@t.ph');
});

test('an owner who owes ZamMove for 14 days has listings paused until they remit', async () => {
  const t = await setup();
  const id = await approvedPaid(t, future(1), future(2));
  await t.act('c1@t.ph', 'rentalCancel', { id }); // late: the owner keeps one day, owes the commission
  await t.act('o@t.ph', 'rentalRefund', { id: refunds(t, id)[0].id, method: 'Cash' });
  t.d.h.sweep();
  const u = t.d.h.U('o@t.ph');
  assert.ok(u.owesSince && !u.rentPaused);
  u.owesSince = hrs(24 * 15);
  t.d.h.sweep();
  assert.ok(u.rentPaused);
  assert.equal(t.d.h.rentable(t.d.h.vOf('V2')), false, 'hidden from renters');
  const owes = -t.d.h.ownerBal('o@t.ph').due;
  await t.act('o@t.ph', 'ownerRemitSend', { amount: owes, method: 'Cash' });
  await t.act('k@t.ph', 'payVerify', { id: t.S.pay.find(p => p.kind == 'owner_remit').id, ok: true });
  t.d.h.sweep();
  assert.ok(!u.rentPaused && !u.owesSince);
  assert.equal(t.d.h.rentable(t.d.h.vOf('V2')), true);
});

test('no-show: after 15 minutes the driver closes the booking with the 10% fee; the customer can dispute it', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  await t.act('d1@t.ph', 'step', { id, to: 'Awaiting Down Payment' });
  assert.match((await t.act('d1@t.ph', 'noShow', { id })).err, /Wait the full 15 minutes/);
  t.bk(id).ev.at(-1).t = hrs(0.3);
  const r = await t.act('d1@t.ph', 'noShow', { id });
  assert.ok(r.ok, r.err);
  assert.equal(t.bk(id).st, 'Cancelled');
  const fee = t.S.pay.find(p => p.bid == id && p.kind == 'cancel_fee');
  assert.deepEqual([fee.amount, fee.to, fee.status], [Math.round(t.bk(id).tot * 10) / 100, 'd1@t.ph', 'Due']);
  assert.match((await t.booking('c1@t.ph', { dt: future(41) })).err, /Settle the/);
  assert.ok((await t.act('c1@t.ph', 'noShowDispute', { id, note: 'The driver went to the wrong barangay' })).ok);
  assert.ok((await t.booking('c1@t.ph', { dt: future(41) })).ok, 'a disputed fee does not block booking');
  assert.ok((await t.act('k@t.ph', 'moneyDecide', { id: fee.id, ok: false, note: 'GPS shows the driver at the wrong address' })).ok);
  assert.equal(fee.status, 'Waived');
});

test('reschedule: free before the driver sets off; the driver keeps the job if free, otherwise it reopens', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  assert.match((await t.act('c1@t.ph', 'reschedule', { id, dt: '2000-01-01', tm: '10:00' })).err, /at least 30 minutes/);
  const d2 = future(33);
  assert.ok((await t.act('c1@t.ph', 'reschedule', { id, dt: d2, tm: '10:00' })).ok);
  assert.equal(t.bk(id).dt, d2);
  await t.act('d1@t.ph', 'accept', { id });
  const d3 = future(34);
  const r = await t.act('c1@t.ph', 'reschedule', { id, dt: d3, tm: '11:00' });
  assert.ok(r.ok, r.err);
  assert.equal(r.kept, true);
  assert.equal(t.bk(id).drvUser, 'd1@t.ph');
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  assert.match((await t.act('c1@t.ph', 'reschedule', { id, dt: future(35), tm: '11:00' })).err, /before the driver heads/);
});

test('rental dates: pending changes apply at once; approved needs the owner; active can be extended', async () => {
  const t = await setup();
  const id = await rental(t, future(20), future(21));
  assert.ok((await t.act('c1@t.ph', 'rentalChange', { id, s: future(22), e: future(23) })).ok);
  assert.equal(rn(t, id).s, future(22));
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  assert.match((await t.act('c1@t.ph', 'rentalChange', { id, s: future(22), e: future(22), why: 'shorter' })).err, /not shorten/);
  assert.ok((await t.act('c1@t.ph', 'rentalChange', { id, s: future(24), e: future(25), why: 'Flight moved' })).ok);
  assert.equal(rn(t, id).s, future(22), 'not applied until the owner accepts');
  assert.ok((await t.act('o@t.ph', 'rentalChangeAnswer', { id, ok: true })).ok);
  assert.equal(rn(t, id).s, future(24));
  assert.equal(rn(t, id).ct.amend.length, 1, 'added to the contract');
  /* pay, release, then extend */
  await t.act('o@t.ph', 'rentalSign', { id, how: 'paper', photo: pic });
  await t.act('c1@t.ph', 'rentalPay', { id, amount: t.d.h.rentBal(rn(t, id)), method: 'Cash' });
  for (const p of t.S.pay.filter(p => p.bid == id && p.status == 'Submitted')) await t.act('o@t.ph', 'payVerify', { id: p.id, ok: true });
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH })).ok);
  assert.ok((await t.act('c1@t.ph', 'rentalChange', { id, e: future(26), why: 'Need one more day' })).ok);
  assert.match((await t.act('o@t.ph', 'rentalChangeAnswer', { id, ok: false })).err, /why/);
  assert.ok((await t.act('o@t.ph', 'rentalChangeAnswer', { id, ok: true })).ok);
  assert.equal(rn(t, id).e, future(26));
  assert.equal(rn(t, id).tot, 3 * 2000);
  assert.equal(t.d.h.rentBal(rn(t, id)), 2000, 'the extra day is due');
});
