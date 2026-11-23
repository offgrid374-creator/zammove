'use strict';
/* Rule helpers bound to the server state S. Every business check lives here or in the action modules, never in the browser. */
const C = require('./constants');
const { now, r2, rid, manilaMs } = require('../util');

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
  h.vOper = v => !!v && v.approval == 'Approved' && v.status == 'Available';

  h.done = b => ['Completed', 'Cancelled', 'Rejected'].includes(b.st);
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
  /* self-drive rentals of registered vehicles */
  h.rentable = v =>
    !!v &&
    v.approval == 'Approved' &&
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
        'You have no conflicting booking',
        !S.bk.some(x => x.id != b.id && x.drvUser == em && !h.done(x) && h.ovl(x, b)),
      ],
    ];
  };
  /* capacity: usable vehicles of a type minus overlapping bookings of that type */
  h.fleetOf = type =>
    S.vh.filter(v => {
      if (v.type != type || v.approval != 'Approved' || v.status == 'Maintenance') return false;
      const a = h.vAsg(v.id),
        u = a && h.U(a.driver);
      return !!u && h.okr(u, 'driver') && h.acct(u) && h.dAv(u.em) != 'Temporarily Suspended';
    });
  h.capFree = p => {
    const V = h.fleetOf(p.vid),
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
  /* THE money model, per trip:
       fare = what the customer pays; fee = the 5% service fee (ZamMove); pool = fare - fee
       driver = pool x driver's share (from the driver agreement, else the default setting)
       ZamMove commission = pool x commission setting; owner = the rest
       The driver keeps his share of what he collects and remits the rest; the cashier pays the owner.
       Frozen on the booking when it completes (b.split), so later setting changes never rewrite history. */
  h.splitOf = b => {
    if (b.split) return b.split;
    const fare = r2(b.tot),
      fee = r2((b.bd || [])[3] || 0),
      pool = r2(Math.max(0, fare - fee));
    const a =
      S.asg.find(x => x.vehicle == b.veh && x.driver == b.drvUser && x.terms && x.st == 'Active') ||
      S.asg.find(x => x.vehicle == b.veh && x.driver == b.drvUser && x.terms);
    const pct = a ? +a.terms.pct : +S.cfg.drvPct || 20,
      comm = S.cfg.comm == null ? 15 : +S.cfg.comm;
    const drv = r2((pool * pct) / 100),
      zc = r2((pool * comm) / 100),
      own = r2(Math.max(0, pool - drv - zc));
    const v = h.vOf(b.veh) || {};
    return { fare, fee, pool, pct, comm, drv, zc, own, zam: r2(fee + zc), owner: v.owner || '' };
  };
  /* what the driver must remit for one completed trip: what he collected minus his share */
  h.dueFor = b => r2(Math.max(0, h.gross(b) - h.splitOf(b).drv));
  /* owner earnings: share of completed trips on his vehicles minus payouts already made */
  h.ownerBal = em => {
    const earned = r2(
      S.bk
        .filter(b => b.st == 'Completed' && h.splitOf(b).owner == em)
        .reduce((s, b) => s + h.splitOf(b).own, 0)
    );
    const paid = r2(
      S.pay.filter(p => p.kind == 'owner_payout' && p.to == em).reduce((s, p) => s + p.amount, 0)
    );
    return { earned, paid, due: r2(earned - paid) };
  };
  /* tell the owner of the booking's vehicle */
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
  h.remBks = em => S.bk.filter(b => b.drvUser == em && b.st == 'Completed' && !b.rem);
  h.cancelFee = b => (C.CANCEL_FREE.includes(b.st) ? 0 : Math.round((+b.tot || 0) * 10) / 100);
  h.rentPaid = r => h.paySum(r.id);
  h.depOf = r => +r.dep || 2000; // deposit fixed on the rental when it was requested (₱2,000 for rentals made before per-vehicle deposits)
  h.rentBal = r => r2(r.tot + h.depOf(r) - h.rentPaid(r));

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
      if (b.st == 'Pending' && !b.drvUser && b.cr && t - new Date(b.pendFrom || b.cr).getTime() > N) {
        h.ev(b, 'system', 'No driver found', `No driver accepted within ${S.cfg.pendMin || 30} minutes`);
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
