'use strict';
/* Per-vehicle deposit, full payment before release, handover photos with the renter's confirmation,
   and deposit claims (accept, dispute → admin decision) with the final refund. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const PH = Object.fromEntries(
  ['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, 'data:image/jpeg;base64,PH' + k])
);

/* V2 offered at ₱2,000/day with an ₱8,000 deposit; C1 rents it for 2 days (₱4,000); contract signed on paper */
async function rented({ pay = true, release = true } = {}) {
  const t = await setup();
  assert.ok((await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000, dep: 8000 })).ok);
  const id = (
    await t.act('c1@t.ph', 'createRental', {
      veh: 'V2',
      s: future(20),
      e: future(21),
      pu: 'Tetuan, Zamboanga City',
      rt: 'Putik, Zamboanga City',
      lic: 'N01-23-456789',
      exp: future(400),
      ip: pic,
      lp: pic,
    })
  ).id;
  const rn = () => t.S.rn.find(x => x.id == id);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  await t.act('o@t.ph', 'rentalSign', { id, how: 'paper', photo: pic });
  const payAll = async amount => {
    await t.act('c1@t.ph', 'rentalPay', { id, amount, method: 'Cash' });
    for (const p of t.S.pay.filter(p => p.bid == id && p.status == 'Submitted'))
      await t.act('k@t.ph', 'payVerify', { id: p.id, ok: true });
  };
  if (pay) await payAll(12000);
  if (release)
    assert.ok(
      (await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH })).ok
    );
  const back = () =>
    t.act('o@t.ph', 'rentalDecision', {
      id,
      act: 'return',
      odo: 1200,
      fuel: 'Full',
      ph: PH,
      note: 'Dent on left door',
    });
  return { t, id, rn, payAll, back };
}

test('owners set the deposit per vehicle; the rental keeps the deposit it was requested with', async () => {
  const t = await setup();
  assert.match(
    (await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000, dep: 1000 })).err,
    /deposit between/
  );
  assert.match(
    (await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000, dep: 500000 })).err,
    /deposit between/
  );
  assert.ok((await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000 })).ok);
  assert.equal(t.S.vh.find(v => v.id == 'V2').rent.dep, 5000, 'default is the ₱5,000 minimum');
  const { rn, t: t2 } = await rented({ pay: false, release: false });
  assert.equal(rn().dep, 8000);
  assert.equal(rn().ct.terms.dep, 8000, 'the contract shows the vehicle deposit');
  await t2.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000, dep: 20000 });
  assert.equal(rn().dep, 8000, 'later changes do not touch an existing rental');
  assert.equal(t2.d.h.rentBal(rn()), 12000);
});

test('release needs the full rental fee and deposit verified, plus all six handover photos', async () => {
  const { t, id, payAll } = await rented({ pay: false, release: false });
  const rel = ph => t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph });
  await payAll(8000); // deposit only
  assert.match((await rel(PH)).err, /Full payment is not verified.*rental fee ₱0\.00 of ₱4,000\.00/);
  await payAll(4000);
  assert.match((await rel({ ...PH, fuel: '' })).err, /fuel gauge photo/);
  assert.match((await rel(undefined)).err, /front photo/);
  assert.ok((await rel(PH)).ok);
});

test('the renter confirms the handover record or reports a difference', async () => {
  const { t, id, rn, back } = await rented();
  assert.match((await t.act('c2@t.ph', 'rentalCheck', { id, stage: 'out', ok: true })).err, /not found/);
  assert.match(
    (await t.act('c1@t.ph', 'rentalCheck', { id, stage: 'back', ok: true })).err,
    /return has not been recorded/
  );
  assert.match((await t.act('c1@t.ph', 'rentalCheck', { id, stage: 'out', ok: false })).err, /Describe/);
  assert.ok(
    (await t.act('c1@t.ph', 'rentalCheck', { id, stage: 'out', ok: false, note: 'Fuel was 3/4, not full' }))
      .ok
  );
  assert.equal(rn().out.cu.note, 'Fuel was 3/4, not full');
  assert.match(
    (await t.act('c1@t.ph', 'rentalCheck', { id, stage: 'out', ok: true })).err,
    /already answered/
  );
  await back();
  assert.ok((await t.act('c1@t.ph', 'rentalCheck', { id, stage: 'back', ok: true })).ok);
  assert.ok(rn().back.ph.front && rn().back.cu.ok);
});

