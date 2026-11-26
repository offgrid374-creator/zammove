'use strict';
/* Reports are voluntary: a new report is a draft only its reporter sees, until they confirm it.
   It can be dismissed before sending, or withdrawn until ZamMove decides it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./_setup');

async function onTheRoad() {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  return { t, id };
}
const report = (t, id) => t.act('c1@t.ph', 'createIncident', { bid: id, cat: 'Delay', sev: 'Low', w: '2026-11-24T10:00', d: 'The driver is very late.' });
const told = (t, em, re) => t.S.nt.some(n => n.to == em && re.test(n.h + ' ' + n.b));

test('a new report is a draft: nobody else is told and nobody else sees it until it is confirmed', async () => {
  const { t, id } = await onTheRoad();
  const r = await report(t, id);
  assert.ok(r.ok && r.draft);
  const c = t.S.inc.find(x => x.id == r.id);
  assert.equal(c.st, 'Unconfirmed');
  assert.ok(!told(t, 'd1@t.ph', /reported/), 'the driver is not told yet');
  const viewD = t.d.view(t.d.h.U('d1@t.ph')), viewA = t.d.view(t.d.h.U('a@t.ph')), viewC = t.d.view(t.d.h.U('c1@t.ph'));
  assert.ok(!viewD.inc.some(x => x.id == c.id), 'the driver does not see the draft');
  assert.ok(!viewA.inc.some(x => x.id == c.id), 'staff do not see the draft');
  assert.ok(viewC.inc.some(x => x.id == c.id), 'the reporter sees it');
  assert.match((await t.act('a@t.ph', 'incidentCase', { id: c.id, act: 'start' })).err, /not sent this report yet/);
  assert.ok((await t.act('c1@t.ph', 'caseConfirm', { id: c.id })).ok);
  assert.equal(c.st, 'Submitted');
  assert.ok(told(t, 'd1@t.ph', /reported "Delay"/), 'now the driver is told');
});

test('a draft can be dismissed: it never reaches anyone', async () => {
  const { t, id } = await onTheRoad();
  const r = await report(t, id);
  assert.match((await t.act('d1@t.ph', 'caseWithdraw', { id: r.id })).err, /not found/);
  assert.ok((await t.act('c1@t.ph', 'caseWithdraw', { id: r.id })).ok);
  const c = t.S.inc.find(x => x.id == r.id);
  assert.equal(c.st, 'Withdrawn');
  assert.ok(!t.d.view(t.d.h.U('a@t.ph')).inc.some(x => x.id == c.id), 'staff never see a dismissed draft');
  assert.match((await t.act('c1@t.ph', 'caseConfirm', { id: r.id })).err, /no unsent report/);
});

test('a sent report can be withdrawn until it is decided; everyone involved is told', async () => {
  const { t, id } = await onTheRoad();
  const r = await report(t, id);
  await t.act('c1@t.ph', 'caseConfirm', { id: r.id });
  assert.match((await t.act('c1@t.ph', 'caseWithdraw', { id: r.id, why: '' })).err, /why/);
  assert.ok((await t.act('c1@t.ph', 'caseWithdraw', { id: r.id, why: 'My mistake, the driver was on time' })).ok);
  assert.ok(told(t, 'd1@t.ph', /withdrew report/));
  assert.ok(told(t, 'a@t.ph', /withdrawn by the reporter/));
  assert.match((await t.act('a@t.ph', 'incidentCase', { id: r.id, act: 'start' })).err, /withdrew/);
});

test('a decided case cannot be withdrawn; an unconfirmed draft is discarded after a day', async () => {
  const { t, id } = await onTheRoad();
  const r = await report(t, id);
  await t.act('c1@t.ph', 'caseConfirm', { id: r.id });
  await t.act('a@t.ph', 'incidentCase', { id: r.id, act: 'start' });
  await t.act('a@t.ph', 'incidentCase', { id: r.id, act: 'decide', note: 'Driver was 40 minutes late; warning given.' });
  assert.match((await t.act('c1@t.ph', 'caseWithdraw', { id: r.id, why: 'changed my mind' })).err, /already decided/);
  const d = await report(t, id);
  t.S.inc.find(x => x.id == d.id).t = new Date(Date.now() - 25 * 36e5).toISOString();
  t.d.h.sweep();
  assert.equal(t.S.inc.find(x => x.id == d.id).st, 'Withdrawn');
  assert.ok(told(t, 'c1@t.ph', /never confirmed/));
});

test('wrong change: the driver is flagged only after the customer confirms; withdrawing lifts the flag', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  await t.act('d1@t.ph', 'step', { id, to: 'Awaiting Down Payment' });
  const due = t.d.h.due(t.bk(id), 'down');
  await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: 2000 });
  const r = await t.act('c1@t.ph', 'changeDispute', { id, amt: 100, gave: 2000, d: 'I gave 2000 and got back 100 less.' });
  assert.ok(r.ok && r.draft);
  const drv = t.d.h.U('d1@t.ph');
  assert.ok(!(drv.flags || []).some(f => f.inc == r.id), 'no flag while it is a draft');
  await t.act('c1@t.ph', 'caseConfirm', { id: r.id });
  assert.ok(drv.flags.some(f => f.inc == r.id && f.open), 'flagged after confirming');
  assert.ok((await t.act('c1@t.ph', 'caseWithdraw', { id: r.id, why: 'I found the 100 in my pocket' })).ok);
  assert.ok(drv.flags.some(f => f.inc == r.id && !f.open), 'the flag is lifted');
  /* a withdrawn report does not block reporting again */
  assert.ok((await t.act('c1@t.ph', 'changeDispute', { id, amt: 50, d: 'Actually 50 is still missing.' })).ok);
});
