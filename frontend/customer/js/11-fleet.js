/**
 * 11-fleet.js — loaded last.
 *
 * - Self-drive rental from REAL registered vehicles: pick dates → models with "N available" →
 *   model information (capacity, seats, transmission, fuel, rate) → available units → request one.
 * - Vehicle owner workspace "Rentals": offer a vehicle for rent (rate and specs), update its photo,
 *   approve / reject / release / record return / complete requests. Admins get the same list.
 * - Driver profile for customers: photo, "View profile" with reviews and the vehicle photo.
 * - Profile photo upload (Profile page).
 * - Waze: the driver can share a Waze "Share drive" link; the customer gets a "Follow on Waze" button.
 * - GPS help when the page is opened over plain http:// on a phone.
 * Every change is a server action (backend/src/domain); this file only draws screens and sends requests.
 */
(() => {
  /* ---------------- shared helpers ---------------- */
  const FX = { s: '', e: '', pt: '09:00', rt: '17:00', m: '', u: '', err: '' }; // rental picker: dates, times, model key, unit id
  const T12 = x => (x ? new Date('2000-01-01T' + x + ':00').toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '');
  const TIMES = Array.from({ length: 29 }, (_, i) => String(6 + Math.floor(i / 2)).padStart(2, '0') + (i % 2 ? ':30' : ':00'));
  const tmSel = (id, cur) => `<select id="${id}">${TIMES.map(x => `<option value="${x}"${x == cur ? ' selected' : ''}>${T12(x)}</option>`).join('')}</select>`;
  const span = r => `${esc(r.s)}${r.pt ? ' ' + T12(r.pt) : ''} → ${esc(r.e)}${r.rtm ? ' ' + T12(r.rtm) : ''}`;
  window.ZT12 = T12;
  window.ZFX = FX; // the filters (26-catalog) preselect “With a driver”
  let FXm = {}; // workspace message {t, good}
  const SYM = {
    tw: 'v-3w',
    pk: 'v-pick',
    l3: 'v-van',
    cv: 'v-box',
    w6: 'v-truck',
    sd: 'v-car',
    su: 'v-pick',
    mv: 'v-van',
  };
  const types = () => [...HV, ...((S.fleet || {}).RT || [])];
  const tyOf = id => types().find(t => t.id == id) || { n: id || 'Vehicle', cap: '' };
  const info = id => ((S.fleet || {}).TYPE_INFO || {})[id] || {};
  const art = t =>
    `<svg viewBox="0 0 240 112" aria-hidden="true"><use href="#${SYM[t] || 'v-van'}" x="0" y="-4" width="240" height="120"/></svg>`;
  const pic = (src, t, cls = 'fx-pic') =>
    src ? `<img class="${cls}" src="${esc(src)}" alt="">` : `<div class="${cls} fx-art">${art(t)}</div>`;
  const todayPH = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
  const nDays = () =>
    FX.s && FX.e && FX.e >= FX.s ? Math.round((new Date(FX.e) - new Date(FX.s)) / 864e5) + 1 : 0;
  const isFree = u => !nDays() || !(u.busy || []).some(b => FX.s <= b.e && FX.e >= b.s);
  const keyOf = u => (u.brand + ' ' + u.model).trim().toLowerCase() + '|' + u.type;
  const groups = () => {
    const m = new Map();
    (S.rentList || []).filter(u => !window.ZCAT || !ZCAT.rentMatch || ZCAT.rentMatch(u)).forEach(u => {
      const k = keyOf(u);
      if (!m.has(k)) m.set(k, { k, name: `${u.brand} ${u.model}`.trim(), type: u.type, units: [] });
      m.get(k).units.push(u);
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  const range = (xs, f = x => x) => {
    const v = [...new Set(xs.filter(x => x != null && x !== ''))].sort((a, b) => a - b);
    return !v.length ? '—' : v.length == 1 ? f(v[0]) : f(v[0]) + ' – ' + f(v[v.length - 1]);
  };
  const list = xs => [...new Set(xs.filter(Boolean))].join(' / ') || '—';
  const row = (k, x) =>
    `<div class="vz-i"><span class="mu">${k}</span><span style="text-align:right">${x}</span></div>`;
  const user = em => (S.users || []).find(u => u.em == em) || {};
  const tag = (s, good) =>
    `<span class="tag ${good ? 'g' : ['Rejected', 'Cancelled'].includes(s) ? 'r' : ''}">${esc(s)}</span>`;
  const fmtD = d =>
    d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const FUEL = ['Full', '3/4', '1/2', '1/4', 'Empty'];
  /* odometer, fuel and condition recorded at release and at return */
  const readings = r =>
    (r.out
      ? `<br>At release: ${Number(r.out.odo).toLocaleString('en-PH')} km · fuel ${esc(r.out.fuel)} · ${esc(r.out.cond || '')}`
      : '') +
    (r.back
      ? `<br>At return: ${Number(r.back.odo).toLocaleString('en-PH')} km · fuel ${esc(r.back.fuel)}${r.out ? ' · driven ' + Number(r.back.odo - r.out.odo).toLocaleString('en-PH') + ' km' : ''}`
      : '') +
    (r.cond ? '<br>Return condition: ' + esc(r.cond) : '');
  const HP = () =>
    (S.fleet || {}).HANDOVER_PH || [
      ['front', 'Front'],
      ['back', 'Back'],
      ['left', 'Left side'],
      ['right', 'Right side'],
      ['odo', 'Odometer'],
      ['fuel', 'Fuel gauge'],
    ];
  const CLAIM_DAYS = () => (S.fleet || {}).CLAIM_DAYS || 3;
  const depOf = r => +r.dep || 2000; // the deposit fixed on the rental (₱2,000 for rentals made before per-vehicle deposits)
  const paidUp = r =>
    ZPAY.sum(r.id, 'deposit') >= depOf(r) - 0.005 && ZPAY.sum(r.id, 'rental') >= r.tot - 0.005;
  const thumbs = list =>
    `<div class="fx-hps">${list
      .filter(x => x[0])
      .map(
        ([src, n]) =>
          `<a href="#" data-a="fx-img" data-src="${esc(src)}"><img src="${esc(src)}" alt="${esc(n)}"><span>${esc(n)}</span></a>`
      )
      .join('')}</div>`;
  const stagePhotos = rec => (rec && rec.ph ? thumbs(HP().map(([k, n]) => [rec.ph[k], n])) : '');
  const checkLine = rec =>
    !rec.cu
      ? '<div class="mu" style="font-size:12px;margin-top:4px">Waiting for the renter to confirm this record.</div>'
      : rec.cu.ok
        ? '<div class="ok" style="margin:6px 0 0">The renter confirmed this record.</div>'
        : `<div class="note" style="margin:6px 0 0">The renter reported: ${esc(rec.cu.note)}</div>`;
  const handPhotos = r =>
    (r.out && r.out.ph
      ? `<div class="fx-hpw"><b>Photos at release</b> <span class="mu" style="font-size:12px">${esc(fmtD(r.out.t))}</span>${stagePhotos(r.out)}${checkLine(r.out)}</div>`
      : '') +
    (r.back && r.back.ph
      ? `<div class="fx-hpw"><b>Photos at return</b> <span class="mu" style="font-size:12px">${esc(fmtD(r.back.t))}</span>${stagePhotos(r.back)}${checkLine(r.back)}</div>`
      : '');
  /* renter: confirm or dispute the release / return record */
  const renterChecks = r =>
    ['out', 'back']
      .filter(st => r[st] && !r[st].cu)
      .map(st => {
        const rec = r[st],
          id = esc(r.id),
          w = st == 'out' ? 'release' : 'return';
        return `<div class="vz-bc" style="margin-top:8px"><b>Check the ${w} record</b><p class="mu" style="font-size:13px;margin:6px 0">Odometer ${Number(rec.odo).toLocaleString('en-PH')} km · fuel ${esc(rec.fuel)}${st == 'out' && rec.cond ? ' · ' + esc(rec.cond) : st == 'back' && r.cond ? ' · ' + esc(r.cond) : ''}. Compare it with the photos above. Your answer protects you if there is a damage claim later.</p>
<div class="wsa"><button class="btn sm" data-a="fx-ck" data-id="${id}" data-st="${st}" data-ok="1">Everything matches</button><input id="fx-ckn-${st}-${id}" placeholder="What is different? e.g. fuel was 3/4, not full" style="flex:1;min-width:200px"><button class="btn o sm" data-a="fx-ck" data-id="${id}" data-st="${st}" data-ok="0">Report a difference</button></div></div>`;
      })
      .join('');
  /* renter: hand the vehicle back (photos + readings), then wait for the owner's check */
  const tm = d => (d ? new Date(d).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '');
  const waitBox = (title, text, spin = true) =>
    `<div class="fx-wait" role="status">${spin ? '<span class="fx-spin" aria-hidden="true"></span>' : ''}<div><b>${title}</b><p>${text}</p></div></div>`;
  const gcNo = n => String(n || '').replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');
  const gcOf = em => (user(em) || {}).gcash || (em == (S.me || {}).em ? (S.me || {}).gcash : null);
  /* owner: the GCash number renters pay into */
  const gcashCard = () => {
    const g = gcOf((S.me || {}).em) || {};
    return `<div class="card fx-gc" style="margin-top:12px"><div class="row" style="padding-top:0"><h2 style="font-size:20px;margin:0">Your GCash for rental payments</h2>${g.no ? '<span class="tag g">Set</span>' : '<span class="tag r">Not set</span>'}</div>
<p class="mu" style="font-size:14px;margin:6px 0">Renters send the rental fee and deposit straight to this number (or pay you in cash). You confirm each payment, keep the deposit during the rental and refund it at the end. Each week you remit ZamMove’s ${S.cfg && S.cfg.comm != null ? S.cfg.comm : 15}% commission from completed rentals.${g.no ? '' : ' <b>Until you add one, renters can only pay you in cash.</b>'}</p>
<div class="wsf"><div><label for="fx-gcn">GCash mobile number</label><input id="fx-gcn" inputmode="numeric" maxlength="13" value="${esc(g.no || '')}" placeholder="09XX XXX XXXX"></div><div><label for="fx-gcm">Name on the GCash account</label><input id="fx-gcm" maxlength="60" value="${esc(g.name || '')}" placeholder="As it appears in GCash"></div></div><div class="wsa"><button class="btn sm" data-a="fx-gc">Save GCash number</button></div></div>`;
  };
  const refundsOf = r => (S.pay || []).filter(p => p.bid == r.id && ['deposit_refund', 'refund'].includes(p.kind) && p.from);
  /* owner: send the deposit back and record it */
  const ownerRefund = r => refundsOf(r).map(x => ownerRefund1(r, x)).join('');
  const ownerRefund1 = (r, x) => {
    const c = user(r.cu),
      pid = esc(x.id);
    if (x.status == 'Due')
      return `<div class="fx-pays"><b>${x.kind == 'refund' ? 'Refund to the renter' : 'Refund the deposit'}: ${peso(x.amount)}</b>${x.note && x.kind == 'refund' ? ` <span class="mu" style="font-size:13px">(${esc(x.note.replace(/^Refund: /, ''))})</span>` : ''}<p class="mu" style="font-size:13px;margin:4px 0 8px">Send it to the renter${c.ph ? ' (GCash / mobile <span class="n">' + esc(c.ph) + '</span>)' : ''} or hand it over in cash, then record it here. The renter confirms receiving it.</p><div class="wsa"><select id="fx-rfm-${pid}" style="max-width:120px"><option>GCash</option><option>Cash</option></select><input id="fx-rfr-${pid}" inputmode="numeric" placeholder="GCash ref (GCash only)" style="flex:1;min-width:160px"><button class="btn sm" data-a="fx-rf" data-id="${pid}">Record refund</button></div></div>`;
    if (x.status == 'Sent') return `<div class="note" style="margin-top:8px">Refund of ${peso(x.amount)} sent by ${esc(x.method)}${x.method == 'GCash' ? ' (ref <span class="n">' + esc(x.ref) + '</span>)' : ''}. Waiting for the renter to confirm. <button class="btn o sm" data-a="zr2-wd" data-k="refund" data-id="${pid}">Entered wrong? Correct it</button></div>`;
    if (x.status == 'Disputed') return `<div class="err" style="margin-top:8px">The renter says the ${peso(x.amount)} refund did not arrive: “${esc(x.note || '')}”. ZamMove was told and will contact you.</div>`;
    return `<div class="ok" style="margin-top:8px">The renter confirmed receiving the ${peso(x.amount)} refund.</div>`;
  };
  /* renter: the owner's deposit refund */
  const renterRefund = r => (r.cu == (S.me || {}).em ? refundsOf(r).map(x => renterRefund1(r, x)).join('') : '');
  const renterRefund1 = (r, x) => {
    const pid = esc(x.id);
    if (x.status == 'Due') return `<div class="note" style="margin-top:8px">The owner refunds ${peso(x.amount)}${x.kind == 'deposit_refund' ? ' (your deposit)' : ''} by GCash to your mobile number or in cash, within 48 hours. You are notified when it is sent.</div>`;
    if (x.status == 'Sent')
      return `<div class="vz-bc" style="margin-top:8px"><b>Did you receive ${peso(x.amount)}?</b><p class="mu" style="font-size:13px;margin:6px 0">The owner says they sent your deposit refund by ${esc(x.method)}${x.method == 'GCash' ? ' (ref <span class="n">' + esc(x.ref) + '</span>)' : ''}. Check your GCash or cash, then confirm.</p><div class="wsa"><button class="btn sm" data-a="fx-rfa" data-id="${pid}" data-ok="1">Yes, I received it</button><input id="fx-rfn-${pid}" placeholder="What is wrong? e.g. nothing arrived" style="flex:1;min-width:180px"><button class="btn o sm" data-a="fx-rfa" data-id="${pid}" data-ok="0">Not received</button></div></div>`;
    if (x.status == 'Disputed') return `<div class="note" style="margin-top:8px">You reported that the refund did not arrive. ZamMove will contact you and the owner.</div>`;
    return `<div class="ok" style="margin-top:8px">Deposit refund of ${peso(x.amount)} received.</div>`;
  };
  const PICK_TM = '08:00';
  const hoursToPickup = r => (new Date(r.s + 'T' + PICK_TM + ':00+08:00').getTime() - Date.now()) / 36e5;
  /* renter: confirm before cancelling, with what it costs */
  const cancelBox = r => {
    if (!['Pending', 'Approved'].includes(r.st)) return '';
    const id = esc(r.id);
    if (FX.cxl != r.id) return `<div style="margin-top:6px"><button class="btn d sm" data-a="fx-cxl" data-id="${id}">Cancel rental</button></div>`;
    const paid = ZPAY.sum(r.id),
      late = r.st == 'Approved' && hoursToPickup(r) < 48,
      fee = late ? Math.min(+r.day || 0, paid) : 0;
    const txt = r.st == 'Pending'
      ? 'The request is withdrawn. Nothing was paid, so nothing is charged.'
      : late
        ? `Pickup is less than 48 hours away, so the owner keeps one day’s fee (${peso(+r.day || 0)}) from what you paid.${paid > 0 ? ` You get back ${peso(Math.max(0, paid - fee))}, sent by the owner within 48 hours.` : ''}`
        : paid > 0
          ? `Free: you cancel at least 48 hours before pickup. The owner refunds all ${peso(paid)} within 48 hours.`
          : 'Free: nothing was paid yet.';
    return `<div class="vz-bc fx-cxlb" style="margin-top:8px"><b>Cancel this rental?</b><p class="mu" style="font-size:14px;margin:6px 0">${txt}</p><div class="wsa"><button class="btn d sm" data-a="rncan" data-id="${id}">Yes, cancel</button><button class="btn o sm" data-a="fx-cxl" data-id="">Keep it</button></div></div>`;
  };
  /* renter: payments the owner marked as not received, with a way to contest them */
  const rejectedPays = r => {
    if (r.cu != (S.me || {}).em) return '';
    return (S.pay || [])
      .filter(p => p.bid == r.id && ['rental', 'deposit'].includes(p.kind) && p.to && ['Rejected', 'Disputed'].includes(p.status))
      .map(p => {
        const pid = esc(p.id);
        if (p.status == 'Disputed') return `<div class="note" style="margin-top:8px">You contested the ${peso(p.amount)} ${esc(p.method)} payment the owner marked as not received. ZamMove is reviewing it.</div>`;
        if (p.disp && p.disp.closed) return `<div class="note" style="margin-top:8px">ZamMove could not confirm your ${peso(p.amount)} payment: ${esc(p.disp.closed.note)}</div>`;
        return `<div class="vz-bc" style="margin-top:8px"><b>The owner marked ${peso(p.amount)} (${esc(p.method)}${p.ref && p.method == 'GCash' ? ' ref ' + esc(p.ref) : ''}) as not received</b><p class="mu" style="font-size:13px;margin:6px 0">${p.note ? 'Owner’s note: “' + esc(p.note) + '”. ' : ''}If you did pay, tell ZamMove how and attach your GCash receipt. Staff decide.</p><div class="wsf"><div style="grid-column:1/-1"><label for="fx-pdn-${pid}">How and when did you pay?</label><input id="fx-pdn-${pid}" placeholder="e.g. Sent by GCash at 3:10 PM to 0917…, receipt attached"></div><div style="grid-column:1/-1"><label for="fx-pdf-${pid}">GCash receipt or photo (optional)</label><input id="fx-pdf-${pid}" type="file" accept="image/*"></div></div><div class="err" id="fx-pde-${pid}"></div><div class="wsa"><button class="btn o sm" data-a="fx-pd" data-id="${pid}">I did pay: contest it</button></div></div>`;
      })
      .join('');
  };
  /* renter: change dates (Pending: at once; Approved: same length or longer; Active: extend) */
  const changeBox = r => {
    if (r.cu != (S.me || {}).em || !['Pending', 'Approved', 'Active'].includes(r.st)) return '';
    const id = esc(r.id);
    if (r.chg)
      return `<div class="note" style="margin-top:8px">You asked to change the dates to ${esc(r.chg.s)} → ${esc(r.chg.e)} (${peso(r.chg.tot)}). Waiting for the owner.</div>`;
    const last = (r.chgLog || []).slice(-1)[0],
      lastTxt = last && !last.ok && Date.now() - new Date(last.at).getTime() < 3 * 864e5 ? `<div class="note" style="margin:0 0 8px">The owner declined your last change: “${esc(last.note)}”</div>` : '',
      ext = r.st == 'Active',
      today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
    return `<details class="fx-chg" style="margin-top:8px">${lastTxt ? '' : ''}<summary style="cursor:pointer;font-weight:600;min-height:40px;display:flex;align-items:center">${ext ? 'Extend the rental' : 'Change dates'}</summary>${lastTxt}
<p class="mu" style="font-size:13px;margin:4px 0 8px">${r.st == 'Pending' ? 'The owner sees the new dates right away.' : ext ? `Add days after ${esc(r.e)}. The owner has to accept; the added days are paid at ${peso(+r.day || 0)} a day.` : `Move the dates or add days (at least ${r.days} days). The owner has to accept.`}</p>
<div class="wsf">${ext ? '' : `<div><label for="fx-cs-${id}">New start</label><input id="fx-cs-${id}" type="date" min="${today}" value="${esc(r.s)}"></div>`}<div><label for="fx-ce-${id}">New end</label><input id="fx-ce-${id}" type="date" min="${ext ? esc(r.e) : today}" value="${esc(r.e)}"></div>${r.st == 'Pending' ? '' : `<div style="grid-column:1/-1"><label for="fx-cw-${id}">Reason for the owner</label><input id="fx-cw-${id}" maxlength="300" placeholder="${ext ? 'e.g. I need the van one more day for the move' : 'e.g. My flight moved to Friday'}"></div>`}</div>
<div class="err" id="fx-cer-${id}"></div><div class="wsa"><button class="btn sm" data-a="fx-chg" data-id="${id}">${r.st == 'Pending' ? 'Save new dates' : 'Send to the owner'}</button></div></details>`;
  };
  /* owner: answer a date change */
  const ownerChange = r => {
    if (!r.chg) return '';
    const c = r.chg,
      id = esc(r.id);
    return `<div class="fx-pays"><b>${r.st == 'Active' ? 'Extension request' : 'Date change request'}</b><p style="font-size:14px;margin:6px 0">${esc(r.s)} → ${esc(r.e)} becomes <b>${esc(c.s)} → ${esc(c.e)}</b> (${c.days} days, ${peso(c.tot)}${c.tot > r.tot ? ', ' + peso(c.tot - r.tot) + ' more' : ''}). Reason: “${esc(c.why)}”</p><div class="wsa"><button class="btn sm" data-a="fx-cha" data-id="${id}" data-ok="1">Accept</button><input id="fx-chn-${id}" placeholder="Reason, if you decline" style="flex:1;min-width:160px"><button class="btn o sm" data-a="fx-cha" data-id="${id}" data-ok="0">Decline</button></div></div>`;
  };
  /* owner: why a rental closed early */
  const closedWhy = r =>
    r.st == 'Cancelled' && r.cxl ? `<div class="note" style="margin-top:8px">${esc(r.cxl.why)}${r.cxl.kept ? ` · ${peso(r.cxl.kept)} kept as the late cancellation fee` : ''}</div>` : '';
  const CHECK_H = () => (S.fleet || {}).RET_CHECK_H || 24;
  const checkBy = q => new Date(new Date(q.t).getTime() + CHECK_H() * 36e5);
  const whenTxt = d => esc(fmtD(d)) + ' ' + esc(tm(d));
  const locLine = q =>
    q.loc
      ? `Submitted ${q.loc.km != null ? `<b>${q.loc.km} km</b> from the agreed return point` : 'with the phone’s location'} · <a href="https://www.google.com/maps?q=${q.loc.lat},${q.loc.lng}" target="_blank" rel="noopener">Open in Maps</a>`
      : 'Submitted without the phone’s location';
  const flagList = q =>
    (q.flags || []).length
      ? `<div class="fx-flags" role="note"><b>Check before you accept</b><ul>${q.flags.map(f => `<li>${esc(f)}</li>`).join('')}</ul><span>These are signals, not proof: compare the photos with the vehicle.</span></div>`
      : '';
  /* rental payments waiting for the owner (cash) or the cashier (GCash) */
  const ownerPays = r => {
    const L = (S.pay || []).filter(p => p.bid == r.id && ['rental', 'deposit'].includes(p.kind) && p.status == 'Submitted');
    if (!L.length) return '';
    return `<div class="fx-pays"><b>Payments to confirm</b>${L.map(p => {
      const pid = esc(p.id);
      return `<div class="fx-pay"><span>${peso(p.amount)} · ${esc(p.kind == 'deposit' ? 'deposit' : 'rental fee')} · ${esc(p.method)}${p.method == 'GCash' ? ' · ref <span class="n">' + esc(p.ref) + '</span>' : ''}</span>${
        p.method == 'Cash' || p.to == (S.me || {}).em
          ? `<span class="wsa" style="margin:0"><button class="btn sm" data-a="fx-pv" data-id="${pid}" data-ok="1">${p.method == 'Cash' ? 'Confirm cash received' : 'Confirm GCash received'}</button><input id="fx-pvn-${pid}" placeholder="Reason, if not received" style="min-width:150px"><button class="btn o sm" data-a="fx-pv" data-id="${pid}" data-ok="0">Not received</button></span>`
          : '<span class="mu" style="font-size:13px">GCash goes to ZamMove: a cashier verifies it.</span>'
      }</div>`;
    }).join('')}</div>`;
  };
  const returnBox = r => {
    if (r.withDrv && r.cu == (S.me || {}).em && ['Approved', 'Active'].includes(r.st))
      return `<div class="note" style="margin-top:8px">With a driver: <b>${esc(r.withDrv.name || 'assigned on approval')}</b> drives for you. The driver brings the vehicle back; the owner records the return.</div>`;
    if (r.st != 'Active' || r.cu != (S.me || {}).em) return '';
    const q = r.rq,
      id = esc(r.id);
    if (q && !q.redo)
      return (
        waitBox(
          'Return submitted · waiting for the owner',
          `The owner checks the vehicle against your photos and readings, then marks it returned. If the owner does not check it by ${whenTxt(checkBy(q))}, your return is accepted as you submitted it. Location sharing has stopped.`
        ) +
        `<div class="fx-hpw"><b>Your return photos</b> <span class="mu" style="font-size:12px">${esc(fmtD(q.t))} ${esc(tm(q.t))} · ${Number(q.odo).toLocaleString('en-PH')} km · fuel ${esc(q.fuel)}</span>${stagePhotos(q)}</div>`
      );
    const redo = q && q.redo;
    return `<div class="fx-ret">${redo ? `<div class="note" style="margin:0 0 8px">The owner asked you to submit the return again: “${esc(redo.note)}”</div>` : ''}<details${redo ? ' open' : ''}><summary class="btn">Return the vehicle</summary>
<p class="mu" style="font-size:14px;margin:10px 0 4px">Park at the return location (${esc(r.rt || 'as agreed')}), then take the ${HP().length} photos with the engine off. The owner compares them with the vehicle before marking it returned. ZamMove records the time and your phone’s location when you submit, so allow location if asked.</p>
<div class="wsf"><div><label for="fx-rodo-${id}">Odometer now (km)</label><input id="fx-rodo-${id}" type="number" min="0" inputmode="numeric" placeholder="${r.out ? 'at release ' + esc(r.out.odo) : 'e.g. 52450'}"></div><div><label for="fx-rfl-${id}">Fuel level now</label><select id="fx-rfl-${id}"><option value="">Choose…</option>${FUEL.map(f => `<option>${f}</option>`).join('')}</select></div>
<div style="grid-column:1/-1"><span class="fx-lab">Photos (all ${HP().length} required)</span><div class="fx-hpin">${HP()
      .map(([k, n]) => `<label class="fx-hpi" for="fx-rhp-${k}-${id}"><span>${n}</span><input id="fx-rhp-${k}-${id}" type="file" accept="image/*" capture="environment"></label>`)
      .join('')}</div></div>
<div style="grid-column:1/-1"><label for="fx-rnote-${id}">Anything the owner should know? (optional)</label><input id="fx-rnote-${id}" maxlength="300" placeholder="e.g. small chip on the windshield from the highway"></div></div>
<div class="err" id="fx-rer-${id}"></div><div class="wsa"><button class="btn" data-a="fx-ret" data-id="${id}">Submit return</button></div></details></div>`;
  };
  /* owner: what to do while the vehicle is out, and once the renter hands it back */
  const ownerActive = (r, id, act, handover) => {
    const q = r.rq,
      top = r.hv && window.ZHO ? ZHO.ownerBack(r) : '';
    if (q && !q.redo) {
      const o = r.out || {};
      return `${top}<div class="fx-rq"><b>The renter returned the vehicle</b> <span class="mu" style="font-size:12px">${esc(fmtD(q.t))} ${esc(tm(q.t))}</span>
<div class="fx-cmp"><div><span class="mu">At release</span><b>${o.odo != null ? Number(o.odo).toLocaleString('en-PH') + ' km' : '—'}</b><span>fuel ${esc(o.fuel || '—')}</span></div><div><span class="mu">Renter says now</span><b>${Number(q.odo).toLocaleString('en-PH')} km</b><span>fuel ${esc(q.fuel)}${o.odo != null ? ' · driven ' + Number(q.odo - o.odo).toLocaleString('en-PH') + ' km' : ''}</span></div></div>
<p class="mu" style="font-size:13px;margin:8px 0 0">${locLine(q)}<br>Renter’s note: ${esc(q.note)}</p>${flagList(q)}${stagePhotos(q)}
<p style="font-size:14px;margin:10px 0 6px">Walk around the vehicle and compare it with these photos, the odometer and the fuel gauge. <b>Check it by ${whenTxt(checkBy(q))}</b>, or the return is accepted as the renter submitted it.</p>
<div class="wsa"><button class="btn sm" data-a="fx-rd" data-id="${id}" data-x="return" data-match="1">Everything matches · mark as returned</button></div>
<details class="fx-cl" style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">Something is different</summary><p class="mu" style="font-size:13px">Record what you see. The renter is asked to confirm or dispute your record, and you can still claim part of the deposit afterwards.</p>${handover('return', 'What is different? e.g. fuel is 1/4, not 3/4; new scratch on the left door')}<div class="wsa">${act('return', 'Record the difference', 'o')}</div></details>
<details class="fx-cl" style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">Ask the renter for new photos</summary><div class="wsa"><input id="fx-rtn-${id}" placeholder="e.g. The odometer photo is blurry" style="flex:1;min-width:200px">${act('retake', 'Send back to the renter', 'o')}</div></details></div>`;
    }
    const wait =
      q && q.redo
        ? waitBox('Waiting for new photos', `You asked the renter to submit the return again: “${esc(q.redo.note)}”.`)
        : waitBox(`On rent until ${esc(r.e)}`, 'When the renter hands the vehicle back, they take the photos and readings in ZamMove and you are notified to check it.', false);
    return `${top}${wait}<details class="fx-cl" style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">The renter cannot submit? Record the return yourself</summary>${handover('return', 'e.g. clean, no new damage')}<div class="wsa">${act('return', 'Record return')}</div></details>`;
  };
  const claimTag = st =>
    `<span class="tag ${st == 'Disputed' ? 'r' : ['Accepted', 'Decided'].includes(st) ? 'g' : ''}">${st == 'Open' ? 'Waiting for the renter' : st == 'Decided' ? 'Decided by ZamMove' : esc(st)}</span>`;
  /* the deposit claim, as each party sees it (role: cu renter, ow owner, ad admin) */
  const claimView = (r, role) => {
    const c = r.claim;
    if (!c) return '';
    const id = esc(r.id);
    let act = '';
    if (role == 'cu' && c.st == 'Open')
      act = `<div class="wsa"><button class="btn sm" data-a="fx-cr" data-id="${id}" data-x="accept">Accept ${peso(c.amt)}</button><input id="fx-crn-${id}" placeholder="Why do you disagree? e.g. the dent is in the release photos" style="flex:1;min-width:220px"><button class="btn o sm" data-a="fx-cr" data-id="${id}" data-x="dispute">Dispute</button></div><p class="mu" style="font-size:12px;margin:4px 0 0">If you dispute, a ZamMove administrator decides from the handover photos and both explanations.</p>`;
    if (role == 'ad' && ['Open', 'Disputed'].includes(c.st))
      act = `<div class="wsf" style="margin-top:8px"><div><label for="fx-cda-${id}">Amount to keep (₱)</label><input id="fx-cda-${id}" type="number" min="0" max="${c.amt}" value="${c.amt}"></div><div style="grid-column:1/-1"><label for="fx-cdn-${id}">Reason for the decision</label><input id="fx-cdn-${id}" placeholder="e.g. scratch is new; dent already in the release photos"></div></div><div class="wsa"><button class="btn sm" data-a="fx-cd" data-id="${id}">Decide claim</button></div>`;
    return `<div class="vz-bc fx-claim" style="margin-top:8px"><div class="row" style="padding:0"><b>Deposit claim</b>${claimTag(c.st)}</div>
<p style="margin:6px 0;font-size:14px">${role == 'ow' ? 'You claim' : 'The owner claims'} <b>${peso(c.amt)}</b> of the ${peso(depOf(r))} deposit: ${esc(c.reason)}</p>${thumbs((c.ph || []).map((x, i) => [x, 'Evidence ' + (i + 1)]))}
${c.why ? `<div class="note" style="margin-top:6px">The renter disputes: ${esc(c.why)}</div>` : ''}${c.decision ? `<div class="ok" style="margin-top:6px">ZamMove decided: keep ${peso(c.final)}. ${esc(c.decision)}</div>` : c.st == 'Accepted' ? `<div class="ok" style="margin-top:6px">The renter accepted the claim.</div>` : ''}${act}</div>`;
  };
  const settleLine = r =>
    r.settle
      ? `<div class="ok" style="margin-top:8px">Deposit settlement: ${peso(r.settle.dep)} deposit${r.settle.kept ? ' − ' + peso(r.settle.kept) + ' kept for the claim' : ''} = <b>${peso(r.settle.refund)}</b> ${r.settle.by == 'owner' ? 'refunded to the renter by the owner' : 'refunded to the renter by ZamMove'}.</div>`
      : '';

  /* The landing page, home page and public price table read RV (one card per rental model).
     Rebuild it from the vehicles owners actually offer, so every page shows the same rental fleet. */
  const ARTK = { sd: 'r1', su: 'r3', mv: 'r2' };
  const rebuildRV = () => {
    if (!Array.isArray(S.rentList)) return;
    const models = groups().map(g => {
      const id = 'rv_' + g.k.replace(/[^a-z0-9]/g, ''),
        art0 = ARTK[g.type] || g.type,
        ph = (g.units.find(x => x.photo) || {}).photo;
      try {
        if (typeof ART == 'object' && ART[art0]) ART[id] = ART[art0];
        if (typeof VS == 'object') VS[id] = SYM[g.type] || 'v-van';
        if (typeof VI == 'object') VI[id] = VI[g.type] || (g.type == 'sd' ? 'car' : 'van');
        if (typeof PHOTO == 'object' && ph) PHOTO[id] = ph;
      } catch (e) {}
      return {
        id,
        n: g.name,
        sp: `${range(g.units.map(x => x.seats))} seats · ${list(g.units.map(x => x.trans))}`,
        day: Math.min(...g.units.map(x => +x.day)),
        type: g.type,
      };
    });
    RV.splice(0, RV.length, ...models);
    try {
      if (typeof PS == 'object' && !RV.some(x => x.id == PS.rv) && RV[0]) PS.rv = RV[0].id;
    } catch (e) {}
  };
  const _onState = ZAPI.onState;
  ZAPI.onState = v => {
    _onState(v);
    rebuildRV();
  };
  rebuildRV();

  /* ---------------- customer: rent a vehicle ---------------- */
  const datesCard = () => {
    const t = todayPH();
    return `<div class="card"><h2 style="font-size:20px">1. When do you need it?</h2><div class="grid g2" style="gap:8px"><div><label for="fx-s">Start date</label><input id="fx-s" type="date" min="${t}" value="${esc(FX.s)}"></div><div><label for="fx-e">End date</label><input id="fx-e" type="date" min="${FX.s || t}" value="${esc(FX.e)}"></div><div><label for="fx-pt">Pickup time</label>${tmSel('fx-pt', FX.pt)}</div><div><label for="fx-rt">Return time</label>${tmSel('fx-rt', FX.rt)}</div></div>${FX.s && FX.s == FX.e && FX.rt <= FX.pt ? '<p class="err" style="margin:8px 0 0">On a one-day rental the return time must be after the pickup time.</p>' : ''}
<p class="mu" style="font-size:13px;margin:8px 0 0">${nDays() ? `${nDays()} day${nDays() > 1 ? 's' : ''} · only vehicles free on every one of those days are shown as available.` : FX.s && FX.e ? '<span class="err">The end date must be on or after the start date.</span>' : 'Choose your dates to see which vehicles are free.'}</p></div>`;
  };
  const modelsCard = () => {
    const G = groups();
    if (!G.length && (S.rentList || []).length)
      return `<div class="card"><h2 style="font-size:20px">2. Choose a vehicle</h2>${ZCAT.rentFilters()}<div class="empty">No vehicle matches these filters. Clear a filter to see more.</div></div>`;
    if (!G.length)
      return `<div class="card"><h2 style="font-size:20px">2. Choose a vehicle</h2><div class="empty">No vehicles are offered for rent yet. Vehicle owners can offer theirs from the Vehicle Owner workspace → Rentals.</div></div>`;
    return `<div class="card"><h2 style="font-size:20px">2. Choose a vehicle</h2>${window.ZCAT && ZCAT.rentFilters ? ZCAT.rentFilters() : ''}<div class="fx-grid">${G.map(
      g => {
        const av = g.units.filter(isFree).length,
          first = g.units.find(u => u.photo) || g.units[0];
        return `<button class="fx-model ${FX.m == g.k ? 'on' : ''}" data-a="fx-model" data-k="${esc(g.k)}" ${nDays() && !av ? 'aria-disabled="true"' : ''}>${pic(first.photo, g.type)}<b>${esc(g.name)}</b><span class="mu">${esc(tyOf(g.type).n)} · ${range(g.units.map(u => u.seats))} seats</span><span class="fx-pr">${range(
          g.units.map(u => u.day),
          peso
        )}/day</span><span class="tag ${!nDays() ? '' : av ? 'g' : 'r'}">${nDays() ? (av ? av + ' of ' + g.units.length + ' available' : 'None free on these dates') : g.units.length + ' unit' + (g.units.length > 1 ? 's' : '')}</span></button>`;
      }
    ).join('')}</div></div>`;
  };
  const modelCard = () => {
    const g = groups().find(x => x.k == FX.m);
    if (!g) return '';
    const ty = tyOf(g.type),
      inf = info(g.type),
      free = g.units.filter(isFree),
      taken = g.units.length - free.length,
      d = nDays();
    return `<div class="card" id="fx-model"><div class="fx-head">${pic((g.units.find(u => u.photo) || {}).photo, g.type, 'fx-hero')}<div><h2 style="font-size:22px;margin:0">${esc(g.name)}</h2><p class="mu" style="margin:4px 0 0">${esc(ty.n)}${inf.use ? ' · ' + esc(inf.use) : ''}</p></div></div>
<div class="vz-g" style="margin-top:12px"><b>General information</b>${row('Vehicle type', esc(ty.n))}${row('Capacity', esc(ty.cap || g.units[0].cap || '—'))}${row('Seats (incl. driver)', range(g.units.map(u => u.seats)))}${row('Transmission', esc(list(g.units.map(u => u.trans))))}${row('Fuel', esc(list(g.units.map(u => u.fuel))))}${row('Model years', range(g.units.map(u => u.year)))}${row(
      'Daily rate',
      range(
        g.units.map(u => u.day),
        peso
      )
    )}${row(
      'Refundable deposit',
      range(
        g.units.map(u => u.dep || DEP),
        peso
      )
    )}</div>
<h2 style="font-size:20px;margin-top:16px">3. Pick a unit${d ? ` <span class="mu" style="font-size:14px;font-weight:400">· ${free.length} available ${FX.s} → ${FX.e}</span>` : ''}</h2>
${!d ? '<div class="note">Choose your dates above first; units already reserved on those dates are hidden.</div>' : ''}
<div class="fx-units">${(d ? free : g.units)
      .map(
        u => `<div class="fx-unit ${FX.u == u.id ? 'on' : ''}">${pic(u.photo, u.type)}<div class="fx-ub"><b>${esc(u.color || '')} ${esc(g.name)}${u.year ? ' (' + esc(u.year) + ')' : ''}</b>
<div class="mu" style="font-size:13px">Plate ${esc(u.plate)} · ${esc(u.seats || '?')} seats · ${esc(u.trans || '—')} · ${esc(u.fuel || '—')} · owner ${esc(u.owner)} · deposit ${peso(u.dep || DEP)}</div>${u.desc ? `<div class="mu" style="font-size:13px">“${esc(u.desc)}”</div>` : ''}
<div class="fx-pr">${peso(u.day)}/day${d ? ` · <b>${peso(u.day * d)}</b> for ${d} day${d > 1 ? 's' : ''}` : ''}</div></div>
${d ? `<button class="btn ${FX.u == u.id ? '' : 'o'} sm" data-a="fx-unit" data-id="${esc(u.id)}">${FX.u == u.id ? 'Selected' : 'Choose'}</button>` : ''}</div>`
      )
      .join(
        ''
      )}</div>${d && taken ? `<p class="mu" style="font-size:13px">${taken} more unit${taken > 1 ? 's are' : ' is'} reserved on some of these dates.</p>` : ''}</div>`;
  };
  const requestCard = () => {
    const u = (S.rentList || []).find(x => x.id == FX.u);
    if (!u || !nDays() || !isFree(u)) return '';
    const d = nDays(),
      tot = u.day * d,
      dep = u.dep || DEP;
    const wdOk = +u.drvDay > 0,
      wd = wdOk && FX.wd;
    return `<div class="card${wd ? ' fx-wd' : ''}" id="fx-req"><h2 style="font-size:20px">4. Your details</h2>${
      wdOk
        ? `<div class="fx-wdq" role="radiogroup" aria-label="Who drives?"><label class="p-ck"><input type="radio" name="fx-wd" value="0"${wd ? '' : ' checked'}><span><b>I drive</b> (self-drive: license needed)</span></label><label class="p-ck"><input type="radio" name="fx-wd" value="1"${wd ? ' checked' : ''}><span><b>With a driver</b> (+${peso(u.drvDay)}/day, valid ID only)</span></label></div>`
        : ''
    }
<div class="vz-g">${row('Vehicle', `${esc(u.color || '')} ${esc(u.brand)} ${esc(u.model)} · ${esc(u.plate)}`)}${row('Dates', `${FX.s} ${T12(FX.pt)} → ${FX.e} ${T12(FX.rt)} (${d} day${d > 1 ? 's' : ''})`)}${row('Rental', `${peso(u.day)} × ${d} = <b>${peso(tot)}</b>`)}${row('Refundable deposit', peso(dep))}${row('Total to pay before pickup', `<b>${peso(tot + dep)}</b>`)}</div>
<label>Pickup location</label><div class="ac"><input id="rp" data-a="ac" autocomplete="off" placeholder="Search a place in Zamboanga City"><div class="sug" id="s-rp" hidden></div></div><button type="button" class="btn o sm" style="margin-top:8px" data-a="loc" data-f="rp" data-m="lm2">Use my current location</button><div class="mu" id="lm2" style="font-size:12px;margin-top:4px"></div>
<label>Return location</label><div class="ac"><input id="rr" data-a="ac" autocomplete="off" placeholder="Search a place in Zamboanga City"><div class="sug" id="s-rr" hidden></div></div>
<div class="grid g2" style="gap:8px"><div><label for="rl">Driver’s license number</label><input id="rl"></div><div><label for="rx">License expiry</label><input id="rx" type="date"></div></div>
<label for="ri">Photo of valid ID</label><input id="ri" type="file" accept="image/*"><label for="rlp">Photo of driver’s license</label><input id="rlp" type="file" accept="image/*">
<div class="vz-g"><b>Before you rent</b><ul style="margin:6px 0 0;padding-left:20px;color:var(--tx2);font-size:14px;line-height:1.6"><li>The owner reviews and approves your request. You can cancel while it is Pending or Approved.</li><li>Once approved, you and the owner sign a rental contract: in ZamMove, or on the printed copy at pickup. You can read it here at any time.</li><li>While you drive, you share your phone’s location from My rentals so the owner can see the vehicle. Tracking stops when the vehicle is returned.</li><li>You pay only after the owner approves: the full ${peso(tot + dep)} (rental + ${peso(dep)} refundable deposit) before pickup, to the owner’s GCash or in cash. The owner confirms it, keeps the deposit and refunds it when the rental is completed.</li><li>At pickup and return the owner takes 6 photos (front, back, both sides, odometer, fuel gauge). Check and confirm them in My rentals: they protect you if there is a damage claim.</li><li>The deposit is refunded when the rental is completed, minus any damage claim you accept or ZamMove approves (the owner has ${CLAIM_DAYS()} days after the return to claim).</li><li>Your license must be valid until the return date. Bring it and the ID you upload.</li><li>Pickup and return are within Zamboanga City only. Check the plate, color and condition at pickup.</li></ul></div>
<div class="err" id="fx-er">${esc(FX.err)}</div><button class="btn" data-a="fx-req">Submit rental request</button></div>`;
  };
  const myRentals = () => {
    const mine = (S.rn || [])
      .filter(r => r.cu == (S.me || {}).em)
      .slice()
      .reverse();
    const paid = r => ZPAY.sum(r.id),
      pend = r => ZPAY.pending(r.id);
    return `<div class="card"><h2 style="font-size:20px">My rentals</h2>${
      mine.length
        ? mine
            .map(r => {
              const bal = ZPAY.r2(r.tot + depOf(r) - paid(r)),
                i = RF.indexOf(r.st),
                stop = ['Cancelled', 'Rejected'].includes(r.st),
                v = (S.vh || []).find(x => x.id == r.veh),
                o = r.owner ? user(r.owner) : null,
                last = (r.hist || []).slice(-1)[0] || {};
              return `<div style="padding:12px 0;border-bottom:1px solid var(--bd)"><b>${esc(r.vn)}</b> ${tag(r.st, !stop)}
<div class="mu" style="font-size:13px">${span(r)} (${r.days} day${r.days > 1 ? 's' : ''}) · Ref ${esc(r.id)}<br>Rental ${peso(r.tot)} + deposit ${peso(depOf(r))} · Verified paid ${peso(paid(r))}${pend(r) ? ' · ' + peso(pend(r)) + ' waiting for the owner to confirm' : ''} · <b>Balance ${peso(Math.max(0, bal))}</b></div>
${r.st == 'Rejected' && last.note ? `<div class="note">Owner’s reason: ${esc(last.note)}</div>` : ''}
${v && !stop ? `<div class="vz-g" style="margin-top:8px">${v.photo ? `<img class="fx-thumb" src="${esc(v.photo)}" alt="">` : ''}${row('Plate number', `<b class="n">${esc(v.plate)}</b>`)}${row('Color', esc(v.color || '—'))}${o ? row('Owner', `${esc(o.name || '')}${o.ph ? ' · <span class="n">' + esc(o.ph) + '</span>' : ''}`) : ''}</div>` : ''}
${r.out || r.cond ? `<div class="mu" style="font-size:13px">${readings(r).replace(/^<br>/, '')}</div>` : ''}${handPhotos(r)}${window.ZHO ? ZHO.renter(r) : ''}${returnBox(r)}${renterChecks(r)}${claimView(r, 'cu')}${settleLine(r)}${renterRefund(r)}${window.ZCT ? ZCT.renterBar(r) : ''}
${stop ? '' : `<div class="steps">${RF.map((s, j) => `<span class="st ${j <= i ? 'd' : ''}">${s}</span>`).join('')}</div>`}
${r.st == 'Pending' ? `<div class="fx-wait" role="status"><span class="fx-spin" aria-hidden="true"></span><div><b>Waiting for the owner to review your request</b><p>The owner checks your ID, license and dates. Do not pay yet: the payment form opens here once the request is approved, and you are notified.</p></div></div>` : ''}${!stop && r.st != 'Pending' && r.st != 'Completed' && bal - pend(r) > 0.005 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><input id="rpa${r.id}" type="number" placeholder="Amount" style="flex:1;min-width:100px"><select id="rpm${r.id}" style="flex:1;min-width:100px">${gcOf(r.owner) ? '<option>GCash</option>' : ''}<option>Cash</option></select>${gcOf(r.owner) ? `<input id="rpr${r.id}" inputmode="numeric" placeholder="GCash ref (GCash only)" style="flex:1;min-width:140px">` : ''}<button class="btn sm" data-a="rnpay" data-id="${r.id}">Submit payment</button></div><div class="mu" style="font-size:12px">${r.st == 'Approved' ? `Pay the full ${peso(r.tot + depOf(r))} before pickup. ` : ''}The first ${peso(depOf(r))} goes to the deposit. ${gcOf(r.owner) ? `GCash: send it to the owner’s GCash <b class="n">${esc(gcNo(gcOf(r.owner).no))}</b> (${esc(gcOf(r.owner).name)}), then enter the reference here. ` : 'The owner has not added a GCash number yet, so pay in cash. '}Cash: hand it to the owner at pickup. The owner confirms each payment and keeps the deposit until the rental is completed.</div>` : ''}
${rejectedPays(r)}${changeBox(r)}${cancelBox(r)}${closedWhy(r)}${r.st == 'Completed' && !r.settle ? '<div class="ok">Completed. Deposit refunded (simulated).</div>' : ''}${msg['e' + r.id] ? `<div class="err">${esc(msg['e' + r.id])}</div>` : ''}</div>`;
            })
            .join('')
        : '<div class="empty">No rentals yet.</div>'
    }</div>`;
  };
  rent = function () {
    return `<h1>Rent a vehicle</h1><p class="mu">Drive it yourself, or with a driver where the owner offers one. From verified ZamMove owners. Pickup and return within Zamboanga City. Each vehicle has its own refundable deposit (from ${peso(DEP)}).</p>
<div class="fx-col">${datesCard()}${modelsCard()}${modelCard()}${requestCard()}${myRentals()}</div>`;
  };

  /* ---------------- owner / admin: rentals ---------------- */
  /* after the return: complete with the full deposit refunded, or claim part of it within the claim period */
  const ownerReturned = (r, id, act) => {
    const c = r.claim,
      dep = depOf(r),
      end = r.back ? new Date(new Date(r.back.t).getTime() + CLAIM_DAYS() * 864e5) : null,
      within = !end || Date.now() <= end.getTime();
    if (S.ws == 'admin' && c && !['Accepted', 'Decided'].includes(c.st)) return '';
    if (!c)
      return `<p class="mu" style="font-size:13px">Inspect the vehicle against the return photos. ${within ? `If something is damaged or missing, you can claim part of the ${peso(dep)} deposit until ${esc(fmtD(end))}.` : 'The claim period has ended.'}</p><div class="wsa">${act('complete', 'Complete · refund full deposit')}</div>${
        within
          ? `<details class="card fx-cl" style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">Keep part of the deposit</summary><div class="wsf"><div><label for="fx-ca-${id}">Amount to keep (₱, up to ${peso(dep)})</label><input id="fx-ca-${id}" type="number" min="1" max="${dep}" placeholder="e.g. 3500"></div><div style="grid-column:1/-1"><label for="fx-cre-${id}">What is it for?</label><input id="fx-cre-${id}" placeholder="e.g. repaint of a new scratch on the left door (shop quote attached)"></div><div style="grid-column:1/-1"><label for="fx-cp-${id}">Photos of the damage or the receipt (up to 6)</label><input id="fx-cp-${id}" type="file" accept="image/*" multiple></div></div><div class="wsa"><button class="btn d sm" data-a="fx-claim" data-id="${id}">Send claim to the renter</button></div></details>`
          : ''
      }`;
    if (['Accepted', 'Decided'].includes(c.st))
      return `<p class="mu" style="font-size:13px">Claim settled: keep ${peso(c.final)}, refund ${peso(dep - c.final)} to the renter.</p><div class="wsa">${act('complete', 'Complete rental')}</div>`;
    return `<p class="mu" style="font-size:13px">${c.st == 'Disputed' ? 'The renter disputes the claim. A ZamMove administrator will decide.' : 'Waiting for the renter to accept or dispute the claim.'}</p>`;
  };
  const reqList = rs =>
    rs.length
      ? rs
          .map(r => {
            const c = user(r.cu),
              dep = ZPAY.sum(r.id, 'deposit'),
              fee = ZPAY.sum(r.id, 'rental'),
              v = (S.vh || []).find(x => x.id == r.veh) || {},
              id = esc(r.id),
              act = (a, l, cls = '') =>
                `<button class="btn ${cls} sm" data-a="fx-rd" data-id="${id}" data-x="${a}">${l}</button>`;
            const handover = (when, ph) =>
              `<div class="wsf" style="margin-top:8px"><div><label for="fx-odo-${id}">Odometer at ${when} (km)</label><input id="fx-odo-${id}" type="number" min="0" inputmode="numeric" placeholder="${r.out ? 'at release ' + esc(r.out.odo) : 'e.g. 52300'}"></div><div><label for="fx-fl-${id}">Fuel level at ${when}</label><select id="fx-fl-${id}">${FUEL.map(f => `<option>${f}</option>`).join('')}</select></div><div style="grid-column:1/-1"><label for="fx-n-${id}">Condition at ${when}</label><input id="fx-n-${id}" placeholder="${ph}"></div><div style="grid-column:1/-1"><span class="fx-lab">Photos at ${when} (all ${HP().length} required)</span><div class="fx-hpin">${HP()
                .map(
                  ([k, n]) =>
                    `<label class="fx-hpi" for="fx-hp-${k}-${id}"><span>${n}</span><input id="fx-hp-${k}-${id}" type="file" accept="image/*" capture="environment"></label>`
                )
                .join('')}</div></div></div>`;
            const signedBoth = !!(r.ct && r.ct.sg && r.ct.sg.cu && r.ct.sg.ow);
            const step =
              r.st == 'Pending'
                ? `${r.withDrv ? `<div class="wsf" style="margin-top:8px"><div><label for="fx-dsel-${id}">Driver for this rental (+${peso(r.withDrv.day)}/day)</label><select id="fx-dsel-${id}"><option value="">Choose</option><option value="${esc((S.me || {}).em)}">Me</option>${(S.myDrivers || []).filter(e => e != (S.me || {}).em).map(e => `<option value="${esc(e)}">${esc(user(e).name || e)}</option>`).join('')}</select></div></div>` : ''}<div class="wsa">${act('approve', 'Approve')}<input id="fx-n-${id}" placeholder="Reason (for rejecting)" style="flex:1;min-width:160px">${act('reject', 'Reject', 'd')}</div>`
                : r.st == 'Approved'
                  ? `<p class="mu" style="font-size:13px">Verified payments: deposit ${peso(dep)} of ${peso(depOf(r))} · rental fee ${peso(fee)} of ${peso(r.tot)}. ${!paidUp(r) ? 'Waiting for the full payment: confirm each payment below once it is in your GCash or in your hand.' : !signedBoth ? 'Waiting for the contract to be signed by both of you.' : r.hv ? 'Ready for the pickup check below.' : 'At pickup: check the renter’s license and ID against the photos, walk around the vehicle together, then record the readings and release.'}</p>${ownerPays(r)}${
                      r.hv && window.ZHO
                        ? ZHO.ownerOut(r, paidUp(r) && signedBoth, () => (r.withDrv ? `<div class="wsa">${act('release', 'Start the rental')}</div>` : `${handover('release', 'e.g. small scratch on rear bumper, spare tire and jack included')}<div class="wsa">${act('release', 'Save the record for the renter to confirm')}</div>`))
                        : `${handover('release', 'e.g. small scratch on rear bumper, spare tire and jack included')}<div class="wsa">${act('release', 'Release vehicle')}</div>`
                    }`
                  : r.st == 'Active'
                    ? ownerActive(r, id, act, handover)
                    : r.st == 'Returned'
                      ? ownerReturned(r, id, act)
                      : '';
            return `<div class="card" style="margin-top:12px"><div class="row" style="padding-top:0"><b>${esc(r.vn)} <span class="n mu">${esc(v.plate || '')}</span></b>${tag(r.st, ['Approved', 'Active', 'Completed'].includes(r.st))}</div>
<div class="mu" style="font-size:13px">${esc(r.id)} · ${span(r)} (${r.days} day${r.days > 1 ? 's' : ''}) · ${peso(r.tot)} + ${peso(depOf(r))} deposit<br>Renter: ${esc(c.name || r.cu)}${c.ph ? ' · <span class="n">' + esc(c.ph) + '</span>' : ''} · license ${esc(r.lic || '—')} (valid to ${esc(r.exp || '—')})<br>Pickup ${esc(r.pu || '—')} · return ${esc(r.rt || '—')}${readings(r)}</div>
${r.ip || r.lp ? `<div class="wsa">${r.ip ? `<a href="#" data-a="fx-img" data-src="${esc(r.ip)}"><img class="fx-thumb" src="${esc(r.ip)}" alt="ID"></a>` : ''}${r.lp ? `<a href="#" data-a="fx-img" data-src="${esc(r.lp)}"><img class="fx-thumb" src="${esc(r.lp)}" alt="License"></a>` : ''}</div>` : ''}${handPhotos(r)}${claimView(r, S.ws == 'admin' ? 'ad' : 'ow')}${settleLine(r)}${window.ZCT ? ZCT.ownerBar(r) : ''}${ownerChange(r)}${step}${ownerRefund(r)}${closedWhy(r)}</div>`;
          })
          .join('')
      : '<div class="card empty" style="margin-top:12px">No rental requests yet.</div>';
  const msgBox = () =>
    FXm.t
      ? `<div class="vz-m ${FXm.good ? 'good' : 'bad'}" role="status" aria-live="polite">${esc(FXm.t)}</div>`
      : '';
  const ownerRent = () => {
    const em = (S.me || {}).em,
      mine = (S.vh || []).filter(v => v.owner == em),
      ok = mine.filter(v => v.approval == 'Approved'),
      rs = (S.rn || [])
        .filter(r => r.veh && mine.some(v => v.id == r.veh))
        .slice()
        .reverse(),
      open = rs.filter(r => !['Completed', 'Cancelled', 'Rejected'].includes(r.st)),
      done = rs.filter(r => ['Completed', 'Cancelled', 'Rejected'].includes(r.st));
    return `<h1>Rentals</h1><p class="mu">Offer your approved vehicles for self-drive rental. Customers see the model information, photo, color, year and rate, and request specific dates. You approve each request.</p>${msgBox()}${(S.me || {}).rentPaused || (user((S.me || {}).em) || {}).rentPaused ? '<div class="err" style="margin-top:10px"><b>Your vehicles are hidden from renters.</b> You have owed ZamMove rental commission for over 14 days. Remit it under Earnings → Remit to ZamMove and they are listed again.</div>' : ''}${gcashCard()}
<h2 style="font-size:20px;margin-top:16px">Your vehicles</h2>${
      ok.length
        ? ok
            .map(v => {
              const r = v.rent || {},
                id = esc(v.id),
                sel = (k, opts, cur) =>
                  `<select id="fx-${k}-${id}">${opts.map(o => `<option ${o == cur ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
              return `<div class="card" style="margin-top:12px"><div class="fx-head">${pic(v.photo, v.type, 'fx-hero')}<div style="flex:1;min-width:0"><div class="row" style="padding-top:0"><b>${esc(v.brand)} ${esc(v.model)} <span class="n mu">${esc(v.plate)}</span></b>${r.on ? '<span class="tag g">Offered for rent</span>' : '<span class="tag">Not offered</span>'}</div><div class="mu" style="font-size:13px">${esc(tyOf(v.type).n)} · ${esc(v.color || '')} ${esc(v.year || '')} · status ${esc(v.status)}</div></div></div>
<div class="wsf"><div><label for="fx-day-${id}">Daily rate (₱)</label><input id="fx-day-${id}" type="number" min="300" value="${esc(r.day || '')}" placeholder="e.g. 2500"></div><div><label for="fx-dep-${id}">Refundable deposit (₱, min ${peso(DEP)})</label><input id="fx-dep-${id}" type="number" min="${DEP}" value="${esc(r.dep || DEP)}"></div><div><label for="fx-drv-${id}">With your driver (₱/day extra, 0 = self-drive only)</label><input id="fx-drv-${id}" type="number" min="0" step="50" value="${esc(r.drv || 0)}"></div><div><label for="fx-seats-${id}">Seats (incl. driver)</label><input id="fx-seats-${id}" type="number" min="1" max="30" value="${esc(v.seats || info(v.type).seats || '')}"></div><div><label for="fx-trans-${id}">Transmission</label>${sel('trans', ['Manual', 'Automatic'], v.trans)}</div><div><label for="fx-fuel-${id}">Fuel</label>${sel('fuel', ['Diesel', 'Gasoline', 'Electric'], v.fuel)}</div><div><label for="fx-ph-${id}">New photo (shown to customers)</label><input id="fx-ph-${id}" type="file" accept="image/*"></div></div>
<div class="wsa"><button class="btn sm" data-a="fx-vr" data-id="${id}" data-on="1">${r.on ? 'Save rental details' : 'Offer for rent'}</button>${r.on ? `<button class="btn o sm" data-a="fx-vr" data-id="${id}" data-on="0">Stop offering</button>` : ''}<button class="btn o sm" data-a="fx-vp" data-id="${id}">Update photo</button></div>${v.status != 'Available' ? '<p class="mu" style="font-size:13px">Customers only see it while its status is Available.</p>' : ''}</div>`;
            })
            .join('')
        : '<div class="card empty" style="margin-top:12px">No approved vehicles yet. Register one under Vehicles; once an admin approves it you can offer it here.</div>'
    }
<h2 style="font-size:20px;margin-top:20px">Requests</h2>${reqList(open)}${done.length ? `<details style="margin-top:12px"><summary class="mu" style="cursor:pointer">History (${done.length})</summary>${reqList(done)}</details>` : ''}`;
  };
  const adminRent = () => {
    const rs = (S.rn || [])
      .filter(r => r.veh)
      .slice()
      .reverse();
    return `<h1>Rentals</h1><p class="mu">Every self-drive rental. Owners normally handle their own requests; administrators can step in.</p>${msgBox()}${reqList(rs.filter(r => !['Completed', 'Cancelled', 'Rejected'].includes(r.st)))}<details style="margin-top:12px"><summary class="mu" style="cursor:pointer">Closed rentals</summary>${reqList(rs.filter(r => ['Completed', 'Cancelled', 'Rejected'].includes(r.st)))}</details>`;
  };
  if (window.ZW && ZW.NAV && ZW.PG) {
    ZW.NAV.owner.splice(2, 0, ['rent', 'Rentals', 'doc']);
    ZW.PG.owner.rent = ownerRent;
    const i = ZW.NAV.admin.findIndex(n => n[0] == 'veh');
    ZW.NAV.admin.splice(i + 1, 0, ['rn', 'Rentals', 'doc']);
    ZW.PG.admin.rn = adminRent;
  }

  /* ---------------- driver profile for customers ---------------- */
  const activeTrack = () => {
    const act = (S.bk || [])
      .filter(x => !['Cancelled', 'Rejected'].includes(x.st))
      .reverse()
      .sort((a, c) => (a.st == 'Completed') - (c.st == 'Completed'));
    return act.find(x => x.id == msg.tid) || act[0];
  };
  const enhance = (h, b) => {
    if (!b || !b.drvUser) return h;
    const i = h.indexOf('<b>Your driver and vehicle</b>');
    if (i < 0) return h;
    const u = user(b.drvUser),
      v = (S.vh || []).find(x => x.id == b.veh) || {};
    let tail = h
      .slice(i)
      .replace(
        '<b>Your driver and vehicle</b>',
        `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>Your driver and vehicle</b><button class="btn o sm" data-a="fx-prof" data-id="${esc(b.id)}">View profile</button></div>`
      );
    if (u.photo)
      tail = tail.replace(
        /<span class="zav">[^<]*<\/span>/,
        `<img class="zav fx-av" src="${esc(u.photo)}" alt="">`
      );
    if (v.photo)
      tail = tail.replace(
        '<div class="vz-i"><span class="mu">Vehicle</span>',
        `<img class="fx-vph" src="${esc(v.photo)}" alt="Vehicle photo"><div class="vz-i"><span class="mu">Vehicle</span>`
      );
    return h.slice(0, i) + tail;
  };
  const _bc = bcard;
  bcard = function (b) {
    return enhance(_bc(b), b);
  };
  const _tr = track;
  track = function () {
    const b = activeTrack();
    let h = enhance(_tr(), b);
    if (b && b.wz && window.ZGPS && ZGPS.TRACK_ST.includes(b.st))
      h = h.replace(
        '<div id="zmap"',
        `<div class="vz-bc" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:180px"><b>Your driver shared a Waze link</b><br><span class="mu" style="font-size:13px">Opens Waze’s live drive view (useful if the map below stops updating).</span></span><a class="btn sm fx-wzb" href="${esc(b.wz)}" target="_blank" rel="noopener">Follow on Waze</a></div><div id="zmap"`
      );
    return h;
  };
  const closeModal = () => {
    const m = $('#fx-modal');
    if (m) m.remove();
  };
  const modal = html => {
    closeModal();
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="fx-modal" class="fx-ov" data-a="fx-close"><div class="fx-dlg card" role="dialog" aria-modal="true">${html}<button class="btn o" style="width:100%;margin-top:14px" data-a="fx-close">Close</button></div></div>`
    );
  };
  const profile = b => {
    const u = user(b.drvUser),
      v = (S.vh || []).find(x => x.id == b.veh) || {},
      r = (S.ratings || {})[b.drvUser],
      live = window.ZGPS && ZGPS.TRACK_ST.includes(b.st),
      ty = tyOf(v.type || b.vid);
    modal(`<div style="display:flex;gap:14px;align-items:center">${u.photo ? `<img class="fx-big" src="${esc(u.photo)}" alt="">` : `<span class="zav lg">${esc(initials(u.name || b.drv))}</span>`}<div><h2 style="margin:0;font-size:22px">${esc(u.name || b.drv)}</h2><span class="tag g">Verified driver</span><div class="mu" style="font-size:13px;margin-top:4px">${r ? '★ ' + r.avg.toFixed(1) + ' · ' + r.n + ' review' + (r.n > 1 ? 's' : '') : 'No reviews yet'} · ${u.trips || 0} completed trip${u.trips == 1 ? '' : 's'}${u.since ? ' · driving with ZamMove since ' + fmtD(u.since) : ''}</div></div></div>
${live && u.ph ? `<div class="vz-g" style="margin-top:12px">${row('Phone', `<span class="n">${esc(u.ph)}</span> · <a href="tel:${esc(u.ph)}">Call</a>`)}</div>` : ''}
<div class="vz-g" style="margin-top:12px"><b>Vehicle</b>${v.photo ? `<img class="fx-vph" src="${esc(v.photo)}" alt="">` : `<div class="fx-art" style="height:110px">${art(v.type || b.vid)}</div>`}${row('Make and model', esc([v.brand, v.model].filter(Boolean).join(' ') || b.vn) + (v.year ? ' (' + esc(v.year) + ')' : ''))}${row('Plate number', `<b class="n">${esc(v.plate || '—')}</b>`)}${row('Color', esc(v.color || '—'))}${row('Type', esc(ty.n))}${row('Capacity', esc(v.cap || ty.cap || '—'))}${v.seats ? row('Seats', esc(v.seats)) : ''}</div>
<div class="vz-g" style="margin-top:12px"><b>Recent reviews</b>${(u.revs || []).length ? u.revs.map(x => `<div style="padding:6px 0;border-bottom:1px solid var(--bd)"><span style="color:var(--ac)">${stars(x.r)}</span> <span class="mu" style="font-size:12px">${fmtD(x.cr)}</span><div style="font-size:14px">${esc(x.t)}</div></div>`).join('') : '<p class="mu" style="margin:4px 0 0">No reviews yet.</p>'}</div>
<p class="mu" style="font-size:12px;margin:10px 0 0">Address, birthday and license details are never shown to customers.</p>`);
  };

  /* ---------------- profile photo (Profile page) ---------------- */
  const _set = settings;
  settings = function () {
    let h = _set();
    const me = user((S.me || {}).em);
    if (!S.me || !h.includes('<span class="grp">Personal details</span>')) return h;
    if (!(ZW && ZW.ok && ZW.ok(me, 'driver')) && !me.photo) return h; // customers: no driver-photo card
    if (me.photo)
      h = h.replace(/<div class="zav lg">[^<]*<\/div>/, `<img class="fx-big" src="${esc(me.photo)}" alt="">`);
    const card = `<span class="grp">Profile photo</span><div class="card"><p class="mu" style="margin:0 0 8px;font-size:14px">${ZW && ZW.ok && ZW.ok(me, 'driver') ? 'Customers see this photo on your driver card so they can recognise you at pickup.' : 'Shown to customers if you drive for ZamMove.'} Use a clear photo of your face.</p><input id="fx-pf" type="file" accept="image/*"><div class="wsa" style="margin-top:8px"><button class="btn sm" data-a="fx-pfs">Save photo</button>${me.photo ? '<button class="btn o sm" data-a="fx-pfr">Remove</button>' : ''}</div></div>`;
    return h.replace(
      '<span class="grp">Personal details</span>',
      card + '<span class="grp">Personal details</span>'
    );
  };

  /* ---------------- driver: Waze link + GPS help ---------------- */
  const wazeBox = b =>
    `<div class="vz-bc" id="fx-wz" style="margin-top:10px"><b>Waze (optional backup)</b> ${b.wz ? '<span class="tag g">Shared</span>' : ''}
<p class="mu" style="margin:6px 0;font-size:14px">Navigate with the Waze button, then in Waze tap <b>Share drive</b> → <b>Copy link</b> and paste it here. The customer gets a “Follow on Waze” button on their Track page.</p>
<div class="wsa"><input id="fx-wzu" value="${esc(b.wz || '')}" placeholder="https://waze.com/ul?..." style="flex:1;min-width:200px"><button class="btn sm" data-a="fx-wz" data-id="${esc(b.id)}">Share link</button>${b.wz ? `<button class="btn o sm" data-a="fx-wzx" data-id="${esc(b.id)}">Remove</button>` : ''}</div></div>`;
  const httpHelp = `<div class="note" id="fx-gpshelp" style="margin-top:8px"><b>Why live location can’t start here:</b> this page was opened with <span class="n">http://</span>, and phone browsers only share GPS on <span class="n">https://</span>. On the PC running ZamMove, run <span class="n">npm run https-cert</span> once and restart the server, then open the <span class="n">https://…:3443</span> address it prints. Until then, keep updating the trip status and share a Waze link below.</div>`;
  const afterRender = () => {
    const g = document.getElementById('gpsbox');
    if (g) {
      const b = (S.bk || []).find(x => x.id == g.dataset.bid);
      if (b && !document.getElementById('fx-wz')) g.insertAdjacentHTML('afterend', wazeBox(b));
      if (window.isSecureContext === false && !document.getElementById('fx-gpshelp'))
        g.insertAdjacentHTML('beforeend', httpHelp);
    }
    const wsp = S.ws && S.ws != 'customer' ? (S.wp || {})[S.ws] : '';
    if (!(wsp == 'rent' || wsp == 'rn')) FXm = {};
  };
  const _rnd = render;
  render = function () {
    _rnd();
    try {
      afterRender();
    } catch (e) {
      console.error('[zammove] fleet', e);
    }
  };

  /* ---------------- events ---------------- */
  const after = async (r, okText) => {
    r = await r;
    FXm = { t: r.ok ? okText : r.err, good: r.ok };
    if (r.ok) toast(okText);
    render();
    return r;
  };
  document.addEventListener('change', e => {
    if (e.target.name == 'fx-wd') {
      FX.wd = e.target.value == '1';
      return render();
    }
    const id = e.target.id;
    if (id == 'fx-pt' || id == 'fx-rt') return (FX[id == 'fx-pt' ? 'pt' : 'rt'] = e.target.value), render();
    if (id != 'fx-s' && id != 'fx-e') return;
    FX[id == 'fx-s' ? 's' : 'e'] = e.target.value;
    if (id == 'fx-s' && FX.e && FX.e < FX.s) FX.e = FX.s;
    const u = (S.rentList || []).find(x => x.id == FX.u);
    if (u && !isFree(u)) FX.u = '';
    FX.err = '';
    render();
  });
  document.addEventListener('keydown', e => e.key == 'Escape' && closeModal());
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a^="fx-"]');
      if (!t) return;
      const a = t.dataset.a,
        id = t.dataset.id;
      if (a == 'fx-close') {
        if (e.target === t) closeModal();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (a == 'fx-model') {
        FX.m = FX.m == t.dataset.k ? '' : t.dataset.k;
        FX.u = '';
        render();
        const m = $('#fx-model');
        if (m) m.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (a == 'fx-unit') {
        FX.u = id;
        render();
        const r = $('#fx-req');
        if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (a == 'fx-req') {
        const done = busyBtn(t);
        const r = await ZAPI.act('createRental', {
          veh: FX.u,
          s: FX.s,
          e: FX.e,
          pt: FX.pt,
          rtm: FX.rt,
          pu: val('rp'),
          rt: val('rr'),
          withDrv: !!FX.wd && +((S.rentList || []).find(x => x.id == FX.u) || {}).drvDay > 0,
          lic: val('rl'),
          exp: val('rx'),
          ip: await pimg('ri'),
          lp: await pimg('rlp'),
        });
        done();
        if (!r.ok) {
          FX.err = r.err;
          const x = $('#fx-er');
          if (x) x.textContent = r.err;
          return;
        }
        Object.assign(FX, { m: '', u: '', err: '' });
        toast('Request sent. Wait for the owner to approve it before paying.');
        render();
        const w = document.querySelector('.fx-wait');
        if (w) w.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (a == 'fx-prof') {
        const b = (S.bk || []).find(x => x.id == id);
        return b && profile(b);
      }
      if (a == 'fx-img')
        return modal(`<img src="${esc(t.dataset.src)}" alt="" style="width:100%;border-radius:12px">`);
      if (a == 'fx-rd') {
        const match = t.dataset.match == '1',
          n = $((t.dataset.x == 'retake' ? '#fx-rtn-' : '#fx-n-') + id);
        const L = {
          approve: 'Rental approved',
          reject: 'Rental rejected',
          release: 'Vehicle released',
          return: match ? 'Marked as returned' : 'Return recorded',
          retake: 'Sent back to the renter',
          complete: 'Rental completed',
        };
        const odo = $('#fx-odo-' + id),
          fl = $('#fx-fl-' + id),
          ph = {};
        if (['release', 'return'].includes(t.dataset.x) && !match)
          for (const [k] of HP()) ph[k] = await pimg('fx-hp-' + k + '-' + id);
        return after(
          ZAPI.act('rentalDecision', {
            id,
            act: t.dataset.x,
            note: n ? n.value.trim() : '',
            driver: val('fx-dsel-' + id),
            odo: odo ? odo.value.trim() : '',
            fuel: fl ? fl.value : '',
            ph,
            match,
          }),
          L[t.dataset.x]
        );
      }
      if (a == 'fx-vr') {
        const on = t.dataset.on == '1';
        return after(
          ZAPI.act('vehRent', {
            id,
            on,
            day: val('fx-day-' + id),
            dep: val('fx-dep-' + id),
            drv: val('fx-drv-' + id),
            seats: val('fx-seats-' + id),
            trans: val('fx-trans-' + id),
            fuel: val('fx-fuel-' + id),
          }),
          on ? 'Vehicle offered for rent' : 'Vehicle removed from rentals'
        );
      }
      if (a == 'fx-cxl') {
        FX.cxl = id;
        return render();
      }
      if (a == 'fx-pd') {
        const done = busyBtn(t),
          r = await ZAPI.act('rentalPayDispute', { id, note: val('fx-pdn-' + id), pf: await pimg('fx-pdf-' + id) });
        done();
        if (!r.ok) {
          const x = $('#fx-pde-' + id);
          if (x) x.textContent = r.err;
          return;
        }
        toast('Sent to ZamMove. You are notified of the decision.');
        return render();
      }
      if (a == 'fx-chg') {
        const done = busyBtn(t),
          r = await ZAPI.act('rentalChange', { id, s: val('fx-cs-' + id), e: val('fx-ce-' + id), why: val('fx-cw-' + id) });
        done();
        if (!r.ok) {
          const x = $('#fx-cer-' + id);
          if (x) x.textContent = r.err;
          return;
        }
        toast(r.applied ? 'Dates changed' : 'Request sent to the owner');
        return render();
      }
      if (a == 'fx-cha') {
        const good = t.dataset.ok == '1';
        return after(ZAPI.act('rentalChangeAnswer', { id, ok: good, note: val('fx-chn-' + id) }), good ? 'New dates accepted' : 'Request declined');
      }
      if (a == 'fx-gc') return after(ZAPI.act('ownerGcash', { no: val('fx-gcn'), name: val('fx-gcm') }), 'GCash number saved');
      if (a == 'fx-rf') return after(ZAPI.act('rentalRefund', { id, method: val('fx-rfm-' + id), ref: val('fx-rfr-' + id) }), 'Refund recorded. The renter is asked to confirm.');
      if (a == 'fx-rfa') {
        const good = t.dataset.ok == '1',
          n = $('#fx-rfn-' + id);
        const r = await ZAPI.act('rentalRefundAck', { id, ok: good, note: n ? n.value.trim() : '' });
        toast(r.ok ? (good ? 'Thanks, refund confirmed' : 'Reported. ZamMove will contact you.') : r.err);
        return render();
      }
      if (a == 'fx-pv') {
        const good = t.dataset.ok == '1',
          n = $('#fx-pvn-' + id);
        return after(ZAPI.act('payVerify', { id, ok: good, note: n ? n.value.trim() : '' }), good ? 'Cash confirmed' : 'Marked as not received');
      }
      if (a == 'fx-ret') {
        const done = busyBtn(t),
          ph = {},
          pt = {};
        for (const [k] of HP()) {
          ph[k] = await pimg('fx-rhp-' + k + '-' + id);
          const f = ($('#fx-rhp-' + k + '-' + id) || {}).files;
          if (f && f[0]) pt[k] = f[0].lastModified;
        }
        /* where the vehicle is handed back (a signal for the owner; the return still goes through without it) */
        const pos = await new Promise(res => {
          if (!navigator.geolocation) return res({ err: 'not supported on this device' });
          navigator.geolocation.getCurrentPosition(
            g => res({ loc: { lat: g.coords.latitude, lng: g.coords.longitude, acc: g.coords.accuracy } }),
            e => res({ err: e.code == 1 ? 'permission denied' : e.code == 3 ? 'timed out' : 'unavailable' }),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
          );
        });
        const r = await ZAPI.act('rentalReturn', { id, odo: val('fx-rodo-' + id), fuel: val('fx-rfl-' + id), note: val('fx-rnote-' + id), ph, pt, loc: pos.loc, locErr: pos.err });
        done();
        if (!r.ok) {
          const x = $('#fx-rer-' + id);
          if (x) x.textContent = r.err; // keep everything the renter already filled in
          return;
        }
        toast('Return submitted. The owner will check the vehicle.');
        return render();
      }
      if (a == 'fx-ck') {
        const ok = t.dataset.ok == '1',
          n = $('#fx-ckn-' + t.dataset.st + '-' + id);
        const r = await ZAPI.act('rentalCheck', {
          id,
          stage: t.dataset.st,
          ok,
          note: n ? n.value.trim() : '',
        });
        toast(r.ok ? (ok ? 'Thanks, record confirmed' : 'Your report was sent to the owner') : r.err);
        return render();
      }
      if (a == 'fx-claim') {
        const files = [...(($('#fx-cp-' + id) || {}).files || [])].slice(0, 6);
        const ph = await Promise.all(files.map(f => new Promise(res => img(f, res))));
        return after(
          ZAPI.act('rentalClaim', {
            id,
            amt: val('fx-ca-' + id),
            reason: val('fx-cre-' + id),
            ph: ph.filter(Boolean),
          }),
          'Claim sent to the renter'
        );
      }
      if (a == 'fx-cr') {
        const r = await ZAPI.act('rentalClaimReply', { id, act: t.dataset.x, note: val('fx-crn-' + id) });
        toast(
          r.ok
            ? t.dataset.x == 'accept'
              ? 'Claim accepted'
              : 'Claim disputed. An administrator will decide.'
            : r.err
        );
        return render();
      }
      if (a == 'fx-cd')
        return after(
          ZAPI.act('rentalClaimDecide', { id, amt: val('fx-cda-' + id), note: val('fx-cdn-' + id) }),
          'Claim decided'
        );
      if (a == 'fx-vp')
        return after(ZAPI.act('vehPhoto', { id, photo: await pimg('fx-ph-' + id) }), 'Photo updated');
      if (a == 'fx-pfs') {
        const r = await ZAPI.act('setPhoto', { photo: await pimg('fx-pf') });
        toast(r.ok ? 'Profile photo saved' : r.err);
        return render();
      }
      if (a == 'fx-pfr') {
        const r = await ZAPI.act('setPhoto', { photo: '' });
        toast(r.ok ? 'Profile photo removed' : r.err);
        return render();
      }
      if (a == 'fx-wz' || a == 'fx-wzx') {
        const r = await ZAPI.act('wazeLink', { id, url: a == 'fx-wz' ? val('fx-wzu') : '' });
        toast(r.ok ? (a == 'fx-wz' ? 'Waze link shared with the customer' : 'Waze link removed') : r.err);
        return render();
      }
    },
    true
  );

  /* ---------------- styles ---------------- */
  const css = document.createElement('style');
  css.textContent = `
.fx-wzb{text-decoration:none!important}
.fx-col{display:flex;flex-direction:column;gap:14px;margin-top:14px}
.fx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.fx-model{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;padding:10px;border:1.5px solid var(--bd);border-radius:16px;background:var(--s);color:var(--tx);cursor:pointer;font:inherit}
.fx-model:hover{border-color:var(--bd2)}.fx-model.on{border-color:var(--acd);box-shadow:0 0 0 2px var(--acs)}
.fx-model[aria-disabled=true]{opacity:.55}
.fx-pic{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;background:var(--s2)}
.fx-art{display:grid;place-items:center;background:var(--s2);border-radius:12px;color:var(--tx2)}
.fx-art svg{width:85%;max-height:100%}
.fx-pr{font-weight:600;color:var(--tx)}
.fx-head{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.fx-hero{width:160px;max-width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:12px;flex:none}
.fx-units{display:flex;flex-direction:column;gap:10px}
.fx-unit{display:flex;gap:12px;align-items:center;padding:10px;border:1.5px solid var(--bd);border-radius:14px;flex-wrap:wrap}
.fx-unit.on{border-color:var(--acd)}
.fx-unit .fx-pic{width:130px;flex:none}
.fx-ub{flex:1;min-width:180px;display:flex;flex-direction:column;gap:2px}
.fx-thumb{width:84px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--bd)}
.fx-wdq{display:grid;gap:6px;margin:0 0 10px}.fx-wd label[for="rl"],.fx-wd #rl,.fx-wd label[for="rx"],.fx-wd #rx,.fx-wd label[for="rlp"],.fx-wd #rlp,.fx-wd label[for="rr"],.fx-wd #rr,.fx-wd #s-rr{display:none}
.fx-flags{margin:8px 0;padding:10px 12px;border-radius:10px;background:var(--zb-wait-bg,#fbf0d9);color:var(--zb-wait,#8a5a12);font-size:14px}.fx-flags ul{margin:4px 0;padding-left:20px}.fx-flags span{color:var(--tx2);font-size:13px}
.fx-pays{margin-top:8px;padding:12px;border:1px solid var(--bd);border-radius:12px}.fx-pay{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--bd)}.fx-pay:first-of-type{border-top:0}.fx-pay>.wsa{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end;flex:1 1 360px}.fx-pay>.wsa input{flex:1 1 140px;min-width:0;width:auto}
.fx-ret{margin-top:10px}.fx-ret>details>summary{list-style:none;display:inline-flex;cursor:pointer}.fx-ret>details>summary::-webkit-details-marker{display:none}.fx-ret>details[open]>summary{margin-bottom:4px}
.fx-rq{margin-top:10px;padding:14px;border:1px solid var(--bd);border-left:5px solid var(--zb-pri,#0f766e);border-radius:12px;background:var(--s2)}.fx-cmp{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.fx-cmp>div{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:10px;background:var(--s);border:1px solid var(--bd);font-size:14px}.fx-cmp b{font-size:17px}
.fx-wait{display:flex;gap:12px;align-items:flex-start;margin-top:10px;padding:12px 14px;border-radius:12px;background:var(--zb-wait-bg,#fbf0d9);color:var(--zb-wait,#8a5a12)}.fx-wait p{margin:4px 0 0;color:var(--tx2);font-size:14px}.fx-spin{flex:none;width:18px;height:18px;margin-top:2px;border-radius:50%;border:3px solid currentColor;border-right-color:transparent;animation:fxspin 1s linear infinite}@keyframes fxspin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.fx-spin{animation:none;border-right-color:currentColor}}
.fx-vph{width:100%;max-height:200px;object-fit:cover;border-radius:12px;margin:8px 0}
.fx-av{object-fit:cover;padding:0}
.fx-big{width:72px;height:72px;border-radius:50%;object-fit:cover;flex:none}
.fx-hpw{margin-top:10px}
.fx-hps{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin-top:6px}
.fx-hps a{display:flex;flex-direction:column;gap:2px;text-decoration:none;color:var(--tx2);font-size:12px}
.fx-hps img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;border:1px solid var(--bd)}
.fx-lab{display:block;font-weight:500;margin:6px 0 4px}
.fx-hpin{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
.fx-hpi{display:flex;flex-direction:column;gap:4px;padding:8px;border:1.5px dashed var(--bd2,#9aa3b4);border-radius:12px;font-size:13px;font-weight:500;margin:0}
.fx-hpi input{font-size:12px;min-width:0;width:100%}
.fx-ov{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:16px}
.fx-dlg{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto}
@media (max-width:520px){.fx-unit .fx-pic{width:100%}}`;
  document.head.appendChild(css);
  render();
})();