test('no claim: completing refunds the full deposit', async () => {
  const { t, id, rn, back } = await rented();
  await back();
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'complete' })).ok);
  assert.deepEqual([rn().settle.dep, rn().settle.kept, rn().settle.refund], [8000, 0, 8000]);
});

test('claim accepted by the renter: that amount is kept, the rest refunded', async () => {
  const { t, id, rn, back } = await rented();
  const claim = x =>
    t.act('o@t.ph', 'rentalClaim', { id, amt: 3500, reason: 'Repaint of left door dent', ph: [pic], ...x });
  assert.match((await claim()).err, /after the return/);
  await back();
  assert.match(
    (await t.act('c1@t.ph', 'rentalClaim', { id, amt: 1, reason: 'xxxxxxxxxxxx', ph: [pic] })).err,
    /Only the vehicle owner/
  );
  assert.match((await claim({ amt: 9000 })).err, /between ₱1 and the deposit/);
  assert.match((await claim({ reason: 'dent' })).err, /10\+ characters/);
  assert.match((await claim({ ph: [] })).err, /at least one photo/);
  assert.ok((await claim()).ok);
  assert.match((await claim()).err, /already made/);
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'complete' })).err, /claim is still open/);
  assert.ok((await t.act('c1@t.ph', 'rentalClaimReply', { id, act: 'accept' })).ok);
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'complete' })).ok);
  assert.deepEqual([rn().settle.kept, rn().settle.refund], [3500, 4500]);
});

test('claim disputed: an administrator decides the amount', async () => {
  const { t, id, rn, back } = await rented();
  await back();
  await t.act('o@t.ph', 'rentalClaim', { id, amt: 6000, reason: 'Left door replacement', ph: [pic] });
  assert.match(
    (await t.act('c1@t.ph', 'rentalClaimReply', { id, act: 'dispute', note: 'no' })).err,
    /10\+ characters/
  );
  assert.ok(
    (
      await t.act('c1@t.ph', 'rentalClaimReply', {
        id,
        act: 'dispute',
        note: 'The dent is in the release photos already',
      })
    ).ok
  );
  assert.ok(
    t.S.nt.some(n => n.to == 'a@t.ph' && /Disputed deposit claim/.test(JSON.stringify(n))),
    'admins are told'
  );
  assert.match(
    (await t.act('o@t.ph', 'rentalClaimDecide', { id, amt: 0, note: 'ok' })).err,
    /Only an administrator/
  );
  assert.match(
    (await t.act('a@t.ph', 'rentalClaimDecide', { id, amt: 7000, note: 'Too much' })).err,
    /between ₱0 and the claimed/
  );
  assert.ok(
    (
      await t.act('a@t.ph', 'rentalClaimDecide', {
        id,
        amt: 1500,
        note: 'Only the scratch is new; the dent is in the release photos',
      })
    ).ok
  );
  assert.match(
    (await t.act('a@t.ph', 'rentalClaimDecide', { id, amt: 0, note: 'again' })).err,
    /already settled/
  );
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'complete' })).ok);
  assert.deepEqual([rn().settle.kept, rn().settle.refund], [1500, 6500]);
});

test('claims close 3 days after the return', async () => {
  const { t, id, rn, back } = await rented();
  await back();
  rn().back.t = new Date(Date.now() - 4 * 864e5).toISOString();
  assert.match(
    (await t.act('o@t.ph', 'rentalClaim', { id, amt: 100, reason: 'Late cleaning fee', ph: [pic] })).err,
    /claim period/
  );
});
