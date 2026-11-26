'use strict';
/* Incidents: the emergency report, the people involved, statements, evidence requests,
   the call log, and decisions that act (refund, driver charge, strike, suspension). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { legacySetup: setup } = require('./_setup'); // written for the older driver → ZamMove flow

const pic = 'data:image/jpeg;base64,AAAA';

/* a trip on V1 (owner O, driver D1) that is in transit */
async function onTheRoad() {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  assert.ok((await t.act('d1@t.ph', 'accept', { id })).ok);
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  const nt = (to, re) => t.S.nt.some(n => n.to == to && re.test(n.h + ' ' + n.b));
  return { t, id, nt };
}

test('an emergency report stops the trip, opens a High case and alerts everyone involved', async () => {
  const { t, id, nt } = await onTheRoad();
  const em = x => t.act('d1@t.ph', 'emergency', { bid: id, hurt: 'yes', d: 'Hit by a jeepney at the Tetuan crossing.', phs: [pic, pic], blot: 'BLT-2026-0112', ...x });
  assert.match((await em({ hurt: '' })).err, /anyone is hurt/);
  assert.match((await em({ d: 'crash' })).err, /10\+ characters/);
  assert.match((await t.act('c2@t.ph', 'emergency', { bid: id, hurt: 'no', d: 'Not my booking at all.' })).err, /own bookings/);
  const r = await em();
  assert.ok(r.ok, r.err);
  assert.equal(t.bk(id).st, 'Interrupted', 'the trip is stopped');
  const c = t.S.inc.find(x => x.id == r.id);
  assert.deepEqual([c.cat, c.sev, c.kind, c.hurt, c.blot, c.phs.length], ['Vehicle accident', 'High', 'accident', 'yes', 'BLT-2026-0112', 2]);
  assert.deepEqual(c.parties.map(p => p.role), ['customer', 'driver', 'vehicle owner']);
  assert.ok(nt('a@t.ph', /EMERGENCY: accident.*Someone is hurt/), 'admins alerted');
  assert.ok(nt('c1@t.ph', /Accident on trip/), 'customer alerted');
  assert.ok(nt('o@t.ph', /Accident on trip/), 'vehicle owner alerted');
  assert.ok(t.S.nt.some(n => n.sim == 'SMS' && n.to == 'o@t.ph' && /Accident/.test(n.b)), 'urgent alerts also go by SMS');
  /* a second report on the stopped trip still opens a case */
  assert.ok((await t.act('c1@t.ph', 'emergency', { bid: id, hurt: 'unsure', d: 'My boxes fell during the crash.' })).ok);
});

test('accident and damage reports are never filed as Low, and the others are told', async () => {
  const { t, id, nt } = await onTheRoad();
  const r = await t.act('c1@t.ph', 'createIncident', { bid: id, cat: 'Vehicle accident', sev: 'Low', w: '2026-11-24T10:00', d: 'The van scraped a wall while reversing.' });
  if (r.ok) await t.act('c1@t.ph', 'caseConfirm', { id: r.id }); // reports are drafts until confirmed
  assert.equal(r.sev, 'High');
  const r2 = await t.act('c1@t.ph', 'createIncident', { bid: id, cat: 'Damaged items', sev: 'Low', w: '2026-11-24T10:00', d: 'A chair leg broke during loading.' });
  if (r2.ok) await t.act('c1@t.ph', 'caseConfirm', { id: r2.id }); // reports are drafts until confirmed
  assert.equal(r2.sev, 'Medium');
  assert.ok(nt('d1@t.ph', /reported "Damaged items"/), 'the driver is told about the report');
  assert.ok(nt('o@t.ph', /reported "Damaged items"/), 'so is the vehicle owner');
});

