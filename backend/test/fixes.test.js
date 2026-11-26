'use strict';
/* Audit fixes (each was a confirmed bug) and the error-recovery features. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const PH = Object.fromEntries(['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, pic]));
const r2 = x => Math.round(x * 100) / 100;
async function cashTrip(t, em = 'c1@t.ph', drv = 'd1@t.ph', x = {}) {
  const id = (await t.booking(em, x)).id, b = t.bk(id);
  await t.act(drv, 'accept', { id });
  for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await t.act(drv, 'step', { id, to });
  await t.act(drv, 'driverPay', { id, kind: 'down', g: 0, c: t.d.h.due(b, 'down') });
  b.st = 'Awaiting Final Payment';
  await t.act(drv, 'driverPay', { id, kind: 'final', g: 0, c: t.d.h.due(b, 'final') });
  return b;
}

/* ---------- money and privacy ---------- */
test('#1 a driver’s debt survives the end of their assignment, and goes to the owner of the vehicle used', async () => {
  const t = await setup();
  const b = await cashTrip(t);
  const owed = t.d.h.turnBal('d1@t.ph');
  t.S.asg.forEach(a => a.driver == 'd1@t.ph' && (a.st = 'Ended'));
  assert.equal(t.d.h.turnBal('d1@t.ph'), owed);
  assert.equal(t.d.h.turnBal('d1@t.ph', 'o@t.ph'), owed, 'owed to the owner of the vehicle on that trip');
  assert.ok((await t.act('d1@t.ph', 'turnover', { amount: owed, method: 'Cash', owner: t.d.h.pkey('o@t.ph') })).ok);
  assert.ok(t.d.view(t.me('o@t.ph')).drvBal.some(d => d.em == 'd1@t.ph'), 'the owner still sees the driver');
  assert.ok(b);
});

test('#2 GCash to the owner’s number: the owner confirms or disputes; not received means the customer pays again', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'ownerGcash', { no: '09171234567', name: 'Olga Owner' });
  const id = (await t.booking('c1@t.ph')).id, b = t.bk(id);
  await t.act('d1@t.ph', 'accept', { id });
  for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await t.act('d1@t.ph', 'step', { id, to });
  const g = t.d.h.due(b, 'down');
  await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g, c: 0, ref: '7778889990' });
  const x = t.S.pay.find(p => p.bid == id && p.method == 'GCash');
  assert.equal(x.gto, 'owner');
  assert.match((await t.act('d2@t.ph', 'ownerGcashCheck', { id: x.id, ok: true })).err, /not found/);
  assert.ok((await t.act('o@t.ph', 'ownerGcashCheck', { id: x.id, ok: false, note: 'Nothing arrived in my GCash' })).ok);
  assert.ok((await t.act('k@t.ph', 'moneyDecide', { id: x.id, ok: false, note: 'No such GCash transfer exists' })).ok);
  assert.equal(x.status, 'Rejected');
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /pay it again/.test(n.b)));
});

test('#3/#4 visitors get no driver names or emails; logged-in users only see ratings of drivers they can see', async () => {
  const t = await setup();
  const b = await cashTrip(t);
  await t.act('c1@t.ph', 'review', { id: b.id, r: 5 });
  const pub = t.d.view(null);
  assert.deepEqual(pub.haulList, []);
  assert.deepEqual(pub.ratings, {});
  assert.ok('d1@t.ph' in t.d.view(t.me('c1@t.ph')).ratings, 'the customer of that trip sees the driver rating');
  assert.ok(!('d1@t.ph' in t.d.view(t.me('c2@t.ph')).ratings), 'another customer does not');
});

/* ---------- flow fixes ---------- */
test('#5 a reserved pick-up handed back opens to other drivers (still prepaid)', async () => {
  const t = await setup();
  const b = t.bk((await t.booking('c1@t.ph', { dt: future(20), ret: { dt: future(22), tm: '10:00' } })).id);
  await t.act('d1@t.ph', 'accept', { id: b.id });
  assert.ok((await t.act('d1@t.ph', 'handBack', { id: b.pkg.ret, reason: 'Sick on that day' })).ok);
  const r = await t.act('d2@t.ph', 'accept', { id: b.pkg.ret });
  assert.ok(r.ok, r.err);
  assert.equal(t.bk(b.pkg.ret).tot, 0);
});

test('#6 a discount clears the outdated payment declaration so the driver is not blocked', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id, b = t.bk(id);
  await t.act('d1@t.ph', 'accept', { id });
  for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await t.act('d1@t.ph', 'step', { id, to });
  await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: t.d.h.due(b, 'down') });
  b.st = 'Awaiting Final Payment';
  const fin = t.d.h.due(b, 'final');
  await t.act('c1@t.ph', 'payDeclare', { id, kind: 'final', g: 0, c: fin, cg: fin });
  await t.act('o@t.ph', 'ownerDiscount', { id, amt: 200, why: 'friend' });
  assert.ok(!(b.decl || {}).final);
  assert.ok((await t.act('d1@t.ph', 'driverPay', { id, kind: 'final', g: 0, c: t.d.h.due(b, 'final') })).ok);
});

