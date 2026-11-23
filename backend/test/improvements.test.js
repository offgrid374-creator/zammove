'use strict';
/* Rules added after the system review: driver money controls, owner payouts and rental income, price corrections,
   interrupted trips, late drivers, scheduled bookings, helpers, cargo size and recipients, legal documents,
   separation of duties, admin-editable rates, and codes that only reach the (simulated) phone or email. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, world, future } = require('./_setup');

const pic = 'data:image/jpeg;base64,AAAA';
const D = (t, id, n, p) => t.act('d1@t.ph', n, { id, ...p });

/* accept → at pickup → down payment → loaded → verified departure → delivered → final payment */
async function complete(t, id) {
  assert.ok((await D(t, id, 'accept')).ok);
  await D(t, id, 'step', { to: 'On the Way to Pickup' });
  await D(t, id, 'step', { to: 'Awaiting Down Payment' });
  assert.ok((await D(t, id, 'driverPay', { kind: 'down', g: 0, c: t.d.h.due(t.bk(id), 'down') })).ok);
  await D(t, id, 'step', { to: 'Items Loaded', note: 'Sofa and 3 boxes' });
  const pin = await t.act('c1@t.ph', 'vNewPin', { id });
  await D(t, id, 'vVerify', { input: pin.pin, kind: 'pin' });
  await D(t, id, 'vPlate', { input: 'AAA 1111' });
  await D(t, id, 'vSave', { count: 4, items: [true, true], frag: [] });
  await D(t, id, 'vDriverConfirm');
  await t.act('c1@t.ph', 'vCustomerConfirm', { id, reviewed: true });
  assert.ok((await D(t, id, 'vAuthorize')).ok);
  await D(t, id, 'step', { to: 'Arrived at Destination' });
  const dp = await t.act('c1@t.ph', 'dNewPin', { id });
  await D(t, id, 'dDeliver', { input: dp.pin, note: 'All delivered' });
  await D(t, id, 'step', { to: 'Awaiting Final Payment' });
  assert.ok((await D(t, id, 'driverPay', { kind: 'final', g: 0, c: t.d.h.due(t.bk(id), 'final') })).ok);
}

test('a driver who holds too much company money, or is overdue, cannot take new jobs', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await complete(t, id); // holds 1632 of company money
  assert.equal(t.d.h.cashHeld('d1@t.ph'), 1632);
  assert.ok((await t.act('a@t.ph', 'cfgCash', { cap: 1000 })).ok);
  const next = (await t.booking('c1@t.ph', { dt: future(31) })).id;
  assert.match((await D(t, next, 'accept')).err, /collected money on hand/);
  assert.ok((await t.act('a@t.ph', 'cfgCash', { cap: 5000 })).ok);
  /* overdue: the trip's week ended more than 3 days ago and nothing was remitted */
  t.bk(id).cd = '2026-01-07T02:00:00.000Z';
  assert.ok(t.d.h.overdue('d1@t.ph'));
  assert.match((await D(t, next, 'accept')).err, /overdue remittance/);
  /* remitting and the cashier verifying clears both */
  assert.ok((await t.act('d1@t.ph', 'remit', { week: t.d.h.wk(t.bk(id).cd), method: 'Cash', ref: 'OR-9' })).ok);
  await t.act('k@t.ph', 'remitVerify', { id: t.S.rem[0].id, recv: 1632 });
  assert.equal(t.d.h.cashHeld('d1@t.ph'), 0);
  assert.ok((await D(t, next, 'accept')).ok);
});

test('helpers (movers) are paid to the driver in full, capped per vehicle type', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph', { mv: 2 })).id;
  assert.deepEqual(t.bk(id).bd.slice(0, 3), [1800, 120, 1000]);
  await complete(t, id);
  const s = t.bk(id).split;
  /* fare 3066 = (1800 + 120 + 1000) + 5% fee 146; pool = 3066 - 146 - 1000 = 1920; driver 20% = 384 + 1000 helpers */
  assert.deepEqual([s.fare, s.fee, s.mov, s.pool, s.drv, s.own], [3066, 146, 1000, 1920, 1384, 1248]);
});