test('the people involved give their statements; outsiders cannot; staff see them, others do not', async () => {
  const { t, id } = await onTheRoad();
  const cid = (await t.act('d1@t.ph', 'emergency', { bid: id, hurt: 'no', d: 'Rear-ended at a red light on Veterans Ave.' })).id;
  const st = (em, text) => t.act(em, 'caseStatement', { id: cid, text, phs: [pic] });
  assert.match((await st('c2@t.ph', 'I was not even there that day.')).err, /not found/);
  assert.match((await st('c1@t.ph', 'short')).err, /own words/);
  assert.ok((await st('c1@t.ph', 'We stopped at the light and a tricycle hit us from behind.')).ok);
  assert.ok((await st('o@t.ph', 'The van was serviced last week; brakes were fine.')).ok);
  assert.ok((await st('c1@t.ph', 'Correction: it was a motorcycle, not a tricycle.')).ok, 'can be updated');
  const c = t.S.inc.find(x => x.id == cid);
  assert.equal(Object.keys(c.stmts).length, 2);
  assert.match(c.stmts['c1@t.ph'].text, /motorcycle/);
  const mine = t.d.view(t.me('c1@t.ph')).inc.find(x => x.id == cid);
  assert.deepEqual(Object.keys(mine.stmts), ['c1@t.ph'], 'a party sees only their own statement');
  assert.ok(t.d.view(t.me('d1@t.ph')).inc.some(x => x.id == cid), 'the driver sees the case');
});

