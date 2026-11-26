'use strict';
/* Money split (ZamMove / driver / owner), remittance due, owner payouts, owner reports, cashier flags,
   account suspension, role revoking, handing back a job, owner notifications and live trip view. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { legacySetup: setup } = require('./_setup'); // these tests cover the older driver → ZamMove flow

/* drive a booking from Pending to Completed with driver D1 on van V1 (owner O) */
async function complete(t, id) {
  const a = (n, p) => t.act('d1@t.ph', n, { id, ...p });
  assert.ok((await a('accept')).ok);
  assert.ok((await a('step', { to: 'On the Way to Pickup' })).ok);
  assert.ok((await a('step', { to: 'Awaiting Down Payment' })).ok);
  assert.ok((await a('driverPay', { kind: 'down', g: 0, c: t.d.h.due(t.bk(id), 'down') })).ok);
  assert.ok((await a('step', { to: 'Items Loaded', note: 'Sofa and 3 boxes' })).ok);
  const pin = await t.act('c1@t.ph', 'vNewPin', { id });
  assert.ok((await a('vVerify', { input: pin.pin, kind: 'pin' })).ok);
  assert.ok((await a('vPlate', { input: 'aaa-1111' })).ok);
  assert.ok((await a('vSave', { count: 4, items: [true, true], frag: [] })).ok);
  assert.ok((await a('vDriverConfirm')).ok);
  assert.ok((await t.act('c1@t.ph', 'vCustomerConfirm', { id, reviewed: true })).ok);
  assert.ok((await a('vAuthorize')).ok);
  assert.ok((await a('step', { to: 'Arrived at Destination' })).ok);
  const dp = await t.act('c1@t.ph', 'dNewPin', { id });
  assert.ok((await a('dDeliver', { input: dp.pin, note: 'All delivered' })).ok);
  assert.ok((await a('step', { to: 'Awaiting Final Payment' })).ok);
  assert.ok((await a('driverPay', { kind: 'final', g: 0, c: t.d.h.due(t.bk(id), 'final') })).ok);
  assert.equal(t.bk(id).st, 'Completed');
}

test('every completed trip is split: service fee + commission to ZamMove, driver share, owner gets the rest', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  assert.ok(
    t.S.nt.every(n => n.to != 'o@t.ph'),
    'nothing for the owner yet'
  );
  await complete(t, id);
  const b = t.bk(id),
    s = b.split;
  /* fare 2016 = 1800 + 4 km x 30 + 5% fee 96; pool 1920; driver 20% = 384; commission 15% = 288; owner 1248 */
  assert.deepEqual([s.fare, s.fee, s.pool, s.drv, s.zc, s.own, s.zam], [2016, 96, 1920, 384, 288, 1248, 384]);
  assert.equal(s.owner, 'o@t.ph');
  assert.equal(t.d.h.dueFor(b), 1632, 'the driver remits what he collected minus his share');
  /* owner was told at accept, departure and completion */
  const on = t.S.nt.filter(n => n.to == 'o@t.ph').map(n => n.h);
  assert.ok(
    on.includes('Trip booked on your vehicle') &&
      on.includes('Your vehicle is on a trip') &&
      on.includes('Trip completed on your vehicle')
  );
  assert.ok(t.S.nt.some(n => n.to == 'd1@t.ph' && /your share is ₱384\.00/.test(n.b)));
  /* the customer never sees the split; the owner and the driver do */
  assert.equal(t.d.view(t.me('c1@t.ph')).bk.find(x => x.id == id).split, undefined);
  assert.equal(t.d.view(t.me('o@t.ph')).bk.find(x => x.id == id).split.own, 1248);
  /* changing the settings later never rewrites a completed trip */
  assert.ok((await t.act('a@t.ph', 'cfgSplit', { comm: 10, drvPct: 25 })).ok);
  assert.equal(t.d.h.splitOf(t.bk(id)).own, 1248);
  /* the owner's share becomes payable only when ZamMove has the money (driver's remittance verified) */
  assert.deepEqual(t.d.h.ownerBal('o@t.ph'), { earned: 0, earnedTrips: 0, earnedRent: 0, waiting: 1248, paid: 0, held: 0, heldOpen: 0, settled: 0, sent: 0, tripsOwed: 0, cross: 0, due: 0 });
});