test('price correction: the driver proposes, the customer accepts or declines (free cancellation)', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await D(t, id, 'accept');
  assert.match((await D(t, id, 'requote', { dr: 'Vitali, Zamboanga City', reason: 'short' })).err, /10\+/);
  const r = await D(t, id, 'requote', { dr: 'Vitali, Zamboanga City', reason: 'The drop-off is actually in Vitali, not Putik.' });
  assert.ok(r.ok && r.tot > t.bk(id).tot, r.err);
  assert.match((await D(t, id, 'requote', { dr: 'Pasonanca Park, Zamboanga City', reason: 'Another correction here.' })).err, /already waiting/);
  assert.ok((await t.act('c1@t.ph', 'requoteAnswer', { id, accept: true })).ok);
  assert.equal(t.bk(id).tot, r.tot);
  assert.equal(t.bk(id).dr, 'Vitali, Zamboanga City');
  /* declining cancels at no charge */
  const t2 = await setup();
  const id2 = (await t2.booking('c1@t.ph')).id;
  await D(t2, id2, 'accept');
  await D(t2, id2, 'requote', { dr: 'Vitali, Zamboanga City', reason: 'The drop-off is actually in Vitali, not Putik.' });
  assert.ok((await t2.act('c1@t.ph', 'requoteAnswer', { id: id2, accept: false })).ok);
  assert.equal(t2.bk(id2).st, 'Cancelled');
  assert.ok(!t2.S.pay.some(p => p.bid == id2), 'no fee');
});

test('interrupted trip: reassign before money changes hands; otherwise close with a fair charge and refund', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await D(t, id, 'accept');
  await D(t, id, 'step', { to: 'On the Way to Pickup' });
  assert.ok((await D(t, id, 'tripProblem', { reason: 'Flat tire on the bridge, cannot continue.' })).ok);
  assert.equal(t.bk(id).st, 'Interrupted');
  assert.ok(t.S.nt.some(n => n.to == 'a@t.ph' && n.h == 'Trip interrupted'));
  t.S.dp['d2@t.ph'].avail = 'Available';
  t.S.bk.filter(b => b.drvUser == 'd2@t.ph').forEach(b => (b.st = 'Completed'));
  const re = await t.act('a@t.ph', 'tripResolve', { id, act: 'reassign', driver: 'd2@t.ph', reason: 'Second van takes over the job.' });
  assert.ok(re.ok, re.err);
  assert.deepEqual([t.bk(id).drvUser, t.bk(id).st], ['d2@t.ph', 'Accepted']);

  /* after the down payment: close it, charge part, refund the rest */
  const t2 = await setup();
  const id2 = (await t2.booking('c1@t.ph')).id;
  await D(t2, id2, 'accept');
  await D(t2, id2, 'step', { to: 'On the Way to Pickup' });
  await D(t2, id2, 'step', { to: 'Awaiting Down Payment' });
  await D(t2, id2, 'driverPay', { kind: 'down', g: 0, c: 1008 });
  await t2.act('a@t.ph', 'tripInterrupt', { id: id2, reason: 'Engine failure after loading the items.' });
  /* drivers can report a customer who will not pay */
  assert.ok((await t2.act('d1@t.ph', 'createIncident', { bid: id2, cat: 'Customer did not pay', sev: 'Medium', w: '2026-11-23T10:00', d: 'Customer refused to pay while the trip was stopped.' })).ok);
  assert.match((await t2.act('a@t.ph', 'tripResolve', { id: id2, act: 'reassign', driver: 'd2@t.ph', reason: 'Another van please.' })).err, /already collected/);
  assert.ok((await t2.act('a@t.ph', 'tripResolve', { id: id2, act: 'close', refund: 708, reason: 'Charged 300 for the work done.' })).ok);
  const b = t2.bk(id2);
  assert.deepEqual([b.st, b.charged], ['Cancelled', 300]);
  assert.ok(t2.S.pay.some(p => p.kind == 'refund' && p.amount == 708 && p.status == 'Due'));
  assert.equal(t2.d.h.dueFor(b), r2(1008 - b.split.drv), 'the driver remits what he collected minus his share of the charge');
  assert.ok((await t2.act('k@t.ph', 'refundPaid', { id: t2.S.pay.find(p => p.kind == 'refund').id, method: 'Cash' })).ok);
});
const r2 = x => Math.round(x * 100) / 100;

