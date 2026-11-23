'use strict';
const { State, emptyState } = require('../src/state');
const { memoryStore } = require('../src/store');
const createDomain = require('../src/domain');

/* a pickup date ~30 days ahead (Manila) so schedules are always in the future */
const future = (days = 30) => new Date(Date.now() + days * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
const user = (name, em, x = {}) => ({
  name,
  em,
  pw: '',
  ph: '09170000000',
  ad: 'Tetuan, Zamboanga City',
  dob: '1990-01-01',
  ver: true,
  roles: [],
  tv: 0,
  ...x,
});
const driver = (name, em) => user(name, em, { roles: [{ t: 'driver', st: 'approved' }] });
const van = (id, owner, plate) => ({
  id,
  owner,
  type: 'l3',
  brand: 'Mitsubishi',
  model: 'L300',
  plate,
  cap: '1.5 tons',
  approval: 'Approved',
  status: 'Available',
  docs: [],
  hist: [],
});

/* standard world: customers C1, C2; drivers D1, D2 with vans V1, V2; owner O; super admin A; cashier K */
function world() {
  return {
    users: [
      user('Carla Cust', 'c1@t.ph'),
      user('Oscar Other', 'c2@t.ph'),
      driver('Dina One', 'd1@t.ph'),
      driver('Dan Two', 'd2@t.ph'),
      user('Olga Owner', 'o@t.ph', { roles: [{ t: 'owner', st: 'approved' }] }),
      user('Ada Admin', 'a@t.ph', { adm: 'super' }),
      user('Kim Cashier', 'k@t.ph', { cash: true }),
    ],
    vh: [van('V1', 'o@t.ph', 'AAA 1111'), van('V2', 'o@t.ph', 'BBB 2222')],
    asg: [
      { id: 'S1', vehicle: 'V1', driver: 'd1@t.ph', st: 'Active', hist: [] },
      { id: 'S2', vehicle: 'V2', driver: 'd2@t.ph', st: 'Active', hist: [] },
    ],
    dp: { 'd1@t.ph': { avail: 'Available' }, 'd2@t.ph': { avail: 'Available' } },
  };
}

async function setup(data = world(), store = memoryStore()) {
  const st = await new State(store).init();
  await st.run(() =>
    st.replace({ ...emptyState(), ...data, cfg: { ...emptyState().cfg, ...(data.cfg || {}) } })
  );
  const d = createDomain(st.S);
  const me = em => st.S.users.find(u => u.em == em);
  const act = (em, name, p = {}) => st.run(() => d.actions[name](me(em), p));
  const bk = id => st.S.bk.find(b => b.id == id);
  const booking = (em, x = {}) =>
    act(em, 'createBooking', {
      pu: 'Tetuan, Zamboanga City',
      dr: 'Putik, Zamboanga City',
      dt: future(),
      tm: '09:00',
      vid: 'l3',
      mv: 0,
      it: 'Sofa, 3 boxes',
      sz: 'M',
      ...x,
    });
  return { st, d, S: st.S, me, act, bk, booking, store };
}
module.exports = { setup, world, user, driver, van, future };
