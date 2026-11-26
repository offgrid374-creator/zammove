'use strict';
/* Driver → owner → ZamMove: the driver keeps their share and turns the rest over to their owner; the owner
   remits ZamMove's portion (fee + commission) weekly. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

const r2 = x => Math.round(x * 100) / 100;
async function completed(t, pay = 'cash') {
  const id = (await t.booking('c1@t.ph')).id;
  const b = t.bk(id);
  assert.equal(b.flow, 'owner');
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  await t.act('d1@t.ph', 'step', { id, to: 'Awaiting Down Payment' });
  const down = t.d.h.due(b, 'down');
  if (pay == 'gcash') {
    await t.act('c1@t.ph', 'payDeclare', { id, kind: 'down', g: down, c: 0, ref: '5550001111' });
    assert.ok((await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: down, c: 0, ref: '5550001111' })).ok);
  } else assert.ok((await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: down })).ok);
  b.st = 'Awaiting Final Payment';
  const fin = t.d.h.due(b, 'final');
  if (pay == 'gcash') assert.ok((await t.act('d1@t.ph', 'driverPay', { id, kind: 'final', g: fin, c: 0, ref: '5550002222' })).ok);
  else assert.ok((await t.act('d1@t.ph', 'driverPay', { id, kind: 'final', g: 0, c: fin })).ok);
  assert.equal(b.st, 'Completed');
  return b;
}

test('cash trip: the driver keeps their share, turns the rest over, the owner confirms and remits ZamMove’s portion', async () => {
  const t = await setup();
  const b = await completed(t);
  const s = t.d.h.splitOf(b);
  assert.equal(t.d.h.turnBal('d1@t.ph'), r2(s.fare - s.drv), 'the driver owes the owner the fare minus their share');
  assert.equal(t.d.h.ownerBal('o@t.ph').due, -s.zam, 'the owner owes ZamMove its fee and commission');
  assert.match((await t.act('d1@t.ph', 'remit', { week: t.d.h.wk(b.cd), ref: 'X', method: 'Cash' })).err, /No unremitted/, 'no remittance to ZamMove for new trips');
  /* turnover */
  assert.match((await t.act('d1@t.ph', 'turnover', { amount: 99999, method: 'Cash' })).err, /more than you owe/);
  assert.ok((await t.act('d1@t.ph', 'turnover', { amount: r2(s.fare - s.drv), method: 'Cash' })).ok);
  const x = t.S.pay.find(p => p.kind == 'turnover');
  assert.ok(t.S.nt.some(n => n.to == 'o@t.ph' && n.h == 'Money from your driver'));
  assert.ok((await t.act('o@t.ph', 'turnoverDecide', { id: x.id, ok: true })).ok);
  assert.equal(t.d.h.turnBal('d1@t.ph'), 0);
  /* the owner remits ZamMove's portion; the cashier verifies */
  assert.ok((await t.act('o@t.ph', 'ownerRemitSend', { amount: s.zam, method: 'Cash' })).ok);
  await t.act('k@t.ph', 'payVerify', { id: t.S.pay.find(p => p.kind == 'owner_remit').id, ok: true });
  assert.equal(t.d.h.ownerBal('o@t.ph').due, 0);
});

test('GCash to the owner’s number: the owner already has the money and pays the driver their share', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'ownerGcash', { no: '09171234567', name: 'Olga Owner' });
  const b = await completed(t, 'gcash');
  const s = t.d.h.splitOf(b);
  assert.ok(t.S.pay.filter(p => p.bid == b.id).every(p => p.gto == 'owner'));
  assert.equal(t.d.h.turnBal('d1@t.ph'), -s.drv, 'the owner owes the driver their share');
  assert.match((await t.act('o@t.ph', 'ownerPayDriver', { driver: 'd1@t.ph', amount: s.drv + 1, method: 'Cash' })).err, /up to/);
  assert.ok((await t.act('o@t.ph', 'ownerPayDriver', { driver: 'd1@t.ph', amount: s.drv, method: 'Cash' })).ok);
  assert.equal(t.d.h.turnBal('d1@t.ph'), 0);
  assert.ok(t.S.nt.some(n => n.to == 'd1@t.ph' && n.h == 'Payment from your owner'));
});

test('a turnover the owner says never arrived can be contested; staff decide', async () => {
  const t = await setup();
  const b = await completed(t);
  const s = t.d.h.splitOf(b);
  await t.act('d1@t.ph', 'turnover', { amount: r2(s.fare - s.drv), method: 'Cash' });
  const x = t.S.pay.find(p => p.kind == 'turnover');
  assert.match((await t.act('o@t.ph', 'turnoverDecide', { id: x.id, ok: false })).err, /what is wrong/);
  assert.ok((await t.act('o@t.ph', 'turnoverDecide', { id: x.id, ok: false, note: 'Nothing was handed to me' })).ok);
  assert.ok((await t.act('d1@t.ph', 'turnoverDispute', { id: x.id, note: 'Handed it at the garage at 6 PM, the guard saw it' })).ok);
  assert.ok((await t.act('k@t.ph', 'moneyDecide', { id: x.id, ok: true, note: 'Guard and CCTV confirm the hand-over' })).ok);
  assert.equal(x.status, 'Verified');
  assert.equal(t.d.h.turnBal('d1@t.ph'), 0);
});

test('a driver still owing their owner 7 days after a trip cannot take new jobs', async () => {
  const t = await setup();
  const b = await completed(t);
  assert.equal(t.d.h.turnOverdue('d1@t.ph'), false);
  b.cd = new Date(Date.now() - 8 * 864e5).toISOString();
  assert.equal(t.d.h.turnOverdue('d1@t.ph'), true);
  const nb = (await t.booking('c2@t.ph', { dt: future(40) })).id;
  assert.match((await t.act('d1@t.ph', 'accept', { id: nb })).err, /overdue/i);
});
