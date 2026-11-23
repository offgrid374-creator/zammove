'use strict';
/* Self-drive rentals (customer side) and incident reports. */
const C = require('./constants');
const { now, r2, rid, str, img, ok, no, peso, todayPH, sha256 } = require('../util');

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
      days: r.days,
      day: r.day,
      tot: r.tot,
      dep: h.depOf(r),
      pu: r.pu,
      rt: r.rt,
      clauses: C.CONTRACT.map(([t, x]) => ({ t, x })),
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
  const paidUp = r =>
    h.paySum(r.id, 'deposit') >= h.depOf(r) - 0.005 && h.paySum(r.id, 'rental') >= r.tot - 0.005;
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
      const days = Math.round((new Date(e) - new Date(s)) / 864e5) + 1;
      if (days > 30) return no('Rentals are limited to 30 days. Contact ZamMove for longer rentals.');
      if (!C.inZC(pu) || !C.inZC(rt))
        return no('Pickup and return must be in Zamboanga City (pick a known place or include “Zamboanga”).');
      if (lic.length < 6) return no('Enter your license number.');
      if (!exp || exp < e) return no('Your license must be valid through the rental period.');
      if (!img(p.ip) || !img(p.lp)) return no('Upload a photo of your ID and your driver’s license.');
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
        days,
        tot: r2(days * v.rent.day),
        dep: +v.rent.dep || C.DEP,
        st: 'Pending',
        pu,
        rt,
        lic,
        exp,
        ip: img(p.ip),
        lp: img(p.lp),
        cr: now(),
        hist: [{ st: 'Pending', t: now(), by: me.em }],
      };
      S.rn.push(r);
      h.au(me.em, 'rental requested', { id: r.id, vehicle: v.id });
      h.ntf(me.em, 'Rental request sent', r.id + ' is waiting for the owner’s approval.');
      h.ntf(v.owner, 'New rental request', `${r.id}: ${r.vn} (${v.plate}), ${s} to ${e}.`);
      return ok({ id: r.id });
    },
    /* owner of the vehicle (or an administrator) moves the rental along:
     approve | reject (Pending) → release (Approved, deposit verified) → return (Active) → complete (Returned, fully paid) */
    rentalDecision(me, p) {
      const r = S.rn.find(x => x.id == p.id);
      if (!r || !r.veh) return no('Rental not found.');
      const v = h.vOf(r.veh);
      if (!(v && v.owner == me.em && h.acct(me)) && !h.isAdmin(me))
        return no('Only the vehicle owner or an administrator can manage this rental.');
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
      if (act == 'return') {
        if (r.st != 'Active') return no('The vehicle has not been released.');
        const back = readings(p);
        if (back.err) return no(back.err);
        if (r.out && back.odo < r.out.odo)
          return no('The odometer cannot be lower than at release (' + r.out.odo + ' km).');
        r.back = back;
        r.cond = note || 'No issues noted';
        delete r.trail; // the contract allows tracking only until the vehicle is returned
        delete r.gps;
        return go('Returned', 'Return recorded. Condition: ' + r.cond + '.');
      }
      if (act == 'complete') {
        if (r.st != 'Returned') return no('Record the return first.');
        if (!paidUp(r)) return no('The rental fee and deposit are not fully verified yet.');
        if (r.claim && !['Accepted', 'Decided'].includes(r.claim.st))
          return no(
            'The deposit claim is still open. The renter must accept it or an administrator must decide it first.'
          );
        const dep = h.depOf(r),
          kept = r.claim ? r2(r.claim.final) : 0;
        r.settle = { dep, kept, refund: r2(dep - kept), t: now() };
        return go(
          'Completed',
          'Rental completed. ' +
            (kept
              ? peso(kept) +
                ' of the deposit was kept for the claim; ' +
                peso(dep - kept) +
                ' will be refunded to you (simulated).'
              : 'Your full ' + peso(dep) + ' deposit will be refunded (simulated).')
        );
      }
      return no('Unknown action.');
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
      const amt = r2(p.amount),
        m = p.method == 'Cash' ? 'Cash' : 'GCash',
        ref = str(p.ref, 13),
        left = r2(h.rentBal(r) - h.payPending(r.id));
      if (!(amt > 0)) return no('Enter an amount.');
      if (amt > left + 0.005) return no('Amount exceeds the unpaid balance (' + peso(left) + ').');
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
        peso(amt) + ' for ' + r.id + '. It counts once a cashier verifies it.'
      );
      return ok();
    },
    rentalCancel(me, p) {
      const r = S.rn.find(x => x.id == p.id && x.cu == me.em);
      if (!r || !['Pending', 'Approved'].includes(r.st)) return no('This rental cannot be cancelled here.');
      r.st = 'Cancelled';
      (r.hist = r.hist || []).push({ st: 'Cancelled', t: now(), by: me.em });
      h.au(me.em, 'rental cancelled', { id: r.id });
      if (r.owner) h.ntf(r.owner, 'Rental cancelled', r.id + ' was cancelled by the customer.');
      return ok();
    },
    createIncident(me, p) {
      const b = S.bk.find(x => x.id == p.bid && x.cu == me.em);
      if (!b) return no('You can only report on your own bookings.');
      if (C.FLOW.indexOf(b.st) < C.FLOW.indexOf('On the Way to Pickup'))
        return no('Reports must be linked to a booking in progress.');
      const CATS = ['Vehicle accident', 'Damaged items', 'Driver conduct', 'Delay', 'Missing items', 'Other'];
      if (!CATS.includes(p.cat)) return no('Choose a category.');
      const cat = p.cat;
      const sev = ['Low', 'Medium', 'High'].includes(p.sev) ? p.sev : 'Low',
        w = str(p.w, 20),
        d = str(p.d, 1000);
      if (!w) return no('Enter the date and time.');
      if (d.length < 10) return no('Describe what happened (10+ characters).');
      const c = {
        id: rid('IN'),
        by: me.em,
        bid: b.id,
        cat,
        sev,
        w,
        d,
        ph: img(p.ph),
        st: 'Submitted',
        t: now(),
        log: [],
      };
      S.inc.push(c);
      h.au(me.em, 'incident reported', { id: c.id, bk: b.id, sev });
      h.ntf(me.em, 'Report submitted', c.id + ' was sent to the company.');
      if (sev == 'High')
        h.staffEms().forEach(em =>
          h.ntf(em, 'High severity incident', `${c.id} on booking ${c.bid}: ${cat}.`)
        );
      return ok({ id: c.id });
    },
    incidentCase(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can investigate incidents.');
      const c = S.inc.find(x => x.id == p.id);
      if (!c) return no('Case not found.');
      if (c.st == 'Closed') return no('This case is closed.');
      const note = str(p.note, 1000),
        act = p.act;
      if (act == 'note') {
        if (!note) return no('Write a note first.');
      } else {
        if (!C.ICT[act] || !C.ICT[act].includes(c.st))
          return no('That step is not allowed while the case is "' + c.st + '".');
        if (act != 'start' && !note) return no('A note is required for this step.');
        if (act == 'decide') c.decision = note;
        c.st = C.ICTo[act];
      }
      (c.log = c.log || []).push({ t: now(), by: me.em, act, note });
      h.au(me.em, 'incident ' + act, { id: c.id });
      if (act != 'note') h.ntf(c.by, 'Report ' + c.id, 'Status is now ' + c.st + '.');
      return ok();
    },
  };
};
