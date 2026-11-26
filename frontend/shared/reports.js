/**
 * shared/reports.js — searchable, filterable, printable reports (admin panel, cashier, vehicle owner).
 *
 *   ZREP.view(key, S, scope) returns a report panel. scope.owner limits it to one owner's vehicles and rentals
 *   (and adds earnings tiles: today, the chosen dates). Reports:
 *     sales     money received, each payment (cash / GCash), with who collected it
 *     daily     cash vs GCash per day
 *     recv      receivables: bookings and rentals with an unpaid balance ("debit sales")
 *     disc      discounts: owner discounts and promo codes
 *     trips     completed trips with the split (ZamMove, driver, owner)
 *     rentals   rental income
 *     rem       remittances from drivers and owners
 *     refunds   refunds to customers
 *   Every report: date range, search, totals, Print and Download CSV.
 */
(function () {
  'use strict';
  const r2 = x => Math.round((+x || 0) * 100) / 100;
  const peso = n => '₱' + r2(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const md = t => (t ? new Date(new Date(t).getTime() + 8 * 36e5).toISOString().slice(0, 10) : ''); // Manila date
  const hm = t => (t ? new Date(new Date(t).getTime() + 8 * 36e5).toISOString().slice(11, 16) : '');
  const today = () => md(new Date().toISOString());
  const monthStart = () => today().slice(0, 8) + '01';
  const OK = ['Recorded by driver', 'Verified'];
  const KIND = { down: 'Down payment', final: 'Balance', rental: 'Rental fee', deposit: 'Rental deposit', cancel_fee: 'Cancellation / no-show fee', deposit_refund: 'Deposit refund', refund: 'Refund', owner_remit: 'Owner remittance', owner_payout: 'Owner payout', turnover: 'Driver turnover', drv_pay: 'Owner paid driver' };

  /* what this scope may report on */
  const scopeOf = (S, scope) => {
    const nm = em => ((S.users || []).find(u => u.em == em) || {}).name || (em ? String(em).replace(/@.*/, '@…') : '');
    const own = scope && scope.owner;
    const myVeh = own ? new Set((S.vh || []).filter(v => v.owner == own).map(v => v.id)) : null;
    const bk = (S.bk || []).filter(b => !own || myVeh.has(b.veh) || (b.split && b.split.owner == own));
    const rn = (S.rn || []).filter(r => !own || r.owner == own);
    const ids = new Set([...bk.map(b => b.id), ...rn.map(r => r.id)]);
    const pay = (S.pay || []).filter(p => !own || ids.has(p.bid) || p.to == own || p.payer == own);
    return { nm, own, bk, rn, pay, rem: own ? [] : S.rem || [] };
  };
  const paidOf = (pay, id) => r2(pay.filter(p => p.bid == id && OK.includes(p.status) && !/refund/.test(p.kind)).reduce((s, p) => s + p.amount, 0));

  const REPORTS = {
    sales: {
      n: 'Sales (money received)',
      d: 'Every payment received, cash or GCash, and who collected it.',
      build: (X, from, to) => {
        const rows = X.pay
          .filter(p => OK.includes(p.status) && ['down', 'final', 'rental', 'deposit', 'cancel_fee'].includes(p.kind))
          .map(p => ({ dt: md(p.ct || p.vt || p.t), t: p.ct || p.vt || p.t, p }))
          .filter(x => x.dt >= from && x.dt <= to)
          .sort((a, b) => (a.t < b.t ? -1 : 1));
        const cash = rows.filter(x => x.p.method == 'Cash').reduce((s, x) => s + x.p.amount, 0),
          gc = rows.filter(x => x.p.method == 'GCash').reduce((s, x) => s + x.p.amount, 0);
        return {
          cols: ['Date', 'Time', 'Booking / rental', 'What', 'Method', 'Amount', 'Collected by'],
          num: [5],
          rows: rows.map(({ dt, t, p }) => [dt, hm(t), p.bid, KIND[p.kind] || p.kind, p.method, r2(p.amount), X.nm(p.collectedBy || p.coll || p.vby || '')]),
          tot: [['Cash sales', cash], ['GCash sales', gc], ['Total received', cash + gc], ['Payments', rows.length, 1]],
        };
      },
    },
    daily: {
      n: 'Daily cash vs GCash',
      d: 'Money received per day.',
      build: (X, from, to) => {
        const m = new Map();
        X.pay
          .filter(p => OK.includes(p.status) && ['down', 'final', 'rental', 'deposit', 'cancel_fee'].includes(p.kind))
          .forEach(p => {
            const dt = md(p.ct || p.vt || p.t);
            if (dt < from || dt > to) return;
            const x = m.get(dt) || { c: 0, g: 0, n: 0 };
            x[p.method == 'Cash' ? 'c' : 'g'] += p.amount;
            x.n++;
            m.set(dt, x);
          });
        const rows = [...m.entries()].sort().map(([dt, x]) => [dt, r2(x.c), r2(x.g), r2(x.c + x.g), x.n]);
        return { cols: ['Date', 'Cash', 'GCash', 'Total', 'Payments'], num: [1, 2, 3], rows, tot: [['Cash', rows.reduce((s, r) => s + r[1], 0)], ['GCash', rows.reduce((s, r) => s + r[2], 0)], ['Total', rows.reduce((s, r) => s + r[3], 0)]] };
      },
    },
    recv: {
      n: 'Receivables (unpaid balances)',
      d: 'Bookings and rentals not fully paid yet: what was charged, what came in, what is still owed.',
      build: (X, from, to) => {
        const rows = [];
        X.bk
          .filter(b => !['Cancelled', 'Rejected', 'Pending', 'No driver found'].includes(b.st) && !b.pkgOf && b.dt >= from && b.dt <= to)
          .forEach(b => {
            const due = r2((+b.tot || 0) - ((b.odisc && +b.odisc.amt) || 0)),
              paid = paidOf(X.pay, b.id);
            if (due - paid > 0.005) rows.push([b.dt, b.id, 'Booking', b.st, due, paid, r2(due - paid)]);
          });
        X.rn
          .filter(r => ['Approved', 'Active', 'Returned'].includes(r.st) && r.s >= from && r.s <= to)
          .forEach(r => {
            const due = r2((+r.tot || 0) + ((r.late && r.late.amt) || 0) + (+r.dep || 2000)),
              paid = paidOf(X.pay, r.id);
            if (due - paid > 0.005) rows.push([r.s, r.id, 'Rental', r.st, due, paid, r2(due - paid)]);
          });
        rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
        return { cols: ['Date', 'Booking / rental', 'Type', 'Status', 'Charged', 'Received', 'Balance'], num: [4, 5, 6], rows, tot: [['Charged', rows.reduce((s, r) => s + r[4], 0)], ['Received', rows.reduce((s, r) => s + r[5], 0)], ['Still owed', rows.reduce((s, r) => s + r[6], 0)]] };
      },
    },
    disc: {
      n: 'Discounts',
      d: 'Owner discounts (absorbed by the owner) and promo codes.',
      build: (X, from, to) => {
        const rows = [];
        X.bk.forEach(b => {
          if (b.odisc && md(b.odisc.t) >= from && md(b.odisc.t) <= to) rows.push([md(b.odisc.t), b.id, 'Owner discount', r2(b.tot), r2(b.odisc.amt), X.nm(b.odisc.by), b.odisc.why || '']);
          if (+b.disc > 0 && md(b.cr || b.t) >= from && md(b.cr || b.t) <= to) rows.push([md(b.cr), b.id, 'Promo code ' + (b.dc || ''), r2(b.tot), r2(b.disc), 'ZamMove', '']);
        });
        rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
        return { cols: ['Date', 'Booking', 'Type', 'Fare', 'Discount', 'Given by', 'Reason'], num: [3, 4], rows, tot: [['Discounts given', rows.reduce((s, r) => s + r[4], 0)], ['Count', rows.length, 1]] };
      },
    },
    trips: {
      n: 'Completed trips',
      d: 'Each completed trip and how its fare was split.',
      build: (X, from, to) => {
        const rows = X.bk
          .filter(b => b.st == 'Completed' && md(b.cd) >= from && md(b.cd) <= to)
          .sort((a, b) => (a.cd < b.cd ? -1 : 1))
          .map(b => {
            const s = b.split || {};
            return [md(b.cd), b.id, b.drv || '', b.vn || '', r2(s.fare), r2(s.zam), r2(s.drv), r2(s.own), r2(s.odisc || 0)];
          });
        const sum = i => rows.reduce((s, r) => s + r[i], 0);
        return { cols: ['Date', 'Booking', 'Driver', 'Vehicle', 'Fare', 'ZamMove', 'Driver share', 'Owner share', 'Discount'], num: [4, 5, 6, 7, 8], rows, tot: [['Fares', sum(4)], ['ZamMove', sum(5)], ['Drivers', sum(6)], ['Owners', sum(7)], ['Trips', rows.length, 1]] };
      },
    },
    rentals: {
      n: 'Rental income',
      d: 'Completed rentals (and late cancellations) and the owner’s share.',
      build: (X, from, to) => {
        const rows = X.rn
          .filter(r => r.split && md((r.settle || r.cxl || {}).t) >= from && md((r.settle || r.cxl || {}).t) <= to)
          .map(r => [md((r.settle || r.cxl).t), r.id, r.vn || '', r.st, r2(r.split.fee), r2(r.split.zc), r2(r.split.own + (r.split.kept || 0))]);
        const sum = i => rows.reduce((s, r) => s + r[i], 0);
        return { cols: ['Date', 'Rental', 'Vehicle', 'Status', 'Rental fee', 'ZamMove', 'Owner share'], num: [4, 5, 6], rows, tot: [['Rental fees', sum(4)], ['ZamMove', sum(5)], ['Owners', sum(6)]] };
      },
    },
    rem: {
      n: 'Remittances',
      d: 'Money drivers and owners sent to ZamMove.',
      build: (X, from, to) => {
        const rows = [
          ...X.rem.map(r => [md(r.t), X.nm(r.drv), 'Driver', 'Week of ' + (r.week || ''), r.method || '', r2(r.due != null ? r.due : r.gross), r.st]),
          ...X.pay.filter(p => p.kind == 'owner_remit').map(p => [md(p.t), X.nm(p.payer), 'Owner', 'Rental commission', p.method, r2(p.amount), p.status]),
        ]
          .filter(r => r[0] >= from && r[0] <= to)
          .sort((a, b) => (a[0] < b[0] ? -1 : 1));
        return { cols: ['Date', 'From', 'Who', 'For', 'Method', 'Amount', 'Status'], num: [5], rows, tot: [['Remitted', rows.reduce((s, r) => s + r[5], 0)], ['Count', rows.length, 1]] };
      },
    },
    turn: {
      n: 'Driver turnovers',
      d: 'Money drivers handed to their owners, and owners paid to drivers.',
      build: (X, from, to) => {
        const rows = X.pay
          .filter(p => ['turnover', 'drv_pay'].includes(p.kind))
          .map(p => [md(p.vt || p.t), KIND[p.kind], X.nm(p.payer), X.nm(p.to), p.method, r2(p.amount), p.status])
          .filter(r => r[0] >= from && r[0] <= to)
          .sort((a, b) => (a[0] < b[0] ? -1 : 1));
        return { cols: ['Date', 'What', 'From', 'To', 'Method', 'Amount', 'Status'], num: [5], rows, tot: [['Turned over (confirmed)', rows.filter(r => r[1] == 'Driver turnover' && r[6] == 'Verified').reduce((s, r) => s + r[5], 0)], ['Waiting to confirm', rows.filter(r => r[6] == 'Submitted').reduce((s, r) => s + r[5], 0)], ['Paid to drivers', rows.filter(r => r[1] == 'Owner paid driver').reduce((s, r) => s + r[5], 0)]] };
      },
    },
    refunds: {
      n: 'Refunds',
      d: 'Refunds owed or sent to customers.',
      build: (X, from, to) => {
        const rows = X.pay
          .filter(p => ['deposit_refund', 'refund'].includes(p.kind))
          .map(p => [md(p.sentT || p.vt || p.t), p.bid, KIND[p.kind], p.from ? X.nm(p.from) : 'ZamMove', X.nm(p.to), r2(p.amount), p.status])
          .filter(r => r[0] >= from && r[0] <= to)
          .sort((a, b) => (a[0] < b[0] ? -1 : 1));
        return { cols: ['Date', 'Booking / rental', 'What', 'Paid by', 'To', 'Amount', 'Status'], num: [5], rows, tot: [['Refunds', rows.reduce((s, r) => s + r[5], 0)], ['Still due', rows.filter(r => r[6] == 'Due').reduce((s, r) => s + r[5], 0)]] };
      },
    },
  };

  const st = {};
  const stateOf = key => (st[key] = st[key] || { r: 'sales', from: monthStart(), to: today(), q: '' });
  const ctx = {};
  const compute = key => {
    const s = stateOf(key),
      c = ctx[key];
    const X = scopeOf(c.S, c.scope),
      R = REPORTS[s.r] || REPORTS.sales,
      out = R.build(X, s.from || '0000', s.to || '9999');
    const q = s.q.trim().toLowerCase();
    out.rows = q ? out.rows.filter(r => r.some(x => String(x).toLowerCase().includes(q))) : out.rows;
    return { s, R, out, X };
  };
  /* owner: earnings today and for the chosen dates */
  const tiles = (X, from, to) => {
    const share = (a, b) =>
      r2(
        X.bk.filter(x => x.st == 'Completed' && md(x.cd) >= a && md(x.cd) <= b).reduce((s, x) => s + ((x.split || {}).own || 0), 0) +
          X.rn.filter(r => r.split && md((r.settle || r.cxl || {}).t) >= a && md((r.settle || r.cxl || {}).t) <= b).reduce((s, r) => s + r.split.own + (r.split.kept || 0), 0)
      );
    const recv = REPORTS.recv.build(X, '0000', '9999').rows.reduce((s, r) => s + r[6], 0);
    const T = (l, v, sub) => `<div class="zr-t"><span>${e(l)}</span><b>${v}</b>${sub ? `<small>${e(sub)}</small>` : ''}</div>`;
    return `<div class="zr-tiles">${T('Earned today', peso(share(today(), today())), today())}${T('Earned in these dates', peso(share(from, to)), from + ' → ' + to)}${T('Trips completed', X.bk.filter(x => x.st == 'Completed' && md(x.cd) >= from && md(x.cd) <= to).length, 'in these dates')}${T('Unpaid balances', peso(recv), 'all open bookings and rentals')}</div>`;
  };
  const table = out =>
    `<div class="zr-tw"><table class="zr-tb"><thead><tr>${out.cols.map((c, i) => `<th${out.num.includes(i) ? ' class="n"' : ''}>${e(c)}</th>`).join('')}</tr></thead><tbody>${
      out.rows.length ? out.rows.map(r => `<tr>${r.map((x, i) => `<td${out.num.includes(i) ? ' class="n"' : ''}>${out.num.includes(i) ? peso(x) : e(x)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${out.cols.length}" class="zr-empty">Nothing in these dates.</td></tr>`
    }</tbody></table></div>`;
  const totals = out => `<div class="zr-tot">${out.tot.map(([l, v, plain]) => `<div><span>${e(l)}</span><b>${plain ? v : peso(v)}</b></div>`).join('')}</div>`;
  const view = (key, S, scope = {}) => {
    ctx[key] = { S, scope };
    const { s, R, out, X } = compute(key);
    return `<section class="zr-panel" id="zrep-${e(key)}"><div class="zr-f"><label>Report<select data-zrep="${e(key)}" data-k="r">${Object.entries(REPORTS)
      .filter(([k]) => !(scope.owner && k == 'rem'))
      .map(([k, x]) => `<option value="${k}"${k == s.r ? ' selected' : ''}>${e(x.n)}</option>`)
      .join('')}</select></label><label>From<input type="date" data-zrep="${e(key)}" data-k="from" value="${e(s.from)}"></label><label>To<input type="date" data-zrep="${e(key)}" data-k="to" value="${e(s.to)}"></label><label class="zr-q">Search<input type="search" data-zrep="${e(key)}" data-k="q" value="${e(s.q)}" placeholder="Booking, name, method…"></label><div class="zr-b"><button type="button" class="btn o sm" data-zrep-a="print" data-zrep="${e(key)}">Print</button><button type="button" class="btn o sm" data-zrep-a="csv" data-zrep="${e(key)}">Download CSV</button></div></div>${scope.owner ? tiles(X, s.from || '0000', s.to || '9999') : ''}<p class="zr-d">${e(R.d)} ${out.rows.length} row${out.rows.length == 1 ? '' : 's'}.</p>${totals(out)}${table(out)}</section>`;
  };
  const rerender = key => {
    const el = document.getElementById('zrep-' + key);
    if (!el || !ctx[key]) return;
    const active = document.activeElement,
      k = active && active.dataset && active.dataset.k,
      pos = active && active.selectionStart;
    const t = document.createElement('div');
    t.innerHTML = view(key, ctx[key].S, ctx[key].scope);
    if (!el.isConnected || !el.parentNode) return; // already redrawn (e.g. change fired while the field lost focus)
    try {
      el.replaceWith(t.firstElementChild);
    } catch (x) {
      return;
    }
    if (k) {
      const n = document.querySelector(`#zrep-${key} [data-k="${k}"]`);
      if (n) {
        n.focus();
        try {
          if (pos != null && n.setSelectionRange) n.setSelectionRange(pos, pos);
        } catch (x) {
          /* date inputs */
        }
      }
    }
  };
  const onEdit = ev => {
    const t = ev.target;
    if (!t || !t.dataset || !t.dataset.zrep || !t.dataset.k) return;
    if (ev.type == 'change' && t.dataset.k == 'q' && stateOf(t.dataset.zrep).q == t.value) return;
    stateOf(t.dataset.zrep)[t.dataset.k] = t.value;
    rerender(t.dataset.zrep);
  };
  document.addEventListener('change', onEdit);
  document.addEventListener('input', ev => ev.target && ev.target.dataset && ev.target.dataset.k == 'q' && onEdit(ev));
  document.addEventListener(
    'click',
    ev => {
      const t = ev.target.closest && ev.target.closest('[data-zrep-a]');
      if (!t) return;
      ev.preventDefault();
      ev.stopPropagation();
      const key = t.dataset.zrep,
        { s, R, out } = compute(key);
      const title = `ZamMove · ${R.n} · ${s.from} to ${s.to}${s.q ? ' · search: ' + s.q : ''}`;
      if (t.dataset.zrepA == 'csv') {
        const q = x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
        const csv = [out.cols.map(q).join(','), ...out.rows.map(r => r.map(q).join(',')), '', ...out.tot.map(([l, v]) => q(l) + ',' + q(r2(v)))].join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
        a.download = `zammove-${s.r}-${s.from}-to-${s.to}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
        return;
      }
      const w = window.open('', '_blank');
      if (!w) return alert('Allow pop-ups to print the report.');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${e(title)}</title><style>body{font:13px/1.4 system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#555}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}td.n,th.n{text-align:right}.tot{display:flex;gap:18px;flex-wrap:wrap;margin:10px 0}.tot div{border:1px solid #ccc;padding:6px 10px;border-radius:6px}.tot b{display:block;font-size:15px}</style></head><body><h1>${e(R.n)}</h1><p>${e(title)} · printed ${e(new Date().toLocaleString('en-PH'))}</p><div class="tot">${out.tot.map(([l, v, plain]) => `<div>${e(l)}<b>${plain ? v : peso(v)}</b></div>`).join('')}</div>${table(out).replace('zr-tw', 'x')}</body></html>`);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 300);
    },
    true
  );
  const css = document.createElement('style');
  css.textContent = `.zr-panel{margin:12px 0;min-width:0;max-width:100%}.zr-panel *{box-sizing:border-box}.zr-f{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px 10px;align-items:end}.zr-f label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;margin:0}.zr-f select,.zr-f input{width:100%;font-weight:400;min-height:38px}.zr-q{grid-column:span 2}.zr-b{display:flex;gap:6px;flex-wrap:wrap}.zr-d{margin:10px 0 6px;font-size:13.5px;color:#5f6779}.zr-tot,.zr-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:8px 0}.zr-tot div,.zr-t{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:1px solid rgba(0,0,0,.1);border-radius:10px}.zr-tot span,.zr-t span{font-size:12.5px;color:#5f6779}.zr-tot b,.zr-t b{font-size:17px}.zr-t small{font-size:12px;color:#5f6779}.zr-tw{max-width:100%;overflow-x:auto;border:1px solid rgba(0,0,0,.1);border-radius:10px}.zr-tb{width:100%;border-collapse:collapse;font-size:13.5px}.zr-tb th,.zr-tb td{padding:7px 9px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;white-space:nowrap}.zr-tb .n{text-align:right;font-variant-numeric:tabular-nums}.zr-empty{text-align:center!important;color:#5f6779;padding:18px!important}@media (max-width:600px){.zr-q{grid-column:auto}}`;
  document.head.appendChild(css);
  window.ZREP = { view, REPORTS };
})();
