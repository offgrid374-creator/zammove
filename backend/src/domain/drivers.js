'use strict';
/* Driver ↔ vehicle assignments and driver documents.

   An assignment starts in one of three ways:
     - the owner assigns an approved driver         → Pending Admin Review
     - the owner recommends someone not yet approved → Waiting for Application (linked to their application)
     - an administrator assigns a driver directly    → Awaiting Driver
   then: admin approves → Awaiting Driver → driver accepts (agreement issued) → Awaiting Agreement
         → driver and owner sign → Pending Activation → admin activates (documents checked) → Active
         → either side (or an admin) ends it → Ended.
   Open requests can be rejected, declined or cancelled. Expired licenses, clearances or vehicle
   registrations block activation and new bookings. */
const C = require('./constants');
const { now, rid, str, img, ok, no, sha256, todayPH } = require('../util');

const nm = x =>
  String(x || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPEN = [
  'Waiting for Application',
  'Pending Admin Review',
  'Awaiting Driver',
  'Awaiting Agreement',
  'Pending Activation',
];

module.exports = (S, h) => {
  const log = (a, st, by, note) => {
    a.st = st;
    (a.hist = a.hist || []).push({ st, t: now(), by, note: note || '' });
  };
  const vehName = v => [v.brand, v.model].filter(Boolean).join(' ') + ' (' + v.plate + ')';
  /* terms the owner (or admin) proposes; the driver sees them before accepting */
  const terms = p => {
    const pct = p.pct === undefined || p.pct === '' ? +S.cfg.drvPct || 20 : Math.round(+p.pct);
    const room = 100 - (S.cfg.comm == null ? 15 : +S.cfg.comm);
    if (!(pct >= 10 && pct <= Math.min(90, room)))
      return { err: 'The driver’s share must be between 10% and ' + Math.min(90, room) + '%.' };
    const fuel = ['Owner', 'Driver', 'Shared'].includes(p.fuel) ? p.fuel : 'Owner';
    const notice = p.notice === undefined || p.notice === '' ? 7 : Math.round(+p.notice);
    if (!(notice >= 1 && notice <= 30)) return { err: 'The notice period must be 1 to 30 days.' };
    const start = str(p.start, 10) || todayPH();
    if (!DATE.test(start) || start < todayPH()) return { err: 'The start date cannot be in the past.' };
    return { pct, fuel, notice, start };
  };
  /* problems with a driver's or vehicle's documents (empty = all valid) */
  h.driverDocIssues = em => {
    const u = h.U(em) || {},
      dx = u.dx || {},
      t = todayPH(),
      out = [];
    if (dx.lic && dx.lic < t) out.push('Driver’s license expired on ' + dx.lic);
    if (dx.clr && dx.clr < t) out.push('NBI/police clearance expired on ' + dx.clr);
    return out;
  };
  h.vehDocIssues = v => [
    ...(v && v.regExp && v.regExp < todayPH() ? ['Vehicle registration expired on ' + v.regExp] : []),
    ...(v ? h.legalIssues(v, C.VT.find(x => x.id == v.type), false) : []),
  ];
  const ownerOk = (me, v) => v && v.owner == me.em && h.okr(me, 'owner') && h.acct(me);
  const driveable = v => {
    if (!v) return 'Vehicle not found.';
    if (v.approval != 'Approved') return 'The vehicle must be approved first.';
    if ((C.VT.find(x => x.id == v.type) || {}).rentOnly)
      return 'This is a rental-only vehicle. It does not take hauling bookings, so it needs no driver.';
    return '';
  };
  const dup = (vid, em) => S.asg.some(a => a.vehicle == vid && a.driver == em && OPEN.includes(a.st));
  const make = (me, v, dr, mode, st, t, note) => {
    const a = {
      id: rid('AS'),
      vehicle: v.id,
      driver: dr.em,
      by: me.em,
      mode,
      note: str(note, 200),
      terms: t,
      st,
      cr: now(),
      hist: [{ st, t: now(), by: me.em }],
    };
    S.asg.push(a);
    return a;
  };
  /* the service agreement between owner and driver, frozen when the driver accepts */
  const issue = a => {
    const v = h.vOf(a.vehicle) || {},
      d = h.U(a.driver) || {},
      o = h.U(v.owner) || {};
    const T = {
      v: C.DRIVER_AGREEMENT_V,
      no: 'DA-' + String(a.id).replace(/^AS-/, ''),
      asg: a.id,
      issued: todayPH(),
      owner: { name: o.name || '', ph: o.ph || '', ad: o.ad || '' },
      driver: {
        name: d.name || '',
        ph: d.ph || '',
        ad: d.ad || '',
        lic: d.lic || '',
        licExp: (d.dx || {}).lic || '',
      },
      veh: {
        name: [v.brand, v.model].filter(Boolean).join(' '),
        plate: v.plate || '',
        color: v.color || '',
        year: v.year || '',
        type: (C.VT.find(x => x.id == v.type) || {}).n || v.type || '',
        regExp: v.regExp || '',
      },
      ...a.terms,
      coShare: S.cfg.coShare,
      clauses: C.DRIVER_AGREEMENT.map(([t, x]) => ({ t, x })),
    };
    a.ag = { terms: T, h: sha256(JSON.stringify(T)), cr: now(), sg: {} };
  };
  /* the owner drives their own vehicle: active at once, with no admin request and no agreement with themselves.
     Returns the assignment, or the reason it is not possible. */
  h.selfDrive = (u, v, by) => {
    if (!u || !v || v.owner != u.em) return 'Vehicle not found.';
    const bad = driveable(v);
    if (bad) return bad;
    if (!h.okr(u, 'driver') || !h.acct(u))
      return 'An approved driver role is needed to drive your own vehicle. Apply under Account → Apply for a role.';
    const issues = [...h.driverDocIssues(u.em), ...h.vehDocIssues(v)];
    if (issues.length) return issues.join('; ') + '. Renew it first.';
    const cur = S.asg.find(a => a.vehicle == v.id && a.st == 'Active');
    if (cur && cur.driver == u.em) return 'You already drive this vehicle.';
    if (cur)
      return (
        ((h.U(cur.driver) || {}).name || cur.driver) +
        ' drives this vehicle now. End that assignment first (Drivers page).'
      );
    if (S.bk.some(b => b.drvUser == u.em && !h.done(b) && b.veh != v.id))
      return 'Finish your current bookings with your other vehicle first.';
    const old = h.asgOf(u.em);
    if (old) log(old, 'Ended', by, 'Switched to their own vehicle ' + v.plate);
    S.asg
      .filter(a => a.vehicle == v.id && a.driver == u.em && OPEN.includes(a.st))
      .forEach(a => log(a, 'Cancelled', by, 'The owner drives it'));
    const a = make({ em: by }, v, u, 'Owner-driver', 'Active', null, '');
    a.self = true;
    S.dp[u.em] = { ...(S.dp[u.em] || {}), avail: (S.dp[u.em] || {}).avail || 'Unavailable' };
    h.au(by, 'owner drives own vehicle', { id: a.id, vehicle: v.id, driver: u.em });
    return a;
  };
  const signed = a => !!(a.ag && a.ag.sg && a.ag.sg.dr && a.ag.sg.ow);
  const admins = (head, body) => h.staffEms().forEach(em => h.ntf(em, head, body));

  return {
    /* owner who is also an approved driver: drive this vehicle yourself */
    selfAssign(me, p) {
      if (!h.okr(me, 'owner') || !h.acct(me)) return no('Only an approved vehicle owner can do this.');
      const v = h.vOf(p.vehicle);
      const r = h.selfDrive(me, v, me.em);
      if (typeof r == 'string') return no(r);
      admins('Owner drives own vehicle', `${me.name} now drives their own ${vehName(v)}.`);
      return ok({ id: r.id });
    },
    /* owner: assign an approved driver, or recommend someone who still has to apply */
    reqAssign(me, p) {
      if (!h.okr(me, 'owner') || !h.acct(me)) return no('Only an approved vehicle owner can do this.');
      const v = h.vOf(p.vehicle);
      if (!v || v.owner != me.em) return no('Vehicle not found.');
      const bad = driveable(v);
      if (bad) return no(bad);
      const dr = h.U(str(p.driver, 120).toLowerCase());
      if (!dr) return no('No registered account matches that email.');
      if (dr.em == me.em) {
        const r = h.selfDrive(me, v, me.em);
        return typeof r == 'string' ? no(r) : ok({ id: r.id, self: true });
      }
      const t = terms(p);
      if (t.err) return no(t.err);
      if (dup(v.id, dr.em)) return no('There is already an open request for this driver and vehicle.');
      const approved = h.okr(dr, 'driver');
      /* drivers work for one owner only */
      const boss = approved && h.driverOwner ? h.driverOwner(dr.em) : '';
      if (boss && boss != me.em) return no('That driver works for another vehicle owner.');
      if (p.mode == 'assign' && !approved)
        return no('That person is not an approved driver. Use “Recommend a driver” instead.');
      if (approved) {
        const a = make(
          me,
          v,
          dr,
          p.mode == 'assign' ? 'Owner assignment' : 'Owner recommendation',
          'Pending Admin Review',
          t,
          p.note
        );
        h.au(me.em, 'assignment requested', { id: a.id, vehicle: v.id, driver: dr.em });
        admins('Assignment request', `${me.name} asks to assign ${dr.name} to ${vehName(v)}.`);
        return ok({ id: a.id });
      }
      const a = make(me, v, dr, 'Owner recommendation', 'Waiting for Application', t, p.note);
      const app = S.apps.find(
        x => x.user == dr.em && x.role == 'driver' && !['Approved', 'Rejected'].includes(x.st)
      );
      if (app) (app.rec = app.rec || []).push(a.id);
      h.au(me.em, 'driver recommended', { id: a.id, vehicle: v.id, driver: dr.em });
      h.ntf(
        dr.em,
        'You were recommended as a driver',
        `${me.name} recommends you to drive ${vehName(v)}. ` +
          (app
            ? 'It is linked to your driver application.'
            : 'Apply for the driver role under Account → Apply for a role.')
      );
      return ok({ id: a.id, waiting: true });
    },
    /* administrator: put an approved driver from the pool on an approved vehicle */
    adminAssignVehicle(me, p) {
      if (!h.isAdmin(me)) return no('Administrator access required.');
      const v = h.vOf(p.vehicle),
        bad = driveable(v);
      if (bad) return no(bad);
      const dr = h.U(str(p.driver, 120).toLowerCase());
      if (!dr || !h.okr(dr, 'driver') || !h.acct(dr)) return no('Choose an approved, active driver.');
      if (dr.em == me.em || v.owner == me.em)
        return no('You cannot assign yourself or your own vehicle. Another administrator must do it.');
      const boss = h.driverOwner ? h.driverOwner(dr.em) : '';
      if (boss && boss != v.owner && dr.em != v.owner && !p.move)
        return no(`${dr.name} works for another vehicle owner. Tick "move the driver to this owner" to reassign them.`);
      if (p.move && boss != v.owner) dr.employer = v.owner;
      /* the owner's own vehicle: they drive it at once */
      if (dr.em == v.owner) {
        const r = h.selfDrive(dr, v, me.em);
        if (typeof r == 'string') return no(r);
        h.ntf(dr.em, 'Vehicle assigned', `ZamMove set you as the driver of your own ${vehName(v)}.`);
        return ok({ id: r.id, self: true });
      }
      const t = terms(p);
      if (t.err) return no(t.err);
      if (dup(v.id, dr.em)) return no('There is already an open request for this driver and vehicle.');
      const a = make(me, v, dr, 'Admin assignment', 'Awaiting Driver', t, p.note);
      h.au(me.em, 'assignment by admin', { id: a.id, vehicle: v.id, driver: dr.em });
      h.ntf(
        dr.em,
        'Vehicle offered to you',
        `ZamMove offers you ${vehName(v)}. Accept or decline it on your Driver dashboard.`
      );
      h.ntf(
        v.owner,
        'Driver proposed for your vehicle',
        `ZamMove proposed ${dr.name} for ${vehName(v)}. The driver must accept and you both sign the agreement.`
      );
      return ok({ id: a.id });
    },
    /* administrator: approve or reject an owner's request */
    assignDecision(me, p) {
      if (!h.isAdmin(me)) return no('Administrator access required.');
      const a = S.asg.find(x => x.id == p.id);
      if (!a || !['Pending Admin Review', 'Waiting for Application'].includes(a.st))
        return no('Request not found or already decided.');
      if (a.driver == me.em || (h.vOf(a.vehicle) || {}).owner == me.em)
        return no('You cannot decide an assignment you are part of. Another administrator must do it.');
      const reason = str(p.reason, 300),
        v = h.vOf(a.vehicle),
        dr = h.U(a.driver);
      if (p.act == 'reject') {
        if (reason.length < 5) return no('Write the reason.');
        log(a, 'Rejected', me.em, reason);
        h.au(me.em, 'assignment rejected', { id: a.id });
        h.ntf(
          v.owner,
          'Assignment request rejected',
          `${dr ? dr.name : a.driver} · ${vehName(v)}: ${reason}`
        );
        return ok();
      }
      if (a.st == 'Waiting for Application' || !h.okr(dr, 'driver') || !h.acct(dr))
        return no('The driver is not approved yet. Their driver application must be approved first.');
      const bad = driveable(v);
      if (bad) return no(bad);
      log(a, 'Awaiting Driver', me.em);
      h.au(me.em, 'assignment approved', { id: a.id });
      h.ntf(
        a.driver,
        'Vehicle offered to you',
        `${vehName(v)} is offered to you. Accept or decline it on your Driver dashboard.`
      );
      return ok();
    },
    /* driver: accept (the agreement is issued) or decline */
    assignRespond(me, p) {
      const a = S.asg.find(x => x.id == p.id && x.driver == me.em);
      if (!a || a.st != 'Awaiting Driver') return no('There is no offer waiting for your answer.');
      const v = h.vOf(a.vehicle);
      if (p.act == 'decline') {
        const reason = str(p.reason, 300);
        if (reason.length < 5) return no('Tell the owner why you decline.');
        log(a, 'Declined', me.em, reason);
        h.au(me.em, 'assignment declined', { id: a.id });
        h.ntf(v.owner, 'Driver declined', `${me.name} declined ${vehName(v)}: ${reason}`);
        return ok();
      }
      if (p.act != 'accept') return no('Unknown action.');
      const issues = h.driverDocIssues(me.em);
      if (issues.length) return no(issues.join('. ') + '. Update your documents first.');
      issue(a);
      log(a, 'Awaiting Agreement', me.em);
      h.au(me.em, 'assignment accepted', { id: a.id, agreement: a.ag.terms.no });
      h.ntf(
        v.owner,
        'Driver accepted',
        `${me.name} accepted ${vehName(v)}. Sign the driver agreement ${a.ag.terms.no}.`
      );
      return ok({ no: a.ag.terms.no });
    },
    /* driver or owner signs the agreement (typed name + drawn signature), or the owner records a signed paper copy */
    assignSign(me, p) {
      const a = S.asg.find(x => x.id == p.id);
      const v = a && h.vOf(a.vehicle),
        isDr = !!a && a.driver == me.em,
        isOw = !!a && ownerOk(me, v);
      if (!a || !(isDr || isOw)) return no('Only the driver or the vehicle owner can sign this agreement.');
      if (a.st != 'Awaiting Agreement') return no('This agreement is not waiting for signatures.');
      const sg = a.ag.sg;
      if (p.how == 'paper') {
        if (!isOw) return no('Only the owner records a signed paper copy.');
        const photo = img(p.photo);
        if (!photo) return no('Upload a clear photo of the signed page.');
        const rec = { how: 'paper', photo, t: now(), by: me.em, h: a.ag.h };
        if (!sg.dr) sg.dr = { ...rec, name: a.ag.terms.driver.name };
        if (!sg.ow) sg.ow = { ...rec, name: a.ag.terms.owner.name };
      } else {
        const who = isDr ? 'dr' : 'ow';
        if (sg[who]) return no('You already signed this agreement.');
        if (p.agree !== true) return no('Tick the box to confirm you read and agree to every clause.');
        if (nm(p.name) != nm(me.name))
          return no('Type your full name exactly as on your account: ' + me.name + '.');
        const sig = img(p.sig);
        if (!sig) return no('Draw your signature in the box.');
        sg[who] = { how: 'digital', name: me.name, sig, t: now(), h: a.ag.h };
        h.ntf(
          isDr ? v.owner : a.driver,
          'Agreement ' + a.ag.terms.no,
          (isDr ? 'The driver' : 'The owner') + ' signed the driver agreement.'
        );
      }
      h.au(me.em, 'driver agreement signed', { id: a.id, how: p.how == 'paper' ? 'paper' : 'digital' });
      if (signed(a)) {
        log(a, 'Pending Activation', me.em);
        admins(
          'Assignment ready to activate',
          `${a.ag.terms.no}: ${a.ag.terms.driver.name} · ${vehName(v)} is signed by both.`
        );
      }
      return ok({ done: signed(a) });
    },
    /* administrator: final check of documents, then the assignment becomes Active */
    assignActivate(me, p) {
      if (!h.isAdmin(me)) return no('Administrator access required.');
      const a = S.asg.find(x => x.id == p.id);
      if (!a || a.st != 'Pending Activation') return no('This assignment is not ready to activate.');
      if (a.driver == me.em || (h.vOf(a.vehicle) || {}).owner == me.em)
        return no('You cannot activate an assignment you are part of. Another administrator must do it.');
      const dr = h.U(a.driver),
        v = h.vOf(a.vehicle);
      if (!h.okr(dr, 'driver') || !h.acct(dr)) return no('The driver is no longer approved or active.');
      const bad = driveable(v);
      if (bad) return no(bad);
      const issues = [...h.driverDocIssues(dr.em), ...h.vehDocIssues(v)];
      if (issues.length) return no('Cannot activate: ' + issues.join('; ') + '.');
      S.asg.forEach(x => {
        if (x.id != a.id && x.st == 'Active' && (x.vehicle == v.id || x.driver == dr.em))
          log(x, 'Ended', me.em, 'Replaced by ' + a.id);
      });
      log(a, 'Active', me.em);
      S.dp[dr.em] = { ...(S.dp[dr.em] || {}), avail: 'Unavailable' };
      h.au(me.em, 'assignment activated', { id: a.id, vehicle: v.id, driver: dr.em });
      h.ntf(
        dr.em,
        'Vehicle assigned',
        `You are now assigned to ${vehName(v)}. Set yourself to Available to receive bookings.`
      );
      h.ntf(v.owner, 'Driver assigned', `${dr.name} now drives ${vehName(v)}.`);
      return ok();
    },
    /* driver, owner or admin: cancel an open request, or end an active assignment */
    assignEnd(me, p) {
      const a = S.asg.find(x => x.id == p.id);
      const v = a && h.vOf(a.vehicle),
        isDr = !!a && a.driver == me.em,
        isOw = !!a && ownerOk(me, v),
        isAd = h.isAdmin(me);
      if (!a || !(isDr || isOw || isAd)) return no('Assignment not found.');
      const reason = str(p.reason, 300);
      if (reason.length < 10) return no('Write the reason (10+ characters).');
      if (OPEN.includes(a.st)) {
        log(a, 'Cancelled', me.em, reason);
      } else if (a.st == 'Active') {
        if (
          S.bk.some(
            b =>
              b.drvUser == a.driver &&
              b.veh == a.vehicle &&
              !h.done(b) &&
              C.FLOW.indexOf(b.st) >= C.FLOW.indexOf('On the Way to Pickup')
          )
        )
          return no(
            'The driver has a trip in progress with this vehicle. End the assignment after the trip.'
          );
        log(a, 'Ended', me.em, reason);
        S.dp[a.driver] = { ...(S.dp[a.driver] || {}), avail: 'Unavailable' };
      } else return no('This assignment is already closed.');
      h.au(me.em, 'assignment ' + a.st.toLowerCase(), { id: a.id });
      [a.driver, v.owner]
        .filter(em => em != me.em)
        .forEach(em => h.ntf(em, 'Assignment ' + a.st.toLowerCase(), `${vehName(v)}: ${reason}`));
      return ok();
    },
    /* driver: renew a document (new expiry date + photo) */
    driverDocUpdate(me, p) {
      if (!h.okr(me, 'driver')) return no('Only approved drivers can update driver documents.');
      const kind = p.kind == 'clr' ? 'clr' : 'lic',
        exp = str(p.exp, 10),
        file = img(p.file);
      if (!DATE.test(exp) || exp <= todayPH()) return no('Enter the new expiry date (in the future).');
      if (!file) return no('Upload a photo of the renewed document.');
      me.dx = { ...(me.dx || {}), [kind]: exp };
      (me.dxh = me.dxh || []).push({ kind, exp, file, t: now() });
      h.au(me.em, 'driver document renewed', { kind, exp });
      admins(
        'Driver document renewed',
        `${me.name} uploaded a renewed ${kind == 'lic' ? 'license' : 'clearance'} valid until ${exp}.`
      );
      return ok();
    },
  };
};
