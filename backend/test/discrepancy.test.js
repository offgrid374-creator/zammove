'use strict';
/* Pre-departure discrepancies: one typo only warns, a repeated mismatch is reported to the staff,
   a corrected entry closes the report by itself, and an administrator resolves the rest. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./_setup');

async function atChecks(t) {
  const id = (await t.booking('c1@t.ph')).id;
  assert.ok((await t.act('d1@t.ph', 'accept', { id })).ok);
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  await t.act('d1@t.ph', 'step', { id, to: 'Awaiting Down Payment' });
  await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: t.d.h.due(t.bk(id), 'down') });
  assert.ok((await t.act('d1@t.ph', 'step', { id, to: 'Items Loaded', note: 'Sofa and 3 boxes' })).ok);
  const pin = await t.act('c1@t.ph', 'vNewPin', { id });
  assert.ok((await t.act('d1@t.ph', 'vVerify', { id, input: pin.pin, kind: 'pin' })).ok);
  return id;
}
const open = (t, id) => t.bk(id).ver.disc.filter(d => d.status == 'open');

test('a repeated wrong plate is reported to the staff; the right plate closes it by itself', async () => {
  const t = await setup();
  const id = await atChecks(t);
  assert.match((await t.act('d1@t.ph', 'vPlate', { id, input: 'ZZZ 9999' })).err, /enter it again/);
  assert.equal(open(t, id).length, 0, 'first typo: no report');
  assert.match((await t.act('d1@t.ph', 'vPlate', { id, input: 'ZZZ 9998' })).err, /administrator was notified/);
  const d = open(t, id)[0];
  assert.equal(d.type, 'Vehicle plate mismatch');
  assert.match(d.note, /ZZZ9999, ZZZ9998; the assigned vehicle is AAA1111/);
  assert.ok(t.S.nt.some(n => n.to == 'a@t.ph' && /on hold/.test(n.h)), 'admins are told');
  assert.ok((await t.act('d1@t.ph', 'vPlate', { id, input: 'aaa 1111' })).ok);
  assert.equal(open(t, id).length, 0, 'the correct plate resolves the report');
  assert.match(t.bk(id).ver.disc[0].res, /correct plate/);
  assert.equal(t.bk(id).ver.disc[0].resBy, 'system');
  /* and departure is not blocked by it */
  assert.ok((await t.act('d1@t.ph', 'vSave', { id, count: 4, items: [true, true], frag: [] })).ok);
  assert.ok((await t.act('d1@t.ph', 'vDriverConfirm', { id })).ok);
  assert.ok((await t.act('c1@t.ph', 'vCustomerConfirm', { id, reviewed: true })).ok);
  assert.ok((await t.act('d1@t.ph', 'vAuthorize', { id })).ok);
});

test('a different piece count first asks for a recount; the same count again is reported; a matching recount closes it', async () => {
  const t = await setup();
  const id = await atChecks(t);
  assert.ok((await t.act('d1@t.ph', 'vPlate', { id, input: 'AAA1111' })).ok);
  const save = count => t.act('d1@t.ph', 'vSave', { id, count, items: [true, true], frag: [] });
  assert.match((await save(3)).err, /Recount: you entered 3 pieces but the booking lists 4/);
  assert.equal(t.bk(id).ver.chk.done, false, 'not complete until the count is settled');
  assert.equal(open(t, id).length, 0);
  const r = await save(3);
  assert.ok(r.ok);
  assert.match(r.warn, /reported to an administrator/);
  assert.equal(open(t, id)[0].type, 'Missing items');
  assert.ok((await save(4)).ok, 'recounted as booked');
  assert.equal(open(t, id).length, 0, 'the matching recount resolves it');
});

test('an administrator resolves a real difference and can correct the booked count', async () => {
  const t = await setup();
  const id = await atChecks(t);
  await t.act('d1@t.ph', 'vPlate', { id, input: 'AAA1111' });
  await t.act('d1@t.ph', 'vSave', { id, count: 5, items: [true, true], frag: [] });
  await t.act('d1@t.ph', 'vSave', { id, count: 5, items: [true, true], frag: [] });
  const d = open(t, id)[0];
  assert.equal(d.type, 'Additional items');
  assert.equal((await t.act('d1@t.ph', 'vResolve', { id, disc: d.id, res: 'It was fine' })).ok, false, 'drivers cannot resolve');
  assert.match((await t.act('a@t.ph', 'vResolve', { id, disc: d.id, res: 'ok' })).err, /at least 5/);
  assert.ok((await t.act('a@t.ph', 'vResolve', { id, disc: d.id, res: 'Customer added a lamp; called both', mc: 5 })).ok);
  assert.equal(open(t, id).length, 0);
  assert.equal(t.bk(id).ver.mcOver, 5, 'the booked count is corrected');
  assert.equal(t.bk(id).ver.dconf, null, 'the driver confirms again after the change');
});
