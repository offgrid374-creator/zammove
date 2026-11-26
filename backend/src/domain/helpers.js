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
  h.vOper = v => !!v && v.approval == 'Approved' && v.status == 'Available' && h.ownerActive(v) && !(h.U(v.owner) || {}).rentPaused; // paused: owner overdue on their ZamMove remittance

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
    /* the lists come from the admin catalog (catalog.js); the defaults keep older callers working */
    const TR = h.catTrans ? h.catTrans() : ['Manual', 'Automatic'],
      FU = h.catFuels ? h.catFuels() : ['Diesel', 'Gasoline', 'Electric', 'Hybrid'];
    if (!TR.includes(trans)) return { err: 'Choose the transmission from the list.' };
    if (!FU.includes(fuel)) return { err: 'Choose the fuel type from the list.' };
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
  /* which franchise a hauling type needs: LTFRB grants it for vans and trucks for hire; for tricycles
     (3-wheelers) it is the city's Motorized Tricycle Operator's Permit (MTOP) */
  h.frOf = ty =>
    (ty || {}).fr == 'mtop'
      ? { name: 'city tricycle franchise (MTOP)', Name: 'City tricycle franchise (MTOP)' }
      : { name: 'LTFRB franchise (CPC)', Name: 'LTFRB franchise (CPC)' };
  /* legal documents of a vehicle: CTPL insurance always, and the franchise for hauling types */
  const D8 = /^\d{4}-\d{2}-\d{2}$/;
  /* old: the vehicle's current documents; on a renewal an unchanged document keeps its photo */
  h.legalOf = (ty, p, old) => {
    const t = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10),
      ins = String(p.ins || '').trim().slice(0, 40),
      insExp = String(p.insExp || '').slice(0, 10),
      cpc = String(p.cpc || '').trim().slice(0, 40),
      cpcExp = String(p.cpcExp || '').slice(0, 10);
    if (ins.length < 4) return { err: 'Enter the CTPL insurance policy number.' };
    if (!D8.test(insExp) || insExp <= t) return { err: 'The insurance must not be expired (enter its expiry date).' };
    if (!ty.rentOnly) {
      const F = h.frOf(ty);
      if (cpc.length < 5) return { err: `Enter the ${F.name} number. Hauling for hire requires it.` };
      if (!D8.test(cpcExp) || cpcExp <= t) return { err: `The ${F.name} must not be expired (enter its expiry date).` };
    }
    const doc = f => (typeof f == 'string' && /^data:image\//.test(f) && f.length < 2.8e6 ? f : ''),
      O = old || {},
      insDoc = doc(p.insDoc) || (O.ins == ins && O.insExp == insExp ? O.insDoc || '' : ''),
      cpcDoc = ty.rentOnly ? '' : doc(p.cpcDoc) || (O.cpc == cpc && O.cpcExp == cpcExp ? O.cpcDoc || '' : '');
    if (!insDoc) return { err: 'Upload a photo of the CTPL insurance policy, so the admin can check the number and expiry.' };
    if (!ty.rentOnly && !cpcDoc)
      return { err: `Upload a photo of the ${h.frOf(ty).name}, so the admin can check the number and expiry.` };
    return { rec: { ins, insExp, insDoc, ...(ty.rentOnly ? {} : { cpc, cpcExp, cpcDoc }), t: now() } };
  };
  /* what is missing or expired (strict: missing counts too, used when approving) */
  h.legalIssues = (v, ty, strict) => {
    const L = (v && v.legal) || {},
      t = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10),
      out = [];
    if (!L.insExp) strict && out.push('CTPL insurance missing');
    else if (L.insExp < t) out.push('Insurance expired on ' + L.insExp);
    if (!(ty || {}).rentOnly) {
      if (!L.cpcExp) strict && out.push(h.frOf(ty).Name + ' missing');
      else if (L.cpcExp < t) out.push(h.frOf(ty).Name + ' expired on ' + L.cpcExp);
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
    !(h.U(v.owner) || {}).rentPaused && // listings pause while the owner owes ZamMove for too long
    !['Maintenance', 'Unavailable'].includes(v.status);
  /* a reservation holds its vehicle between the drop-off and the pick-up (the customer pays a daily hold fee) */
  h.heldOn = (vid, dt, b) =>
    S.bk.some(x => {
      if (!x.pkg || x.veh != vid || x.st == 'Cancelled' || (b && (b.id == x.id || b.pkgOf == x.id))) return false;
      const r = S.bk.find(y => y.id == x.pkg.ret);
      return !!r && !h.done(r) && dt > x.dt && dt < r.dt;
    });
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
        !!v && !S.bk.some(x => x.id != b.id && x.veh == v.id && !h.done(x) && h.ovl(x, b)) && !h.heldOn(v.id, b.dt, b),
      ],
      [
        'You are set to Available and not in the middle of a trip',
        h.dAv(em) == 'Available' && !h.onRoad(em, b.id),
      ],
      ['Your vehicle type matches the booking (' + hv.n + ')', !!v && v.type == b.vid],
      ['Your vehicle matches the customer’s preferences', !b.pref || !h.prefOk || h.prefOk(b.pref, v, em)],
      ['Your vehicle is not rented out that day', !!v && !h.rentedOn(v.id, b.dt)],
      ['You are not driving a rental that day', !S.rn.some(r => r.withDrv && r.withDrv.em == em && ['Approved', 'Active'].includes(r.st) && r.s <= b.dt && b.dt <= r.e)],
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
    V.forEach(v => (h.rentedOn(v.id, p.dt) || h.heldOn(v.id, p.dt)) && busy.add(v.id));
    return V.filter(v => !busy.has(v.id)).length - O.filter(x => !x.veh).length;
  };
  h.eligibleDrivers = b =>
    S.users.filter(u => u.em != b.cu && h.okr(u, 'driver') && h.chk(u.em, b).every(c => c[1]));

  /* one payment model */
  h.counted = p => !!p && C.PAY_OK.includes(p.status);
  h.half = b => Math.round(Math.round((+b.tot || 0) * 100) / 2) / 100;
  h.due = (b, k) => (k == 'down' ? h.half(b) : r2(Math.max(0, (+b.tot || 0) - h.half(b) - ((b.odisc && +b.odisc.amt) || 0)))); // an owner discount lowers the balance
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
      disc = r2((b.odisc && +b.odisc.amt) || 0), // an owner discount comes out of the owner's share only
      own = r2(Math.max(0, pool - share - zc) - disc);
    const v = h.vOf(b.veh) || {};
    return { fare, fee, pool, pct, comm, mov, drv: r2(share + mov), zc, own, zam: r2(fee + zc), owner: v.owner || '', ...(disc ? { odisc: disc } : {}) };
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
        .filter(b => b.drvUser == em && h.closedPaid(b) && b.flow != 'owner' && !(b.rem && h.remOk(b.rem)))
        .reduce((s, b) => s + h.dueFor(b), 0) +
        h.drvDebit(em) -
        h.drvCredit(em) +
        (h.turnOwed ? h.turnOwed(em) : 0) // owners' money the driver still holds (driver → owner → ZamMove)
    );
  /* a week's trips are due 3 days after the week ends (Monday + 10 days) */
  h.overdue = em =>
    S.bk.some(
      b => b.drvUser == em && h.closedPaid(b) && b.flow != 'owner' && !b.rem && b.cd && Date.now() > new Date(h.wk(b.cd)).getTime() + 10 * 864e5
    ) || (h.turnOverdue ? h.turnOverdue(em) : false);
  /* upheld wrong-change claims a driver must pay back, not yet added to a remittance */
  h.DEBIT_KINDS = ['change_charge', 'case_charge'];
  h.drvDebit = em =>
    r2(S.pay.filter(p => h.DEBIT_KINDS.includes(p.kind) && p.payer == em && p.status == 'Due' && !(h.viaOwner && h.viaOwner(p))).reduce((s, p) => s + p.amount, 0)); // older bookings only
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
    r2(S.pay.filter(p => p.kind == 'cancel_fee' && p.to == em && p.status == 'Verified' && !p.applied && !(h.viaOwner && h.viaOwner(p))).reduce((s, p) => s + p.amount, 0)); // older bookings only
  /* owner earnings: payable only once ZamMove actually has the money
       trips: after the driver's remittance is verified; rentals: when completed (the cashier verified the payments) */
  h.ownerBal = em => {
    const trips = S.bk.filter(b => h.closedPaid(b) && b.flow != 'owner' && h.splitOf(b).owner == em),
      ok = trips.filter(b => b.rem && h.remOk(b.rem)),
      rents = S.rn.filter(r => r.owner == em && ['Completed', 'Cancelled'].includes(r.st) && r.split), // a late cancellation fee counts too
      closedIds = new Set(S.rn.filter(r => r.owner == em && ['Completed', 'Cancelled'].includes(r.st)).map(r => r.id));
    const earnedTrips = r2(ok.reduce((s, b) => s + h.splitOf(b).own, 0)),
      waiting = r2(trips.filter(b => !ok.includes(b)).reduce((s, b) => s + h.splitOf(b).own, 0)),
      earnedRent = r2(rents.reduce((s, r) => s + r.split.own + (r.split.kept || 0), 0));
    const earned = r2(earnedTrips + earnedRent);
    /* rental cash the owner received at pickup (completed rentals): ZamMove's commission and the deposit refund are in it */
    const doneIds = closedIds,
      refunded = r2(S.pay.filter(p => ['deposit_refund', 'refund'].includes(p.kind) && p.from == em && ['Sent', 'Paid'].includes(p.status)).reduce((s, p) => s + p.amount, 0)),
      held = r2(S.pay.filter(p => p.coll == em && p.status == 'Verified' && doneIds.has(p.bid)).reduce((s, p) => s + p.amount, 0) - refunded),
      heldOpen = r2(S.pay.filter(p => p.coll == em && p.status == 'Verified' && !doneIds.has(p.bid)).reduce((s, p) => s + p.amount, 0));
    const paid = r2(S.pay.filter(p => p.kind == 'owner_payout' && p.to == em).reduce((s, p) => s + p.amount, 0)),
      settled = r2(S.pay.filter(p => p.kind == 'owner_remit' && p.payer == em && p.status == 'Verified').reduce((s, p) => s + p.amount, 0)),
      sent = r2(S.pay.filter(p => p.kind == 'owner_remit' && p.payer == em && p.status == 'Submitted').reduce((s, p) => s + p.amount, 0));
    /* driver → owner → ZamMove: ZamMove's portion of trips on the owner's vehicles, and fees/charges for their drivers */
    const tripsOwed = h.ownerTripsOwed ? h.ownerTripsOwed(em) : 0,
      cross = h.ownerCross ? h.ownerCross(em) : 0;
    return { earned, earnedTrips, earnedRent, waiting, paid, held, heldOpen, settled, sent, tripsOwed, cross, due: r2(earned - paid - held + settled - tripsOwed + cross) };
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
  h.remBks = em => S.bk.filter(b => b.drvUser == em && h.closedPaid(b) && b.flow != 'owner' && !b.rem); // older trips: driver → ZamMove
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
      if (b.st != 'Pending' || b.drvUser || !b.cr || b.pkgOf) return;
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
    /* a driver who accepted but is late: tell everyone at LATE_MIN; at GHOST_MIN without setting off, the job reopens */
    S.bk.forEach(b => {
      if (!b.drvUser || !['Accepted', 'On the Way to Pickup'].includes(b.st) || b.pkgOf) return;
      const late = t - h.t0(b);
      if (late > C.LATE_MIN * 6e4 && !b.lateWarn) {
        b.lateWarn = now();
        h.ntf(b.cu, 'Your driver is late', `${b.id}: your driver has not arrived ${C.LATE_MIN} minutes after the pickup time. You can keep waiting, chat or call the driver, or cancel at no charge (the driver gets a strike).`);
        h.ntf(b.drvUser, 'You are late', `${b.id}: you are ${C.LATE_MIN} minutes past the pickup time. Head to the pickup now or tell the customer. If you have not set off within ${C.GHOST_MIN} minutes of the pickup time, the job is given to another driver.`);
        h.staffEms().forEach(em => h.ntf(em, 'Driver late', `${b.id} (${b.dt} ${b.tm}): the driver is ${C.LATE_MIN} minutes late (${b.st}).`));
        if (h.ntfOwner) h.ntfOwner(b, 'Driver late', `${b.id}: your driver is ${C.LATE_MIN} minutes late.`);
        ch = 1;
      }
      if (b.st == 'Accepted' && late > C.GHOST_MIN * 6e4) {
        const drv = b.drvUser,
          name = b.drv || (h.U(drv) || {}).name || 'The driver';
        h.strike(drv, b.id, 'Did not come to the pickup');
        (b.ghosted = b.ghosted || []).push({ drv, t: now() });
        b.declined = [...new Set([...(b.declined || []), drv])];
        delete b.drvUser;
        delete b.veh;
        delete b.drv;
        delete b.acc;
        delete b.lateWarn;
        /* the linked reserved pick-up was promised to the same driver: release it too */
        S.bk.filter(x => x.pkgOf == b.id && x.drvUser == drv && x.st == 'Accepted').forEach(x => {
          delete x.drvUser;
          delete x.veh;
          delete x.drv;
          x.released = true;
          h.ev(x, 'system', 'Pending', 'Released: the driver did not come to the first pickup');
        });
        h.ev(b, 'system', 'No driver found', `${name} did not set off ${C.GHOST_MIN} minutes after the pickup time. The job was taken back.`);
        h.au('system', 'driver no-show', { bk: b.id, driver: drv });
        h.ntf(b.cu, 'We are finding you another driver', `${b.id}: your driver did not come. Choose a new time and re-submit it in My bookings (no charge), or cancel. ZamMove staff were told and can assign a driver.`);
        h.ntf(drv, 'Job taken back', `${b.id}: you did not set off ${C.GHOST_MIN} minutes after the pickup time, so the job was taken back and a strike was recorded.`);
        h.staffEms().forEach(em => h.ntf(em, 'Driver did not come', `${b.id}: ${name} never set off. The booking is open again; assign a driver or contact the customer.`));
        ch = 1;
      }
    });
    /* a trip that stops moving with the customer's items on board: staff and the customer are told once */
    S.bk.forEach(b => {
      if (!['Down Payment Confirmed', 'Items Loaded', 'In Transit'].includes(b.st) || b.stallWarn) return;
      const last = (b.ev || []).slice(-1)[0],
        since = last ? t - new Date(last.t).getTime() : 0,
        gpsAge = b.gps && b.gps.ms ? t - b.gps.ms : Infinity,
        limit = h.dur(b.km) + 2 * 36e5;
      if (since > limit && gpsAge > 30 * 6e4) {
        b.stallWarn = now();
        h.staffEms().forEach(em => h.ntf(em, 'Trip not moving', `${b.id}: no update for ${Math.round(since / 36e5)} hours (${b.st}) and no recent location. Call the driver and the customer.`));
        h.ntf(b.cu, 'Checking on your trip', `${b.id}: your trip has had no update for a while. ZamMove staff were told and will call your driver. Use Report a problem if something is wrong.`);
        ch = 1;
      }
    });
    if (h.sweepRentals && h.sweepRentals()) ch = 1;
    if (h.sweepDrafts && h.sweepDrafts()) ch = 1;
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
