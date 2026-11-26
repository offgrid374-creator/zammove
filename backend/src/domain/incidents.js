'use strict';
/* Incident reports and cases.

   Anyone on a trip (customer or driver) can report a problem; in an accident, one "emergency" report
   stops the trip, opens a High case and alerts the staff, the other people on the trip and the vehicle
   owner at once. Every case knows the people involved (customer, driver, vehicle owner), who are told
   about it and can give their own statement and send evidence when asked. The administrator calls them
   (each call is logged), works the case step by step, and records a decision that can refund the
   customer, charge the driver (paid back on the next remittance), add a strike or suspend the driver. */
const C = require('./constants');
const { now, r2, rid, str, img, ok, no, peso } = require('../util');

/* a report in these categories is never filed below this severity */
const SEV_MIN = { 'Vehicle accident': 'High', 'Unsafe or illegal cargo': 'High', 'Damaged items': 'Medium', 'Missing items': 'Medium' };
const SEVS = ['Low', 'Medium', 'High'];
const CALL_OUT = ['Reached', 'No answer', 'Wrong number', 'Left a message'];
const HURT = { yes: 'Someone is hurt.', unsure: 'Injuries not known yet.', no: 'Nobody is hurt.' };

module.exports = (S, h) => {
  const U = em => S.users.find(u => u.em == em);
  const name = em => (U(em) || {}).name || em;
  const photos = p => [p.ph, ...(Array.isArray(p.phs) ? p.phs : [])].map(img).filter(Boolean).slice(0, 5);

  /* the people involved in a case: the trip's customer, its driver and the vehicle's owner (one row each) */
  h.caseParties = c => {
    if (c.parties) return c.parties;
    const b = S.bk.find(x => x.id == c.bid) || {},
      v = S.vh.find(x => x.id == b.veh) || {},
      out = [];
    const add = (em, role) => {
      if (!em) return;
      const p = out.find(x => x.em == em);
      if (p) p.role = p.role.includes(role) ? p.role : p.role + ' and ' + role;
      else out.push({ em, role });
    };
    add(b.cu, 'customer');
    add(c.driver || b.drvUser, 'driver');
    add(v.owner, 'vehicle owner');
    if (!out.some(x => x.em == c.by)) add(c.by, 'reporter');
    return out;
  };
  const partyEms = c => h.caseParties(c).map(p => p.em);
  const roleOf = (c, em) => (h.caseParties(c).find(p => p.em == em) || {}).role || '';
  const caseLog = (c, by, act, note = '') => (c.log = c.log || []).push({ t: now(), by, act, note });
  /* in-app notice to each person, plus a simulated SMS when it is urgent */
  const tell = (ems, head, body, sms) =>
    [...new Set(ems.filter(Boolean))].forEach(em => {
      h.ntf(em, head, body);
      const u = U(em);
      if (sms && u && u.ph) h.sim(u.ph, 'SMS', `ZamMove: ${head}. ${body}`, em);
    });

  const newCase = (me, b, x) => {
    const c = {
      id: rid('IN'),
      by: me.em,
      bid: b.id,
      cat: x.cat,
      sev: x.sev,
      w: x.w || now().slice(0, 16),
      d: x.d,
      ph: x.phs[0] || '',
      phs: x.phs,
      ...(x.blot ? { blot: x.blot } : {}),
      ...(x.kind ? { kind: x.kind } : {}),
      ...(x.hurt ? { hurt: x.hurt } : {}),
      st: 'Submitted',
      t: now(),
      log: [],
    };
    c.parties = h.caseParties(c);
    S.inc.push(c);
    return c;
  };

  /* what happens when a report becomes official (on confirmation) */
  const sendCase = (me, c) => {
    c.st = 'Submitted';
    c.sent = now();
    caseLog(c, me.em, 'confirmed', '');
    if (c.kind == 'change') {
      const drv = h.U(c.driver);
      if (drv)
        (drv.flags = drv.flags || []).push({ id: rid('FL'), kind: 'Payment discrepancy', note: `${c.bid}: the customer reports ${peso(c.amt)} missing change (case ${c.id}).`, by: 'system', t: now(), open: true, amt: c.amt, inc: c.id });
      h.au(me.em, 'wrong change reported', { bk: c.bid, id: c.id, amt: c.amt });
      h.ntf(me.em, 'Report ' + c.id, 'Your wrong-change report was sent to the ZamMove cashier. You can withdraw it until it is decided.');
      if (drv) h.ntf(drv.em, 'Wrong change reported', `${c.bid}: the customer says ${peso(c.amt)} change is missing. Add your side on the trip.`);
      h.staffEms().forEach(em => h.ntf(em, 'Wrong change reported', `${c.bid}: ${peso(c.amt)} missing change, case ${c.id}.`));
      return;
    }
    h.au(me.em, 'incident reported', { id: c.id, bk: c.bid, sev: c.sev });
    h.ntf(me.em, 'Report sent', c.id + ' was sent to ZamMove. You can withdraw it until it is decided.');
    if (c.sev == 'High') tell(h.staffEms(), 'High severity incident', `${c.id} on booking ${c.bid}: ${c.cat}.`, c.cat == 'Vehicle accident');
    tell(partyEms(c).filter(em => em != me.em), 'Report on booking ' + c.bid, `${name(me.em)} reported "${c.cat}" (${c.id}). ZamMove will review it. You can give your side under Cases.`);
  };
  /* drafts nobody confirmed are discarded after a day */
  h.sweepDrafts = () => {
    let ch = 0;
    S.inc.forEach(c => {
      if (c.st == 'Unconfirmed' && Date.now() - new Date(c.t).getTime() > 24 * 36e5) {
        c.st = 'Withdrawn';
        c.wd = { t: now(), by: 'system', why: 'Not confirmed within 24 hours', draft: true };
        h.ntf(c.by, 'Report discarded', `${c.id} was never confirmed, so it was discarded and nobody saw it.`);
        ch = 1;
      }
    });
    return ch;
  };

  return {
    /* the reporter confirms a draft: it goes to ZamMove and the people involved */
    caseConfirm(me, p) {
      const c = S.inc.find(x => x.id == p.id && x.by == me.em);
      if (!c || c.st != 'Unconfirmed') return no('There is no unsent report to confirm.');
      sendCase(me, c);
      return ok();
    },
    /* the reporter dismisses a draft, or withdraws a sent report before ZamMove decides it */
    caseWithdraw(me, p) {
      const c = S.inc.find(x => x.id == p.id && x.by == me.em);
      if (!c) return no('Report not found.');
      if (c.kind == 'accident') return no('An emergency report cannot be withdrawn here. Call ZamMove if it was sent by mistake.');
      const draft = c.st == 'Unconfirmed';
      if (!draft && !['Submitted', 'Under review', 'Evidence requested'].includes(c.st))
        return no('ZamMove already decided this case, so it can no longer be withdrawn.');
      const why = str(p.why, 300);
      if (!draft && why.length < 5) return no('Tell ZamMove why you are withdrawing it (at least 5 characters).');
      c.st = 'Withdrawn';
      c.wd = { t: now(), by: me.em, why: why || 'Dismissed before sending', draft };
      caseLog(c, me.em, 'withdrawn', why);
      h.au(me.em, draft ? 'report dismissed' : 'report withdrawn', { id: c.id, bk: c.bid });
      if (draft) return ok();
      /* a flag the report put on the driver is lifted */
      S.users.forEach(u => (u.flags || []).forEach(f => {
        if (f.inc == c.id && f.open) Object.assign(f, { open: false, rnote: 'Withdrawn by the reporter: ' + why, rby: me.em, rt: now() });
      }));
      tell(partyEms(c).filter(em => em != me.em), 'Report withdrawn', `${name(me.em)} withdrew report ${c.id} on ${c.bid}: ${why}`);
      tell(h.staffEms(), 'Report withdrawn', `${c.id} on ${c.bid} was withdrawn by the reporter: ${why}`);
      return ok();
    },
    createIncident(me, p) {
      /* the customer or the driver of the booking can report */
      const b = S.bk.find(x => x.id == p.bid && (x.cu == me.em || x.drvUser == me.em));
      if (!b) return no('You can only report on your own bookings.');
      if (C.FLOW.indexOf(b.st) < C.FLOW.indexOf('On the Way to Pickup') && b.st != 'Interrupted')
        return no('Reports must be linked to a booking in progress.');
      const isD = b.drvUser == me.em;
      const CATS = isD
        ? ['Customer did not pay', 'Customer conduct', 'Vehicle accident', 'Damaged items', 'Unsafe or illegal cargo', 'Other']
        : ['Vehicle accident', 'Damaged items', 'Driver conduct', 'Delay', 'Missing items', 'Other'];
      if (!CATS.includes(p.cat)) return no('Choose a category.');
      const cat = p.cat,
        asked = SEVS.includes(p.sev) ? p.sev : 'Low',
        floor = SEV_MIN[cat] || 'Low',
        sev = SEVS.indexOf(asked) < SEVS.indexOf(floor) ? floor : asked,
        w = str(p.w, 20),
        d = str(p.d, 1000);
      if (!w) return no('Enter the date and time.');
      if (d.length < 10) return no('Describe what happened (10+ characters).');
      const c = newCase(me, b, { cat, sev, w, d, phs: photos(p), blot: str(p.blot, 40) });
      /* nothing is official yet: only the reporter sees it until they confirm it (a wrong tap can be dismissed) */
      c.st = 'Unconfirmed';
      h.au(me.em, 'incident drafted', { id: c.id, bk: b.id, sev });
      return ok({ id: c.id, sev, draft: true });
    },

    /* accident or emergency on a trip: stop it, open a High case, alert everyone involved at once */
    emergency(me, p) {
      const b = S.bk.find(x => x.id == p.bid && (x.cu == me.em || x.drvUser == me.em));
      if (!b) return no('You can only report on your own bookings.');
      if (!b.drvUser || h.done(b) || ['Pending', 'No driver found'].includes(b.st))
        return no('An emergency report needs a trip that has a driver and is not finished.');
      const hurt = HURT[p.hurt] ? p.hurt : '';
      if (!hurt) return no('Say whether anyone is hurt.');
      const d = str(p.d, 1000);
      if (d.length < 10) return no('Describe what happened (10+ characters).');
      if (b.st != 'Interrupted') {
        const r = h.interrupt(b, me, 'Accident: ' + d.slice(0, 260), true);
        if (!r.ok) return r;
      }
      const c = newCase(me, b, { cat: 'Vehicle accident', sev: 'High', kind: 'accident', hurt, d, phs: photos(p), blot: str(p.blot, 40) });
      h.au(me.em, 'emergency reported', { id: c.id, bk: b.id, hurt });
      const msg = `${c.id} on ${b.id}, reported by ${name(me.em)}. ${HURT[hurt]} The trip is stopped.`;
      tell(h.staffEms(), 'EMERGENCY: accident', msg + ' Call the people involved now.', true);
      tell(partyEms(c).filter(em => em != me.em), 'Accident on trip ' + b.id, msg + ' ZamMove will call you.', true);
      h.ntf(me.em, 'Emergency report sent', `${c.id}: ZamMove, the people on this trip and the vehicle owner were alerted. Stay safe; an administrator will call you.`);
      return ok({ id: c.id });
    },

    /* a person involved gives their own account (can be updated until the decision) */
    caseStatement(me, p) {
      const c = S.inc.find(x => x.id == p.id);
      if (!c || !partyEms(c).includes(me.em)) return no('Case not found.');
      if (['Decision recorded', 'Closed'].includes(c.st)) return no('This case is already decided.');
      const text = str(p.text, 1500);
      if (text.length < 10) return no('Write what happened in your own words (10+ characters).');
      const again = !!(c.stmts && c.stmts[me.em]);
      (c.stmts = c.stmts || {})[me.em] = { t: now(), text, phs: photos(p), role: roleOf(c, me.em) };
      caseLog(c, me.em, 'party-statement');
      h.au(me.em, 'case statement ' + (again ? 'updated' : 'given'), { id: c.id });
      tell(h.staffEms(), 'Statement received', `${name(me.em)} (${roleOf(c, me.em)}) ${again ? 'updated their' : 'gave a'} statement on ${c.id}.`);
      return ok();
    },

    /* a person asked for evidence sends it (photos and/or a note) */
    caseEvidence(me, p) {
      const c = S.inc.find(x => x.id == p.id);
      if (!c || !partyEms(c).includes(me.em)) return no('Case not found.');
      if (c.st != 'Evidence requested' || !(c.ask || []).includes(me.em)) return no('No evidence was requested from you.');
      const note = str(p.note, 1000),
        phs = photos(p);
      if (!phs.length && note.length < 5) return no('Add a photo or describe the evidence.');
      (c.evid = c.evid || []).push({ by: me.em, t: now(), note, phs });
      caseLog(c, me.em, 'evidence-sent');
      h.au(me.em, 'case evidence sent', { id: c.id, photos: phs.length });
      const answered = c.ask.every(em => c.evid.some(x => x.by == em && x.t >= c.askT));
      if (answered) {
        c.st = 'Under review';
        caseLog(c, 'system', 'evidence-received');
      }
      tell(h.staffEms(), 'Evidence received', `${name(me.em)} sent evidence on ${c.id}${answered ? '; everyone asked has answered' : ''}.`);
      return ok({ st: c.st });
    },

    /* administrator: log a call to someone involved */
    caseCall(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can log calls.');
      const c = S.inc.find(x => x.id == p.id);
      if (!c) return no('Case not found.');
      if (c.st == 'Closed') return no('This case is closed.');
      if (!partyEms(c).includes(p.who)) return no('Choose who you called.');
      if (!CALL_OUT.includes(p.out)) return no('Choose how the call went.');
      const note = str(p.note, 500);
      (c.calls = c.calls || []).push({ t: now(), by: me.em, who: p.who, out: p.out, note });
      caseLog(c, me.em, 'call', `${name(p.who)} (${roleOf(c, p.who)}): ${p.out}${note ? '. ' + note : ''}`);
      h.au(me.em, 'case call', { id: c.id, who: p.who, out: p.out });
      return ok();
    },

    incidentCase(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can investigate incidents.');
      const c = S.inc.find(x => x.id == p.id);
      if (!c) return no('Case not found.');
      if (c.st == 'Closed') return no('This case is closed.');
      if (['Withdrawn', 'Unconfirmed'].includes(c.st)) return no(c.st == 'Withdrawn' ? 'The reporter withdrew this case.' : 'The reporter has not sent this report yet.');
      const cb = S.bk.find(x => x.id == c.bid) || {};
      if ([c.by, cb.cu, cb.drvUser, ...partyEms(c)].includes(me.em)) return no('You cannot investigate a case you are part of.');
      const note = str(p.note, 1000),
        act = p.act,
        P = h.caseParties(c);
      if (act == 'note') {
        if (!note) return no('Write a note first.');
        caseLog(c, me.em, act, note);
        h.au(me.em, 'incident note', { id: c.id });
        return ok();
      }
      if (!C.ICT[act] || !C.ICT[act].includes(c.st)) return no('That step is not allowed while the case is "' + c.st + '".');
      if (act != 'start' && !note) return no('A note is required for this step.');
      const drv = (P.find(x => x.role.includes('driver')) || {}).em,
        cu = (P.find(x => x.role.includes('customer')) || {}).em;

      if (act == 'evidence') {
        /* who is asked: the reporter by default, or one role, or everyone involved */
        const from = p.from || 'reporter',
          ask = from == 'all' ? P.map(x => x.em) : from == 'reporter' ? [c.by] : P.filter(x => x.role.includes(from)).map(x => x.em);
        if (!ask.length) return no('Nobody in this case has that role.');
        c.ask = ask;
        c.askT = now();
        tell(ask, 'Evidence requested: ' + c.id, `${note} Send it from the case under Cases.`, true);
      }

      if (act == 'decide') {
        const refund = r2(+p.refund || 0),
          charge = r2(+p.charge || 0),
          strike = p.strike === true || p.strike == '1' || p.strike == 'true',
          suspend = p.suspend === true || p.suspend == '1' || p.suspend == 'true';
        if (!(refund >= 0 && refund <= 100000) || !(charge >= 0 && charge <= 100000))
          return no('Amounts must be between ₱0 and ₱100,000.');
        if (refund && !cu) return no('This case has no customer to refund.');
        if ((charge || strike || suspend) && !drv) return no('This case has no driver.');
        /* checked before anything changes: suspending fails while the driver still has a trip running */
        if (suspend) {
          const r = h.suspendUser(me, drv, `Suspended after incident ${c.id}: ${note}`);
          if (!r.ok) return no(r.err + ' (decide the stopped trip first, under the case)');
        }
        if (refund)
          S.pay.push(h.payMk({ bid: c.bid, kind: 'refund', method: '', amount: refund, ref: rid('RF'), payer: me.em, to: cu, status: 'Due', note: 'Incident case ' + c.id }));
        if (charge)
          S.pay.push(h.payMk({ bid: c.bid, kind: 'case_charge', method: '', amount: charge, ref: rid('CC'), payer: drv, to: '', status: 'Due', note: 'Incident case ' + c.id }));
        if (strike) h.strike(drv, c.bid, 'Incident ' + c.id);
        c.decision = note;
        c.out = { refund, charge, strike, suspend };
        const what = [refund && `${peso(refund)} refund to the customer`, charge && `${peso(charge)} charged to the driver`, strike && 'a strike', suspend && 'driver suspended'].filter(Boolean);
        if (charge) h.ntf(drv, 'Charge from case ' + c.id, `${peso(charge)} will be deducted from your next remittance. Reason: ${note}`);
        tell(P.map(x => x.em), 'Decision on ' + c.id, `${note}${what.length ? ' Outcome: ' + what.join(', ') + '.' : ''}`);
      }

      c.st = C.ICTo[act];
      caseLog(c, me.em, act, note);
      h.au(me.em, 'incident ' + act, { id: c.id, ...(c.out && act == 'decide' ? c.out : {}) });
      if (['start', 'statement', 'close'].includes(act)) tell([c.by], 'Report ' + c.id, 'Status is now ' + c.st + '.');
      if (act == 'close') tell(P.map(x => x.em).filter(em => em != c.by), 'Case ' + c.id + ' closed', 'ZamMove closed this case.');
      return ok();
    },
  };
};
module.exports.CALL_OUT = CALL_OUT;
module.exports.SEV_MIN = SEV_MIN;
