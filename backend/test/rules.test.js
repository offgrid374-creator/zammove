'use strict';
/* Business-rule tests: the acceptance checks of fix-plan Phases 1-5, now enforced by the server. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');

async function toItemsLoaded(t, id, drv = 'd1@t.ph') {
  assert.ok((await t.act(drv, 'accept', { id })).ok);
  assert.ok((await t.act(drv, 'step', { id, to: 'On the Way to Pickup' })).ok);
  assert.ok((await t.act(drv, 'step', { id, to: 'Awaiting Down Payment' })).ok);
  const b = t.bk(id);
  assert.ok((await t.act(drv, 'driverPay', { id, kind: 'down', g: 0, c: t.d.h.due(b, 'down') })).ok);
  assert.ok((await t.act(drv, 'step', { id, to: 'Items Loaded', note: 'Sofa and 3 boxes' })).ok);
}
async function toInTransit(t, id) {
  await toItemsLoaded(t, id);
  const pin = await t.act('c1@t.ph', 'vNewPin', { id });
  assert.ok((await t.act('d1@t.ph', 'vVerify', { id, input: pin.pin, kind: 'pin' })).ok);
  assert.ok((await t.act('d1@t.ph', 'vPlate', { id, input: 'aaa-1111' })).ok);
  assert.ok((await t.act('d1@t.ph', 'vSave', { id, count: 4, items: [true, true], frag: [] })).ok);
  assert.ok((await t.act('d1@t.ph', 'vDriverConfirm', { id })).ok);
  assert.ok((await t.act('c1@t.ph', 'vCustomerConfirm', { id, reviewed: true })).ok);
  assert.ok((await t.act('d1@t.ph', 'vAuthorize', { id })).ok);
}

test('pricing and capacity are decided by the server per vehicle, not per type', async () => {
  const t = await setup();
  const a = await t.booking('c1@t.ph');
  assert.ok(a.ok, a.err);
  assert.equal(t.bk(a.id).km, 4); // Tetuan → Putik with OpenStreetMap coordinates (straight line × 1.3)
  assert.equal(t.bk(a.id).tot, 2016); // 1800 + 4x30 = 1920, +5% = 2016
  assert.ok((await t.booking('c2@t.ph')).ok, 'second customer, same slot, second van');
  const third = await t.booking('c1@t.ph', { tm: '10:00' });
  assert.match(third.err, /No vehicle of this type is free/);
  assert.ok((await t.booking('c1@t.ph', { tm: '15:00' })).ok, 'non-overlapping time later that day');
  assert.match((await t.booking('c1@t.ph', { dc: 'NOPE' })).err, /Invalid discount/);
  assert.match((await t.booking('c1@t.ph', { dt: '2020-01-01' })).err, /at least 30 minutes from now/);
  assert.match((await t.booking('c1@t.ph', { dt: future(120) })).err, /90 days ahead/);
  assert.match((await t.booking('c1@t.ph', { sz: 'XL' })).err, /too small/);
  assert.match((await t.booking('c1@t.ph', { mv: 4 })).err, /at most 3 helpers/);
  assert.match((await t.booking('c1@t.ph', { rn: 'Lola', rph: '123' })).err, /recipient/);
  t.me('c2@t.ph').ver = false;
  assert.match((await t.booking('c2@t.ph', { dt: future(40) })).err, /Verify your account/);
});

test('driver eligibility: future non-overlapping work allowed, overlap and own bookings refused', async () => {
  const t = await setup();
  const a = (await t.booking('c1@t.ph')).id,
    later = (await t.booking('c2@t.ph', { dt: future(35) })).id,
    ovl = (await t.booking('c2@t.ph', { tm: '10:00' })).id;
  assert.ok((await t.act('d1@t.ph', 'accept', { id: a })).ok);
  assert.ok((await t.act('d1@t.ph', 'accept', { id: later })).ok, 'future booking');
  assert.match((await t.act('d1@t.ph', 'accept', { id: ovl })).err, /Requirement not met/);
  const own = (await t.booking('d2@t.ph', { dt: future(50) })).id;
  assert.match((await t.act('d2@t.ph', 'accept', { id: own })).err, /own booking/);
  assert.match(
    (await t.act('c1@t.ph', 'accept', { id: ovl })).err,
    /Requirement not met: Your driver account/
  );
});

test('full trip: Start PIN, plate, checklist, confirmations, Delivery PIN, payments; impostors refused', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await toItemsLoaded(t, id);
  const pin = await t.act('c1@t.ph', 'vNewPin', { id });
  assert.match(pin.pin, /^\d{6}$/);
  assert.equal((await t.act('d1@t.ph', 'vNewPin', { id })).ok, false, 'driver cannot issue the customer PIN');
  assert.equal(
    (await t.act('c1@t.ph', 'vVerify', { id, input: pin.pin })).ok,
    false,
    'customer cannot verify as driver'
  );
  assert.equal((await t.act('c1@t.ph', 'vException', { id, reason: 'I am totally an admin' })).ok, false);
  assert.match(
    (await t.act('d1@t.ph', 'vVerify', { id, input: '000001' })).err +
      (await t.act('d1@t.ph', 'vVerify', { id, input: pin.pin == '123456' ? '654321' : '123456' })).err,
    /not correct/
  );
  assert.ok((await t.act('d1@t.ph', 'vVerify', { id, input: pin.pin })).ok);
  assert.match((await t.act('d1@t.ph', 'vPlate', { id, input: 'ZZZ 9999' })).err, /mismatch/);
  assert.ok((await t.act('d1@t.ph', 'vPlate', { id, input: 'AAA1111' })).ok);
  assert.ok((await t.act('d1@t.ph', 'vSave', { id, count: 4, items: [true, true], frag: [] })).ok);
  assert.ok((await t.act('d1@t.ph', 'vDriverConfirm', { id })).ok);
  assert.match((await t.act('d1@t.ph', 'vAuthorize', { id })).err, /Customer confirmation/);
  assert.ok((await t.act('c1@t.ph', 'vCustomerConfirm', { id, reviewed: true })).ok);
  assert.match(
    (await t.act('d1@t.ph', 'vAuthorize', { id })).err,
    /unresolved cargo discrepancy/,
    'the plate mismatch blocks departure'
  );
  assert.equal(
    (await t.act('d1@t.ph', 'vResolve', { id, disc: 'DS-1', res: 'Typo on site' })).ok,
    false,
    'drivers cannot resolve'
  );
  assert.ok(
    (await t.act('a@t.ph', 'vResolve', { id, disc: 'DS-1', res: 'Driver mistyped, plate checked by phone' }))
      .ok
  );
  assert.ok((await t.act('d1@t.ph', 'vAuthorize', { id })).ok);
  assert.equal(t.bk(id).st, 'In Transit');
  assert.match((await t.act('d1@t.ph', 'step', { id, to: 'Delivery Confirmation' })).err, /Delivery PIN/);
  assert.ok((await t.act('d1@t.ph', 'step', { id, to: 'Arrived at Destination' })).ok);
  const dp = await t.act('c1@t.ph', 'dNewPin', { id });
  assert.match(
    (await t.act('d1@t.ph', 'dDeliver', { id, input: dp.pin, note: '' })).err,
    /delivery condition/
  );
  assert.match(
    (
      await t.act('d1@t.ph', 'dDeliver', {
        id,
        input: dp.pin == '000000' ? '111111' : '000000',
        note: 'All delivered',
      })
    ).err,
    /4 attempts left/
  );
  assert.ok((await t.act('d1@t.ph', 'dDeliver', { id, input: dp.pin, note: 'All delivered, no damage' })).ok);
  assert.equal(t.bk(id).pod.via, 'delivery PIN');
  assert.ok((await t.act('d1@t.ph', 'step', { id, to: 'Awaiting Final Payment' })).ok);
  assert.ok(
    (await t.act('d1@t.ph', 'driverPay', { id, kind: 'final', g: 0, c: t.d.h.due(t.bk(id), 'final') })).ok
  );
  assert.equal(t.bk(id).st, 'Completed');
  const order = t.bk(id).ev.map(e => require('../src/domain/constants').FLOW.indexOf(e.to));
  assert.ok(
    order.every((x, i) => i == 0 || x > order[i - 1]),
    'timeline only moves forward'
  );
  assert.ok((await t.act('c1@t.ph', 'review', { id, r: 5, t: 'Great' })).ok);
  assert.equal(t.d.h.ratings()['d1@t.ph'].avg, 5);
});

test('admin waiver of the Delivery PIN', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await toInTransit(t, id);
  await t.act('d1@t.ph', 'step', { id, to: 'Arrived at Destination' });
  assert.match((await t.act('a@t.ph', 'dWaive', { id, reason: 'short' })).err, /10 characters/);
  assert.ok((await t.act('a@t.ph', 'dWaive', { id, reason: 'Customer away, neighbour received it' })).ok);
  assert.ok((await t.act('d1@t.ph', 'dDeliver', { id, note: 'Left with neighbour' })).ok);
  assert.equal(t.bk(id).pod.via, 'admin waiver');
});

test('one payment model: customer proof confirmed by driver is counted once; refs cannot be reused', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  await t.act('d1@t.ph', 'step', { id, to: 'Awaiting Down Payment' });
  const half = t.d.h.due(t.bk(id), 'down');
  assert.ok(
    (await t.act('c1@t.ph', 'submitProof', { id, kind: 'down', amount: half, ref: '1234567890' })).ok
  );
  assert.equal(t.d.h.paySum(id, 'down'), 0, 'a submitted proof does not count');
  assert.ok((await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: half, c: 0, ref: '1234567890' })).ok);
  assert.equal(t.S.pay.filter(p => p.bid == id).length, 1);
  assert.equal(t.d.h.paySum(id, 'down'), half);
  const other = (await t.booking('c2@t.ph', { dt: future(36) })).id;
  await t.act('d2@t.ph', 'accept', { id: other });
  await t.act('d2@t.ph', 'step', { id: other, to: 'On the Way to Pickup' });
  await t.act('d2@t.ph', 'step', { id: other, to: 'Awaiting Down Payment' });
  assert.match(
    (
      await t.act('d2@t.ph', 'driverPay', {
        id: other,
        kind: 'down',
        g: t.d.h.due(t.bk(other), 'down'),
        c: 0,
        ref: '1234567890',
      })
    ).err,
    /another booking/
  );
});

test('rentals: deposit split, cashier verification, ownership', async () => {
  const t = await setup();
  const pic = 'data:image/jpeg;base64,AAAA';
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 1800 });
  const r = await t.act('c1@t.ph', 'createRental', {
    veh: 'V2',
    s: future(10),
    e: future(11),
    pu: 'Tetuan, Zamboanga City',
    rt: 'Putik, Zamboanga City',
    lic: 'N01-23-456789',
    exp: future(400),
    ip: pic,
    lp: pic,
  });
  assert.ok(r.ok, r.err);
  assert.match(
    (await t.act('c2@t.ph', 'rentalPay', { id: r.id, amount: 100, method: 'Cash' })).err,
    /not found/
  );
  assert.ok(
    (await t.act('c1@t.ph', 'rentalPay', { id: r.id, amount: 5500, method: 'GCash', ref: '5555555555' })).ok
  );
  const ps = t.S.pay.filter(p => p.bid == r.id);
  assert.deepEqual(
    ps.map(p => [p.kind, p.amount, p.status]),
    [
      ['deposit', 5000, 'Submitted'],
      ['rental', 500, 'Submitted'],
    ]
  );
  assert.equal(
    (await t.act('c1@t.ph', 'payVerify', { id: ps[0].id, ok: true })).ok,
    false,
    'customer cannot verify'
  );
  assert.ok((await t.act('k@t.ph', 'payVerify', { id: ps[0].id, ok: true })).ok);
  assert.match((await t.act('k@t.ph', 'payVerify', { id: ps[1].id, ok: false })).err, /reason/);
  assert.equal(t.d.h.paySum(r.id, 'deposit'), 5000);
});

test('cancellation fee, timeout to "No driver found", re-submit and admin assignment', async () => {
  const t = await setup();
  const a = (await t.booking('c1@t.ph')).id,
    b = (await t.booking('c2@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id: a });
  /* free while the driver has not left yet; 10% to the driver once he is on the way */
  await t.act('d1@t.ph', 'step', { id: a, to: 'On the Way to Pickup' });
  const c = await t.act('c1@t.ph', 'cancelBooking', { id: a });
  assert.equal(c.fee, Math.round(t.bk(a).tot * 10) / 100);
  const fee = t.S.pay.find(p => p.bid == a);
  assert.deepEqual([fee.kind, fee.status, fee.to], ['cancel_fee', 'Due', 'd1@t.ph']);
  assert.match((await t.booking('c1@t.ph', { dt: future(41) })).err, /Settle the/);
  assert.ok((await t.act('c1@t.ph', 'payCancelFee', { id: a, method: 'GCash', ref: '1234567890' })).ok);
  assert.ok((await t.act('k@t.ph', 'payVerify', { id: fee.id, ok: true })).ok);
  assert.equal(t.d.h.drvCredit('d1@t.ph'), fee.amount, 'credited to the driver');
  /* a scheduled booking stays open; one due soon times out after the waiting time */
  const soon = new Date(Date.now() + 8 * 36e5 + 90 * 6e4).toISOString();
  Object.assign(t.bk(b), { dt: soon.slice(0, 10), tm: soon.slice(11, 16) });
  assert.ok(t.S.nt.some(n => n.to == 'd1@t.ph' && n.h == 'Booking cancelled'));
  t.bk(b).cr = new Date(Date.now() - 40 * 6e4).toISOString();
  await t.st.run(() => t.d.h.sweep());
  assert.equal(t.bk(b).st, 'No driver found');
  assert.ok((await t.act('c2@t.ph', 'resubmit', { id: b })).ok);
  t.bk(b).cr = new Date(Date.now() - 40 * 6e4).toISOString();
  await t.st.run(() => t.d.h.sweep());
  assert.equal(
    (await t.act('d1@t.ph', 'adminAssign', { id: b, driver: 'd2@t.ph' })).ok,
    false,
    'drivers cannot assign'
  );
  assert.ok((await t.act('a@t.ph', 'adminAssign', { id: b, driver: 'd2@t.ph' })).ok);
  assert.equal(t.bk(b).drvUser, 'd2@t.ph');
  const free = (await t.booking('c2@t.ph', { dt: future(37) })).id;
  assert.equal((await t.act('c2@t.ph', 'cancelBooking', { id: free })).fee, 0);
});

