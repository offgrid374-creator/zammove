'use strict';
/* Interview guide: the interviewer records Pass / Concern / Fail and a note for each question.
   Orientation needs every question answered, a note on every Concern or Fail, and no Fail.
   The notes stay with the staff: the applicant never receives them. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');
const { IVQ } = require('../src/domain/constants');

const pic = 'data:image/jpeg;base64,AAAA';
const all = (r, n = '') => Object.fromEntries(IVQ.driver.map(q => [q.id, { r, n }]));

async function atInterview() {
  const t = await setup();
  const r = await t.act('c2@t.ph', 'apply', {
    roles: ['driver'], phone: '0917', address: 'Tetuan', license: 'N01-99-123456',
    licExp: future(500), clrExp: future(300), docs: { driver: [pic, pic, pic, pic] }, employer: t.d.h.pkey('o@t.ph'),
  });
  assert.ok(r.ok, r.err);
  const id = t.S.apps.find(a => a.user == 'c2@t.ph').id;
  assert.ok((await t.act('o@t.ph', 'ownerAppDecide', { id, ok: true })).ok, 'the owner approves the applicant first');
  const A = (act, x) => t.act('a@t.ph', 'appAction', { id, act, ...x });
  assert.ok((await A('verify')).ok);
  assert.ok((await A('interview', { when: '2026-12-01T10:00', where: 'ZamMove office' })).ok);
  return { t, id, A };
}

test('every role has its own question list, sent to the screens', async () => {
  const t = await setup();
  assert.ok(IVQ.driver.length >= 6 && IVQ.owner.length >= 5);
  for (const q of [...IVQ.driver, ...IVQ.owner]) assert.ok(q.id && q.q.includes('?') && q.short && q.hint, q.id);
  assert.deepEqual(t.d.view(t.me('a@t.ph')).rules.IVQ, IVQ);
});

test('orientation needs the interview recorded: every question answered', async () => {
  const { A } = await atInterview();
  assert.match((await A('orient')).err, /8 of 8 questions have no result/);
  const some = { exp: { r: 'pass', n: '5 years, L300' }, lic: { r: 'pass', n: '' } };
  assert.ok((await A('ivsave', { ans: some })).ok, 'a partial save keeps the notes so far');
  assert.match((await A('orient')).err, /6 of 8 questions/);
});

test('a Concern or Fail needs a note, and any Fail blocks orientation', async () => {
  const { t, id, A } = await atInterview();
  await A('ivsave', { ans: { ...all('pass'), rec: { r: 'concern', n: '' } } });
  assert.match((await A('orient')).err, /Pick the applicant’s answer or write a note for "driving record"/);
  await A('ivsave', { ans: { ...all('pass'), rec: { r: 'fail', n: 'Two accidents this year' } } });
  assert.match((await A('orient')).err, /failed 1 question \(driving record\)\. Reject the application/);
  await A('ivsave', { ans: { ...all('pass'), rec: { r: 'concern', n: 'One minor violation in 2024' } }, sum: 'Good candidate.' });
  assert.ok((await A('orient')).ok);
  const a = t.S.apps.find(x => x.id == id);
  assert.equal(a.st, 'For Orientation');
  assert.equal(a.ivr.by, 'a@t.ph');
  assert.equal(a.ivr.sum, 'Good candidate.');
  /* the record is closed once the applicant moved on */
  assert.match((await A('ivsave', { ans: all('pass') })).err, /only be recorded while the interview is scheduled/);
});

test('bad answers are ignored, and only an admin records the interview', async () => {
  const { t, id, A } = await atInterview();
  await A('ivsave', { ans: { exp: { r: 'great', n: 'x'.repeat(900) }, nope: { r: 'pass' } } });
  const ans = t.S.apps.find(x => x.id == id).ivr.ans;
  assert.deepEqual(Object.keys(ans), ['exp']);
  assert.equal(ans.exp.r, '');
  assert.equal(ans.exp.n.length, 400);
  assert.match((await t.act('c1@t.ph', 'appAction', { id, act: 'ivsave', ans: all('pass') })).err, /Administrator/);
});

test('the applicant never sees the interviewer’s notes', async () => {
  const { t, A } = await atInterview();
  await A('ivsave', { ans: all('pass', 'Seemed nervous'), sum: 'Private remark' });
  const mine = t.d.view(t.me('c2@t.ph')).apps[0];
  assert.equal(mine.st, 'Interview Scheduled');
  assert.equal(mine.ivr, undefined);
  assert.doesNotMatch(JSON.stringify(t.d.view(t.me('c2@t.ph'))), /Private remark|Seemed nervous/);
  assert.ok(t.d.view(t.me('a@t.ph')).apps.find(a => a.user == 'c2@t.ph').ivr);
});

test('preset answers: one tap records the answer and suggests the result; a picked answer explains a Concern', async () => {
  for (const q of [...IVQ.driver, ...IVQ.owner]) {
    assert.ok(q.opts.length >= 3, q.id + ' has preset answers');
    assert.ok(q.opts.every(o => o.id && o.t && ['pass', 'concern', 'fail'].includes(o.r)));
  }
  const { t, id, A } = await atInterview();
  const ans = { ...all('pass'), exp: { a: 'y5' }, rec: { a: 'minor', n: '' }, lic: { a: 'nope', n: 'Showed a photocopy only' } };
  assert.ok((await A('ivsave', { ans })).ok);
  const got = t.S.apps.find(x => x.id == id).ivr.ans;
  assert.deepEqual(got.exp, { r: 'pass', n: '', a: 'y5' }, 'the answer suggests Pass');
  assert.deepEqual(got.rec, { r: 'concern', n: '', a: 'minor' }, 'the answer suggests Concern');
  assert.equal(got.lic.a, undefined, 'an unknown answer is ignored; the note stays');
  assert.equal(got.lic.n, 'Showed a photocopy only');
  /* the interviewer can override the suggested result */
  await A('ivsave', { ans: { ...ans, rec: { a: 'minor', r: 'pass' }, lic: { r: 'pass', n: 'Showed a photocopy only' } } });
  assert.equal(t.S.apps.find(x => x.id == id).ivr.ans.rec.r, 'pass');
  /* a Concern explained by its picked answer needs no note */
  await A('ivsave', { ans: { ...ans, lic: { r: 'pass' } } });
  assert.ok((await A('orient')).ok);
});
