'use strict';
/* Wrong change on cash payments: the receipt tells the customer the change, the customer can report a shortfall
   within 24 hours, the driver is flagged and can answer, and the cashier decides (refund + deduction + strike). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./_setup');

const D = (t, id, n, p) => t.act('d1@t.ph', n, { id, ...p });

/* a trip up to the paid down payment, in cash: the customer hands over `rcv` */
async function paidDown(t, rcv) {
  const id = (await t.booking('c1@t.ph')).id;
  assert.ok((await D(t, id, 'accept')).ok);
  await D(t, id, 'step', { to: 'On the Way to Pickup' });
  await D(t, id, 'step', { to: 'Awaiting Down Payment' });
  const c = t.d.h.due(t.bk(id), 'down');
  const r = await D(t, id, 'driverPay', { kind: 'down', g: 0, c, rcv });
  assert.ok(r.ok, r.err);
  return { id, c };
}

test('the driver records the cash handed over and the customer gets a receipt with the change', async () => {
  const t = await setup();
  const { id, c } = await paidDown(t, 2000);
  const x = t.S.pay.find(p => p.bid == id && p.method == 'Cash');
  assert.equal(x.rcv, 2000);
  assert.equal(x.chg, Math.round((2000 - c) * 100) / 100);
  const n = t.S.nt.find(n => n.to == 'c1@t.ph' && n.h == 'Receipt ' + id);
  assert.match(n.b, /your change should be/);
  assert.ok(t.S.nt.some(n => n.sim == 'SMS' && /receipt/.test(n.b)), 'receipt also sent by (simulated) SMS');
});

test('cash handed over must cover the cash amount', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await D(t, id, 'accept');
  await D(t, id, 'step', { to: 'On the Way to Pickup' });
  await D(t, id, 'step', { to: 'Awaiting Down Payment' });
  const c = t.d.h.due(t.bk(id), 'down');
  assert.match((await D(t, id, 'driverPay', { kind: 'down', g: 0, c, rcv: c - 100 })).err, /cash the customer handed you/);
});

test('a customer reports wrong change: the driver is flagged and can answer', async () => {
  const t = await setup();
  const { id } = await paidDown(t, 2000);
  const r = await t.act('c1@t.ph', 'changeDispute', { id, amt: 200, gave: 2000, d: 'I gave 2000 but got back 200 less.' });
  assert.ok(r.ok, r.err);
  const c = t.S.inc.find(x => x.id == r.id);
  assert.equal(c.kind, 'change');
  assert.equal(c.driver, 'd1@t.ph');
  const f = t.me('d1@t.ph').flags.find(f => f.inc == c.id);
  assert.ok(f.open && f.kind == 'Payment discrepancy');
  /* one report per booking; amounts must make sense */
  assert.match((await t.act('c1@t.ph', 'changeDispute', { id, amt: 50, d: 'Another report here' })).err, /already reported/);
  /* the driver can see and answer it; another driver cannot see it */
  assert.ok(t.d.view(t.me('d1@t.ph')).inc.some(x => x.id == c.id));
  assert.ok(!t.d.view(t.me('d2@t.ph')).inc.some(x => x.id == c.id));
  assert.ok((await t.act('d1@t.ph', 'changeReply', { id: c.id, note: 'I gave the exact change, 2000 minus the fare.' })).ok);
  assert.ok(c.reply);
});

test('wrong change cannot be reported without a cash payment, after 24 hours, or for more than was handed over', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  assert.match((await t.act('c1@t.ph', 'changeDispute', { id, amt: 100, d: 'Missing change here' })).err, /no cash payment/);
  const p = await paidDown(t, 2000);
  assert.match((await t.act('c1@t.ph', 'changeDispute', { id: p.id, amt: 5000, d: 'Missing change here' })).err, /up to/);
  t.S.pay.find(x => x.bid == p.id && x.method == 'Cash').t = new Date(Date.now() - 25 * 36e5).toISOString();
  assert.match((await t.act('c1@t.ph', 'changeDispute', { id: p.id, amt: 100, d: 'Missing change here' })).err, /within 24 hours/);
});

