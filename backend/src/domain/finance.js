'use strict';
/* Cashier work (payment verification, weekly remittances) and administrator settings / staff / reset.
   Amounts are rounded to centavos everywhere. */
const { now, r2, rid, str, ok, no, peso } = require('../util');

module.exports = (S, h) => ({
  payVerify(me, p) {
    if (!h.canCash(me)) return no('Only a cashier or administrator can verify payments.');
    const x = S.pay.find(y => y.id == p.id);
    if (!x || x.status != 'Submitted') return no('Payment not found or already decided.');
    if (x.kind == 'down' || x.kind == 'final')
      return no('Booking payments are confirmed by the driver who collects them.');
    if (x.payer && x.payer == me.em) return no('You cannot verify your own payment.');
    const note = str(p.note, 300);
    if (!p.ok && note.length < 5) return no('Write the reason for rejecting (at least 5 characters).');
    x.status = p.ok ? 'Verified' : 'Rejected';
    x.vby = me.em;
    x.vt = now();
    if (note) x.note = note;
    h.au(me.em, 'payment ' + x.status.toLowerCase(), {
      id: x.id,
      bid: x.bid,
      kind: x.kind,
      amount: x.amount,
    });
    h.ntf(
      x.payer,
      'Payment ' + x.status.toLowerCase(),
      peso(x.amount) + ' for ' + x.bid + (p.ok ? ' was verified.' : ' was rejected: ' + note)
    );
    return ok();
  },
  remit(me, p) {
    const week = str(p.week, 10),
      ref = str(p.ref, 60),
      method = p.method == 'GCash' ? 'GCash' : 'Cash';
    const l = h.remBks(me.em).filter(b => h.wk(b.cd) == week);
    if (!l.length) return no('No unremitted completed trips for that week.');
    if (week >= h.wk(now())) return no('That week has not ended yet.');
    if (!ref) return no('Enter the receipt or reference number.');
    const g = r2(l.reduce((s, b) => s + h.gross(b), 0)),
      r = {
        id: rid('RM'),
        drv: me.em,
        week,
        bks: l.map(b => b.id),
        gross: g,
        drvShare: r2(l.reduce((s, b) => s + h.splitOf(b).drv, 0)),
        due: r2(l.reduce((s, b) => s + h.dueFor(b), 0)), // collected minus the driver's share of each trip
        method,
        ref,
        st: 'Submitted',
        t: now(),
      };
    l.forEach(b => (b.rem = r.id));
    S.rem.push(r);
    h.au(me.em, 'remittance submitted', { id: r.id, due: r.due });
    return ok();
  },
  remitVerify(me, p) {
    if (!h.canCash(me)) return no('Only a cashier or administrator can verify remittances.');
    const r = S.rem.find(x => x.id == p.id);
    if (!r || !['Submitted', 'Discrepancy'].includes(r.st))
      return no('Remittance not available for verification.');
    if (r.drv == me.em) return no('You cannot verify your own remittance.');
    if (p.recv === '' || p.recv == null || !(+p.recv >= 0)) return no('Enter the amount received.');
    const recv = r2(p.recv);
    Object.assign(r, { recv, diff: r2(recv - r.due), by: me.em, vt: now(), note: str(p.note, 300) });
    r.st = r.diff === 0 ? 'Verified' : 'Discrepancy';
    h.au(me.em, 'remittance ' + r.st, { id: r.id, due: r.due, recv });
    h.ntf(
      r.drv,
      'Remittance ' + r.st.toLowerCase(),
      `Week of ${r.week}: received ${peso(recv)} of ${peso(r.due)}.`
    );
    return ok();
  },
  remitResolve(me, p) {
    if (!h.canCash(me)) return no('Only a cashier or administrator can resolve discrepancies.');
    const r = S.rem.find(x => x.id == p.id);
    if (!r || r.st != 'Discrepancy') return no('No open discrepancy.');
    const note = str(p.note, 300);
    if (note.length < 5) return no('Write how the discrepancy was resolved.');
    const a = r2(p.adj);
    if (a < 0) return no('Adjustment cannot be negative.');
    const recv = r2(r.recv + a),
      diff = r2(recv - r.due);
    if (diff < 0 && !h.isAdmin(me))
      return no(
        'A shortfall of ' +
          peso(-diff) +
          ' remains. Record the missing payment, or ask an administrator to resolve it.'
      );
    Object.assign(r, { recv, diff, st: 'Resolved', rnote: note, rby: me.em });
    if (a) r.adj = r2((r.adj || 0) + a);
    h.au(me.em, 'discrepancy resolved', { id: r.id, adj: a, shortfall: Math.min(0, diff) });
    return ok();
  },
  cfgRate(me, p) {
    if (!h.isAdmin(me)) return no('Only an administrator can change settings.');
    const r = Math.round(+p.rate);
    if (!(r >= 1 && r <= 100)) return no('Enter a whole number from 1 to 100.');
    h.au(me.em, 'remittance rate', { from: S.cfg.coShare, to: r });
    S.cfg.coShare = r;
    return ok();
  },
  /* ZamMove commission and the default driver share (used when no driver agreement sets one) */
  cfgSplit(me, p) {
    if (!h.isAdmin(me)) return no('Only an administrator can change settings.');
    const comm = Math.round(+p.comm),
      drv = Math.round(+p.drvPct);
    if (!(comm >= 0 && comm <= 50)) return no('ZamMove commission must be 0% to 50%.');
    if (!(drv >= 5 && drv <= 90)) return no('The default driver share must be 5% to 90%.');
    if (comm + drv > 95)
      return no('Commission and driver share together cannot exceed 95% (the owner needs a share).');
    const top = Math.max(0, ...S.asg.filter(a => a.st == 'Active' && a.terms).map(a => +a.terms.pct));
    if (comm + top > 100)
      return no(
        'An active driver agreement gives the driver ' +
          top +
          '%; the commission can be at most ' +
          (100 - top) +
          '%.'
      );
    h.au(me.em, 'money split', {
      from: { comm: S.cfg.comm, drvPct: S.cfg.drvPct },
      to: { comm, drvPct: drv },
    });
    S.cfg.comm = comm;
    S.cfg.drvPct = drv;
    return ok();
  },
  cfgPend(me, p) {
    if (!h.isAdmin(me)) return no('Only an administrator can change settings.');
    const v = Math.round(+p.min);
    if (!(v >= 5 && v <= 1440)) return no('Enter whole minutes from 5 to 1440.');
    h.au(me.em, 'driver response time', { from: S.cfg.pendMin, to: v });
    S.cfg.pendMin = v;
    return ok();
  },
  reset(me, p) {
    if (!h.isSuper(me)) return no('Only the owner admin can reset prototype data.');
    if (str(p.typed, 10) !== 'RESET') return no('Type RESET (in capitals) to confirm.');
    ['bk', 'rn', 'pay', 'inc', 'rev', 'rem', 'nt'].forEach(k => (S[k] = []));
    h.au(me.em, 'prototype data reset', null);
    return ok();
  },
  staffAdd(me, p) {
    if (!h.isSuper(me)) return no('Only the owner admin can manage staff.');
    const u = h.U(str(p.em, 120).toLowerCase());
    if (!u) return no('No registered account has that email. They must register first.');
    const role = ['admin', 'sub', 'cash'].includes(p.role) ? p.role : 'admin';
    if (role == 'cash' ? u.cash : u.adm) return no('That account already has this role.');
    if (role == 'cash') u.cash = true;
    else u.adm = role;
    h.au(me.em, 'staff appointed', { user: u.em, role });
    h.ntf(
      u.em,
      'Staff access',
      'You were appointed: ' + { admin: 'Administrator', sub: 'Secondary admin', cash: 'Cashier' }[role] + '.'
    );
    return ok();
  },
  staffRevoke(me, p) {
    if (!h.isSuper(me)) return no('Only the owner admin can manage staff.');
    const u = h.U(p.em);
    if (!u || u.adm == 'super') return no('That account cannot be changed.');
    if (p.k == 'cash') delete u.cash;
    else delete u.adm;
    h.au(me.em, 'staff revoked', { user: u.em, role: p.k });
    return ok();
  },
});
