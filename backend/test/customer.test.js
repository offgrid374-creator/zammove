'use strict';
/* Customer-facing rules found in the UI review: notifications are never dropped, incident reports need a category. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./_setup');

test('turning trip alerts off keeps every notification in the app (marked quiet)', async () => {
  const t = await setup();
  assert.ok((await t.act('c1@t.ph', 'setAlerts', { on: false })).ok);
  const id = (await t.booking('c1@t.ph')).id;
  assert.ok((await t.act('d1@t.ph', 'accept', { id })).ok);
  const mine = t.S.nt.filter(n => n.to == 'c1@t.ph');
  assert.ok(mine.length > 0, 'the customer still gets "booking accepted"');
  assert.ok(
    mine.every(n => n.quiet),
    'marked quiet: no SMS/email once those are connected'
  );
  assert.ok(t.d.view(t.me('c1@t.ph')).nt.length > 0, 'and sees it in the app');
});

test('an incident report needs a category chosen on purpose', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  const rep = x =>
    t.act('c1@t.ph', 'createIncident', {
      bid: id,
      sev: 'Low',
      w: '2026-11-22T10:00',
      d: 'The driver is very late.',
      ...x,
    });
  assert.match((await rep({ cat: '' })).err, /Choose a category/);
  assert.ok((await rep({ cat: 'Delay' })).ok);
});

test('one application can ask for both roles; shared documents are uploaded once', async () => {
  const t = await setup();
  const f = 'data:image/png;base64,iVBORw0KGgo=';
  const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const base = { roles: ['driver', 'owner'], phone: '09171230000', address: 'Tetuan', license: 'N01-99-123456', licExp: day(500), clrExp: day(300) };
  /* owner documents left empty: the ID and proof of address come from the driver documents */
  const r = await t.act('c2@t.ph', 'apply', { ...base, docs: { driver: [f, f, f, f], owner: [] } });
  assert.ok(r.ok, r.err);
  const apps = t.S.apps.filter(a => a.user == 'c2@t.ph');
  assert.deepEqual(apps.map(a => a.role).sort(), ['driver', 'owner']);
  assert.deepEqual(apps.find(a => a.role == 'owner').docs.map(d => d.name), ['Government-issued ID', 'Proof of address']);
  assert.deepEqual(t.me('c2@t.ph').roles.map(x => x.t + ':' + x.st).sort(), ['driver:pending', 'owner:pending']);
  /* applying only as an owner still needs the owner's own documents */
  const t2 = await setup();
  assert.match((await t2.act('c2@t.ph', 'apply', { ...base, roles: ['owner'], docs: { driver: [f, f, f, f] } })).err, /Upload: Government-issued ID, Proof of address/);
});
