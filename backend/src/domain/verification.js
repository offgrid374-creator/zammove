'use strict';
/* Pre-departure verification (Start PIN/QR, plate, cargo checklist, confirmations, authorize) and the Delivery PIN.
   Roles come from the session: customer = booking.cu, driver = booking.drvUser, admin = staff with adm super/admin. */
const C = require('./constants');
const { now, sha256, randHex, pin6, norm, str, img, ok, no } = require('../util');

module.exports = (S, h) => {
  const isDrv = (me, b) => !!b && !!b.drvUser && me.em == b.drvUser;
  const isCus = (me, b) => !!b && !!b.cu && me.em == b.cu && b.drvUser != b.cu;
  const actorId = (me, b) => (isDrv(me, b) ? 'DRV-' + me.em : me.em);
  const role = (me, b) =>
    isDrv(me, b) ? 'driver' : isCus(me, b) ? 'customer' : h.isAdmin(me) ? 'admin' : '';
  const D_ERR = 'Only the driver assigned to this booking can do this.',
    C_ERR = 'Only the customer who made this booking can do this.',
    A_ERR = 'Only an administrator can do this.';
  const find = id => S.bk.find(x => x.id == id);

  const mk = b => {
    const it = C.parseItems(b.it);
    if (/fragile/i.test(b.si || '') && !it.some(x => x.fr))
      it.push({
        n: 'Items marked fragile in the instructions',
        q: 0,
        dim: '',
        fr: true,
        hv: false,
        gen: true,
      });
    if (!it.length) it.push({ n: 'Cargo as described in the booking', q: 1, dim: '', fr: false, hv: false });
    return {
      v: 1,
      cust: b.cu,
      items: it,
      hvAny: it.some(x => x.hv) || /jewel|valuable/i.test(b.si || ''),
      mc: it.reduce((s, x) => s + (x.gen ? 0 : x.q), 0),
      mcOver: null,
      pin: null,
      qr: null,
      pinOk: null,
      plate: null,
      chk: null,
      disc: [],
      dconf: null,
      cconf: null,
      exc: null,
      auth: null,
      done: false,
      log: [],
    };
  };
  const vv = b => {
    b.ver = b.ver || mk(b);
    b.ver.cust = b.cu;
    return b.ver;
  };
  const mc = b => b.ver.mcOver ?? b.ver.mc;
  const openD = b => ((b.ver && b.ver.disc) || []).filter(d => d.status == 'open');
  const log = (b, me, evt, data) => {
    vv(b).log.push({ t: now(), role: role(me, b), actor: actorId(me, b), evt, data: data || null });
  };
  const stage = b =>
    b.st == 'Items Loaded'
      ? ''
      : b.ver && b.ver.done
        ? 'Departure was already authorized.'
        : 'Verification is only available while the booking is in Pickup / Loading.';
  const vehRec = b => {
    const v = b.drvUser && h.vOf(b.veh);
    return v
      ? { id: v.id, plate: v.plate, approved: v.approval == 'Approved', active: v.status != 'Maintenance', v }
      : null;
  };
  const vehOk = b => {
    const r = vehRec(b);
    return (
      !!r &&
      r.approved &&
      r.active &&
      !S.bk.some(
        x => x.id != b.id && x.veh == b.veh && ['In Transit', 'Arrived at Destination'].includes(x.st)
      )
    );
  };
  const fragOk = b => {
    const c = b.ver.chk;
    return b.ver.items.every(
      (x, i) => !x.fr || (c && c.frag && c.frag[i] && c.frag[i].pad && c.frag[i].strap)
    );
  };
  const cond = b => {
    const v = b.ver || { items: [], disc: [] },
      c = v.chk;
    return [
      ['Start PIN or QR verified', !!v.pinOk],
      ['Driver is assigned to this booking', !!b.drvUser],
      ...(+b.mv > 0 ? [[`Helpers named (${b.mv})`, (b.helpers || []).length == +b.mv]] : []),
      ['Vehicle is approved, active and available', vehOk(b)],
      ['Actual plate matches the assigned vehicle', !!(v.plate && v.plate.match)],
      ['Cargo piece count checked', !!(c && Number.isInteger(c.count) && c.done)],
      ['Fragile items padded and strapped', !!c && fragOk(b)],
      ['Driver confirmation recorded', !!v.dconf],
      [
        v.exc ? 'Customer confirmation waived by administrator' : 'Customer confirmation recorded',
        !!(v.cconf || v.exc),
      ],
      ['No unresolved cargo discrepancy', openD(b).length == 0],
      ['Booking is in Pickup / Loading', b.st == 'Items Loaded'],
    ];
  };
  const dv0 = b => (b.dver = b.dver || { pin: null, ok: null, waive: null, log: [] });
  const dlog = (b, me, evt, data) => {
    dv0(b).log.push({ t: now(), role: role(me, b), actor: actorId(me, b), evt, data: data || null });
    h.au(me.em, 'delivery ' + evt, { bk: b.id, ...(data || {}) });
  };
  const dstage = b =>
    b.st == 'Arrived at Destination'
      ? ''
      : b.dver && b.dver.ok
        ? 'Delivery was already confirmed.'
        : 'The Delivery PIN is only used after the driver arrives at the destination.';
  const newSecret = () => {
    const pin = pin6(),
      s = randHex(8);
    return { pin, rec: { h: sha256(s + pin), s, exp: Date.now() + C.PIN_TTL, used: false, att: 0, lock: 0 } };
  };
  /* shared PIN check: lockout, expiry, attempts */
  const checkPin = (b, me, p, input, label, logFn) => {
    if (Date.now() < p.lock)
      return no('Too many wrong attempts. Try again in ' + Math.ceil((p.lock - Date.now()) / 6e4) + ' min.');
    if (Date.now() > p.exp)
      return no('This ' + label + ' has expired. The customer can request a new one.', { expired: true });
    if (!/^\d{6}$/.test(input) || sha256(p.s + input) != p.h) {
      p.att++;
      logFn(b, me, label + ' check failed', { attempt: p.att });
      if (p.att >= C.MAX_TRY) {
        p.lock = Date.now() + C.LOCK;
        p.att = 0;
        logFn(b, me, label + ' locked', { minutes: 5 });
        return no('Too many wrong attempts. Locked for 5 minutes.');
      }
      return no(
        'That ' +
          label +
          ' is not correct. ' +
          (C.MAX_TRY - p.att) +
          ' attempt' +
          (C.MAX_TRY - p.att > 1 ? 's' : '') +
          ' left.'
      );
    }
    return null;
  };

  /* a discrepancy reported by the system: it blocks departure until it is resolved; the staff are told */
  const report = (b, d) => {
    const v = b.ver;
    const x = { id: 'DS-' + (v.disc.length + 1), ...d, role: 'system', by: 'system', t: now(), status: 'open' };
    v.disc.push(x);
    v.log.push({ t: now(), role: 'system', actor: 'system', evt: 'discrepancy reported', data: { id: x.id, type: x.type } });
    h.staffEms().forEach(em => h.ntf(em, 'Pre-departure check on hold', `${b.id}: ${x.type}. ${x.note} Resolve it under Verification.`));
    return x;
  };
  /* the driver corrected the entry: an open system report of that kind closes by itself */
  const autoResolve = (b, kind, res) => {
    (b.ver.disc || [])
      .filter(d => d.status == 'open' && d.auto == kind)
      .forEach(d => {
        Object.assign(d, { status: 'resolved', res, resBy: 'system', resT: now() });
        b.ver.log.push({ t: now(), role: 'system', actor: 'system', evt: 'discrepancy resolved', data: { id: d.id, resolution: res } });
      });
  };
  return {
    vNewPin(me, p) {
      const b = find(p.id);
      if (!isCus(me, b)) return no(C_ERR);
      const e = stage(b);
      if (e) return no(e);
      const v = vv(b);
      if (v.pinOk) return no('The Start PIN was already verified.');
      const { pin, rec } = newSecret(),
        tok = randHex(16),
        qs = randHex(8);
      v.pin = rec;
      v.qr = { h: sha256(qs + tok), s: qs };
      log(b, me, 'start PIN issued', { expires: new Date(rec.exp).toISOString() });
      /* also sent by SMS and email (simulated), so the customer does not have to remember it */
      const cu = h.U(b.cu);
      if (cu && cu.ph) h.sim(cu.ph, 'SMS', `ZamMove ${b.id}: your Start PIN is ${pin}. Give it to your driver when the items are loaded.`, b.cu);
      if (cu) h.sim(cu.em, 'Email', `ZamMove ${b.id}: your Start PIN is ${pin}. Give it to your driver when the items are loaded.`, b.cu);
      return ok({ pin, tok }); // raw values go only to the customer who asked
    },
    vVerify(me, p) {
      const b = find(p.id);
      if (!isDrv(me, b)) return no(D_ERR);
      const e = stage(b);
      if (e) return no(e);
      const v = vv(b),
        pn = v.pin;
      if (v.pinOk) return no('Already verified.');
      if (!pn) return no('No Start PIN has been issued yet. Ask the customer to open Track.');
      const t = str(p.input, 100);
      if (!t) return no(p.kind == 'qr' ? 'Paste the QR code text.' : 'Enter the 6-digit Start PIN.');
      if (p.kind == 'qr') {
        if (Date.now() < pn.lock) return no('Too many wrong attempts. Try again later.');
        if (Date.now() > pn.exp)
          return no('This PIN has expired. The customer can request a new one.', { expired: true });
        const m = t.split('.');
        if (!(m.length == 3 && m[0] == 'ZM1' && m[1] == b.id && sha256(v.qr.s + m[2]) == v.qr.h)) {
          pn.att++;
          log(b, me, 'start code check failed', { via: 'qr', attempt: pn.att });
          if (pn.att >= C.MAX_TRY) {
            pn.lock = Date.now() + C.LOCK;
            pn.att = 0;
            log(b, me, 'Start PIN locked', { minutes: 5 });
            return no('Too many wrong attempts. Locked for 5 minutes.');
          }
          return no('That QR code is not correct.');
        }
      } else {
        const bad = checkPin(b, me, pn, t, 'Start PIN', log);
        if (bad) return bad;
      }
      pn.used = true;
      v.pinOk = { t: now(), by: actorId(me, b), via: p.kind == 'qr' ? 'qr' : 'pin' };
      log(b, me, 'start code verified', { via: v.pinOk.via });
      return ok();
    },
    vPlate(me, p) {
      const b = find(p.id);
      if (!isDrv(me, b)) return no(D_ERR);
      const e = stage(b);
      if (e) return no(e);
      const v = vv(b);
      if (!v.pinOk) return no('Verify the Start PIN first.');
      if (!vehOk(b))
        return no(
          'The assigned vehicle is not approved, active and available. An administrator must review it.'
        );
      if (!norm(p.input)) return no('Enter the plate number on the truck.');
      const r = vehRec(b),
        m = norm(p.input) == norm(r.plate);
      v.plate = { entered: norm(p.input), match: m, t: now(), by: actorId(me, b), vehicle: r.id };
      log(b, me, 'vehicle check', { match: m, vehicle: r.id, plate: v.plate.entered });
      if (m) {
        /* the right plate: a mismatch reported earlier was a typo, so it closes by itself */
        v.plateMiss = [];
        autoResolve(b, 'plate', 'Resolved automatically: the driver then entered the correct plate (' + v.plate.entered + ').');
        return ok();
      }
      /* one wrong entry is treated as a typo; a second one is reported to an administrator */
      v.plateMiss = [...(v.plateMiss || []), v.plate.entered];
      if (v.plateMiss.length < 2)
        return no(
          'Plate ' + v.plate.entered + ' does not match the assigned vehicle. Check the plate on the truck and enter it again.'
        );
      if (!v.disc.some(d => d.status == 'open' && d.auto == 'plate'))
        report(b, {
          type: 'Vehicle plate mismatch',
          note: 'The driver entered ' + v.plateMiss.join(', ') + '; the assigned vehicle is ' + norm(r.plate) + '.',
          auto: 'plate',
        });
      return no(
        'The plate still does not match. Departure is blocked and an administrator was notified. Entering the correct plate clears it.'
      );
    },
    vSave(me, p) {
      const b = find(p.id);
      if (!isDrv(me, b)) return no(D_ERR);
      const e = stage(b);
      if (e) return no(e);
      const v = vv(b);
      if (!v.pinOk || !(v.plate && v.plate.match)) return no('Verify the PIN and the vehicle plate first.');
      const n = String(p.count ?? '').trim() === '' ? NaN : +p.count,
        need = [],
        items = p.items || [],
        frag = p.frag || [];
      if (!Number.isInteger(n) || n < 0 || n > 9999) need.push('Enter the loaded piece count');
      if (!v.items.every((x, i) => items[i])) need.push('Tick every booked item');
      if (!v.items.every((x, i) => !x.fr || (frag[i] && frag[i].pad && frag[i].strap)))
        need.push('Confirm padding and strapping for fragile items');
      v.chk = {
        count: Number.isInteger(n) ? n : null,
        items: v.items.map((x, i) => !!items[i]),
        frag: v.items.map((x, i) => ({
          pad: !!(frag[i] && frag[i].pad),
          strap: !!(frag[i] && frag[i].strap),
        })),
        seal: str(p.seal, 60),
        photo: img(p.photo) || (v.chk && v.chk.photo) || '',
        note: str(p.note, 300),
        t: now(),
        by: actorId(me, b),
        done: !need.length,
      };
      v.dconf = null;
      v.cconf = null;
      let warn = '';
      if (Number.isInteger(n) && n == mc(b)) {
        v.countMiss = null;
        autoResolve(b, 'count', 'Resolved automatically: the driver recounted ' + n + ' pieces, as booked.');
      } else if (Number.isInteger(n) && !v.disc.some(x => x.status == 'open' && x.auto == 'count')) {
        if (v.countMiss !== n) {
          /* first time this count: ask for a recount before anything is reported */
          v.countMiss = n;
          v.chk.done = false;
          need.unshift('Recount: you entered ' + n + ' pieces but the booking lists ' + mc(b) + '. If ' + n + ' is right, save again to report it');
        } else {
          report(b, {
            type: n < mc(b) ? 'Missing items' : 'Additional items',
            note: 'Driver counted ' + n + ' pieces loaded (twice); the booking lists ' + mc(b) + '.',
            auto: 'count',
          });
          warn =
            'The count differs from the booking, so it was reported to an administrator. Departure waits for their decision.';
        }
      }
      log(b, me, 'cargo checklist saved', {
        count: v.chk.count,
        expected: mc(b),
        itemsChecked: v.chk.items.filter(Boolean).length + '/' + v.items.length,
        seal: v.chk.seal || null,
        photo: !!v.chk.photo,
        complete: v.chk.done,
      });
      return need.length
        ? no('Saved. Still needed: ' + need.join('; ') + '.', { saved: true })
        : ok({ warn });
    },
    vDriverConfirm(me, p) {
      const b = find(p.id);
      if (!isDrv(me, b)) return no(D_ERR);
      const e = stage(b);
      if (e) return no(e);
      const v = vv(b);
      if (!v.pinOk) return no('Verify the Start PIN first.');
      if (!(v.plate && v.plate.match)) return no('Vehicle plate is not verified.');
      if (!(v.chk && v.chk.done)) return no('Complete and save the cargo checklist first.');
      v.dconf = { t: now(), by: actorId(me, b), vehicle: v.plate.vehicle };
      log(b, me, 'driver confirmation', { vehicle: v.plate.vehicle, plate: v.plate.entered });
      return ok();
    },
    vCustomerConfirm(me, p) {
      const b = find(p.id);
      if (!isCus(me, b)) return no(C_ERR);
      const e = stage(b);
      if (e) return no(e);
      const v = vv(b);
      if (!v.pinOk) return no('The driver has not verified the Start PIN yet.');
      if (!(v.chk && v.chk.done)) return no('The driver has not completed the cargo checklist yet.');
      if (!p.reviewed) return no('Tick the box to confirm you reviewed the checklist.');
      v.cconf = { t: now(), by: me.em };
      log(b, me, 'customer confirmation', null);
      return ok();
    },
    vDisc(me, p) {
      const b = find(p.id);
      if (!isDrv(me, b) && !isCus(me, b))
        return no('Only the customer or the assigned driver can report a discrepancy.');
      const e = stage(b);
      if (e) return no(e);
      const note = str(p.note, 300);
      if (note.length < 5) return no('Describe what you found (at least 5 characters).');
      const ty = ['Missing items', 'Additional items', 'Damaged items', 'Other'].includes(p.type)
          ? p.type
          : 'Other',
        v = vv(b);
      v.disc.push({
        id: 'DS-' + (v.disc.length + 1),
        type: ty,
        note,
        role: role(me, b),
        by: actorId(me, b),
        t: now(),
        status: 'open',
      });
      log(b, me, 'discrepancy reported', { type: ty });
      return ok();
    },
    vResolve(me, p) {
      const b = find(p.id);
      if (!h.isAdmin(me)) return no(A_ERR);
      const x = b && b.ver && b.ver.disc.find(y => y.id == p.disc && y.status == 'open');
      if (!x) return no('Discrepancy not found or already resolved.');
      const res = str(p.res, 300);
      if (res.length < 5) return no('Write the resolution (at least 5 characters).');
      Object.assign(x, { status: 'resolved', res, resBy: me.em, resT: now() });
      if (p.mc !== '' && p.mc != null && Number.isInteger(+p.mc) && +p.mc >= 0 && +p.mc != mc(b)) {
        b.ver.mcOver = +p.mc;
        b.ver.dconf = null;
        b.ver.cconf = null;
      }
      b.ver.log.push({
        t: now(),
        role: 'admin',
        actor: me.em,
        evt: 'discrepancy resolved',
        data: {
          id: x.id,
          resolution: res,
          manifestCount: b.ver.mcOver,
          note: 'No fault or responsibility is assigned by this record.',
        },
      });
      h.au(me.em, 'discrepancy resolved', { bk: b.id, id: x.id });
      return ok();
    },
    vException(me, p) {
      const b = find(p.id);
      if (!h.isAdmin(me)) return no(A_ERR);
      if (!b) return no('Booking not found.');
      const e = stage(b);
      if (e) return no(e);
      const r = str(p.reason, 300);
      if (r.length < 10) return no('Write the reason (at least 10 characters).');
      if (!b.ver || !b.ver.pinOk || !(b.ver.chk && b.ver.chk.done))
        return no(
          'The PIN and the driver checklist must be completed first. An exception only replaces the customer confirmation.'
        );
      b.ver.exc = { by: me.em, reason: r, t: now() };
      b.ver.log.push({
        t: now(),
        role: 'admin',
        actor: me.em,
        evt: 'customer confirmation waived',
        data: { reason: r },
      });
      h.au(me.em, 'customer confirmation waived', { bk: b.id });
      return ok();
    },
    vVehicle(me, p) {
      const b = find(p.id);
      if (!h.isAdmin(me)) return no(A_ERR);
      const r = b && vehRec(b);
      if (!r) return no('No vehicle assigned.');
      if (!['Approved', 'Suspended'].includes(r.v.approval))
        return no('Only an approved or suspended vehicle can be changed here.');
      r.v.approval = r.v.approval == 'Approved' ? 'Suspended' : 'Approved';
      (r.v.hist = r.v.hist || []).push({
        e: r.v.approval,
        t: now(),
        by: me.em,
        note: 'From pre-departure verification',
      });
      vv(b).log.push({
        t: now(),
        role: 'admin',
        actor: me.em,
        evt: 'vehicle approval changed',
        data: { vehicle: r.id, approved: r.v.approval == 'Approved' },
      });
      h.au(me.em, 'vehicle ' + (r.v.approval == 'Approved' ? 'restored' : 'suspended'), {
        vehicle: r.id,
        booking: b.id,
      });
      return ok();
    },
    vAuthorize(me, p) {
      const b = find(p.id);
      if (!isDrv(me, b)) return no(D_ERR);
      const v = vv(b);
      if (v.done || b.st == 'In Transit') return no('Departure was already authorized.');
      if (b.st != 'Items Loaded') return no('The booking is not in Pickup / Loading.');
      const bad = cond(b).filter(x => !x[1]);
      if (bad.length) return no('Cannot authorize yet: ' + bad.map(x => x[0]).join('; ') + '.');
      v.done = true;
      v.auth = {
        t: now(),
        by: actorId(me, b),
        driver: actorId(me, b),
        customer: v.cust,
        vehicle: v.plate.vehicle,
        plate: v.plate.entered,
      };
      h.ev(b, me.em, 'In Transit', 'Departure authorized after pre-departure verification');
      log(b, me, 'departure authorized', {
        status: 'Items Loaded → In Transit',
        vehicle: v.auth.vehicle,
        plate: v.auth.plate,
      });
      h.au(me.em, 'departure authorized', { bk: b.id });
      h.ntf(b.cu, 'Departure authorized', b.id + ' is now In Transit.');
      h.ntfOwner(
        b,
        'Your vehicle is on a trip',
        b.id + ': departed for ' + String(b.dr).split(',')[0] + '. Follow it on your Fleet map.'
      );
      return ok();
    },
    /* ---- Delivery PIN ---- */
    dNewPin(me, p) {
      const b = find(p.id);
      if (!isCus(me, b)) return no(C_ERR);
      const e = dstage(b);
      if (e) return no(e);
      const d = dv0(b);
      if (d.waive) return no('The Delivery PIN was waived by an administrator.');
      const { pin, rec } = newSecret();
      d.pin = rec;
      dlog(b, me, 'delivery PIN issued', { expires: new Date(rec.exp).toISOString() });
      const cu = h.U(b.cu);
      if (cu && cu.ph) h.sim(cu.ph, 'SMS', `ZamMove ${b.id}: your Delivery PIN is ${pin}. Give it only after checking your items, or let the driver scan the QR code in the app.`, b.cu);
      if (cu) h.sim(cu.em, 'Email', `ZamMove ${b.id}: your Delivery PIN is ${pin}. Give it only after checking your items.`, b.cu);
      /* a different recipient gets the PIN by SMS (simulated) so they can confirm delivery themselves */
      if (b.rph) h.sim(b.rph, 'SMS', `ZamMove: ${b.drv} is delivering ${b.id} to you. Give this Delivery PIN only after checking your items: ${pin}`);
      return ok({ pin, recipient: b.rn || '' });
    },
    dDeliver(me, p) {
      const b = find(p.id);
      if (!isDrv(me, b)) return no(D_ERR);
      const e = dstage(b);
      if (e) return no(e);
      const d = dv0(b),
        note = str(p.note, 300);
      if (note.length < 5) return no('Describe the delivery condition (at least 5 characters).');
      if (!d.waive) {
        if (!d.pin) return no('No Delivery PIN has been issued yet. Ask the customer to open Track.');
        /* the customer's QR code carries "ZMD:<booking>:<PIN>" */
        const raw = str(p.input, 60),
          q = /^ZMD:([A-Z0-9-]+):(\d{6})$/i.exec(raw);
        if (q && q[1].toUpperCase() != String(b.id).toUpperCase()) return no('That QR code is for another booking.');
        const bad = checkPin(b, me, d.pin, q ? q[2] : raw.slice(0, 6), 'Delivery PIN', dlog);
        if (bad) return bad;
        d.pin.used = true;
      }
      const via = d.waive ? 'admin waiver' : 'delivery PIN',
        t = now();
      d.ok = { t, by: actorId(me, b), via };
      b.pod = { t, by: actorId(me, b), driver: b.drvUser, note, photo: img(p.photo), via };
      h.ev(b, me.em, 'Delivery Confirmation', 'Delivery documented (' + via + '): ' + note);
      dlog(b, me, 'delivery confirmed', { via });
      h.ntf(b.cu, 'Delivery confirmed', b.id + ' was delivered. Please check your items.');
      return ok();
    },
    dWaive(me, p) {
      const b = find(p.id);
      if (!h.isAdmin(me)) return no(A_ERR);
      if (!b) return no('Booking not found.');
      const e = dstage(b);
      if (e) return no(e);
      const r = str(p.reason, 300);
      if (r.length < 10) return no('Write the reason (at least 10 characters).');
      const d = dv0(b);
      if (d.waive) return no('The Delivery PIN was already waived.');
      d.waive = { by: me.em, reason: r, t: now() };
      dlog(b, me, 'delivery PIN waived', { reason: r });
      return ok();
    },
  };
};
