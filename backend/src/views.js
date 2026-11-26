'use strict';
const { CALL_OUT } = require('./domain/incidents');
/* Role-scoped read model. The browser only ever receives what the logged-in user may see.
   Password hashes, reset codes, token versions and PIN/QR secrets never leave the server. */

const C = require('./domain/constants');

module.exports = (S, h) => {
  const stripPin = p => (p ? { exp: p.exp, att: p.att, lock: p.lock, used: p.used } : p);
  /* chat messages never travel with the state (GET /api/chat serves them to members and staff) */
  const noChat = x => {
    if (!x || !x.chat) return x;
    const { chat, ...rest } = x;
    return rest;
  };
  const cleanBk = b0 => {
    const b = noChat(b0);
    return {
    ...b,
    split: h.splitOf(b),
    ver: b.ver ? { ...b.ver, pin: stripPin(b.ver.pin), qr: null } : b.ver,
    dver: b.dver ? { ...b.dver, pin: stripPin(b.dver.pin) } : b.dver,
    };
  };
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
    const vo = b.flow == 'owner' && h.U((h.vOf(b.veh) || {}).owner);
    if (vo && vo.gcash) x.payTo = { name: vo.gcash.name, no: vo.gcash.no }; // GCash goes to the vehicle owner
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
    disc: b.disc || 0,
    ...(b.odisc ? { odisc: b.odisc } : {}),
    ...(b.grp ? { grp: b.grp } : {}),
    ...(b.pkg ? { pkg: b.pkg } : {}),
    ...(b.pkgOf ? { pkgOf: b.pkgOf } : {}),
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
  /* what a person involved in an incident case may see: status, the request to them, the decision,
     and their own statement and evidence; never the staff's call log, internal notes or others' statements */
  const partyCase = (c, em) => {
    if (c.kind == 'change') return c;
    const { calls, stmts, evid, log, ask, ...rest } = c,
      asked = (ask || []).includes(em);
    return {
      ...rest,
      ask: asked ? [em] : [], // an evidence request is shown only to the people asked
      parties: h.caseParties(c).map(x => ({ em: x.em, role: x.role })),
      log: (log || [])
        .filter(l => !['note', 'call', 'statement'].includes(l.act))
        .map(l => ({ t: l.t, act: l.act, note: l.act == 'decide' || (l.act == 'evidence' && asked) ? l.note : '' })),
      stmts: stmts && stmts[em] ? { [em]: stmts[em] } : {},
      evid: (evid || []).filter(x => x.by == em),
    };
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
      ...(u.gcash ? { gcash: u.gcash } : {}), // an owner's GCash for rental payments (meant to be shared with renters)
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
  /* handover codes never leave the server (the renter gets theirs once, from hoIssue) */
  const noCodes = r => {
    if (!r.ho) return r;
    const ho = {};
    for (const [k, o] of Object.entries(r.ho)) ho[k] = { ...o, pin: o.pin ? stripPin(o.pin) : o.pin };
    return { ...r, ho, vplate: (h.vOf(r.veh) || {}).plate || '' };
  };
  const liveRn = r0 => {
    const r = noCodes(noChat(r0));
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
        drvDay: +v.rent.drv || 0, // offered with a driver at this extra rate per day (0 = self-drive only)
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
      cat: h.cat ? h.cat() : null, // the admin catalog: brands → models, fuels, colours, transmissions
      fuel: S.cfg.fuel || null,
      fuelK: h.fuelK ? h.fuelK() : 1,
    },
    /* operational hauling vehicles for booking preferences (no emails: drivers by pseudonymous key) */
    haulList: S.vh
      .filter(v => h.vOper(v) && !(C.VT.find(t => t.id == v.type) || {}).rentOnly)
      .map(v => {
        const a = S.asg.find(x => x.vehicle == v.id && x.st == 'Active'),
          d = a && h.U(a.driver);
        const o = h.U(v.owner) || {},
          at = (d && d.loc) || o.loc || C.coord(String((d && d.ad) || o.ad || '')), // barangay-level only (rounded)
          near = at ? [Math.round(at[0] * 100) / 100, Math.round(at[1] * 100) / 100] : null;
        return { type: v.type, brand: v.brand, model: v.model, color: v.color, seats: v.seats, fuel: v.fuel, drv: d ? d.name : '', dk: d && h.pkey ? h.pkey(d.em) : '', near };
      }),
    fleet: {
      HV: h.rates(),
      RV: C.RV,
      RT: C.RT,
      TYPE_INFO: C.TYPE_INFO,
      DEP: C.DEP,
      DEP_MAX: C.DEP_MAX,
      HANDOVER_PH: C.HANDOVER_PH,
      RET_CHECK_H: C.RET_CHECK_H,
      CLAIM_DAYS: C.CLAIM_DAYS,
    },
    rentList: rentList(), // the vehicle catalogue the screens show (server is the source)
    /* how many vehicles of each hauling type can take a job now (approved, with an active, approved driver) */
    typeAvail: Object.fromEntries(C.HV.map(v => [v.id, h.fleetOf(v.id).length])),
    rules: { MOV_MAX: C.MOV_MAX, SIZES: C.SIZES, LATE_MIN: C.LATE_MIN, OPEN_UNTIL_H: C.OPEN_UNTIL_H, CHANGE_H: C.CHANGE_H, IVQ: C.IVQ, CALL_OUT },
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
  const cashOf = em => ({ held: h.cashHeld(em), cap: +S.cfg.cashCap || 5000, overdue: h.overdue(em), credit: h.drvCredit(em), debit: h.drvDebit(em), strikes: ((h.U(em) || {}).strikes || []).length });
  const money = all => ({
    ownerBals: Object.fromEntries(S.users.filter(u => h.okr(u, 'owner')).map(u => [u.em, h.ownerBal(u.em)])),
    ...(all ? { drvCash: Object.fromEntries(S.users.filter(u => h.okr(u, 'driver')).map(u => [u.em, cashOf(u.em)])) } : {}),
  });
  return function viewFor(me) {
    if (!me) return { ...empty, ...base(), haulList: [], ratings: {} }; // visitors: no driver names or emails
    const em = me.em,
      nt = S.nt.filter(n => n.to == em && !n.sim); // simulated SMS/email are not in-app notifications
    if (h.isAdmin(me)) {
      return {
        ...base(),
        users: S.users.map(u => (u.em == em ? selfUser(u) : staffUser(u))),
        bk: S.bk.map(cleanBk),
        rn: S.rn.map(liveRn),
        fuelReqs: S.cfg.fuelReqs || [],
        pay: S.pay,
        inc: S.inc.filter(c => c.st != 'Unconfirmed' && !(c.wd && c.wd.draft)), // unsent and dismissed drafts are private to their reporter
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
      else if (isDrv && b.st == 'Pending' && !b.drvUser && (!b.pkgOf || b.released)) bk.set(b.id, openBk(b, em));
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
    const rnMine = S.rn.filter(r => r.cu == em || (r.veh && ownVeh.has(r.veh)) || (r.withDrv && r.withDrv.em == em));
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
    /* owners see only their own drivers and the people who applied to drive for them */
    if (isOwn) S.users.filter(u => h.okr(u, 'driver') && h.driverOwner(u.em) == em).forEach(u => users.add(u.em));
    if (isOwn) S.apps.filter(a => a.employer == em).forEach(a => users.add(a.user));
    const ids = new Set([...S.bk.filter(b => b.cu == em).map(b => b.id), ...rnMine.map(r => r.id)]);
    const drvIds = new Set(S.bk.filter(b => b.drvUser == em || (b.veh && ownVeh.has(b.veh))).map(b => b.id));
    const dp = {};
    [...users].forEach(u => {
      if (S.dp[u] && (u == em || isOwn)) dp[u] = S.dp[u];
    });
    const R = h.ratings();
    return {
      ...base(),
      ratings: isSub || isCash ? R : Object.fromEntries(Object.entries(R).filter(([k]) => k == em || users.has(k))),
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
      inc: S.inc
        .filter(c => (c.st != 'Unconfirmed' && !(c.wd && c.wd.draft)) || c.by == em) // drafts and dismissed drafts stay with their reporter
        .filter(c => c.by == em || isSub || (c.kind == 'change' && c.driver == em) || (c.kind != 'change' && h.caseParties(c).some(x => x.em == em)))
        .map(c => (isSub ? c : partyCase(c, em))), // people involved see their case, not the staff's calls, notes or others' statements
      rev: S.rev.filter(r => r.by == em || drvIds.has(r.bid)),
      nt,
      apps: S.apps.filter(a => a.user == em || (isOwn && a.employer == em)).map(({ ivr, ...a }) => a), // interview notes stay with the staff
      /* applying drivers choose an owner (by pseudonymous key); drivers name helpers from their owner's crew */
      owners: S.users.filter(u => h.okr(u, 'owner') && h.acct(u) && u.em != em).map(u => ({ k: h.pkey(u.em), name: u.name, ad: String(u.ad || '').split(',')[0], vehicles: S.vh.filter(v => v.owner == u.em && v.approval == 'Approved').length })),
      crew: isDrv ? h.crewOf(h.driverOwner(em)) : isOwn ? h.crewOf(em) : [],
      ...(isDrv ? { turn: h.turnInfo(em) } : {}),
      ...(isOwn ? { drvBal: h.ownerDrivers(em).map(d => ({ em: d, name: (h.U(d) || {}).name || '', bal: h.turnBal(d, em), pending: h.turnPending(d, em), overdue: h.turnOverdue(d) })) } : {}),
      undo: h.undoables(em), // what this person can still undo (5 minutes)
      chats: h.chatThreads(em), // conversations: who, unread count, last message (not the messages)
      myDrivers: isOwn ? S.users.filter(u => h.okr(u, 'driver') && h.driverOwner(u.em) == em).map(u => u.em) : [],
      vh: S.vh.filter(v => vh.has(v.id)).map(v => (ownVeh.has(v.id) ? v : pubVeh(v))),
      asg,
      dp,
      rem: S.rem.filter(r => r.drv == em || isCash),
      au: [],
      ...(isOwn ? { ownerBal: h.ownerBal(em), fuelReqs: (S.cfg.fuelReqs || []).filter(x => x.by == em) } : {}),
      ...(isDrv ? { cash: cashOf(em) } : {}),
      ...(isCash ? money(false) : {}),
    };
  };
};
