'use strict';
/* Returning a rental: the renter submits photos and readings, the owner checks the vehicle and marks it returned. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const PH = Object.fromEntries(
  ['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, 'data:image/jpeg;base64,PH' + k])
);

/* a rental of V2 by C1, released at 1000 km */
async function active() {
  const t = await setup();
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000 });
  const id = (
    await t.act('c1@t.ph', 'createRental', {
      veh: 'V2', s: future(20), e: future(21), pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City',
      lic: 'N01-23-456789', exp: future(400), ip: pic, lp: pic,
    })
  ).id;
  const rn = () => t.S.rn.find(x => x.id == id);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  await t.act('o@t.ph', 'rentalSign', { id, how: 'paper', photo: pic });
  await t.act('c1@t.ph', 'rentalPay', { id, amount: t.d.h.rentBal(rn()), method: 'Cash' });
  for (const p of t.S.pay.filter(p => p.bid == id && p.status == 'Submitted')) await t.act('k@t.ph', 'payVerify', { id: p.id, ok: true });
  const rel = await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH });
  assert.ok(rel.ok, rel.err);
  return { t, id, rn };
}
const ret = (t, id, x = {}) => t.act('c1@t.ph', 'rentalReturn', { id, odo: 1150, fuel: '3/4', ph: PH, note: 'Clean', ...x });

test('the renter returns with photos; the owner confirms it matches and marks it returned', async () => {
  const { t, id, rn } = await active();
  assert.match((await ret(t, id, { ph: { ...PH, fuel: '' } })).err, /return photos/);
  assert.match((await ret(t, id, { odo: 900 })).err, /cannot be lower/);
  assert.match((await t.act('c2@t.ph', 'rentalReturn', { id, odo: 1150, fuel: '3/4', ph: PH })).err, /not found/);
  assert.ok((await ret(t, id)).ok);
  assert.equal(rn().st, 'Active', 'still on rent until the owner checks it');
  assert.equal(rn().rq.odo, 1150);
  assert.ok(t.S.nt.some(n => n.to == 'o@t.ph' && /Vehicle returned by the renter/.test(n.h)), 'the owner is notified');
  assert.match((await ret(t, id)).err, /already submitted/);
  assert.match((await t.act('c1@t.ph', 'rentalPing', { id, lat: 6.9, lng: 122.07 })).err, /location sharing has stopped/);
  const r = await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', match: true });
  assert.ok(r.ok, r.err);
  assert.equal(rn().st, 'Returned');
  assert.equal(rn().back.odo, 1150);
  assert.equal(rn().back.by, 'renter');
  assert.ok(rn().back.cu.ok, 'the renter does not need to confirm their own record');
});

test('the owner finds a difference: records their own readings and the renter checks them', async () => {
  const { t, id, rn } = await active();
  await ret(t, id);
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', odo: 1150, fuel: '1/4', ph: PH })).err, /Describe what is different/);
  const r = await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', odo: 1150, fuel: '1/4', ph: PH, note: 'Fuel is 1/4, not 3/4' });
  assert.ok(r.ok, r.err);
  assert.equal(rn().st, 'Returned');
  assert.equal(rn().back.fuel, '1/4');
  assert.ok(rn().back.diff && !rn().back.cu, 'the renter must confirm or dispute the owner record');
  assert.equal(rn().rq.fuel, '3/4', 'the renter submission is kept as evidence');
});

test('the owner can ask for new photos; the renter submits again', async () => {
  const { t, id, rn } = await active();
  await ret(t, id);
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'retake', note: '' })).err, /what to retake/);
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'retake', note: 'The odometer photo is blurry' })).ok);
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', match: true })).err, /Enter the odometer/);
  assert.ok((await ret(t, id, { odo: 1152 })).ok);
  assert.equal(rn().rq.prev.length, 1);
  assert.ok(!rn().rq.redo);
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', match: true })).ok);
  assert.equal(rn().back.odo, 1152);
});

test('if the renter never submits, the owner can still record the return', async () => {
  const { t, id, rn } = await active();
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', odo: 1180, fuel: 'Full', ph: PH })).ok);
  assert.equal(rn().st, 'Returned');
  assert.ok(!rn().back.cu);
});

test('the return records the phone location and flags a far-away return or old photo files', async () => {
  const { t, id, rn } = await active();
  const old = Date.now() - 3 * 864e5;
  /* Putik is the agreed return point; Tetuan is a few km away */
  assert.ok((await ret(t, id, { loc: { lat: 6.9419, lng: 122.0790, acc: 20 }, pt: { front: old, back: Date.now() } })).ok);
  const q = rn().rq;
  assert.ok(q.loc && q.loc.acc == 20);
  assert.ok(q.flags.some(f => /1.9 km from the agreed return point/.test(f)), q.flags.join('; '));
  assert.ok(q.flags.some(f => /Older photo files: Front/.test(f)), q.flags.join('; '));
  assert.ok(!q.flags.some(f => /Back/.test(f)));
  assert.ok(t.S.nt.some(n => n.to == 'o@t.ph' && /Older photo files/.test(n.b)), 'the owner sees the flags');
});

test('no phone location is flagged, not blocked', async () => {
  const { t, id, rn } = await active();
  assert.ok((await ret(t, id, { locErr: 'permission denied' })).ok);
  assert.ok(rn().rq.flags.some(f => /No phone location \(permission denied\)/.test(f)));
});

