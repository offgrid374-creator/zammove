'use strict';
/* Role-scoped read model. The browser only ever receives what the logged-in user may see.
   Password hashes, reset codes, token versions and PIN/QR secrets never leave the server. */

const C = require('./domain/constants');

module.exports = (S, h) => {
  const stripPin = p => (p ? { exp: p.exp, att: p.att, lock: p.lock, used: p.used } : p);
  const cleanBk = b => ({
    ...b,
    split: h.splitOf(b),
    ver: b.ver ? { ...b.ver, pin: stripPin(b.ver.pin), qr: null } : b.ver,
    dver: b.dver ? { ...b.dver, pin: stripPin(b.dver.pin) } : b.dver,
  });
  const openBk = (b, em) => ({
    id: b.id,
    pu: b.pu,
    dr: b.dr,
    dt: b.dt,
    tm: b.tm,
    it: b.it,
    si: b.si,
    vid: b.vid,
    vn: b.vn,
    mv: b.mv,
    tot: b.tot,
    km: b.km,
    st: b.st,
    cr: b.cr,
    ph: b.ph,
    declined: (b.declined || []).includes(em) ? [em] : [],
    share: (() => {
      const a = h.asgOf(em),
        pct = a && a.terms ? +a.terms.pct : +S.cfg.drvPct || 20,
        mov = (b.bd || [])[2] || 0;
      return { pct, mov, amt: Math.round(Math.max(0, b.tot - ((b.bd || [])[3] || 0) - mov) * pct) / 100 + mov };
    })(),
  });
  /* the customer sees the driver's live position only while the trip is active */
  const customerBk = b => {
    const x = cleanBk(b);
    delete x.split; // the customer sees the fare only
    if (!C.TRACK_ST.includes(b.st)) {
      delete x.gps;
      delete x.trail;
      delete x.wz;
    }
    return x;
  };
  const ownerBk = b => ({
    id: b.id,
    st: b.st,
    dt: b.dt,
    tm: b.tm,
    vid: b.vid,
    vn: b.vn,
    veh: b.veh,
    drvUser: b.drvUser,
    drv: b.drv,
    tot: b.tot,
    km: b.km,
    pu: b.pu,
    dr: b.dr,
    cd: b.cd,
    split: h.splitOf(b),
    /* the owner follows his vehicles during active trips (no trail, no customer details) */
    ...(C.TRACK_ST.includes(b.st) && b.gps
      ? {
          gps: {
            lat: b.gps.lat,
            lng: b.gps.lng,
            t: b.gps.t,
            ms: b.gps.ms,
            off: b.gps.off,
            inArea: b.gps.inArea,
          },
        }
      : {}),
  });
  /* the account's own copy: never the password hash, reset or verification codes (those go to the phone/email) */
  const selfUser = u => {
    const { pw, reset, tv, code, codeT, vatt, ...rest } = u;
    return rest;
  };
  const staffUser = u => {
    const { pw, reset, tv, code, codeT, vatt, ...rest } = u;
    return rest;
  };
  /* public profile: drivers also show completed trips and since when they drive for ZamMove */
  const pubUser = u => {
    const roles = (u.roles || []).filter(r => r.st == 'approved'),
      drv = roles.find(r => r.t == 'driver');
    return {
      name: u.name,
      em: u.em,
      ph: u.ph,
      ...(u.photo ? { photo: u.photo } : {}),
      roles: roles.map(r => ({ t: r.t, st: r.st })),
      ...(u.status ? { status: u.status } : {}),
      ...(drv
        ? {
            trips: S.bk.filter(b => b.drvUser == u.em && b.st == 'Completed').length,
            licExp: (u.dx || {}).lic || '', // verification status only; documents stay with ZamMove
            since: drv.at || u.cr || null,
            /* latest reviews of this driver, without reviewer identities */
            revs: S.rev
              .filter(r => (S.bk.find(b => b.id == r.bid) || {}).drvUser == u.em)
              .slice(-5)
              .reverse()
              .map(r => ({ r: r.r, t: r.t, cr: r.cr })),
          }
        : {}),
    };
  };
  const pubVeh = v => ({
    id: v.id,
    owner: v.owner,
    type: v.type,
    brand: v.brand,
    model: v.model,
    plate: v.plate,
    color: v.color,
    year: v.year,
    cap: v.cap,
    desc: v.desc,
    approval: v.approval,
    status: v.status,
    photo: v.photo || '',
    seats: v.seats,
    trans: v.trans,
    fuel: v.fuel,
  });
  /* public rental catalogue: every rentable unit with the dates it is taken (plate partly hidden until approval) */
  const mask = p => {
    const t = String(p || '');
    return t.length > 4 ? t.slice(0, 3) + ' ••' + t.slice(-2) : '••';
  };
  /* a rental's location is shown only while the vehicle is out (release until return) */
  const liveRn = r => {
    if (r.st == 'Active' || !(r.gps || r.trail)) return r;
    const { gps, trail, ...x } = r;
    return x;
  };
  const rentList = () =>
    S.vh.filter(h.rentable).map(v => {
      const o = h.U(v.owner) || {};
      return {
        id: v.id,
        type: v.type,
        brand: v.brand,
        model: v.model,
        year: v.year,
        color: v.color,
        cap: v.cap,
        seats: v.seats,
        trans: v.trans,
        fuel: v.fuel,
        day: v.rent.day,
        dep: +v.rent.dep || C.DEP,
        desc: v.desc,
        photo: v.photo || '',
        plate: mask(v.plate),
        owner: String(o.name || 'Owner').split(' ')[0],
        busy: [
          ...S.rn.filter(r => r.veh == v.id && C.RBUSY.includes(r.st)).map(r => ({ s: r.s, e: r.e })),
          ...S.bk.filter(b => b.veh == v.id && !h.done(b)).map(b => ({ s: b.dt, e: b.dt })),
        ],
      };
    });
  const base = () => ({
    cfg: {
      coShare: S.cfg.coShare,
      pendMin: S.cfg.pendMin || 30,
      comm: S.cfg.comm == null ? 15 : S.cfg.comm,
      drvPct: S.cfg.drvPct || 20,
      cashCap: +S.cfg.cashCap || 5000,
    },
    fleet: {
      HV: h.rates(),
      RV: C.RV,
      RT: C.RT,
      TYPE_INFO: C.TYPE_INFO,
      DEP: C.DEP,
      DEP_MAX: C.DEP_MAX,
      HANDOVER_PH: C.HANDOVER_PH,
      CLAIM_DAYS: C.CLAIM_DAYS,
    },
    rentList: rentList(), // the vehicle catalogue the screens show (server is the source)
    rules: { MOV_MAX: C.MOV_MAX, SIZES: C.SIZES, LATE_MIN: C.LATE_MIN, OPEN_UNTIL_H: C.OPEN_UNTIL_H },
    ratings: h.ratings(),
    rnAvail: S.rn
      .filter(r => ['Pending', 'Approved', 'Active'].includes(r.st))
      .map(r => ({ vid: r.vid, veh: r.veh, s: r.s, e: r.e })),
  });
  const empty = {
    users: [],
    bk: [],
    rn: [],
    pay: [],
    inc: [],
    rev: [],
    nt: [],
    apps: [],
    vh: [],
    asg: [],
    dp: {},
    rem: [],
    au: [],
  };

  /* balances worked out on the server (they depend on records the user cannot see, e.g. drivers' remittances) */
  const cashOf = em => ({ held: h.cashHeld(em), cap: +S.cfg.cashCap || 5000, overdue: h.overdue(em), credit: h.drvCredit(em), strikes: ((h.U(em) || {}).strikes || []).length });
  const money = all => ({
    ownerBals: Object.fromEntries(S.users.filter(u => h.okr(u, 'owner')).map(u => [u.em, h.ownerBal(u.em)])),
    ...(all ? { drvCash: Object.fromEntries(S.users.filter(u => h.okr(u, 'driver')).map(u => [u.em, cashOf(u.em)])) } : {}),
  });
  return function viewFor(me) {
    if (!me) return { ...empty, ...base() };
    const em = me.em,
      nt = S.nt.filter(n => n.to == em && !n.sim); // simulated SMS/email are not in-app notifications
    if (h.isAdmin(me)) {
      return {
        ...base(),
        users: S.users.map(u => (u.em == em ? selfUser(u) : staffUser(u))),
        bk: S.bk.map(cleanBk),
        rn: S.rn.map(liveRn),
        pay: S.pay,
        inc: S.inc,
        rev: S.rev,
        nt,
        apps: S.apps,
        vh: S.vh,
        asg: S.asg,
        dp: S.dp,
        rem: S.rem,
        au: S.au.slice(-500),
        ...money(true),
      };
    }
    const isDrv = h.okr(me, 'driver'),
      isOwn = h.okr(me, 'owner'),
      isSub = me.adm == 'sub' && h.acct(me),
      isCash = h.canCash(me);
    const ownVeh = new Set(S.vh.filter(v => v.owner == em).map(v => v.id));
    const myAsg = S.asg.filter(a => a.driver == em);
    const bk = new Map(),
      users = new Set([em]),
      vh = new Set(ownVeh);
    for (const b of S.bk) {
      if ((isDrv && b.drvUser == em) || isSub) bk.set(b.id, cleanBk(b));
      else if (b.cu == em) bk.set(b.id, customerBk(b));
      else if (isDrv && b.st == 'Pending' && !b.drvUser) bk.set(b.id, openBk(b, em));
      else if ((isOwn && b.veh && ownVeh.has(b.veh)) || isCash) bk.set(b.id, ownerBk(b));
      else continue;
      if (b.cu == em || b.drvUser == em || isSub) {
        if (b.drvUser) users.add(b.drvUser);
        if (b.cu && b.drvUser == em) users.add(b.cu);
      }
      if (b.veh) vh.add(b.veh);
    }
    myAsg.forEach(a => vh.add(a.vehicle));
    /* rentals: the renter sees the full vehicle and the owner's contact once approved; the owner sees the renter */
    const rnMine = S.rn.filter(r => r.cu == em || (r.veh && ownVeh.has(r.veh)));
    rnMine.forEach(r => {
      if (r.cu == em && r.veh && ['Approved', 'Active', 'Returned'].includes(r.st)) {
        vh.add(r.veh);
        if (r.owner) users.add(r.owner);
      }
      if (r.cu != em) users.add(r.cu);
    });
    const asg = S.asg.filter(a => a.driver == em || ownVeh.has(a.vehicle));
    asg.forEach(a => users.add(a.driver));
    S.vh.filter(v => vh.has(v.id)).forEach(v => users.add(v.owner));
    if (isOwn) S.users.filter(u => h.okr(u, 'driver')).forEach(u => users.add(u.em)); // driver pool
    const ids = new Set([...S.bk.filter(b => b.cu == em).map(b => b.id), ...rnMine.map(r => r.id)]);
    const drvIds = new Set(S.bk.filter(b => b.drvUser == em || (b.veh && ownVeh.has(b.veh))).map(b => b.id));
    const dp = {};
    [...users].forEach(u => {
      if (S.dp[u] && (u == em || isOwn)) dp[u] = S.dp[u];
    });
    return {
      ...base(),
      users: S.users
        .filter(u => u.em == em || users.has(u.em) || isCash || isSub)
        .map(u =>
          u.em == em
            ? selfUser(u)
            : isCash
              ? { ...pubUser(u), flags: u.flags || [], ...(u.status ? { status: u.status } : {}) }
              : pubUser(u)
        ),
      bk: [...bk.values()],
      rn: rnMine.map(liveRn),
      pay: S.pay.filter(p => p.payer == em || p.to == em || ids.has(p.bid) || drvIds.has(p.bid) || isCash), // p.to: payouts to an owner
      inc: S.inc.filter(c => c.by == em || isSub),
      rev: S.rev.filter(r => r.by == em || drvIds.has(r.bid)),
      nt,
      apps: S.apps.filter(a => a.user == em),
      vh: S.vh.filter(v => vh.has(v.id)).map(v => (ownVeh.has(v.id) ? v : pubVeh(v))),
      asg,
      dp,
      rem: S.rem.filter(r => r.drv == em || isCash),
      au: [],
      ...(isOwn ? { ownerBal: h.ownerBal(em) } : {}),
      ...(isDrv ? { cash: cashOf(em) } : {}),
      ...(isCash ? money(false) : {}),
    };
  };
};
