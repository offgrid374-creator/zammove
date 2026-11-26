'use strict';
/* Driver → owner → ZamMove (for bookings created with flow 'owner').

   The driver collects the fare (cash, or GCash to the owner's number when the owner has one, otherwise to the
   driver), keeps their share (their % + helper fees) and turns the rest over to the owner of the vehicle used
   on that trip; the owner confirms it. The owner remits ZamMove's portion (5% service fee + commission) of
   every completed trip, together with rental commission, in one weekly remittance.

   Balances are worked out per trip, against the owner of the vehicle used on that trip — never from the
   driver's current link, which can change (an ended assignment must not erase a debt). Fees ZamMove owes a
   driver and charges a driver owes ZamMove on such bookings pass through that owner too. An owner driving
   their own vehicle has no turnover.

   GCash sent to the owner's number is recorded by the driver (so the trip can go on), and the owner confirms
   it arrived or says it did not (then the cashier decides, and an unpaid amount goes back to the customer). */
const { now, r2, rid, str, img, ok, no, peso } = require('../util');

module.exports = (S, h) => {
  const OK = ['Recorded by driver', 'Verified'];
  const newFlow = b => !!b && b.flow == 'owner';
  const bkOf = bid => S.bk.find(b => b.id == bid);
  const tripOwner = b => h.splitOf(b).owner || (h.vOf(b.veh) || {}).owner || '';
  /* money a driver collected on a trip and still holds (cash, or GCash sent to the driver) */
  const held = b => r2(S.pay.filter(p => p.bid == b.id && ['down', 'final'].includes(p.kind) && OK.includes(p.status) && p.gto != 'owner').reduce((s, p) => s + p.amount, 0));
  /* fees and charges follow their booking: those on new-flow bookings pass through that booking's owner */
  h.viaOwner = x => newFlow(bkOf(x.bid));
  const credits = em => S.pay.filter(x => x.kind == 'cancel_fee' && x.to == em && x.status == 'Verified' && !x.applied && h.viaOwner(x));
  const debits = em => S.pay.filter(x => h.DEBIT_KINDS.includes(x.kind) && x.payer == em && x.status == 'Due' && h.viaOwner(x));
  h.isNewFlow = newFlow;
  const tripsOf = em => S.bk.filter(b => newFlow(b) && b.drvUser == em && h.closedPaid(b));
  /* owner → what this driver owes them (negative: the owner owes the driver) */
  h.turnBy = em => {
    const m = {};
    const add = (o, x) => {
      if (!o || o == em) return;
      m[o] = r2((m[o] || 0) + x);
    };
    tripsOf(em).forEach(b => add(tripOwner(b), held(b) - h.splitOf(b).drv));
    debits(em).forEach(x => add(tripOwner(bkOf(x.bid)), x.amount));
    credits(em).forEach(x => add(tripOwner(bkOf(x.bid)), -x.amount));
    S.pay.filter(p => p.kind == 'turnover' && p.payer == em && p.status == 'Verified').forEach(p => add(p.to, -p.amount));
    S.pay.filter(p => p.kind == 'drv_pay' && p.to == em).forEach(p => add(p.payer, p.amount));
    return m;
  };
  h.turnBal = (em, o) => (o ? h.turnBy(em)[o] || 0 : r2(Object.values(h.turnBy(em)).reduce((s, x) => s + x, 0)));
  h.turnOwed = em => r2(Object.values(h.turnBy(em)).reduce((s, x) => s + Math.max(0, x), 0)); // for the cash limit
  h.turnPending = (em, o) => r2(S.pay.filter(p => p.kind == 'turnover' && p.payer == em && p.status == 'Submitted' && (!o || p.to == o)).reduce((s, p) => s + p.amount, 0));
  /* overdue: still owing an owner for a trip with their vehicle completed more than 7 days ago */
  h.turnOverdue = em =>
    Object.entries(h.turnBy(em)).some(([o, bal]) => {
      if (bal - h.turnPending(em, o) <= 0.005) return false;
      const last = S.pay.filter(p => p.kind == 'turnover' && p.payer == em && p.to == o && p.status == 'Verified').map(p => p.vt || p.t).sort().pop() || '';
      return tripsOf(em).some(b => tripOwner(b) == o && (b.cd || '') > last && Date.now() - new Date(b.cd).getTime() > 7 * 864e5);
    });
  /* what an owner owes ZamMove for trips on their vehicles, and fees/charges on those trips */
  h.ownerTripsOwed = em => r2(S.bk.filter(b => newFlow(b) && h.closedPaid(b) && tripOwner(b) == em).reduce((s, b) => s + h.splitOf(b).zam, 0));
  h.ownerCross = em =>
    r2(
      S.pay
        .filter(x => h.viaOwner(x) && tripOwner(bkOf(x.bid)) == em && ((x.kind == 'cancel_fee' && x.status == 'Verified' && !x.applied) || (h.DEBIT_KINDS.includes(x.kind) && x.status == 'Due')))
        .reduce((s, x) => s + (x.kind == 'cancel_fee' ? x.amount : -x.amount), 0)
    );
  /* drivers who have a balance with this owner (or work for them) */
  h.ownerDrivers = owner => {
    const ems = new Set(S.users.filter(u => h.okr(u, 'driver') && h.driverOwner && h.driverOwner(u.em) == owner).map(u => u.em));
    S.bk.forEach(b => newFlow(b) && b.drvUser && tripOwner(b) == owner && ems.add(b.drvUser));
    ems.delete(owner);
    return [...ems];
  };
  h.turnInfo = em => {
    const by = h.turnBy(em),
      boss = h.driverOwner ? h.driverOwner(em) : '';
    if (boss && boss != em && !(boss in by)) by[boss] = 0;
    return {
      self: boss == em,
      owners: Object.entries(by).map(([o, bal]) => {
        const u = h.U(o) || {};
        return { k: h.pkey(o), name: u.name || '', gcash: u.gcash || null, bal, pending: h.turnPending(em, o) };
      }),
      bal: h.turnBal(em),
      overdue: h.turnOverdue(em),
      trips: tripsOf(em).map(b => ({ id: b.id, cd: b.cd, fare: h.splitOf(b).fare, held: held(b), share: h.splitOf(b).drv, owner: (h.U(tripOwner(b)) || {}).name || '' })),
    };
  };

  return {
    /* driver: hand money to an owner (the one whose vehicle the trips used) */
    turnover(me, p) {
      if (!h.okr(me, 'driver')) return no('Only a driver turns money over.');
      const by = h.turnBy(me.em),
        o = (h.fromKey && h.fromKey(str(p.owner, 20))) || (Object.keys(by).length == 1 ? Object.keys(by)[0] : h.driverOwner ? h.driverOwner(me.em) : '');
      if (!o || o == me.em || !(o in by)) return no('Choose the vehicle owner you are handing the money to.');
      const amt = r2(p.amount),
        m = p.method == 'GCash' ? 'GCash' : 'Cash',
        ref = str(p.ref, 30),
        bal = r2((by[o] || 0) - h.turnPending(me.em, o));
      if (!(amt > 0)) return no('Enter the amount you hand over.');
      if (amt > bal + 0.005) return no(`That is more than you owe this owner (${peso(Math.max(0, bal))}).`);
      if (m == 'GCash' && !/^\d{10,13}$/.test(ref)) return no('Enter the GCash reference number (10–13 digits).');
      const x = h.payMk({ bid: '', kind: 'turnover', method: m, amount: amt, ref: ref || rid('CSH'), payer: me.em, to: o, status: 'Submitted', note: str(p.note, 200) });
      S.pay.push(x);
      h.au(me.em, 'turnover sent', { amount: amt, method: m });
      h.ntf(o, 'Money from your driver', `${me.name} says they handed you ${peso(amt)} by ${m}${m == 'GCash' ? ' (ref ' + ref + ')' : ''}. Confirm it under Drivers.`);
      return ok({ id: x.id });
    },
    /* owner: confirm a turnover arrived, or say it did not */
    turnoverDecide(me, p) {
      const x = S.pay.find(y => y.id == p.id && y.kind == 'turnover' && y.to == me.em);
      if (!x || x.status != 'Submitted') return no('There is no turnover waiting for you.');
      const note = str(p.note, 300);
      if (!p.ok && note.length < 5) return no('Tell the driver what is wrong (at least 5 characters).');
      Object.assign(x, p.ok ? { status: 'Verified', vby: me.em, vt: now() } : { status: 'Rejected', note, vby: me.em, vt: now() });
      h.au(me.em, 'turnover ' + (p.ok ? 'confirmed' : 'not received'), { id: x.id, amount: x.amount });
      h.ntf(x.payer, p.ok ? 'Turnover confirmed' : 'Turnover not received', p.ok ? `Your owner confirmed ${peso(x.amount)}.` : `Your owner says the ${peso(x.amount)} did not arrive: ${note}. If you did hand it over, contest it under Earnings.`);
      return ok();
    },
    /* driver: contest a turnover the owner marked as not received; ZamMove staff decide (moneyDecide) */
    turnoverDispute(me, p) {
      const x = S.pay.find(y => y.id == p.id && y.kind == 'turnover' && y.payer == me.em);
      if (!x || x.status != 'Rejected') return no('Only a turnover your owner marked as not received can be contested.');
      if (x.disp) return no('You already contested it.');
      const note = str(p.note, 500);
      if (note.length < 10) return no('Explain how and when you handed it over (at least 10 characters).');
      x.status = 'Disputed';
      x.disp = { note, pf: img(p.pf), t: now(), by: me.em };
      h.ntf(x.to, 'Turnover contested', `${me.name} says they did hand over ${peso(x.amount)}: ${note}`);
      h.staffEms().forEach(em => h.ntf(em, 'Turnover disputed', `${me.name} → owner: ${peso(x.amount)} ${x.method}. ${note} Decide it under Money disputes.`));
      return ok();
    },
    /* owner: pay a driver what they are owed (e.g. the fare was paid by GCash to the owner) */
    ownerPayDriver(me, p) {
      if (!h.okr(me, 'owner') || !h.acct(me)) return no('Only a vehicle owner can do this.');
      const d = h.U(str(p.driver, 120).toLowerCase());
      if (!d || d.em == me.em) return no('Choose one of your drivers.');
      const owed = r2(-(h.turnBy(d.em)[me.em] || 0)),
        amt = r2(p.amount),
        m = p.method == 'GCash' ? 'GCash' : 'Cash',
        ref = str(p.ref, 30);
      if (!(owed > 0.005)) return no(`You do not owe ${d.name} anything right now.`);
      if (!(amt > 0) || amt > owed + 0.005) return no(`Enter an amount up to ${peso(owed)}.`);
      if (m == 'GCash' && !/^\d{10,13}$/.test(ref)) return no('Enter the GCash reference number (10–13 digits).');
      S.pay.push(h.payMk({ bid: '', kind: 'drv_pay', method: m, amount: amt, ref: ref || rid('CSH'), payer: me.em, to: d.em, status: 'Paid', vt: now(), note: str(p.note, 200) }));
      h.au(me.em, 'owner paid driver', { driver: d.em, amount: amt });
      h.ntf(d.em, 'Payment from your owner', `${me.name} paid you ${peso(amt)} by ${m}${ref ? ' (ref ' + ref + ')' : ''}.`);
      return ok();
    },
    /* owner: GCash a customer sent to the owner's number — confirm it arrived, or say it did not */
    ownerGcashCheck(me, p) {
      const x = S.pay.find(y => y.id == p.id && ['down', 'final'].includes(y.kind) && y.gto == 'owner');
      const b = x && bkOf(x.bid);
      if (!x || !b || tripOwner(b) != me.em) return no('Payment not found.');
      if (x.oc) return no('You already checked this payment.');
      const note = str(p.note, 300);
      if (!p.ok && note.length < 5) return no('Say what is wrong (at least 5 characters), e.g. nothing arrived in my GCash.');
      x.oc = { ok: !!p.ok, note, t: now() };
      if (!p.ok) {
        x.disp = { note: 'Owner: not received in GCash. ' + note, t: now(), by: me.em };
        h.staffEms().forEach(em => h.ntf(em, 'GCash payment disputed', `${b.id}: the owner says ${peso(x.amount)} GCash (ref ${x.ref}) never arrived. Decide it under Money disputes.`));
        h.ntf(b.cu, 'GCash payment being checked', `${b.id}: the vehicle owner did not receive your ${peso(x.amount)} GCash (ref ${x.ref}). ZamMove is checking; keep your GCash receipt ready.`);
        if (b.drvUser) h.ntf(b.drvUser, 'GCash payment being checked', `${b.id}: the owner says the ${peso(x.amount)} GCash did not arrive. ZamMove is checking.`);
      }
      h.au(me.em, 'owner gcash ' + (p.ok ? 'received' : 'not received'), { id: x.id, bk: b.id });
      return ok();
    },
  };
};
