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
  const FX = { s: '', e: '', m: '', u: '', err: '' }; // rental picker: dates, model key, unit id
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
    (S.rentList || []).forEach(u => {
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
      ? `<div class="ok" style="margin-top:8px">Deposit settlement: ${peso(r.settle.dep)} deposit${r.settle.kept ? ' − ' + peso(r.settle.kept) + ' kept for the claim' : ''} = <b>${peso(r.settle.refund)}</b> refunded to the renter (simulated).</div>`
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
    return `<div class="card"><h2 style="font-size:20px">1. When do you need it?</h2><div class="grid g2" style="gap:8px"><div><label for="fx-s">Start date</label><input id="fx-s" type="date" min="${t}" value="${esc(FX.s)}"></div><div><label for="fx-e">End date</label><input id="fx-e" type="date" min="${FX.s || t}" value="${esc(FX.e)}"></div></div>
<p class="mu" style="font-size:13px;margin:8px 0 0">${nDays() ? `${nDays()} day${nDays() > 1 ? 's' : ''} · only vehicles free on every one of those days are shown as available.` : FX.s && FX.e ? '<span class="err">The end date must be on or after the start date.</span>' : 'Choose your dates to see which vehicles are free.'}</p></div>`;
  };
  const modelsCard = () => {
    const G = groups();
    if (!G.length)
      return `<div class="card"><h2 style="font-size:20px">2. Choose a vehicle</h2><div class="empty">No vehicles are offered for rent yet. Vehicle owners can offer theirs from the Vehicle Owner workspace → Rentals.</div></div>`;
    return `<div class="card"><h2 style="font-size:20px">2. Choose a vehicle</h2><div class="fx-grid">${G.map(
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
    return `<div class="card" id="fx-req"><h2 style="font-size:20px">4. Your details</h2>
<div class="vz-g">${row('Vehicle', `${esc(u.color || '')} ${esc(u.brand)} ${esc(u.model)} · ${esc(u.plate)}`)}${row('Dates', `${FX.s} → ${FX.e} (${d} day${d > 1 ? 's' : ''})`)}${row('Rental', `${peso(u.day)} × ${d} = <b>${peso(tot)}</b>`)}${row('Refundable deposit', peso(dep))}${row('Total to pay before pickup', `<b>${peso(tot + dep)}</b>`)}</div>
<label>Pickup location</label><div class="ac"><input id="rp" data-a="ac" autocomplete="off" placeholder="Search a place in Zamboanga City"><div class="sug" id="s-rp" hidden></div></div><button type="button" class="btn o sm" style="margin-top:8px" data-a="loc" data-f="rp" data-m="lm2">Use my current location</button><div class="mu" id="lm2" style="font-size:12px;margin-top:4px"></div>
<label>Return location</label><div class="ac"><input id="rr" data-a="ac" autocomplete="off" placeholder="Search a place in Zamboanga City"><div class="sug" id="s-rr" hidden></div></div>
<div class="grid g2" style="gap:8px"><div><label for="rl">Driver’s license number</label><input id="rl"></div><div><label for="rx">License expiry</label><input id="rx" type="date"></div></div>
<label for="ri">Photo of valid ID</label><input id="ri" type="file" accept="image/*"><label for="rlp">Photo of driver’s license</label><input id="rlp" type="file" accept="image/*">
<div class="vz-g"><b>Before you rent</b><ul style="margin:6px 0 0;padding-left:20px;color:var(--tx2);font-size:14px;line-height:1.6"><li>The owner reviews and approves your request. You can cancel while it is Pending or Approved.</li><li>Once approved, you and the owner sign a rental contract: in ZamMove, or on the printed copy at pickup. You can read it here at any time.</li><li>While you drive, you share your phone’s location from My rentals so the owner can see the vehicle. Tracking stops when the vehicle is returned.</li><li>Pay the full ${peso(tot + dep)} (rental + ${peso(dep)} refundable deposit) before pickup. The vehicle is released only when both are verified.</li><li>At pickup and return the owner takes 6 photos (front, back, both sides, odometer, fuel gauge). Check and confirm them in My rentals: they protect you if there is a damage claim.</li><li>The deposit is refunded when the rental is completed, minus any damage claim you accept or ZamMove approves (the owner has ${CLAIM_DAYS()} days after the return to claim).</li><li>Your license must be valid until the return date. Bring it and the ID you upload.</li><li>Pickup and return are within Zamboanga City only. Check the plate, color and condition at pickup.</li></ul></div>
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
<div class="mu" style="font-size:13px">${r.s} → ${r.e} (${r.days} day${r.days > 1 ? 's' : ''}) · Ref ${esc(r.id)}<br>Rental ${peso(r.tot)} + deposit ${peso(depOf(r))} · Verified paid ${peso(paid(r))}${pend(r) ? ' · ' + peso(pend(r)) + ' waiting for cashier' : ''} · <b>Balance ${peso(Math.max(0, bal))}</b></div>
${r.st == 'Rejected' && last.note ? `<div class="note">Owner’s reason: ${esc(last.note)}</div>` : ''}
${v && !stop ? `<div class="vz-g" style="margin-top:8px">${v.photo ? `<img class="fx-thumb" src="${esc(v.photo)}" alt="">` : ''}${row('Plate number', `<b class="n">${esc(v.plate)}</b>`)}${row('Color', esc(v.color || '—'))}${o ? row('Owner', `${esc(o.name || '')}${o.ph ? ' · <span class="n">' + esc(o.ph) + '</span>' : ''}`) : ''}</div>` : ''}
${r.out || r.cond ? `<div class="mu" style="font-size:13px">${readings(r).replace(/^<br>/, '')}</div>` : ''}${handPhotos(r)}${renterChecks(r)}${claimView(r, 'cu')}${settleLine(r)}${window.ZCT ? ZCT.renterBar(r) : ''}
${stop ? '' : `<div class="steps">${RF.map((s, j) => `<span class="st ${j <= i ? 'd' : ''}">${s}</span>`).join('')}</div>`}
${!stop && r.st != 'Completed' && bal - pend(r) > 0.005 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><input id="rpa${r.id}" type="number" placeholder="Amount" style="flex:1;min-width:100px"><select id="rpm${r.id}" style="flex:1;min-width:100px"><option>GCash</option><option>Cash</option></select><input id="rpr${r.id}" inputmode="numeric" placeholder="GCash ref (GCash only)" style="flex:1;min-width:140px"><button class="btn sm" data-a="rnpay" data-id="${r.id}">Submit payment</button></div><div class="mu" style="font-size:12px">${r.st == 'Approved' || r.st == 'Pending' ? `Pay the full ${peso(r.tot + depOf(r))} before pickup. ` : ''}The first ${peso(depOf(r))} goes to the deposit. GCash is simulated in this prototype; a cashier verifies each payment.</div>` : ''}
${['Pending', 'Approved'].includes(r.st) ? `<div style="margin-top:6px"><button class="btn d sm" data-a="rncan" data-id="${r.id}">Cancel</button></div>` : ''}${r.st == 'Completed' && !r.settle ? '<div class="ok">Completed. Deposit refunded (simulated).</div>' : ''}${msg['e' + r.id] ? `<div class="err">${esc(msg['e' + r.id])}</div>` : ''}</div>`;
            })
            .join('')
        : '<div class="empty">No rentals yet.</div>'
    }</div>`;
  };
  rent = function () {
    return `<h1>Self-drive rental</h1><p class="mu">Rent a vehicle without a driver from verified ZamMove owners. Pickup and return within Zamboanga City. Each vehicle has its own refundable deposit (from ${peso(DEP)}).</p>
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
                ? `<div class="wsa">${act('approve', 'Approve')}<input id="fx-n-${id}" placeholder="Reason (for rejecting)" style="flex:1;min-width:160px">${act('reject', 'Reject', 'd')}</div>`
                : r.st == 'Approved'
                  ? `<p class="mu" style="font-size:13px">Verified payments: deposit ${peso(dep)} of ${peso(depOf(r))} · rental fee ${peso(fee)} of ${peso(r.tot)}. ${!paidUp(r) ? 'Waiting for the full payment to be verified by a cashier.' : !signedBoth ? 'Waiting for the contract to be signed by both of you.' : 'At pickup: check the renter’s license and ID against the photos, walk around the vehicle together, then record the readings and release.'}</p>${handover('release', 'e.g. small scratch on rear bumper, spare tire and jack included')}<div class="wsa">${act('release', 'Release vehicle')}</div>`
                  : r.st == 'Active'
                    ? `${handover('return', 'e.g. clean, no new damage')}<div class="wsa">${act('return', 'Record return')}</div>`
                    : r.st == 'Returned'
                      ? ownerReturned(r, id, act)
                      : '';
            return `<div class="card" style="margin-top:12px"><div class="row" style="padding-top:0"><b>${esc(r.vn)} <span class="n mu">${esc(v.plate || '')}</span></b>${tag(r.st, ['Approved', 'Active', 'Completed'].includes(r.st))}</div>
<div class="mu" style="font-size:13px">${esc(r.id)} · ${r.s} → ${r.e} (${r.days} day${r.days > 1 ? 's' : ''}) · ${peso(r.tot)} + ${peso(depOf(r))} deposit<br>Renter: ${esc(c.name || r.cu)}${c.ph ? ' · <span class="n">' + esc(c.ph) + '</span>' : ''} · license ${esc(r.lic || '—')} (valid to ${esc(r.exp || '—')})<br>Pickup ${esc(r.pu || '—')} · return ${esc(r.rt || '—')}${readings(r)}</div>
${r.ip || r.lp ? `<div class="wsa">${r.ip ? `<a href="#" data-a="fx-img" data-src="${esc(r.ip)}"><img class="fx-thumb" src="${esc(r.ip)}" alt="ID"></a>` : ''}${r.lp ? `<a href="#" data-a="fx-img" data-src="${esc(r.lp)}"><img class="fx-thumb" src="${esc(r.lp)}" alt="License"></a>` : ''}</div>` : ''}${handPhotos(r)}${claimView(r, S.ws == 'admin' ? 'ad' : 'ow')}${settleLine(r)}${window.ZCT ? ZCT.ownerBar(r) : ''}${step}</div>`;
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
    return `<h1>Rentals</h1><p class="mu">Offer your approved vehicles for self-drive rental. Customers see the model information, photo, color, year and rate, and request specific dates. You approve each request.</p>${msgBox()}
<h2 style="font-size:20px;margin-top:16px">Your vehicles</h2>${
      ok.length
        ? ok
            .map(v => {
              const r = v.rent || {},
                id = esc(v.id),
                sel = (k, opts, cur) =>
                  `<select id="fx-${k}-${id}">${opts.map(o => `<option ${o == cur ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
              return `<div class="card" style="margin-top:12px"><div class="fx-head">${pic(v.photo, v.type, 'fx-hero')}<div style="flex:1;min-width:0"><div class="row" style="padding-top:0"><b>${esc(v.brand)} ${esc(v.model)} <span class="n mu">${esc(v.plate)}</span></b>${r.on ? '<span class="tag g">Offered for rent</span>' : '<span class="tag">Not offered</span>'}</div><div class="mu" style="font-size:13px">${esc(tyOf(v.type).n)} · ${esc(v.color || '')} ${esc(v.year || '')} · status ${esc(v.status)}</div></div></div>
<div class="wsf"><div><label for="fx-day-${id}">Daily rate (₱)</label><input id="fx-day-${id}" type="number" min="300" value="${esc(r.day || '')}" placeholder="e.g. 2500"></div><div><label for="fx-dep-${id}">Refundable deposit (₱, min ${peso(DEP)})</label><input id="fx-dep-${id}" type="number" min="${DEP}" value="${esc(r.dep || DEP)}"></div><div><label for="fx-seats-${id}">Seats (incl. driver)</label><input id="fx-seats-${id}" type="number" min="1" max="30" value="${esc(v.seats || info(v.type).seats || '')}"></div><div><label for="fx-trans-${id}">Transmission</label>${sel('trans', ['Manual', 'Automatic'], v.trans)}</div><div><label for="fx-fuel-${id}">Fuel</label>${sel('fuel', ['Diesel', 'Gasoline', 'Electric'], v.fuel)}</div><div><label for="fx-ph-${id}">New photo (shown to customers)</label><input id="fx-ph-${id}" type="file" accept="image/*"></div></div>
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
    const id = e.target.id;
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
          pu: val('rp'),
          rt: val('rr'),
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
        toast('Rental request sent to the owner');
        return render();
      }
      if (a == 'fx-prof') {
        const b = (S.bk || []).find(x => x.id == id);
        return b && profile(b);
      }
      if (a == 'fx-img')
        return modal(`<img src="${esc(t.dataset.src)}" alt="" style="width:100%;border-radius:12px">`);
      if (a == 'fx-rd') {
        const n = $('#fx-n-' + id);
        const L = {
          approve: 'Rental approved',
          reject: 'Rental rejected',
          release: 'Vehicle released',
          return: 'Return recorded',
          complete: 'Rental completed',
        };
        const odo = $('#fx-odo-' + id),
          fl = $('#fx-fl-' + id),
          ph = {};
        if (['release', 'return'].includes(t.dataset.x))
          for (const [k] of HP()) ph[k] = await pimg('fx-hp-' + k + '-' + id);
        return after(
          ZAPI.act('rentalDecision', {
            id,
            act: t.dataset.x,
            note: n ? n.value.trim() : '',
            odo: odo ? odo.value.trim() : '',
            fuel: fl ? fl.value : '',
            ph,
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
            seats: val('fx-seats-' + id),
            trans: val('fx-trans-' + id),
            fuel: val('fx-fuel-' + id),
          }),
          on ? 'Vehicle offered for rent' : 'Vehicle removed from rentals'
        );
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
