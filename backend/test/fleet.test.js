'use strict';
/* Rental units from registered vehicles, the owner's rental steps, driver profile photo/reviews and the Waze link. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const sig = 'data:image/png;base64,SIGN';
const PH = Object.fromEntries(
  ['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, 'data:image/jpeg;base64,PH' + k])
);

const signBoth = async (t, id) => {
  assert.ok((await t.act('c1@t.ph', 'rentalSign', { id, name: 'Carla Cust', sig, agree: true })).ok);
  assert.ok((await t.act('o@t.ph', 'rentalSign', { id, name: 'Olga Owner', sig, agree: true })).ok);
};
const rental = (t, em, x = {}) =>
  t.act(em, 'createRental', {
    veh: 'V2',
    s: future(10),
    e: future(11),
    pu: 'Tetuan, Zamboanga City',
    rt: 'Putik, Zamboanga City',
    lic: 'N01-23-456789',
    exp: future(400),
    ip: pic,
    lp: pic,
    ...x,
  });

test('owner offers a unit for rent; customer requests that unit; overlaps refused', async () => {
  const t = await setup();
  assert.match((await rental(t, 'c1@t.ph')).err, /available vehicle/, 'not offered yet');
  assert.match((await t.act('d1@t.ph', 'vehRent', { id: 'V2', on: true, day: 2500 })).err, /not found/);
  assert.match((await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 50 })).err, /daily rate/);
  assert.ok(
    (
      await t.act('o@t.ph', 'vehRent', {
        id: 'V2',
        on: true,
        day: 2500,
        seats: 3,
        trans: 'Manual',
        fuel: 'Diesel',
      })
    ).ok
  );
  assert.match((await rental(t, 'o@t.ph')).err, /your own vehicle/);
  const r = await rental(t, 'c1@t.ph');
  assert.ok(r.ok, r.err);
  const rn = t.S.rn.find(x => x.id == r.id);
  assert.deepEqual([rn.tot, rn.days, rn.owner, rn.vn], [5000, 2, 'o@t.ph', 'Mitsubishi L300']);
  assert.match((await rental(t, 'c2@t.ph', { s: future(11), e: future(12) })).err, /already reserved/);
  assert.ok((await rental(t, 'c2@t.ph', { s: future(12), e: future(12) })).ok, 'the next day is free');
  assert.match((await rental(t, 'c2@t.ph', { s: future(20), e: future(60) })).err, /30 days/);
  /* turning rentals off hides the unit */
  assert.ok((await t.act('o@t.ph', 'vehRent', { id: 'V2', on: false })).ok);
  assert.equal(t.d.view(null).rentList.length, 0);
});

test('rental lifecycle: approve, release after verified deposit, return, complete; hauling blocked on rented days', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000 });
  const id = (await rental(t, 'c1@t.ph', { s: future(30), e: future(30) })).id;
  const rn = () => t.S.rn.find(x => x.id == id);
  assert.match(
    (await t.act('c2@t.ph', 'rentalDecision', { id, act: 'approve' })).err,
    /owner or an administrator/
  );
  assert.match(
    (await t.act('o@t.ph', 'rentalDecision', { id, act: 'release' })).err,
    /Approve the request first/
  );
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'reject', note: '' })).err, /reason/);
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' })).ok);
  assert.equal(rn().st, 'Approved');
  /* V2's driver cannot take a haul on the rental day; V1's driver still can */
  const bk = (await t.booking('c2@t.ph', { dt: future(30) })).id;
  assert.match((await t.act('d2@t.ph', 'accept', { id: bk })).err, /not rented out/);
  assert.ok((await t.act('d1@t.ph', 'accept', { id: bk })).ok);
  assert.match(
    (await t.act('o@t.ph', 'rentalDecision', { id, act: 'release' })).err,
    /Full payment is not verified/
  );
  assert.ok((await t.act('c1@t.ph', 'rentalPay', { id, amount: 7000, method: 'Cash' })).ok);
  for (const p of t.S.pay.filter(p => p.bid == id))
    assert.ok((await t.act('k@t.ph', 'payVerify', { id: p.id, ok: true })).ok);
  assert.match(
    (await t.act('o@t.ph', 'rentalDecision', { id, act: 'release' })).err,
    /contract is not signed/
  );
  await signBoth(t, id);
  assert.match(
    (await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', fuel: 'Full' })).err,
    /odometer/
  );
  assert.ok(
    (await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 52000, fuel: 'Full', ph: PH })).ok
  );
  assert.match((await t.act('c1@t.ph', 'rentalCancel', { id })).err, /cannot be cancelled/);
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'complete' })).err, /Record the return/);
  assert.ok(
    (
      await t.act('o@t.ph', 'rentalDecision', {
        id,
        act: 'return',
        note: 'Clean, full tank',
        odo: 52140,
        fuel: 'Full',
        ph: PH,
      })
    ).ok
  );
  assert.ok((await t.act('a@t.ph', 'rentalDecision', { id, act: 'complete' })).ok, 'admin may also complete');
  assert.equal(rn().st, 'Completed');
  assert.equal(rn().cond, 'Clean, full tank');
});

