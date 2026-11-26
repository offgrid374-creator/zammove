'use strict';
/* Admin catalog (brands → models, fuels incl. Hybrid, colours), fuel price with owner requests, booking preferences. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

test('admin manages brands and models; hidden entries stay on vehicles, used ones cannot be deleted', async () => {
  const t = await setup();
  const A = x => t.act('a@t.ph', 'catEdit', x);
  assert.match((await t.act('c1@t.ph', 'catEdit', { kind: 'brand', act: 'add', n: 'Kia' })).err, /Only an administrator/);
  assert.ok((await A({ kind: 'brand', act: 'add', n: 'Kia' })).ok);
  assert.match((await A({ kind: 'brand', act: 'add', n: 'kia' })).err, /already/);
  assert.ok((await A({ kind: 'model', act: 'add', brand: 'Kia', n: 'K2500', type: 'pk', seats: 3, fuel: 'Diesel' })).ok);
  const kia = t.S.cfg.cat.brands.find(b => b.n == 'Kia');
  assert.equal(kia.models[0].n, 'K2500');
  assert.ok((await A({ kind: 'model', act: 'off', brand: 'Kia', id: kia.models[0].id })).ok);
  assert.ok(kia.models[0].off);
  /* Mitsubishi is used by the test vans: hide, not delete */
  assert.match((await A({ kind: 'brand', act: 'del', id: 'mitsubishi' })).err, /Hide it instead/);
  assert.ok((await A({ kind: 'brand', act: 'del', id: 'kia' })).ok);
  /* hybrid is a fuel; renaming a colour renames it on vehicles */
  assert.ok(t.S.cfg.cat.fuels.some(f => f.n == 'Hybrid'));
  t.S.vh[0].color = 'White';
  assert.ok((await A({ kind: 'color', act: 'edit', id: 'White', n: 'Pearl White' })).ok);
  assert.equal(t.S.vh[0].color, 'Pearl White');
});

test('vehicle registration takes brand and model from the catalog, or asks for a new entry', async () => {
  const t = await setup();
  const pic = 'data:image/jpeg;base64,AAAA';
  const base = { type: 'sd', plate: 'NEW 1234', color: 'White', year: 2023, regExp: future(300), doc: pic, ins: 'CTPL-1', insExp: future(300), insDoc: pic, seats: 5, trans: 'Automatic', fuel: 'Hybrid' };
  assert.match((await t.act('o@t.ph', 'addVehicle', { ...base, brand: 'Tesla', model: 'Model 3' })).err, /Choose the brand from the list/);
  assert.match((await t.act('o@t.ph', 'addVehicle', { ...base, brand: 'Toyota', model: 'Supra' })).err, /Toyota model from the list/);
  const ok1 = await t.act('o@t.ph', 'addVehicle', { ...base, brand: 'Toyota', model: 'Corolla Cross Hybrid' });
  assert.ok(ok1.ok, ok1.err);
  assert.equal(t.S.vh.find(v => v.id == ok1.id).fuel, 'Hybrid');
  const ok2 = await t.act('o@t.ph', 'addVehicle', { ...base, plate: 'NEW 5678', brand: 'Tesla', model: 'Model 3', catReq: true, fuel: 'Electric' });
  assert.ok(ok2.ok, ok2.err);
  assert.deepEqual(t.S.vh.find(v => v.id == ok2.id).catReq, { brand: 'Tesla', model: 'Model 3' });
});

test('fuel price scales the per-km rate; owners request changes and an admin decides', async () => {
  const t = await setup();
  const km0 = t.d.h.rateOf('l3').km;
  assert.ok((await t.act('a@t.ph', 'fuelSet', { price: 72, why: 'DOE update' })).ok);
  assert.equal(t.d.h.rateOf('l3').km, Math.round(km0 * 1.2 * 100) / 100);
  assert.match((await t.act('c1@t.ph', 'fuelRequest', { price: 80, why: 'pump price went up' })).err, /vehicle owner/);
  assert.match((await t.act('o@t.ph', 'fuelRequest', { price: 80, why: 'up' })).err, /at least 10/);
  assert.ok((await t.act('o@t.ph', 'fuelRequest', { price: 78, why: 'Diesel is 78 at the Tetuan station' })).ok);
  assert.match((await t.act('o@t.ph', 'fuelRequest', { price: 79, why: 'Diesel is 79 at the Tetuan station' })).err, /already have a request/);
  const rq = t.S.cfg.fuelReqs[0];
  assert.match((await t.act('a@t.ph', 'fuelDecide', { id: rq.id, ok: false })).err, /reason/);
  assert.ok((await t.act('a@t.ph', 'fuelDecide', { id: rq.id, ok: true })).ok);
  assert.equal(t.S.cfg.fuel.price, 78);
  assert.ok(t.S.nt.some(n => n.to == 'o@t.ph' && /now ₱78/.test(n.b)));
});

test('booking preferences: only matching vehicles get the job; impossible preferences are refused', async () => {
  const t = await setup();
  t.S.vh.forEach(v => Object.assign(v, { color: 'White', seats: 3, fuel: 'Diesel' }));
  t.S.vh.find(v => v.id == 'V2').color = 'Red';
  const none = await t.booking('c1@t.ph', { pref: { color: 'Purple' } });
  assert.match(none.err, /matches your preferences/);
  const r = await t.booking('c1@t.ph', { pref: { color: 'Red' } });
  assert.ok(r.ok, r.err);
  assert.equal(t.bk(r.id).pref.color, 'Red');
  assert.match((await t.act('d1@t.ph', 'accept', { id: r.id })).err, /preferences/);
  assert.ok((await t.act('d2@t.ph', 'accept', { id: r.id })).ok, 'the driver of the red van can take it');
});