test('evidence is asked from chosen people; when all have answered the case returns to review', async () => {
  const { t, id, nt } = await onTheRoad();
  const cid = (await t.act('c1@t.ph', 'createIncident', { bid: id, cat: 'Damaged items', sev: 'Medium', w: '2026-11-24T10:00', d: 'The ref door is dented after the trip.' })).id;
  await t.act('c1@t.ph', 'caseConfirm', { id: cid });
  const A = (act, x) => t.act('a@t.ph', 'incidentCase', { id: cid, act, ...x });
  assert.ok((await A('start')).ok);
  assert.match((await t.act('c1@t.ph', 'caseEvidence', { id: cid, note: 'photo' })).err, /No evidence was requested/);
  assert.ok((await A('evidence', { from: 'all', note: 'Send photos of the ref before and after loading.' })).ok);
  assert.ok(nt('d1@t.ph', /Evidence requested.*before and after/));
  assert.match((await t.act('c1@t.ph', 'caseEvidence', { id: cid, note: '' })).err, /Add a photo/);
  assert.ok((await t.act('c1@t.ph', 'caseEvidence', { id: cid, phs: [pic] })).ok);
  assert.ok((await t.act('d1@t.ph', 'caseEvidence', { id: cid, note: 'Loading photo shows the dent already there.', phs: [pic] })).ok);
  assert.equal(t.S.inc.find(x => x.id == cid).st, 'Evidence requested', 'the owner has not answered yet');
  assert.equal((await t.act('o@t.ph', 'caseEvidence', { id: cid, note: 'No photos from my side, sorry.' })).st, 'Under review');
  /* the request is visible to the person asked */
  const v = t.d.view(t.me('o@t.ph')).inc.find(x => x.id == cid);
  assert.ok(v.log.some(l => l.act == 'evidence' && /before and after/.test(l.note)));
  /* but only to the people asked */
  await A('evidence', { from: 'driver', note: 'Driver: send the dashcam clip.' });
  assert.ok(t.d.view(t.me('d1@t.ph')).inc.find(x => x.id == cid).log.some(l => /dashcam/.test(l.note)));
  assert.doesNotMatch(JSON.stringify(t.d.view(t.me('c1@t.ph')).inc.find(x => x.id == cid)), /dashcam|d1@t\.ph"\]/);
});

test('the admin logs calls to the people involved; parties never see the call log or notes', async () => {
  const { t, id } = await onTheRoad();
  const cid = (await t.act('d1@t.ph', 'emergency', { bid: id, hurt: 'no', d: 'Side mirror hit by a passing truck.' })).id;
  const call = x => t.act('a@t.ph', 'caseCall', { id: cid, who: 'c1@t.ph', out: 'Reached', note: 'Customer is fine, items safe.', ...x });
  assert.match((await call({ who: 'c2@t.ph' })).err, /who you called/);
  assert.match((await call({ out: 'Maybe' })).err, /how the call went/);
  assert.match((await t.act('c1@t.ph', 'caseCall', { id: cid, who: 'd1@t.ph', out: 'Reached' })).err, /administrator/);
  assert.ok((await call()).ok);
  assert.ok((await call({ who: 'o@t.ph', out: 'No answer', note: '' })).ok);
  await t.act('a@t.ph', 'incidentCase', { id: cid, act: 'note', note: 'Driver may have been speeding.' });
  const c = t.S.inc.find(x => x.id == cid);
  assert.equal(c.calls.length, 2);
  const seen = JSON.stringify(t.d.view(t.me('d1@t.ph')).inc.find(x => x.id == cid));
  assert.doesNotMatch(seen, /items safe|speeding|No answer/);
});

test('a decision can refund, charge the driver, add a strike and suspend; it acts at once', async () => {
  const { t, id, nt } = await onTheRoad();
  const cid = (await t.act('c1@t.ph', 'emergency', { bid: id, hurt: 'no', d: 'Driver ran a red light and hit a post.' })).id;
  const A = (act, x) => t.act('a@t.ph', 'incidentCase', { id: cid, act, ...x });
  await A('start');
  const dec = { note: 'Driver at fault per police report and both statements.', refund: 1000, charge: 1500, strike: true, suspend: true };
  assert.match((await A('decide', { ...dec, refund: -5 })).err, /between ₱0/);
  /* suspension waits for the stopped trip; nothing else is applied when it fails */
  assert.match((await A('decide', dec)).err, /trip in progress.*decide the stopped trip first/);
  assert.equal(t.S.pay.filter(p => p.bid == id).length, 0, 'nothing was applied');
  assert.ok((await t.act('a@t.ph', 'tripResolve', { id, act: 'close', refund: 0, reason: 'Accident; trip cannot continue.' })).ok);
  assert.ok((await A('decide', dec)).ok);
  const c = t.S.inc.find(x => x.id == cid);
  assert.equal(c.st, 'Decision recorded');
  assert.deepEqual(c.out, { refund: 1000, charge: 1500, strike: true, suspend: true });
  assert.ok(t.S.pay.some(p => p.kind == 'refund' && p.to == 'c1@t.ph' && p.amount == 1000 && p.status == 'Due'));
  assert.ok(t.S.pay.some(p => p.kind == 'case_charge' && p.payer == 'd1@t.ph' && p.amount == 1500));
  assert.equal(t.d.h.drvDebit('d1@t.ph'), 1500, 'deducted from the next remittance');
  assert.equal(t.S.users.find(u => u.em == 'd1@t.ph').strikes.length, 1);
  assert.equal(t.S.users.find(u => u.em == 'd1@t.ph').status, 'suspended');
  assert.ok(nt('o@t.ph', /Decision on .*Outcome: ₱1,000\.00 refund to the customer, ₱1,500\.00 charged to the driver, a strike, driver suspended/));
  assert.match((await t.act('c1@t.ph', 'caseStatement', { id: cid, text: 'One more thing to add here.' })).err, /already decided/);
});

test('an admin who is part of the trip cannot handle its case', async () => {
  const { t, id } = await onTheRoad();
  t.S.users.find(u => u.em == 'o@t.ph').adm = 'super';
  const cid = (await t.act('d1@t.ph', 'emergency', { bid: id, hurt: 'no', d: 'Flat tire caused a minor bump.' })).id;
  assert.match((await t.act('o@t.ph', 'incidentCase', { id: cid, act: 'start' })).err, /part of/);
});
