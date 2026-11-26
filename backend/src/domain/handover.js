'use strict';
/**
 * handover.js — checking a rental vehicle in and out, like the pre-departure check on bookings.
 * Rentals made from now on carry `hv: 1`; older ones keep the plain owner "Release" / "Return".
 *
 * Pickup (stage 'out'), self-drive:
 *   1. both phones share their location (hoLoc) — farther than HO_FAR_KM from the pickup point needs the owner's reason
 *   2. the renter shows a Release code (hoIssue: 6-digit PIN + QR, also by SMS/email); the owner scans or types it (hoVerify)
 *   3. the renter confirms the plate of the vehicle in front of them (hoPlate)
 *   4. the owner records odometer, fuel, 6 photos and condition (rentalDecision act 'release' → h.hoRelease)
 *   5. the renter confirms that record (hoConfirm) → the rental is Active
 * With a driver: the owner's driver meets the renter, scans the code, the renter confirms the plate, the driver starts it.
 *
 * Return (stage 'back'): the renter shows a Return code and the owner (or the driver) scans it — the renter's proof of
 * when and where the vehicle was received. The owner's return check (match / difference) then runs as before.
 * When the renter cannot show it (abandoned vehicle, lost phone) the owner gives a reason; the renter is told.
 */
const C = require('./constants');
const { now, str, ok, no, sha256, randHex } = require('../util');

