'use strict';
/* Adds demo accounts for testing: 2 vehicle owners, 3 approved drivers (each with an assigned vehicle) and 1 customer.
   Safe to run more than once: existing emails and plates are skipped.
   Stop the server first, then:   npm run seed:demo   (uses the same store as the server: Supabase or the local file) */
const cfg = require('../src/config');
const { createStore } = require('../src/store');
const { State } = require('../src/state');
const { hashPassword, now } = require('../src/util');
const C = require('../src/domain/constants');

const PASSWORD = 'Demo1234';
const at = now();
const user = (name, em, ph, roles) => ({
  name,
  em,
  ph,
  ad: 'Zamboanga City',
  dob: '1990-01-15',
  ver: true,
  tv: 0,
  cr: at,
  demo: true,
  pw: hashPassword(PASSWORD),
  roles: roles.map(t => ({ t, st: 'approved', by: 'demo-seed', at })),
});
const USERS = [
  user('Lito Reyes', 'owner1@zammove.test', '09170000101', ['owner']),
  user('Maria Alvarez', 'owner2@zammove.test', '09170000102', ['owner']),
  user('Ramon Santos', 'driver1@zammove.test', '09170000201', ['driver']),
  user('Ben Torres', 'driver2@zammove.test', '09170000202', ['driver']),
  user('Joy Ramos', 'driver3@zammove.test', '09170000203', ['driver']),
  user('Carla Mendoza', 'customer@zammove.test', '09170000301', []),
];
const veh = (id, owner, type, brand, model, plate, color, year, desc, x = {}) => ({
  id,
  owner,
  type,
  brand,
  model,
  plate,
  color,
  year,
  desc,
  cap: C.VT.find(h => h.id == type).cap,
  seats: (C.TYPE_INFO[type] || {}).seats,
  trans: 'Manual',
  fuel: 'Diesel',
  regExp: '2027-12-31',
  docs: [{ name: 'OR/CR (demo)', file: '' }],
  photo: '',
  approval: 'Approved',
  status: 'Available',
  demo: true,
  hist: [
    { e: 'Registered (demo seed)', t: at, by: owner },
    { e: 'Approved', t: at, by: 'demo-seed' },
  ],
  ...x,
});
const VEHICLES = [
  veh(
    'VH-DEMO1',
    'owner1@zammove.test',
    'tw',
    'Bajaj',
    'RE Cargo',
    'DEM 1001',
    'Royal Blue',
    2023,
    'Tarpaulin cover and straps included'
  ),
  veh(
    'VH-DEMO2',
    'owner1@zammove.test',
    'l3',
    'Mitsubishi',
    'L300',
    'DEM 1002',
    'White',
    2021,
    'Moving blankets on board'
  ),
  veh(
    'VH-DEMO3',
    'owner2@zammove.test',
    'w6',
    'Isuzu',
    'Forward',
    'DEM 2001',
    'Silver',
    2020,
    'Hydraulic tail lift'
  ),
  veh(
    'VH-DEMO4',
    'owner2@zammove.test',
    'pk',
    'Toyota',
    'Hilux',
    'DEM 2002',
    'Gray',
    2022,
    'No driver yet: use it to test owner assignment requests',
    { rent: { on: true, day: 2800 } }
  ),
  /* self-drive rental units (Rent page) */
  veh(
    'VH-DEMO5',
    'owner1@zammove.test',
    'l3',
    'Mitsubishi',
    'L300',
    'DEM 1003',
    'Silver',
    2022,
    'Rubber floor mat, rope and straps',
    { rent: { on: true, day: 2300 } }
  ),
  veh(
    'VH-DEMO6',
    'owner2@zammove.test',
    'l3',
    'Mitsubishi',
    'L300',
    'DEM 2003',
    'Blue',
    2020,
    'Older unit, priced lower',
    { rent: { on: true, day: 2100 } }
  ),
  veh(
    'VH-DEMO7',
    'owner1@zammove.test',
    'sd',
    'Toyota',
    'Vios',
    'DEM 1004',
    'Red',
    2023,
    'Air conditioning, Bluetooth audio, rear camera',
    { trans: 'Automatic', fuel: 'Gasoline', rent: { on: true, day: 1800 } }
  ),
  veh(
    'VH-DEMO8',
    'owner2@zammove.test',
    'mv',
    'Toyota',
    'Hiace',
    'DEM 2004',
    'White Pearl',
    2021,
    'Rear air conditioning, sliding door',
    { rent: { on: true, day: 3500 } }
  ),
];
const ASSIGN = [
  ['VH-DEMO1', 'driver1@zammove.test'],
  ['VH-DEMO2', 'driver2@zammove.test'],
  ['VH-DEMO3', 'driver3@zammove.test'],
];

(async () => {
  const state = await new State(createStore(cfg)).init();
  const added = [];
  await state.run(S => {
    for (const u of USERS)
      if (!S.users.some(x => x.em == u.em)) {
        S.users.push(u);
        added.push(u.em);
      }
    for (const v of VEHICLES)
      if (!S.vh.some(x => x.id == v.id || String(x.plate).toUpperCase() == v.plate)) {
        S.vh.push(v);
        added.push(v.plate);
      }
    const hilux = S.vh.find(x => x.id == 'VH-DEMO4');
    if (hilux && !hilux.rent) {
      Object.assign(hilux, { seats: 5, trans: 'Manual', fuel: 'Diesel', rent: { on: true, day: 2800 } });
      added.push('rental: DEM 2002');
    }
    for (const [vehicle, driver] of ASSIGN) {
      if (!S.asg.some(a => a.vehicle == vehicle && a.driver == driver && a.st == 'Active'))
        S.asg.push({
          id: 'AS-' + vehicle.slice(3),
          vehicle,
          driver,
          by: 'demo-seed',
          mode: 'Demo assignment',
          note: '',
          st: 'Active',
          hist: [{ st: 'Active', t: at, by: 'demo-seed' }],
        });
      S.dp[driver] = { ...(S.dp[driver] || {}), avail: 'Available' };
    }
    S.au.push({
      id: 'AU-DEMOSEED-' + Date.now(),
      t: at,
      who: 'demo-seed',
      evt: 'demo accounts added',
      data: { added },
    });
  });
  console.log(
    `[zammove] store=${state.store.kind}: ${added.length ? 'added ' + added.join(', ') : 'demo data already present'}`
  );
  console.log(`[zammove] password for every demo account: ${PASSWORD}`);
})().catch(e => {
  console.error('[zammove] demo seed failed:', e.message);
  process.exit(1);
});