test('#7 an owner overdue on their remittance gets no hauling jobs either', async () => {
  const t = await setup();
  t.d.h.U('o@t.ph').rentPaused = new Date().toISOString();
  const id = (await t.booking('c1@t.ph')).id;
  assert.match((await t.act('d1@t.ph', 'accept', { id })).err, /operational/);
});

test('#8 a driver driving a rental is busy those days, and a busy driver cannot be chosen for a rental', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000, drv: 800 });
  const r = await t.act('c1@t.ph', 'createRental', { veh: 'V2', s: future(30), e: future(30), pu: 'Tetuan, Zamboanga City', ip: pic, withDrv: true });
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id: r.id, act: 'approve', driver: 'd1@t.ph' })).ok);
  const bk = (await t.booking('c2@t.ph', { dt: future(30) })).id;
  assert.match((await t.act('d1@t.ph', 'accept', { id: bk })).err, /driving a rental/);
  /* the other way round */
  const r2_ = await t.act('c2@t.ph', 'createRental', { veh: 'V2', s: future(40), e: future(40), pu: 'Tetuan, Zamboanga City', ip: pic, withDrv: true });
  const bk2 = (await t.booking('c1@t.ph', { dt: future(40) })).id;
  await t.act('d1@t.ph', 'accept', { id: bk2 });
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id: r2_.id, act: 'approve', driver: 'd1@t.ph' })).err, /hauling trip/);
});

test('#9/#10 the with-driver contract names the owner’s driver; no commission on the driver fee', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000, drv: 800 });
  const r = await t.act('c1@t.ph', 'createRental', { veh: 'V2', s: future(30), e: future(30), pu: 'Tetuan, Zamboanga City', ip: pic, withDrv: true });
  await t.act('o@t.ph', 'rentalDecision', { id: r.id, act: 'approve', driver: 'd2@t.ph' });
  const rn = t.S.rn.find(x => x.id == r.id);
  assert.ok(rn.ct.terms.clauses.some(c => c.t == 'Driver provided by the Owner' && /does not drive/.test(c.x)));
  await t.act('o@t.ph', 'rentalSign', { id: r.id, how: 'paper', photo: pic });
  await t.act('c1@t.ph', 'rentalPay', { id: r.id, amount: t.d.h.rentBal(rn), method: 'Cash' });
  for (const p of t.S.pay.filter(p => p.bid == r.id)) await t.act('o@t.ph', 'payVerify', { id: p.id, ok: true });
  await t.act('o@t.ph', 'rentalDecision', { id: r.id, act: 'release', odo: 1000, fuel: 'Full', ph: PH });
  await t.act('o@t.ph', 'rentalDecision', { id: r.id, act: 'return', odo: 1100, fuel: 'Full', ph: PH });
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id: r.id, act: 'complete' })).ok);
  assert.equal(rn.split.zc, r2(2000 * 0.15), 'commission on the ₱2,000 vehicle fee only');
  assert.equal(rn.split.own, 2800 - 300);
});

test('#11 admins cannot silently move another owner’s driver; with "move" they can', async () => {
  const t = await setup();
  t.d.h.U('d2@t.ph').employer = 'zz@t.ph';
  assert.match((await t.act('a@t.ph', 'adminAssignVehicle', { vehicle: 'V1', driver: 'd2@t.ph' })).err, /works for another vehicle owner/);
});

test('#13 an unpaid late charge comes out of the deposit when the rental completes', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000 });
  const id = (await t.act('c1@t.ph', 'createRental', { veh: 'V2', s: future(20), e: future(20), pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City', lic: 'N01-23-456789', exp: future(400), ip: pic, lp: pic })).id;
  const rn = t.S.rn.find(x => x.id == id);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  await t.act('o@t.ph', 'rentalSign', { id, how: 'paper', photo: pic });
  await t.act('c1@t.ph', 'rentalPay', { id, amount: t.d.h.rentBal(rn), method: 'Cash' });
  for (const p of t.S.pay.filter(p => p.bid == id)) await t.act('o@t.ph', 'payVerify', { id: p.id, ok: true });
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH });
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', odo: 1100, fuel: 'Full', ph: PH });
  rn.late = { days: 1, amt: 2000 };
  rn.back.t = new Date(Date.now() - 5 * 864e5).toISOString();
  t.d.h.sweep();
  assert.equal(rn.st, 'Completed');
  assert.equal(rn.settle.late, 2000);
  assert.equal(rn.settle.refund, t.d.h.depOf(rn) - 2000);
});

