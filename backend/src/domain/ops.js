'use strict';
/* Operations tools:
   - vehicle owner: report a driver, see earnings (computed in helpers.splitOf / ownerBal)
   - cashier: pay owners, flag users (unremitted money or other violations), resolve flags
   - administrator: suspend / reactivate accounts, revoke driver or owner roles
   Every action is written to the audit log; the affected person is notified. */
const { now, r2, rid, str, ok, no, peso } = require('../util');

const OWNER_REPORT = [
  'Reckless driving',
  'Vehicle damage',
  'Unremitted collections',
  'Misconduct',
  'Unauthorized use',
  'Other',
];
const FLAG_KINDS = ['Unremitted money', 'Payment discrepancy', 'Fraud suspicion', 'Other violation'];

module.exports = (S, h) => {
  const U = em => h.U(str(em, 120).toLowerCase());
  const admins = (head, body) => h.staffEms().forEach(em => h.ntf(em, head, body));
  return {
    /* owner: report a driver who drives (or drove) one of his vehicles; goes to the admin's incident cases */
    ownerReport(me, p) {
      if (!h.okr(me, 'owner') || !h.acct(me))
        return no('Only an approved vehicle owner can report a driver.');
      const dr = U(p.driver);
      const mine = S.vh.filter(v => v.owner == me.em).map(v => v.id);
      if (!dr || !S.asg.some(a => a.driver == dr.em && mine.includes(a.vehicle)))
        return no('You can only report drivers who drive or drove one of your vehicles.');
      const cat = OWNER_REPORT.includes(p.cat) ? p.cat : '';
      if (!cat) return no('Choose what happened.');
      const sev = ['Low', 'Medium', 'High'].includes(p.sev) ? p.sev : 'Medium';
      const d = str(p.d, 1000);
      if (d.length < 10) return no('Describe what happened (10+ characters).');
      const bid = str(p.bid, 20);
      if (bid && !S.bk.some(b => b.id == bid && b.drvUser == dr.em && mine.includes(b.veh)))
        return no('That booking was not driven by this driver on your vehicle.');
      const c = {
        id: rid('IN'),
        by: me.em,
        kind: 'owner-report',
        driver: dr.em,
        bid,
        cat,
        sev,
        w: now().slice(0, 16),
        d,
        st: 'Submitted',
        t: now(),
        log: [],
      };
      S.inc.push(c);
      h.au(me.em, 'driver reported by owner', { id: c.id, driver: dr.em, sev });
      admins(
        (sev == 'High' ? 'High severity: ' : '') + 'Owner reported a driver',
        `${c.id}: ${me.name} reported ${dr.name} (${cat}).`
      );
      return ok({ id: c.id });
    },

    /* cashier: record money paid out to a vehicle owner from his earned share */
    ownerPayout(me, p) {
      if (!h.canCash(me)) return no('Only a cashier or administrator can record owner payouts.');
      const o = U(p.owner);
      if (!o || !h.okr(o, 'owner')) return no('Choose a vehicle owner.');
      if (o.em == me.em) return no('You cannot record a payout to yourself.');
      const amt = r2(p.amount),
        bal = h.ownerBal(o.em);
      if (!(amt > 0)) return no('Enter the amount paid.');
      if (amt > bal.due + 0.005)
        return no(
          'That is more than the owner’s payable balance (' +
            peso(bal.due) +
            ').' +
            (bal.waiting ? ' ' + peso(bal.waiting) + ' more becomes payable when the drivers’ remittances are verified.' : '')
        );
      const method = p.method == 'Cash' ? 'Cash' : 'GCash',
        ref = str(p.ref, 30);
      if (method == 'GCash' && !/^\d{10,13}$/.test(ref))
        return no('Enter the GCash reference number (10–13 digits).');
      const x = h.payMk({
        bid: '',
        kind: 'owner_payout',
        method,
        amount: amt,
        ref: ref || rid('CSH'),
        payer: me.em,
        status: 'Verified',
      });
      Object.assign(x, { to: o.em, by: me.em, vby: me.em, vt: now(), note: str(p.note, 200) });
      S.pay.push(x);
      h.au(me.em, 'owner payout', { owner: o.em, amount: amt, method });
      h.ntf(
        o.em,
        'Payout sent',
        `${peso(amt)} was paid to you by ${method}${ref ? ' (ref ' + ref + ')' : ''}.`
      );
      return ok();
    },

    /* cashier or admin: flag a user for unremitted money or another violation */
    userFlag(me, p) {
      if (!h.canCash(me)) return no('Only a cashier or administrator can flag users.');
      const u = U(p.em);
      if (!u) return no('User not found.');
      if (u.em == me.em) return no('You cannot flag yourself.');
      const kind = FLAG_KINDS.includes(p.kind) ? p.kind : '';
      if (!kind) return no('Choose the reason for the flag.');
      const note = str(p.note, 500);
      if (note.length < 10) return no('Explain the flag (10+ characters), e.g. the week and amount.');
      if ((u.flags || []).some(f => f.open && f.kind == kind))
        return no('This user already has an open flag of that kind.');
      const f = {
        id: rid('FL'),
        kind,
        note,
        by: me.em,
        t: now(),
        open: true,
        amt: r2(p.amt || 0) || undefined,
      };
      (u.flags = u.flags || []).push(f);
      h.au(me.em, 'user flagged', { user: u.em, kind });
      h.ntf(u.em, 'Your account was flagged', `${kind}: ${note} Contact the ZamMove cashier to settle it.`);
      admins('User flagged', `${u.name} (${u.em}) was flagged by ${me.name}: ${kind}.`);
      return ok({ id: f.id });
    },
    flagResolve(me, p) {
      if (!h.canCash(me)) return no('Only a cashier or administrator can resolve flags.');
      const u = U(p.em),
        f = u && (u.flags || []).find(x => x.id == p.id && x.open);
      if (!f) return no('Open flag not found.');
      const note = str(p.note, 300);
      if (note.length < 5) return no('Write how it was resolved.');
      Object.assign(f, { open: false, rnote: note, rby: me.em, rt: now() });
      h.au(me.em, 'flag resolved', { user: u.em, id: f.id });
      h.ntf(u.em, 'Flag resolved', `${f.kind}: ${note}`);
      return ok();
    },

    /* administrator: suspend or reactivate an account (a suspended user is logged out and cannot log in) */
    userStatus(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can suspend or reactivate accounts.');
      const u = U(p.em);
      if (!u) return no('User not found.');
      if (u.em == me.em) return no('You cannot change your own account status.');
      if (u.adm == 'super') return no('The owner administrator cannot be suspended.');
      const reason = str(p.reason, 300);
      if (reason.length < 5) return no('Write the reason (the user will see it).');
      if (p.status == 'suspended') {
        if (u.status == 'suspended') return no('This account is already suspended.');
        if (S.bk.some(b => b.drvUser == u.em && !h.done(b) && b.st != 'Pending' && b.st != 'Accepted'))
          return no('This driver has a trip in progress. Suspend the account after the trip.');
        u.status = 'suspended';
        u.susp = { reason, by: me.em, t: now() };
        u.tv = (u.tv || 0) + 1; // ends every session
        if (S.dp[u.em]) S.dp[u.em].avail = 'Unavailable';
      } else {
        if (u.status != 'suspended') return no('This account is not suspended.');
        delete u.status;
        u.susp = { ...(u.susp || {}), lifted: now(), liftedBy: me.em, liftReason: reason };
      }
      h.au(me.em, 'account ' + (p.status == 'suspended' ? 'suspended' : 'reactivated'), {
        user: u.em,
        reason,
      });
      h.ntf(u.em, p.status == 'suspended' ? 'Account suspended' : 'Account reactivated', reason);
      return ok();
    },

    /* administrator: take away an approved driver or vehicle-owner role */
    roleRevoke(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can revoke roles.');
      const u = U(p.em),
        role = ['driver', 'owner'].includes(p.role) ? p.role : '';
      if (!u || !role) return no('Choose a user and a role.');
      const r = (u.roles || []).find(x => x.t == role && x.st == 'approved');
      if (!r) return no('This user does not have an approved ' + role + ' role.');
      const reason = str(p.reason, 300);
      if (reason.length < 5) return no('Write the reason (the user will see it).');
      if (role == 'driver' && S.bk.some(b => b.drvUser == u.em && !h.done(b) && b.st != 'Pending'))
        return no('This driver has an accepted or active booking. Reassign it first.');
      Object.assign(r, { st: 'revoked', revokedBy: me.em, revokedAt: now(), reason });
      if (role == 'driver')
        S.asg.forEach(a => {
          if (
            a.driver == u.em &&
            ['Active', 'Awaiting Driver', 'Awaiting Agreement', 'Pending Activation'].includes(a.st)
          ) {
            a.st = a.st == 'Active' ? 'Ended' : 'Cancelled';
            a.hist.push({ st: a.st, t: now(), by: me.em, note: 'Driver role revoked: ' + reason });
          }
        });
      if (role == 'owner') S.vh.filter(v => v.owner == u.em && v.rent).forEach(v => (v.rent.on = false));
      h.au(me.em, 'role revoked', { user: u.em, role, reason });
      h.ntf(
        u.em,
        'Role removed',
        `Your ${role == 'owner' ? 'vehicle owner' : 'driver'} role was removed: ${reason}`
      );
      return ok();
    },
  };
};
module.exports.OWNER_REPORT = OWNER_REPORT;
module.exports.FLAG_KINDS = FLAG_KINDS;
