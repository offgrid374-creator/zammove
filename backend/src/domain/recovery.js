'use strict';
/* Recovering from human error.

   Undo (5 minutes): a driver's last trip step, an owner's "Received" / "Not received" on a turnover, an owner's
   confirmation of a rental payment or of GCash to their number, an owner's rental approval and "mark as returned".
   Withdraw: your own pending turnover, fuel price request, owner remittance, or a refund you recorded that the
   renter has not confirmed yet.
   Correct a payment: the driver proposes the right split (GCash / cash / cash handed over) for a recorded booking
   payment, with a reason; the customer approves. Both versions stay in the record.
   Correct a record (administrators): step a trip back, void a wrong payment, reopen a decided dispute, step a
   rental back, or cancel a booking (with an optional refund). A reason is required, everyone involved is told,
   and every correction is in the audit log. */
const { now, r2, rid, str, ok, no, peso } = require('../util');
const UNDO_MS = 5 * 60e3;

module.exports = (S, h) => {
  const fresh = t => !!t && Date.now() - new Date(t).getTime() <= UNDO_MS;
  const STEPS = ['On the Way to Pickup', 'Awaiting Down Payment', 'Items Loaded', 'Arrived at Destination'];
  const lastEv = b => (b.ev || [])[(b.ev || []).length - 1];
  const until = t => new Date(new Date(t).getTime() + UNDO_MS).toISOString();
  /* what this person can still undo */
  h.undoables = em => {
    const L = [];
    S.bk.forEach(b => {
      const e = lastEv(b);
      if (b.drvUser != em || !e || e.by != em || e.to != b.st || !STEPS.includes(e.to) || !fresh(e.t)) return;
      if (e.to == 'Items Loaded' && b.ver && b.ver.pinOk) return;
      if (e.to == 'Awaiting Down Payment' && h.paySum(b.id, 'down') > 0) return;
      L.push({ kind: 'step', id: b.id, label: `${b.id}: “${e.to}”`, until: until(e.t) });
    });
    S.pay.forEach(p => {
      if (p.kind == 'turnover' && p.to == em && ['Verified', 'Rejected'].includes(p.status) && p.vby == em && fresh(p.vt))
        L.push({ kind: 'turnover', id: p.id, label: `${p.status == 'Verified' ? 'Received' : 'Not received'}: turnover ${peso(p.amount)}`, until: until(p.vt) });
      if (['rental', 'deposit'].includes(p.kind) && p.vby == em && p.status == 'Verified' && fresh(p.vt)) {
        const r = S.rn.find(x => x.id == p.bid);
        if (r && ['Approved', 'Cancelled'].includes(r.st) && r.st == 'Approved') L.push({ kind: 'rentpay', id: p.id, label: `Confirmed ${peso(p.amount)} for ${p.bid}`, until: until(p.vt) });
      }
      if (p.oc && p.oc.t && fresh(p.oc.t) && !(p.disp && p.disp.closed)) {
        const b = S.bk.find(x => x.id == p.bid);
        if (b && h.splitOf(b).owner == em) L.push({ kind: 'gcash', id: p.id, label: `GCash ${peso(p.amount)} marked ${p.oc.ok ? 'received' : 'not received'}`, until: until(p.oc.t) });
      }
    });
    S.rn.forEach(r => {
      const e = (r.hist || [])[(r.hist || []).length - 1];
      if (r.owner != em || !e || e.by != em || !fresh(e.t)) return;
      if (r.st == 'Approved' && e.st == 'Approved' && !S.pay.some(p => p.bid == r.id && p.status == 'Verified') && !(r.ct && r.ct.sg && (r.ct.sg.cu || r.ct.sg.ow)))
        L.push({ kind: 'approve', id: r.id, label: `Approved ${r.id}`, until: until(e.t) });
      if (r.st == 'Returned' && e.st == 'Returned' && !r.claim) L.push({ kind: 'return', id: r.id, label: `Marked ${r.id} as returned`, until: until(e.t) });
    });
    return L;
  };
  const tell = (ems, head, body) => [...new Set(ems.filter(Boolean))].forEach(em => h.ntf(em, head, body));

  return {
    undo(me, p) {
      const it = h.undoables(me.em).find(x => x.kind == p.kind && x.id == p.id);
      if (!it) return no('This can no longer be undone (5 minutes passed, or something happened after it).');
      if (p.kind == 'step') {
        const b = S.bk.find(x => x.id == p.id),
          e = lastEv(b);
        b.ev.push({ t: now(), by: me.em, from: b.st, to: e.from, note: `Undone: “${e.to}” was tapped by mistake` });
        b.st = e.from;
        h.ntf(b.cu, 'Booking ' + b.id, `Your driver undid “${e.to}” (tapped by mistake). Status is ${b.st} again.`);
      } else if (p.kind == 'turnover') {
        const x = S.pay.find(y => y.id == p.id);
        Object.assign(x, { status: 'Submitted', vby: null, vt: null, note: x.status == 'Rejected' ? '' : x.note });
        h.ntf(x.payer, 'Turnover', `Your owner undid their answer on the ${peso(x.amount)} turnover; it is waiting again.`);
      } else if (p.kind == 'rentpay') {
        const x = S.pay.find(y => y.id == p.id);
        Object.assign(x, { status: 'Submitted', vby: null, vt: null, coll: null });
        h.ntf(x.payer, 'Rental ' + x.bid, `The owner undid the confirmation of your ${peso(x.amount)} payment; it is waiting again.`);
      } else if (p.kind == 'gcash') {
        const x = S.pay.find(y => y.id == p.id);
        delete x.oc;
        if (x.disp && !x.disp.closed) delete x.disp;
      } else if (p.kind == 'approve') {
        const r = S.rn.find(x => x.id == p.id);
        r.st = 'Pending';
        delete r.ct;
        if (r.withDrv) delete r.withDrv.em;
        r.hist.push({ st: 'Pending', t: now(), by: me.em, note: 'Approval undone (tapped by mistake)' });
        h.ntf(r.cu, 'Rental ' + r.id, 'The owner undid the approval (tapped by mistake). Your request is waiting again; do not pay yet.');
      } else if (p.kind == 'return') {
        const r = S.rn.find(x => x.id == p.id);
        r.st = 'Active';
        delete r.back;
        delete r.late;
        r.hist.push({ st: 'Active', t: now(), by: me.em, note: '“Returned” undone (tapped by mistake)' });
        h.ntf(r.cu, 'Rental ' + r.id, 'The owner undid “returned” to check the vehicle again.');
      }
      h.au(me.em, 'undo ' + p.kind, { id: p.id });
      return ok();
    },
    /* withdraw your own submission before the other side acts on it */
    withdraw(me, p) {
      const id = p.id;
      if (p.kind == 'fuel') {
        const x = (S.cfg.fuelReqs || []).find(y => y.id == id && y.by == me.em);
        if (!x || x.st != 'Pending') return no('There is no pending request to withdraw.');
        x.st = 'Withdrawn';
      } else {
        const x = S.pay.find(y => y.id == id);
        if (!x) return no('Not found.');
        if (['turnover', 'owner_remit'].includes(x.kind) && x.payer == me.em && x.status == 'Submitted') x.status = 'Withdrawn';
        else if (['deposit_refund', 'refund'].includes(x.kind) && x.from == me.em && x.status == 'Sent') Object.assign(x, { status: 'Due', method: '', ref: rid('RF'), sentT: null });
        else return no('This can no longer be withdrawn (the other side already answered).');
        if (x.kind == 'turnover') h.ntf(x.to, 'Turnover withdrawn', `A ${peso(x.amount)} turnover was withdrawn by the driver (entered by mistake).`);
        if (['deposit_refund', 'refund'].includes(x.kind)) h.ntf(x.to, 'Refund record corrected', `The owner withdrew the refund record for ${x.bid} to correct it; it will be recorded again.`);
      }
      h.au(me.em, 'withdrawn ' + p.kind, { id });
      return ok();
    },
    /* driver: propose the right split for a recorded booking payment; the customer approves */
    payCorrect(me, p) {
      const b = S.bk.find(x => x.id == p.id && x.drvUser == me.em),
        k = p.kind == 'final' ? 'final' : 'down';
      if (!b) return no('Booking not found or not assigned to you.');
      if (b.rem) return no('This trip was already remitted; ask ZamMove to correct it.');
      const recs = S.pay.filter(x => x.bid == b.id && x.kind == k && x.status == 'Recorded by driver');
      if (!recs.length) return no('There is no recorded payment to correct.');
      const tot = r2(recs.reduce((s, x) => s + x.amount, 0)),
        g = r2(+p.g || 0),
        c = r2(+p.c || 0),
        rcv = c ? r2(p.rcv === '' || p.rcv == null ? c : +p.rcv) : 0,
        ref = str(p.ref, 13),
        why = str(p.why, 300);
      if (Math.round((g + c) * 100) != Math.round(tot * 100)) return no(`GCash and cash must still add up to ${peso(tot)}.`);
      if (c && rcv < c) return no('The cash handed over cannot be less than the cash part.');
      if (g && !/^\d{10,13}$/.test(ref)) return no('Enter the GCash reference number (10–13 digits).');
      if (why.length < 5) return no('Say what was entered wrong (at least 5 characters).');
      (b.fix = b.fix || {})[k] = { g, c, rcv, ref, why, t: now(), by: me.em };
      h.ntf(b.cu, 'Payment correction to approve', `${b.id}: your driver says the ${k == 'down' ? 'down payment' : 'balance'} was entered wrong (${why}). Proposed: ${[g ? peso(g) + ' GCash' : '', c ? peso(c) + ' cash, you handed ' + peso(rcv) : ''].filter(Boolean).join(' + ')}. Approve or decline it on the booking.`);
      return ok();
    },
    payCorrectAnswer(me, p) {
      const b = S.bk.find(x => x.id == p.id && x.cu == me.em),
        k = p.kind == 'final' ? 'final' : 'down',
        f = b && b.fix && b.fix[k];
      if (!f) return no('There is no correction to answer.');
      const note = str(p.note, 300);
      if (!p.ok) {
        if (note.length < 5) return no('Say why you decline (at least 5 characters).');
        delete b.fix[k];
        h.ntf(f.by, 'Correction declined', `${b.id}: the customer declined the payment correction: ${note}. ZamMove can help if needed.`);
        return ok();
      }
      const recs = S.pay.filter(x => x.bid == b.id && x.kind == k && x.status == 'Recorded by driver'),
        tx = (recs[0] && recs[0].tx) || {},
        gRec = recs.find(x => x.method == 'GCash'),
        cRec = recs.find(x => x.method == 'Cash'),
        before = { g: tx.g, c: tx.c, rcv: tx.rcv };
      const base = { bid: b.id, kind: k, payer: b.cu, status: 'Recorded by driver', by: f.by, collectedBy: f.by };
      if (f.g) {
        if (gRec) Object.assign(gRec, { amount: f.g, ref: f.ref });
        else S.pay.push(h.payMk({ ...base, method: 'GCash', amount: f.g, ref: f.ref, gto: cRec && cRec.gto ? cRec.gto : 'driver', tx }));
      } else if (gRec) gRec.status = 'Voided';
      if (f.c) {
        if (cRec) Object.assign(cRec, { amount: f.c, rcv: f.rcv, chg: r2(f.rcv - f.c) });
        else S.pay.push(h.payMk({ ...base, method: 'Cash', amount: f.c, ref: rid('CSH'), rcv: f.rcv, chg: r2(f.rcv - f.c), tx }));
      } else if (cRec) cRec.status = 'Voided';
      Object.assign(tx, { g: f.g, c: f.c, rcv: f.rcv, chg: f.c ? r2(f.rcv - f.c) : 0, ref: f.g ? f.ref : '' });
      (tx.fixes = tx.fixes || []).push({ ...f, before, okBy: me.em, at: now() });
      delete b.fix[k];
      h.au(me.em, 'payment corrected', { bk: b.id, kind: k });
      h.ntf(f.by, 'Correction approved', `${b.id}: the customer approved the payment correction. The receipt shows both versions.`);
      return ok();
    },
    /* administrator: correct a record, with a reason everyone sees */
    adminFix(me, p) {
      if (!h.isAdmin(me)) return no('Only an administrator can correct records.');
      const why = str(p.reason, 300);
      if (why.length < 10) return no('Write the reason for the correction (at least 10 characters). Everyone involved sees it.');
      const log = (data, people, msg) => {
        h.au(me.em, 'correction ' + p.kind, { ...data, reason: why });
        tell(people, 'Record corrected by ZamMove', msg + ' Reason: ' + why);
        return ok();
      };
      if (p.kind == 'step-back') {
        const b = S.bk.find(x => x.id == p.id),
          e = b && lastEv(b);
        if (!b || !e || !e.from) return no('Booking not found or nothing to step back.');
        if (['Down Payment Confirmed', 'Completed'].includes(b.st)) return no('This step comes from a payment. Void the payment instead; the trip steps back with it.');
        if (b.rem) return no('This trip was already remitted.');
        b.ev.push({ t: now(), by: me.em, from: b.st, to: e.from, note: 'Corrected by ZamMove: ' + why });
        const from = b.st;
        b.st = e.from;
        return log({ bk: b.id, from, to: b.st }, [b.cu, b.drvUser], `${b.id} was moved back from “${from}” to “${b.st}”.`);
      }
      if (p.kind == 'void-pay') {
        const x = S.pay.find(y => y.id == p.id);
        if (!x || ['Voided'].includes(x.status)) return no('Payment not found or already voided.');
        const b = S.bk.find(y => y.id == x.bid);
        if (b && b.rem) return no('This trip was already remitted; correct the remittance instead.');
        const was = x.status;
        x.status = 'Voided';
        x.note = 'Voided by ZamMove: ' + why;
        if (b && x.kind == 'down' && b.st == 'Down Payment Confirmed' && h.paySum(b.id, 'down') < h.due(b, 'down') - 0.005) {
          b.ev.push({ t: now(), by: me.em, from: b.st, to: 'Awaiting Down Payment', note: 'Payment voided: ' + why });
          b.st = 'Awaiting Down Payment';
        }
        if (b && x.kind == 'final' && b.st == 'Completed' && h.paySum(b.id, 'final') < h.due(b, 'final') - 0.005) {
          b.ev.push({ t: now(), by: me.em, from: b.st, to: 'Awaiting Final Payment', note: 'Payment voided: ' + why });
          b.st = 'Awaiting Final Payment';
          delete b.cd;
          delete b.split;
        }
        return log({ id: x.id, bid: x.bid, was }, [x.payer, x.to, x.from, x.by, b && b.cu, b && b.drvUser], `A ${peso(x.amount)} ${x.kind} record for ${x.bid || 'your account'} was voided.`);
      }
      if (p.kind == 'reopen') {
        const x = S.pay.find(y => y.id == p.id);
        if (!x || !x.disp || !x.disp.closed) return no('There is no decided dispute on this payment.');
        const d = x.disp.closed;
        delete x.disp.closed;
        if (['rental', 'deposit', 'turnover'].includes(x.kind)) x.status = 'Disputed';
        if (['deposit_refund', 'refund'].includes(x.kind)) x.status = 'Disputed';
        if (x.kind == 'cancel_fee' && x.status == 'Waived') x.status = 'Due';
        return log({ id: x.id, was: d }, [x.payer, x.to, x.from], `The decision on the ${peso(x.amount)} ${x.kind} for ${x.bid || 'your account'} was reopened for review.`);
      }
      if (p.kind == 'rental-back') {
        const r = S.rn.find(x => x.id == p.id);
        if (!r) return no('Rental not found.');
        const from = r.st;
        if (r.st == 'Approved') (r.st = 'Pending'), delete r.ct;
        else if (r.st == 'Active') (r.st = 'Approved'), delete r.out, r.ho && delete r.ho.out;
        else if (r.st == 'Returned' && !r.claim) (r.st = 'Active'), delete r.back, delete r.late, r.ho && delete r.ho.back;
        else return no('This rental cannot be stepped back here.');
        (r.hist = r.hist || []).push({ st: r.st, t: now(), by: me.em, note: 'Corrected by ZamMove: ' + why });
        return log({ id: r.id, from, to: r.st }, [r.cu, r.owner], `${r.id} was moved back from “${from}” to “${r.st}”.`);
      }
      if (p.kind == 'cancel') {
        const b = S.bk.find(x => x.id == p.id);
        if (!b || h.done(b)) return no('Booking not found or already closed.');
        const refund = r2(+p.refund || 0),
          pkg = b.pkgOf ? S.bk.find(x => x.id == b.pkgOf) : b;
        if (refund < 0) return no('The refund cannot be negative.');
        h.ev(b, me.em, 'Cancelled', 'Cancelled by ZamMove: ' + why);
        if (refund > 0) {
          const owner = pkg && pkg.flow == 'owner' ? h.splitOf(pkg).owner : '';
          S.pay.push(h.payMk({ bid: b.id, kind: 'refund', method: '', amount: refund, ref: rid('RF'), payer: owner || me.em, to: b.cu, status: 'Due', note: 'Correction: ' + why, ...(owner ? { from: owner } : {}) }));
        }
        return log({ bk: b.id, refund }, [b.cu, b.drvUser, h.splitOf(pkg || b).owner], `${b.id} was cancelled by ZamMove${refund ? `; ${peso(refund)} is refunded to the customer` : ''}.`);
      }
      return no('Unknown correction.');
    },
  };
};
