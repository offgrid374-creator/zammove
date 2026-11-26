'use strict';
/* the service area: Zamboanga City only, even when an address outside it contains the word "Zamboanga" */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/domain/constants');
const { setup, future } = require('./_setup');

test('addresses in the provinces named Zamboanga are outside the service area', () => {
  for (const t of ['Pagadian, Zamboanga del Sur', 'Dipolog City, Zamboanga del Norte', 'Ipil, Zamboanga Sibugay', 'Isabela City, Basilan', 'Manila', 'Far away (7.82000, 123.43000)'])
    assert.equal(C.inZC(t), false, t);
  for (const t of ['Tetuan, Zamboanga City', 'Putik', 'Ayala, Zamboanga', 'Talisayan, Zamboanga City, Zamboanga Peninsula', 'KCC Mall, Zamboanga City (6.91800, 122.07500)'])
    assert.equal(C.inZC(t), true, t);
});

test('a booking to Zamboanga del Sur is refused', async () => {
  const t = await setup();
  const r = await t.booking('c1@t.ph', { dr: 'Pagadian, Zamboanga del Sur', dt: future() });
  assert.equal(r.ok, false);
  assert.match(r.err, /Zamboanga City/);
});
