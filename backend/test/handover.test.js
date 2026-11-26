'use strict';
/* Rental pickup and return checked like a booking: chosen times, both phones' locations, the renter's code,
   the plate, the owner's record confirmed by the renter, and the Return code as proof the owner received it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const PH = Object.fromEntries(['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, 'data:image/jpeg;base64,PH' + k]));
const TETUAN = { lat: 6.9194, lng: 122.084, acc: 20 }; // the pickup point
const FAR = { lat: 6.95, lng: 122.12, acc: 20 }; // about 5 km away

/* a paid, signed rental of V2 by C1 whose pickup is in an hour */
async function ready(x = {}) {
  const t = await setup();
  t.hv = true;
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000, drv: x.drv || '' });
  const req = await t.act('c1@t.ph', 'createRental', {
    veh: 'V2', s: future(20), e: future(21), pt: '09:30', rtm: '17:00', pu: 'Tetuan, Zamboanga City', rt: 'Tetuan, Zamboanga City',
    lic: 'N01-23-456789', exp: future(400), ip: pic, lp: pic, withDrv: !!x.drv,
  });
  assert.ok(req.ok, req.err);
  const id = req.id,
    rn = () => t.S.rn.find(r => r.id == id);
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve', ...(x.drv ? { driver: 'd2@t.ph' } : {}) })).ok);
  await t.act('o@t.ph', 'rentalSign', { id, how: 'paper', photo: pic });
  await t.act('c1@t.ph', 'rentalPay', { id, amount: t.d.h.rentBal(rn()), method: 'Cash' });
  for (const p of t.S.pay.filter(p => p.bid == id && p.status == 'Submitted')) await t.act('k@t.ph', 'payVerify', { id: p.id, ok: true });
  return { t, id, rn };
}
const soon = t => (t.d.h.rnPickupMs = () => Date.now() + 36e5); // pretend the pickup is an hour away

test('renters choose pickup and return times; the times are checked and go into the contract and late charge', async () => {
  const t = await setup();
  t.hv = true;
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000 });
  const base = { veh: 'V2', s: future(20), e: future(20), pu: 'Tetuan, Zamboanga City', rt: 'Tetuan, Zamboanga City', lic: 'N01-23-456789', exp: future(400), ip: pic, lp: pic };
  assert.match((await t.act('c1@t.ph', 'createRental', { ...base, pt: '05:00', rtm: '10:00' })).err, /between 6:00 AM and 8:00 PM/);
  assert.match((await t.act('c1@t.ph', 'createRental', { ...base, pt: '09:15', rtm: '10:00' })).err, /every 30 minutes/);
  assert.match((await t.act('c1@t.ph', 'createRental', { ...base, pt: '14:00', rtm: '10:00' })).err, /after the pickup time/);
  const r = await t.act('c1@t.ph', 'createRental', { ...base, pt: '07:30', rtm: '19:00' });
  assert.ok(r.ok, r.err);
  const rn = t.S.rn.find(x => x.id == r.id);
  assert.equal(rn.pt, '07:30');
  assert.equal(rn.rtm, '19:00');
  assert.equal(rn.hv, 1);
  await t.act('o@t.ph', 'rentalDecision', { id: r.id, act: 'approve' });
  assert.equal(rn.ct.terms.pt, '07:30');
  assert.equal(rn.ct.terms.rtm, '19:00');
  assert.ok(!rn.ct.terms.clauses.some(c => /8:00 AM/.test(c.x)), 'no fixed 8 AM in the contract');
});

