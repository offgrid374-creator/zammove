'use strict';
/* Vehicle load limits: each type has a max load and bed size, owners enter each vehicle's real limit,
   and a booking's estimated weight is checked when booking and again when a driver accepts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, world, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const reg = x => ({
  type: 'l3', brand: 'Mitsubishi', model: 'L300', plate: 'LDV 7788', color: 'White', year: 2022,
  regExp: future(300), doc: pic, ins: 'CTPL-778899', insExp: future(300), cpc: 'CPC-2024-0001', cpcExp: future(500),
  ...x,
});

test('every hauling type publishes its max load, bed size and what fits', async () => {
  const t = await setup();
  for (const v of t.d.view(t.me('c1@t.ph')).fleet.HV) {
    assert.ok(v.kg > 0, v.id + ' kg');
    assert.equal(v.bed.length, 3);
    assert.ok(v.fits.length > 10);
  }
});

test('an owner must enter the max load, within the type’s rating; bed size is optional', async () => {
  const t = await setup();
  assert.match((await t.act('o@t.ph', 'addVehicle', reg())).err, /maximum load in kg/);
  assert.match((await t.act('o@t.ph', 'addVehicle', reg({ kg: 3000 }))).err, /100 to 1,500/);
  assert.match((await t.act('o@t.ph', 'addVehicle', reg({ kg: 1200, bedL: 40, bedW: 5 }))).err, /cargo bed/);
  assert.ok((await t.act('o@t.ph', 'addVehicle', reg({ kg: 1200, bedL: 9.5, bedW: 5, bedH: 5 }))).ok);
  const v = t.S.vh.find(x => x.plate == 'LDV 7788');
  assert.equal(v.kg, 1200);
  assert.deepEqual(v.bed, [9.5, 5, 5]);
  assert.match(v.cap, /1,200 kg · 9\.5 × 5 × 5 ft bed/);
  /* rental-only vehicles need no load */
  assert.ok((await t.act('o@t.ph', 'addVehicle', reg({ type: 'sd', plate: 'SED 4455', cpc: '', cpcExp: '' }))).ok);
});

test('a booking heavier than the vehicle type can carry is refused, with the type that fits', async () => {
  const t = await setup();
  const r = await t.booking('c1@t.ph', { wt: 2000 }); // L300: 1,500 kg
  assert.match(r.err, /2,000 kg is more than a L300 Van can carry \(1,500 kg\)\. Choose a Closed Van or bigger/);
  assert.match((await t.booking('c1@t.ph', { wt: 50000 })).err, /1 to 20,000/);
  const ok = await t.booking('c1@t.ph', { wt: 900 });
  assert.ok(ok.ok, ok.err);
  assert.equal(t.bk(ok.id).wt, 900);
  assert.ok((await t.booking('c1@t.ph', { dt: future(33) })).ok, 'weight is optional');
});

test('a driver whose vehicle is rated below the load cannot accept it', async () => {
  const w = world();
  w.vh[0].kg = 800; // V1 (driver 1) is limited to 800 kg; V2 keeps the L300 rating
  const t = await setup(w);
  const id = (await t.booking('c1@t.ph', { wt: 1000 })).id;
  assert.match((await t.act('d1@t.ph', 'accept', { id })).err, /can carry this load \(about 1,000 kg\)/);
  assert.ok((await t.act('d2@t.ph', 'accept', { id })).ok);
});

test('bookings count only vehicles strong enough for the weight', async () => {
  const w = world();
  w.vh.forEach(v => (v.kg = 800));
  const t = await setup(w);
  assert.match((await t.booking('c1@t.ph', { wt: 1000 })).err, /No vehicle of this type is free/);
  assert.ok((await t.booking('c1@t.ph', { wt: 700 })).ok);
});

test('an owner can correct the specs, but not below a booked load', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph', { wt: 1200 })).id;
  await t.act('d1@t.ph', 'accept', { id }); // on V1
  assert.match((await t.act('o@t.ph', 'vehSpecs', { id: 'V1', kg: 1000 })).err, /needs about 1,200 kg/);
  assert.ok((await t.act('o@t.ph', 'vehSpecs', { id: 'V2', kg: 1000, bedL: 10, bedW: 5.5, bedH: 0 })).ok);
  assert.match(t.S.vh.find(v => v.id == 'V2').cap, /1,000 kg · 10 × 5\.5 ft open bed/);
  assert.match((await t.act('d1@t.ph', 'vehSpecs', { id: 'V2', kg: 900 })).err, /not found/);
});