test('approval re-checks clashes with a hauling trip booked on the vehicle meanwhile', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000 });
  const id = (await rental(t, 'c1@t.ph', { s: future(30), e: future(31) })).id;
  const bk = (await t.booking('c2@t.ph', { dt: future(31) })).id;
  assert.ok((await t.act('d2@t.ph', 'accept', { id: bk })).ok, 'pending rentals do not block hauling');
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' })).err, /hauling trip/);
});

test('catalogue hides the full plate and owner email; renter sees vehicle and owner contact after approval', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000 });
  const pub = t.d.view(null).rentList;
  assert.equal(pub.length, 1);
  assert.equal(pub[0].plate, 'BBB ••22');
  assert.equal(pub[0].owner, 'Olga');
  assert.ok(!JSON.stringify(pub).includes('o@t.ph'), 'no owner email in the catalogue');
  const id = (await rental(t, 'c1@t.ph', { s: future(12), e: future(13) })).id;
  assert.deepEqual(t.d.view(null).rentList[0].busy, [{ s: future(12), e: future(13) }]);
  const cv = () => t.d.view(t.me('c1@t.ph'));
  assert.ok(!cv().vh.some(v => v.id == 'V2'), 'pending: no full vehicle record');
  assert.ok(
    t.d.view(t.me('o@t.ph')).rn.some(r => r.id == id),
    'owner sees the request'
  );
  assert.ok(!t.d.view(t.me('c2@t.ph')).rn.length, 'other customers do not');
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  assert.equal(cv().vh.find(v => v.id == 'V2').plate, 'BBB 2222');
  assert.equal(cv().users.find(u => u.em == 'o@t.ph').ph, '09170000000');
});

test('driver profile photo and public reviews reach the customer; Waze link only from the assigned driver', async () => {
  const t = await setup();
  assert.match((await t.act('d1@t.ph', 'setPhoto', { photo: 'nope' })).err, /Choose a photo/);
  assert.ok((await t.act('d1@t.ph', 'setPhoto', { photo: 'data:image/jpeg;base64,BBBB' })).ok);
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  const d = () => t.d.view(t.me('c1@t.ph')).users.find(u => u.em == 'd1@t.ph');
  assert.equal(d().photo, 'data:image/jpeg;base64,BBBB');
  assert.deepEqual(d().revs, []);
  assert.match(
    (await t.act('d1@t.ph', 'wazeLink', { id, url: 'https://waze.com/ul?ll=1,2' })).err,
    /active trip/
  );
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  assert.match(
    (await t.act('d1@t.ph', 'wazeLink', { id, url: 'https://evil.example/waze.com' })).err,
    /Share drive/
  );
  assert.match((await t.act('d1@t.ph', 'wazeLink', { id, url: 'http://waze.com/ul' })).err, /Share drive/);
  assert.match(
    (await t.act('d2@t.ph', 'wazeLink', { id, url: 'https://waze.com/ul?ll=1,2' })).err,
    /not assigned/
  );
  assert.ok((await t.act('d1@t.ph', 'wazeLink', { id, url: 'https://www.waze.com/live-map?x=1' })).ok);
  assert.equal(t.d.view(t.me('c1@t.ph')).bk.find(b => b.id == id).wz, 'https://www.waze.com/live-map?x=1');
  assert.ok((await t.act('d1@t.ph', 'setPhoto', { photo: '' })).ok);
  assert.ok(!('photo' in d()));
});

test('rental-only types register with specs and can never be assigned to hauling', async () => {
  const t = await setup();
  const add = x =>
    t.act('o@t.ph', 'addVehicle', { ins: 'CTPL-778899', insExp: future(300), cpc: 'CPC-2024-0001', cpcExp: future(500), kg: 400, 
      type: 'sd',
      brand: 'Toyota',
      model: 'Vios',
      plate: 'CAR 1234',
      regExp: future(300),
      color: 'Silver',
      year: 2022,
      doc: pic,
      seats: 5,
      trans: 'Automatic',
      fuel: 'Gasoline',
      ...x,
    });
  const r = await add();
  assert.ok(r.ok, r.err);
  const v = t.S.vh.find(x => x.id == r.id);
  assert.deepEqual([v.seats, v.trans, v.fuel], [5, 'Automatic', 'Gasoline']);
  assert.match((await add({ plate: 'CAR 9999', seats: 99 })).err, /Seats/);
  await t.act('a@t.ph', 'vehicleDecision', { id: r.id, act: 'approve' });
  assert.match(
    (await t.act('o@t.ph', 'reqAssign', { vehicle: r.id, driver: 'd1@t.ph', mode: 'assign' })).err,
    /rental-only/
  );
});
