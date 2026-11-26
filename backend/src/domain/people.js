'use strict';
/* Owners manage their own people.

   Drivers: a driver applies to a vehicle owner (or the owner recommends them). The application waits as
   "Waiting for Owner" until that owner approves; then ZamMove verifies it as before (documents, interview,
   orientation). An approved driver works for that owner only (u.employer). An owner can drive their own
   vehicles. Owners see only their own drivers.

   Helpers: each owner registers the helpers (name, phone, ID photo) who may work on their trips; the owner's
   drivers can also work as helpers. A booking with helpers needs them named before departure, and the
   customer sees who handles their cargo. */
const { now, rid, str, img, ok, no, r2 } = require('../util');

module.exports = (S, h) => {
  /* the owner a driver works for: set on approval; older drivers belong to the owner of the vehicle they drive */
  h.driverOwner = em => {
    const u = h.U(em);
    if (!u) return '';
    if (u.employer) return u.employer;
    const a = S.asg.find(x => x.driver == em && x.st == 'Active'),
      v = a && h.vOf(a.vehicle);
    return (v && v.owner) || '';
  };
  /* who can work as a helper on this owner's trips: registered helpers and the owner's own drivers */
  h.crewOf = owner => {
    const o = h.U(owner);
    if (!o) return [];
    const helpers = (o.helpers || []).filter(x => !x.off).map(x => ({ id: x.id, name: x.name, ph: x.ph, kind: 'Helper' }));
    const drivers = S.users
      .filter(u => h.okr(u, 'driver') && h.driverOwner(u.em) == owner)
      .map(u => ({ id: 'D:' + h.pkey(u.em), name: u.name, ph: u.ph, kind: 'Driver' }));
    return [...helpers, ...drivers];
  };

  return {
    /* owner: approve or decline a driver who applied to work for them */
    ownerAppDecide(me, p) {
      const a = S.apps.find(x => x.id == p.id && x.employer == me.em);
      if (!a || a.st != 'Waiting for Owner') return no('There is no driver application waiting for you.');
      const note = str(p.note, 300);
      if (!p.ok && note.length < 5) return no('Tell the applicant why (at least 5 characters).');
      const u = h.U(a.user);
      if (p.ok) {
        a.st = 'Pending Review';
        a.hist.push({ st: 'Pending Review', t: now(), by: me.em, note: 'Approved by the vehicle owner' + (note ? ': ' + note : '') });
        h.ntf(a.user, 'Owner approved you', `${me.name} approved your driver application. ZamMove now checks your documents and schedules an interview.`);
        h.staffEms().forEach(em => h.ntf(em, 'Driver application to review', `${u ? u.name : a.user} applied to drive for ${me.name}; the owner approved.`));
      } else {
        a.st = 'Rejected';
        a.hist.push({ st: 'Rejected', t: now(), by: me.em, note: 'Declined by the vehicle owner: ' + note });
        const r = u && (u.roles || []).find(x => x.t == 'driver');
        if (r) r.st = 'rejected';
        h.ntf(a.user, 'Driver application declined', `${me.name} declined your application: ${note}. You can apply to another owner.`);
      }
      h.au(me.em, 'owner ' + (p.ok ? 'approved' : 'declined') + ' driver applicant', { app: a.id });
      return ok();
    },
    /* owner: register, edit or remove a helper */
    ownerHelper(me, p) {
      if (!h.okr(me, 'owner') || !h.acct(me)) return no('Only an approved vehicle owner can register helpers.');
      const u = h.U(me.em),
        L = (u.helpers = u.helpers || []),
        x = p.act == 'add' ? null : L.find(y => y.id == p.id);
      if (p.act != 'add' && !x) return no('Helper not found.');
      if (p.act == 'del') {
        if (S.bk.some(b => !h.done(b) && (b.helpers || []).some(y => y.id == x.id))) return no(`${x.name} is on a trip that is not finished. Remove them after it.`);
        x.off = now(); // kept for the trip history, hidden from new trips
        h.au(me.em, 'helper removed', { id: x.id });
        return ok();
      }
      const name = str(p.name, 80),
        ph = str(p.ph, 20).replace(/\s+/g, ''),
        idph = img(p.idph);
      if (name.length < 3) return no('Enter the helper’s full name.');
      if (!/^(09|\+639)\d{9}$/.test(ph)) return no('Enter a PH mobile number (09XXXXXXXXX).');
      if (p.act == 'add') {
        if (!idph) return no('Upload a photo of the helper’s valid ID.');
        L.push({ id: rid('HP'), name, ph, idph, t: now() });
      } else Object.assign(x, { name, ph, ...(idph ? { idph } : {}) });
      h.au(me.em, 'helper ' + (p.act == 'add' ? 'registered' : 'updated'), { name });
      return ok();
    },
    /* owner: a discount on a trip with their vehicle (e.g. a friend). Up to 50% of the fare and never more than
       the owner's own share: ZamMove's service fee and commission stay on the full fare. 0 removes it. */
    ownerDiscount(me, p) {
      const b = S.bk.find(x => x.id == p.id);
      const v = b && h.vOf(b.veh);
      if (!b || !v || v.owner != me.em || !h.acct(me)) return no('Only the owner of the vehicle on this trip can give a discount.');
      if (h.done(b)) return no('This trip is closed.');
      if (h.paySum(b.id, 'final') > 0) return no('The balance was already collected.');
      const amt = Math.round(+p.amt || 0),
        why = str(p.why, 200);
      if (amt < 0) return no('Enter the discount in pesos.');
      if (amt == 0) {
        delete b.odisc;
        if (b.decl) delete b.decl.final;
        h.au(me.em, 'owner discount removed', { bk: b.id });
        return ok();
      }
      const fare = +b.tot || 0,
        share = (() => {
          const s0 = h.splitOf({ ...b, odisc: null });
          return s0.own;
        })(),
        max = Math.floor(Math.min(fare * 0.5, share, r2(fare - h.half(b))));
      if (amt > max) return no(`The most you can give on this trip is ₱${max.toLocaleString('en-PH')} (50% of the fare, your share and the unpaid balance).`);
      if (why.length < 3) return no('Write a short reason (it appears on the receipt and in your reports).');
      b.odisc = { amt, why, by: me.em, t: now() };
      /* the customer's declaration of the balance is now outdated: they declare the new amount */
      if (b.decl && b.decl.final) {
        delete b.decl.final;
        S.pay.forEach(x => x.bid == b.id && x.kind == 'final' && x.status == 'Submitted' && Object.assign(x, { status: 'Rejected', note: 'Replaced after a discount' }));
      }
      (b.ev = b.ev || []).push({ t: now(), by: me.em, from: b.st, to: b.st, note: `Owner discount ₱${amt}: ${why}` });
      h.au(me.em, 'owner discount', { bk: b.id, amt });
      h.ntf(b.cu, 'Discount on ' + b.id, `The vehicle owner gave you a ₱${amt.toLocaleString('en-PH')} discount (${why}). Your balance is lower.`);
      if (b.drvUser && b.drvUser != me.em) h.ntf(b.drvUser, 'Discount on ' + b.id, `The owner gave a ₱${amt} discount. Collect the lower balance; your share does not change.`);
      return ok({ max });
    },
    /* driver (or the vehicle's owner): name the helpers for a booking before departure */
    bookHelpers(me, p) {
      const b = S.bk.find(x => x.id == p.id);
      if (!b || !b.drvUser) return no('Booking not found.');
      const v = h.vOf(b.veh),
        owner = (v && v.owner) || h.driverOwner(b.drvUser);
      if (b.drvUser != me.em && owner != me.em) return no('Only the driver or the vehicle owner can name the helpers.');
      if (!(+b.mv > 0)) return no('This booking has no helpers.');
      if (C_DONE(b)) return no('Helpers can only be named before departure.');
      const crew = h.crewOf(owner),
        ids = [...new Set(Array.isArray(p.ids) ? p.ids : [])],
        pick = ids.map(id => crew.find(c => c.id == id)).filter(Boolean);
      if (pick.length != ids.length) return no('Choose helpers from your registered list.');
      if (pick.length != +b.mv) return no(`This booking needs ${b.mv} helper${b.mv > 1 ? 's' : ''}; you chose ${pick.length}.`);
      b.helpers = pick.map(c => ({ id: c.id, name: c.name, ph: c.ph, kind: c.kind }));
      (b.ev = b.ev || []).push({ t: now(), by: me.em, from: b.st, to: b.st, note: 'Helpers: ' + pick.map(c => c.name).join(', ') });
      h.au(me.em, 'booking helpers', { bk: b.id, n: pick.length });
      h.ntf(b.cu, 'Your helpers', `${b.id}: ${pick.map(c => c.name).join(' and ')} will help ${b.drv} with your items.`);
      return ok();
    },
  };
  function C_DONE(b) {
    return h.done(b) || ['In Transit', 'Arrived at Destination', 'Delivery Confirmation', 'Awaiting Final Payment'].includes(b.st);
  }
};