test('remittances: blank amount rejected, centavos kept, shortfall rule', async () => {
  const t = await setup();
  t.S.rem.push({ id: 'RM1', drv: 'd1@t.ph', week: '2026-11-02', due: 1680.4, st: 'Submitted' });
  assert.match((await t.act('k@t.ph', 'remitVerify', { id: 'RM1', recv: '' })).err, /Enter the amount/);
  assert.equal((await t.act('d1@t.ph', 'remitVerify', { id: 'RM1', recv: 1 })).ok, false);
  assert.ok((await t.act('k@t.ph', 'remitVerify', { id: 'RM1', recv: '1600.40' })).ok);
  assert.equal(t.S.rem[0].diff, -80);
  assert.match(
    (await t.act('k@t.ph', 'remitResolve', { id: 'RM1', note: 'Paid part later', adj: 50 })).err,
    /shortfall of ₱30.00/
  );
  assert.equal(t.S.rem[0].recv, 1600.4, 'refused resolve changes nothing');
  assert.ok(
    (await t.act('a@t.ph', 'remitResolve', { id: 'RM1', note: 'Admin wrote off the rest', adj: 50 })).ok
  );
});

test('accounts: hashed passwords, lockout, reset, single owner setup, staff rules', async () => {
  const t = await setup();
  const run = (fn, p, x) => t.st.run(() => t.d.auth[fn](p, x));
  const sign = {
    name: 'New User',
    dob: '1990-02-02',
    ph: '09171234567',
    ad: 'Tetuan, Zamboanga City',
    em: 'NEW@t.ph',
    pw: 'Passw0rd1',
    terms: true,
  };
  assert.match((await run('signup', { ...sign, terms: false })).err, /Terms/);
  const s = await run('signup', sign);
  assert.ok(s.ok);
  assert.match(t.me('new@t.ph').pw, /^scrypt\$/);
  assert.ok((await run('login', { em: 'new@t.ph', pw: 'Passw0rd1' })).ok);
  for (let i = 0; i < 4; i++) await run('login', { em: 'new@t.ph', pw: 'bad' });
  assert.match((await run('login', { em: 'new@t.ph', pw: 'bad' })).err, /locked/);
  assert.match((await run('login', { em: 'new@t.ph', pw: 'Passw0rd1' })).err, /Too many/);
  /* verification and reset codes never reach the app: only the (simulated) phone and email inbox */
  assert.equal(t.d.view(t.me('new@t.ph')).users.find(u => u.em == 'new@t.ph').code, undefined);
  assert.ok(t.S.nt.some(n => n.sim == 'SMS' && n.addr == '09171234567' && n.b.includes(t.me('new@t.ph').code)));
  assert.ok(!t.d.view(t.me('new@t.ph')).nt.some(n => n.sim), 'not shown as an in-app notification');
  const f = await run('forgot', { em: 'new@t.ph' });
  assert.ok(f.ok && !f.demoCode, 'the code is not returned to the page');
  assert.deepEqual(await run('forgot', { em: 'nobody@t.ph' }), { ok: true, sent: true }, 'same answer for unknown emails');
  const code = t.S.nt.find(n => n.sim == 'Email' && n.addr == 'new@t.ph').b.match(/\d{6}/)[0];
  assert.ok((await run('resetPassword', { em: 'new@t.ph', code, pw: 'Another1x' })).ok);
  assert.equal(t.me('new@t.ph').tv, 1, 'old tokens are revoked');
  assert.match(
    (await run('ownerSetup', { name: 'X', em: 'x@t.ph', pw: '0123456789' })).err,
    /already complete/
  );
  assert.equal((await t.act('k@t.ph', 'staffAdd', { em: 'c1@t.ph', role: 'admin' })).ok, false);
  assert.ok((await t.act('a@t.ph', 'staffAdd', { em: 'c1@t.ph', role: 'cash' })).ok);
  assert.ok(t.me('c1@t.ph').cash);
});

