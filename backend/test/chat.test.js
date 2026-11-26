'use strict';
/* Chat: customer ↔ driver on a trip, renter ↔ owner (↔ driver) on a rental. Members only, staff can read,
   closed 24 h after the end, never in the normal state. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, future } = require('./_setup');
const views = require('../src/views');

const pic = 'data:image/jpeg;base64,AAAA';

async function trip() {
  const t = await setup();
  const id = (await t.booking('c1@t.ph')).id;
  return { t, id, b: () => t.bk(id) };
}

test('no chat before a driver accepts; then customer and driver talk, nobody else can', async () => {
  const { t, id, b } = await trip();
  assert.match((await t.act('c1@t.ph', 'chatSend', { k: 'b', id, x: 'Hello' })).err, /chat is closed|not part/);
  assert.ok((await t.act('d1@t.ph', 'accept', { id })).ok);
  const r = await t.act('c1@t.ph', 'chatSend', { k: 'b', id, x: 'The gate is blue, please call when outside.' });
  assert.ok(r.ok, r.err);
  assert.ok((await t.act('d1@t.ph', 'chatSend', { k: 'b', id, x: 'Noted, on my way.' })).ok);
  assert.equal(b().chat.m.length, 2);
  /* outsiders */
  assert.match((await t.act('d2@t.ph', 'chatSend', { k: 'b', id, x: 'hi' })).err, /not part/);
  assert.match((await t.act('c2@t.ph', 'chatSend', { k: 'b', id, x: 'hi' })).err, /not part/);
  assert.equal(t.d.h.chatRead(t.me('c2@t.ph'), 'b', id, 0), null);
  assert.equal(t.d.h.chatRead(t.me('o@t.ph'), 'b', id, 0), null, 'the vehicle owner does not read the trip chat');
  /* staff can read for disputes */
  const st = t.d.h.chatRead(t.me('a@t.ph'), 'b', id, 0);
  assert.equal(st.msgs.length, 2);
  assert.equal(st.member, false);
  /* reading from an index */
  const rd = t.d.h.chatRead(t.me('d1@t.ph'), 'b', id, 1);
  assert.equal(rd.msgs.length, 1);
  assert.equal(rd.msgs[0].me, true);
  assert.equal(rd.total, 2);
});

test('unread counts, seen, a single notification per burst, and messages stay out of the state', async () => {
  const { t, id, b } = await trip();
  await t.act('d1@t.ph', 'accept', { id });
  for (const x of ['I am outside', 'Blue gate?', 'Calling you now']) await t.act('d1@t.ph', 'chatSend', { k: 'b', id, x });
  const th = t.d.h.chatThreads('c1@t.ph').find(x => x.id == id);
  assert.equal(th.unread, 3);
  assert.equal(th.with[0].role, 'Driver');
  assert.equal(t.S.nt.filter(n => n.to == 'c1@t.ph' && /^Message from/.test(n.h)).length, 1, 'one notification, not three');
  await t.act('c1@t.ph', 'chatSeen', { k: 'b', id });
  assert.equal(t.d.h.chatThreads('c1@t.ph').find(x => x.id == id).unread, 0);
  const v = views(t.S, t.d.h)(t.me('c1@t.ph'));
  assert.ok(!JSON.stringify(v.bk).includes('Calling you now'), 'the messages are not in the state');
  assert.equal(v.chats.find(x => x.id == id).last.x, 'Calling you now');
  assert.ok(b().chat.seen['c1@t.ph']);
});

test('limits: empty, too long, too fast', async () => {
  const { t, id } = await trip();
  await t.act('d1@t.ph', 'accept', { id });
  assert.match((await t.act('c1@t.ph', 'chatSend', { k: 'b', id, x: '   ' })).err, /Type a message/);
  assert.match((await t.act('c1@t.ph', 'chatSend', { k: 'b', id, x: 'x'.repeat(501) })).err, /under 500/);
  for (let i = 0; i < 15; i++) await t.act('c1@t.ph', 'chatSend', { k: 'b', id, x: 'm' + i });
  assert.match((await t.act('c1@t.ph', 'chatSend', { k: 'b', id, x: 'one more' })).err, /too quickly/);
});

test('the trip chat stays readable but closes 24 hours after the trip ends', async () => {
  const { t, id, b } = await trip();
  await t.act('d1@t.ph', 'accept', { id });
  await t.act('c1@t.ph', 'chatSend', { k: 'b', id, x: 'Thanks!' });
  b().st = 'Completed';
  b().ev.push({ to: 'Completed', t: new Date(Date.now() - 25 * 36e5).toISOString() });
  assert.match((await t.act('c1@t.ph', 'chatSend', { k: 'b', id, x: 'one more thing' })).err, /chat is closed/);
  const rd = t.d.h.chatRead(t.me('c1@t.ph'), 'b', id, 0);
  assert.equal(rd.open, false);
  assert.equal(rd.msgs.length, 1);
});

test('rental: renter and owner talk from the request; the owner’s driver joins a rental with a driver', async () => {
  const t = await setup();
  await t.act('o@t.ph', 'vehRent', { id: 'V2', on: true, day: 2000, drv: 800 });
  const id = (await t.act('c1@t.ph', 'createRental', { veh: 'V2', s: future(20), e: future(21), pu: 'Tetuan, Zamboanga City', rt: 'Tetuan, Zamboanga City', ip: pic, withDrv: true })).id;
  assert.ok(id);
  assert.ok((await t.act('c1@t.ph', 'chatSend', { k: 'r', id, x: 'Is the aircon working?' })).ok);
  assert.ok((await t.act('o@t.ph', 'chatSend', { k: 'r', id, x: 'Yes, serviced last month.' })).ok);
  assert.match((await t.act('d2@t.ph', 'chatSend', { k: 'r', id, x: 'hi' })).err, /not part/);
  await t.act('o@t.ph', 'rentalDecision', { id, act: 'approve', driver: 'd2@t.ph' });
  assert.ok((await t.act('d2@t.ph', 'chatSend', { k: 'r', id, x: 'I will pick you up at 9.' })).ok, 'the rental’s driver joins');
  const th = t.d.h.chatThreads('c1@t.ph').find(x => x.id == id);
  assert.deepEqual(th.with.map(w => w.role).sort(), ['Driver', 'Owner']);
  assert.equal(th.unread, 2);
  const v = views(t.S, t.d.h)(t.me('o@t.ph'));
  assert.ok(!JSON.stringify(v.rn).includes('aircon'), 'rental messages are not in the state');
});
