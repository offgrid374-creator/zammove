'use strict';
/* Role applications (driver / vehicle owner), vehicle registration and approval, driver assignments. */
const C = require('./constants');
const { now, rid, norm, str, img, ok, no, todayPH } = require('../util');

module.exports = (S, h) => ({
  apply(me, p) {
    const rs = (p.roles || []).filter(r => C.DOCS[r]);
    if (!rs.length) return no('Choose at least one role to apply for.');
    const phone = str(p.phone, 20),
      address = str(p.address, 200),
      license = str(p.license, 30),
      licExp = str(p.licExp, 10),
      clrExp = str(p.clrExp, 10);
    if (!phone || !address) return no('Phone number and address are required.');
    /* applying for both roles: a document both roles ask for (ID, proof of address) is uploaded once */
    const fileFor = (r, i) => {
      const own = ((p.docs && p.docs[r]) || [])[i];
      if (img(own)) return own;
      for (const o of rs) {
        const j = o == r ? -1 : C.DOCS[o].indexOf(C.DOCS[r][i]),
          f = j > -1 ? ((p.docs && p.docs[o]) || [])[j] : '';
        if (img(f)) return f;
      }
      return '';
    };
    for (const r of rs) {
      const ex = h.rl(me, r);
      if (ex && (ex.st == 'approved' || ex.st == 'pending'))
        return no(
          'You already have an ' +
            (ex.st == 'approved' ? 'approved' : 'open application for the') +
            ' ' +
            r +
            ' role.'
        );
      if (r == 'driver' && license.length < 5) return no('Enter your driver’s license number.');
      if (r == 'driver' && !(/^\d{4}-\d{2}-\d{2}$/.test(licExp) && licExp > todayPH()))
        return no('Enter your driver’s license expiry date (it must not be expired).');
      if (r == 'driver' && !(/^\d{4}-\d{2}-\d{2}$/.test(clrExp) && clrExp > todayPH()))
        return no('Enter the validity date of your NBI or police clearance (it must not be expired).');
      const miss = C.DOCS[r].filter((n, i) => !n.includes('(if any)') && !fileFor(r, i));
      if (miss.length) return no('Upload: ' + miss.join(', ') + '.');
    }
    me.roles = me.roles || [];
    for (const r of rs) {
      me.roles = me.roles.filter(x => x.t != r);
      me.roles.push({ t: r, st: 'pending' });
      S.apps.push({
        id: rid('AP'),
        user: me.em,
        role: r,
        st: 'Pending Review',
        info: {
          phone,
          address,
          license: r == 'driver' ? license : '',
          licExp: r == 'driver' ? licExp : '',
          clrExp: r == 'driver' ? clrExp : '',
          note: str(p.note, 300),
        },
        /* owner recommendations waiting for this application */
        rec:
          r == 'driver'
            ? S.asg.filter(x => x.driver == me.em && x.st == 'Waiting for Application').map(x => x.id)
            : [],
        docs: C.DOCS[r].map((n, i) => ({ name: n, file: fileFor(r, i) })).filter(x => x.file),
        req: '',
        iv: null,
        orient: false,
        hist: [{ st: 'Pending Review', t: now(), by: me.em }],
      });
    }
    h.au(me.em, 'application submitted', { roles: rs });
    return ok();
  },
  uploadDoc(me, p) {
    const a = S.apps.find(x => x.id == p.id);
    if (!a || a.user != me.em) return no('Application not found.');
    if (a.st != 'Awaiting Additional Documents')
      return no('No additional documents are requested right now.');
    const f = (p.docs || []).filter(x => img(x.file));
    if (!f.length) return no('Choose at least one file.');
    a.docs.push(
      ...f.map(x => ({ name: str(x.name, 80) || 'Additional document', file: img(x.file), extra: true }))
    );
    a.st = 'Under Verification';
    a.hist.push({ st: a.st, t: now(), by: me.em });
    h.au(me.em, 'additional documents submitted', { app: a.id });
    return ok();
  },
  appAction(me, p) {
    if (!h.isAdmin(me)) return no('Administrator access required.');
    const a = S.apps.find(x => x.id == p.id);
    if (!a) return no('Application not found.');
    const s = a.st,
      act = p.act,
      note = str(p.note, 300),
      reason = str(p.reason, 300);
    const go = n => {
      a.st = n;
      a.hist.push({ st: n, t: now(), by: me.em, note: note || reason });
    };
    if (['Approved', 'Rejected'].includes(s)) return no('This application is already closed.');
    if (a.user == me.em) return no('You cannot decide your own application. Another administrator must do it.');
    if (act == 'verify') {
      if (s != 'Pending Review') return no('Only new applications can start verification.');
      go('Under Verification');
    } else if (act == 'interview') {
      if (!['Under Verification', 'Awaiting Additional Documents'].includes(s))
        return no('Verify the documents before scheduling an interview.');
      if (!p.when || !str(p.where, 200)) return no('Enter the interview date/time and place.');
      a.iv = { when: str(p.when, 20), where: str(p.where, 200) };
      go('Interview Scheduled');
    } else if (act == 'request') {
      if (!['Under Verification', 'Interview Scheduled'].includes(s))
        return no('Nothing to request at this stage.');
      if (note.length < 5) return no('Describe what is needed.');
      a.req = note;
      go('Awaiting Additional Documents');
    } else if (act == 'orient') {
      if (s != 'Interview Scheduled') return no('Schedule and hold the interview first.');
      go('For Orientation');
    } else if (act == 'orientdone') {
      if (s != 'For Orientation') return no('The applicant is not at the orientation stage.');
      a.orient = true;
      a.hist.push({ st: 'Orientation completed', t: now(), by: me.em });
    } else if (act == 'approve') {
      if (s != 'For Orientation' || !a.orient) return no('Approval requires a completed orientation.');
      const u = h.U(a.user),
        r = u && (u.roles || []).find(x => x.t == a.role);
      if (!r) return no('Applicant role record is missing.');
      go('Approved');
      Object.assign(r, { st: 'approved', by: me.em, at: now() });
      if (a.role == 'driver') {
        u.dx = { lic: a.info.licExp || '', clr: a.info.clrExp || '' };
        u.lic = a.info.license || u.lic;
        /* linked owner recommendations go straight to the driver for an answer */
        S.asg
          .filter(x => x.driver == u.em && x.st == 'Waiting for Application')
          .forEach(x => {
            const v = h.vOf(x.vehicle);
            if (!v || v.approval != 'Approved') return;
            x.st = 'Awaiting Driver';
            x.hist.push({
              st: 'Awaiting Driver',
              t: now(),
              by: me.em,
              note: 'Approved together with the driver application',
            });
            h.ntf(
              u.em,
              'Vehicle offered to you',
              `${v.brand} ${v.model} (${v.plate}) is offered to you. Accept or decline it on your Driver dashboard.`
            );
          });
      }
    } else if (act == 'reject') {
      if (reason.length < 5) return no('Write the reason.');
      go('Rejected');
      const u = h.U(a.user),
        r = u && (u.roles || []).find(x => x.t == a.role);
      if (r) r.st = 'rejected';
      S.asg
        .filter(x => x.driver == a.user && x.st == 'Waiting for Application' && a.role == 'driver')
        .forEach(x => {
          x.st = 'Cancelled';
          x.hist.push({ st: 'Cancelled', t: now(), by: me.em, note: 'Driver application rejected' });
        });
    } else return no('Unknown action.');
    h.au(me.em, 'application ' + act, { app: a.id, role: a.role, user: a.user });
    h.ntf(
      a.user,
      'Application update',
      'Your ' + (a.role == 'owner' ? 'vehicle owner' : a.role) + ' application is now: ' + a.st + '.'
    );
    return ok();
  },
  /* approved owners and approved drivers can register vehicles; a driver becomes an owner when an
     administrator approves the vehicle (the OR/CR and the driver application already prove who they are) */
  addVehicle(me, p) {
    const isOwn = h.okr(me, 'owner'),
      isDrv = h.okr(me, 'driver');
    if (!(isOwn || isDrv) || !h.acct(me))
      return no('Only approved vehicle owners and drivers can register vehicles.');
    const ty = C.VT.find(x => x.id == p.type);
    if (!ty) return no('Choose a vehicle type.');
    const brand = str(p.brand, 40),
      model = str(p.model, 40),
      plate = str(p.plate, 12).toUpperCase(),
      regExp = str(p.regExp, 10),
      color = str(p.color, 30),
      year = Math.round(+p.year);
    if (!brand || !model) return no('Enter the brand and model.');
    if (color.length < 3) return no('Enter the vehicle color as shown on the registration.');
    if (!(year >= 1990 && year <= new Date().getFullYear() + 1))
      return no('Enter the model year (1990 or later).');
    if (norm(plate).length < 5) return no('Enter a valid plate number.');
    if (S.vh.some(v => norm(v.plate) == norm(plate))) return no('This plate number is already registered.');
    if (!regExp || new Date(regExp) < new Date()) return no('The registration must not be expired.');
    if (!img(p.doc)) return no('Upload the registration document (OR/CR).');
    /* legal documents: hauling for hire needs an LTFRB franchise (CPC); every vehicle needs CTPL insurance */
    const legal = h.legalOf(ty, p);
    if (legal.err) return no(legal.err);
    const spec = h.vSpec(ty, p);
    if (spec.err) return no(spec.err);
    const v = {
      id: rid('VH'),
      owner: me.em,
      type: ty.id,
      brand,
      model,
      plate,
      color,
      year,
      cap: ty.cap,
      desc: str(p.desc, 200),
      regExp,
      docs: [{ name: 'OR/CR', file: img(p.doc) }],
      photo: img(p.photo),
      seats: spec.seats,
      trans: spec.trans,
      fuel: spec.fuel,
      approval: 'Pending Approval',
      status: 'Unavailable',
      selfReq: isDrv && !!p.self && !ty.rentOnly, // "I will drive it myself": set as its driver on approval
      legal: legal.rec,
      hist: [{ e: 'Registered' + (isOwn ? '' : ' by a driver'), t: now(), by: me.em }],
    };
    S.vh.push(v);
    h.au(me.em, 'vehicle registered', { vehicle: v.id, self: v.selfReq });
    h.staffEms().forEach(em =>
      h.ntf(em, 'Vehicle to verify', `${me.name} registered ${brand} ${model} (${plate}).`)
    );
    return ok({ id: v.id, ownerOnApproval: !isOwn });
  },
  /* owner: renew the franchise or insurance (new number, expiry and photo) */
  vehLegal(me, p) {
    const v = h.vOf(p.id);
    if (!v || v.owner != me.em || !h.acct(me)) return no('Vehicle not found.');
    const ty = C.VT.find(x => x.id == v.type) || {};
    const legal = h.legalOf(ty, p);
    if (legal.err) return no(legal.err);
    v.legal = legal.rec;
    v.hist.push({ e: 'Legal documents updated', t: now(), by: me.em });
    h.au(me.em, 'vehicle legal documents updated', { vehicle: v.id });
    h.staffEms().forEach(em => h.ntf(em, 'Vehicle documents renewed', `${me.name} updated the franchise/insurance of ${v.plate}.`));
    return ok();
  },
  vehStatus(me, p) {
    const v = h.vOf(p.id);
    if (!v || v.owner != me.em) return no('Vehicle not found.');
    if (v.approval != 'Approved') return no('Only approved vehicles can change availability.');
    if (!['Available', 'Unavailable', 'Maintenance'].includes(p.s)) return no('Invalid status.');
    if (S.bk.some(b => b.veh == v.id && !h.done(b))) return no('The vehicle has an active booking.');
    v.status = p.s;
    v.hist.push({ e: 'Status: ' + p.s, t: now(), by: me.em });
    h.au(me.em, 'vehicle status', { vehicle: v.id, status: p.s });
    return ok();
  },
  /* owner: offer an approved vehicle for self-drive rental, with its daily rate and specs */
  vehRent(me, p) {
    const v = h.vOf(p.id);
    if (!v || v.owner != me.em || !h.acct(me)) return no('Vehicle not found.');
    if (v.approval != 'Approved') return no('The vehicle must be approved before it can be rented out.');
    const on = !!p.on;
    if (!on) {
      v.rent = { ...(v.rent || {}), on: false };
    } else {
      const day = Math.round(+p.day);
      if (!(day >= 300 && day <= 50000)) return no('Set a daily rate between ₱300 and ₱50,000.');
      const spec = h.vSpec(C.VT.find(x => x.id == v.type) || {}, p);
      if (spec.err) return no(spec.err);
      Object.assign(v, { seats: spec.seats, trans: spec.trans, fuel: spec.fuel });
      const dep =
        p.dep === undefined || p.dep === '' || p.dep === null
          ? +(v.rent || {}).dep || C.DEP
          : Math.round(+p.dep);
      if (!(dep >= C.DEP && dep <= C.DEP_MAX))
        return no(
          'Set a refundable deposit between ₱' +
            C.DEP.toLocaleString() +
            ' and ₱' +
            C.DEP_MAX.toLocaleString() +
            '.'
        );
      v.rent = { on: true, day, dep };
    }
    v.hist.push({
      e: on
        ? 'Offered for rental at ₱' + v.rent.day + '/day, deposit ₱' + v.rent.dep
        : 'Removed from rentals',
      t: now(),
      by: me.em,
    });
    h.au(me.em, 'vehicle rental settings', { vehicle: v.id, on, day: v.rent.day });
    return ok();
  },
  /* owner: replace the vehicle photo customers see */
  vehPhoto(me, p) {
    const v = h.vOf(p.id);
    if (!v || v.owner != me.em || !h.acct(me)) return no('Vehicle not found.');
    if (!img(p.photo)) return no('Choose a photo (JPG or PNG).');
    v.photo = img(p.photo);
    v.hist.push({ e: 'Photo updated', t: now(), by: me.em });
    h.au(me.em, 'vehicle photo updated', { vehicle: v.id });
    return ok();
  },
  /* reqAssign / assignDecision moved to drivers.js */
  vehicleDecision(me, p) {
    if (!h.isAdmin(me)) return no('Administrator access required.');
    const v = h.vOf(p.id);
    if (!v || v.approval != 'Pending Approval') return no('Vehicle not found or already decided.');
    if (v.owner == me.em) return no('You cannot approve your own vehicle. Another administrator must do it.');
    const reason = str(p.reason, 300);
    const o = h.U(v.owner);
    let extra = '';
    if (p.act == 'approve') {
      const ty = C.VT.find(x => x.id == v.type) || {},
        miss = h.legalIssues(v, ty, true);
      if (miss.length) return no('Cannot approve: ' + miss.join('; ') + '. Ask the owner to add them.');
      v.approval = 'Approved';
      v.status = 'Available';
      /* a driver who registered a vehicle becomes its owner */
      if (o && !h.okr(o, 'owner')) {
        o.roles = (o.roles || []).filter(r => r.t != 'owner');
        o.roles.push({ t: 'owner', st: 'approved', by: me.em, at: now(), via: 'vehicle ' + v.id });
        h.au(me.em, 'owner role granted with vehicle', { user: o.em, vehicle: v.id });
        extra += ' You are now also a vehicle owner: open Workspace → Vehicle Owner.';
      }
      if (v.selfReq && o) {
        const r = h.selfDrive(o, v, me.em);
        extra += typeof r == 'string' ? ' You were not set as its driver yet: ' + r : ' You are set as its driver.';
      }
    } else {
      if (reason.length < 5) return no('Write the reason.');
      v.approval = 'Rejected';
    }
    v.hist.push({ e: v.approval, t: now(), by: me.em, note: reason });
    h.au(me.em, 'vehicle ' + p.act, { vehicle: v.id });
    h.ntf(
      v.owner,
      'Vehicle ' + v.approval.toLowerCase(),
      `${v.brand} ${v.model} (${v.plate}) was ${v.approval.toLowerCase()}.${p.act != 'approve' ? ' Reason: ' + reason : ''}${extra}`
    );
    return ok({ ownerGranted: extra.includes('vehicle owner') });
  },
});