test('3-wheeler bookings, vehicle color/year at registration, driver and vehicle details for the customer', async () => {
  const t = await setup();
  const pic = 'data:image/jpeg;base64,AAAA';
  assert.match(
    (
      await t.act('o@t.ph', 'addVehicle', { ins: 'CTPL-778899', insExp: future(300), cpc: 'CPC-2024-0001', cpcExp: future(500), kg: 400, 
        type: 'tw',
        brand: 'Bajaj',
        model: 'RE Cargo',
        plate: 'TRI 1234',
        regExp: future(300),
        doc: pic,
      })
    ).err,
    /color/
  );
  assert.match(
    (
      await t.act('o@t.ph', 'addVehicle', { ins: 'CTPL-778899', insExp: future(300), cpc: 'CPC-2024-0001', cpcExp: future(500), kg: 400, 
        type: 'tw',
        brand: 'Bajaj',
        model: 'RE Cargo',
        plate: 'TRI 1234',
        regExp: future(300),
        doc: pic,
        color: 'Blue',
        year: 1980,
      })
    ).err,
    /model year/
  );
  const v = await t.act('o@t.ph', 'addVehicle', { ins: 'CTPL-778899', insExp: future(300), cpc: 'CPC-2024-0001', cpcExp: future(500), kg: 400, 
    type: 'tw',
    brand: 'Bajaj',
    model: 'RE Cargo',
    plate: 'TRI 1234',
    regExp: future(300),
    doc: pic,
    color: 'Blue',
    year: 2023,
  });
  assert.ok(v.ok, v.err);
  t.S.users.push({
    name: 'Tess Trike',
    em: 'd3@t.ph',
    ph: '09175550000',
    ver: true,
    roles: [{ t: 'driver', st: 'approved', at: '2025-03-01T00:00:00Z' }],
    tv: 0,
  });
  await t.act('a@t.ph', 'vehicleDecision', { id: v.id, act: 'approve' });
  t.S.asg.push({ id: 'S3', vehicle: v.id, driver: 'd3@t.ph', st: 'Active', hist: [] });
  t.S.dp['d3@t.ph'] = { avail: 'Available' };
  const b = await t.booking('c1@t.ph', { vid: 'tw', sz: 'S' });
  assert.ok(b.ok, b.err);
  assert.equal(t.bk(b.id).tot, 693, '600 + 4 km x 15 = 660, + 5% = 693 (rounded fee)');
  assert.ok((await t.act('d3@t.ph', 'accept', { id: b.id })).ok);
  const view = t.d.view(t.me('c1@t.ph'));
  const veh = view.vh.find(x => x.id == v.id),
    drv = view.users.find(x => x.em == 'd3@t.ph');
  assert.equal(veh.color, 'Blue');
  assert.equal(veh.year, 2023);
  assert.equal(veh.plate, 'TRI 1234');
  assert.equal(drv.trips, 0);
  assert.equal(drv.since, '2025-03-01T00:00:00Z');
  assert.equal(drv.ph, '09175550000', 'customer can reach the assigned driver');
  assert.ok(
    view.fleet.RV.every(r => r.color && r.year && r.features.length),
    'rental details are sent to the screens'
  );
  assert.equal(view.fleet.HV[0].id, 'tw');
});