test('self-drive pickup: location, Release code, plate, owner record, renter confirms — then Active', async () => {
  const { t, id, rn } = await ready();
  /* too early: the check opens 12 hours before pickup */
  assert.match((await t.act('c1@t.ph', 'hoIssue', { id })).err, /opens 12 hours before/);
  soon(t);
  /* the old one-press release no longer works without the code */
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH })).err, /Release code first/);
  assert.match((await t.act('o@t.ph', 'hoVerify', { id, input: '123456' })).err, /not opened their code/);
  const code = await t.act('c1@t.ph', 'hoIssue', { id });
  assert.match(code.pin, /^\d{6}$/);
  assert.equal(code.qr, `ZMR1.${id}.out.${code.pin}`);
  assert.ok(t.S.nt.some(n => n.sim && n.b.includes(code.pin)), 'the code is also sent by SMS/email (simulated)');
  /* only the owner side checks it; a wrong code counts */
  assert.match((await t.act('c2@t.ph', 'hoVerify', { id, input: code.pin })).err, /Only the vehicle owner/);
  assert.match((await t.act('o@t.ph', 'hoVerify', { id, input: code.pin == '111111' ? '222222' : '111111' })).err, /not correct/);
  assert.match((await t.act('c1@t.ph', 'hoPlate', { id, plate: 'BBB 2222' })).err, /Release code to the owner first/);
  assert.ok((await t.act('o@t.ph', 'hoVerify', { id, input: code.qr, kind: 'qr' })).ok);
  /* plate: a different unit is refused, the right one (any spacing/case) accepted */
  assert.match((await t.act('c1@t.ph', 'hoPlate', { id, plate: 'AAA 1111' })).err, /does not match/);
  assert.ok((await t.act('c1@t.ph', 'hoPlate', { id, plate: 'bbb2222' })).ok);
  /* locations: missing or far needs the owner's reason */
  const noLoc = await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH });
  assert.match(noLoc.err, /No location from the renter/);
  assert.ok((await t.act('c1@t.ph', 'hoLoc', { id, loc: TETUAN })).ok);
  assert.ok((await t.act('o@t.ph', 'hoLoc', { id, loc: FAR })).ok);
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH })).err, /owner is .* km from the pickup point/);
  assert.ok((await t.act('o@t.ph', 'hoLoc', { id, loc: TETUAN })).ok);
  /* the owner records; the rental waits for the renter */
  const rec = await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH, note: 'Small dent rear left' });
  assert.ok(rec.ok && rec.wait, rec.err);
  assert.equal(rn().st, 'Approved');
  assert.match((await t.act('c1@t.ph', 'hoConfirm', { id, ok: false })).err, /Describe what is different/);
  assert.ok((await t.act('c1@t.ph', 'hoConfirm', { id })).ok);
  assert.equal(rn().st, 'Active');
  assert.equal(rn().out.odo, 1000);
  assert.ok(rn().out.cu.ok);
});

test('a far location can be overridden with a reason, which is kept on the rental', async () => {
  const { t, id, rn } = await ready();
  soon(t);
  const code = await t.act('c1@t.ph', 'hoIssue', { id });
  await t.act('o@t.ph', 'hoVerify', { id, input: code.pin });
  await t.act('c1@t.ph', 'hoPlate', { id, plate: 'BBB 2222' });
  await t.act('c1@t.ph', 'hoLoc', { id, loc: TETUAN });
  const r = await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH, far: 'My phone has no signal inside the garage' });
  assert.ok(r.ok, r.err);
  assert.match(rn().ho.out.far.why, /no signal/);
  assert.deepEqual(rn().ho.out.far.iss, ['No location from the owner']);
});

test('return: the owner needs the renter’s Return code, or a reason when the renter cannot show it', async () => {
  const { t, id, rn } = await ready();
  soon(t);
  const c = await t.act('c1@t.ph', 'hoIssue', { id });
  await t.act('o@t.ph', 'hoVerify', { id, input: c.pin });
  await t.act('c1@t.ph', 'hoPlate', { id, plate: 'BBB 2222' });
  for (const em of ['c1@t.ph', 'o@t.ph']) await t.act(em, 'hoLoc', { id, loc: TETUAN });
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH });
  await t.act('c1@t.ph', 'hoConfirm', { id });
  assert.ok((await t.act('c1@t.ph', 'rentalReturn', { id, odo: 1150, fuel: '3/4', ph: PH, note: 'Clean', loc: TETUAN })).ok);
  /* without the code */
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', match: true })).err, /Return code/);
  const back = await t.act('c1@t.ph', 'hoIssue', { id, stage: 'back' });
  assert.equal(back.qr.split('.')[2], 'back');
  /* a pickup QR does not work for the return */
  assert.match((await t.act('o@t.ph', 'hoVerify', { id, stage: 'back', input: c.qr, kind: 'qr' })).err, /different rental or step/);
  assert.ok((await t.act('o@t.ph', 'hoVerify', { id, stage: 'back', input: back.pin })).ok);
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /confirmed receiving the vehicle/.test(n.b)), 'the renter gets proof of return');
  for (const em of ['c1@t.ph', 'o@t.ph']) await t.act(em, 'hoLoc', { id, stage: 'back', loc: TETUAN });
  const done = await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', match: true });
  assert.ok(done.ok, done.err);
  assert.equal(rn().st, 'Returned');
});

