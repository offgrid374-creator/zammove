'use strict';
/**
 * Creates a ready-to-work driver: an approved owner-driver account with an approved vehicle,
 * an active assignment and availability set to Available. The password is random and printed once.
 *
 * Stop the server first (or restart it afterwards), then:
 *   npm run create-driver -- [--email driver@example.com] [--name "Full Name"] [--phone 09171234567]
 *                            [--type l3] [--brand Mitsubishi] [--model L300] [--plate "ABC 1234"]
 *                            [--color White] [--year 2021]
 *                            [--license N01-23-456789] [--license-exp 2028-05-14] [--clearance-exp 2027-05-14]
 *   --type: tw (3-wheeler), pk (pickup), l3 (L300 van), cv (closed van), w6 (6-wheeler)
 */
const crypto = require('crypto');
const cfg = require('../src/config');
const { createStore } = require('../src/store');
const { State } = require('../src/state');
const { hashPassword, now, rid, norm } = require('../src/util');
const C = require('../src/domain/constants');

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
function randomPassword() {
  const all = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pw = '';
  while (!/\d/.test(pw) || !/[a-z]/i.test(pw))
    pw = Array.from({ length: 12 }, () => all[crypto.randomInt(all.length)]).join('');
  return pw;
}

(async () => {
  const d = {
    email: String(arg('email', 'driver@zammove.test')).trim().toLowerCase(),
    name: arg('name', 'Juan Dela Cruz'),
    phone: arg('phone', '09171234567'),
    type: arg('type', 'l3'),
    brand: arg('brand', 'Mitsubishi'),
    model: arg('model', 'L300'),
    plate: String(arg('plate', 'ZAM 1234')).toUpperCase(),
    color: arg('color', 'White'),
    year: +arg('year', 2021),
    lic: arg('license', 'N01-00-000000'),
    licExp: arg('license-exp', new Date(Date.now() + 2 * 365 * 864e5).toISOString().slice(0, 10)),
    clrExp: arg('clearance-exp', new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)),
  };
  const type = C.HV.find(h => h.id == d.type);
  if (!/^\S+@\S+\.\S+$/.test(d.email)) throw new Error('Give a valid --email.');
  if (!type) throw new Error('Unknown --type. Use one of: ' + C.HV.map(h => h.id).join(', '));
  for (const k of ['licExp', 'clrExp'])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d[k])) throw new Error('Dates must look like 2028-05-14.');
  if (!/^(09|\+639)\d{9}$/.test(d.phone))
    throw new Error('Give a PH mobile number for --phone (09XXXXXXXXX).');

  const state = await new State(createStore(cfg)).init();
  if (state.S.users.some(u => u.em == d.email)) throw new Error(`An account with ${d.email} already exists.`);
  if (state.S.vh.some(v => norm(v.plate) == norm(d.plate)))
    throw new Error(`Plate ${d.plate} is already registered. Use --plate.`);

  const password = randomPassword(),
    at = now(),
    vid = rid('VH');
  await state.run(S => {
    S.users.push({
      name: d.name,
      em: d.email,
      ph: d.phone,
      ad: 'Zamboanga City',
      dob: '1990-01-01',
      ver: true,
      tv: 0,
      cr: at,
      pw: hashPassword(password),
      roles: ['driver', 'owner'].map(t => ({ t, st: 'approved', by: 'create-driver script', at })),
      lic: d.lic,
      dx: { lic: d.licExp, clr: d.clrExp }, // license and NBI/police clearance valid until
    });
    S.vh.push({
      id: vid,
      owner: d.email,
      type: type.id,
      brand: d.brand,
      model: d.model,
      plate: d.plate,
      color: d.color,
      year: d.year,
      cap: type.cap,
      desc: '',
      regExp: '2027-12-31',
      legal: { ins: arg('ins', 'CTPL-' + d.plate.replace(/\W/g, '')), insExp: arg('ins-exp', '2027-12-31'), cpc: arg('cpc', 'CPC-' + d.plate.replace(/\W/g, '')), cpcExp: arg('cpc-exp', '2028-12-31') },
      docs: [],
      photo: '',
      approval: 'Approved',
      status: 'Available',
      hist: [{ e: 'Registered and approved (create-driver script)', t: at, by: 'create-driver script' }],
    });
    S.asg.push({
      id: rid('AS'),
      vehicle: vid,
      driver: d.email,
      by: 'create-driver script',
      mode: 'Owner-driver',
      note: '',
      st: 'Active',
      hist: [{ st: 'Active', t: at, by: 'create-driver script' }],
    });
    S.dp[d.email] = { avail: 'Available' };
    S.au.push({
      id: rid('AU'),
      t: at,
      who: 'create-driver script',
      evt: 'driver account created',
      data: { user: d.email, vehicle: vid },
    });
  });

  console.log(`Driver created (store=${state.store.kind}):`);
  console.log(`  Name:     ${d.name}`);
  console.log(`  Email:    ${d.email}`);
  console.log(`  Password: ${password}`);
  console.log(
    `  Vehicle:  ${d.brand} ${d.model} · ${type.n} · ${d.plate} · ${d.color} ${d.year} (approved, assigned, Available)`
  );
  console.log('Restart the server if it is running, then log in and choose Workspace → Driver.');
})().catch(e => {
  console.error('Not created:', e.message);
  process.exit(1);
});
