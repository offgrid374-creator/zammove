'use strict';
/* Admin-managed catalog and fuel price.

   Catalog: brands with their models (each model has a usual vehicle type, seats and fuel), fuel types
   (Hybrid included, e.g. BYD DM-i that runs on gasoline or electricity), colours and transmissions.
   Every dropdown in the app reads these lists, and an administrator can add, rename, hide ("no longer
   available") or delete entries. Hidden entries stay on vehicles that already use them.

   Fuel price: the per-km part of every fare follows the fuel price (price / reference). The admin sets it;
   a vehicle owner can ask for a change, which an admin approves or denies.

   Booking preferences (brand, colour, seats, fuel, a specific driver): only matching vehicles are offered
   the job. Drivers are referred to by a pseudonymous key, never by email. */
const { now, r2, rid, str, ok, no, sha256 } = require('../util');

const M = (n, type, seats, fuel) => ({ id: slug(n), n, type, seats, fuel });
function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
const DEFAULT_CAT = () => ({
  brands: [
    { id: 'toyota', n: 'Toyota', models: [M('Vios', 'sd', 5, 'Gasoline'), M('Innova', 'su', 7, 'Diesel'), M('Avanza', 'su', 7, 'Gasoline'), M('Fortuner', 'su', 7, 'Diesel'), M('Hiace', 'mv', 15, 'Diesel'), M('Hilux', 'pk', 5, 'Diesel'), M('Corolla Cross Hybrid', 'su', 5, 'Hybrid')] },
    { id: 'mitsubishi', n: 'Mitsubishi', models: [M('L300', 'l3', 3, 'Diesel'), M('Xpander', 'su', 7, 'Gasoline'), M('Montero Sport', 'su', 7, 'Diesel'), M('Strada', 'pk', 5, 'Diesel'), M('Mirage G4', 'sd', 5, 'Gasoline')] },
    { id: 'isuzu', n: 'Isuzu', models: [M('Traviz', 'l3', 3, 'Diesel'), M('Elf (NHR)', 'cv', 3, 'Diesel'), M('Forward', 'w6', 3, 'Diesel'), M('D-Max', 'pk', 5, 'Diesel'), M('mu-X', 'su', 7, 'Diesel')] },
    { id: 'nissan', n: 'Nissan', models: [M('Urvan', 'mv', 15, 'Diesel'), M('Navara', 'pk', 5, 'Diesel'), M('Almera', 'sd', 5, 'Gasoline'), M('Terra', 'su', 7, 'Diesel')] },
    { id: 'suzuki', n: 'Suzuki', models: [M('Carry', 'pk', 2, 'Gasoline'), M('Ertiga', 'su', 7, 'Gasoline'), M('Dzire', 'sd', 5, 'Gasoline')] },
    { id: 'hyundai', n: 'Hyundai', models: [M('H-100', 'l3', 3, 'Diesel'), M('Staria', 'mv', 11, 'Diesel'), M('Accent', 'sd', 5, 'Gasoline')] },
    { id: 'ford', n: 'Ford', models: [M('Ranger', 'pk', 5, 'Diesel'), M('Everest', 'su', 7, 'Diesel')] },
    { id: 'honda', n: 'Honda', models: [M('City', 'sd', 5, 'Gasoline'), M('BR-V', 'su', 7, 'Gasoline')] },
    { id: 'byd', n: 'BYD', models: [M('Atto 3', 'su', 5, 'Electric'), M('Dolphin', 'sd', 5, 'Electric'), M('Seal', 'sd', 5, 'Electric'), M('Sealion 6 DM-i', 'su', 5, 'Hybrid'), M('T3 Van', 'l3', 2, 'Electric')] },
    { id: 'hino', n: 'Hino', models: [M('300 Series', 'cv', 3, 'Diesel'), M('500 Series', 'w6', 3, 'Diesel')] },
    { id: 'bajaj', n: 'Bajaj', models: [M('RE Cargo', 'tw', 2, 'Gasoline'), M('RE Maxima Cargo', 'tw', 2, 'Gasoline')] },
    { id: 'piaggio', n: 'Piaggio', models: [M('Ape City', 'tw', 2, 'Diesel')] },
  ],
  fuels: [{ n: 'Gasoline' }, { n: 'Diesel' }, { n: 'Electric' }, { n: 'Hybrid' }],
  colors: ['White', 'Black', 'Silver', 'Gray', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Brown', 'Beige', 'Maroon'].map(n => ({ n })),
  trans: [{ n: 'Manual' }, { n: 'Automatic' }],
});
const FUEL_REF = 60; // ₱ per litre the fares were set at

module.exports = (S, h) => {
  const cat = () => {
    if (!S.cfg.cat) S.cfg.cat = DEFAULT_CAT();
    return S.cfg.cat;
  };
  h.cat = cat;
  const brandOf = n => cat().brands.find(b => b.id == n || b.n.toLowerCase() == String(n || '').trim().toLowerCase());
  h.catFuels = () => cat().fuels.filter(f => !f.off).map(f => f.n);
  h.catTrans = () => cat().trans.filter(f => !f.off).map(f => f.n);
  /* brand and model must be in the catalog (and not hidden), unless the owner asks for a new entry */
  h.catCheck = (brand, model, req) => {
    if (req) return { req: true };
    const b = brandOf(brand);
    if (!b || b.off) return { err: 'Choose the brand from the list, or pick "Other (not listed)" to ask ZamMove to add it.' };
    const m = b.models.find(x => x.n.toLowerCase() == String(model || '').trim().toLowerCase());
    if (!m || m.off) return { err: `Choose a ${b.n} model from the list, or pick "Other (not listed)".` };
    return { b, m };
  };
  /* the fuel price scales the per-km rate */
  const fuel = () => S.cfg.fuel || { price: FUEL_REF, ref: FUEL_REF, hist: [] };
  h.fuelK = () => {
    const f = fuel();
    return f.ref > 0 ? f.price / f.ref : 1;
  };
  const baseRates = h.rates;
  h.rates = () => baseRates().map(v => ({ ...v, km0: v.km, km: r2(v.km * h.fuelK()) }));
  const setFuel = (price, by, why) => {
    const f = { ...fuel() };
    f.hist = [...(f.hist || []), { t: now(), by, from: f.price, to: price, why }].slice(-50);
    f.price = price;
    S.cfg.fuel = f;
  };
  /* drivers and owners are referred to by a pseudonymous key in booking preferences */
  h.pkey = em => (em ? sha256('zm-pref:' + em).slice(0, 12) : '');
  const fromKey = k => (k ? (S.users.find(u => h.pkey(u.em) == k) || {}).em || '' : '');
  h.fromKey = fromKey;
  h.prefOf = p => {
    const x = p && typeof p == 'object' ? p : {};
    const pref = {
      brand: str(x.brand, 40),
      color: str(x.color, 30),
      seats: Math.max(0, Math.min(30, Math.round(+x.seats || 0))),
      fuel: str(x.fuel, 20),
      driver: fromKey(str(x.driver, 20)),
    };
    Object.keys(pref).forEach(k => !pref[k] && delete pref[k]);
    return Object.keys(pref).length ? pref : null;
  };
  const eq = (a, b) => String(a || '').trim().toLowerCase() == String(b || '').trim().toLowerCase();
  /* does this vehicle (driven by drvEm) satisfy a booking's preferences? */
  h.prefOk = (pref, v, drvEm) =>
    !pref ||
    (!!v &&
      (!pref.brand || eq(pref.brand, v.brand)) &&
      (!pref.color || eq(pref.color, v.color)) &&
      (!pref.seats || +v.seats >= pref.seats) &&
      (!pref.fuel || eq(pref.fuel, v.fuel)) &&
      (!pref.driver || pref.driver == drvEm));

  return {
    /* admin: add / rename / hide / show / delete an entry of a dropdown list */
    catEdit(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can change the catalog.');
      const kind = p.kind,
        act = p.act,
        n = str(p.n, 40),
        c = cat();
      const L = { fuel: c.fuels, color: c.colors, trans: c.trans }[kind];
      const used = (field, val) => S.vh.some(v => eq(v[field], val));
      const log = () => h.au(me.em, 'catalog ' + act, { kind, n: n || p.id, brand: p.brand || '' });
      if (kind == 'brand') {
        const b = act == 'add' ? null : brandOf(p.id);
        if (act != 'add' && !b) return no('Brand not found.');
        if (act == 'add' || act == 'edit') {
          if (n.length < 2) return no('Enter the brand name.');
          if (c.brands.some(x => x !== b && eq(x.n, n))) return no('That brand is already in the list.');
          if (act == 'add') c.brands.push({ id: slug(n) || rid('BR'), n, models: [] });
          else {
            S.vh.forEach(v => eq(v.brand, b.n) && (v.brand = n)); // vehicles follow the new spelling
            b.n = n;
          }
        } else if (act == 'off' || act == 'on') b.off = act == 'off' || undefined;
        else if (act == 'del') {
          if (used('brand', b.n)) return no(`${b.n} is used by registered vehicles. Hide it instead (no longer offered).`);
          c.brands.splice(c.brands.indexOf(b), 1);
        } else return no('Unknown action.');
        c.brands.sort((a, z) => a.n.localeCompare(z.n));
        log();
        return ok();
      }
      if (kind == 'model') {
        const b = brandOf(p.brand);
        if (!b) return no('Choose the brand first.');
        const m = act == 'add' ? null : b.models.find(x => x.id == p.id);
        if (act != 'add' && !m) return no('Model not found.');
        if (act == 'add' || act == 'edit') {
          if (n.length < 1) return no('Enter the model name.');
          if (b.models.some(x => x !== m && eq(x.n, n))) return no(`${b.n} ${n} is already in the list.`);
          const seats = Math.round(+p.seats || 0),
            fu = str(p.fuel, 20) || 'Gasoline',
            type = str(p.type, 4);
          if (!(seats >= 1 && seats <= 30)) return no('Seats must be between 1 and 30.');
          if (!c.fuels.some(f => f.n == fu)) return no('Choose a fuel from the list.');
          if (act == 'add') b.models.push({ id: slug(n) || rid('MD'), n, type, seats, fuel: fu });
          else {
            S.vh.forEach(v => eq(v.brand, b.n) && eq(v.model, m.n) && (v.model = n));
            Object.assign(m, { n, type, seats, fuel: fu });
          }
          b.models.sort((a, z) => a.n.localeCompare(z.n));
        } else if (act == 'off' || act == 'on') m.off = act == 'off' || undefined;
        else if (act == 'del') {
          if (S.vh.some(v => eq(v.brand, b.n) && eq(v.model, m.n))) return no(`${b.n} ${m.n} is used by registered vehicles. Hide it instead.`);
          b.models.splice(b.models.indexOf(m), 1);
        } else return no('Unknown action.');
        log();
        return ok();
      }
      if (!L) return no('Unknown list.');
      const field = { fuel: 'fuel', color: 'color', trans: 'trans' }[kind];
      const x = act == 'add' ? null : L.find(e => eq(e.n, p.id));
      if (act != 'add' && !x) return no('Entry not found.');
      if (act == 'add' || act == 'edit') {
        if (n.length < 2) return no('Enter the name.');
        if (L.some(e => e !== x && eq(e.n, n))) return no('That entry is already in the list.');
        if (act == 'add') L.push({ n });
        else {
          S.vh.forEach(v => eq(v[field], x.n) && (v[field] = n));
          if (kind == 'fuel') c.brands.forEach(b => b.models.forEach(m => eq(m.fuel, x.n) && (m.fuel = n)));
          x.n = n;
        }
      } else if (act == 'off' || act == 'on') x.off = act == 'off' || undefined;
      else if (act == 'del') {
        if (used(field, x.n)) return no(`"${x.n}" is used by registered vehicles. Hide it instead.`);
        L.splice(L.indexOf(x), 1);
      } else return no('Unknown action.');
      log();
      return ok();
    },
    /* admin: set the fuel price (₱ per litre); the per-km part of new fares follows it */
    fuelSet(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can change the fuel price.');
      const price = r2(p.price),
        why = str(p.why, 200);
      if (!(price >= 20 && price <= 300)) return no('Enter the fuel price per litre (₱20 to ₱300).');
      setFuel(price, me.em, why || 'Set by an administrator');
      h.au(me.em, 'fuel price', { price });
      return ok({ k: h.fuelK() });
    },
    /* owner: ask ZamMove to change the fuel price */
    fuelRequest(me, p) {
      if (!h.okr(me, 'owner') || !h.acct(me)) return no('Only a vehicle owner can request a fuel price change.');
      const price = r2(p.price),
        why = str(p.why, 300);
      if (!(price >= 20 && price <= 300)) return no('Enter the fuel price per litre (₱20 to ₱300).');
      if (why.length < 10) return no('Explain why (at least 10 characters), e.g. the pump price this week.');
      const L = (S.cfg.fuelReqs = S.cfg.fuelReqs || []);
      if (L.some(x => x.by == me.em && x.st == 'Pending')) return no('You already have a request waiting for an administrator.');
      L.push({ id: rid('FR'), by: me.em, name: me.name, price, from: fuel().price, why, t: now(), st: 'Pending' });
      if (L.length > 200) L.splice(0, L.length - 200);
      h.staffEms().forEach(em => h.ntf(em, 'Fuel price request', `${me.name} asks to change the fuel price from ₱${fuel().price} to ₱${price} per litre: ${why}`));
      return ok();
    },
    fuelDecide(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can decide fuel price requests.');
      const x = (S.cfg.fuelReqs || []).find(r => r.id == p.id);
      if (!x || x.st != 'Pending') return no('Request not found or already decided.');
      const note = str(p.note, 300);
      if (!p.ok && note.length < 5) return no('Write the reason for denying (at least 5 characters).');
      Object.assign(x, { st: p.ok ? 'Approved' : 'Denied', note, dby: me.em, dt: now() });
      if (p.ok) setFuel(x.price, me.em, `Request ${x.id} from ${x.name}`);
      h.au(me.em, 'fuel request ' + x.st.toLowerCase(), { id: x.id, price: x.price });
      h.ntf(x.by, 'Fuel price request ' + x.st.toLowerCase(), p.ok ? `The fuel price is now ₱${x.price} per litre. New fares follow it.` : `Not approved: ${note}`);
      return ok();
    },
  };
};
module.exports.DEFAULT_CAT = DEFAULT_CAT;
module.exports.FUEL_REF = FUEL_REF;
