'use strict';
/* Rule helpers bound to the server state S. Every business check lives here or in the action modules, never in the browser. */
const C = require('./constants');
const { now, r2, rid, peso, manilaMs } = require('../util');

module.exports = function makeHelpers(S) {
  const h = {};
  h.U = em => S.users.find(u => u.em == em);
  h.rl = (u, t) => (t == 'customer' ? { t, st: 'approved' } : ((u && u.roles) || []).find(r => r.t == t));
  h.okr = (u, t) => {
    const r = h.rl(u, t);
    return !!r && r.st == 'approved';
  };
  h.acct = u => !!u && u.status != 'suspended';
  h.isAdmin = u => !!u && ['super', 'admin'].includes(u.adm) && h.acct(u);
  h.isSuper = u => !!u && u.adm == 'super' && h.acct(u);
  h.isStaff = u => !!u && !!u.adm && h.acct(u);
  h.canCash = u => !!u && h.acct(u) && (!!u.cash || u.adm == 'super' || u.adm == 'admin');

  h.vOf = id => S.vh.find(v => v.id == id);
  h.asgOf = em => S.asg.find(a => a.driver == em && a.st == 'Active');
  h.vAsg = id => S.asg.find(a => a.vehicle == id && a.st == 'Active');
  h.dAv = em => (S.dp[em] || {}).avail || 'Unavailable';
  /* a vehicle works only while its owner's account is active and the owner role was not taken away */
  h.ownerActive = v => {
    const o = v && h.U(v.owner);
    return !!o && h.acct(o) && !(o.roles || []).some(r => r.t == 'owner' && r.st == 'revoked');
  };
  h.vOper = v => !!v && v.approval == 'Approved' && v.status == 'Available' && h.ownerActive(v);

  h.done = b => ['Completed', 'Cancelled', 'Rejected'].includes(b.st);
  /* fares per vehicle type: the built-in rates, overridden by the administrator's settings */
  h.rates = () => C.HV.map(v => ({ ...v, ...((S.cfg.rates || {})[v.id] || {}) }));
  h.rateOf = id => h.rates().find(v => v.id == id);
  /* simulated SMS / email: what a real provider would deliver, kept out of the app's own screens.
     addr is the phone number or email it was "sent" to; to is the account (if any). */
  h.sim = (addr, ch, body, to) => {
    S.nt.unshift({ id: rid('SM'), to: to || '', addr: String(addr || '').toLowerCase(), sim: ch, t: now(), h: 'Simulated ' + ch, b: body, r: false });
    if (S.nt.length > 5000) S.nt.length = 5000;
  };
  /* a driver is late when the pickup time passed LATE_MIN minutes ago and he has not arrived */
  h.late = b =>
    !!b.drvUser && ['Accepted', 'On the Way to Pickup'].includes(b.st) && Date.now() > h.t0(b) + C.LATE_MIN * 6e4;
  h.t0 = b => manilaMs(b.dt, b.tm);
  h.dur = k => Math.ceil(2 + (+k || 10) / 20) * 36e5;
  h.ovl = (a, b) => {
    const x = h.t0(a),
      y = h.t0(b);
    return x < y + h.dur(b.km || 10) && y < x + h.dur(a.km || 10);
  };
  h.onRoad = (em, ex) => S.bk.some(b => b.drvUser == em && b.id != ex && C.ROAD.includes(b.st));
  h.tripOf = em => S.bk.filter(b => b.drvUser == em && !h.done(b));

  /* seats, transmission and fuel entered by the owner (seats default to the type's usual count) */
  h.vSpec = (ty, p) => {
    const seats =
        p.seats === '' || p.seats == null ? (C.TYPE_INFO[ty.id] || {}).seats || 2 : Math.round(+p.seats),
      trans = p.trans || 'Manual',
      fuel = p.fuel || 'Diesel';
    if (!(seats >= 1 && seats <= 30)) return { err: 'Seats must be between 1 and 30.' };
    if (!['Manual', 'Automatic'].includes(trans)) return { err: 'Choose Manual or Automatic.' };
    if (!['Diesel', 'Gasoline', 'Electric'].includes(fuel)) return { err: 'Choose the fuel type.' };
    return { seats, trans, fuel };
  };
  /* load limit of one vehicle: what its owner entered, otherwise its type's limit */
  h.vKg = v => (v && (+v.kg || (C.HV.find(t => t.id == v.type) || {}).kg)) || 0;
  /* cargo specs entered by the owner of a hauling vehicle: max load (required) and bed size (optional).
     The load cannot exceed what the vehicle type is rated for. */
  h.loadSpec = (ty, p) => {
    if (ty.rentOnly || !ty.kg) return {};
    const kg = Math.round(+p.kg);
    if (!(kg >= 100 && kg <= ty.kg))
      return { err: `Enter the maximum load in kg (100 to ${ty.kg.toLocaleString('en-PH')} for a ${ty.n}), as shown on the registration.` };
    const dims = [p.bedL, p.bedW, p.bedH].map(x => (x === '' || x == null ? null : Math.round(+x * 10) / 10));
    let bed = null;
    if (dims.some(x => x != null)) {
      if (dims.slice(0, 2).some(x => !(x >= 1 && x <= 30)) || (dims[2] != null && !(dims[2] >= 0 && dims[2] <= 15)))
        return { err: 'Enter the cargo bed length and width in feet (1 to 30), and the height (0 for an open bed).' };
      bed = [dims[0], dims[1], dims[2] || 0];
    }
    const b = bed || ty.bed;
    const cap = `${kg.toLocaleString('en-PH')} kg` + (b ? ` · ${b[0]} × ${b[1]}${b[2] ? ' × ' + b[2] : ''} ft${b[2] ? '' : ' open'} bed` : '');
    return { kg, bed, cap };
  };
  /* legal documents of a vehicle: CTPL insurance always, LTFRB franchise (CPC) for hauling types */
  const D8 = /^\d{4}-\d{2}-\d{2}$/;
  h.legalOf = (ty, p) => {
    const t = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10),
      ins = String(p.ins || '').trim().slice(0, 40),
      insExp = String(p.insExp || '').slice(0, 10),
      cpc = String(p.cpc || '').trim().slice(0, 40),
      cpcExp = String(p.cpcExp || '').slice(0, 10);
    if (ins.length < 4) return { err: 'Enter the CTPL insurance policy number.' };
    if (!D8.test(insExp) || insExp <= t) return { err: 'The insurance must not be expired (enter its expiry date).' };
    if (!ty.rentOnly) {
      if (cpc.length < 5) return { err: 'Enter the LTFRB franchise (CPC) number. Hauling for hire requires it.' };
      if (!D8.test(cpcExp) || cpcExp <= t) return { err: 'The LTFRB franchise must not be expired (enter its expiry date).' };
    }
    const doc = f => (typeof f == 'string' && /^data:image\//.test(f) && f.length < 2.8e6 ? f : '');
    return { rec: { ins, insExp, insDoc: doc(p.insDoc), ...(ty.rentOnly ? {} : { cpc, cpcExp, cpcDoc: doc(p.cpcDoc) }), t: now() } };
  };
  /* what is missing or expired (strict: missing counts too, used when approving) */
  h.legalIssues = (v, ty, strict) => {
    const L = (v && v.legal) || {},
      t = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10),
      out = [];
    if (!L.insExp) strict && out.push('CTPL insurance missing');
    else if (L.insExp < t) out.push('Insurance expired on ' + L.insExp);
    if (!(ty || {}).rentOnly) {
      if (!L.cpcExp) strict && out.push('LTFRB franchise (CPC) missing');
      else if (L.cpcExp < t) out.push('LTFRB franchise expired on ' + L.cpcExp);
    }
    return out;
  };
  /* self-drive rentals of registered vehicles */
  h.rentable = v =>
    !!v &&
    v.approval == 'Approved' &&
    h.ownerActive(v) &&
    !!v.rent &&
    !!v.rent.on &&
    +v.rent.day > 0 &&
    !['Maintenance', 'Unavailable'].includes(v.status);
  /* rentals that hold the vehicle on a date (approved or released; pending requests do not block hauling) */
  h.rentedOn = (vid, dt) =>
    S.rn.some(r => r.veh == vid && ['Approved', 'Active'].includes(r.st) && r.s <= dt && dt <= r.e);
  /* why a vehicle cannot be rented for s..e ('' when it can) */
  h.rentClash = (vid, s, e, exceptId) => {
    if (S.rn.some(r => r.id != exceptId && r.veh == vid && C.RBUSY.includes(r.st) && s <= r.e && e >= r.s))
      return 'This vehicle is already reserved for some of those dates.';
    if (S.bk.some(b => b.veh == vid && !h.done(b) && b.dt >= s && b.dt <= e))
      return 'This vehicle has a hauling trip on one of those dates.';
    return '';
  };

  /* the 7 driver-eligibility rules, evaluated on the server at accept time */
  h.chk = (em, b) => {
    const u = h.U(em),
      as = h.asgOf(em),
      v = as && h.vOf(as.vehicle),
      hv = C.HV.find(x => x.id == b.vid) || { n: b.vid };
    return [
      ['Your driver account is approved and active', h.okr(u, 'driver') && h.acct(u)],
      ['You have an approved vehicle assignment', !!as],
      ['Your vehicle is approved and operational', h.vOper(v)],
      [
        'Your license, clearance and vehicle registration are valid',
        !(h.driverDocIssues ? h.driverDocIssues(em) : []).length &&
          !(h.vehDocIssues ? h.vehDocIssues(v) : []).length,
      ],
      [
        'Your vehicle is free for this schedule',
        !!v && !S.bk.some(x => x.id != b.id && x.veh == v.id && !h.done(x) && h.ovl(x, b)),
      ],
      [
        'You are set to Available and not in the middle of a trip',
        h.dAv(em) == 'Available' && !h.onRoad(em, b.id),
      ],
      ['Your vehicle type matches the booking (' + hv.n + ')', !!v && v.type == b.vid],
      ['Your vehicle is not rented out that day', !!v && !h.rentedOn(v.id, b.dt)],
      [
        b.wt ? `Your vehicle can carry this load (about ${(+b.wt).toLocaleString('en-PH')} kg)` : 'Your vehicle can carry this load',
        !b.wt || (!!v && h.vKg(v) >= b.wt),
      ],
      [
        'No overdue remittance and less than ' + peso(+S.cfg.cashCap || 5000) + ' of collected money on hand',
        !h.overdue(em) && h.cashHeld(em) < (+S.cfg.cashCap || 5000),
      ],
      [
        'You have no conflicting booking',
        !S.bk.some(x => x.id != b.id && x.drvUser == em && !h.done(x) && h.ovl(x, b)),
      ],
    ];
  };
  /* capacity: usable vehicles of a type minus overlapping bookings of that type */
  h.fleetOf = type =>
    S.vh.filter(v => {
      if (v.type != type || v.approval != 'Approved' || v.status == 'Maintenance' || !h.ownerActive(v)) return false;
      const a = h.vAsg(v.id),
        u = a && h.U(a.driver);
      return !!u && h.okr(u, 'driver') && h.acct(u) && h.dAv(u.em) != 'Temporarily Suspended';
    });
  h.capFree = p => {
    const V = h.fleetOf(p.vid).filter(v => !p.wt || h.vKg(v) >= p.wt),
      O = S.bk.filter(
        x => x.id != p.id && x.vid == p.vid && !h.done(x) && x.st != 'No driver found' && h.ovl(x, p)
      );
    const busy = new Set(O.filter(x => x.veh).map(x => x.veh));
    V.forEach(v => h.rentedOn(v.id, p.dt) && busy.add(v.id));
    return V.filter(v => !busy.has(v.id)).length - O.filter(x => !x.veh).length;
  };
  h.eligibleDrivers = b =>
    S.users.filter(u => u.em != b.cu && h.okr(u, 'driver') && h.chk(u.em, b).every(c => c[1]));

  /* one payment model */
  h.counted = p => !!p && C.PAY_OK.includes(p.status);
  h.half = b => Math.round(Math.round((+b.tot || 0) * 100) / 2) / 100;
  h.due = (b, k) => (k == 'down' ? h.half(b) : r2((+b.tot || 0) - h.half(b)));
  h.paySum = (bid, kind) =>
    r2(
      S.pay
        .filter(p => p.bid == bid && (!kind || p.kind == kind) && h.counted(p))
        .reduce((s, p) => s + p.amount, 0)
    );
  h.payPending = (bid, kind) =>
    r2(
      S.pay
        .filter(p => p.bid == bid && (!kind || p.kind == kind) && p.status == 'Submitted')
        .reduce((s, p) => s + p.amount, 0)
    );
  h.payMk = o => ({ id: rid('PY'), t: now(), payer: '', collectedBy: '', ...o });
  h.gross = b =>
    r2(S.pay.filter(p => p.bid == b.id && p.by && h.counted(p)).reduce((s, p) => s + p.amount, 0));
  /* tell the owner of the booking's vehicle */
  h.splitOf = b => {
    if (b.split) return b.split;
    const full = r2(b.tot),
      fare = b.charged != null ? r2(b.charged) : full,
      k = full > 0 ? fare / full : 0, // a trip closed early is charged only part of the fare
      fee = r2(((b.bd || [])[3] || 0) * k),
      mov = r2(((b.bd || [])[2] || 0) * k), // helpers the driver brought: all to the driver
      pool = r2(Math.max(0, fare - fee - mov));
    const a =
      S.asg.find(x => x.vehicle == b.veh && x.driver == b.drvUser && x.terms && x.st == 'Active') ||
      S.asg.find(x => x.vehicle == b.veh && x.driver == b.drvUser && x.terms);
    const pct = a ? +a.terms.pct : +S.cfg.drvPct || 20,
      comm = S.cfg.comm == null ? 15 : +S.cfg.comm;
    const share = r2((pool * pct) / 100),
      zc = r2((pool * comm) / 100),
      own = r2(Math.max(0, pool - share - zc));
    const v = h.vOf(b.veh) || {};
    return { fare, fee, pool, pct, comm, mov, drv: r2(share + mov), zc, own, zam: r2(fee + zc), owner: v.owner || '' };
  };
  h.dueFor = b => r2(Math.max(0, h.gross(b) - h.splitOf(b).drv));
  /* trips a driver must remit: completed, or closed early with money collected */
  h.closedPaid = b => b.st == 'Completed' || (b.st == 'Cancelled' && b.charged != null);
  h.remOk = id => {
    const r = S.rem.find(x => x.id == id);
    return !!r && ['Verified', 'Resolved'].includes(r.st);
  };
  /* company money a driver still holds: collected on closed trips and not yet received by the cashier */
  h.cashHeld = em =>
    r2(
      S.bk
        .filter(b => b.drvUser == em && h.closedPaid(b) && !(b.rem && h.remOk(b.rem)))
        .reduce((s, b) => s + h.dueFor(b), 0) + h.drvDebit(em) - h.drvCredit(em)
    );
  /* a week's trips are due 3 days after the week ends (Monday + 10 days) */
  h.overdue = em =>
    S.bk.some(
      b => b.drvUser == em && h.closedPaid(b) && !b.rem && b.cd && Date.now() > new Date(h.wk(b.cd)).getTime() + 10 * 864e5
    );
  /* upheld wrong-change claims a driver must pay back, not yet added to a remittance */
  h.drvDebit = em =>
    r2(S.pay.filter(p => p.kind == 'change_charge' && p.payer == em && p.status == 'Due').reduce((s, p) => s + p.amount, 0));
  /* a strike on a driver (late, no-show, wrong change); 3 in 90 days send the driver to admin review */
  h.strike = (em, bid, why) => {
    const d = h.U(em);
    if (!d) return 0;
    const t = now();
    (d.strikes = d.strikes || []).push({ bid, t, why });
    const recent = d.strikes.filter(x => Date.now() - new Date(x.t).getTime() < 90 * 864e5).length;
    h.au('system', 'driver strike', { driver: em, bk: bid, why, recent });
    if (recent >= C.STRIKES_REVIEW)
      h.staffEms().forEach(s => h.ntf(s, 'Driver review needed', `${d.name} has ${recent} strikes in 90 days (latest: ${why}).`));
    return recent;
  };
  /* verified cancellation fees owed to a driver, not yet set off against a remittance */
  h.drvCredit = em =>
    r2(S.pay.filter(p => p.kind == 'cancel_fee' && p.to == em && p.status == 'Verified' && !p.applied).reduce((s, p) => s + p.amount, 0));
  /* owner earnings: payable only once ZamMove actually has the money
       trips: after the driver's remittance is verified; rentals: when completed (the cashier verified the payments) */
  h.ownerBal = em => {
    const trips = S.bk.filter(b => h.closedPaid(b) && h.splitOf(b).owner == em),
      ok = trips.filter(b => b.rem && h.remOk(b.rem)),
      rents = S.rn.filter(r => r.owner == em && r.st == 'Completed' && r.split);
    const earnedTrips = r2(ok.reduce((s, b) => s + h.splitOf(b).own, 0)),
      waiting = r2(trips.filter(b => !ok.includes(b)).reduce((s, b) => s + h.splitOf(b).own, 0)),
      earnedRent = r2(rents.reduce((s, r) => s + r.split.own + (r.split.kept || 0), 0));
    const earned = r2(earnedTrips + earnedRent);
    const paid = r2(S.pay.filter(p => p.kind == 'owner_payout' && p.to == em).reduce((s, p) => s + p.amount, 0));
    return { earned, earnedTrips, earnedRent, waiting, paid, due: r2(earned - paid) };
  };
  h.ntfOwner = (b, head, body) => {
    const v = b && h.vOf(b.veh);
    if (v && v.owner && v.owner != b.drvUser) h.ntf(v.owner, head, body);
  };
  h.rate = () => +S.cfg.coShare || 0;
  h.dueOf = g => r2((g * h.rate()) / 100);
  h.wk = t => {
    const d = new Date(new Date(t).getTime() + 8 * 36e5);
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  };
  h.remBks = em => S.bk.filter(b => b.drvUser == em && h.closedPaid(b) && !b.rem);
  h.cancelFee = b => (C.CANCEL_FREE.includes(b.st) ? 0 : Math.round((+b.tot || 0) * 10) / 100);
  h.rentPaid = r => h.paySum(r.id);
  h.depOf = r => +r.dep || 2000; // deposit fixed on the rental when it was requested (₱2,000 for rentals made before per-vehicle deposits)
  h.rentDue = r => r2(r.tot + ((r.late && r.late.amt) || 0)); // rental fee plus any late-return charge
  h.rentBal = r => r2(h.rentDue(r) + h.depOf(r) - h.rentPaid(r));

  /* audit, notifications, booking timeline */
  h.au = (who, evt, data) => {
    S.au.push({ id: rid('AU'), t: now(), who, evt, data: data || null });
  };
  h.ntf = (to, head, body) => {
    const u = h.U(to);
    /* every notification is kept in the app. "Trip alerts" off only means no SMS/email alerts once those are connected
       (it used to drop the notification entirely, so customers silently missed payments and claims). */
    if (!to || !u) return;
    S.nt.unshift({
      id: rid('NT'),
      to,
      t: now(),
      h: head,
      b: body,
      r: false,
      ...(u.alertsOff ? { quiet: true } : {}),
    });
    if (S.nt.length > 5000) S.nt.length = 5000;
  };
  h.ev = (b, by, to, note) => {
    (b.ev = b.ev || []).push({ t: now(), by, from: b.st, to, note: note || '' });
    b.st = to;
  };
  const sh = t => String(t || '').split(',')[0];
  h.tellDrivers = b =>
    h
      .eligibleDrivers(b)
      .forEach(u =>
        h.ntf(u.em, 'New booking request', `${b.id}: ${sh(b.pu)} to ${sh(b.dr)}, ${b.dt} ${b.tm}.`)
      );
  h.staffEms = () => S.users.filter(u => h.isAdmin(u)).map(u => u.em);

  /* bookings nobody accepts within cfg.pendMin minutes become "No driver found" */
  h.sweep = () => {
    const N = (+S.cfg.pendMin || 30) * 6e4,
      t = Date.now();
    let ch = 0;
    S.bk.forEach(b => {
      if (b.st != 'Pending' || b.drvUser || !b.cr) return;
      const t0 = h.t0(b),
        from = new Date(b.pendFrom || b.cr).getTime(),
        /* same-day: the usual waiting time; scheduled: open until OPEN_UNTIL_H hours before pickup; never past pickup */
        until = Math.min(t0, Math.max(from + N, t0 - C.OPEN_UNTIL_H * 36e5));
      if (!b.warned && t < until && t0 - t < 6 * 36e5 && t0 - t > C.OPEN_UNTIL_H * 36e5) {
        b.warned = true;
        h.staffEms().forEach(em => h.ntf(em, 'No driver yet', `${b.id} (${b.dt} ${b.tm}) has no driver. Assign one or contact the customer.`));
        ch = 1;
      }
      if (t > until) {
        h.ev(b, 'system', 'No driver found', t0 - from > N + C.OPEN_UNTIL_H * 36e5 ? `No driver accepted by ${C.OPEN_UNTIL_H} hours before pickup` : `No driver accepted within ${S.cfg.pendMin || 30} minutes`);
        h.au('system', 'booking timed out', { bk: b.id });
        h.ntf(
          b.cu,
          'No driver found',
          b.id + ' was not accepted in time. Re-submit it or cancel it at no charge.'
        );
        ch = 1;
      }
    });
    return ch;
  };

  /* driver rating summary, shared with every view (no reviewer identities) */
  h.ratings = () => {
    const m = {};
    S.rev.forEach(r => {
      const b = S.bk.find(x => x.id == r.bid);
      if (b && b.drvUser) {
        m[b.drvUser] = m[b.drvUser] || { s: 0, n: 0 };
        m[b.drvUser].s += r.r;
        m[b.drvUser].n++;
      }
    });
    Object.keys(m).forEach(k => {
      m[k] = { avg: Math.round((m[k].s / m[k].n) * 10) / 10, n: m[k].n };
    });
    return m;
  };
  return h;
};