test('return without the code: the owner explains and the renter is told', async () => {
  const { t, id, rn } = await ready();
  soon(t);
  const c = await t.act('c1@t.ph', 'hoIssue', { id });
  await t.act('o@t.ph', 'hoVerify', { id, input: c.pin });
  await t.act('c1@t.ph', 'hoPlate', { id, plate: 'BBB 2222' });
  for (const em of ['c1@t.ph', 'o@t.ph']) await t.act(em, 'hoLoc', { id, loc: TETUAN });
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH });
  await t.act('c1@t.ph', 'hoConfirm', { id });
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', odo: 1200, fuel: 'Full', ph: PH, nocode: 'short' })).err, /at least 10/);
  const r = await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', odo: 1200, fuel: 'Full', ph: PH, nocode: 'Renter left the keys at the guard house' });
  assert.ok(r.ok, r.err);
  assert.equal(rn().st, 'Returned');
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /without your Return code/.test(n.b)));
});

test('with a driver: the driver scans the code, the renter confirms the plate, the driver starts and ends it', async () => {
  const { t, id, rn } = await ready({ drv: 800 });
  soon(t);
  assert.equal(rn().withDrv.em, 'd2@t.ph');
  const c = await t.act('c1@t.ph', 'hoIssue', { id });
  assert.match(t.S.nt.find(n => n.sim && n.b.includes(c.pin)).b, /Show it to the driver/);
  assert.ok((await t.act('d2@t.ph', 'hoVerify', { id, input: c.pin })).ok, 'the rental’s driver may check it');
  assert.match((await t.act('d1@t.ph', 'hoVerify', { id, input: c.pin })).err, /Only the owner or the rental’s driver/);
  await t.act('c1@t.ph', 'hoPlate', { id, plate: 'BBB 2222' });
  for (const em of ['c1@t.ph', 'd2@t.ph']) await t.act(em, 'hoLoc', { id, loc: TETUAN });
  const go = await t.act('d2@t.ph', 'rentalDecision', { id, act: 'release' });
  assert.ok(go.ok, go.err);
  assert.equal(rn().st, 'Active', 'no odometer/photo step for the renter');
  assert.match((await t.act('c1@t.ph', 'rentalReturn', { id, odo: 1, fuel: 'Full', ph: PH })).err, /driver brings the vehicle back/);
  const b = await t.act('c1@t.ph', 'hoIssue', { id, stage: 'back' });
  assert.ok((await t.act('d2@t.ph', 'hoVerify', { id, stage: 'back', input: b.pin })).ok);
  const done = await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', odo: 1300, fuel: 'Full', ph: PH });
  assert.ok(done.ok, done.err);
  assert.equal(rn().st, 'Returned');
});

test('handover codes are hidden from every browser view; the driver sees the rental they drive', async () => {
  const { t, id } = await ready({ drv: 800 });
  soon(t);
  const c = await t.act('c1@t.ph', 'hoIssue', { id });
  const views = require('../src/views')(t.S, t.d.h);
  for (const em of ['c1@t.ph', 'o@t.ph', 'd2@t.ph', 'a@t.ph']) {
    const v = views(t.me(em));
    const json = JSON.stringify(v.rn || []);
    assert.ok(!json.includes(c.pin) || !json.includes('"h":'), 'no code hash or PIN for ' + em);
    const r = (v.rn || []).find(x => x.id == id);
    assert.ok(r, em + ' sees the rental');
    assert.equal(r.ho.out.pin.h, undefined);
    assert.equal(r.ho.out.pin.s, undefined);
  }
});
