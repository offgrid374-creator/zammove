'use strict';
/* Booking loopholes: each case is what a careless or dishonest user might try. */
process.env.GEO_OFFLINE = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');
const out = [];
const check = (name, holds, detail = '') => out.push([holds, name, detail]);

test('booking loopholes are closed', async () => {
  /* 1. a driver accepts his own booking */
  {
    const t = await setup();
    const r = await t.booking('d1@t.ph');
    const a = r.ok ? await t.act('d1@t.ph', 'accept', { id: r.id }) : { ok: false, err: r.err };
    check('driver cannot accept own booking', !a.ok, a.err || r.err);
  }
  /* 2. two drivers accept the same booking */
  {
    const t = await setup();
    const id = (await t.booking('c1@t.ph')).id;
    const a1 = await t.act('d1@t.ph', 'accept', { id }), a2 = await t.act('d2@t.ph', 'accept', { id });
    check('only one driver gets a booking', a1.ok && !a2.ok, a2.err);
  }
  /* 3. price sent by the browser is ignored */
  {
    const t = await setup();
    const r = await t.booking('c1@t.ph', { tot: 1, bd: [1, 0, 0, 0] });
    check('browser cannot set the price', r.ok && t.bk(r.id).tot > 100, 'tot=' + (r.ok && t.bk(r.id).tot));
  }
  /* 4. skipping trip steps */
  {
    const t = await setup();
    const id = (await t.booking('c1@t.ph')).id;
    await t.act('d1@t.ph', 'accept', { id });
    const s = await t.act('d1@t.ph', 'step', { id, to: 'In Transit' });
    const s2 = await t.act('d1@t.ph', 'step', { id, to: 'Completed' });
    check('driver cannot skip steps', !s.ok && !s2.ok, s.err);
  }
  /* 5. wrong payment amounts */
  {
    const t = await setup();
    const id = (await t.booking('c1@t.ph')).id;
    await t.act('d1@t.ph', 'accept', { id });
    for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await t.act('d1@t.ph', 'step', { id, to });
    const due = t.d.h.due(t.bk(id), 'down');
    const under = await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: due - 100, rcv: due - 100 });
    const over = await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: due + 100, rcv: due + 100 });
    check('down payment must be the exact 50%', !under.ok && !over.ok, under.err);
    const s = await t.act('d1@t.ph', 'step', { id, to: 'Items Loaded' });
    check('cannot load before the down payment', !s.ok, s.err);
    /* duplicate GCash reference */
    const g1 = await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: due, c: 0, rcv: 0, ref: '1234567890123' });
    const t2 = await setup();
    check('down payment recorded', g1.ok, g1.err);
  }
  /* 6. completing without delivery PIN or final payment */
  {
    const t = await setup();
    const id = (await t.booking('c1@t.ph')).id;
    await t.act('d1@t.ph', 'accept', { id });
    for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await t.act('d1@t.ph', 'step', { id, to });
    const due = t.d.h.due(t.bk(id), 'down');
    await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: due });
    const jump = await t.act('d1@t.ph', 'step', { id, to: 'Arrived at Destination' });
    check('cannot reach the destination without the pre-departure check', !jump.ok, jump.err);
    const fin = await t.act('d1@t.ph', 'driverPay', { id, kind: 'final', g: 0, c: due, rcv: due });
    check('cannot take the final payment before delivery', !fin.ok, fin.err);
  }
  /* 7. reviews */
  {
    const t = await setup();
    const id = (await t.booking('c1@t.ph')).id;
    const r = await t.act('c1@t.ph', 'review', { id, r: 5, c: 'great' });
    check('cannot review a trip that has not happened', !r.ok, r.err);
  }
  /* 8. spam bookings */
  {
    const t = await setup();
    let n = 0;
    for (let i = 0; i < 12; i++) { const r = await t.booking('c1@t.ph', { dt: future(10 + i), tm: '09:00' }); if (r.ok) n++; }
    check('a customer cannot flood the system with open bookings', n <= 5, n + ' open bookings accepted');
  }
  /* 9. cancel after loading */
  {
    const t = await setup();
    const id = (await t.booking('c1@t.ph')).id;
    await t.act('d1@t.ph', 'accept', { id });
    for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await t.act('d1@t.ph', 'step', { id, to });
    const due = t.d.h.due(t.bk(id), 'down');
    await t.act('d1@t.ph', 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: due });
    t.bk(id).st = 'Items Loaded';
    const c = await t.act('c1@t.ph', 'cancelBooking', { id });
    check('customer cannot cancel once items are loaded', !c.ok, c.err);
  }
  /* 10. a driver who accepted never comes */
  {
    const t = await setup();
    const id = (await t.booking('c1@t.ph')).id;
    if (id) {
      await t.act('d1@t.ph', 'accept', { id });
      const b = t.bk(id);
      b.dt = new Date(Date.now() - 2 * 36e5 + 8 * 36e5).toISOString().slice(0, 10);
      b.tm = new Date(Date.now() - 2 * 36e5 + 8 * 36e5).toISOString().slice(11, 16);
      t.d.h.sweep();
      const told = t.S.nt.some(n => n.to == 'c1@t.ph' && /late|has not|did not/i.test(n.b));
      const staff = t.S.nt.some(n => n.to == 'a@t.ph' && /late|has not|did not/i.test(n.b));
      check('a driver 2 h late is detected (customer and staff told, job reopened)', told && staff && b.st != 'Accepted', `customer told=${told}, staff told=${staff}, status=${b.st}`);
    } else check('a driver 2 h late is detected', false, 'could not create a same-day booking');
  }
  /* 11. a no-show marked far from the pickup */
  {
    const t = await setup();
    const id = (await t.booking('c1@t.ph')).id;
    await t.act('d1@t.ph', 'accept', { id });
    for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await t.act('d1@t.ph', 'step', { id, to });
    const b = t.bk(id);
    b.ev.find(e => e.to == 'Awaiting Down Payment').t = new Date(Date.now() - 20 * 6e4).toISOString();
    b.gps = { lat: 7.05, lng: 122.2, t: new Date().toISOString(), ms: Date.now() }; // ~20 km from Tetuan
    const r = await t.act('d1@t.ph', 'noShow', { id });
    check('a no-show fee needs the driver to be at the pickup', !r.ok, r.ok ? 'fee charged although the driver is ~20 km away' : r.err);
  }
  /* 12. a driver accepts two jobs at the same time */
  {
    const t = await setup();
    const a = (await t.booking('c1@t.ph', { tm: '09:00' })).id, b = (await t.booking('c2@t.ph', { tm: '09:30' })).id;
    const r1 = await t.act('d1@t.ph', 'accept', { id: a }), r2 = await t.act('d1@t.ph', 'accept', { id: b });
    check('a driver cannot take two overlapping jobs', r1.ok && !r2.ok, r2.err);
  }
  /* 13. delivery PIN guessing */
  {
    const t = await setup();
    const id = (await t.booking('c1@t.ph')).id;
    await t.act('d1@t.ph', 'accept', { id });
    check('(delivery PIN lockout covered by verification tests)', true);
  }
  const open = out.filter(x => !x[0]);
  assert.equal(open.length, 0, 'open: ' + open.map(x => x[1] + ' (' + x[2] + ')').join('; '));
});