test('a late driver: the customer cancels free and the driver gets a strike (3 → admin review)', async () => {
  const t = await setup();
  for (let i = 0; i < 3; i++) {
    const id = (await t.booking('c1@t.ph', { dt: future(10 + i) })).id;
    await D(t, id, 'accept');
    t.bk(id).dt = new Date(Date.now() + 8 * 36e5 - 2 * 36e5).toISOString().slice(0, 10); // pickup was hours ago
    t.bk(id).tm = new Date(Date.now() + 8 * 36e5 - 2 * 36e5).toISOString().slice(11, 16);
    await D(t, id, 'step', { to: 'On the Way to Pickup' });
    const c = await t.act('c1@t.ph', 'cancelBooking', { id });
    assert.ok(c.ok && c.late && c.fee == 0, c.err);
  }
  assert.equal(t.me('d1@t.ph').strikes.length, 3);
  assert.ok(t.S.nt.some(n => n.to == 'a@t.ph' && n.h == 'Driver review needed'));
});

test('scheduled bookings wait for a driver until 2 hours before pickup', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id; // 30 days ahead
  t.bk(id).cr = new Date(Date.now() - 5 * 36e5).toISOString();
  await t.st.run(() => t.d.h.sweep());
  assert.equal(t.bk(id).st, 'Pending', 'still open days before pickup');
  const soon = new Date(Date.now() + 8 * 36e5 + 90 * 6e4).toISOString();
  Object.assign(t.bk(id), { dt: soon.slice(0, 10), tm: soon.slice(11, 16) });
  await t.st.run(() => t.d.h.sweep());
  assert.equal(t.bk(id).st, 'No driver found', 'within 2 hours of pickup: closed');
});

test('a recipient other than the customer gets the Delivery PIN by SMS', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph', { rn: 'Lola Remy', rph: '09179998888' })).id;
  assert.deepEqual([t.bk(id).rn, t.bk(id).rph], ['Lola Remy', '09179998888']);
  t.bk(id).st = 'Arrived at Destination';
  t.bk(id).drvUser = 'd1@t.ph';
  t.bk(id).drv = 'Dina One';
  const r = await t.act('c1@t.ph', 'dNewPin', { id });
  assert.ok(t.S.nt.some(n => n.sim == 'SMS' && n.addr == '09179998888' && n.b.includes(r.pin)));
});

test('vehicles need the LTFRB franchise and insurance; expired ones block trips', async () => {
  const t = await setup();
  const v = { type: 'pk', brand: 'Toyota', model: 'Hilux', plate: 'LGL 1234', color: 'Gray', year: 2022, regExp: future(300), doc: pic };
  assert.match((await t.act('o@t.ph', 'addVehicle', v)).err, /CTPL insurance/);
  assert.match((await t.act('o@t.ph', 'addVehicle', { ...v, ins: 'CTPL-1', insExp: future(100) })).err, /LTFRB franchise/);
  /* rental-only vehicles need insurance only */
  assert.ok((await t.act('o@t.ph', 'addVehicle', { ...v, type: 'sd', plate: 'SED 1234', ins: 'CTPL-2', insExp: future(100) })).ok);
  /* an expired franchise blocks accepting jobs with that vehicle */
  t.vh = t.S.vh.find(x => x.id == 'V1');
  t.vh.legal = { ins: 'X', insExp: future(100), cpc: 'CPC-1', cpcExp: future(-1) };
  const id = (await t.booking('c1@t.ph')).id;
  assert.match((await D(t, id, 'accept')).err, /registration are valid/);
  assert.ok((await t.act('o@t.ph', 'vehLegal', { id: 'V1', ins: 'CTPL-9', insExp: future(200), cpc: 'CPC-77777', cpcExp: future(400) })).ok);
  assert.ok((await D(t, id, 'accept')).ok);
});

test('nobody approves their own records', async () => {
  const w = world();
  w.users.find(u => u.em == 'a@t.ph').roles = [{ t: 'owner', st: 'approved' }];
  w.vh.push({ id: 'VA', owner: 'a@t.ph', type: 'l3', brand: 'X', model: 'Y', plate: 'ADM 1111', approval: 'Pending Approval', docs: [], hist: [] });
  w.apps = [{ id: 'AP1', user: 'a@t.ph', role: 'driver', st: 'Pending Review', info: {}, docs: [], hist: [] }];
  const t = await setup(w);
  assert.match((await t.act('a@t.ph', 'vehicleDecision', { id: 'VA', act: 'approve' })).err, /your own vehicle/);
  assert.match((await t.act('a@t.ph', 'appAction', { id: 'AP1', act: 'verify' })).err, /your own application/);
  assert.match((await t.act('a@t.ph', 'ownerPayout', { owner: 'a@t.ph', amount: 1, method: 'Cash' })).err, /yourself/);
});

