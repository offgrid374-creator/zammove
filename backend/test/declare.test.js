'use strict';
/* Both sides say how a payment was made (GCash part, cash part, cash handed over). The driver's entry must
   match the customer's declaration, or be recorded with a note that the customer and ZamMove see. Every payment
   record carries the whole transaction for the receipt. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./_setup');

async function atPickup() {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  await t.act('d1@t.ph', 'step', { id, to: 'Awaiting Down Payment' });
  return { t, id, due: t.d.h.due(t.bk(id), 'down') };
}

test('the customer declares a hybrid payment; the split must add up and cash handed must cover the cash part', async () => {
  const { t, id, due } = await atPickup();
  assert.match((await t.act('c1@t.ph', 'payDeclare', { id, kind: 'down', g: 100, c: 100, cg: 100 })).err, /add up to exactly/);
  const g = 100, c = Math.round((due - 100) * 100) / 100;
  assert.match((await t.act('c1@t.ph', 'payDeclare', { id, kind: 'down', g, c, cg: c - 1, ref: '1111111111' })).err, /at least/);
  assert.match((await t.act('c1@t.ph', 'payDeclare', { id, kind: 'down', g, c, cg: c + 50 })).err, /reference/);
  const r = await t.act('c1@t.ph', 'payDeclare', { id, kind: 'down', g, c, cg: c + 50, ref: '1111111111' });
  assert.ok(r.ok, r.err);
  assert.deepEqual([r.decl.g, r.decl.c, r.decl.cg, r.decl.chg], [g, c, c + 50, 50]);
  assert.ok(t.S.pay.some(p => p.bid == id && p.method == 'GCash' && p.status == 'Submitted' && p.amount == g));
  assert.ok(t.S.nt.some(n => n.to == 'd1@t.ph' && /give back ₱50.00 change/.test(n.b)), 'the driver is told the expected change');
});

test('a matching driver entry is recorded with the whole transaction on every payment record', async () => {
  const { t, id, due } = await atPickup();
  const g = 100, c = Math.round((due - 100) * 100) / 100;
  await t.act('c1@t.ph', 'payDeclare', { id, kind: 'down', g, c, cg: c + 50, ref: '2222222222' });
  const r = await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g, c, rcv: c + 50, ref: '2222222222' });
  assert.ok(r.ok, r.err);
  const ps = t.S.pay.filter(p => p.bid == id && p.kind == 'down' && p.status == 'Recorded by driver');
  assert.equal(ps.length, 2);
  assert.ok(ps.every(p => p.tx && p.tx.id == ps[0].tx.id), 'both records share one transaction');
  const tx = ps[0].tx;
  assert.deepEqual([tx.due, tx.g, tx.c, tx.rcv, tx.chg, tx.match], [due, g, c, c + 50, 50, true]);
  assert.equal(tx.decl.cg, c + 50);
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /matches what you declared/.test(n.b)));
});

test('a different entry is blocked; recorded anyway only with a note, and the customer and staff are told', async () => {
  const { t, id, due } = await atPickup();
  await t.act('c1@t.ph', 'payDeclare', { id, kind: 'down', g: 0, c: due, cg: due + 500 });
  const r = await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: 1000 + due });
  assert.match(r.err, /does not match/);
  assert.ok(r.mismatch.some(x => /cash handed over/.test(x)));
  assert.match((await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: 1000 + due, force: true, why: '' })).err, /does not match/);
  const r2 = await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: 1000 + due, force: true, why: 'Customer handed me 2 bills, counted together' });
  assert.ok(r2.ok, r2.err);
  const tx = t.S.pay.find(p => p.bid == id && p.status == 'Recorded by driver').tx;
  assert.equal(tx.match, false);
  assert.ok(tx.diff.length && /2 bills/.test(tx.why));
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /differs from what you declared/.test(n.b)));
  assert.ok(t.S.nt.some(n => n.h == 'Payment differs from declaration'));
});

test('without a declaration the driver records as before (old behaviour kept)', async () => {
  const { t, id, due } = await atPickup();
  assert.ok((await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: due })).ok);
  assert.equal(t.S.pay.find(p => p.bid == id && p.status == 'Recorded by driver').tx.match, null);
});