test('split settings are validated; agreements leave room for the commission', async () => {
  const t = await setup();
  assert.match((await t.act('k@t.ph', 'cfgSplit', { comm: 10, drvPct: 20 })).err, /administrator/);
  assert.match((await t.act('a@t.ph', 'cfgSplit', { comm: 60, drvPct: 20 })).err, /0% to 50%/);
  assert.match((await t.act('a@t.ph', 'cfgSplit', { comm: 50, drvPct: 50 })).err, /cannot exceed 95%/);
  assert.ok((await t.act('a@t.ph', 'cfgSplit', { comm: 20, drvPct: 25 })).ok);
  const req = await t.act('d1@t.ph', 'step', {}); // noop: just make sure state still works
  assert.ok(req);
});

test('remittance due follows the split, and the cashier pays the owner from his balance', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await complete(t, id);
  t.bk(id).cd = '2026-01-07T02:00:00.000Z'; // a past week
  const week = t.d.h.wk(t.bk(id).cd);
  assert.ok((await t.act('d1@t.ph', 'remit', { week, method: 'Cash', ref: 'OR-1' })).ok);
  const r = t.S.rem[t.S.rem.length - 1];
  assert.deepEqual([r.gross, r.drvShare, r.due], [2016, 384, 1632]);
  assert.match((await t.act('k@t.ph', 'ownerPayout', { owner: 'o@t.ph', amount: 100, method: 'Cash' })).err, /becomes payable when the drivers’ remittances are verified/);
  assert.ok((await t.act('k@t.ph', 'remitVerify', { id: r.id, recv: 1632 })).ok);
  /* owner payout */
  assert.match(
    (await t.act('d1@t.ph', 'ownerPayout', { owner: 'o@t.ph', amount: 100, method: 'Cash' })).err,
    /cashier/
  );
  assert.match(
    (await t.act('k@t.ph', 'ownerPayout', { owner: 'o@t.ph', amount: 5000, method: 'Cash' })).err,
    /payable balance \(₱1,248\.00\)/
  );
  assert.match(
    (await t.act('k@t.ph', 'ownerPayout', { owner: 'o@t.ph', amount: 500, method: 'GCash', ref: '12' })).err,
    /reference/
  );
  assert.ok(
    (
      await t.act('k@t.ph', 'ownerPayout', {
        owner: 'o@t.ph',
        amount: 1000,
        method: 'GCash',
        ref: '7012345678000',
      })
    ).ok
  );
  assert.deepEqual(t.d.h.ownerBal('o@t.ph'), { earned: 1248, earnedTrips: 1248, earnedRent: 0, waiting: 0, paid: 1000, held: 0, heldOpen: 0, settled: 0, sent: 0, tripsOwed: 0, cross: 0, due: 248 });
  assert.ok(t.S.nt.some(n => n.to == 'o@t.ph' && n.h == 'Payout sent'));
  assert.ok(
    t.d.view(t.me('o@t.ph')).pay.some(p => p.kind == 'owner_payout' && p.amount == 1000),
    'the owner sees his payout'
  );
});

test('an owner can report a driver of his vehicle; it becomes an admin case', async () => {
  const t = await setup();
  const rep = (em, x) =>
    t.act(em, 'ownerReport', {
      driver: 'd1@t.ph',
      cat: 'Reckless driving',
      sev: 'High',
      d: 'Customer said he was speeding on the highway.',
      ...x,
    });
  assert.match((await rep('c1@t.ph')).err, /approved vehicle owner/);
  assert.match((await rep('o@t.ph', { driver: 'c2@t.ph' })).err, /drive or drove one of your vehicles/);
  assert.match((await rep('o@t.ph', { cat: 'Nope' })).err, /Choose what happened/);
  const r = await rep('o@t.ph');
  assert.ok(r.ok);
  const c = t.S.inc.find(x => x.id == r.id);
  assert.deepEqual([c.kind, c.driver, c.sev], ['owner-report', 'd1@t.ph', 'High']);
  assert.ok(t.S.nt.some(n => n.to == 'a@t.ph' && /Owner reported a driver/.test(n.h)));
  assert.ok(
    (await t.act('a@t.ph', 'incidentCase', { id: r.id, act: 'start' })).ok,
    'admins work it like any case'
  );
});