test('Start QR code locks after 5 wrong tries, like the PIN', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await D(t, id, 'accept');
  await D(t, id, 'step', { to: 'On the Way to Pickup' });
  await D(t, id, 'step', { to: 'Awaiting Down Payment' });
  await D(t, id, 'driverPay', { kind: 'down', g: 0, c: 1008 });
  await D(t, id, 'step', { to: 'Items Loaded', note: 'Sofa and 3 boxes' });
  await t.act('c1@t.ph', 'vNewPin', { id });
  for (let i = 0; i < 4; i++) await D(t, id, 'vVerify', { input: 'ZM1.' + id + '.bad', kind: 'qr' });
  assert.match((await D(t, id, 'vVerify', { input: 'ZM1.' + id + '.bad', kind: 'qr' })).err, /Locked/);
});

test('verification: limited attempts, a new code by (simulated) SMS', async () => {
  const t = await setup();
  const u = t.me('c2@t.ph');
  Object.assign(u, { ver: false, code: '123456', codeT: Date.now() - 2 * 6e4 });
  for (let i = 0; i < 5; i++) await t.act('c2@t.ph', 'verifyAccount', { code: '000000' });
  assert.match((await t.act('c2@t.ph', 'verifyAccount', { code: '123456' })).err, /Too many wrong codes/);
  assert.ok((await t.act('c2@t.ph', 'resendCode')).ok);
  assert.match((await t.act('c2@t.ph', 'resendCode')).err, /Wait a minute/);
  const code = t.S.nt.find(n => n.sim == 'SMS' && n.to == 'c2@t.ph').b.match(/\d{6}/)[0];
  assert.ok((await t.act('c2@t.ph', 'verifyAccount', { code })).ok);
});

test('administrators set the fares; new bookings use them', async () => {
  const t = await setup();
  const rates = Object.fromEntries(['tw', 'pk', 'l3', 'cv', 'w6'].map(id => [id, { base: 1000, km: 10 }]));
  assert.match((await t.act('k@t.ph', 'cfgRates', { rates })).err, /administrator/);
  assert.match((await t.act('a@t.ph', 'cfgRates', { rates: { ...rates, l3: { base: 5, km: 10 } } })).err, /base fare/);
  assert.ok((await t.act('a@t.ph', 'cfgRates', { rates })).ok);
  const id = (await t.booking('c1@t.ph')).id;
  assert.equal(t.bk(id).tot, 1092, '1000 + 4 km x 10 = 1040, + 5% = 1092');
});

test('rentals: late return is charged, the owner gets 85% and the deposit refund is recorded', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000, dep: 8000 });
  const id = (await t.act('c1@t.ph', 'createRental', { veh: 'V2', s: future(2), e: future(3), pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City', lic: 'N01-23-456789', exp: future(400), ip: pic, lp: pic })).id;
  const rn = () => t.S.rn.find(x => x.id == id);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve' });
  await t.act('o@t.ph', 'rentalSign', { id, how: 'paper', photo: pic });
  const payAll = async () => {
    await t.act('c1@t.ph', 'rentalPay', { id, amount: t.d.h.rentBal(rn()), method: 'Cash' });
    for (const p of t.S.pay.filter(p => p.bid == id && p.status == 'Submitted')) await t.act('k@t.ph', 'payVerify', { id: p.id, ok: true });
  };
  await payAll();
  const ph = Object.fromEntries(require('../src/domain/constants').HANDOVER_PH.map(([k]) => [k, pic]));
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph })).ok);
  rn().e = future(-2); // it should have come back two days ago
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'return', odo: 1200, fuel: 'Full', ph })).ok);
  assert.ok(rn().late && rn().late.amt == rn().late.days * 2000, 'late charge at the daily rate');
  assert.match((await t.act('o@t.ph', 'rentalDecision', { id, act: 'complete' })).err, /not fully verified/);
  await payAll();
  assert.ok((await t.act('o@t.ph', 'rentalDecision', { id, act: 'complete' })).ok);
  const fee = 4000 + rn().late.amt;
  assert.deepEqual([rn().split.fee, rn().split.own], [fee, fee * 0.85]);
  assert.equal(t.d.h.ownerBal('o@t.ph').earnedRent, fee * 0.85);
  assert.ok(t.S.pay.some(p => p.kind == 'deposit_refund' && p.amount == 8000 && p.status == 'Due'));
});
