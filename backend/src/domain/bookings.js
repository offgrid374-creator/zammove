'use strict';
/* Booking lifecycle: pricing and capacity at creation, cancellation, re-submit, customer GCash proof, reviews,
   driver accept/steps/collection, admin assignment and driver availability. */
const C = require('./constants');
const { now, r2, rid, str, img, ok, no, peso, manilaMs } = require('../util');

module.exports = (S, h) => {
  const own = (me, id) => {
    const b = S.bk.find(x => x.id == id);
    return b && b.cu == me.em ? b : null;
  };
  const mine = (me, id) => {
    const b = S.bk.find(x => x.id == id);
    return b && b.drvUser == me.em ? b : null;
  };

  /* the single pricing rule (server-side): base + km x rate + movers + 5% service fee - discount */
  const price = (v0, km, mv, dc) => {
    const v = h.rateOf(v0.id) || v0, // the administrator's current rates
      dist = r2(km * v.km), // km can have one decimal (road distance), e.g. 4.4 x 25 = 110
      mov = mv * C.MOVER_FEE,
      sub = v.base + dist + mov,
      fee = Math.round(sub * C.SERVICE_FEE),
      disc = Math.round(sub * (C.DC[dc] || 0));
    return { dist, mov, sub: r2(sub), fee, disc, tot: r2(sub + fee - disc) };
  };

  /* quiet: the caller sends its own (more urgent) notices, e.g. an emergency report */
  const interrupt = (b, me, reason, quiet) => {
    const why = str(reason, 300);
    if (why.length < 10) return no('Describe what happened (10+ characters).');
    if (h.done(b) || b.st == 'Interrupted' || ['Pending', 'No driver found'].includes(b.st))
      return no('Only a trip in progress can be interrupted.');
    b.intFrom = b.st;
    b.int = { by: me.em, t: now(), why, from: b.st };
    h.ev(b, me.em, 'Interrupted', 'Trip stopped: ' + why);
    h.au(me.em, 'trip interrupted', { bk: b.id, from: b.intFrom });
    if (!quiet) {
      h.staffEms().forEach(em => h.ntf(em, 'Trip interrupted', `${b.id}: ${why}`));
      [b.cu, b.drvUser].filter(x => x && x != me.em).forEach(em => h.ntf(em, 'Trip stopped', `${b.id}: ${why} ZamMove will contact you.`));
    }
    return ok();
  };
  h.interrupt = interrupt;
  const A = {
    quote(me, p) {
      const v = C.HV.find(x => x.id == p.vid);
      if (!v) return no('Choose a vehicle.');
      const road = p.__road && +p.__road.km > 0 ? p.__road : null,
        km = road ? road.km : C.kmBetween(str(p.pu, 200), str(p.dr, 200)),
        mv = Math.max(0, Math.min(C.MOV_MAX[v.id] || 0, Math.round(+p.mv || 0))),
        dc = str(p.dc, 20).toUpperCase();
      return ok({
        km,
        min: road ? road.min : null,
        road: !!road,
        ...price(v, km, mv, dc),
        validCode: !dc || !!C.DC[dc],
      });
    },
    createBooking(me, p) {
      if (!me.ver) return no('Verify your account first (see the banner on Home).');
      const owed = S.pay.find(x => x.kind == 'cancel_fee' && x.payer == me.em && x.status == 'Due' && !(x.disp && !x.disp.closed)); // a submitted or disputed fee does not block; a rejected one is due again
      if (owed)
        return no(
          `Settle the ${peso(owed.amount)} cancellation fee for ${owed.bid} first (My bookings → that booking).`
        );
      const waiting = S.bk.filter(x => x.cu == me.em && x.st == 'Pending' && !x.drvUser && !x.pkgOf).length;
      if (waiting >= C.OPEN_MAX)
        return no(`You already have ${waiting} bookings waiting for a driver. Wait for one to be accepted, or cancel one you no longer need.`);
      const v = C.HV.find(x => x.id == p.vid);
      if (!v) return no('Choose a vehicle.');
      const d = {
        pu: str(p.pu, 200),
        dr: str(p.dr, 200),
        dt: str(p.dt, 10),
        tm: str(p.tm, 5),
        it: str(p.it, 500),
        si: str(p.si, 500),
      };
      const mv = Math.round(+p.mv || 0),
        dc = str(p.dc, 20).toUpperCase();
      if (d.pu.length < 5 || d.dr.length < 5) return no('Pickup and drop-off addresses are required.');
      if (!C.inZC(d.pu))
        return no(
          'Pickup address must be within Zamboanga City. Choose a suggestion or add Zamboanga City to the address.'
        );
      if (!C.inZC(d.dr))
        return no(
          'Drop-off address must be within Zamboanga City. Choose a suggestion or add Zamboanga City to the address.'
        );
      if (d.pu.toLowerCase() == d.dr.toLowerCase())
        return no('Pickup and drop-off must be different places.');
      /* road distance from OpenStreetMap routing when available (added by app.js), otherwise straight line × 1.3 */
      const road = p.__road && +p.__road.km > 0 ? p.__road : null;
      const km = C.kmBetween(d.pu, d.dr) ? (road ? road.km : C.kmBetween(d.pu, d.dr)) : 0;
      if (!km)
        return no(
          'Pick both locations from the suggestions, the map or “Use my current location” so the distance can be computed.'
        );
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dt) || !/^\d{2}:\d{2}$/.test(d.tm))
        return no('Choose a pickup date and time.');
      const at = manilaMs(d.dt, d.tm);
      if (!(at >= Date.now() + 30 * 6e4)) return no('Choose a pickup time at least 30 minutes from now.');
      if (at > Date.now() + 90 * 864e5) return no('Bookings can be made up to 90 days ahead.');
      if (d.it.length < 10) return no('List the items to transport (e.g. “sofa, 3 boxes, refrigerator”).');
      const mx = C.MOV_MAX[v.id] || 0;
      if (!(mv >= 0 && mv <= mx))
        return no(`A ${v.n} takes at most ${mx} helper${mx == 1 ? '' : 's'}.`);
      /* the load must fit: the size chosen sets the smallest vehicle type */
      const sz = C.SIZES.find(x => x.id == p.sz);
      if (!sz) return no('Choose how much you are moving.');
      const rank = id => C.HV.findIndex(x => x.id == id);
      if (rank(v.id) < rank(sz.min))
        return no(
          `A ${v.n} is too small for “${sz.n.toLowerCase()}”. Choose a ${C.HV.find(x => x.id == sz.min).n} or bigger.`
        );
      /* someone else receives the items (optional) */
      const rn = str(p.rn, 80),
        rph = str(p.rph, 20);
      if ((rn || rph) && !(rn.length >= 3 && /^(09|\+639)\d{9}$/.test(rph)))
        return no('For a different recipient, enter their full name and PH mobile number.');
      /* estimated weight (optional): must be within what the vehicle type can carry */
      const wt = p.wt === '' || p.wt == null ? 0 : Math.round(+p.wt);
      if (p.wt !== '' && p.wt != null && !(wt >= 1 && wt <= 20000))
        return no('Enter the estimated weight in kg (1 to 20,000), or leave it blank.');
      const maxKg = v.kg || (C.HV.find(x => x.id == v.id) || {}).kg || 0;
      if (wt && maxKg && wt > maxKg) {
        const up = C.HV.find(x => x.kg >= wt);
        return no(
          `About ${wt.toLocaleString('en-PH')} kg is more than a ${v.n} can carry (${maxKg.toLocaleString('en-PH')} kg). ` +
            (up ? `Choose a ${up.n} or bigger.` : 'Split the load into two bookings.')
        );
      }
      if (dc && !C.DC[dc]) return no('Invalid discount code.');
      /* optional preferences: only matching vehicles (and the chosen driver) are offered the job */
      const pref = h.prefOf ? h.prefOf(p.pref) : null;
      if (pref) {
        const any = S.vh.some(x => x.type == v.id && h.vOper(x) && h.prefOk(pref, x, pref.driver ? pref.driver : (S.asg.find(a => a.vehicle == x.id && a.st == 'Active') || {}).driver));
        if (!any) return no('No vehicle of this type matches your preferences. Remove a preference or choose another vehicle type.');
      }
      if (h.capFree({ id: '', vid: v.id, dt: d.dt, tm: d.tm, km, wt }) < 1)
        return no('No vehicle of this type is free at that time. Choose another time or vehicle type.');
      /* part of a group: several vehicles or drop-offs for one move, linked to one of my bookings */
      let grp = '';
      if (p.grp) {
        const g = str(p.grp, 20),
          base = S.bk.find(x => x.cu == me.em && (x.id == g || x.grp == g));
        if (!base) return no('That booking group was not found.');
        grp = base.grp || base.id;
      }
      /* reservation: drop off now, pick up again later with the same vehicle and driver, paid once */
      let ret = null;
      if (p.ret && typeof p.ret == 'object' && p.ret.dt) {
        const rdt = str(p.ret.dt, 10),
          rtm = str(p.ret.tm, 5) || d.tm,
          rdr = str(p.ret.dr, 200) || d.pu;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rdt) || !/^\d{2}:\d{2}$/.test(rtm)) return no('Choose the pick-up date and time.');
        const at2 = manilaMs(rdt, rtm);
        if (!(at2 >= at + 2 * 36e5)) return no('The pick-up must be at least 2 hours after the drop-off.');
        const days = Math.max(1, Math.ceil((at2 - at) / 864e5));
        if (days > 30) return no('A reservation can last up to 30 days.');
        if (!C.inZC(rdr)) return no('The final drop-off must be within Zamboanga City.');
        const km2 = C.kmBetween(d.dr, rdr);
        if (!km2) return no('Pick the final drop-off from the suggestions so the distance can be computed.');
        ret = { dt: rdt, tm: rtm, dr: rdr, km: km2, days };
      }
      const pr = price(v, km, mv, dc),
        t = now();
      const pr2 = ret ? price(v, ret.km, mv, '') : null,
        holdFee = +S.cfg.holdFee || C.HOLD_FEE,
        hold = ret ? Math.round(holdFee * ret.days) : 0;
      const b = {
        id: rid('BK'),
        cu: me.em,
        ...d,
        vid: v.id,
        vn: v.n,
        mv,
        km,
        kmBy: road ? 'road' : 'estimate',
        ...(road ? { min: road.min } : {}),
        tot: ret ? r2(pr.tot + pr2.tot + hold) : pr.tot,
        bd: ret ? [v.base * 2 + hold, r2(pr.dist + pr2.dist), pr.mov + pr2.mov, pr.fee + pr2.fee] : [v.base, pr.dist, pr.mov, pr.fee],
        ...(grp ? { grp } : {}),
        disc: pr.disc,
        dc: pr.disc ? dc : '',
        ph: img(p.ph),
        sz: sz.id,
        ...(wt ? { wt } : {}),
        ...(rn ? { rn, rph } : {}),
        puC: C.coord(d.pu),
        drC: C.coord(d.dr), // the coordinates are what the price is based on; the driver navigates to them
        ...(pref ? { pref } : {}),
        flow: 'owner', // money: driver → owner → ZamMove (turnover.js)
        st: 'Pending',
        drv: '',
        cr: t,
        ev: [{ t, by: me.em, from: '', to: 'Pending', note: 'Booking requested' }],
      };
      S.bk.push(b);
      if (grp) S.bk.forEach(x => x.cu == me.em && x.id == grp && (x.grp = grp)); // linked only once this booking is valid
      if (ret) {
        /* the pick-up trip: prepaid in this booking, reserved for the same driver */
        const r = {
          ...b,
          id: rid('BK'),
          pu: d.dr,
          dr: ret.dr,
          dt: ret.dt,
          tm: ret.tm,
          km: ret.km,
          kmBy: 'estimate',
          tot: 0,
          bd: [0, 0, 0, 0],
          disc: 0,
          dc: '',
          puC: C.coord(d.dr),
          drC: C.coord(ret.dr),
          pkgOf: b.id,
          ev: [{ t, by: me.em, from: '', to: 'Pending', note: 'Pick-up reserved with ' + b.id + ' (prepaid)' }],
        };
        delete r.pkg;
        S.bk.push(r);
        b.pkg = { ret: r.id, days: ret.days, holdFee, hold, fare1: pr.tot, fare2: pr2.tot };
      }
      h.au(me.em, 'booking created', { bk: b.id, tot: b.tot, ...(ret ? { reservation: b.pkg } : {}), ...(grp ? { grp } : {}) });
      h.ntf(me.em, 'Booking submitted', b.id + ' is waiting for a driver to accept.' + (ret ? ` The pick-up on ${ret.dt} ${ret.tm} is reserved with it.` : ''));
      h.tellDrivers(b);
      return ok({ id: b.id });
    },
    cancelBooking(me, p) {
      const b = own(me, p.id);
      if (!b) return no('Booking not found.');
      if (!C.CANCEL_OK.includes(b.st))
        return no('This booking can no longer be cancelled here. Report an incident or contact support.');
      if (b.pkgOf) return no(`This pick-up is part of reservation ${b.pkgOf}. Cancel that booking (both trips), or contact ZamMove.`);
      const late = h.late(b),
        fee = late ? 0 : h.cancelFee(b),
        t = now(),
        from = b.st,
        drv = b.drvUser || '';
      b.cf = fee;
      b.cxl = { t, by: me.em, from, fee, ...(late ? { late: true } : {}) };
      if (late) h.strike(drv, b.id, 'Late for pickup');
      h.ev(
        b,
        me.em,
        'Cancelled',
        late
          ? `Cancelled by the customer free of charge: the driver was more than ${C.LATE_MIN} minutes late.`
          : fee
            ? 'Cancelled by the customer. Cancellation fee ' + peso(fee) + ' (goes to the driver who travelled).'
            : 'Cancelled by the customer.'
      );
      /* the fee compensates the driver who already travelled; the customer settles it before booking again */
      if (fee)
        S.pay.push(
          h.payMk({
            bid: b.id,
            kind: 'cancel_fee',
            method: '',
            amount: fee,
            ref: rid('FEE'),
            payer: me.em,
            to: drv,
            status: 'Due',
            note: '10% cancellation fee, paid to the driver',
          })
        );
      const rb = b.pkg && S.bk.find(x => x.id == b.pkg.ret);
      if (rb && !h.done(rb)) h.ev(rb, me.em, 'Cancelled', 'Cancelled with reservation ' + b.id);
      const open = S.pay.filter(x => x.bid == b.id && x.status == 'Submitted');
      open.forEach(x => Object.assign(x, { status: 'Withdrawn', note: 'Booking cancelled before the driver confirmed it' }));
      if (open.length) h.ntf(me.em, 'GCash on a cancelled booking', `${b.id}: if you already sent the GCash (ref ${open.map(x => x.ref).join(', ')}), report it so ZamMove can arrange a refund.`);
      h.au(me.em, 'booking cancelled', { bk: b.id, from, fee, driver: drv || null, vehicle: b.veh || null });
      h.ntf(
        me.em,
        'Booking cancelled',
        b.id + ' was cancelled.' + (fee ? ' A cancellation fee of ' + peso(fee) + ' is due.' : '')
      );
      if (drv)
        h.ntf(
          drv,
          'Booking cancelled',
          late
            ? `The customer cancelled ${b.id} because you were more than ${C.LATE_MIN} minutes late. A strike was recorded.`
            : 'The customer cancelled ' + b.id + '. You and your vehicle are free for that slot.' + (fee ? ` You receive the ${peso(fee)} cancellation fee once the customer pays it.` : '')
        );
      return ok({ fee, late });
    },
    /* customer: pay a cancellation fee (a cashier verifies it; it is then credited to the driver) */
    payCancelFee(me, p) {
      const x = S.pay.find(y => y.kind == 'cancel_fee' && y.payer == me.em && y.bid == p.id && y.status == 'Due');
      if (!x) return no('No cancellation fee is due for this booking.');
      const m = p.method == 'Cash' ? 'Cash' : 'GCash',
        ref = str(p.ref, 13);
      if (m == 'GCash') {
        if (!/^\d{10,13}$/.test(ref)) return no('Enter the GCash reference number (10–13 digits).');
        if (S.pay.some(y => y.ref == ref && y.status != 'Rejected')) return no('This GCash reference was already used.');
      }
      Object.assign(x, { method: m, ref: m == 'GCash' ? ref : rid('CSH'), status: 'Submitted', t: now(), pf: img(p.pf) });
      h.au(me.em, 'cancellation fee paid', { bk: x.bid, amount: x.amount, method: m });
      h.ntf(me.em, 'Payment submitted', `${peso(x.amount)} cancellation fee for ${x.bid}. It counts once a cashier verifies it.`);
      return ok();
    },
    /* driver: the locations do not match the pins (wrong price) -> propose a corrected route; the customer decides */
    requote(me, p) {
      const b = mine(me, p.id);
      if (!b) return no('Booking not found or not assigned to you.');
      if (!['Accepted', 'On the Way to Pickup', 'Awaiting Down Payment'].includes(b.st))
        return no('A price correction is only possible before the down payment.');
      if (h.paySum(b.id) > 0) return no('A payment was already recorded.');
      if (b.rq && !b.rq.ans) return no('A price correction is already waiting for the customer.');
      const pu = str(p.pu, 200) || b.pu,
        dr = str(p.dr, 200) || b.dr,
        why = str(p.reason, 300);
      if (why.length < 10) return no('Explain what does not match (10+ characters).');
      if (!C.coord(pu) || !C.coord(dr)) return no('Pick the corrected places from the suggestions or the map.');
      const road = p.__road && +p.__road.km > 0 ? p.__road : null,
        km = road ? road.km : C.kmBetween(pu, dr),
        v = C.HV.find(x => x.id == b.vid),
        pr = price(v, km, b.mv || 0, b.dc);
      if (Math.abs(pr.tot - b.tot) < 1 && pu == b.pu && dr == b.dr) return no('Nothing changes: same places and price.');
      b.rq = { pu, dr, km, kmBy: road ? 'road' : 'estimate', tot: pr.tot, bd: [v.base, pr.dist, pr.mov, pr.fee], disc: pr.disc, why, by: me.em, t: now() };
      h.au(me.em, 'price correction proposed', { bk: b.id, from: b.tot, to: pr.tot });
      h.ntf(b.cu, 'Price correction for ' + b.id, `${me.name}: ${why} New price ${peso(pr.tot)} (was ${peso(b.tot)}). Accept or decline it on the booking.`);
      return ok({ tot: pr.tot });
    },
    /* customer: accept the corrected price, or decline (the booking is cancelled at no charge) */
    requoteAnswer(me, p) {
      const b = own(me, p.id);
      if (!b || !b.rq || b.rq.ans) return no('No price correction is waiting for you.');
      if (h.done(b)) return no('This booking is closed.');
      const q = b.rq;
      q.ans = p.accept ? 'accepted' : 'declined';
      q.at = now();
      if (p.accept) {
        const was = b.tot;
        Object.assign(b, { pu: q.pu, dr: q.dr, km: q.km, kmBy: q.kmBy, tot: q.tot, bd: q.bd, disc: q.disc, puC: C.coord(q.pu), drC: C.coord(q.dr) });
        (b.ev = b.ev || []).push({ t: now(), by: me.em, from: b.st, to: b.st, note: `Price corrected from ${peso(was)} to ${peso(q.tot)} (accepted by the customer)` });
        h.ntf(b.drvUser, 'Price correction accepted', `${b.id}: new price ${peso(q.tot)}.`);
      } else {
        b.cxl = { t: now(), by: me.em, from: b.st, fee: 0, requote: true };
        h.ev(b, me.em, 'Cancelled', 'Cancelled at no charge: the customer declined the price correction.');
        h.ntf(b.drvUser, 'Price correction declined', `${b.id} was cancelled by the customer at no charge.`);
      }
      h.au(me.em, 'price correction ' + q.ans, { bk: b.id });
      return ok();
    },
    /* driver: a breakdown, accident or a customer who will not pay stops the trip; an administrator takes over */
    tripProblem(me, p) {
      const b = mine(me, p.id);
      if (!b) return no('Booking not found or not assigned to you.');
      return interrupt(b, me, p.reason);
    },
    tripInterrupt(me, p) {
      if (!h.isAdmin(me)) return no('Administrator access required.');
      const b = S.bk.find(x => x.id == p.id);
      if (!b || !b.drvUser) return no('Booking not found or it has no driver.');
      return interrupt(b, me, p.reason);
    },
    /* administrator: resume, give the trip to another driver (only before any money was collected),
       or close it: the customer is charged what is fair and the rest of what was collected is refunded */
    tripResolve(me, p) {
      if (!h.isAdmin(me)) return no('Administrator access required.');
      const b = S.bk.find(x => x.id == p.id);
      if (!b || b.st != 'Interrupted') return no('This trip is not interrupted.');
      if (b.cu == me.em || b.drvUser == me.em) return no('You cannot decide a trip you are part of.');
      const why = str(p.reason, 300);
      if (why.length < 10) return no('Write the decision and reason (10+ characters).');
      const collected = h.paySum(b.id);
      if (p.act == 'resume') {
        h.ev(b, me.em, b.intFrom, 'Resumed by an administrator: ' + why);
      } else if (p.act == 'reassign') {
        if (collected > 0)
          return no('Money was already collected by the first driver. Close the trip (refund or charge) and book again.');
        const d = h.U(str(p.driver, 120).toLowerCase());
        if (!d || d.em == b.drvUser) return no('Choose another driver.');
        const prev = b.drvUser,
          bad = h.chk(d.em, { ...b, id: b.id }).filter(x => !x[1]);
        if (bad.length) return no(d.name + ': ' + bad[0][0] + '.');
        const as = h.asgOf(d.em);
        Object.assign(b, { drvUser: d.em, drv: d.name, veh: as.vehicle, acc: now(), ver: null, dver: null });
        h.ev(b, me.em, 'Accepted', `Given to ${d.name} by an administrator (was ${h.U(prev) ? h.U(prev).name : prev}): ${why}`);
        h.ntf(d.em, 'Booking assigned', `An administrator gave you ${b.id} (${b.dt} ${b.tm}).`);
        h.ntf(prev, 'Trip reassigned', `${b.id} was given to another driver.`);
      } else if (p.act == 'close') {
        const refund = r2(+p.refund || 0);
        if (!(refund >= 0 && refund <= collected + 0.005))
          return no('The refund must be between ₱0 and what was collected (' + peso(collected) + ').');
        b.charged = r2(collected - refund);
        b.cd = now();
        b.split = h.splitOf(b);
        h.ev(b, me.em, 'Cancelled', `Closed by an administrator: charged ${peso(b.charged)}, refund ${peso(refund)}. ${why}`);
        if (refund > 0)
          S.pay.push(h.payMk({ bid: b.id, kind: 'refund', method: '', amount: refund, ref: rid('RF'), payer: me.em, to: b.cu, status: 'Due', note: why }));
      } else return no('Choose resume, reassign or close.');
      b.int = { ...(b.int || {}), done: { act: p.act, by: me.em, t: now(), why } };
      h.au(me.em, 'interrupted trip ' + p.act, { bk: b.id });
      h.ntf(b.cu, 'Booking ' + b.id, 'ZamMove decided: ' + why);
      return ok();
    },
    resubmit(me, p) {
      const b = own(me, p.id);
      if (!b || b.st != 'No driver found') return no('This booking cannot be re-submitted.');
      if (h.t0(b) < Date.now())
        return no('The pickup time has passed. Cancel this booking and create a new one.');
      if (h.capFree(b) < 1)
        return no('No vehicle of this type is free at that time. Cancel and choose another time.');
      h.ev(b, me.em, 'Pending', 'Re-submitted by the customer');
      b.cr = now();
      b.declined = [];
      h.au(me.em, 'booking re-submitted', { bk: b.id });
      h.tellDrivers(b);
      return ok();
    },
    submitProof(me, p) {
      const b = own(me, p.id),
        k = p.kind == 'final' ? 'final' : 'down';
      if (!b || b.drvUser == me.em)
        return no('Only the customer who made this booking can submit a payment.');
      if (b.st != (k == 'down' ? 'Awaiting Down Payment' : 'Awaiting Final Payment'))
        return no('This payment is not due yet.');
      const left = r2(h.due(b, k) - h.paySum(b.id, k)),
        g = r2(p.amount),
        ref = str(p.ref, 13);
      if (!(g > 0) || g > left + 0.005) return no('Enter a GCash amount from ₱0.01 to ' + peso(left) + '.');
      if (!/^\d{10,13}$/.test(ref)) return no('Enter the GCash reference number (10–13 digits).');
      if (S.pay.some(x => x.ref == ref && x.status != 'Rejected'))
        return no('This GCash reference was already submitted.');
      if (S.pay.some(x => x.bid == b.id && x.kind == k && x.status == 'Submitted'))
        return no('You already submitted a GCash proof for this payment. Wait for the driver to confirm it.');
      const pay = h.payMk({
        bid: b.id,
        kind: k,
        method: 'GCash',
        amount: g,
        ref,
        payer: me.em,
        status: 'Submitted',
        pf: img(p.pf),
      });
      S.pay.push(pay);
      h.au(me.em, 'gcash proof submitted', { bk: b.id, kind: k, amount: g });
      h.ntf(me.em, 'GCash proof submitted', peso(g) + ' for ' + b.id + '. Your driver confirms it on site.');
      if (b.drvUser)
        h.ntf(
          b.drvUser,
          'GCash proof received',
          `The customer submitted GCash ref ${ref} (${peso(g)}) for ${b.id}. Confirm it when you collect.`
        );
      return ok();
    },
    /* customer: say how this payment is made: the GCash part (with its reference), the cash part, and the cash
       they will hand over. The driver's entry is checked against it and both appear on the receipt. */
    payDeclare(me, p) {
      const b = own(me, p.id),
        k = p.kind == 'final' ? 'final' : 'down';
      if (!b || b.drvUser == me.em) return no('Only the customer who made this booking can do this.');
      if (b.st != (k == 'down' ? 'Awaiting Down Payment' : 'Awaiting Final Payment')) return no('This payment is not due yet.');
      if (h.paySum(b.id, k) > 0) return no('Your driver already recorded this payment.');
      const due = h.due(b, k),
        g = r2(+p.g || 0),
        c = r2(+p.c || 0),
        cg = c > 0 ? r2(p.cg === '' || p.cg == null ? c : +p.cg) : 0,
        ref = str(p.ref, 13);
      if (g < 0 || c < 0 || Math.round(g * 100) + Math.round(c * 100) !== Math.round(due * 100))
        return no(`GCash and cash must add up to exactly ${peso(due)}.`);
      if (c > 0 && !(cg >= c && cg <= c + 10000)) return no(`Enter the cash you will hand over (at least ${peso(c)}).`);
      if (g > 0 && !/^\d{10,13}$/.test(ref)) return no('Enter the GCash reference number (10–13 digits).');
      if (g > 0 && S.pay.some(x => x.ref == ref && x.status != 'Rejected' && !(x.bid == b.id && x.kind == k && x.status == 'Submitted')))
        return no('This GCash reference was already used.');
      /* a new declaration replaces an earlier one that the driver has not recorded yet */
      S.pay.forEach(x => {
        if (x.bid == b.id && x.kind == k && x.status == 'Submitted') Object.assign(x, { status: 'Rejected', note: 'Replaced by a newer declaration' });
      });
      if (g > 0) S.pay.push(h.payMk({ bid: b.id, kind: k, method: 'GCash', amount: g, ref, payer: me.em, status: 'Submitted', pf: img(p.pf) }));
      b.decl = b.decl || {};
      b.decl[k] = { g, c, cg, chg: r2(cg - c), ref: g ? ref : '', t: now() };
      const parts = [g ? `${peso(g)} by GCash (ref ${ref})` : '', c ? `${peso(c)} in cash` : ''].filter(Boolean).join(' and ');
      h.au(me.em, 'payment declared', { bk: b.id, kind: k, g, c, cg });
      if (b.drvUser)
        h.ntf(b.drvUser, 'How the customer pays', `${b.id}: ${parts}.` + (c ? ` They will hand you ${peso(cg)} cash; give back ${peso(cg - c)} change.` : ''));
      return ok({ decl: b.decl[k] });
    },
    review(me, p) {
      const b = own(me, p.id);
      if (!b || b.st != 'Completed') return no('You can review a booking after it is completed.');
      const r = Math.round(+p.r);
      if (!(r >= 1 && r <= 5)) return no('Choose a star rating.');
      if (S.rev.some(x => x.bid == b.id)) return no('You already reviewed this booking.');
      S.rev.push({
        id: rid('RV'),
        bid: b.id,
        by: me.em,
        r,
        t: str(p.t, 300) || 'No comment',
        sv: str(p.sv, 300),
        cr: now(),
      });
      h.au(me.em, 'review', { bk: b.id, r });
      return ok();
    },

    /* ---- driver ---- */
    setAvail(me, p) {
      if (!h.okr(me, 'driver') || !h.acct(me)) return no('Only an approved driver can change availability.');
      if (h.dAv(me.em) == 'Temporarily Suspended')
        return no('Your account is suspended. Contact an administrator.');
      if (!['Available', 'Unavailable'].includes(p.s)) return no('Invalid status.');
      if (p.s == 'Available') {
        const as = h.asgOf(me.em);
        if (!as) return no('You need an approved vehicle assignment first.');
        if (!h.vOper(h.vOf(as.vehicle))) return no('Your assigned vehicle is not approved and operational.');
        if (h.onRoad(me.em)) return no('Finish the trip you are on first.');
      }
      S.dp[me.em] = { ...(S.dp[me.em] || {}), avail: p.s };
      h.au(me.em, 'availability', { status: p.s });
      return ok();
    },
    accept(me, p) {
      const b = S.bk.find(x => x.id == p.id);
      if (!b) return no('Booking not found.');
      if (b.cu == me.em) return no('You cannot accept your own booking.');
      if (b.st != 'Pending' || b.drvUser) return no('This booking was already taken or is no longer open.');
      if (b.pkgOf && !b.released) return no('This pick-up is reserved for the driver of ' + b.pkgOf + '.');
      const bad = h.chk(me.em, b).filter(x => !x[1]);
      if (bad.length) return no('Requirement not met: ' + bad[0][0] + '.');
      const as = h.asgOf(me.em);
      b.drvUser = me.em;
      b.veh = as.vehicle;
      b.drv = me.name;
      b.acc = now();
      h.ev(b, me.em, 'Accepted', 'Accepted by ' + me.name);
      const rb = b.pkg && S.bk.find(x => x.id == b.pkg.ret);
      if (rb && !rb.drvUser) {
        Object.assign(rb, { drvUser: me.em, veh: as.vehicle, drv: me.name, acc: now() });
        h.ev(rb, me.em, 'Accepted', `Reserved pick-up: same driver as ${b.id}`);
      }
      h.au(me.em, 'booking accepted', { booking: b.id, vehicle: as.vehicle });
      h.ntf(b.cu, 'Booking accepted', b.id + ' was accepted by ' + b.drv + '.');
      h.ntfOwner(
        b,
        'Trip booked on your vehicle',
        `${b.id}: ${b.drv} accepted ${String(b.pu).split(',')[0]} → ${String(b.dr).split(',')[0]} on ${b.dt} ${b.tm}.`
      );
      return ok();
    },
    /* driver: the customer did not come out after the waiting time; the booking closes with the 10% fee to the driver */
    noShow(me, p) {
      const b = mine(me, p.id);
      if (!b) return no('Booking not found or not assigned to you.');
      if (b.st != 'Awaiting Down Payment') return no('A no-show can only be marked while you wait at the pickup.');
      if (h.paySum(b.id) > 0) return no('A payment was already recorded on this booking.');
      const arr = [...(b.ev || [])].reverse().find(e => e.to == 'Awaiting Down Payment'),
        waited = arr ? Date.now() - new Date(arr.t).getTime() : 0;
      if (waited < C.NOSHOW_MIN * 6e4)
        return no(`Wait the full ${C.NOSHOW_MIN} minutes at the pickup and call the customer first (${Math.ceil((C.NOSHOW_MIN * 6e4 - waited) / 6e4)} min left).`);
      /* the driver must really be at the pickup: a recent phone location far from it refuses the fee */
      const g = b.gps && !b.gps.off && b.gps.ms && Date.now() - b.gps.ms < 15 * 6e4 ? b.gps : null,
        far = g ? C.kmFrom(b.pu, g.lat, g.lng) : null;
      if (far != null && far > C.NOSHOW_FAR_KM)
        return no(`Your phone shows you about ${Math.round(far * 10) / 10} km from the pickup. Go to the pickup address before marking a no-show.`);
      const unverified = !g;
      const fee = Math.round((+b.tot || 0) * 10) / 100,
        t = now();
      b.cf = fee;
      b.cxl = { t, by: me.em, from: b.st, fee, noShow: true, loc: g ? { km: Math.round(far * 100) / 100, t: g.t } : null, unverified };
      if (unverified) h.staffEms().forEach(em => h.ntf(em, 'No-show without location', `${b.id}: the driver marked a no-show without sharing a phone location. Check it if the customer disputes the fee.`));
      h.ev(b, me.em, 'Cancelled', `The customer did not come out after the driver waited ${Math.round(waited / 6e4)} minutes. No-show fee ${peso(fee)} (goes to the driver).`);
      S.pay.push(h.payMk({ bid: b.id, kind: 'cancel_fee', method: '', amount: fee, ref: rid('FEE'), payer: b.cu, to: me.em, status: 'Due', note: 'No-show fee (10%), paid to the driver' }));
      h.au(me.em, 'customer no-show', { bk: b.id, fee, waitedMin: Math.round(waited / 6e4) });
      h.ntf(b.cu, 'Marked as a no-show', `${b.id}: your driver waited ${Math.round(waited / 6e4)} minutes at the pickup and you did not come out. A ${peso(fee)} no-show fee is due (it goes to the driver). If this is wrong, dispute it under My bookings.`);
      h.ntfOwner(b, 'Trip closed: no-show', `${b.id}: the customer did not show up.`);
      return ok({ fee });
    },
    /* customer: dispute a no-show fee (e.g. the driver was at the wrong place); staff decide */
    noShowDispute(me, p) {
      const b = own(me, p.id);
      if (!b || !(b.cxl && b.cxl.noShow)) return no('There is no no-show fee on this booking.');
      const x = S.pay.find(y => y.bid == b.id && y.kind == 'cancel_fee' && y.status == 'Due');
      if (!x) return no('The fee is already paid or decided.');
      if (x.disp) return no('You already disputed this fee.');
      const note = str(p.note, 500);
      if (note.length < 10) return no('Tell ZamMove what happened (at least 10 characters).');
      x.disp = { note, t: now(), by: me.em };
      h.au(me.em, 'no-show disputed', { bk: b.id });
      h.ntf(x.to, 'No-show disputed', `${b.id}: the customer disputes the no-show: ${note}`);
      h.staffEms().forEach(em => h.ntf(em, 'No-show fee disputed', `${b.id}: ${note} Decide it under Money disputes.`));
      return ok();
    },
    /* customer: fix the pickup, drop-off or items before a driver accepts (the price is recalculated) */
    editBooking(me, p) {
      const b = own(me, p.id);
      if (!b || !['Pending', 'No driver found'].includes(b.st) || b.drvUser) return no('Addresses can only be changed before a driver accepts.');
      if (b.pkgOf || b.pkg) return no('A reservation cannot be edited; cancel it and book again.');
      const pu = str(p.pu, 200) || b.pu,
        dr = str(p.dr, 200) || b.dr,
        it = str(p.it, 500) || b.it;
      if (!C.inZC(pu) || !C.inZC(dr)) return no('Pickup and drop-off must be within Zamboanga City.');
      if (pu.toLowerCase() == dr.toLowerCase()) return no('Pickup and drop-off must be different places.');
      if (it.length < 10) return no('List the items to transport.');
      const km = C.kmBetween(pu, dr);
      if (!km) return no('Pick both places from the suggestions so the distance can be computed.');
      const v = C.HV.find(x => x.id == b.vid),
        pr = price(v, km, b.mv, b.dc),
        old = b.tot;
      Object.assign(b, { pu, dr, it, km, kmBy: 'estimate', tot: pr.tot, bd: [v.base, pr.dist, pr.mov, pr.fee], disc: pr.disc, puC: C.coord(pu), drC: C.coord(dr) });
      delete b.min;
      (b.ev = b.ev || []).push({ t: now(), by: me.em, from: b.st, to: b.st, note: 'Addresses or items edited by the customer' });
      h.au(me.em, 'booking edited', { bk: b.id, from: old, to: b.tot });
      return ok({ tot: b.tot, was: old });
    },
    /* customer: change the pickup date or time before the driver sets off (free) */
    reschedule(me, p) {
      const b = own(me, p.id);
      if (!b) return no('Booking not found.');
      if (!['Pending', 'No driver found', 'Accepted'].includes(b.st))
        return no('The date can only be changed before the driver heads to the pickup. Cancel instead, or contact support.');
      if ((b.resch || []).length >= 3) return no('A booking can be rescheduled up to 3 times. Cancel and book again instead.');
      const dt = str(p.dt, 10),
        tm = str(p.tm, 5);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dt) || !/^\d{2}:\d{2}$/.test(tm)) return no('Choose the new pickup date and time.');
      if (dt == b.dt && tm == b.tm) return no('That is the current pickup time.');
      const at = manilaMs(dt, tm);
      if (!(at >= Date.now() + 30 * 6e4)) return no('Choose a pickup time at least 30 minutes from now.');
      if (at > Date.now() + 90 * 864e5) return no('Bookings can be made up to 90 days ahead.');
      const nb = { ...b, dt, tm };
      if (!b.drvUser && h.capFree({ id: b.id, vid: b.vid, dt, tm, km: b.km, wt: b.wt }) < 1)
        return no('No vehicle of this type is free at that time. Choose another time.');
      const from = b.dt + ' ' + b.tm,
        drv = b.drvUser;
      /* the assigned driver keeps the job only if their vehicle is free at the new time */
      let kept = false;
      if (drv) {
        const bad = h.chk(drv, nb).filter(x => !x[1] && /schedule|rented out/.test(x[0]));
        kept = !bad.length;
      }
      (b.resch = b.resch || []).push({ from, to: dt + ' ' + tm, t: now(), kept });
      Object.assign(b, { dt, tm, warned: false });
      if (drv && !kept) {
        Object.assign(b, { drvUser: '', drv: '', veh: '', acc: null, pendFrom: now() });
        h.ev(b, me.em, 'Pending', `Rescheduled from ${from} to ${dt} ${tm}; the driver is not free then, so it is open to other drivers.`);
        h.ntf(drv, 'Booking rescheduled', `${b.id} moved to ${dt} ${tm}. Your vehicle is not free then, so the job was released.`);
        h.tellDrivers(b);
      } else if (b.st == 'No driver found') {
        b.pendFrom = now();
        h.ev(b, me.em, 'Pending', `Rescheduled from ${from} to ${dt} ${tm}.`);
        h.tellDrivers(b);
      } else {
        (b.ev = b.ev || []).push({ t: now(), by: me.em, from: b.st, to: b.st, note: `Rescheduled from ${from} to ${dt} ${tm}.` });
        if (drv) h.ntf(drv, 'Booking rescheduled', `${b.id} moved from ${from} to ${dt} ${tm}.`);
      }
      h.au(me.em, 'booking rescheduled', { bk: b.id, from, to: dt + ' ' + tm, driverKept: kept });
      h.ntf(me.em, 'Booking rescheduled', `${b.id} is now on ${dt} ${tm}.` + (drv && !kept ? ' Your driver is not free then, so it is open to other drivers again.' : ''));
      return ok({ kept });
    },
    /* driver: give an accepted job back before heading to the pickup (it reopens for other drivers) */
    handBack(me, p) {
      const b = S.bk.find(x => x.id == p.id && x.drvUser == me.em);
      if (!b) return no('Booking not found or not assigned to you.');
      if (b.st != 'Accepted') return no('You can only hand back a job before you head to the pickup.');
      const reason = str(p.reason, 300);
      if (reason.length < 5) return no('Tell the customer why (at least 5 characters).');
      const owner = (h.vOf(b.veh) || {}).owner;
      Object.assign(b, { drvUser: '', drv: '', veh: '', acc: null, pendFrom: now() });
      if (b.pkgOf) b.released = true; // the reserved pick-up opens to other drivers (still prepaid)
      const rb = b.pkg && S.bk.find(x => x.id == b.pkg.ret);
      if (rb && rb.st == 'Accepted') {
        Object.assign(rb, { drvUser: '', drv: '', veh: '', acc: null });
        h.ev(rb, me.em, 'Pending', 'Released with ' + b.id);
      }
      (b.declined = b.declined || []).push(me.em);
      (b.hb = b.hb || []).push({ by: me.em, t: now(), reason });
      h.ev(b, me.em, 'Pending', 'Handed back by the driver: ' + reason);
      h.au(me.em, 'booking handed back', { bk: b.id, reason });
      h.ntf(
        b.cu,
        'Your driver cancelled',
        `${b.id}: ${me.name} can no longer take your booking (${reason}). It is open again for other drivers.`
      );
      if (owner) h.ntf(owner, 'Trip handed back', `${b.id}: ${me.name} handed back the job (${reason}).`);
      return ok();
    },
    decline(me, p) {
      const b = S.bk.find(x => x.id == p.id);
      if (!h.okr(me, 'driver')) return no('Only an approved driver can do this.');
      if (!b || b.st != 'Pending' || b.drvUser) return no('This booking is no longer open.');
      (b.declined = b.declined || []).push(me.em);
      h.au(me.em, 'booking declined', { booking: b.id });
      return ok();
    },
    /* customer: report wrong change within 24 hours of a cash payment.
       It opens a case, flags the driver for a payment discrepancy, and goes to the cashier / admin to decide. */
    changeDispute(me, p) {
      const b = S.bk.find(x => x.id == p.id && x.cu == me.em);
      if (!b) return no('Booking not found.');
      const cash = S.pay.filter(x => x.bid == b.id && x.method == 'Cash' && ['down', 'final'].includes(x.kind));
      if (!cash.length) return no('There was no cash payment on this booking.');
      const last = Math.max(...cash.map(x => new Date(x.t).getTime()));
      if (Date.now() - last > C.CHANGE_H * 36e5)
        return no(`Wrong change must be reported within ${C.CHANGE_H} hours of paying.`);
      if (S.inc.some(c => c.kind == 'change' && c.bid == b.id && c.st != 'Withdrawn')) return no('You already reported wrong change for this booking.');
      const handed = r2(cash.reduce((s, x) => s + (x.rcv != null ? x.rcv : x.amount), 0)),
        amt = r2(p.amt),
        d = str(p.d, 1000);
      if (!(amt > 0 && amt <= handed)) return no('Enter how much change you are missing (up to ' + peso(handed) + ').');
      if (d.length < 10) return no('Describe what happened (10+ characters), e.g. how much you gave and got back.');
      const t = now(),
        c = {
          id: rid('IN'),
          by: me.em,
          kind: 'change',
          bid: b.id,
          driver: b.drvUser,
          cat: 'Wrong change',
          sev: 'Medium',
          amt,
          gave: r2(p.gave) || null,
          rec: cash.map(x => ({ amount: x.amount, rcv: x.rcv != null ? x.rcv : null, chg: x.chg != null ? x.chg : null })),
          w: t.slice(0, 16),
          d,
          st: 'Unconfirmed', // a draft: the driver is flagged and the cashier told only when the customer confirms it
          t,
          log: [{ t, by: me.em, act: 'reported', note: d }],
        };
      S.inc.push(c);
      h.au(me.em, 'wrong change drafted', { bk: b.id, id: c.id, amt });
      return ok({ id: c.id, draft: true });
    },
    /* driver: give their side of a wrong-change report */
    changeReply(me, p) {
      const c = S.inc.find(x => x.id == p.id && x.kind == 'change' && x.driver == me.em);
      if (!c) return no('Report not found.');
      if (c.st != 'Submitted') return no('This report was already decided.');
      if (c.reply) return no('You already answered this report.');
      const note = str(p.note, 1000);
      if (note.length < 10) return no('Explain what happened (10+ characters).');
      c.reply = { note, t: now() };
      c.log.push({ t: now(), by: me.em, act: 'driver reply', note });
      h.au(me.em, 'wrong change reply', { id: c.id });
      h.staffEms().forEach(em => h.ntf(em, 'Driver answered ' + c.id, note));
      return ok();
    },
    step(me, p) {
      const b = mine(me, p.id),
        to = str(p.to, 40),
        note = str(p.note, 500);
      if (!b) return no('Booking not found or not assigned to you.');
      if (h.done(b)) return no('This booking is closed.');
      if (to == 'Delivery Confirmation')
        return no("Delivery is confirmed with the customer's Delivery PIN on the Active trip page.");
      if (to == 'In Transit') return no('Departure is authorized through the pre-departure verification.');
      if (!C.DRIVER_STEPS.includes(to) || C.FLOW[C.FLOW.indexOf(to) - 1] !== b.st)
        return no('Invalid step: this booking is "' + b.st + '".');
      if (to == 'Items Loaded' && !note)
        return no('Describe the cargo loaded (items, count, condition) first.');
      /* documents were checked when the job was accepted, possibly weeks ago: check them again before leaving */
      if (to == 'On the Way to Pickup') {
        const v = h.vOf(b.veh),
          iss = [...h.driverDocIssues(me.em), ...h.vehDocIssues(v)];
        if (!h.vOper(v) && !iss.length) iss.push('The vehicle is not approved and operational');
        if (iss.length)
          return no(`You cannot start this trip: ${iss[0]}. Renew it, or hand the job back so another driver can take it.`);
      }
      h.ev(b, me.em, to, note);
      h.au(me.em, 'trip ' + to, { bk: b.id });
      h.ntf(b.cu, 'Booking ' + b.id, 'Status is now ' + to + '.');
      if (to == 'Awaiting Down Payment' && h.due(b, 'down') <= 0)
        h.ev(b, 'system', 'Down Payment Confirmed', b.pkgOf ? 'Prepaid in reservation ' + b.pkgOf : 'Nothing to collect');
      if (to == 'Awaiting Final Payment' && h.due(b, 'final') <= 0 && h.paySum(b.id, 'final') <= 0) {
        h.ev(b, 'system', 'Completed', b.pkgOf ? 'Prepaid in reservation ' + b.pkgOf : 'Nothing left to collect');
        b.cd = now();
        b.split = h.splitOf(b);
      }
      return ok();
    },
    driverPay(me, p) {
      const b = mine(me, p.id),
        kind = p.kind == 'final' ? 'final' : 'down';
      if (!b) return no('Booking not found or not assigned to you.');
      const need = h.due(b, kind),
        nC = Math.round(need * 100),
        g = r2(p.g),
        c = r2(p.c),
        ref = str(p.ref, 13);
      if (kind == 'down' && b.st != 'Awaiting Down Payment')
        return no('Down payment can only be recorded after you arrive at pickup.');
      if (kind == 'final' && b.st != 'Awaiting Final Payment')
        return no('Final payment can only be recorded after delivery is documented.');
      if (h.paySum(b.id, kind) > 0) return no('This payment was already recorded.');
      if (!(need > 0)) return no('Nothing to collect on this trip: it was prepaid.');
      if (g < 0 || c < 0 || Math.round(g * 100) + Math.round(c * 100) !== nC)
        return no('Amount must equal exactly ' + peso(need) + ' (GCash + Cash).');
      /* cash handed over by the customer: the change is computed and sent to the customer on a receipt */
      const rcv = p.rcv === undefined || p.rcv === '' || p.rcv === null ? c : r2(p.rcv);
      if (c > 0 && !(rcv >= c && rcv <= c + 10000))
        return no('Enter the cash the customer handed you (at least ' + peso(c) + ').');
      /* a GCash proof the customer already submitted for this booking and stage is confirmed, not rejected as a duplicate */
      const sub =
        g > 0
          ? S.pay.find(
              x =>
                x.bid == b.id &&
                x.kind == kind &&
                x.method == 'GCash' &&
                x.status == 'Submitted' &&
                x.ref == ref
            )
          : null;
      if (g > 0) {
        if (!/^\d{10,13}$/.test(ref)) return no('Enter the 10 to 13 digit GCash reference number.');
        if (S.pay.some(x => x.ref == ref && x !== sub && x.status != 'Rejected'))
          return no('That GCash reference was already used on another booking or payment.');
        if (sub && Math.round(sub.amount * 100) !== Math.round(g * 100))
          return no(
            'The customer submitted this reference for ' +
              peso(sub.amount) +
              '. Enter that GCash amount, or ask the customer to correct it.'
          );
      }
      /* the customer said how they pay (GCash part, cash part, cash handed over): the driver's entry must match it,
         or the driver records it anyway with a note and the customer and ZamMove are told */
      const dc = (b.decl || {})[kind],
        cent = x => Math.round((+x || 0) * 100),
        mism = [];
      if (dc) {
        if (cent(dc.g) != cent(g)) mism.push(`GCash: customer said ${peso(dc.g)}, you entered ${peso(g)}`);
        if (cent(dc.c) != cent(c)) mism.push(`cash: customer said ${peso(dc.c)}, you entered ${peso(c)}`);
        if (c > 0 && dc.c > 0 && cent(dc.cg) != cent(rcv)) mism.push(`cash handed over: customer said ${peso(dc.cg)}, you entered ${peso(rcv)}`);
        if (g > 0 && dc.g > 0 && dc.ref && dc.ref != ref) mism.push(`GCash reference: customer said ${dc.ref}, you entered ${ref}`);
      }
      const why = str(p.why, 300);
      if (mism.length && !(p.force && why.length >= 5))
        return no(`This does not match what the customer declared: ${mism.join('; ')}. Check it with the customer. If your amounts are right, record it anyway and explain why.`, { mismatch: mism });
      const tx = {
        id: rid('TX'),
        due: need,
        g,
        c,
        rcv: c ? rcv : 0,
        chg: c ? r2(rcv - c) : 0,
        ref: g ? ref : '',
        by: me.em,
        decl: dc || null,
        match: dc ? !mism.length : null,
        ...(mism.length ? { diff: mism, why } : {}),
      };
      const vo = h.U((h.vOf(b.veh) || {}).owner),
        gto = b.flow == 'owner' && vo && vo.gcash ? 'owner' : 'driver'; // where a GCash payment landed
      const m = g && c ? 'Hybrid' : g ? 'GCash' : 'Cash',
        t = now(),
        base = {
          bid: b.id,
          kind,
          payer: b.cu || '',
          status: 'Recorded by driver',
          by: me.em,
          collectedBy: me.em,
          t,
          tx,
        };
      if (g) {
        if (sub) Object.assign(sub, { status: 'Recorded by driver', by: me.em, collectedBy: me.em, ct: t, tx, gto });
        else S.pay.push(h.payMk({ ...base, method: 'GCash', amount: g, ref, gto }));
      }
      if (c) S.pay.push(h.payMk({ ...base, method: 'Cash', amount: c, ref: rid('CSH'), rcv, chg: r2(rcv - c) }));
      /* e-receipt: the customer can check the change against what they actually got */
      {
        const what = kind == 'down' ? 'Down payment' : 'Final payment',
          parts = [g ? `${peso(g)} GCash` : '', c ? `${peso(c)} cash` : ''].filter(Boolean).join(' + '),
          cashTxt = c ? ` You gave ${peso(rcv)} cash; your change should be ${peso(rcv - c)}.` : '',
          declTxt = dc ? (mism.length ? ` This differs from what you declared (${mism.join('; ')}). Driver’s note: ${why}` : ' It matches what you declared.') : '',
          tail = c ? ' Wrong change? Report it on the booking within 24 hours.' : '';
        h.ntf(b.cu, 'Receipt ' + b.id, `${what} received by ${me.name}: ${parts}.${cashTxt}${declTxt}${tail}`);
        if (mism.length)
          h.staffEms().forEach(em => h.ntf(em, 'Payment differs from declaration', `${b.id} ${what.toLowerCase()}: ${mism.join('; ')}. Driver’s note: ${why}`));
        const cu = h.U(b.cu);
        if (cu && cu.ph) h.sim(cu.ph, 'SMS', `ZamMove receipt ${b.id}: ${what} ${parts}.${cashTxt}${tail}`, b.cu);
      }
      S.pay.forEach(x => {
        if (x.bid == b.id && x.kind == kind && x.status == 'Submitted') {
          x.status = 'Rejected';
          x.note = 'Not confirmed by the driver at collection';
        }
      });
      if (kind == 'down') h.ev(b, me.em, 'Down Payment Confirmed', 'Down payment ' + m);
      else {
        h.ev(b, me.em, 'Completed', 'Final payment ' + m);
        b.cd = t;
        b.split = h.splitOf(b); // frozen: later setting changes never rewrite this trip
        h.ntf(
          b.drvUser,
          'Trip completed',
          `${b.id}: your share is ${peso(b.split.drv)}. Remit ${peso(h.dueFor(b))} with this week’s remittance.`
        );
        h.ntfOwner(
          b,
          'Trip completed on your vehicle',
          `${b.id}: fare ${peso(b.split.fare)}, your share ${peso(b.split.own)}.`
        );
      }
      h.au(me.em, 'payment ' + kind, { bk: b.id, amount: need, method: m, linkedCustomerProof: !!sub, tx: tx.id, matchesDeclaration: tx.match });
      h.ntf(
        b.cu,
        'Payment confirmed',
        peso(need) +
          ' ' +
          (kind == 'down' ? 'down payment' : 'final payment') +
          ' for ' +
          b.id +
          ' was recorded by your driver.'
      );
      return ok();
    },
    adminAssign(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can assign drivers.');
      const b = S.bk.find(x => x.id == p.id);
      if (!b || b.drvUser || !['Pending', 'No driver found'].includes(b.st))
        return no('This booking is not waiting for a driver.');
      const d = h.U(str(p.driver, 120).toLowerCase());
      if (!d) return no('Choose a driver.');
      const prev = b.st;
      b.st = 'Pending';
      const r = A.accept(d, { id: b.id });
      if (!r.ok) {
        b.st = prev;
        return no(d.name + ': ' + r.err);
      }
      b.ev[b.ev.length - 1].note = 'Driver assigned by an administrator (was ' + prev + ')';
      b.ev[b.ev.length - 1].by = me.em;
      h.au(me.em, 'driver assigned by admin', { bk: b.id, driver: d.em, from: prev });
      h.ntf(d.em, 'Booking assigned', `An administrator assigned ${b.id} to you (${b.dt} ${b.tm}).`);
      return ok();
    },

    /* ---- live GPS (driver's phone -> server -> customer's map) ---- */
    gpsPing(me, p) {
      const b = mine(me, p.id);
      if (!b) return no('Only the assigned driver can share location for this trip.');
      if (!C.TRACK_ST.includes(b.st))
        return no('Location sharing is only available during an active trip.', { stop: true });
      const lat = +p.lat,
        lng = +p.lng;
      if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) || (lat == 0 && lng == 0))
        return no('Invalid location.');
      const ms = Date.now();
      if (b.gps && !b.gps.off && ms - b.gps.ms < 4000) return ok({ skipped: true }); // at most one update every 4 s
      const r6 = x => Math.round(x * 1e6) / 1e6;
      const first = !b.gpsStart;
      b.gps = {
        lat: r6(lat),
        lng: r6(lng),
        acc: Math.max(0, Math.min(5000, Math.round(+p.acc || 0))),
        spd: +p.spd >= 0 && +p.spd < 70 ? Math.round(+p.spd * 10) / 10 : null, // metres per second
        hdg: +p.hdg >= 0 && +p.hdg <= 360 ? Math.round(+p.hdg) : null,
        t: now(),
        ms,
        inArea: C.zcBox(lat, lng),
      };
      (b.trail = b.trail || []).push([r6(lat), r6(lng), ms]);
      if (b.trail.length > 120) b.trail.splice(0, b.trail.length - 120);
      if (first) {
        b.gpsStart = now();
        h.au(me.em, 'live location started', { bk: b.id });
        h.ntf(b.cu, 'Live tracking started', b.id + ': you can follow your driver on the Track page.');
      }
      return ok();
    },
    /* driver: a Waze "Share drive" link the customer can open as a backup to the live map ('' removes it) */
    wazeLink(me, p) {
      const b = mine(me, p.id);
      if (!b) return no('Booking not found or not assigned to you.');
      if (!C.TRACK_ST.includes(b.st)) return no('A Waze link can only be shared during an active trip.');
      const u = str(p.url, 400);
      if (!u) {
        delete b.wz;
        return ok();
      }
      let host = '';
      try {
        const x = new URL(u);
        host = x.protocol == 'https:' ? x.hostname.toLowerCase() : '';
      } catch (e) {}
      if (!/(^|\.)waze\.com$/.test(host))
        return no(
          'Paste the link from Waze → Share drive (it starts with https://waze.com or https://www.waze.com).'
        );
      b.wz = u;
      h.au(me.em, 'waze link shared', { bk: b.id });
      h.ntf(b.cu, 'Follow your driver on Waze', b.id + ': your driver shared a Waze link on the Track page.');
      return ok();
    },
    gpsStop(me, p) {
      const b = mine(me, p.id);
      if (!b) return no('Booking not found or not assigned to you.');
      if (b.gps) b.gps.off = now();
      h.au(me.em, 'live location paused', { bk: b.id });
      return ok();
    },
  };
  /* public: a booking reference shows its status only (no names, no addresses beyond the area) */
  A.publicTrack = p => {
    const b = S.bk.find(x => x.id == str(p.ref, 20).toUpperCase());
    return b
      ? ok({
          b: { id: b.id, st: b.st, pu: String(b.pu).split(',')[0], dr: String(b.dr).split(',')[0], dt: b.dt },
        })
      : no('No booking with that reference.');
  };
  return A;
};
