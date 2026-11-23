'use strict';
/* Rental contract (issue, read, sign digitally or on paper) and the owner's live map of a rented vehicle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const sig = 'data:image/png;base64,SIGN';
const PH = Object.fromEntries(
  ['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, 'data:image/jpeg;base64,PH' + k])
);

/* an approved rental of V2 by C1 */
async function approved() {
  const t = await setup();
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000 });
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
  return { t, id, rn };
}
async function release(t, id) {
  await t.act('c1@t.ph', 'rentalPay', { id, amount: 9000, method: 'Cash' });
  for (const p of t.S.pay.filter(p => p.bid == id))
    await t.act('k@t.ph', 'payVerify', { id: p.id, ok: true });
  return t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH });
}

test('approval issues a frozen contract with a fingerprint; both parties can read it, others cannot', async () => {
  const { t, id, rn } = await approved();
  assert.match((await t.act('c1@t.ph', 'rentalContract', { id })).err, /issued when the owner approves/);
  assert.match((await t.act('c1@t.ph', 'rentalSign', { id })).err, /issued when the owner approves/);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  const ct = rn().ct;
  assert.equal(ct.terms.no, 'CT-' + id.slice(3));
  assert.equal(ct.terms.veh.plate, 'BBB 2222');
  assert.equal(ct.terms.renter.lic, 'N01-23-456789');
  assert.deepEqual([ct.terms.tot, ct.terms.dep, ct.terms.days], [4000, 5000, 2]);
  assert.ok(ct.terms.clauses.length >= 10);
  assert.match(ct.h, /^[0-9a-f]{64}$/);
  assert.ok((await t.act('c1@t.ph', 'rentalContract', { id })).ok);
  assert.ok((await t.act('a@t.ph', 'rentalContract', { id })).ok, 'admin may read');
  assert.match((await t.act('c2@t.ph', 'rentalContract', { id })).err, /not found/);
  assert.equal(t.d.view(t.me('c1@t.ph')).rn[0].ct.h, ct.h, 'the renter gets the digital copy');
  assert.ok(!t.d.view(t.me('c2@t.ph')).rn.length);
});

test('electronic signature needs agreement, the exact account name and a drawn signature', async () => {
  const { t, id, rn } = await approved();
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  const sign = (em, x) => t.act(em, 'rentalSign', { id, ...x });
  assert.match((await sign('c2@t.ph', { name: 'Oscar Other', sig, agree: true })).err, /Only the renter/);
  assert.match((await sign('c1@t.ph', { name: 'Carla Cust', sig })).err, /Tick the box/);
  assert.match(
    (await sign('c1@t.ph', { name: 'Carla', sig, agree: true })).err,
    /exactly as on your account/
  );
  assert.match(
    (await sign('c1@t.ph', { name: 'Carla Cust', sig: 'x', agree: true })).err,
    /Draw your signature/
  );
  const r1 = await sign('c1@t.ph', { name: '  carla   cust ', sig, agree: true });
  assert.ok(r1.ok && !r1.done, 'name check ignores case and spaces');
  assert.equal(rn().ct.sg.cu.h, rn().ct.h, 'signature records the fingerprint');
  assert.match((await sign('c1@t.ph', { name: 'Carla Cust', sig, agree: true })).err, /already signed/);
  assert.match((await release(t, id)).err, /not signed by both/);
  assert.ok((await sign('o@t.ph', { name: 'Olga Owner', sig, agree: true })).done);
  assert.ok(
    (await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH })).ok
  );
  assert.match(
    (await sign('o@t.ph', { name: 'Olga Owner', sig, agree: true })).err,
    /before the vehicle is released/
  );
  assert.deepEqual([rn().out.odo, rn().out.fuel], [1000, 'Full']);
});

test('the owner can record a signed printed copy instead', async () => {
  const { t, id, rn } = await approved();
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  assert.match(
    (await t.act('c1@t.ph', 'rentalSign', { id, how: 'paper', photo: pic })).err,
    /Only the owner/
  );
  assert.match((await t.act('o@t.ph', 'rentalSign', { id, how: 'paper' })).err, /photo of the signed page/);
  assert.ok((await t.act('o@t.ph', 'rentalSign', { id, how: 'paper', photo: pic })).done);
  assert.deepEqual([rn().ct.sg.cu.how, rn().ct.sg.ow.how], ['paper', 'paper']);
  assert.ok((await release(t, id)).ok);
});

test('owner map: only the renter shares, only while Active; leaving the city alerts the owner; cleared at return', async () => {
  const { t, id, rn } = await approved();
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  const ping = (em, lat, lng) => t.act(em, 'rentalPing', { id, lat, lng, acc: 12 });
  assert.match((await ping('c1@t.ph', 6.92, 122.07)).err, /rental in progress/);
  await t.act('o@t.ph', 'rentalSign', { id, how: 'paper', photo: pic });
  assert.ok((await release(t, id)).ok);
  assert.match((await ping('o@t.ph', 6.92, 122.07)).err, /not found/, 'the owner cannot fake positions');
  assert.ok((await ping('c1@t.ph', 6.92, 122.07)).ok);
  const ov = () => t.d.view(t.me('o@t.ph')).rn.find(r => r.id == id);
  assert.equal(ov().gps.lat, 6.92, 'owner sees the position');
  assert.ok(
    t.S.nt.some(n => n.to == 'o@t.ph' && /Location sharing started/.test(n.msg || n.b || JSON.stringify(n)))
  );
  rn().gps.ms -= 10000; // past the 4-second limit
  assert.ok((await ping('c1@t.ph', 7.8, 122.6)).ok);
  assert.equal(rn().gps.inArea, false);
  assert.ok(t.S.nt.some(n => n.to == 'o@t.ph' && /outside Zamboanga City/.test(JSON.stringify(n))));
  assert.equal(rn().trail.length, 2);
  assert.ok((await t.act('c1@t.ph', 'rentalGpsStop', { id })).ok);
  assert.ok(rn().gps.off);
  assert.match(
    (await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', odo: 900, fuel: 'Full', ph: PH })).err,
    /cannot be lower/
  );
  assert.ok(
    (await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', odo: 1180, fuel: '3/4', ph: PH })).ok
  );
  assert.ok(!rn().gps && !rn().trail, 'location history is deleted at return');
  assert.ok(!ov().gps);
});