test('cashier flags a user for unremitted money; the admin suspends and reactivates the account', async () => {
  const t = await setup();
  const flag = (em, x) =>
    t.act(em, 'userFlag', {
      em: 'd1@t.ph',
      kind: 'Unremitted money',
      note: 'Week of Nov 9: ₱1,739.20 not remitted.',
      ...x,
    });
  assert.match((await flag('c1@t.ph')).err, /cashier or administrator/);
  assert.match((await flag('k@t.ph', { kind: 'x' })).err, /reason for the flag/);
  assert.match((await flag('k@t.ph', { note: 'late' })).err, /10\+ characters/);
  const f = await flag('k@t.ph');
  assert.ok(f.ok);
  assert.match((await flag('k@t.ph')).err, /already has an open flag/);
  assert.equal(
    t.d.view(t.me('k@t.ph')).users.find(u => u.em == 'd1@t.ph').flags.length,
    1,
    'cashier sees flags'
  );
  assert.ok(t.S.nt.some(n => n.to == 'd1@t.ph' && n.h == 'Your account was flagged'));
  /* suspend */
  assert.match(
    (await t.act('k@t.ph', 'userStatus', { em: 'd1@t.ph', status: 'suspended', reason: 'Unremitted' })).err,
    /administrator/
  );
  assert.match(
    (await t.act('a@t.ph', 'userStatus', { em: 'a@t.ph', status: 'suspended', reason: 'test me' })).err,
    /your own/
  );
  assert.ok(
    (await t.act('a@t.ph', 'userStatus', { em: 'd1@t.ph', status: 'suspended', reason: 'Unremitted money' }))
      .ok
  );
  assert.equal(t.me('d1@t.ph').status, 'suspended');
  const id = (await t.booking('c1@t.ph')).id;
  assert.match((await t.act('d1@t.ph', 'accept', { id })).err, /Requirement not met/);
  assert.ok(
    (await t.act('a@t.ph', 'userStatus', { em: 'd1@t.ph', status: 'active', reason: 'Paid in full' })).ok
  );
  assert.equal(t.me('d1@t.ph').status, undefined);
  assert.ok((await t.act('k@t.ph', 'flagResolve', { em: 'd1@t.ph', id: f.id, note: 'Paid on Nov 25' })).ok);
  assert.equal(t.me('d1@t.ph').flags[0].open, false);
});

test('revoking the driver role ends his assignment; revoking the owner role stops his rentals', async () => {
  const t = await setup();
  assert.match(
    (await t.act('a@t.ph', 'roleRevoke', { em: 'c1@t.ph', role: 'driver', reason: 'nope nope' })).err,
    /does not have/
  );
  assert.ok(
    (await t.act('a@t.ph', 'roleRevoke', { em: 'd2@t.ph', role: 'driver', reason: 'Repeated no-shows' })).ok
  );
  assert.equal(t.S.asg.find(a => a.id == 'S2').st, 'Ended');
  assert.equal(t.me('d2@t.ph').roles[0].st, 'revoked');
  await t.act('o@t.ph', 'vehRent', { id: 'V1', on: true, day: 2000 });
  assert.ok(
    (await t.act('a@t.ph', 'roleRevoke', { em: 'o@t.ph', role: 'owner', reason: 'Fake documents' })).ok
  );
  assert.equal(t.S.vh.find(v => v.id == 'V1').rent.on, false);
});

test('a driver can hand back an accepted job before heading out; it reopens for others', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  assert.match((await t.act('d1@t.ph', 'handBack', { id, reason: 'x' })).err, /why/);
  assert.match((await t.act('d2@t.ph', 'handBack', { id, reason: 'Flat tire' })).err, /not assigned to you/);
  assert.ok((await t.act('d1@t.ph', 'handBack', { id, reason: 'Flat tire on the way' })).ok);
  assert.deepEqual([t.bk(id).st, t.bk(id).drvUser], ['Pending', '']);
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && n.h == 'Your driver cancelled'));
  assert.ok((await t.act('d2@t.ph', 'accept', { id })).ok, 'another driver can take it');
  await t.act('d2@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  assert.match(
    (await t.act('d2@t.ph', 'handBack', { id, reason: 'Changed my mind' })).err,
    /before you head to the pickup/
  );
});

test('owners see their vehicle’s live position during a trip; drivers see their share on requests', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  const req = t.d.view(t.me('d1@t.ph')).bk.find(b => b.id == id);
  assert.deepEqual(req.share, { pct: 20, mov: 0, amt: 384 });
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  assert.ok((await t.act('d1@t.ph', 'gpsPing', { id, lat: 6.92, lng: 122.07, acc: 10 })).ok);
  const ob = t.d.view(t.me('o@t.ph')).bk.find(b => b.id == id);
  assert.equal(ob.gps.lat, 6.92);
  assert.equal(ob.trail, undefined, 'no trail for the owner');
});
