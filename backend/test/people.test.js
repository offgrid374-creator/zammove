'use strict';
/* Owners manage their own people: drivers apply to an owner (who approves before ZamMove reviews), drivers work
   for one owner only, owners register helpers, and a booking with helpers names them before departure. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const form = x => ({ roles: ['driver'], phone: '0917', address: 'Tetuan', license: 'N01-99-123456', licExp: future(500), clrExp: future(300), docs: { driver: [pic, pic, pic, pic] }, ...x });

test('a driver applies to an owner; the owner approves before ZamMove reviews; the driver then works for that owner', async () => {
  const t = await setup();
  assert.match((await t.act('c2@t.ph', 'apply', form())).err, /Choose the vehicle owner/);
  assert.ok((await t.act('c2@t.ph', 'apply', form({ employer: t.d.h.pkey('o@t.ph') }))).ok);
  const a = t.S.apps.find(x => x.user == 'c2@t.ph');
  assert.equal(a.st, 'Waiting for Owner');
  assert.ok(t.S.nt.some(n => n.to == 'o@t.ph' && n.h == 'Driver application'));
  assert.match((await t.act('a@t.ph', 'appAction', { id: a.id, act: 'verify' })).err, /Waiting for the vehicle owner/);
  assert.ok(t.d.view(t.me('o@t.ph')).apps.some(x => x.id == a.id), 'the owner sees the application');
  assert.match((await t.act('c1@t.ph', 'ownerAppDecide', { id: a.id, ok: true })).err, /no driver application/);
  assert.ok((await t.act('o@t.ph', 'ownerAppDecide', { id: a.id, ok: true })).ok);
  assert.equal(a.st, 'Pending Review');
  const ans = Object.fromEntries(require('../src/domain/constants').IVQ.driver.map(q => [q.id, { r: 'pass', n: '' }]));
  for (const act of ['verify', 'interview', 'ivsave', 'orient', 'orientdone', 'approve'])
    assert.ok((await t.act('a@t.ph', 'appAction', { id: a.id, act, ans, when: '2026-12-01T10:00', where: 'Office' })).ok, act);
  assert.equal(t.d.h.U('c2@t.ph').employer, 'o@t.ph');
  assert.equal(t.d.h.driverOwner('c2@t.ph'), 'o@t.ph');
});

test('an owner can decline; an owner applying to drive their own vehicles skips the owner step', async () => {
  const t = await setup();
  await t.act('c2@t.ph', 'apply', form({ employer: t.d.h.pkey('o@t.ph') }));
  const a = t.S.apps.find(x => x.user == 'c2@t.ph');
  assert.match((await t.act('o@t.ph', 'ownerAppDecide', { id: a.id, ok: false })).err, /why/);
  assert.ok((await t.act('o@t.ph', 'ownerAppDecide', { id: a.id, ok: false, note: 'No vehicle free for now' })).ok);
  assert.equal(a.st, 'Rejected');
  t.S.apps = t.S.apps.filter(x => x.user != 'o@t.ph');
  assert.ok((await t.act('o@t.ph', 'apply', form())).ok);
  assert.equal(t.S.apps.find(x => x.user == 'o@t.ph' && x.role == 'driver').st, 'Pending Review');
});

test('owners see only their own drivers and cannot assign another owner’s driver', async () => {
  const t = await setup();
  t.S.users.push({ name: 'Xavier Other', em: 'x@t.ph', pw: '', ph: '09170000009', roles: [{ t: 'driver', st: 'approved' }], ver: true, tv: 0, employer: 'zz@t.ph' });
  const v = t.d.view(t.me('o@t.ph'));
  assert.ok(!v.users.some(u => u.em == 'x@t.ph'), 'another owner’s driver is not visible');
  assert.match((await t.act('o@t.ph', 'reqAssign', { vehicle: 'V1', driver: 'x@t.ph', mode: 'assign' })).err, /another vehicle owner/);
  assert.ok(v.myDrivers.includes('d1@t.ph'), 'the driver of the owner’s van is theirs');
});

test('owners register helpers; a booking with helpers names them before departure; the customer is told', async () => {
  const t = await setup();
  assert.match((await t.act('c1@t.ph', 'ownerHelper', { act: 'add', name: 'Pedro Cruz', ph: '09171112222', idph: pic })).err, /vehicle owner/);
  assert.match((await t.act('o@t.ph', 'ownerHelper', { act: 'add', name: 'Pedro Cruz', ph: '0917', idph: pic })).err, /mobile/);
  assert.match((await t.act('o@t.ph', 'ownerHelper', { act: 'add', name: 'Pedro Cruz', ph: '09171112222' })).err, /ID/);
  assert.ok((await t.act('o@t.ph', 'ownerHelper', { act: 'add', name: 'Pedro Cruz', ph: '09171112222', idph: pic })).ok);
  assert.ok((await t.act('o@t.ph', 'ownerHelper', { act: 'add', name: 'Jose Ramos', ph: '09173334444', idph: pic })).ok);
  const crew = t.d.h.crewOf('o@t.ph');
  assert.ok(crew.some(c => c.name == 'Pedro Cruz') && crew.some(c => c.kind == 'Driver'), 'helpers and the owner’s drivers');
  const id = (await t.booking('c1@t.ph', { mv: 2 })).id;
  await t.act('d1@t.ph', 'accept', { id });
  const hp = crew.filter(c => c.kind == 'Helper').map(c => c.id);
  assert.match((await t.act('d1@t.ph', 'bookHelpers', { id, ids: [hp[0]] })).err, /needs 2 helpers/);
  assert.match((await t.act('c1@t.ph', 'bookHelpers', { id, ids: hp })).err, /Only the driver/);
  assert.ok((await t.act('d1@t.ph', 'bookHelpers', { id, ids: hp })).ok);
  assert.deepEqual(t.bk(id).helpers.map(x => x.name), ['Pedro Cruz', 'Jose Ramos']);
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /Pedro Cruz and Jose Ramos/.test(n.b)));
  assert.match((await t.act('o@t.ph', 'ownerHelper', { act: 'del', id: hp[0] })).err, /not finished/);
});