test('upheld: the customer is refunded, the driver pays it back on the next remittance and gets a strike', async () => {
  const t = await setup();
  const { id } = await paidDown(t, 2000);
  const r = await t.act('c1@t.ph', 'changeDispute', { id, amt: 200, gave: 2000, d: 'I gave 2000 but got back 200 less.' });
  const before = t.d.h.cashHeld('d1@t.ph');
  assert.match((await t.act('d1@t.ph', 'changeResolve', { id: r.id, ok: true, note: 'Deciding my own case' })).err, /Only a cashier/);
  const ok = await t.act('k@t.ph', 'changeResolve', { id: r.id, ok: true, note: 'Driver confirmed the shortfall on call.' });
  assert.ok(ok.ok, ok.err);
  const c = t.S.inc.find(x => x.id == r.id);
  assert.equal(c.st, 'Upheld');
  const refund = t.S.pay.find(p => p.kind == 'refund' && p.to == 'c1@t.ph' && p.bid == id);
  assert.equal(refund.amount, 200);
  assert.equal(refund.status, 'Due');
  assert.equal(t.d.h.drvDebit('d1@t.ph'), 200);
  assert.equal(t.d.h.cashHeld('d1@t.ph'), Math.round((before + 200) * 100) / 100, 'counts toward the cash limit');
  assert.equal(t.me('d1@t.ph').strikes.at(-1).why, 'Wrong change');
  assert.equal(t.me('d1@t.ph').flags.find(f => f.inc == r.id).open, false, 'flag closed');
  /* the cashier sends the refund */
  assert.ok((await t.act('k@t.ph', 'refundPaid', { id: refund.id, method: 'Cash' })).ok);
});

test('the deduction is added to the driver’s next remittance', async () => {
  const t = await setup();
  const { id } = await paidDown(t, 2000);
  const r = await t.act('c1@t.ph', 'changeDispute', { id, amt: 150, d: 'Got back 150 less than I should.' });
  await t.act('k@t.ph', 'changeResolve', { id: r.id, ok: true, note: 'Shortfall confirmed by both sides.' });
  /* finish the trip, then remit its week as if it had ended */
  const b = t.bk(id);
  b.st = 'Completed';
  b.cd = new Date(Date.now() - 14 * 864e5).toISOString();
  const week = t.d.h.wk(b.cd);
  const due = t.d.h.dueFor(b);
  const rem = await t.act('d1@t.ph', 'remit', { week, ref: 'OR-1', method: 'Cash' });
  assert.ok(rem.ok, rem.err);
  const rm = t.S.rem.at(-1);
  assert.equal(rm.debit, 150);
  assert.equal(rm.due, Math.round((due + 150) * 100) / 100);
  assert.equal(t.d.h.drvDebit('d1@t.ph'), 0);
  assert.equal(t.S.pay.find(p => p.kind == 'change_charge').status, 'Deducted');
});

test('rejected: no refund, no strike, the flag is closed with the reason', async () => {
  const t = await setup();
  const { id } = await paidDown(t, 2000);
  const r = await t.act('c1@t.ph', 'changeDispute', { id, amt: 200, d: 'I gave 2000 but got back 200 less.' });
  assert.ok((await t.act('k@t.ph', 'changeResolve', { id: r.id, ok: false, note: 'Receipt and driver photo show correct change.' })).ok);
  assert.equal(t.S.inc.find(x => x.id == r.id).st, 'Rejected');
  assert.ok(!t.S.pay.some(p => p.kind == 'refund' || p.kind == 'change_charge'));
  assert.equal((t.me('d1@t.ph').strikes || []).length, 0);
  assert.match(t.me('d1@t.ph').flags.find(f => f.inc == r.id).rnote, /^Rejected/);
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /Not upheld/.test(n.b)));
});