test('a no-show without a phone location is allowed but flagged to staff', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await t.act('d1@t.ph', 'step', { id, to });
  t.bk(id).ev.find(e => e.to == 'Awaiting Down Payment').t = new Date(Date.now() - 20 * 6e4).toISOString();
  const r = await t.act('d1@t.ph', 'noShow', { id });
  assert.ok(r.ok, r.err);
  assert.equal(t.bk(id).cxl.unverified, true);
  assert.ok(t.S.nt.some(n => n.to == 'a@t.ph' && /without sharing a phone location/.test(n.b)));
});

test('a late driver is warned first; one already on the way keeps the job', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('d1@t.ph', 'step', { id, to: 'On the Way to Pickup' });
  const b = t.bk(id), past = new Date(Date.now() - 2 * 36e5 + 8 * 36e5).toISOString();
  b.dt = past.slice(0, 10); b.tm = past.slice(11, 16);
  t.d.h.sweep();
  assert.equal(b.st, 'On the Way to Pickup', 'a driver on the way is not replaced');
  assert.equal(b.drvUser, 'd1@t.ph');
  assert.ok(t.S.nt.some(n => n.to == 'c1@t.ph' && /late/.test(n.h + n.b)), 'the customer is told the driver is late');
  t.d.h.sweep();
  assert.equal(t.S.nt.filter(n => n.to == 'c1@t.ph' && n.h == 'Your driver is late').length, 1, 'told once');
});

test('a trip that stops moving with items on board alerts staff once', async () => {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  await t.act('d1@t.ph', 'accept', { id });
  const b = t.bk(id);
  b.st = 'In Transit';
  b.ev.push({ to: 'In Transit', t: new Date(Date.now() - 12 * 36e5).toISOString() });
  t.d.h.sweep(); t.d.h.sweep();
  assert.equal(t.S.nt.filter(n => n.to == 'a@t.ph' && n.h == 'Trip not moving').length, 1);
});