test('live GPS: only the assigned driver, only during active stages, throttled, private to the customer', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  const at = { id, lat: 6.9214, lng: 122.079, acc: 12, spd: 8.3, hdg: 90 };
  assert.match((await t.act('d1@t.ph', 'gpsPing', at)).err, /assigned driver/, 'not accepted yet');
  await t.act('d1@t.ph', 'accept', { id });
  assert.match(
    (await t.act('d1@t.ph', 'gpsPing', at)).err,
    /active trip/,
    'Accepted is not an active stage yet'
  );
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  assert.ok((await t.act('d1@t.ph', 'gpsPing', at)).ok);
  assert.equal(t.bk(id).gps.lat, 6.9214);
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && n.h == 'Live tracking started'));
  assert.equal(
    (await t.act('d1@t.ph', 'gpsPing', { ...at, lat: 6.93 })).skipped,
    true,
    'updates within 4 s are ignored'
  );
  assert.match((await t.act('d2@t.ph', 'gpsPing', at)).err, /assigned driver/, 'another driver cannot send');
  assert.match((await t.act('c1@t.ph', 'gpsPing', at)).err, /assigned driver/, 'the customer cannot send');
  assert.match((await t.act('d1@t.ph', 'gpsPing', { ...at, lat: 999 })).err, /Invalid location/);
  t.bk(id).gps.ms -= 5000;
  assert.ok((await t.act('d1@t.ph', 'gpsPing', { ...at, lat: 6.925 })).ok);
  assert.equal(t.bk(id).trail.length, 2);
  const cv = t.d.view(t.me('c1@t.ph')).bk.find(b => b.id == id);
  assert.equal(cv.gps.lat, 6.925, 'customer sees the live position');
  assert.ok(!t.d.view(t.me('c2@t.ph')).bk.some(b => b.id == id), 'other customers see nothing');
  assert.ok((await t.act('d1@t.ph', 'gpsStop', { id })).ok);
  assert.ok(t.bk(id).gps.off);
  t.bk(id).st = 'Completed';
  const after = t.d.view(t.me('c1@t.ph')).bk.find(b => b.id == id);
  assert.ok(!after.gps && !after.trail, 'position hidden from the customer after the trip');
  assert.ok(
    t.d.view(t.me('a@t.ph')).bk.find(b => b.id == id).trail,
    'admins keep the trail (dispute evidence)'
  );
  assert.match((await t.act('d1@t.ph', 'gpsPing', at)).err, /active trip/);
});