const pin6 = () => String(Math.floor(100000 + Math.random() * 900000));
const plateKey = x =>
  String(x || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

module.exports = (S, h) => {
  const find = id => S.rn.find(x => x.id == id);
  const ho = (r, stage) => ((r.ho = r.ho || {})[stage] = r.ho[stage] || {});
  const isCu = (me, r) => !!r && r.cu == me.em;
  /* the owner's side at a handover: the owner, or the driver named on a with-driver rental */
  const isSide = (me, r) => !!r && (r.owner == me.em || (!!r.withDrv && r.withDrv.em == me.em));
  const stageOf = p => (p.stage == 'back' ? 'back' : 'out');
  const where = (r, stage) => (stage == 'out' ? r.pu : r.rt || r.pu);
  /* can this stage be worked on now? */
  const openErr = (r, stage) => {
    if (!r) return 'Rental not found.';
    if (!r.hv) return 'This rental uses the owner’s release and return records.';
    if (stage == 'out') {
      if (r.st != 'Approved') return r.st == 'Active' ? 'The vehicle was already handed over.' : 'The rental is not approved yet.';
      if (!h.rnReady(r)) return 'The handover opens once the rental is fully paid and the contract is signed by both of you.';
      const t0 = h.rnPickupMs(r);
      if (Date.now() < t0 - C.HO_EARLY_H * 36e5) return `The handover check opens ${C.HO_EARLY_H} hours before the pickup time (${r.s} ${r.pt || C.RN_PICKUP_TM}).`;
      return '';
    }
    if (r.st != 'Active') return 'The vehicle is not on rent.';
    return '';
  };
  /* what is wrong with the two phones' locations, as plain sentences */
  h.hoIssues = (r, stage) => {
    const o = (r.ho || {})[stage] || {},
      L = o.loc || {},
      place = stage == 'out' ? 'pickup point' : 'return point',
      side = r.withDrv ? 'driver' : 'owner',
      out = [];
    if (r.withDrv && stage == 'back') return out; // a driven rental ends wherever the renter is dropped off
    for (const [k, who] of [
      ['cu', 'renter'],
      ['ow', side],
    ]) {
      const x = L[k];
      if (!x) out.push(`No location from the ${who}`);
      else if (x.km != null && x.km > C.HO_FAR_KM) out.push(`The ${who} is ${x.km} km from the ${place}`);
    }
    return out;
  };
  /* rentals.js release (stage 'out'): the owner's record, or the driver starting a driven rental */
  h.hoRelease = (r, me, p, note, go) => {
    const o = ho(r, 'out');
    if (!o.pinOk) return no('Scan or type the renter’s Release code first.');
    if (!o.plate) return no('The renter has not confirmed the plate of the vehicle yet.');
    const iss = h.hoIssues(r, 'out'),
      far = str(p.far, 300);
    if (iss.length && far.length < 5) return no(iss.join('. ') + '. Give a reason to continue (at least 5 characters).', { far: iss });
    if (iss.length) o.far = { why: far, iss, t: now(), by: me.em };
    if (r.withDrv) {
      const got = p.odo !== '' && p.odo != null ? h.rnReadings(p) : null;
      r.out = { ...(got && !got.err ? got : { t: now() }), cond: note || 'Handed over by the driver', by: me.em, cu: { ok: true, note: 'Code and plate confirmed by the renter', t: now() } };
      return go('Active', 'Your rental has started. Your driver drives for you until ' + r.e + ' ' + (r.rtm || C.RN_RETURN_TM) + '.');
    }
    const got = h.rnReadings(p);
    if (got.err) return no(got.err);
    o.rec = { ...got, cond: note || 'No issues noted', by: me.em };
    h.au(me.em, 'rental handover recorded', { id: r.id });
    h.ntf(r.cu, 'Rental ' + r.id, 'The owner recorded the odometer, fuel and photos. Check them under My rentals and confirm to start your rental.');
    return ok({ wait: true });
  };
  /* rentals.js return: the owner (or driver) needs the renter's Return code, or a reason why there is none */
  h.hoReturnGate = (r, me, p) => {
    if (!r.hv) return null;
    const b = ho(r, 'back');
    if (!b.pinOk) {
      const why = str(p.nocode, 300);
      if (why.length < 10)
        return no('Scan the renter’s Return code to confirm you received the vehicle, or explain why the renter could not show it (at least 10 characters).', { code: true });
      b.nocode = { why, t: now(), by: me.em };
      h.ntf(r.cu, 'Rental ' + r.id, `The owner recorded the return without your Return code: “${why}”. If this is wrong, report it under My rentals.`);
      h.au(me.em, 'rental return without code', { id: r.id, why });
    }
    const iss = h.hoIssues(r, 'back'),
      far = str(p.far, 300);
    if (b.pinOk && iss.length && far.length < 5) return no(iss.join('. ') + '. Give a reason to continue (at least 5 characters).', { far: iss });
    if (b.pinOk && iss.length) b.far = { why: far, iss, t: now(), by: me.em };
    return null;
  };

  return {
    /* either side shares where their phone is at the handover or return */
    hoLoc(me, p) {
      const r = find(p.id),
        stage = stageOf(p),
        e = openErr(r, stage);
      if (e) return no(e);
      if (!isCu(me, r) && !isSide(me, r)) return no('Only the renter and the owner (or the rental’s driver) take part in the handover.');
      const la = +(p.loc || {}).lat,
        lo = +(p.loc || {}).lng;
      if (!(p.loc && p.loc.lat != null && la >= -90 && la <= 90 && lo >= -180 && lo <= 180) || (la == 0 && lo == 0)) return no('Your phone did not give a location. Turn on location and try again.');
      const km = C.kmFrom(where(r, stage), la, lo),
        k = isCu(me, r) ? 'cu' : 'ow',
        o = ho(r, stage);
      (o.loc = o.loc || {})[k] = { lat: la, lng: lo, acc: Math.max(0, Math.min(5000, Math.round(+p.loc.acc || 0))), km: km == null ? null : Math.round(km * 100) / 100, t: now() };
      return ok({ km: o.loc[k].km });
    },
    /* renter: a fresh 6-digit code (30 minutes) for the owner or driver to scan */
    hoIssue(me, p) {
      const r = find(p.id),
        stage = stageOf(p),
        e = openErr(r, stage);
      if (e) return no(e);
      if (!isCu(me, r)) return no('Only the renter can show this code.');
      const o = ho(r, stage);
      if (o.pinOk) return no('Your code was already confirmed.');
      const pin = pin6(),
        s = randHex(8);
      o.pin = { h: sha256(s + pin), s, exp: Date.now() + C.PIN_TTL, used: false, att: 0, lock: (o.pin || {}).lock || 0 };
      const label = stage == 'out' ? 'Release code' : 'Return code',
        txt = `ZamMove ${r.id}: your ${label} is ${pin}. Show it to the ${r.withDrv ? 'driver' : 'owner'} ${stage == 'out' ? 'when you receive the vehicle' : 'when you hand the vehicle back'}. Never share it before that.`;
      if (me.ph) h.sim(me.ph, 'SMS', txt, me.em);
      h.sim(me.em, 'Email', txt, me.em);
      return ok({ pin, qr: `ZMR1.${r.id}.${stage}.${pin}`, exp: o.pin.exp });
    },
    /* owner or driver: type the PIN or scan the QR the renter shows */
    hoVerify(me, p) {
      const r = find(p.id),
        stage = stageOf(p),
        e = openErr(r, stage);
      if (e) return no(e);
      if (!isSide(me, r)) return no(r.withDrv ? 'Only the owner or the rental’s driver can check this code.' : 'Only the vehicle owner can check this code.');
      const o = ho(r, stage),
        pn = o.pin;
      if (o.pinOk) return no('Already confirmed.');
      if (!pn) return no('The renter has not opened their code yet. Ask them to open My rentals → Show my code.');
      let t = str(p.input, 120);
      if (/^ZMR1\./.test(t)) {
        const m = t.split('.');
        if (m.length != 4 || m[1] != r.id || m[2] != stage) return no('That QR code is for a different rental or step.');
        t = m[3];
      }
      if (Date.now() < pn.lock) return no('Too many wrong attempts. Try again in ' + Math.ceil((pn.lock - Date.now()) / 6e4) + ' min.');
      if (Date.now() > pn.exp) return no('This code has expired. Ask the renter to open a new one.', { expired: true });
      if (!/^\d{6}$/.test(t) || sha256(pn.s + t) != pn.h) {
        pn.att++;
        if (pn.att >= C.MAX_TRY) {
          pn.lock = Date.now() + C.LOCK;
          pn.att = 0;
          h.ntf(r.cu, 'Rental ' + r.id, 'Someone entered your rental code wrong ' + C.MAX_TRY + ' times. It is locked for 5 minutes. If this was not your owner or driver, report it.');
          h.au(me.em, 'rental code locked', { id: r.id, stage });
          return no('Too many wrong attempts. Locked for 5 minutes.');
        }
        return no('That code is not correct.');
      }
      pn.used = true;
      o.pinOk = { t: now(), by: me.em, via: p.kind == 'qr' ? 'qr' : 'pin' };
      h.au(me.em, 'rental code confirmed', { id: r.id, stage });
      h.ntf(
        r.cu,
        'Rental ' + r.id,
        stage == 'out' ? 'Your Release code was confirmed. Now confirm the plate of the vehicle you are receiving.' : `The ${r.withDrv ? 'driver' : 'owner'} confirmed receiving the vehicle at ${new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}. Keep this as your proof of return.`
      );
      return ok();
    },
    /* renter: type the plate of the vehicle in front of you — catches being handed the wrong unit */
    hoPlate(me, p) {
      const r = find(p.id),
        e = openErr(r, 'out');
      if (e) return no(e);
      if (!isCu(me, r)) return no('Only the renter confirms the plate.');
      const o = ho(r, 'out');
      if (!o.pinOk) return no('Show your Release code to the ' + (r.withDrv ? 'driver' : 'owner') + ' first.');
      if (o.plate) return no('Already confirmed.');
      const v = h.vOf(r.veh) || {},
        got = plateKey(p.plate);
      if (!got) return no('Type the plate number you see on the vehicle.');
      if (got != plateKey(v.plate)) {
        o.plateTry = (o.plateTry || 0) + 1;
        if (o.plateTry == 2) {
          h.ntf(r.owner, 'Rental ' + r.id, 'The renter typed a plate that does not match the rented vehicle twice. Check that you are handing over the right unit.');
          h.staffEms().forEach(em => h.ntf(em, 'Rental plate mismatch', `${r.id}: the renter reports a different plate (${str(p.plate, 20)}) at pickup.`));
        }
        return no('That plate does not match the vehicle you rented. Check the plate on the vehicle; do not drive away in a different unit.');
      }
      o.plate = { t: now() };
      h.au(me.em, 'rental plate confirmed', { id: r.id });
      return ok();
    },
    /* renter: agree with the owner's odometer, fuel and photos (or note a difference) — the rental starts */
    hoConfirm(me, p) {
      const r = find(p.id),
        e = openErr(r, 'out');
      if (e) return no(e);
      if (!isCu(me, r)) return no('Only the renter confirms the handover.');
      const o = ho(r, 'out');
      if (r.withDrv) return no('Your driver starts the rental.');
      if (!o.rec) return no('The owner has not recorded the odometer, fuel and photos yet.');
      const note = str(p.note, 500);
      if (p.ok === false && note.length < 5) return no('Describe what is different (at least 5 characters).');
      r.out = { ...o.rec, cu: { ok: p.ok !== false, note, t: now() } };
      r.st = 'Active';
      (r.hist = r.hist || []).push({ st: 'Active', t: now(), by: me.em, note: 'Handover confirmed by both' });
      h.au(me.em, 'rental handover confirmed', { id: r.id, differences: p.ok === false });
      h.ntf(r.owner, 'Rental ' + r.id, 'The renter confirmed the handover and the rental has started.' + (p.ok === false ? ' They noted: ' + note : ''));
      h.ntf(r.cu, 'Rental ' + r.id, `Your rental has started. Keep location sharing on while driving (My rentals → Share location). Return it on ${r.e} by ${r.rtm || C.RN_RETURN_TM}.`);
      return ok();
    },
  };
};
