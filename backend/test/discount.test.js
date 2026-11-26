'use strict';
/* Owner discount: the customer pays less, ZamMove keeps its full service fee and commission, the driver's share
   is unchanged, and the owner's share absorbs the discount. Capped at 50% of the fare and the owner's share. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./_setup');

async function delivered(t) {
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  await t.act('d1@t.ph', 'step', { id, to: 'Awaiting Down Payment' });
  await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: t.d.h.due(t.bk(id), 'down') });
  return id;
}

test('owner discount: lower balance, ZamMove and driver unchanged, owner absorbs it; the remittance still adds up', async () => {
  const t = await setup();
  const id = await delivered(t);
  const b = t.bk(id),
    before = t.d.h.splitOf(b),
    finalBefore = t.d.h.due(b, 'final');
  assert.match((await t.act('d1@t.ph', 'ownerDiscount', { id, amt: 100, why: 'friend' })).err, /owner of the vehicle/);
  assert.match((await t.act('o@t.ph', 'ownerDiscount', { id, amt: 99999, why: 'friend' })).err, /most you can give/);
  assert.match((await t.act('o@t.ph', 'ownerDiscount', { id, amt: 200 })).err, /reason/);
  assert.ok((await t.act('o@t.ph', 'ownerDiscount', { id, amt: 200, why: 'Best friend' })).ok);
  assert.equal(t.d.h.due(b, 'final'), finalBefore - 200, 'the customer pays ₱200 less');
  const after = t.d.h.splitOf(b);
  assert.equal(after.zam, before.zam, 'ZamMove keeps its full fee and commission');
  assert.equal(after.drv, before.drv, 'the driver share does not change');
  assert.equal(after.own, before.own - 200, 'the owner absorbs the discount');
  /* collect the lower balance and complete: what the driver remits = collected − driver share = ZamMove + owner */
  b.st = 'Awaiting Final Payment';
  assert.ok((await t.act('d1@t.ph', 'driverPay', { id, kind: 'final', g: 0, c: t.d.h.due(b, 'final') })).ok);
  assert.equal(b.st, 'Completed');
  assert.equal(t.d.h.dueFor(b), Math.round((after.zam + after.own) * 100) / 100);
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /₱200 discount/.test(n.b)));
});
