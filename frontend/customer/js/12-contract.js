/**
 * 12-contract.js — loaded last.
 *
 * Rental contract
 *   - Issued by the server when the owner approves a rental (a frozen copy of the parties, vehicle, dates,
 *     money and clauses, with a SHA-256 fingerprint). Renter and owner read the same digital copy.
 *   - Sign in ZamMove: tick "I agree", type the full name, draw the signature.
 *   - Or print it: both sign the paper at pickup, and the owner uploads a photo of the signed page.
 *   - The vehicle can only be released once both signatures are in.
 *
 * Rented-vehicle tracking
 *   - Renter: "Share location" in My rentals while the rental is Active (the contract requires it).
 *   - Owner: Vehicle Owner → Rental map shows each rented vehicle, its trail, pickup/return and alerts
 *     when it leaves Zamboanga City. Administrators get the same map for every rental.
 *   - The server only accepts positions from the renter, only while Active, and deletes them at return.
 */
(() => {
  const st = {
    watch: null,
    id: null,
    last: null,
    lastSent: 0,
    msg: '',
    bad: false,
    map: null,
    key: '',
    layers: null,
    fitted: false,
    focus: '',
    pad: null,
  };
  const SHARE_KEY = 'zm_rn_share';
  const ZC = [6.92, 122.08];
  const rnOf = id => (S.rn || []).find(r => r.id == id);
  const me = () => (S.me || {}).em;
  const user = em => (S.users || []).find(u => u.em == em) || {};
  const first = n => String(n || '').split(' ')[0];
  const dt = t => (t ? new Date(t).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const day = d =>
    d
      ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '';
  const ago = t => {
    const s = Math.max(0, Math.round((Date.now() - new Date(t)) / 1000));
    return s < 60
      ? s + ' s ago'
      : s < 3600
        ? Math.round(s / 60) + ' min ago'
        : Math.round(s / 3600) + ' h ago';
  };
  const km = n => Number(n).toLocaleString('en-PH') + ' km';
  const placeOf = t => (typeof coord == 'function' ? coord(t) : null);
  const rad = Math.PI / 180;
  const distM = (a, b) => {
    const x = (b[0] - a[0]) * rad,
      y = (b[1] - a[1]) * rad,
      h = Math.sin(x / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(y / 2) ** 2;
    return 12742e3 * Math.asin(Math.sqrt(h));
  };
  const sigs = r => (r.ct && r.ct.sg) || {};
  const both = r => !!(sigs(r).cu && sigs(r).ow);
  const btn = (a, label, id, cls = 'o') =>
    `<button class="btn ${cls} sm" data-a="${a}" data-id="${esc(id)}">${label}</button>`;

  /* ---------------- the contract document (screen and print) ---------------- */
  const line = '<span class="ct-blank"></span>';
  const cell = x => (x === '' || x == null ? line : esc(x));
  const kv = rows =>
    `<table class="ct-kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
  const sigBox = (role, name, s, ct) => {
    const valid = s && s.h == ct.h;
    const mark = !s
      ? `<div class="ct-sigline"></div>`
      : s.how == 'digital'
        ? `<img class="ct-sig" src="${esc(s.sig)}" alt="Signature of ${esc(name)}">`
        : `<div class="ct-sigline ct-paper">Signed on the printed copy</div>`;
    const note = !s
      ? 'Signature over printed name · Date: ____________'
      : s.how == 'digital'
        ? `Signed electronically in ZamMove on ${esc(dt(s.t))}${valid ? '' : ' · <b>signed a different version</b>'}`
        : `Paper signature recorded on ${esc(dt(s.t))}`;
    return `<div class="ct-sigbox"><div class="ct-role">${role}</div>${mark}<div class="ct-name">${esc(name)}</div><div class="ct-note">${note}</div></div>`;
  };
  const HPn = () => (S.fleet || {}).HANDOVER_PH || [];
  const hPh = rec =>
    rec && rec.ph
      ? `<div class="ct-ph">${HPn()
          .filter(([k]) => rec.ph[k])
          .map(
            ([k, n]) =>
              `<figure><img src="${esc(rec.ph[k])}" alt="${esc(n)}"><figcaption>${esc(n)}</figcaption></figure>`
          )
          .join('')}</div>`
      : 'Front, back, both sides, odometer and fuel gauge photos are taken in ZamMove.';
  const hCk = rec =>
    !rec || !rec.t
      ? line
      : !rec.cu
        ? 'Not answered yet'
        : rec.cu.ok
          ? 'Confirmed on ' + esc(dt(rec.cu.t))
          : 'Reported a difference: ' + esc(rec.cu.note);
  /* section after the handover: what happened to the deposit */
  const settleDoc = r => {
    const c = r.claim,
      st = r.settle;
    if (!c && !st) return '';
    const dep = (st && st.dep) || r.dep || r.ct.terms.dep;
    const rows = [['Security deposit', peso(dep)]];
    if (c) {
      rows.push(['Owner’s claim', `${peso(c.amt)} on ${esc(dt(c.t))}: ${esc(c.reason)}`]);
      rows.push([
        'Renter’s answer',
        c.st == 'Open'
          ? 'Not answered yet'
          : c.why
            ? 'Disputed: ' + esc(c.why)
            : c.st == 'Accepted'
              ? 'Accepted'
              : 'No answer; decided by ZamMove',
      ]);
      if (c.decision) rows.push(['ZamMove decision', `Keep ${peso(c.final)}. ${esc(c.decision)}`]);
    }
    if (st) {
      rows.push(['Amount kept', peso(st.kept)]);
      rows.push(['Refunded to the renter', `<b>${peso(st.refund)}</b> on ${esc(dt(st.t))}`]);
    }
    return `<h4 class="ct-h4">Deposit settlement</h4>${kv(rows)}`;
  };
  const docHTML = r => {
    const ct = r.ct,
      T = ct.terms,
      sg = ct.sg || {},
      o = r.out || {},
      b = r.back || {};
    return `<article class="ct-doc">
<div class="ct-hd"><div><div class="ct-brand">ZamMove · Zamboanga City</div><h1>Self-Drive Vehicle Rental Agreement</h1></div>
<div class="ct-meta">Contract no. <b>${esc(T.no)}</b><br>Rental ref. ${esc(T.rental)}<br>Issued ${esc(day(T.issued))}<br>Terms version ${esc(T.v)}</div></div>
<p>This agreement is made between the <b>Owner</b> and the <b>Renter</b> named below for the vehicle, period and price stated in sections 1 to 3, under the terms in section 4.</p>
<h3>1. The parties</h3>
<table class="ct-t"><tr><th></th><th>Owner (lessor)</th><th>Renter (lessee)</th></tr>
<tr><th>Full name</th><td>${cell(T.owner.name)}</td><td>${cell(T.renter.name)}</td></tr>
<tr><th>Mobile number</th><td>${cell(T.owner.ph)}</td><td>${cell(T.renter.ph)}</td></tr>
<tr><th>Address</th><td>${cell(T.owner.ad)}</td><td>${cell(T.renter.ad)}</td></tr>
<tr><th>Driver’s license no.</th><td>—</td><td>${cell(T.renter.lic)}${T.renter.exp ? ' (valid until ' + esc(day(T.renter.exp)) + ')' : ''}</td></tr></table>
<h3>2. The vehicle</h3>
<div class="ct-2">${kv([
      ['Make and model', cell(T.veh.name)],
      ['Model year', cell(T.veh.year)],
      ['Color', cell(T.veh.color)],
      ['Plate number', `<b>${cell(T.veh.plate)}</b>`],
    ])}${kv([
      ['Type', cell(T.veh.type)],
      ['Seats (incl. driver)', cell(T.veh.seats)],
      ['Transmission', cell(T.veh.trans)],
      ['Fuel', cell(T.veh.fuel)],
    ])}</div>
<h3>3. Rental period and payment</h3>
<div class="ct-2">${kv([
      ['Start date', esc(day(T.s))],
      ['End (return) date', esc(day(T.e))],
      ['Number of days', esc(T.days)],
      ['Pickup location', cell(T.pu)],
      ['Return location', cell(T.rt)],
    ])}${kv([
      ['Daily rate', peso(T.day)],
      ['Rental fee', `${peso(T.day)} × ${esc(T.days)} = <b>${peso(T.tot)}</b>`],
      ['Security deposit (refundable)', peso(T.dep)],
      ['Total due before release', `<b>${peso(T.tot + T.dep)}</b>`],
    ])}</div>
<h3>4. Terms and conditions</h3>
<ol class="ct-cl">${T.clauses.map(c => `<li><b>${esc(c.t)}.</b> ${esc(c.x)}</li>`).join('')}</ol>
<h3>5. Handover record</h3>
<table class="ct-t"><tr><th></th><th>At release (pickup)</th><th>At return</th></tr>
<tr><th>Date and time</th><td>${o.t ? esc(dt(o.t)) : line}</td><td>${b.t ? esc(dt(b.t)) : line}</td></tr>
<tr><th>Odometer</th><td>${o.odo != null ? km(o.odo) : line}</td><td>${b.odo != null ? km(b.odo) : line}</td></tr>
<tr><th>Fuel level</th><td>${o.fuel ? esc(o.fuel) : line}</td><td>${b.fuel ? esc(b.fuel) : line}</td></tr>
<tr><th>Condition</th><td>${o.cond ? esc(o.cond) : line}</td><td>${r.cond ? esc(r.cond) : line}</td></tr>
<tr><th>Photos</th><td>${hPh(o)}</td><td>${hPh(b)}</td></tr>
<tr><th>Renter’s check</th><td>${hCk(o)}</td><td>${hCk(b)}</td></tr></table>
${settleDoc(r)}
<h3>6. Signatures</h3>
<p class="ct-small">By signing, both parties confirm they have read and agree to sections 1 to 5.</p>
<div class="ct-sigs">${sigBox('Owner (lessor)', T.owner.name, sg.ow, ct)}${sigBox('Renter (lessee)', T.renter.name, sg.cu, ct)}</div>
<footer class="ct-ft">Document fingerprint (SHA-256): <span class="ct-h">${esc(ct.h)}</span><br>The digital copy is kept in ZamMove: the renter finds it under Rent → My rentals, the owner under Vehicle Owner → Rentals. Any change to the terms would change this fingerprint.</footer>
</article>`;
  };

  /* ---------------- status bars inside the rental cards ---------------- */
  const sigState = (s, mine) =>
    s
      ? `<span class="tag g">${s.how == 'paper' ? 'Signed on paper' : 'Signed'}</span>`
      : `<span class="tag ${mine ? 'r' : ''}">${mine ? 'Your signature needed' : 'Not signed yet'}</span>`;
  const contractBar = (r, isRenter) => {
    if (!r.veh || ['Pending', 'Rejected', 'Cancelled'].includes(r.st)) return '';
    const sg = sigs(r),
      open = r.st == 'Approved',
      mineKey = isRenter ? 'cu' : 'ow',
      canSign = open && !sg[mineKey] && (isRenter ? r.cu == me() : r.owner == me());
    return `<div class="vz-bc ct-bar"><div class="row" style="padding:0"><b>Rental contract${r.ct ? ' ' + esc(r.ct.terms.no) : ''}</b>${both(r) ? '<span class="tag g">Signed by both</span>' : open ? '<span class="tag">Waiting for signatures</span>' : ''}</div>
<div class="mu" style="font-size:13px;margin:6px 0">${isRenter ? 'You' : 'Renter'}: ${sigState(sg.cu, isRenter && canSign)} · ${isRenter ? 'Owner' : 'You'}: ${sigState(sg.ow, !isRenter && canSign)}</div>
${open && !both(r) ? `<p class="mu" style="font-size:13px;margin:0 0 6px">${isRenter ? 'Read the contract and sign it here before pickup, or sign the printed copy the owner brings.' : 'Sign it here and ask the renter to sign in ZamMove, or print it, have both of you sign at pickup and upload a photo of the signed page.'} The vehicle can only be released once it is signed.</p>` : ''}
<div class="wsa">${btn('zct-open', canSign ? 'Read and sign' : 'View contract', r.id, canSign ? '' : 'o')}${btn('zct-print', 'Print', r.id)}</div></div>`;
  };
  const shareBox = r => {
    if (r.st != 'Active' || r.cu != me() || (r.rq && !r.rq.redo)) return ''; // no tracking once the vehicle is handed back
    const on = st.watch != null && st.id == r.id;
    return `<div class="vz-bc" id="rt-box" data-id="${esc(r.id)}" style="margin-top:8px"><b>Share location</b> <span class="tag ${on ? 'g' : 'r'}">${on ? 'Sharing' : 'Not sharing'}</span>
<p class="mu" style="font-size:13px;margin:6px 0">${on ? 'Keep this page open while you drive. Only the owner and ZamMove staff can see the location, and only until the vehicle is returned.' : 'Your contract asks you to share your location while you drive the rented vehicle. Turn it on before you leave the pickup.'}</p>
${on ? btn('zct-gps-stop', 'Pause sharing', r.id) : btn('zct-gps-start', 'Share location', r.id, '')}
<div id="rt-msg" class="vz-m ${st.bad ? 'bad' : 'good'}">${on || st.bad ? esc(st.msg) : ''}</div></div>`;
  };
  const renterBar = r => (r.cu == me() ? contractBar(r, true) + shareBox(r) : '');
  const locText = r => {
    const g = r.gps;
    if (!g) return '<span class="tag">Waiting for the renter to share</span>';
    const stale = !g.off && Date.now() - g.ms > 300000;
    return `${g.off ? '<span class="tag">Paused</span>' : stale ? '<span class="tag r">No signal</span>' : '<span class="tag g">Live</span>'} ${g.inArea === false ? '<span class="tag r">Outside Zamboanga City</span>' : ''} <span class="mu">updated <b class="rt-ago" data-t="${esc(g.t)}">${ago(g.t)}</b></span>`;
  };
  const ownerBar = r => {
    if (!r.veh) return '';
    let h = contractBar(r, false);
    if (r.st == 'Active' && !(r.rq && !r.rq.redo)) // no live map once the renter has handed the vehicle back
      h += `<div class="vz-bc" style="margin-top:8px"><div class="row" style="padding:0"><b>Vehicle location</b><span>${locText(r)}</span></div><div class="wsa" style="margin-top:6px">${btn('zct-track', 'Track on map', r.id, '')}</div></div>`;
    return h;
  };

  /* ---------------- contract window: read, sign, print ---------------- */
  const modal = html => {
    const old = document.getElementById('fx-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="fx-modal" class="fx-ov ct-ov"><div class="fx-dlg card ct-wide" role="dialog" aria-modal="true" aria-label="Rental contract">${html}</div></div>`
    );
  };
  const signPanel = r => {
    const sg = sigs(r),
      who = r.cu == me() ? 'cu' : r.owner == me() ? 'ow' : '';
    if (!who || r.st != 'Approved') return '';
    const other = who == 'cu' ? 'owner' : 'renter';
    let h = '';
    if (!sg[who])
      h += `<div class="card ct-sign" id="ct-sign"><h2 style="font-size:20px;margin:0 0 4px">Sign this contract</h2><p class="mu" style="font-size:14px;margin:0 0 10px">Your electronic signature has the same effect as signing on paper (Electronic Commerce Act, RA 8792).</p>
<label class="ct-chk"><input type="checkbox" id="ct-agree"> I have read all ${r.ct.terms.clauses.length} terms and conditions and I agree to them.</label>
<label for="ct-name">Type your full name as on your account</label><input id="ct-name" autocomplete="name" placeholder="${esc((S.me || {}).name || '')}">
<label>Draw your signature</label><div class="ct-padw"><canvas id="ct-pad" aria-label="Signature pad"></canvas><span class="ct-padh">Sign here with your finger or mouse</span></div>
<div class="wsa"><button class="btn o sm" data-a="zct-clear">Clear</button><button class="btn" data-a="zct-sign" data-id="${esc(r.id)}">Sign contract</button></div><div class="err" id="ct-err"></div></div>`;
    else
      h += `<div class="ok" style="margin-top:12px">You signed this contract${sg[who].how == 'paper' ? ' on paper' : ''}. ${both(r) ? 'It is signed by both of you.' : 'Waiting for the ' + other + '’s signature.'}</div>`;
    if (who == 'ow' && !both(r))
      h += `<details class="card" style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Signed on paper instead?</summary><p class="mu" style="font-size:14px">Print the contract, have the renter (and you) sign it at pickup, then upload a clear photo of the signed signature page. It counts as signed by both of you.</p><input id="ct-photo" type="file" accept="image/*"><div class="wsa" style="margin-top:8px"><button class="btn sm" data-a="zct-paper" data-id="${esc(r.id)}">Record signed paper copy</button></div><div class="err" id="ct-perr"></div></details>`;
    return h;
  };
  const paperPhoto = r => {
    const s =
      sigs(r).cu && sigs(r).cu.how == 'paper'
        ? sigs(r).cu
        : sigs(r).ow && sigs(r).ow.how == 'paper'
          ? sigs(r).ow
          : null;
    return s && s.photo
      ? `<div class="vz-g" style="margin-top:12px"><b>Photo of the signed paper copy</b><img src="${esc(s.photo)}" alt="Signed paper contract" style="width:100%;border-radius:10px;margin-top:8px"></div>`
      : '';
  };
  async function openContract(id) {
    let r = rnOf(id);
    if (!r) return;
    if (!r.ct) {
      const x = await ZAPI.act('rentalContract', { id });
      if (!x.ok) return toast(x.err);
      r = rnOf(id) || r;
      if (!r.ct) r = { ...r, ct: x.ct };
    }
    const keep = document.querySelector('#fx-modal .fx-dlg');
    const top = keep && keep.dataset.ct == id ? keep.scrollTop : 0;
    modal(
      `<div class="ct-tools"><b style="flex:1">Rental contract ${esc(r.ct.terms.no)}</b>${btn('zct-print', 'Print', id)}<button class="btn o sm" data-a="fx-close">Close</button></div>${docHTML(r)}${paperPhoto(r)}${signPanel(r)}`
    );
    const dlg = document.querySelector('#fx-modal .fx-dlg');
    dlg.dataset.ct = id;
    dlg.scrollTop = top;
    initPad();
  }
  function initPad() {
    const c = document.getElementById('ct-pad');
    st.pad = null;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1,
      w = c.clientWidth,
      h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#10213f';
    const pad = (st.pad = { c, inked: false, down: false });
    const at = e => {
      const b = c.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    c.addEventListener('pointerdown', e => {
      pad.down = true;
      c.setPointerCapture(e.pointerId);
      const [x, y] = at(e);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 0.1, y + 0.1);
      g.stroke();
      pad.inked = true;
      c.parentNode.classList.add('inked');
    });
    c.addEventListener('pointermove', e => {
      if (!pad.down) return;
      const [x, y] = at(e);
      g.lineTo(x, y);
      g.stroke();
    });
    const up = () => (pad.down = false);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }
  /* a signature on a white background, trimmed to the ink */
  function padImage() {
    const p = st.pad;
    if (!p || !p.inked) return '';
    const c = p.c,
      g = c.getContext('2d'),
      d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width,
      y0 = c.height,
      x1 = 0,
      y1 = 0;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 <= x0 || y1 <= y0) return '';
    const m = 8,
      o = document.createElement('canvas');
    o.width = x1 - x0 + m * 2;
    o.height = y1 - y0 + m * 2;
    const og = o.getContext('2d');
    og.fillStyle = '#fff';
    og.fillRect(0, 0, o.width, o.height);
    og.drawImage(c, x0, y0, x1 - x0, y1 - y0, m, m, x1 - x0, y1 - y0);
    return o.toDataURL('image/png');
  }
  function printContract(id) {
    const r = rnOf(id);
    if (!r || !r.ct) return openContract(id).then(() => rnOf(id) && rnOf(id).ct && printContract(id));
    let el = document.getElementById('ct-print');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ct-print';
      document.body.appendChild(el);
    }
    el.innerHTML = docHTML(r);
    document.body.classList.add('ct-printing');
    const done = () => {
      document.body.classList.remove('ct-printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => {
      window.print();
      setTimeout(done, 1000);
    }, 60);
  }

  /* ---------------- renter: share the phone's location ---------------- */
  const showMsg = (t, bad) => {
    st.msg = t;
    st.bad = !!bad;
    const e = document.getElementById('rt-msg');
    if (e) {
      e.textContent = t;
      e.className = 'vz-m ' + (bad ? 'bad' : 'good');
    }
  };
  const refreshBox = () => {
    const e = document.getElementById('rt-box'),
      r = e && rnOf(e.dataset.id);
    if (!r) return;
    const t = document.createElement('div');
    t.innerHTML = shareBox(r);
    e.replaceWith(t.firstElementChild || document.createTextNode(''));
  };
  async function send(pos) {
    const c = pos.coords,
      here = [c.latitude, c.longitude],
      t = Date.now();
    if (st.last && t - st.lastSent < 15000 && distM(st.last, here) < 50) return;
    st.last = here;
    st.lastSent = t;
    const r = await ZAPI.act('rentalPing', {
      id: st.id,
      lat: c.latitude,
      lng: c.longitude,
      acc: c.accuracy,
      spd: c.speed,
    });
    if (r.ok)
      showMsg(
        'Last sent ' + new Date().toLocaleTimeString() + ' · accuracy ±' + Math.round(c.accuracy) + ' m'
      );
    else {
      showMsg(r.err, true);
      if (r.stop) stopShare(true);
    }
  }
  function startShare(id) {
    if (!('geolocation' in navigator)) return showMsg('This browser cannot share location.', true);
    if (window.isSecureContext === false)
      return showMsg(
        'Location only works on https:// or localhost. Open ZamMove over HTTPS on your phone.',
        true
      );
    stopShare(true);
    st.id = id;
    st.last = null;
    st.lastSent = 0;
    st.msg = 'Starting… allow location access if your browser asks.';
    st.bad = false;
    try {
      sessionStorage.setItem(SHARE_KEY, id);
    } catch (e) {}
    st.watch = navigator.geolocation.watchPosition(
      send,
      e => {
        showMsg(
          e.code == 1
            ? 'Location permission was denied. Allow it in the browser settings, then tap Share location again.'
            : e.code == 3
              ? 'Waiting for a GPS fix… move to an open area.'
              : 'Could not read your location.',
          true
        );
        if (e.code == 1) stopShare(true);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    refreshBox();
  }
  function stopShare(quiet) {
    if (st.watch != null && 'geolocation' in navigator) navigator.geolocation.clearWatch(st.watch);
    const id = st.id;
    st.watch = null;
    st.id = null;
    try {
      sessionStorage.removeItem(SHARE_KEY);
    } catch (e) {}
    if (!quiet && id) ZAPI.act('rentalGpsStop', { id });
    refreshBox();
  }
  function resume() {
    let saved = null;
    try {
      saved = sessionStorage.getItem(SHARE_KEY);
    } catch (e) {}
    const r = saved && rnOf(saved),
      active = r && r.cu == me() && r.st == 'Active';
    if (st.watch == null && active) startShare(saved);
    else if (st.watch != null && !(rnOf(st.id) && rnOf(st.id).st == 'Active')) stopShare(true);
  }

  /* ---------------- owner / admin: rental map ---------------- */
  const out = () => {
    const admin = S.ws == 'admin';
    return (S.rn || []).filter(r => r.veh && r.st == 'Active' && (admin || r.owner == me()));
  };
  const listHTML = () => {
    const l = out();
    if (!l.length)
      return (
        '<div class="card empty" style="margin-top:12px">None of ' +
        (S.ws == 'admin' ? 'the' : 'your') +
        ' vehicles is rented out right now. Released rentals appear here.</div>'
      );
    const today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
    return `<div class="zw" style="margin-top:12px"><table class="zt"><tr><th>Vehicle</th><th>Renter</th><th>Return</th><th>Location</th><th></th></tr>${l
      .map(r => {
        const v = (S.vh || []).find(x => x.id == r.veh) || {},
          c = user(r.cu),
          g = r.gps;
        return `<tr class="${st.focus == r.id ? 'rt-on' : ''}"><td><b>${esc(r.vn)}</b><br><span class="n mu">${esc(v.plate || '')}</span> · ${esc(v.color || '')}</td><td>${esc(c.name || r.cu)}${c.ph ? `<br><span class="n">${esc(c.ph)}</span>` : ''}</td><td>${esc(day(r.e))}${r.e < today ? ' <span class="tag r">Overdue</span>' : r.e == today ? ' <span class="tag">Due today</span>' : ''}</td><td>${locText(r)}</td><td><div class="wsa" style="margin:0">${g ? btn('zct-focus', st.focus == r.id ? 'Show all' : 'Focus', r.id) + `<a class="btn o sm" href="https://www.google.com/maps?q=${g.lat},${g.lng}" target="_blank" rel="noopener">Google Maps</a>` : ''}${btn('zct-open', 'Contract', r.id)}</div></td></tr>`;
      })
      .join('')}</table></div>`;
  };
  const mapPage = () =>
    `<h1>Rental map</h1><p class="mu">Where your rented-out vehicles are right now. The renter’s phone shares the location while driving, as the rental contract requires. You can see it only between release and return; ZamMove deletes the trail when the vehicle comes back.</p>
<div id="rt-map" class="zmap" style="height:480px;margin-top:12px"></div>
<div class="rt-legend mu"><span><i style="background:#3FB8AF"></i>Live</span><span><i style="background:#9AA3B4"></i>Paused or no signal</span><span><i style="background:#DC2626"></i>Outside Zamboanga City</span><span><i style="background:#111827"></i>Pickup</span><span><i style="background:#C2410C"></i>Return</span></div>
<div id="rt-list">${listHTML()}</div>`;
  if (window.ZW && ZW.NAV && ZW.PG) {
    const oi = ZW.NAV.owner.findIndex(n => n[0] == 'rent');
    ZW.NAV.owner.splice(oi + 1, 0, ['rmap', 'Rental map', 'pin']);
    ZW.PG.owner.rmap = mapPage;
    const ai = ZW.NAV.admin.findIndex(n => n[0] == 'rn');
    ZW.NAV.admin.splice(ai + 1, 0, ['rmap', 'Rental map', 'pin']);
    ZW.PG.admin.rmap = mapPage;
  }
  function draw(refit) {
    if (!st.map || !document.getElementById('rt-map')) return;
    st.layers.clearLayers();
    const pts = [];
    const dot = (ll, color, label, r = 8, big) => {
      L.circleMarker(ll, { radius: r, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 })
        .bindTooltip(label, {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: big ? 'rt-tip' : '',
        })
        .addTo(st.layers);
      pts.push(ll);
    };
    const l = out(),
      shown = st.focus && l.some(r => r.id == st.focus && r.gps) ? l.filter(r => r.id == st.focus) : l;
    shown.forEach(r => {
      const v = (S.vh || []).find(x => x.id == r.veh) || {},
        g = r.gps,
        one = shown.length == 1;
      if (one) {
        const pu = placeOf(r.pu),
          rt = placeOf(r.rt);
        if (pu) dot(pu, '#111827', 'Pickup', 6);
        if (rt) dot(rt, '#C2410C', 'Return', 6);
      }
      if (r.trail && r.trail.length > 1)
        L.polyline(
          r.trail.map(p => [p[0], p[1]]),
          {
            color: g && g.inArea === false ? '#DC2626' : '#0F766E',
            weight: 4,
            opacity: 0.55,
            dashArray: '6 6',
          }
        ).addTo(st.layers);
      if (!g) return;
      const ll = [g.lat, g.lng],
        stale = g.off || Date.now() - g.ms > 300000;
      if (one && g.acc)
        L.circle(ll, { radius: g.acc, color: '#3FB8AF', weight: 1, fillOpacity: 0.1 }).addTo(st.layers);
      dot(
        ll,
        g.inArea === false ? '#DC2626' : stale ? '#9AA3B4' : '#3FB8AF',
        `${v.plate || r.vn} · ${first(user(r.cu).name)}`,
        10,
        true
      );
    });
    const list = document.getElementById('rt-list');
    if (list) list.innerHTML = listHTML();
    if (refit || !st.fitted) {
      if (pts.length > 1) st.map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
      else st.map.setView(pts[0] || ZC, pts.length ? 15 : 13);
      st.fitted = true;
    }
  }
  function mount() {
    resume();
    const el = document.getElementById('rt-map');
    if (!el) {
      if (st.map) st.map.remove();
      st.map = null;
      st.key = '';
      return;
    }
    if (!window.L) {
      el.innerHTML =
        '<div class="note" style="margin:12px">The map could not load (no connection to the map service). The list below still updates.</div>';
      return;
    }
    const key = S.ws + ':' + st.focus;
    let keep = null;
    if (st.map) {
      if (st.key == key) keep = { center: st.map.getCenter(), zoom: st.map.getZoom() };
      st.map.remove();
    }
    st.map = L.map(el, { zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      referrerPolicy: 'strict-origin-when-cross-origin', // OSM tile policy needs a Referer
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(st.map);
    st.layers = L.layerGroup().addTo(st.map);
    st.key = key;
    st.fitted = !!keep;
    if (keep) st.map.setView(keep.center, keep.zoom);
    draw(false);
  }
  /* the 10-second poll calls ZGPS.update() when only positions changed: move the rental markers too */
  if (window.ZGPS) {
    const _u = ZGPS.update;
    ZGPS.update = () => {
      _u();
      draw(false);
    };
  }
  setInterval(
    () => document.querySelectorAll('.rt-ago').forEach(e => (e.textContent = ago(e.dataset.t))),
    1000
  );

  const _rnd = render;
  render = function () {
    _rnd();
    try {
      mount();
    } catch (e) {
      console.error('[zammove] rental map', e);
    }
  };

  /* ---------------- events ---------------- */
  document.addEventListener(
    'click',
    async e => {
      /* the contract window has no data-a on its backdrop (other handlers would swallow checkbox clicks) */
      if (e.target.classList && e.target.classList.contains('ct-ov')) return e.target.remove();
      const t = e.target.closest('[data-a^="zct-"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        id = t.dataset.id;
      if (a == 'zct-open') return openContract(id);
      if (a == 'zct-print') return printContract(id);
      if (a == 'zct-clear') {
        const c = document.getElementById('ct-pad');
        if (c) {
          c.parentNode.classList.remove('inked');
          initPad();
        }
        return;
      }
      if (a == 'zct-sign') {
        const err = $('#ct-err'),
          done = busyBtn(t);
        const r = await ZAPI.act('rentalSign', {
          id,
          agree: !!($('#ct-agree') || {}).checked,
          name: val('ct-name'),
          sig: padImage(),
        });
        done();
        if (!r.ok) {
          if (err) err.textContent = r.err;
          return;
        }
        toast(r.done ? 'Contract signed by both parties' : 'Contract signed');
        render();
        return openContract(id);
      }
      if (a == 'zct-paper') {
        const done = busyBtn(t);
        const r = await ZAPI.act('rentalSign', { id, how: 'paper', photo: await pimg('ct-photo') });
        done();
        if (!r.ok) {
          const x = $('#ct-perr');
          if (x) x.textContent = r.err;
          return;
        }
        toast('Signed paper copy recorded');
        render();
        return openContract(id);
      }
      if (a == 'zct-gps-start') return startShare(id);
      if (a == 'zct-gps-stop') return stopShare(false);
      if (a == 'zct-track' || a == 'zct-focus') {
        st.focus = a == 'zct-focus' && st.focus == id ? '' : id;
        if (a == 'zct-track') {
          S.wp[S.ws] = S.ws == 'owner' ? 'fleet' : 'rmap'; // owners: the Fleet map shows rentals too
          save();
        }
        st.fitted = false;
        render();
        draw(true);
        return;
      }
    },
    true
  );

  /* ---------------- styles ---------------- */
  const css = document.createElement('style');
  css.textContent = `
.ct-bar{margin-top:8px}
.fx-dlg.ct-wide{width:min(880px,100%)}
.ct-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;position:sticky;top:-1px;z-index:2;background:var(--s);padding:4px 0 10px}
.ct-doc{background:#fff;color:#111;border:1px solid #d9dde5;border-radius:12px;padding:28px;font:14px/1.55 Georgia,'Times New Roman',serif}
.ct-doc h1{font:700 24px/1.2 var(--disp,system-ui),system-ui,sans-serif;margin:4px 0 0;color:#111}
.ct-doc h3{font:700 15px/1.3 system-ui,sans-serif;margin:20px 0 8px;padding-bottom:4px;border-bottom:1.5px solid #111;color:#111;text-transform:uppercase;letter-spacing:.04em}
.ct-doc p{margin:10px 0;color:#111}
.ct-hd{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:3px double #111;padding-bottom:14px}
.ct-brand{font:600 12px system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#555}
.ct-meta{font:13px/1.5 system-ui,sans-serif;text-align:right;color:#111}
.ct-t,.ct-kv{width:100%;border-collapse:collapse;font-size:13.5px}
.ct-t th,.ct-t td,.ct-kv th,.ct-kv td{border:1px solid #c9ced8;padding:6px 8px;text-align:left;vertical-align:top;color:#111}
.ct-t tr:first-child th{background:#f1f3f7;font:600 12.5px system-ui,sans-serif}
.ct-t th,.ct-kv th{font:600 12.5px system-ui,sans-serif;width:30%;background:#fafbfc}
.ct-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ct-cl{margin:0;padding-left:22px}.ct-cl li{margin:0 0 7px}
.ct-blank{display:inline-block;min-width:140px;border-bottom:1px solid #777;height:1em}
.ct-small{font-size:13px}
.ct-sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:10px}
.ct-sigbox{border:1px solid #c9ced8;border-radius:8px;padding:12px;break-inside:avoid}
.ct-role{font:600 12px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#555}
.ct-sig{display:block;height:64px;max-width:100%;object-fit:contain;margin:8px 0 0}
.ct-sigline{height:64px;border-bottom:1.5px solid #111;margin-top:8px}
.ct-paper{display:flex;align-items:flex-end;font-style:italic;color:#555;padding-bottom:4px}
.ct-name{font-weight:700;margin-top:4px;border-top:0}
.ct-note{font:12px system-ui,sans-serif;color:#555}
.ct-ft{margin-top:20px;padding-top:10px;border-top:1px solid #c9ced8;font:11.5px/1.5 system-ui,sans-serif;color:#555}
.ct-h{font-family:ui-monospace,Consolas,monospace;word-break:break-all;color:#111}
.ct-sign{margin-top:14px}
.ct-h4{font:700 13px/1.3 system-ui,sans-serif;margin:14px 0 6px;color:#111}
.ct-ph{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.ct-ph figure{margin:0}
.ct-ph img{width:100%;aspect-ratio:4/3;object-fit:cover;border:1px solid #c9ced8;border-radius:4px;display:block}
.ct-ph figcaption{font:10.5px system-ui,sans-serif;color:#555}
.ct-chk{display:flex;gap:8px;align-items:flex-start;font-weight:500;margin:4px 0 10px}
.ct-chk input{width:20px;height:20px;flex:none;margin-top:2px}
.ct-padw{position:relative;border:1.5px dashed var(--bd2,#9aa3b4);border-radius:12px;background:#fff;margin:6px 0 8px}
.ct-padw canvas{display:block;width:100%;height:170px;touch-action:none;cursor:crosshair}
.ct-padh{position:absolute;left:0;right:0;bottom:30px;text-align:center;color:#9aa3b4;pointer-events:none;font-size:14px;border-top:1px solid #e3e6ec;margin:0 24px;padding-top:6px}
.ct-padw.inked .ct-padh{visibility:hidden}
.rt-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;margin-top:8px}
.rt-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.rt-on td{background:var(--acs,rgba(63,184,175,.12))}
.leaflet-tooltip.rt-tip{font-weight:700}
#ct-print{display:none}
@media (max-width:600px){.ct-doc{padding:16px}.ct-2,.ct-sigs{grid-template-columns:1fr}.ct-meta{text-align:left}}
@media print{
  body.ct-printing>*:not(#ct-print){display:none!important}
  body.ct-printing #ct-print{display:block}
  body.ct-printing{background:#fff!important}
  #ct-print .ct-doc{border:0;padding:0;font-size:11.5px;line-height:1.45}
  #ct-print .ct-doc h1{font-size:21px}
  #ct-print .ct-doc h3{margin:12px 0 6px;font-size:13px}
  #ct-print .ct-doc p{margin:6px 0}
  #ct-print .ct-t th,#ct-print .ct-t td,#ct-print .ct-kv th,#ct-print .ct-kv td{padding:4px 7px;font-size:11.5px}
  #ct-print .ct-cl li{margin:0 0 4px}
  #ct-print .ct-hd{padding-bottom:10px}
  #ct-print .ct-sig,#ct-print .ct-sigline{height:52px}
  #ct-print .ct-ft{margin-top:12px}
  #ct-print h3{break-after:avoid}
  #ct-print .ct-sigs,#ct-print table{break-inside:avoid}
  @page{size:A4;margin:12mm}
}`;
  document.head.appendChild(css);

  window.ZCT = {
    renterBar,
    ownerBar,
    openContract,
    printContract,
    docHTML,
    pad: { init: initPad, image: padImage },
  };
  render();
})();