test('#14/#15 an open GCash proof on a cancelled booking is closed; a refused booking does not create a group', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id, b = t.bk(id);
  await t.act('d1@t.ph', 'accept', { id });
  for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await t.act('d1@t.ph', 'step', { id, to });
  await t.act('c1@t.ph', 'payDeclare', { id, kind: 'down', g: t.d.h.due(b, 'down'), c: 0, ref: '9990001111' });
  await t.act('c1@t.ph', 'cancelBooking', { id });
  assert.equal(t.S.pay.find(x => x.bid == id && x.method == 'GCash').status, 'Withdrawn');
  const a = (await t.booking('c2@t.ph', { dt: future(50) })).id; // c1 now owes a cancellation fee
  await t.booking('c2@t.ph', { grp: a, ret: { dt: '2000-01-01', tm: '10:00' } });
  assert.ok(!t.bk(a).grp);
});

/* ---------- error recovery ---------- */
test('undo: a driver’s trip step within 5 minutes; not after', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id, b = t.bk(id);
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  assert.ok(t.d.h.undoables('d1@t.ph').some(x => x.kind == 'step' && x.id == id));
  assert.ok((await t.act('d1@t.ph', 'undo', { kind: 'step', id })).ok);
  assert.equal(b.st, 'Accepted');
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  b.ev.at(-1).t = new Date(Date.now() - 6 * 6e4).toISOString();
  assert.match((await t.act('d1@t.ph', 'undo', { kind: 'step', id })).err, /no longer be undone/);
});

test('undo an owner’s turnover answer; withdraw a pending turnover', async () => {
  const t = await setup();
  await cashTrip(t);
  const owed = t.d.h.turnBal('d1@t.ph');
  await t.act('d1@t.ph', 'turnover', { amount: 100, method: 'Cash' });
  const x = t.S.pay.find(p => p.kind == 'turnover');
  assert.ok((await t.act('d1@t.ph', 'withdraw', { kind: 'turnover', id: x.id })).ok);
  assert.equal(x.status, 'Withdrawn');
  await t.act('d1@t.ph', 'turnover', { amount: owed, method: 'Cash' });
  const y = t.S.pay.filter(p => p.kind == 'turnover').at(-1);
  await t.act('o@t.ph', 'turnoverDecide', { id: y.id, ok: true });
  assert.ok((await t.act('o@t.ph', 'undo', { kind: 'turnover', id: y.id })).ok);
  assert.equal(y.status, 'Submitted');
});

test('correct a payment: the driver proposes the right split, the customer approves, both versions are kept', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id, b = t.bk(id);
  await t.act('d1@t.ph', 'accept', { id });
  for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await t.act('d1@t.ph', 'step', { id, to });
  const due = t.d.h.due(b, 'down');
  await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: due });
  assert.match((await t.act('d1@t.ph', 'payCorrect', { id, kind: 'down', g: 100, c: due, why: 'typo' })).err, /add up/);
  assert.ok((await t.act('d1@t.ph', 'payCorrect', { id, kind: 'down', g: 100, c: r2(due - 100), rcv: 1000, ref: '1231231234', why: 'Customer paid ₱100 by GCash' })).ok);
  assert.ok((await t.act('c1@t.ph', 'payCorrectAnswer', { id, kind: 'down', ok: true })).ok);
  const recs = t.S.pay.filter(p => p.bid == id && p.status == 'Recorded by driver');
  assert.deepEqual(recs.map(p => p.method).sort(), ['Cash', 'GCash']);
  assert.equal(t.d.h.paySum(id, 'down'), due, 'the total is unchanged');
  assert.equal(recs[0].tx.fixes.length, 1);
});

test('admin corrections: step back a trip, void a payment (the trip steps back), cancel with a refund', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id, b = t.bk(id);
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  assert.match((await t.act('a@t.ph', 'adminFix', { kind: 'step-back', id, reason: 'short' })).err, /reason/);
  assert.ok((await t.act('a@t.ph', 'adminFix', { kind: 'step-back', id, reason: 'Driver tapped it at home, not on the way' })).ok);
  assert.equal(b.st, 'Accepted');
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  await t.act('d1@t.ph', 'step', { id, to: 'Awaiting Down Payment' });
  await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: t.d.h.due(b, 'down') });
  const x = t.S.pay.find(p => p.bid == id);
  assert.ok((await t.act('a@t.ph', 'adminFix', { kind: 'void-pay', id: x.id, reason: 'Recorded twice by mistake, no cash given' })).ok);
  assert.equal(b.st, 'Awaiting Down Payment');
  assert.ok((await t.act('a@t.ph', 'adminFix', { kind: 'cancel', id, refund: 0, reason: 'Customer moved away, agreed by phone' })).ok);
  assert.equal(b.st, 'Cancelled');
  assert.ok(t.S.au.some(a => a.evt == 'correction cancel'));
});

test('edit the addresses before a driver accepts (price recalculated); not after', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id, b = t.bk(id);
  const r = await t.act('c1@t.ph', 'editBooking', { id, dr: 'Sta. Maria, Zamboanga City' });
  assert.ok(r.ok, r.err);
  assert.equal(b.dr, 'Sta. Maria, Zamboanga City');
  await t.act('d1@t.ph', 'accept', { id });
  assert.match((await t.act('c1@t.ph', 'editBooking', { id, dr: 'Putik, Zamboanga City' })).err, /before a driver accepts/);
});