test('the owner does not check within 24 hours: the return is accepted as submitted', async () => {
  const { t, id, rn } = await active();
  await ret(t, id);
  t.d.h.sweep();
  assert.equal(rn().st, 'Active', 'not yet');
  rn().rq.t = new Date(Date.now() - 25 * 36e5).toISOString();
  t.d.h.sweep();
  assert.equal(rn().st, 'Returned');
  assert.ok(rn().back.auto && rn().back.cu.ok);
  assert.match(rn().cond, /accepted automatically/);
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /accepted as you submitted/.test(n.b)));
});

const rented = async t => {
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000 });
  const id = (await t.act('c1@t.ph', 'createRental', { veh: 'V2', s: future(20), e: future(20), pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City', lic: 'N01-23-456789', exp: future(400), ip: pic, lp: pic })).id;
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  await t.act('o@t.ph', 'rentalSign', { id, how: 'paper', photo: pic });
  return id;
};
const finish = async (t, id) => {
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH })).ok);
  await ret(t, id);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', match: true });
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'complete' })).ok);
};

test('money goes to the owner: owner confirms GCash and cash, refunds the deposit, remits the commission weekly', async () => {
  const t = await setup();
  assert.ok((await t.act('o@t.ph', 'ownerGcash', { no: '09171234567', name: 'Oscar Owner' })).ok);
  const id = await rented(t);
  const rn = () => t.S.rn.find(x => x.id == id);
  const dep = t.d.h.depOf(rn());
  /* deposit by GCash to the owner, rental fee in cash */
  assert.ok((await t.act('c1@t.ph', 'rentalPay', { id, amount: dep, method: 'GCash', ref: '7777777777' })).ok);
  assert.ok((await t.act('c1@t.ph', 'rentalPay', { id, amount: 2000, method: 'Cash' })).ok);
  assert.ok(t.S.nt.some(n => n.to == 'o@t.ph' && n.h == 'Payment to confirm'));
  for (const p of t.S.pay.filter(p => p.bid == id)) assert.ok((await t.act('o@t.ph', 'payVerify', { id: p.id, ok: true })).ok);
  assert.ok(t.S.pay.filter(p => p.bid == id).every(p => p.coll == 'o@t.ph'));
  assert.equal(t.d.h.ownerBal('o@t.ph').heldOpen, dep + 2000);
  await finish(t, id);
  assert.equal(rn().settle.by, 'owner');
  const rf = t.S.pay.find(p => p.bid == id && p.kind == 'deposit_refund');
  assert.equal(rf.from, 'o@t.ph');
  assert.equal(rf.amount, dep);
  /* the owner refunds the deposit directly; the cashier cannot */
  assert.match((await t.act('k@t.ph', 'refundPaid', { id: rf.id, method: 'Cash' })).err, /owner holds this deposit/);
  assert.equal(t.d.h.ownerBal('o@t.ph').due, Math.round((rn().split.own - 2000 - dep) * 100) / 100, 'until refunded, the deposit counts as held by the owner');
  assert.match((await t.act('o@t.ph', 'rentalRefund', { id: rf.id, method: 'GCash', ref: '12' })).err, /reference/);
  assert.ok((await t.act('o@t.ph', 'rentalRefund', { id: rf.id, method: 'GCash', ref: '8888888888' })).ok);
  assert.equal(rf.status, 'Sent');
  assert.ok((await t.act('c1@t.ph', 'rentalRefundAck', { id: rf.id, ok: true })).ok);
  assert.equal(rf.status, 'Paid');
  /* what is left: ZamMove's commission */
  const b = t.d.h.ownerBal('o@t.ph');
  assert.equal(b.due, -rn().split.zc, 'the owner owes exactly the commission');
  /* weekly reminder */
  t.d.h.sweep();
  assert.ok(t.S.nt.some(n => n.to == 'o@t.ph' && n.h == 'Weekly remittance'));
  /* the owner remits, the cashier verifies */
  assert.match((await t.act('o@t.ph', 'ownerRemitSend', { amount: 99999, method: 'Cash' })).err, /more than you owe/);
  assert.ok((await t.act('o@t.ph', 'ownerRemitSend', { amount: -b.due, method: 'GCash', ref: '9999999999' })).ok);
  assert.match((await t.act('o@t.ph', 'ownerRemitSend', { amount: 1, method: 'Cash' })).err, /do not owe/);
  const rm = t.S.pay.find(p => p.kind == 'owner_remit');
  assert.ok((await t.act('k@t.ph', 'payVerify', { id: rm.id, ok: true })).ok);
  assert.equal(t.d.h.ownerBal('o@t.ph').due, 0);
});

test('a renter can say the deposit refund did not arrive; the staff are told', async () => {
  const t = await setup();
  const id = await rented(t);
  const rn = () => t.S.rn.find(x => x.id == id);
  await t.act('c1@t.ph', 'rentalPay', { id, amount: t.d.h.rentBal(rn()), method: 'Cash' });
  for (const p of t.S.pay.filter(p => p.bid == id)) await t.act('o@t.ph', 'payVerify', { id: p.id, ok: true });
  await finish(t, id);
  const rf = t.S.pay.find(p => p.bid == id && p.kind == 'deposit_refund');
  assert.ok((await t.act('o@t.ph', 'rentalRefund', { id: rf.id, method: 'Cash' })).ok);
  assert.match((await t.act('c1@t.ph', 'rentalRefundAck', { id: rf.id, ok: false })).err, /what is wrong/);
  assert.ok((await t.act('c1@t.ph', 'rentalRefundAck', { id: rf.id, ok: false, note: 'Nothing was handed to me' })).ok);
  assert.equal(rf.status, 'Disputed');
  assert.ok(t.S.nt.some(n => n.h == 'Deposit refund disputed'));
});
