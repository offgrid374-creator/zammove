'use strict';
/* Self-drive rentals (customer side). Incident reports live in incidents.js. */
const C = require('./constants');
const { now, r2, rid, str, img, ok, no, peso, todayPH, sha256, manilaMs } = require('../util');

const FUEL = ['Full', '3/4', '1/2', '1/4', 'Empty'];
const nm = x =>
  String(x || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

module.exports = (S, h) => {
  /* The rental contract: a frozen copy of the parties, vehicle, dates, money and clauses, plus a SHA-256
     fingerprint of exactly that content. Each signature records the fingerprint it agreed to. */
  const issueContract = r => {
    const v = h.vOf(r.veh) || {},
      cu = h.U(r.cu) || {},
      ow = h.U(r.owner) || {};
    const terms = {
      v: C.CONTRACT_V,
      no: 'CT-' + String(r.id).replace(/^RN-/, ''),
      rental: r.id,
      issued: todayPH(),
      owner: { name: ow.name || '', ph: ow.ph || '', ad: ow.ad || '' },
      renter: { name: cu.name || '', ph: cu.ph || '', ad: cu.ad || '', lic: r.lic || '', exp: r.exp || '' },
      veh: {
        name: [v.brand, v.model].filter(Boolean).join(' ') || r.vn,
        year: v.year || '',
        color: v.color || '',
        plate: v.plate || '',
        type: (C.VT.find(t => t.id == v.type) || {}).n || v.type || '',
        seats: v.seats || '',
        trans: v.trans || '',
        fuel: v.fuel || '',
      },
      s: r.s,
      e: r.e,
      pt: r.pt || C.RN_PICKUP_TM,
      rtm: r.rtm || C.RN_RETURN_TM,
      days: r.days,
      day: r.day,
      tot: r.tot,
      dep: h.depOf(r),
      pu: r.pu,
      rt: r.rt,
      clauses: C.CONTRACT.map(([t, x]) =>
        r.withDrv && t == 'Authorized driver'
          ? { t: 'Driver provided by the Owner', x: `The Owner provides the driver named in ZamMove${r.withDrv.name ? ' (' + r.withDrv.name + ')' : ''}, who alone drives the vehicle for the rental period. The Renter does not drive. The driver brings the vehicle back and the Owner records the return.` }
          : { t, x }
      ),
    };
    r.ct = { terms, h: sha256(JSON.stringify(terms)), cr: now(), sg: {} };
    return r.ct;
  };
  const signed = r => !!(r.ct && r.ct.sg && r.ct.sg.cu && r.ct.sg.ow);
  const readings = p => {
    const odo = Math.round(+p.odo);
    if (p.odo === '' || p.odo == null || !(odo >= 0 && odo < 2e6))
      return { err: 'Enter the odometer reading (km).' };
    if (!FUEL.includes(p.fuel)) return { err: 'Choose the fuel level.' };
    const ph = {},
      got = p.ph && typeof p.ph == 'object' ? p.ph : {};
    for (const [k, n] of C.HANDOVER_PH) {
      ph[k] = img(got[k]);
      if (!ph[k])
        return {
          err:
            'Add the ' +
            n.toLowerCase() +
            ' photo (all ' +
            C.HANDOVER_PH.length +
            ' handover photos are required).',
        };
    }
    return { odo, fuel: p.fuel, ph, t: now() };
  };
  /* the vehicle is back: record it, charge a late return, stop tracking. by: who closed it (an email or 'system') */
  const closeReturn = (r, by, back, cond, rq, msg) => {
    r.back = back;
    r.cond = cond;
    /* the contract: after a 2-hour grace period every late day or part of a day is charged at the daily rate.
       The grace runs 2 hours from the return time the renter chose (6 PM for older rentals). Counted from when the renter handed it back. */
    const graceEnd = manilaMs(r.e, r.rtm || C.RN_RETURN_TM) + 2 * 36e5,
      backAt = rq ? new Date(rq.t).getTime() : Date.now();
    if (backAt > graceEnd) {
      const days = Math.ceil((backAt - graceEnd) / 864e5);
      r.late = { days, amt: r2(days * r.day), t: now() };
    }
    delete r.trail; // the contract allows tracking only until the vehicle is returned
    delete r.gps;
    r.st = 'Returned';
    (r.hist = r.hist || []).push({ st: 'Returned', t: now(), by, note: cond });
    h.au(by, 'rental return', { id: r.id });
    h.ntf(r.cu, 'Rental ' + r.id, msg + ' Condition: ' + r.cond + '.' + (r.late ? ` Returned ${r.late.days} day${r.late.days > 1 ? 's' : ''} late: ${peso(r.late.amt)} late charge is due (contract). If it is not paid, it is taken from your deposit.` : ''));
    return ok();
  };
  const fromRenter = rq => ({ odo: rq.odo, fuel: rq.fuel, ph: rq.ph, t: rq.t, by: 'renter', cu: { ok: true, note: 'Submitted by the renter', t: rq.t } });
  const pickupMs = r => manilaMs(r.s, r.pt || C.RN_PICKUP_TM);
  h.rnPickupMs = pickupMs;
  const comm = () => (S.cfg.comm == null ? 15 : +S.cfg.comm);
  /* a refund owed to the renter: by the owner when they hold the money, otherwise by ZamMove's cashier */
  const refundTo = (r, amount, byOwner, note) => {
    if (!(amount > 0.005)) return null;
    const x = h.payMk({ bid: r.id, kind: 'refund', method: '', amount: r2(amount), ref: rid('RF'), payer: byOwner ? r.owner : 'zammove', to: r.cu, status: 'Due', note, ...(byOwner ? { from: r.owner } : {}) });
    S.pay.push(x);
    if (byOwner) h.ntf(r.owner, 'Refund to send', `${r.id}: send ${peso(amount)} back to the renter within ${C.REFUND_ALERT_H} hours and record it under Rentals.`);
    return x;
  };
  /* close a rental before release and refund what was paid; a late cancellation lets the owner keep one day's fee */
  const cancelRental = (r, by, why, feeDue, msgRenter) => {
    const got = S.pay.filter(x => x.bid == r.id && ['rental', 'deposit'].includes(x.kind) && x.status == 'Verified'),
      paid = r2(got.reduce((s, x) => s + x.amount, 0)),
      ownerPart = r2(got.filter(x => x.coll == r.owner).reduce((s, x) => s + x.amount, 0)),
      zmPart = r2(paid - ownerPart),
      keep = r2(Math.min(feeDue, paid)),
      keepO = r2(Math.min(keep, ownerPart)),
      keepZ = r2(keep - keepO);
    r.st = 'Cancelled';
    r.cxl = { t: now(), by, why, fee: feeDue, kept: keep, left: r2(feeDue - keep) };
    if (keep > 0) {
      const zc = r2((keep * comm()) / 100);
      r.split = { fee: keep, comm: comm(), zc, own: r2(keep - zc), kept: 0, cxl: true };
    }
    refundTo(r, ownerPart - keepO, true, 'Refund: rental cancelled');
    refundTo(r, zmPart - keepZ, false, 'Refund: rental cancelled');
    (r.hist = r.hist || []).push({ st: 'Cancelled', t: now(), by, note: why });
    h.au(by, 'rental cancelled', { id: r.id, why, fee: keep });
    const back = r2(paid - keep);
    h.ntf(r.cu, 'Rental ' + r.id, msgRenter + (paid > 0 ? ` ${back > 0 ? peso(back) + ' is refunded to you' + (keep ? ` (the owner keeps ${peso(keep)}, one day’s fee)` : '') + '.' : 'The owner keeps what you paid as the late cancellation fee.'}` : ''));
    return { paid, keep, back };
  };
  /* a payment confirmed after the rental was cancelled: take any unpaid cancellation fee from it, refund the rest */
  h.lateRentalPay = (r, x) => {
    const left = r2((r.cxl && r.cxl.left) || 0),
      take = r2(Math.min(left, x.amount));
    if (take > 0) {
      r.cxl.left = r2(left - take);
      r.cxl.kept = r2((r.cxl.kept || 0) + take);
      const zc = r2((r.cxl.kept * comm()) / 100);
      r.split = { fee: r.cxl.kept, comm: comm(), zc, own: r2(r.cxl.kept - zc), kept: 0, cxl: true };
    }
    refundTo(r, x.amount - take, x.coll == r.owner, 'Refund: payment confirmed after the rental was cancelled');
  };
  /* complete a returned rental: settle the deposit and the owner's share (by an owner, an admin or the system) */
  const completeRental = (r, by) => {
    const dep = h.depOf(r),
      kept = r.claim ? r2(r.claim.final) : 0,
      lateDep = r2(Math.max(0, Math.min(h.rentDue(r) - h.paySum(r.id, 'rental'), dep - kept))); // an unpaid late charge comes out of the deposit
    r.settle = { dep, kept, ...(lateDep ? { late: lateDep } : {}), refund: r2(dep - kept - lateDep), t: now() };
    /* rental income: ZamMove keeps its commission on the vehicle; a driver fee goes to the owner in full */
    const fee = h.rentDue(r),
      dfee = r.withDrv ? r2(r.days * r.withDrv.day) : 0,
      zc = r2(((fee - dfee) * comm()) / 100);
    r.split = { fee, comm: comm(), zc, own: r2(fee - zc), kept, ...(dfee ? { dfee } : {}) };
    const ownerHeld = S.pay.some(x => x.bid == r.id && x.kind == 'deposit' && x.coll == r.owner && x.status == 'Verified');
    r.settle.by = ownerHeld ? 'owner' : 'zammove';
    if (r.settle.refund > 0)
      S.pay.push(h.payMk({ bid: r.id, kind: 'deposit_refund', method: '', amount: r.settle.refund, ref: rid('RF'), payer: ownerHeld ? r.owner : by, to: r.cu, status: 'Due', note: 'Deposit refund', ...(ownerHeld ? { from: r.owner } : {}) }));
    if (ownerHeld && r.settle.refund > 0)
      h.ntf(r.owner, 'Refund the deposit', `${r.id}: send ${peso(r.settle.refund)} back to the renter within ${C.REFUND_ALERT_H} hours and record it under Rentals.`);
    h.ntf(r.owner, 'Rental income', `${r.id}: your share ${peso(r.split.own + kept)} is added to your payable balance.`);
    r.st = 'Completed';
    (r.hist = r.hist || []).push({ st: 'Completed', t: now(), by });
    h.au(by, 'rental complete', { id: r.id });
    h.ntf(
      r.cu,
      'Rental ' + r.id,
      (by == 'system' ? `Rental completed automatically (no claim within ${C.CLAIM_DAYS} days). ` : 'Rental completed. ') +
        (kept
          ? peso(kept) + ' of the deposit was kept for the claim; ' + peso(dep - kept)
          : 'Your full ' + peso(dep) + ' deposit') +
        ' will be refunded to you by the ' + (r.settle.by == 'owner' ? 'owner.' : 'cashier.')
    );
    return ok();
  };
  /* the owner did not check a renter's return within RET_CHECK_H hours: it is accepted as submitted (contract) */
  h.sweepRentals = () => {
    let ch = 0;
    /* once a week, remind owners who owe ZamMove rental commission */
    const wk = h.wk(now());
    S.users.forEach(u => {
      if (u.remWk == wk || !h.okr(u, 'owner')) return;
      const b = h.ownerBal(u.em),
        owes = r2(-b.due - b.sent);
      if (owes > 0.005) {
        u.remWk = wk;
        h.ntf(u.em, 'Weekly remittance', `Please remit ${peso(owes)} rental commission to ZamMove this week (Earnings → Remit to ZamMove).`);
        ch = 1;
      }
    });
    S.rn.forEach(r => {
      const q = r.rq;
      if (r.st != 'Active' || !q || q.redo || Date.now() - new Date(q.t).getTime() < C.RET_CHECK_H * 36e5) return;
      closeReturn(r, 'system', { ...fromRenter(q), auto: true }, q.note + ' (accepted automatically: the owner did not check it within ' + C.RET_CHECK_H + ' hours)', q, 'Your return was accepted as you submitted it, because the owner did not check it within ' + C.RET_CHECK_H + ' hours.');
      h.ntf(r.owner, 'Rental ' + r.id, `The return was accepted automatically after ${C.RET_CHECK_H} hours, using the renter’s photos and readings. You can still claim part of the deposit within ${C.CLAIM_DAYS} days.`);
      ch = 1;
    });
    const t = Date.now();
    S.rn.forEach(r => {
      /* an unanswered request expires */
      if (r.st == 'Pending' && (t - new Date(r.cr).getTime() > C.RN_PENDING_H * 36e5 || t >= pickupMs(r))) {
        cancelRental(r, 'system', `Expired: the owner did not answer within ${C.RN_PENDING_H} hours.`, 0, `Your request expired because the owner did not answer within ${C.RN_PENDING_H} hours. You were not charged; choose another vehicle.`);
        r.expired = 'owner';
        h.ntf(r.owner, 'Rental request expired', `${r.id} expired because it was not answered within ${C.RN_PENDING_H} hours.`);
        ch = 1;
      }
      /* an approved rental not fully paid shortly before pickup is cancelled, with a full refund of anything paid */
      else if (r.st == 'Approved' && !paidUp(r) && t >= pickupMs(r) - C.RN_UNPAID_H * 36e5) {
        cancelRental(r, 'system', `Cancelled: not fully paid ${C.RN_UNPAID_H} hours before pickup.`, 0, `${r.id} was cancelled because it was not fully paid ${C.RN_UNPAID_H} hours before pickup.`);
        r.expired = 'unpaid';
        h.ntf(r.owner, 'Rental cancelled', `${r.id} was cancelled automatically: not fully paid ${C.RN_UNPAID_H} hours before pickup. The dates are free again.`);
        ch = 1;
      }
      /* no claim (or a settled one) after the claim window: the rental completes by itself */
      else if (r.st == 'Returned' && r.back && (!r.claim || ['Accepted', 'Decided'].includes(r.claim.st)) && (paidUp(r) || lateCovered(r)) && t - new Date(r.back.t).getTime() > C.CLAIM_DAYS * 864e5) {
        completeRental(r, 'system');
        h.ntf(r.owner, 'Rental ' + r.id, `Completed automatically after the ${C.CLAIM_DAYS}-day claim window.`);
        ch = 1;
      }
    });
    /* owners who have not sent a refund: a reminder, then ZamMove is alerted */
    S.pay.forEach(x => {
      if (!['deposit_refund', 'refund'].includes(x.kind) || !x.from || x.status != 'Due') return;
      const age = t - new Date(x.t).getTime();
      if (age > C.REFUND_REMIND_H * 36e5 && !x.rem1) {
        x.rem1 = now();
        h.ntf(x.from, 'Refund reminder', `${x.bid}: please send the ${peso(x.amount)} refund to the renter and record it under Rentals.`);
        ch = 1;
      }
      if (age > C.REFUND_ALERT_H * 36e5 && !x.alert) {
        x.alert = now();
        h.staffEms().forEach(em => h.ntf(em, 'Refund overdue', `${x.bid}: the owner has not sent the renter’s ${peso(x.amount)} refund in ${C.REFUND_ALERT_H} hours.`));
        h.ntf(x.to, 'Refund delayed', `${x.bid}: your ${peso(x.amount)} refund is late. ZamMove was told and will follow up with the owner.`);
        ch = 1;
      }
    });
    /* owners who owe ZamMove for too long: rental listings pause until they remit */
    S.users.forEach(u => {
      if (!h.okr(u, 'owner')) return;
      const b = h.ownerBal(u.em),
        owes = r2(-b.due - b.sent);
      if (owes > 0.005) {
        if (!u.owesSince) (u.owesSince = now()), (ch = 1);
        if (!u.rentPaused && t - new Date(u.owesSince).getTime() > C.REMIT_PAUSE_D * 864e5) {
          u.rentPaused = now();
          h.ntf(u.em, 'Rental listings paused', `You have owed ZamMove ${peso(owes)} for over ${C.REMIT_PAUSE_D} days, so your vehicles are hidden from renters. Remit it (Earnings → Remit to ZamMove) to list them again.`);
          h.staffEms().forEach(em => h.ntf(em, 'Owner listings paused', `${u.name || u.em} owes ${peso(owes)} rental commission for over ${C.REMIT_PAUSE_D} days.`));
          ch = 1;
        }
      } else if (u.owesSince || u.rentPaused) {
        if (u.rentPaused) h.ntf(u.em, 'Rental listings active again', 'Thank you. Your vehicles are visible to renters again.');
        delete u.owesSince;
        delete u.rentPaused;
        ch = 1;
      }
    });
    return ch;
  };
  /* only the late charge is unpaid, and the deposit (after any claim) covers it */
  const lateCovered = r =>
    h.paySum(r.id, 'deposit') >= h.depOf(r) - 0.005 &&
    h.paySum(r.id, 'rental') >= r.tot - 0.005 &&
    h.rentDue(r) - h.paySum(r.id, 'rental') <= h.depOf(r) - (r.claim ? +r.claim.final || 0 : 0) + 0.005;
  const paidUp = r =>
    h.paySum(r.id, 'deposit') >= h.depOf(r) - 0.005 && h.paySum(r.id, 'rental') >= h.rentDue(r) - 0.005;
  h.rnReady = r => paidUp(r) && signed(r); // handover.js: the pickup check opens
  h.rnReadings = readings;
  return {
    /* the customer picks one registered vehicle (p.veh) for s..e */
    createRental(me, p) {
      if (!me.ver) return no('Verify your account first (see the banner on Home).');
      const v = h.vOf(str(p.veh, 20)),
        s = str(p.s, 10),
        e = str(p.e, 10),
        lic = str(p.lic, 30),
        exp = str(p.exp, 10),
        pu = str(p.pu, 200),
        rt = str(p.rt, 200);
      if (!v || !h.rentable(v)) return no('Select an available vehicle.');
      if (v.owner == me.em) return no('You cannot rent your own vehicle.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || e < s)
        return no('Choose valid start and end dates.');
      if (s < todayPH()) return no('The start date cannot be in the past.');
      const okTm = x => /^\d{2}:(00|30)$/.test(x) && x >= C.RN_TM_MIN && x <= C.RN_TM_MAX,
        pt = p.pt == null || p.pt === '' ? C.RN_PICKUP_TM : str(p.pt, 5),
        rtm = p.rtm == null || p.rtm === '' ? C.RN_RETURN_TM : str(p.rtm, 5);
      if (!okTm(pt) || !okTm(rtm)) return no('Choose pickup and return times between 6:00 AM and 8:00 PM (every 30 minutes).');
      if (s == e && rtm <= pt) return no('On a one-day rental the return time must be after the pickup time.');
      if (manilaMs(s, pt) < Date.now() + 36e5) return no('The pickup time must be at least 1 hour from now.');
      const days = Math.round((new Date(e) - new Date(s)) / 864e5) + 1;
      if (days > 30) return no('Rentals are limited to 30 days. Contact ZamMove for longer rentals.');
      /* with a driver: one of the owner's drivers drives; the renter needs only a valid ID */
      const wd = !!p.withDrv,
        drvDay = +((v.rent || {}).drv || 0);
      if (wd && !(drvDay > 0)) return no('This vehicle is not offered with a driver. Choose self-drive or another vehicle.');
      if (!C.inZC(pu) || (!wd && !C.inZC(rt)))
        return no('Pickup and return must be in Zamboanga City (pick a known place or include “Zamboanga”).');
      if (!wd && lic.length < 6) return no('Enter your license number.');
      if (!wd && (!exp || exp < e)) return no('Your license must be valid through the rental period.');
      if (!img(p.ip)) return no('Upload a photo of your valid ID.');
      if (!wd && !img(p.lp)) return no('Upload a photo of your driver’s license.');
      const clash = h.rentClash(v.id, s, e);
      if (clash) return no(clash + ' Choose other dates or another unit.');
      const r = {
        id: rid('RN'),
        cu: me.em,
        veh: v.id,
        vid: v.id,
        vt: v.type,
        owner: v.owner,
        vn: [v.brand, v.model].filter(Boolean).join(' '),
        day: +v.rent.day,
        s,
        e,
        pt,
        rtm,
        hv: 1, // pickup and return are checked with the renter's code (handover.js)
        days,
        tot: r2(days * (v.rent.day + (wd ? drvDay : 0))),
        ...(wd ? { withDrv: { day: drvDay } } : {}),
        dep: +v.rent.dep || C.DEP,
        st: 'Pending',
        pu,
        rt: wd ? rt || pu : rt,
        lic: wd ? '' : lic,
        exp: wd ? '' : exp,
        ip: img(p.ip),
        lp: wd ? '' : img(p.lp),
        cr: now(),
        hist: [{ st: 'Pending', t: now(), by: me.em }],
      };
      S.rn.push(r);
      h.au(me.em, 'rental requested', { id: r.id, vehicle: v.id });
      h.ntf(me.em, 'Rental request sent', r.id + ' is waiting for the owner’s approval. Do not pay yet: you are told when it is approved.');
      h.ntf(v.owner, 'New rental request', `${r.id}: ${r.vn} (${v.plate}), ${s} ${pt} to ${e} ${rtm}.`);
      return ok({ id: r.id });
    },
    /* owner of the vehicle (or an administrator) moves the rental along:
     approve | reject (Pending) → release (Approved, deposit verified) → return (Active) → complete (Returned, fully paid) */
    rentalDecision(me, p) {
      const r = S.rn.find(x => x.id == p.id);
      if (!r || !r.veh) return no('Rental not found.');
      const v = h.vOf(r.veh);
      const drives = !!r.withDrv && r.withDrv.em == me.em && ['release', 'return'].includes(p.act); // the rental's driver hands over and back
      if (!(v && v.owner == me.em && h.acct(me)) && !h.isAdmin(me) && !drives)
        return no('Only the vehicle owner or an administrator can manage this rental.');
      if (r.cu == me.em) return no('You cannot decide your own rental.');
      const act = p.act,
        note = str(p.note, 300),
        go = (st, msg) => {
          r.st = st;
          (r.hist = r.hist || []).push({ st, t: now(), by: me.em, note });
          h.au(me.em, 'rental ' + act, { id: r.id });
          h.ntf(r.cu, 'Rental ' + r.id, msg);
          return ok();
        };
      if (act == 'approve') {
        if (r.st != 'Pending') return no('Only pending requests can be approved.');
        if (r.withDrv) {
          const de = str(p.driver, 120).toLowerCase() || (p.self ? r.owner : '');
          const du = h.U(de);
          if (!du || !(de == r.owner || (h.okr(du, 'driver') && h.driverOwner(de) == r.owner)))
            return no('Choose which of your drivers will drive for this rental (or yourself).');
          const clash = S.bk.find(b => b.drvUser == de && !h.done(b) && b.dt >= r.s && b.dt <= r.e);
          if (clash) return no(`${du.name} has hauling trip ${clash.id} on ${clash.dt}. Choose another driver.`);
          r.withDrv.em = de;
          r.withDrv.name = du.name;
          if (de != r.owner) h.ntf(de, 'Rental driving job', `${r.id}: you drive the ${r.vn} for the renter, ${r.s} to ${r.e}.`);
        }
        if (!h.rentable(v)) return no('The vehicle is not available for rental right now.');
        const clash = h.rentClash(v.id, r.s, r.e, r.id);
        if (clash) return no(clash);
        issueContract(r);
        return go(
          'Approved',
          'Approved. Read and sign the rental contract (My rentals → Contract) and pay the full ' +
            peso(r.tot + h.depOf(r)) +
            ' (rental fee + refundable deposit) before pickup on ' +
            r.s +
            '.'
        );
      }
      if (act == 'reject') {
        if (r.st != 'Pending') return no('Only pending requests can be rejected.');
        if (note.length < 5) return no('Write the reason for the customer.');
        return go('Rejected', 'Not approved: ' + note);
      }
      if (act == 'release') {
        if (r.st != 'Approved') return no('Approve the request first.');
        if (!paidUp(r))
          return no(
            'Full payment is not verified yet: deposit ' +
              peso(h.paySum(r.id, 'deposit')) +
              ' of ' +
              peso(h.depOf(r)) +
              ', rental fee ' +
              peso(h.paySum(r.id, 'rental')) +
              ' of ' +
              peso(r.tot) +
              '. A cashier must verify the payments first.'
          );
        if (!signed(r))
          return no(
            'The rental contract is not signed by both of you yet. Sign it in ZamMove, or print it, have it signed and upload a photo of the signed page.'
          );
        if (r.hv) return h.hoRelease(r, me, p, note, go); // checked with the renter's Release code (handover.js)
        const out = readings(p);
        if (out.err) return no(out.err);
        r.out = { ...out, cond: note || 'No issues noted' };
        return go(
          'Active',
          'The vehicle was released to you. Keep location sharing on while driving (My rentals → Share location). Return it on ' +
            r.e +
            '.'
        );
      }
      if (act == 'retake') {
        /* the renter's return photos are unclear or incomplete: ask for new ones */
        if (r.st != 'Active' || !r.rq || r.rq.redo) return no('There is no return from the renter to send back.');
        if (note.length < 5) return no('Tell the renter what to retake (at least 5 characters).');
        r.rq.redo = { note, t: now() };
        h.au(me.em, 'rental return sent back', { id: r.id });
        h.ntf(r.cu, 'Rental ' + r.id, 'The owner asked you to submit the return again: ' + note);
        return ok();
      }
      if (act == 'return') {
        if (r.st != 'Active') return no('The vehicle has not been released.');
        const gate = h.hoReturnGate(r, me, p);
        if (gate) return gate;
        const rq = r.rq && !r.rq.redo ? r.rq : null;
        let back, cond;
        if (rq && p.match) {
          /* the owner checked the vehicle and it matches what the renter submitted */
          back = fromRenter(rq);
          cond = rq.note + (note ? ' Owner: ' + note : '');
        } else {
          /* the owner records the return: something differs from the renter's submission, or the renter did not submit one */
          if (rq && note.length < 5) return no('Describe what is different from the renter’s photos and readings.');
          back = readings(p);
          if (back.err) return no(back.err);
          if (r.out && back.odo < r.out.odo)
            return no('The odometer cannot be lower than at release (' + r.out.odo + ' km).');
          if (rq) back.diff = true;
          cond = note || 'No issues noted';
        }
        return closeReturn(
          r,
          me.em,
          back,
          cond,
          rq,
          rq && p.match
            ? 'The owner checked the vehicle and confirmed your return.'
            : rq
              ? 'The owner found a difference from your return photos. Check the owner’s record under My rentals and confirm or dispute it.'
              : 'Return recorded.'
        );
      }
      if (act == 'complete') {
        if (r.st != 'Returned') return no('Record the return first.');
        if (!paidUp(r) && !lateCovered(r)) return no('The rental fee and deposit are not fully verified yet.');
        if (r.claim && !['Accepted', 'Decided'].includes(r.claim.st))
          return no(
            'The deposit claim is still open. The renter must accept it or an administrator must decide it first.'
          );
        return completeRental(r, me.em);
      }
      return no('Unknown action.');
    },
    /* renter: hand the vehicle back with the 6 photos, odometer and fuel; the owner then checks it and marks it returned */
    rentalReturn(me, p) {
      const r = S.rn.find(x => x.id == p.id && x.cu == me.em);
      if (!r) return no('Rental not found.');
      if (r.st != 'Active') return no('Only a vehicle on rent can be returned.');
      if (r.withDrv) return no('Your driver brings the vehicle back; the owner records the return.');
      if (r.rq && !r.rq.redo) return no('You already submitted the return. Wait for the owner to check the vehicle.');
      const x = readings(p);
      if (x.err) return no(x.err.replace('handover photos', 'return photos'));
      if (r.out && x.odo < r.out.odo) return no('The odometer cannot be lower than at release (' + r.out.odo + ' km).');
      const prev = r.rq ? [...(r.rq.prev || []), { t: r.rq.t, redo: r.rq.redo }] : [];
      /* where and when: the phone's location at submission and how old each photo file is (signals for the owner, not proof) */
      const la = +(p.loc || {}).lat,
        lo = +(p.loc || {}).lng,
        hasLoc = la >= -90 && la <= 90 && lo >= -180 && lo <= 180 && !(la == 0 && lo == 0) && p.loc && p.loc.lat != null,
        km = hasLoc ? C.kmFrom(r.rt, la, lo) : null,
        loc = hasLoc ? { lat: la, lng: lo, acc: Math.max(0, Math.min(5000, Math.round(+p.loc.acc || 0))), km: km == null ? null : Math.round(km * 10) / 10 } : null,
        ms = Date.now(),
        old = C.HANDOVER_PH.filter(([k]) => +((p.pt || {})[k]) > 0 && ms - +p.pt[k] > C.RET_PHOTO_MIN * 6e4).map(([, n]) => n),
        flags = [
          ...(!loc ? ['No phone location' + (p.locErr ? ' (' + str(p.locErr, 60) + ')' : '')] : []),
          ...(loc && loc.km != null && loc.km > C.RET_FAR_KM ? [loc.km + ' km from the agreed return point'] : []),
          ...(old.length ? ['Older photo files: ' + old.join(', ')] : []),
        ];
      r.rq = { ...x, note: str(p.note, 300) || 'No issues noted', prev, loc, flags };
      if (r.gps && !r.gps.off) r.gps.off = now(); // the renter has stopped driving
      h.au(me.em, 'rental return submitted', { id: r.id });
      h.ntf(me.em, 'Return submitted', r.id + ': the owner checks the vehicle against your photos and then marks it returned.');
      h.ntf(
        r.owner,
        'Vehicle returned by the renter',
        `${r.id}: ${r.vn} was handed back (odometer ${x.odo} km, fuel ${x.fuel}).${flags.length ? ' Check: ' + flags.join('; ') + '.' : ''} Check it against the renter’s photos within ${C.RET_CHECK_H} hours under Rentals, or it is accepted as submitted.`
      );
      return ok();
    },
    /* renter: confirm the handover photos and readings, or report what is different */
    rentalCheck(me, p) {
      const r = S.rn.find(x => x.id == p.id && x.cu == me.em);
      if (!r) return no('Rental not found.');
      const stage = p.stage == 'back' ? 'back' : 'out',
        rec = r[stage];
      if (!rec)
        return no(
          stage == 'out' ? 'The vehicle has not been released yet.' : 'The return has not been recorded yet.'
        );
      if (rec.cu) return no('You already answered.');
      const note = str(p.note, 500);
      if (!p.ok && note.length < 5) return no('Describe what is different from the photos and readings.');
      rec.cu = { ok: !!p.ok, note, t: now() };
      h.au(me.em, 'rental handover ' + (p.ok ? 'confirmed' : 'disputed'), { id: r.id, stage });
      h.ntf(
        r.owner,
        'Rental ' + r.id,
        'The renter ' +
          (p.ok ? 'confirmed' : 'reported a difference in') +
          ' the ' +
          (stage == 'out' ? 'release' : 'return') +
          ' record' +
          (p.ok ? '.' : ': ' + note)
      );
      return ok();
    },
    /* owner: keep part or all of the deposit after the return (damage, missing items, fuel, late return) */
    rentalClaim(me, p) {
      const r = S.rn.find(x => x.id == p.id);
      if (!r || r.owner != me.em || !h.acct(me))
        return no('Only the vehicle owner can claim against the deposit.');
      if (r.st != 'Returned') return no('A deposit claim can only be made after the return is recorded.');
      if (r.claim) return no('A claim was already made for this rental.');
      if (r.back && Date.now() - new Date(r.back.t) > C.CLAIM_DAYS * 864e5)
        return no('The ' + C.CLAIM_DAYS + '-day claim period after the return has ended.');
      const dep = h.depOf(r),
        amt = r2(p.amt),
        reason = str(p.reason, 1000),
        ph = (Array.isArray(p.ph) ? p.ph : []).map(img).filter(Boolean).slice(0, 6);
      if (!(amt > 0 && amt <= dep))
        return no('Enter an amount between ₱1 and the deposit (' + peso(dep) + ').');
      if (reason.length < 10) return no('Explain what the amount is for (10+ characters).');
      if (!ph.length) return no('Add at least one photo of the damage or receipt.');
      r.claim = { amt, reason, ph, t: now(), st: 'Open', log: [{ t: now(), by: me.em, act: 'claim' }] };
      h.au(me.em, 'rental deposit claim', { id: r.id, amt });
      h.ntf(
        r.cu,
        'Deposit claim on ' + r.id,
        'The owner claims ' +
          peso(amt) +
          ' of your deposit: ' +
          reason +
          ' Accept or dispute it in My rentals.'
      );
      return ok();
    },
    /* renter: accept the claim, or dispute it (an administrator then decides) */
    rentalClaimReply(me, p) {
      const r = S.rn.find(x => x.id == p.id && x.cu == me.em);
      if (!r || !r.claim) return no('Claim not found.');
      if (r.claim.st != 'Open') return no('You already answered this claim.');
      const note = str(p.note, 1000);
      if (p.act == 'accept') {
        Object.assign(r.claim, { st: 'Accepted', final: r.claim.amt });
      } else if (p.act == 'dispute') {
        if (note.length < 10) return no('Explain why you dispute the claim (10+ characters).');
        r.claim.st = 'Disputed';
        r.claim.why = note;
        h.staffEms().forEach(em =>
          h.ntf(
            em,
            'Disputed deposit claim',
            r.id + ': the renter disputes a ' + peso(r.claim.amt) + ' claim.'
          )
        );
      } else return no('Unknown action.');
      r.claim.log.push({ t: now(), by: me.em, act: p.act, note });
      h.au(me.em, 'rental claim ' + p.act, { id: r.id });
      h.ntf(
        r.owner,
        'Deposit claim on ' + r.id,
        p.act == 'accept'
          ? 'The renter accepted your claim. You can complete the rental.'
          : 'The renter disputes your claim. An administrator will decide.'
      );
      return ok();
    },
    /* administrator: decide a disputed (or unanswered) claim */
    rentalClaimDecide(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can decide deposit claims.');
      const r = S.rn.find(x => x.id == p.id);
      if (!r || !r.claim) return no('Claim not found.');
      if (r && (r.cu == me.em || r.owner == me.em)) return no('You cannot decide a claim you are part of.');
      if (!['Open', 'Disputed'].includes(r.claim.st)) return no('This claim is already settled.');
      const amt = r2(p.amt),
        note = str(p.note, 1000);
      if (!(amt >= 0 && amt <= r.claim.amt))
        return no('The decided amount must be between ₱0 and the claimed ' + peso(r.claim.amt) + '.');
      if (note.length < 5) return no('Write the reason for the decision.');
      Object.assign(r.claim, { st: 'Decided', final: amt, decision: note });
      r.claim.log.push({ t: now(), by: me.em, act: 'decide', note, amt });
      h.au(me.em, 'rental claim decided', { id: r.id, amt });
      [r.cu, r.owner].forEach(em =>
        h.ntf(
          em,
          'Deposit claim on ' + r.id,
          'ZamMove decided: ' + peso(amt) + ' of the deposit is kept. ' + note
        )
      );
      return ok();
    },
    /* read the contract (also issues it for rentals approved before contracts existed) */
    rentalContract(me, p) {
      const r = S.rn.find(x => x.id == p.id);
      if (!r || !(r.cu == me.em || r.owner == me.em || h.isAdmin(me))) return no('Rental not found.');
      if (!r.ct) {
        if (r.st != 'Approved') return no('The contract is issued when the owner approves the request.');
        issueContract(r);
      }
      return ok({ ct: r.ct });
    },
    /* the renter or the owner signs electronically (typed full name + drawn signature), or the owner records
     that both signed a printed copy (photo of the signed page) */
    rentalSign(me, p) {
      const r = S.rn.find(x => x.id == p.id);
      const isCu = !!r && r.cu == me.em,
        isOw = !!r && r.owner == me.em && h.acct(me);
      if (!r || !(isCu || isOw)) return no('Only the renter or the vehicle owner can sign this contract.');
      if (r.st != 'Approved')
        return no(
          r.st == 'Pending'
            ? 'The contract is issued when the owner approves the request.'
            : 'The contract can only be signed before the vehicle is released.'
        );
      const ct = r.ct || issueContract(r),
        sg = (ct.sg = ct.sg || {});
      if (p.how == 'paper') {
        if (!isOw) return no('Only the owner records a signed paper copy.');
        if (signed(r)) return no('The contract is already signed by both of you.');
        const photo = img(p.photo);
        if (!photo) return no('Upload a clear photo of the signed page.');
        const rec = { how: 'paper', photo, t: now(), by: me.em, h: ct.h };
        if (!sg.cu) sg.cu = { ...rec, name: ct.terms.renter.name };
        if (!sg.ow) sg.ow = { ...rec, name: ct.terms.owner.name };
        h.au(me.em, 'rental contract signed on paper', { id: r.id, contract: ct.terms.no });
        h.ntf(
          r.cu,
          'Contract ' + ct.terms.no,
          'The owner recorded the signed paper copy. You can read it in My rentals.'
        );
        return ok({ done: true });
      }
      const who = isCu ? 'cu' : 'ow';
      if (sg[who]) return no('You already signed this contract.');
      if (p.agree !== true) return no('Tick the box to confirm you read and agree to every clause.');
      if (nm(p.name) != nm(me.name))
        return no('Type your full name exactly as on your account: ' + me.name + '.');
      const sig = img(p.sig);
      if (!sig) return no('Draw your signature in the box.');
      sg[who] = { how: 'digital', name: me.name, sig, t: now(), h: ct.h };
      h.au(me.em, 'rental contract signed', {
        id: r.id,
        contract: ct.terms.no,
        as: isCu ? 'renter' : 'owner',
      });
      h.ntf(
        isCu ? r.owner : r.cu,
        'Contract ' + ct.terms.no,
        (isCu ? 'The renter' : 'The owner') +
          ' signed the rental contract for ' +
          r.id +
          (signed(r) ? '. It is now signed by both of you.' : '. Your signature is needed.')
      );
      return ok({ done: signed(r) });
    },
    /* the renter's phone shares the vehicle's location while the rental is Active; the owner follows it on a map */
    rentalPing(me, p) {
      const r = S.rn.find(x => x.id == p.id && x.cu == me.em);
      if (!r) return no('Rental not found.');
      if (r.st != 'Active') return no('Location sharing is only for a rental in progress.', { stop: true });
      if (r.rq && !r.rq.redo) return no('You returned the vehicle, so location sharing has stopped.', { stop: true });
      const lat = +p.lat,
        lng = +p.lng;
      if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) || (lat == 0 && lng == 0))
        return no('Invalid location.');
      const ms = Date.now();
      if (r.gps && !r.gps.off && ms - r.gps.ms < 4000) return ok({ skipped: true }); // at most one update every 4 s
      const r6 = x => Math.round(x * 1e6) / 1e6,
        first = !r.gpsStart,
        inArea = C.zcBox(lat, lng),
        wasIn = !r.gps || r.gps.inArea;
      r.gps = {
        lat: r6(lat),
        lng: r6(lng),
        acc: Math.max(0, Math.min(5000, Math.round(+p.acc || 0))),
        spd: +p.spd >= 0 && +p.spd < 70 ? Math.round(+p.spd * 10) / 10 : null,
        t: now(),
        ms,
        inArea,
      };
      (r.trail = r.trail || []).push([r6(lat), r6(lng), ms]);
      if (r.trail.length > 200) r.trail.splice(0, r.trail.length - 200);
      if (first) {
        r.gpsStart = now();
        h.au(me.em, 'rental location started', { id: r.id });
        h.ntf(
          r.owner,
          'Rental ' + r.id,
          'Location sharing started. Follow your vehicle under Rentals → Rental map.'
        );
      }
      if (wasIn && !inArea) {
        h.au(me.em, 'rental left Zamboanga City', { id: r.id });
        h.ntf(
          r.owner,
          'Vehicle outside Zamboanga City',
          r.id + ': ' + r.vn + ' was located outside the city limits.'
        );
      }
      return ok();
    },
    rentalGpsStop(me, p) {
      const r = S.rn.find(x => x.id == p.id && x.cu == me.em);
      if (!r) return no('Rental not found.');
      if (r.gps && !r.gps.off) {
        r.gps.off = now();
        h.au(me.em, 'rental location paused', { id: r.id });
        h.ntf(r.owner, 'Rental ' + r.id, 'The renter paused location sharing.');
      }
      return ok();
    },
    rentalPay(me, p) {
      const r = S.rn.find(x => x.id == p.id && x.cu == me.em);
      if (!r) return no('Rental not found.');
      if (['Cancelled', 'Rejected', 'Completed'].includes(r.st)) return no('This rental is closed.');
      /* nothing is paid while the owner is still reviewing the request and documents */
      if (r.st == 'Pending')
        return no('Wait for the owner to approve your request. You pay only after it is approved.');
      const amt = r2(p.amount),
        m = p.method == 'Cash' ? 'Cash' : 'GCash',
        ref = str(p.ref, 13),
        left = r2(h.rentBal(r) - h.payPending(r.id));
      if (!(amt > 0)) return no('Enter an amount.');
      if (amt > left + 0.005) return no('Amount exceeds the unpaid balance (' + peso(left) + ').');
      const ow = h.U(r.owner);
      if (m == 'GCash' && !(ow && ow.gcash))
        return no('The owner has not added a GCash number yet. Pay in cash at pickup, or ask the owner to add one.');
      if (m == 'GCash' && !/^\d{10,13}$/.test(ref))
        return no('Enter the GCash reference number (10–13 digits).');
      if (m == 'GCash' && S.pay.some(x => (x.ref == ref || x.ref == ref + '-R') && x.status != 'Rejected'))
        return no('This GCash reference was already submitted.');
      const depIn = S.pay
        .filter(x => x.bid == r.id && x.kind == 'deposit' && x.status != 'Rejected')
        .reduce((s, x) => s + x.amount, 0);
      const d = r2(Math.max(0, Math.min(amt, h.depOf(r) - depIn))),
        rest = r2(amt - d);
      const add = (kind, a, rf) =>
        S.pay.push(
          h.payMk({
            bid: r.id,
            kind,
            method: m,
            amount: a,
            ref: rf,
            payer: me.em,
            to: r.owner, // paid to the vehicle owner, who confirms it
            status: 'Submitted',
            pf: img(p.pf),
          })
        );
      if (d > 0) add('deposit', d, m == 'GCash' ? ref : rid('CSH'));
      if (rest > 0) add('rental', rest, m == 'GCash' ? (d > 0 ? ref + '-R' : ref) : rid('CSH'));
      h.au(me.em, 'rental payment submitted', { id: r.id, amount: amt });
      h.ntf(
        me.em,
        'Payment submitted',
        peso(amt) + ' for ' + r.id + '. It counts once the owner confirms receiving it.'
      );
      h.ntf(r.owner, 'Payment to confirm', `${r.id}: the renter says they paid ${peso(amt)} by ${m}${m == 'GCash' ? ' (ref ' + ref + ')' : ''}. Confirm it under Rentals once you have received it.`);
      return ok();
    },
    /* owner: the GCash number renters pay into (shown on their payment form) */
    ownerGcash(me, p) {
      const u = h.U(me.em);
      if (!u || !h.okr(u, 'owner')) return no('Only a vehicle owner can set a GCash number for rentals.');
      const no_ = String(p.no || '').replace(/\D/g, ''),
        name = str(p.name, 60);
      if (!no_ && !name) {
        delete u.gcash;
        h.au(me.em, 'owner gcash removed', {});
        return ok();
      }
      if (!/^09\d{9}$/.test(no_)) return no('Enter the GCash mobile number (11 digits, starting with 09).');
      if (name.length < 3) return no('Enter the name on the GCash account, as renters will see it in GCash.');
      u.gcash = { no: no_, name };
      h.au(me.em, 'owner gcash set', { no: no_.slice(0, 4) + '…' + no_.slice(-3) });
      return ok();
    },
    /* owner: record the deposit refund sent to the renter */
    rentalRefund(me, p) {
      const x = S.pay.find(y => y.id == p.id && ['deposit_refund', 'refund'].includes(y.kind));
      if (!x || x.from != me.em) return no('Refund not found.');
      if (x.status != 'Due') return no('This refund was already recorded.');
      const m = p.method == 'Cash' ? 'Cash' : 'GCash',
        ref = str(p.ref, 30);
      if (m == 'GCash' && !/^\d{10,13}$/.test(ref)) return no('Enter the GCash reference number of the refund (10–13 digits).');
      Object.assign(x, { method: m, ref: ref || rid('CSH'), status: 'Sent', by: me.em, sentT: now() });
      h.au(me.em, 'deposit refund sent', { id: x.id, bid: x.bid, amount: x.amount });
      h.ntf(x.to, 'Deposit refund sent', `The owner sent ${peso(x.amount)} for ${x.bid} by ${m}${m == 'GCash' ? ' (ref ' + ref + ')' : ''}. Confirm you received it under My rentals.`);
      return ok();
    },
    /* renter: confirm the owner's deposit refund arrived, or say it did not */
    rentalRefundAck(me, p) {
      const x = S.pay.find(y => y.id == p.id && ['deposit_refund', 'refund'].includes(y.kind) && y.to == me.em);
      if (!x || x.status != 'Sent') return no('There is no refund waiting for your confirmation.');
      const note = str(p.note, 300);
      if (!p.ok && note.length < 5) return no('Tell us what is wrong (at least 5 characters).');
      Object.assign(x, p.ok ? { status: 'Paid', vby: me.em, vt: now() } : { status: 'Disputed', note, vt: now() });
      h.au(me.em, p.ok ? 'deposit refund received' : 'deposit refund disputed', { id: x.id, bid: x.bid });
      if (p.ok) h.ntf(x.from, 'Refund received', `The renter confirmed receiving the ${peso(x.amount)} refund for ${x.bid}.`);
      else {
        h.ntf(x.from, 'Refund not received', `The renter says the ${peso(x.amount)} refund for ${x.bid} did not arrive: ${note}`);
        h.staffEms().forEach(em => h.ntf(em, 'Deposit refund disputed', `${x.bid}: the renter says the owner’s ${peso(x.amount)} refund did not arrive. ${note}`));
      }
      return ok();
    },
    /* owner: send ZamMove the commission from rental money they collected (weekly); a cashier verifies it */
    ownerRemitSend(me, p) {
      const u = h.U(me.em);
      if (!u || !h.okr(u, 'owner')) return no('Only a vehicle owner can remit rental commission.');
      const b = h.ownerBal(me.em),
        owes = r2(-b.due - b.sent),
        amt = r2(p.amount),
        m = p.method == 'Cash' ? 'Cash' : 'GCash',
        ref = str(p.ref, 30);
      if (!(owes > 0.005)) return no('You do not owe ZamMove anything right now.');
      if (!(amt > 0)) return no('Enter the amount.');
      if (amt > owes + 0.005) return no('That is more than you owe (' + peso(owes) + ').');
      if (m == 'GCash' && !/^\d{10,13}$/.test(ref)) return no('Enter the GCash reference number (10–13 digits).');
      S.pay.push(h.payMk({ bid: '', kind: 'owner_remit', method: m, amount: amt, ref: ref || rid('CSH'), payer: me.em, status: 'Submitted', note: 'Rental commission' }));
      h.au(me.em, 'owner remittance sent', { amount: amt, method: m });
      h.staffEms().forEach(em => h.ntf(em, 'Owner remittance to verify', `${u.name || me.em} sent ${peso(amt)} rental commission by ${m}${ref ? ' (ref ' + ref + ')' : ''}.`));
      return ok();
    },
    /* renter: the owner marked a payment "not received" but the renter did pay; staff decide */
    rentalPayDispute(me, p) {
      const x = S.pay.find(y => y.id == p.id && y.payer == me.em && ['rental', 'deposit'].includes(y.kind));
      if (!x || x.status != 'Rejected' || !x.to) return no('Only a payment the owner marked as not received can be disputed.');
      if (x.disp) return no('You already disputed this payment.');
      const note = str(p.note, 500);
      if (note.length < 10) return no('Explain how and when you paid (at least 10 characters).');
      x.status = 'Disputed';
      x.disp = { note, pf: img(p.pf), t: now(), by: me.em };
      h.au(me.em, 'rental payment disputed', { id: x.id, bid: x.bid });
      h.ntf(x.to, 'Payment disputed', `${x.bid}: the renter says they did pay ${peso(x.amount)}: ${note}`);
      h.staffEms().forEach(em => h.ntf(em, 'Rental payment disputed', `${x.bid}: ${peso(x.amount)} ${x.method}${x.ref ? ' ref ' + x.ref : ''}. ${note} Decide it under Money disputes.`));
      return ok();
    },
    /* renter: change the dates. Pending: applied at once. Approved: same length or longer. Active: extend the end date.
       After approval the owner has to accept; the accepted change is added to the contract as an amendment. */
    rentalChange(me, p) {
      const r = S.rn.find(x => x.id == p.id && x.cu == me.em);
      if (!r || !['Pending', 'Approved', 'Active'].includes(r.st)) return no('These dates can no longer be changed.');
      if (r.chg) return no('You already asked for a change. Wait for the owner’s answer.');
      const s = r.st == 'Active' ? r.s : str(p.s, 10),
        e = str(p.e, 10),
        why = str(p.why, 300);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || e < s) return no('Choose valid start and end dates.');
      if (s == r.s && e == r.e) return no('Those are the current dates.');
      if (r.st != 'Active' && s < todayPH()) return no('The start date cannot be in the past.');
      const days = Math.round((new Date(e) - new Date(s)) / 864e5) + 1;
      if (days > 30) return no('Rentals are limited to 30 days. Contact ZamMove for longer rentals.');
      if (r.st == 'Approved' && days < r.days) return no(`After approval you can move the dates or add days, not shorten (keep at least ${r.days} days).`);
      if (r.st == 'Active' && e <= r.e) return no('Choose an end date after ' + r.e + ' to extend.');
      const clash = h.rentClash(r.veh, s, e, r.id);
      if (clash) return no(clash);
      const tot = r2(days * (r.day + (r.withDrv ? +r.withDrv.day || 0 : 0)));
      if (r.st == 'Pending') {
        Object.assign(r, { s, e, days, tot });
        (r.hist = r.hist || []).push({ st: 'Pending', t: now(), by: me.em, note: `Dates changed to ${s} → ${e}` });
        h.ntf(r.owner, 'Rental request changed', `${r.id}: new dates ${s} → ${e} (${days} day${days > 1 ? 's' : ''}).`);
        return ok({ applied: true });
      }
      if (why.length < 5) return no('Tell the owner why (at least 5 characters).');
      r.chg = { s, e, days, tot, why, t: now() };
      h.au(me.em, 'rental change requested', { id: r.id, s, e });
      h.ntf(r.owner, r.st == 'Active' ? 'Extension requested' : 'Date change requested', `${r.id}: ${s} → ${e} (${days} days, ${peso(tot)}). Reason: ${why}. Accept or decline under Rentals.`);
      return ok({ applied: false });
    },
    rentalChangeAnswer(me, p) {
      const r = S.rn.find(x => x.id == p.id && x.owner == me.em);
      if (!r || !r.chg) return no('There is no change request on this rental.');
      const c = r.chg,
        note = str(p.note, 300);
      if (!p.ok) {
        if (note.length < 5) return no('Tell the renter why (at least 5 characters).');
        (r.chgLog = r.chgLog || []).push({ ...c, ok: false, note, at: now() });
        r.chg = null;
        h.ntf(r.cu, 'Rental ' + r.id, `The owner declined your date change: ${note}`);
        return ok();
      }
      if (!['Approved', 'Active'].includes(r.st)) return no('This rental can no longer change.');
      const clash = h.rentClash(r.veh, c.s, c.e, r.id);
      if (clash) return no(clash + ' Decline the request instead.');
      const old = { s: r.s, e: r.e, days: r.days, tot: r.tot },
        more = r2(c.tot - r.tot);
      Object.assign(r, { s: c.s, e: c.e, days: c.days, tot: c.tot });
      if (r.ct) (r.ct.amend = r.ct.amend || []).push({ t: now(), s: c.s, e: c.e, days: c.days, tot: c.tot, from: old, why: c.why, askedBy: r.cu, okBy: me.em });
      (r.chgLog = r.chgLog || []).push({ ...c, ok: true, note, at: now() });
      r.chg = null;
      (r.hist = r.hist || []).push({ st: r.st, t: now(), by: me.em, note: `Dates changed to ${c.s} → ${c.e}` });
      h.au(me.em, 'rental change accepted', { id: r.id, s: c.s, e: c.e });
      h.ntf(r.cu, 'Rental ' + r.id, `The owner accepted the new dates ${c.s} → ${c.e}.` + (more > 0 ? ` Pay the extra ${peso(more)} to the owner (My rentals).` : '') + ' The change is added to your contract.');
      return ok();
    },
    rentalCancel(me, p) {
      const r = S.rn.find(x => x.id == p.id && x.cu == me.em);
      if (!r || !['Pending', 'Approved'].includes(r.st)) return no('This rental cannot be cancelled here.');
      const late = r.st == 'Approved' && pickupMs(r) - Date.now() < C.RN_FREE_CXL_H * 36e5,
        res = cancelRental(r, me.em, 'Cancelled by the renter' + (late ? ` less than ${C.RN_FREE_CXL_H} hours before pickup` : ''), late ? r.day : 0, 'You cancelled the rental.');
      if (r.owner)
        h.ntf(r.owner, 'Rental cancelled', `${r.id} was cancelled by the customer.` + (res.keep ? ` You keep ${peso(res.keep)} (one day’s fee).` : '') + (res.paid - res.keep > 0 ? ' Refund the rest under Rentals.' : ''));
      return ok({ fee: res.keep, refund: res.back });
    },
  };
};
