/* ===== 08-verification.js — Pre-Departure Verification (Start PIN/QR, plate, cargo checklist) and the Delivery PIN =====
   Panels for the customer (Track), the driver (Active trip) and admins (Trip verification). Every step is a server action.
   The rules and PIN hashing run on the server. Identity comes from the login token:
   the customer is b.cu, the driver is b.drvUser, admins need adm super/admin. Legacy sample bookings (no drvUser) keep the old S.veh path. */
(() => {
  const PIN_TTL = 30 * 6e4,
    MAX_TRY = 5,
    LOCK = 5 * 6e4,
    ALLOW_EXC = true,
    SK = 'zmpin:';
  const ss = {
    get: k => {
      try {
        return sessionStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set: (k, v) => {
      try {
        sessionStorage.setItem(k, v);
      } catch (e) {}
    },
    del: k => {
      try {
        sessionStorage.removeItem(k);
      } catch (e) {}
    },
  };
  const ZV = { fail: false, busy: false, draft: {}, issuing: {}, step: {}, open: null, msg: '', msgGood: false };
  S.veh = S.veh || {};
  DRV.forEach((d, i) => {
    if (!S.veh[d.pl]) S.veh[d.pl] = { id: 'VH-00' + (i + 1), approved: true, active: true };
  });
  const DID = d => (d.em ? 'DRV-' + d.em : 'DRV-00' + (DRV.indexOf(d) + 1)),
    realV = b => (b.drvUser ? (S.vh || []).find(v => v.id == b.veh) : null),
    plateOf = b => (b.drvUser ? (realV(b) || {}).plate || '' : b.drv ? drvOf(b).pl : ''),
    myEm = () => (S.me && S.me.em) || '',
    isAdmU = () => {
      const u = S.users.find(x => x.em == myEm());
      return !!u && ['super', 'admin'].includes(u.adm) && u.status != 'suspended';
    },
    norm = t =>
      String(t || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, ''),
    now = () => new Date().toISOString();
  const hex = a => [...a].map(x => x.toString(16).padStart(2, '0')).join(''),
    rb = n => {
      const a = new Uint8Array(n);
      crypto.getRandomValues(a);
      return a;
    };
  const pin6 = () => {
    const a = new Uint32Array(1);
    do {
      crypto.getRandomValues(a);
    } while (a[0] >= 4294000000);
    return String(a[0] % 1e6).padStart(6, '0');
  };
  const FR =
      /fragile|glass|mirror|\btv\b|television|fridge|refrigerator|aircon|appliance|ceramic|lamp|monitor|piano|artwork|china|vase|chandelier/i,
    HVR = /jewel|cash|laptop|\bsafe\b|vault|gold|camera|valuable|computer/i;
  const parseItems = t =>
    String(t || '')
      .split(/[\n,;]+|\s+and\s+/i)
      .map(x => x.trim())
      .filter(Boolean)
      .map(x => {
        let q = 1,
          n = x,
          m;
        if ((m = n.match(/^(\d+)\s*(?:x|pcs?|pieces?)?\s+(.+)/i))) {
          q = +m[1];
          n = m[2];
        } else if ((m = n.match(/^(.+?)\s*x\s*(\d+)$/i))) {
          q = +m[2];
          n = m[1];
        }
        const d = n.match(
          /(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?\s*(?:cm|in|ft|m)\b)/i
        );
        return {
          n: n.slice(0, 80),
          q: Math.max(1, Math.min(999, q)),
          dim: d ? d[1] : '',
          fr: FR.test(n),
          hv: HVR.test(n),
        };
      });
  const mk = b => {
    const it = parseItems(b.it);
    if (/fragile/i.test(b.si || '') && !it.some(x => x.fr))
      it.push({
        n: 'Items marked fragile in the instructions',
        q: 0,
        dim: '',
        fr: true,
        hv: false,
        gen: true,
      });
    if (!it.length) it.push({ n: 'Cargo as described in the booking', q: 1, dim: '', fr: false, hv: false });
    return {
      v: 1,
      cust: b.cu || (S.me ? S.me.em : ''),
      items: it,
      hvAny: it.some(x => x.hv) || /jewel|valuable/i.test(b.si || ''),
      mc: it.reduce((s, x) => s + (x.gen ? 0 : x.q), 0),
      mcOver: null,
      pin: null,
      qr: null,
      pinOk: null,
      plate: null,
      chk: null,
      disc: [],
      dconf: null,
      cconf: null,
      exc: null,
      auth: null,
      done: false,
      log: [],
    };
  };
  const mc = b => b.ver.mcOver ?? b.ver.mc,
    openD = b => ((b.ver && b.ver.disc) || []).filter(d => d.status == 'open');
  const log = (b, a, evt, data) => {
    b.ver.log.push({ t: now(), role: a.role, actor: a.id, evt, data: data || null });
    S.log.push({ a: 'verify ' + b.id + ' ' + evt, t: now() });
  };
  const no = (err, x) => ({ ok: false, err, ...x }),
    yes = x => ({ ok: true, ...x });
  const asD = (b, a) =>
    a &&
    a.role == 'driver' &&
    b.drv &&
    (b.drvUser ? myEm() == b.drvUser && a.id == 'DRV-' + b.drvUser : a.id == DID(drvOf(b)))
      ? ''
      : 'Only the driver assigned to this booking can do this.';
  const asC = (b, a) =>
    a &&
    a.role == 'customer' &&
    a.id &&
    (b.cu ? myEm() == b.cu && a.id == b.cu && b.drvUser != b.cu : b.ver && a.id == b.ver.cust)
      ? ''
      : 'Only the customer who made this booking can do this.';
  const asA = a =>
    a && a.role == 'admin' && a.id == myEm() && isAdmU() ? '' : 'Only an administrator can do this.';
  const vv = b => {
    b.ver = b.ver || mk(b);
    if (b.cu) b.ver.cust = b.cu;
    return b.ver;
  };
  const stage = b =>
    b.st == 'Items Loaded'
      ? ''
      : b.ver && b.ver.done
        ? 'Departure was already authorized.'
        : 'Verification is only available while the booking is in Pickup / Loading.';
  /* vehicle record: real fleet (S.vh) for bookings accepted by a real driver, sample S.veh for legacy demo bookings */
  const vehRec = b => {
    if (b.drvUser) {
      const v = realV(b);
      return v
        ? {
            id: v.id,
            plate: v.plate,
            approved: v.approval == 'Approved',
            active: v.status != 'Maintenance',
            real: true,
            v,
          }
        : null;
    }
    const p = plateOf(b),
      r = S.veh[p];
    return r ? { ...r, plate: p } : null;
  };
  const allBk = () => window.ZM_ALLBK || S.bk;
  const vehOk = b => {
    const r = vehRec(b);
    if (!r || !r.approved || !r.active) return false;
    return !allBk().some(
      x =>
        x.id != b.id &&
        ['In Transit', 'Arrived at Destination'].includes(x.st) &&
        (r.real ? x.drvUser && x.veh == b.veh : !x.drvUser && x.drv && plateOf(x) == r.plate)
    );
  };
  const fragOk = b => {
    const c = b.ver.chk;
    return b.ver.items.every(
      (x, i) => !x.fr || (c && c.frag && c.frag[i] && c.frag[i].pad && c.frag[i].strap)
    );
  };
  const cond = b => {
    const v = b.ver || { items: [], disc: [] },
      c = v.chk;
    return [
      ['Start PIN or QR verified', !!v.pinOk],
      ['Driver is assigned to this booking', !!b.drv],
      ['Vehicle is approved, active and available', !!b.drv && vehOk(b)],
      ['Actual plate matches the assigned vehicle', !!(v.plate && v.plate.match)],
      ['Cargo piece count checked', !!(c && Number.isInteger(c.count) && c.done)],
      ['Fragile items padded and strapped', !!c && fragOk(b)],
      ['Driver confirmation recorded', !!v.dconf],
      [
        v.exc ? 'Customer confirmation waived by administrator' : 'Customer confirmation recorded',
        !!(v.cconf || v.exc),
      ],
      ['No unresolved cargo discrepancy', !!v.disc && openD(b).length == 0],
      ['Booking is in Pickup / Loading', b.st == 'Items Loaded'],
    ];
  };
  /* Every verification step runs on the server (backend/src/domain/verification.js). These are thin calls;
   the server decides who may act from the login token, never from the actor passed here. */
  const DSK = 'zmdpin:',
    RQ = (n, p) => ZAPI.act(n, p);
  const API = {
    newPin: id => RQ('vNewPin', { id }),
    verify: (id, a, input, kind) => RQ('vVerify', { id, input, kind }),
    plate: (id, a, input) => RQ('vPlate', { id, input }),
    save: (id, a, d) => RQ('vSave', { id, ...d }),
    confirmDriver: id => RQ('vDriverConfirm', { id }),
    confirmCustomer: (id, a, reviewed) => RQ('vCustomerConfirm', { id, reviewed }),
    disc: (id, a, d) => RQ('vDisc', { id, ...d }),
    resolve: (id, a, d) => RQ('vResolve', { id, disc: d.id, res: d.res, mc: d.mc }),
    exception: (id, a, reason) => RQ('vException', { id, reason }),
    vehicle: id => RQ('vVehicle', { id }),
    authorize: id => RQ('vAuthorize', { id }),
    dNewPin: id => RQ('dNewPin', { id }),
    deliver: (id, a, input, note, photo) => RQ('dDeliver', { id, input, note, photo }),
    dWaive: (id, a, reason) => RQ('dWaive', { id, reason }),
  };
  /* session copies of the raw PIN change only after the (simulated) server accepted the step */
  const _np = API.newPin,
    _vf = API.verify,
    _au = API.authorize;
  API.newPin = (id, a) =>
    _np(id, a).then(r => {
      if (r.ok) ss.set(SK + id, JSON.stringify({ pin: r.pin, tok: r.tok }));
      return r;
    });
  API.verify = (id, a, i, k) =>
    _vf(id, a, i, k).then(r => {
      if (r.ok) ss.del(SK + id);
      return r;
    });
  API.authorize = (id, a) =>
    _au(id, a).then(r => {
      if (r.ok) ss.del(SK + id);
      return r;
    });
  const _dnp = API.dNewPin,
    _dl = API.deliver;
  API.dNewPin = (id, a) =>
    _dnp(id, a).then(r => {
      if (r.ok) ss.set(DSK + id, r.pin);
      return r;
    });
  API.deliver = (id, a, ...x) =>
    _dl(id, a, ...x).then(r => {
      if (r.ok) ss.del(DSK + id);
      return r;
    });
  window.ZMVER = { api: API, cond, zv: ZV, mc, parseItems, DID, plateOf, mk, vehOk, vehRec };
  /* ---------- UI ---------- */
  const ck = on =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${on ? '<path d="M5 12l5 5 9-10"/>' : '<circle cx="12" cy="12" r="8" stroke-width="2"/>'}</svg>`;
  const dv = (k, d = '') => ZV.draft[k] ?? d,
    fmt = t => (t ? new Date(t).toLocaleString() : '—'),
    cap = s => s[0].toUpperCase() + s.slice(1);
  /* the acting identity always comes from the logged-in session; the API re-checks it against the booking */
  const actor = (b, mode) =>
    mode == 'customer'
      ? { role: 'customer', id: myEm() }
      : mode == 'driver'
        ? { role: 'driver', id: 'DRV-' + myEm() }
        : { role: 'admin', id: myEm() };
  const viewOf = b => {
    const em = myEm();
    if (!em || !b) return '';
    if (b.drvUser && b.drvUser == em) return 'driver';
    if (b.cu ? b.cu == em : true) return 'customer';
    return '';
  };
  const raw = b => {
    try {
      return JSON.parse(ss.get(SK + b.id));
    } catch (e) {
      return null;
    }
  };
  const stepRow = (ok, t, sub) =>
    `<div class="vz-s ${ok ? 'ok' : ''}"><span>${ck(ok)}</span><div><b>${t}</b>${sub ? `<small class="n">${sub}</small>` : ''}</div></div>`;
  const discH = (b, adm) => {
    const l = b.ver ? b.ver.disc : [];
    return l.length
      ? `<div class="vz-g"><b>Discrepancies</b>${l.map(d => `<div class="vz-d ${d.status}"><div><span class="tag ${d.status == 'open' ? 'r' : 'g'}">${d.status == 'open' ? 'Open' : 'Resolved'}</span> <b>${esc(d.type)}</b> <small class="n">${d.id} · ${fmt(d.t)} · ${esc(d.role)}</small></div><p>${esc(d.note)}</p>${d.status == 'resolved' ? `<p class="mu">Resolution (${esc(d.resBy)}, ${fmt(d.resT)}): ${esc(d.res)}</p>` : adm ? `<div class="vz-f"><input id="vz-rs-${d.id}" placeholder="Resolution" value="${esc(dv('vz-rs-' + d.id))}"><input id="vz-rm-${d.id}" inputmode="numeric" placeholder="Booked count (optional)" value="${esc(dv('vz-rm-' + d.id))}"><button class="btn sm" data-a="vz-resolve" data-d="${d.id}">Resolve</button></div>` : '<p class="mu">Waiting for an administrator to review.</p>'}</div>`).join('')}</div>`
      : '';
  };
  const reportH = b =>
    `<details class="vz-g"><summary>Report a missing, extra or damaged item</summary><div class="vz-f col"><select id="vz-dt">${['Missing items', 'Additional items', 'Damaged items', 'Other'].map(t => `<option ${dv('vz-dt') == t ? 'selected' : ''}>${t}</option>`).join('')}</select><textarea id="vz-dn" rows="2" placeholder="What did you find?">${esc(dv('vz-dn'))}</textarea><button class="btn o sm" data-a="vz-disc">Submit report</button></div></details>`;
  const manifestH = b =>
    `<div class="vz-g"><b>Booked items <span class="mu">${mc(b)} piece${mc(b) == 1 ? '' : 's'}</span></b>${b.ver.items.map((x, i) => `<div class="vz-i"><span>${esc(x.n)}${x.dim && !x.n.includes(x.dim) ? ` <small class="n">${esc(x.dim)}</small>` : ''}</span><span class="n">${x.gen ? '' : '× ' + x.q}${x.fr ? ' <span class="tag">Fragile</span>' : ''}</span></div>`).join('')}</div>`;
  const checkH = b => {
    const v = b.ver,
      c = v.chk,
      L = !!v.dconf;
    return `<div class="vz-g"><b>Cargo checklist</b>
 <label class="vz-l">Pieces loaded <span class="mu">(booked ${mc(b)})</span></label><input id="vz-n" inputmode="numeric" value="${esc(dv('vz-n', c && c.count != null ? c.count : ''))}" ${L ? 'disabled' : ''}>
 ${v.items.map((x, i) => `<div class="vz-i"><label class="p-ck"><input type="checkbox" id="vz-it${i}" ${dv('vz-it' + i, c && c.items[i]) ? 'checked' : ''} ${L ? 'disabled' : ''}><span>${esc(x.n)}${x.gen ? '' : ' × ' + x.q}</span></label></div>${x.fr ? `<div class="vz-fr"><label class="p-ck"><input type="checkbox" id="vz-pd${i}" ${dv('vz-pd' + i, c && c.frag[i].pad) ? 'checked' : ''} ${L ? 'disabled' : ''}><span>Padded and protected</span></label><label class="p-ck"><input type="checkbox" id="vz-st${i}" ${dv('vz-st' + i, c && c.frag[i].strap) ? 'checked' : ''} ${L ? 'disabled' : ''}><span>Strapped</span></label></div>` : ''}`).join('')}
 ${v.hvAny ? `<label class="vz-l">Seal or ID reference <span class="mu">(optional, for high-value items)</span></label><input id="vz-sl" maxlength="60" value="${esc(dv('vz-sl', c ? c.seal : ''))}" ${L ? 'disabled' : ''}>` : ''}
 <label class="vz-l">Photo of loaded cargo or seal <span class="mu">(optional)</span></label><input id="vz-ph" type="file" accept="image/*" ${L ? 'disabled' : ''}>${c && c.photo ? `<img src="${c.photo}" alt="Loaded cargo" style="max-width:140px;border-radius:8px;margin-top:8px">` : ''}
 <label class="vz-l">Notes <span class="mu">(optional)</span></label><input id="vz-nt" maxlength="300" value="${esc(dv('vz-nt', c ? c.note : ''))}" ${L ? 'disabled' : ''}>
 ${L ? '' : '<button class="btn o sm" style="margin-top:12px" data-a="vz-save">Save checklist</button>'}</div>`;
  };
  const authH = b => {
    const cs = cond(b),
      all = cs.every(x => x[1]);
    return `<div class="vz-g"><button class="btn vz-go" data-a="vz-auth" ${all ? '' : 'disabled'}>Confirm Verification &amp; Authorize Departure</button><div class="vz-c">${cs.map(x => `<span class="${x[1] ? 'ok' : ''}">${ck(x[1])}${x[0]}</span>`).join('')}</div></div>`;
  };
  const sum = b => {
    const v = b.ver || {};
    return [
      ['Start PIN', !!v.pinOk],
      ['Vehicle', !!(v.plate && v.plate.match)],
      ['Driver checklist', !!v.dconf],
      ['Customer', !!(v.cconf || v.exc)],
    ];
  };
  const logH = b =>
    `<div class="vz-g"><b>Audit history</b><div class="vz-lg">${b.ver.log.map(l => `<div><small class="n">${fmt(l.t)}</small><span><b>${esc(l.evt)}</b> · ${esc(l.role)} ${esc(l.actor || '')}${l.data ? `<small class="n">${esc(JSON.stringify(l.data))}</small>` : ''}</span></div>`).join('') || '<span class="mu">No entries yet.</span>'}</div></div>`;
  const recH = b => {
    const v = b.ver,
      r = vehRec(b) || {};
    return `<div class="vz-g"><b>Verification record</b>${[
      ['Booking', b.id],
      ['Customer ID', v.cust],
      ['Driver ID', b.drvUser ? 'DRV-' + b.drvUser : b.drv ? DID(drvOf(b)) : '—'],
      ['Vehicle', (r.id || '—') + ' · ' + plateOf(b) + (r.approved ? '' : ' (not approved)')],
      ['Verified plate', v.plate ? v.plate.entered + (v.plate.match ? ' (match)' : ' (mismatch)') : '—'],
      ['PIN check', v.pinOk ? 'Verified ' + fmt(v.pinOk.t) + ' via ' + v.pinOk.via : 'Not verified'],
      ['Driver confirmed', fmt(v.dconf && v.dconf.t)],
      [
        'Customer confirmed',
        v.cconf
          ? fmt(v.cconf.t)
          : v.exc
            ? 'Waived by ' + esc(v.exc.by) + ' (' + esc(v.exc.reason) + ')'
            : '—',
      ],
      ['Departure authorized', fmt(v.auth && v.auth.t)],
    ]
      .map(x => `<div class="vz-i"><span class="mu">${x[0]}</span><span class="n">${esc(x[1])}</span></div>`)
      .join('')}</div>`;
  };
  function legacyPanel(b, mode) {
    if (!b || !b.drv || FLOW.indexOf(b.st) < 0 || !['customer', 'driver', 'admin'].includes(mode)) return '';
    if (mode == 'admin' && !isAdmU()) return '';
    const v = b.ver;
    if (v && v.done)
      return `<section class="card vz" id="vz" data-bid="${b.id}" data-mode="${mode}"><div class="row" style="padding-top:0"><h2>Pre-departure verification</h2><span class="tag g">Completed</span></div><div class="vz-sum">${sum(
        b
      )
        .map(x => `<span class="ok">${ck(1)}${x[0]}</span>`)
        .join(
          ''
        )}</div><p class="mu">Departure authorized ${fmt(v.auth.t)}. Booking moved to In Transit.</p>${mode == 'admin' ? recH(b) + discH(b, 0) + logH(b) : ''}</section>`;
    if (b.st != 'Items Loaded') return '';
    const a = actor(b, mode);
    let body = '';
    if (!vehOk(b) && mode != 'admin')
      body = `<div class="note">The assigned vehicle is not approved, active and available, so departure is blocked. An administrator must review it.</div>`;
    const S4 = `<div class="vz-sum">${sum(b)
      .map(x => `<span class="${x[1] ? 'ok' : ''}">${ck(x[1])}${x[0]}</span>`)
      .join('')}</div>`;
    if (mode == 'customer') {
      const p = v && v.pin,
        r = raw(b),
        exp = p && Date.now() > p.exp;
      if (!p && !ZV.issuing[b.id]) {
        ZV.issuing[b.id] = 1;
        API.newPin(b.id, a).then(() => {
          ZV.issuing[b.id] = 0;
          ref();
        });
      }
      body += `<div class="vz-g"><b>Your Start PIN</b>${v && v.pinOk ? `<p class="mu">Verified by the driver ${fmt(v.pinOk.t)}. The PIN is no longer valid.</p>` : p && r && !exp ? `<div class="vz-pin n" aria-label="Start PIN">${r.pin.split('').join(' ')}</div><p class="mu">Show this PIN or QR code to the driver. Expires in <b id="vz-cd" data-exp="${p.exp}" class="n">${Math.floor(Math.max(0, p.exp - Date.now()) / 6e4)}:${String(Math.floor(Math.max(0, p.exp - Date.now()) / 1e3) % 60).padStart(2, '0')}</b>.</p><div class="vz-qr">${qr('ZM1.' + b.id + '.' + r.tok)}</div><button class="btn o sm" data-a="vz-pin">Generate a new PIN</button>` : `<p class="mu">${exp ? 'Your PIN expired.' : 'Your PIN is hidden in this new session.'}</p><button class="btn sm" data-a="vz-pin">${exp ? 'Request a new PIN' : 'Show a new PIN'}</button>`}</div>
  ${v ? manifestH(b) + (v.chk ? `<div class="vz-g"><b>Driver checklist</b><div class="vz-i"><span>Pieces loaded</span><span class="n">${v.chk.count ?? '—'} of ${mc(b)}</span></div>${v.chk.seal ? `<div class="vz-i"><span>Seal reference</span><span class="n">${esc(v.chk.seal)}</span></div>` : ''}</div>` : '<p class="mu">Waiting for the driver to complete the cargo checklist.</p>') + `<div class="vz-g"><b>Your confirmation</b>${v.cconf ? `<p class="mu">Confirmed ${fmt(v.cconf.t)}.</p>` : v.exc ? `<p class="mu">Waived by an administrator.</p>` : `<label class="p-ck"><input type="checkbox" id="vz-rv" ${dv('vz-rv') ? 'checked' : ''}><span>I reviewed the checklist. The recorded items match what is being transported.</span></label><button class="btn sm" style="margin-top:10px" data-a="vz-cconf" ${v.chk && v.chk.done && v.pinOk ? '' : 'disabled'}>Confirm cargo</button>`}</div>` + discH(b, 0) + reportH(b) : ''}`;
    } else if (mode == 'driver') {
      const r = vehRec(b) || {},
        d = drvOf(b);
      body += `<div class="vz-g"><b>1. Start PIN or QR</b>${v && v.pinOk ? `<p class="ok2">Verified ${fmt(v.pinOk.t)}.</p>` : `<div class="vz-f"><input id="vz-pi" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="6-digit PIN" value="${esc(dv('vz-pi'))}"><button class="btn sm" data-a="vz-ver" data-k="pin">Verify PIN</button></div><div class="vz-f"><input id="vz-qi" autocomplete="off" placeholder="Or paste the QR code text" value="${esc(dv('vz-qi'))}"><button class="btn o sm" data-a="vz-ver" data-k="qr">Verify QR</button></div>`}</div>
  <div class="vz-g"><b>2. Vehicle</b><p class="mu">Assigned: ${esc(r.id || '—')} · ${r.real ? esc(r.v.brand + ' ' + r.v.model) : esc(d.c + ' ' + (MD[b.vid] || b.vn))}${r.approved && r.active ? '' : ' · <b>not approved</b>'}</p>${v && v.plate && v.plate.match ? `<p class="ok2">Plate ${esc(v.plate.entered)} matches.</p>` : `${v && v.plate ? `<p class="vz-e">Plate ${esc(v.plate.entered)} does not match. Departure is blocked.</p>` : ''}<div class="vz-f"><input id="vz-pl" autocomplete="off" placeholder="Plate number on the truck" value="${esc(dv('vz-pl'))}"><button class="btn sm" data-a="vz-plate">Verify plate</button></div>`}</div>
  ${v && v.pinOk && v.plate && v.plate.match ? `<div class="vz-g" style="border:0;padding:0">${manifestH(b)}</div>` + checkH(b) + `<div class="vz-g"><b>3. Driver confirmation</b>${v.dconf ? `<p class="ok2">Confirmed ${fmt(v.dconf.t)}. The assigned vehicle and checklist are correct.</p>` : `<button class="btn sm" data-a="vz-dconf" ${v.chk && v.chk.done ? '' : 'disabled'}>Confirm checklist and vehicle</button>`}</div>` + discH(b, 0) + reportH(b) + authH(b) : authH(b)}`;
    } else
      body += v
        ? recH(b) +
          manifestH(b) +
          discH(b, 1) +
          (!v.cconf && !v.exc && v.pinOk && v.chk && v.chk.done && ALLOW_EXC
            ? `<div class="vz-g"><b>Customer unavailable</b><p class="mu">Waive the customer confirmation with a recorded reason.</p><div class="vz-f"><input id="vz-ex" placeholder="Reason (10+ characters)" value="${esc(dv('vz-ex'))}"><button class="btn o sm" data-a="vz-exc">Record exception</button></div></div>`
            : '') +
          `<div class="vz-g"><b>Vehicle</b><p class="mu">Suspending the vehicle blocks departure until it is restored.</p><button class="btn o sm" data-a="vz-veh">${(vehRec(b) || {}).approved ? 'Suspend vehicle approval' : 'Restore vehicle approval'}</button></div>` +
          logH(b)
        : '<p class="mu">Nothing recorded yet. The record is created when the customer opens Track.</p>';
    return `<section class="card vz" id="vz" data-bid="${b.id}" data-mode="${mode}"><div class="row" style="padding-top:0"><h2>Pre-departure verification</h2><span class="tag">Action needed</span></div>${S4}<div class="vz-m" role="status" aria-live="polite" id="vz-m">${esc(ZV.msg || '')}</div>${body}</section>`;
  }
  const okI = f => typeof f == 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(f),
    mmss = x => {
      const t = Math.max(0, Math.round((x - Date.now()) / 1e3));
      return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    };
  const DST = ['Arrived at Destination', 'Delivery Confirmation', 'Awaiting Final Payment'];
  function dpanel(b, mode) {
    if (!b || !b.drv || !DST.includes(b.st) || !['customer', 'driver', 'admin'].includes(mode)) return '';
    if (mode == 'admin' && !isAdmU()) return '';
    const d = b.dver || {},
      a = actor(b, mode);
    const box = (tg, body) =>
      `<section class="card vz" id="dz" data-bid="${esc(b.id)}" data-mode="${mode}"><div class="row" style="padding-top:0"><h2>${b.st == 'Arrived at Destination' ? 'Delivery confirmation' : 'Proof of delivery'}</h2>${tg}</div><div class="vz-m" role="status" aria-live="polite" id="dz-m">${esc(ZV.dmsg || '')}</div>${body}</section>`;
    const lg = () =>
      `<div class="vz-g"><b>Delivery audit</b><div class="vz-lg">${(d.log || []).map(l => `<div><small class="n">${fmt(l.t)}</small><span><b>${esc(l.evt)}</b> · ${esc(l.role)} ${esc(l.actor || '')}${l.data ? `<small class="n">${esc(JSON.stringify(l.data))}</small>` : ''}</span></div>`).join('') || '<span class="mu">No entries yet.</span>'}</div></div>`;
    const rep = `<div class="vz-g"><b>Items missing or damaged?</b><p class="mu">${b.st == 'Arrived at Destination' ? 'Do not give the PIN. ' : ''}Report it and an administrator will review. Nobody is blamed from a report alone.</p><button class="btn o sm" data-a="dz-report">Report a problem with delivery</button></div>`;
    if (b.st != 'Arrived at Destination') {
      const p = b.pod;
      return box(
        '<span class="tag g">Delivered</span>',
        (p
          ? `<div class="vz-i"><span class="mu">Confirmed</span><span class="n">${fmt(p.t)} · ${esc(p.via)}</span></div><p>${esc(p.note)}</p>${okI(p.photo) ? `<img src="${p.photo}" alt="Photo at drop-off" style="max-width:160px;border-radius:8px">` : ''}`
          : '<p class="mu">No delivery record for this booking.</p>') +
          (mode == 'customer' ? rep : '') +
          (mode == 'admin' ? lg() : '')
      );
    }
    let body = '';
    if (mode == 'customer') {
      const p = d.pin,
        r = ss.get(DSK + b.id),
        exp = p && Date.now() > p.exp;
      if (d.waive)
        body = `<p class="mu">An administrator waived the Delivery PIN: ${esc(d.waive.reason)}</p>`;
      else {
        if (!p && !ZV.issuing['d' + b.id]) {
          ZV.issuing['d' + b.id] = 1;
          API.dNewPin(b.id, a).then(() => {
            ZV.issuing['d' + b.id] = 0;
            dref();
          });
        }
        body = `<b>Your Delivery PIN</b>${p && r && !exp ? `<div class="vz-pin n" aria-label="Delivery PIN">${r.split('').join(' ')}</div><p class="mu">Check your items first. Give this PIN to the driver only when everything arrived in good condition. Expires in <b id="dz-cd" data-exp="${p.exp}" class="n">${mmss(p.exp)}</b>.</p><div class="dz-qr"><div class="dz-qrc" aria-label="Delivery QR code">${qr('ZMD:' + b.id + ':' + r)}</div><p class="mu" style="margin:0">Or let the driver scan this code. We also sent the PIN to your phone and email.</p></div><button class="btn o sm" data-a="dz-pin">Generate a new PIN</button>` : `<p class="mu">${exp ? 'Your Delivery PIN expired.' : p ? 'Your PIN is hidden in this new session.' : 'Preparing your PIN…'}</p>${p ? `<button class="btn sm" data-a="dz-pin">${exp ? 'Request a new PIN' : 'Show a new PIN'}</button>` : ''}`}`;
      }
      body += rep;
    } else if (mode == 'driver')
      body = `${d.waive ? `<div class="note">Delivery PIN waived by an administrator: ${esc(d.waive.reason)}</div>` : `<label class="vz-l" for="vz-dpi">Customer's Delivery PIN</label><div class="dz-in"><input id="vz-dpi" maxlength="60" autocomplete="off" placeholder="6-digit PIN" value="${esc(dv('vz-dpi'))}"><button type="button" class="btn o sm" data-a="dz-scan">Scan QR</button></div><div id="dz-cam" hidden></div>`}<label class="vz-l" for="vz-dnt">Delivery condition</label><textarea id="vz-dnt" rows="2" style="width:100%" placeholder="Items delivered, count, condition">${esc(dv('vz-dnt'))}</textarea><label class="vz-l" for="vz-dph">Photo at drop-off <span class="mu">(optional)</span></label><input id="vz-dph" type="file" accept="image/*"><div class="vz-f"><button class="btn sm" data-a="dz-deliver">Confirm delivery</button></div>`;
    else
      body =
        `<div class="vz-i"><span class="mu">Delivery PIN</span><span>${d.pin ? 'Issued, expires ' + fmt(d.pin.exp) + (d.pin.att ? ' · ' + d.pin.att + ' wrong attempt(s)' : '') : 'Not issued yet'}</span></div>${d.waive ? `<p class="mu">Waived by ${esc(d.waive.by)}: ${esc(d.waive.reason)}</p>` : `<div class="vz-g"><b>Customer unavailable</b><p class="mu">Waive the Delivery PIN with a recorded reason. The driver must still document the delivery.</p><div class="vz-f"><input id="vz-dwv" placeholder="Reason (10+ characters)" value="${esc(dv('vz-dwv'))}"><button class="btn o sm" data-a="dz-waive">Waive Delivery PIN</button></div></div>`}` +
        lg();
    return box('<span class="tag">Action needed</span>', body);
  }
  const dcur = () => {
      const e = $('#dz');
      return e && S.bk.find(x => x.id == e.dataset.bid);
    },
    dmode = () => {
      const e = $('#dz');
      return e ? e.dataset.mode : '';
    };
  const dref = () => {
    const b = dcur();
    if (!b) return;
    const h = dpanel(b, dmode());
    if (!h) return render();
    const t = document.createElement('div');
    t.innerHTML = h;
    $('#dz').replaceWith(t.firstElementChild);
  };
  /* driver: scan the customer's delivery QR with the phone camera (browsers with BarcodeDetector) */
  let camStream = null;
  const stopCam = () => {
    if (camStream) camStream.getTracks().forEach(t => t.stop());
    camStream = null;
    const c = $('#dz-cam');
    if (c) (c.hidden = true), (c.innerHTML = '');
  };
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest && e.target.closest('[data-a="dz-scan"],[data-a="dz-scan-x"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      if (t.dataset.a == 'dz-scan-x') return stopCam();
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices) return toast('This browser cannot scan codes. Type the 6-digit PIN instead.');
      try {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const c = $('#dz-cam');
        c.hidden = false;
        c.innerHTML = '<video playsinline muted style="width:100%;max-width:320px;border-radius:12px"></video><button type="button" class="btn o sm" data-a="dz-scan-x">Stop scanning</button>';
        const vid = c.querySelector('video');
        vid.srcObject = camStream;
        await vid.play();
        const tick = async () => {
          if (!camStream) return;
          const found = await det.detect(vid).catch(() => []);
          const code = found.map(f => f.rawValue).find(x => /^ZMD:/i.test(x));
          if (code) {
            const inp = $('#vz-dpi');
            if (inp) inp.value = code;
            stopCam();
            return toast('QR code read. Add the delivery condition and confirm.');
          }
          setTimeout(tick, 300);
        };
        tick();
      } catch (err) {
        stopCam();
        toast('Could not open the camera. Type the 6-digit PIN instead.');
      }
    },
    true
  );
  const qr = t => {
    try {
      const q = qrcode(0, 'M');
      q.addData(t);
      q.make();
      return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) {
      return '<code class="n">' + esc(t) + '</code>';
    }
  };
  const cur = () => {
    const e = $('#vzm') || $('#vz');
    return e && S.bk.find(x => x.id == e.dataset.bid);
  };
  const modeOf = () => {
    const e = $('#vzm') || $('#vz');
    return e ? e.dataset.mode : '';
  };
  const ref = () => {
    const b = cur();
    if (!b) return;
    const e = $('#vz');
    const h = panel(b, modeOf());
    if (!h) {
      ZV.open = null;
      mountModal(true);
      render();
      return;
    }
    if (e) {
      const t = document.createElement('div');
      t.innerHTML = h;
      e.replaceWith(t.firstElementChild);
    }
    mountModal(true);
  };

  /* ---------- the verification pop-up ----------
     The page shows a short summary card (progress + one button). The pop-up holds the real work, so the
     driver and the customer can concentrate on one thing at a time. The inputs keep their old ids (vz-pi,
     vz-pl, vz-n, ...) and the old handlers run them, so the server rules and the drafts are unchanged. */
  const person = em => (S.users || []).find(u => u.em == em) || {},
    fn1 = n => String(n || '').split(' ')[0],
    stop1 = t => String(t || '').split(',')[0],
    ini = n =>
      String(n || '?')
        .split(/\s+/)
        .map(x => x[0])
        .slice(0, 2)
        .join('')
        .toUpperCase(),
    itemsOf = b => (b.ver && b.ver.items) || parseItems(b.it),
    piecesOf = b => (b.ver ? mc(b) : itemsOf(b).reduce((s, x) => s + (x.gen ? 0 : x.q), 0));
  const vehInfo = b => {
    const r = vehRec(b) || {},
      v = r.real ? r.v : null,
      d = r.real ? null : b.drv ? drvOf(b) : null;
    return {
      name: v ? [v.brand, v.model].filter(Boolean).join(' ') : d ? d.c + ' ' + (MD[b.vid] || b.vn) : b.vn || '',
      color: (v && v.color) || '',
      year: (v && v.year) || '',
      plate: plateOf(b),
      ok: !!(r.approved && r.active),
    };
  };
  /* the customer's PIN is issued as soon as the customer sees the verification */
  const ensurePin = b => {
    const v = b.ver;
    if (v && (v.pin || v.pinOk)) return;
    if (ZV.issuing[b.id]) return;
    ZV.issuing[b.id] = 1;
    API.newPin(b.id, actor(b, 'customer')).then(() => {
      ZV.issuing[b.id] = 0;
      ref();
    });
  };
  const nextH = (b, mode) => {
    const v = b.ver || {},
      who = mode == 'driver' ? fn1(person(b.cu).name) || 'the customer' : fn1(person(b.drvUser).name) || 'the driver';
    if (mode == 'driver') {
      if (!v.pinOk) return `Next: ask ${esc(who)} for the Start PIN.`;
      if (!(v.plate && v.plate.match)) return 'Next: check the plate number on the truck.';
      if (!v.dconf) return 'Next: count the cargo and save the checklist.';
      if (!(v.cconf || v.exc)) return `Waiting for ${esc(who)} to confirm the cargo.`;
      return 'Everything is verified. Authorize departure.';
    }
    if (!v.pinOk) return `Show your Start PIN to ${esc(who)} when your items are loaded.`;
    if (!(v.chk && v.chk.done)) return `Waiting for ${esc(who)} to complete the cargo checklist.`;
    if (!(v.cconf || v.exc)) return 'Review the checklist and confirm your cargo.';
    return `You confirmed. Waiting for ${esc(who)} to authorize departure.`;
  };
  /* the card on the page */
  function panel(b, mode) {
    if (!b || !b.drv || FLOW.indexOf(b.st) < 0 || !['customer', 'driver', 'admin'].includes(mode)) return '';
    const v = b.ver;
    if (mode == 'admin' || (v && v.done)) return legacyPanel(b, mode);
    if (b.st != 'Items Loaded') return '';
    if (mode == 'customer') ensurePin(b);
    const s = sum(b),
      first = s.findIndex(x => !x[1]),
      label = mode == 'driver' ? (first > 0 ? 'Continue verification' : 'Start verification') : first == 0 ? 'Show my PIN' : 'Open verification';
    return `<section class="card vz vzs" id="vz" data-bid="${esc(b.id)}" data-mode="${mode}"><div class="vzs-h"><div><h2>Pre-departure verification</h2><p>${nextH(b, mode)}</p></div><span class="tag">Action needed</span></div><ol class="vzs-steps">${s
      .map((x, i) => `<li class="${x[1] ? 'done' : i == first ? 'now' : ''}">${ck(x[1])}${esc(x[0])}</li>`)
      .join('')}</ol>${!vehOk(b) && mode == 'driver' ? '<div class="note">The assigned vehicle is not approved, active and available, so departure is blocked. An administrator must review it.</div>' : ''}<button class="btn vzs-go" data-a="vz-open" data-id="${esc(b.id)}" data-mode="${mode}">${label}</button></section>`;
  }
  /* shared pieces of the pop-up */
  const kv = (k, v) => `<div class="vzm-kv"><span>${k}</span><span class="n">${v}</span></div>`;
  const okBox = (t, sub) => `<div class="vzm-ok"><span class="vzm-tick">✓</span><div><b>${t}</b>${sub ? `<span>${sub}</span>` : ''}</div></div>`;
  const dState = b => {
    const d = sum(b).map(x => x[1]);
    let first = d.findIndex(x => !x);
    if (first < 0) first = 4;
    return { d, first };
  };
  const dStep = b => {
    const { first } = dState(b),
      want = ZV.step[b.id],
      top = Math.min(first, 3);
    return want != null && want <= top ? want : top;
  };
  const stepsH = (b, mode, sel) => {
    const L = mode == 'driver' ? ['Start PIN', 'Vehicle', 'Cargo', 'Customer & go'] : ['Your PIN', 'Vehicle', 'Cargo', 'Your confirmation'],
      { d, first } = dState(b);
    return `<ol class="vzm-st" aria-label="Progress">${L.map(
      (t, i) =>
        `<li class="${d[i] ? 'done' : i == first ? 'now' : 'todo'}${i == sel ? ' sel' : ''}"><button type="button" data-a="vz-step" data-n="${i}" ${mode == 'driver' && i <= first ? '' : 'disabled'} ${i == sel ? 'aria-current="step"' : ''}><i>${d[i] ? '✓' : i + 1}</i><span>${t}</span></button></li>`
    ).join('')}</ol>`;
  };
  const tripH = (b, mode) => {
    const o = mode == 'driver' ? person(b.cu) : person(b.drvUser);
    return `<div class="vzm-trip"><div><small>Pickup</small><b>${esc(stop1(b.pu))}</b></div><div><small>Drop-off</small><b>${esc(stop1(b.dr))}</b></div><div><small>${mode == 'driver' ? 'Customer' : 'Driver'}</small><b>${esc(o.name || '—')}</b></div><div><small>Items</small><b>${piecesOf(b)} piece${piecesOf(b) == 1 ? '' : 's'}</b></div></div>`;
  };
  const itemsList = (b, chk) =>
    itemsOf(b)
      .map(
        (x, i) =>
          `<div class="vzm-kv"><span>${chk && chk.items && chk.items[i] ? '<span class="vzm-t2">✓</span> ' : ''}${esc(x.n)}${x.dim && !x.n.includes(x.dim) ? ` <small class="n">${esc(x.dim)}</small>` : ''}</span><span class="n">${x.gen ? '' : '× ' + x.q}${x.fr ? ' <span class="tag">Fragile</span>' : ''}</span></div>`
      )
      .join('');
  /* driver: one step at a time */
  const drvStep = (b, step) => {
    const v = b.ver,
      c = person(b.cu),
      cname = fn1(c.name) || 'the customer',
      vi = vehInfo(b);
    if (step == 0)
      return `<div class="vzm-sec"><h3>Ask ${esc(cname)} for the Start PIN</h3><p class="vzm-lead">${esc(cname)} sees a 6-digit PIN and a QR code on their Track page. It proves the right person handed over the cargo.</p>${
        v && v.pinOk
          ? okBox('PIN verified', fmt(v.pinOk.t))
          : `<label class="vzm-l" for="vz-pi">6-digit Start PIN</label><div class="vzm-row"><input id="vz-pi" class="vzm-pin n" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="000000" value="${esc(dv('vz-pi'))}"><button class="btn vzm-b" data-a="vz-ver" data-k="pin">Verify PIN</button></div>${!v ? `<p class="vzm-sub">No PIN yet: ask ${esc(cname)} to open the Track page in ZamMove.</p>` : ''}<details class="vzm-alt"><summary>${esc(cname)} shows a QR code instead?</summary><label class="vzm-l" for="vz-qi">Paste the QR code text</label><div class="vzm-row"><input id="vz-qi" autocomplete="off" placeholder="ZM1.…" value="${esc(dv('vz-qi'))}"><button class="btn o vzm-b" data-a="vz-ver" data-k="qr">Verify QR</button></div></details>`
      }${c.ph ? `<a class="vzm-call" href="tel:${esc(c.ph)}">Call ${esc(c.name)} · ${esc(c.ph)}</a>` : ''}</div>`;
    if (step == 1)
      return `<div class="vzm-sec"><h3>Check the vehicle</h3><p class="vzm-lead">Confirm you are driving the vehicle assigned to this booking.</p><div class="vzm-card vzm-veh"><div><small>Assigned vehicle</small><b>${esc(vi.name || '—')}</b><span>${[vi.color, vi.year].filter(Boolean).map(esc).join(' · ')}</span></div><div class="vzm-plate n">${esc(vi.plate || '—')}</div></div>${
        vi.ok ? '' : '<div class="vzm-er">This vehicle is not approved, active and available. Departure is blocked until an administrator reviews it.</div>'
      }${
        v && v.plate && v.plate.match
          ? okBox(`Plate ${esc(v.plate.entered)} matches`, 'This is the assigned vehicle.')
          : `${
              (v && v.disc ? v.disc : []).some(x => x.status == 'open' && x.auto == 'plate')
                ? `<div class="vzm-er">The plate did not match twice, so an administrator was notified. Enter the correct plate to clear it.</div>`
                : v && v.plate
                  ? `<div class="vzm-wait"><div><b>Plate ${esc(v.plate.entered)} does not match</b><span>Check the plate on the truck and enter it again. A second mismatch is reported to an administrator.</span></div></div>`
                  : ''
            }<label class="vzm-l" for="vz-pl">Type the plate number you see on the truck</label><div class="vzm-row"><input id="vz-pl" class="vzm-plin" autocomplete="off" autocapitalize="characters" placeholder="e.g. ABC 1234" value="${esc(dv('vz-pl'))}"><button class="btn vzm-b" data-a="vz-plate">Verify plate</button></div>`
      }</div>`;
    if (step == 2) {
      const ch = v.chk,
        L = !!v.dconf;
      const cd = (v.disc || []).find(x => x.status == 'open' && x.auto == 'count');
      return `<div class="vzm-sec"><h3>Cargo checklist</h3><p class="vzm-lead">Count what is on the truck and tick each item. Fragile items need padding and straps.</p>${
        cd ? `<div class="vzm-er">${esc(cd.note)} An administrator was notified. If you recount and it matches the booking, save again to clear it.</div>` : ''
      }<div class="vzm-count"><label for="vz-n">Pieces loaded</label><input id="vz-n" class="n" inputmode="numeric" value="${esc(dv('vz-n', ch && ch.count != null ? ch.count : ''))}" ${L ? 'disabled' : ''}><span>of <b>${mc(b)}</b> booked</span></div><ul class="vzm-items">${v.items
        .map(
          (x, i) =>
            `<li><label class="p-ck"><input type="checkbox" id="vz-it${i}" ${dv('vz-it' + i, ch && ch.items[i]) ? 'checked' : ''} ${L ? 'disabled' : ''}><span><b>${esc(x.n)}</b>${x.gen ? '' : ' × ' + x.q}${x.dim && !x.n.includes(x.dim) ? ` <small class="n">${esc(x.dim)}</small>` : ''}${x.fr ? ' <span class="tag">Fragile</span>' : ''}</span></label>${
              x.fr
                ? `<div class="vzm-fr"><label class="p-ck"><input type="checkbox" id="vz-pd${i}" ${dv('vz-pd' + i, ch && ch.frag[i].pad) ? 'checked' : ''} ${L ? 'disabled' : ''}><span>Padded and protected</span></label><label class="p-ck"><input type="checkbox" id="vz-st${i}" ${dv('vz-st' + i, ch && ch.frag[i].strap) ? 'checked' : ''} ${L ? 'disabled' : ''}><span>Strapped</span></label></div>`
                : ''
            }</li>`
        )
        .join('')}</ul><div class="vzm-opt"><div class="vzm-g2">${
        v.hvAny
          ? `<div><label class="vzm-l" for="vz-sl">Seal or ID reference <span class="mu">(high-value items)</span></label><input id="vz-sl" maxlength="60" value="${esc(dv('vz-sl', ch ? ch.seal : ''))}" ${L ? 'disabled' : ''}></div>`
          : ''
      }<div><label class="vzm-l" for="vz-nt">Notes <span class="mu">(optional)</span></label><input id="vz-nt" maxlength="300" value="${esc(dv('vz-nt', ch ? ch.note : ''))}" ${L ? 'disabled' : ''}></div><div><label class="vzm-l" for="vz-ph">Photo of the loaded cargo <span class="mu">(optional)</span></label><input id="vz-ph" type="file" accept="image/*" ${L ? 'disabled' : ''}>${ch && ch.photo ? `<img class="vzm-ph" src="${ch.photo}" alt="Loaded cargo">` : ''}</div></div></div>${
        L ? '' : '<button class="btn o vzm-b" data-a="vz-save">Save checklist</button>'
      }<div class="vzm-conf">${
        v.dconf
          ? okBox('You confirmed the checklist and vehicle', fmt(v.dconf.t))
          : `<button class="btn vzm-b" data-a="vz-dconf" ${ch && ch.done ? '' : 'disabled'}>Confirm checklist and vehicle</button>${ch && ch.done ? '' : '<p class="vzm-sub">Save the checklist first.</p>'}`
      }</div></div>`;
    }
    const cs = cond(b),
      all = cs.every(x => x[1]),
      cc = v.cconf,
      exc = v.exc;
    return `<div class="vzm-sec"><h3>Customer confirmation and departure</h3>${
      cc
        ? okBox(`${esc(cname)} confirmed the cargo`, fmt(cc.t))
        : exc
          ? okBox('Customer confirmation waived', 'An administrator waived it: ' + esc(exc.reason))
          : `<div class="vzm-wait"><span class="vzm-dots" aria-hidden="true"></span><div><b>Waiting for ${esc(cname)}</b><span>${esc(cname)} reviews the checklist and confirms on their Track page. This screen updates by itself.</span></div></div>`
    }${discH(b, 0)}<div class="vzm-card"><b>Departure checklist</b><ul class="vzm-cond">${cs.map(x => `<li class="${x[1] ? 'vzm-y' : 'vzm-n'}">${ck(x[1])}<span>${x[0]}</span></li>`).join('')}</ul></div><button class="btn vzm-go" data-a="vz-auth" ${all ? '' : 'disabled'}>Confirm verification &amp; authorize departure</button>${reportH(b)}</div>`;
  };
  /* customer: one clear screen */
  const custBody = b => {
    ensurePin(b);
    const v = b.ver,
      d = person(b.drvUser),
      vi = vehInfo(b),
      ch = v && v.chk,
      ready = !!(ch && ch.done && v.pinOk);
    const who = `<div class="vzm-card vzm-who"><span class="vzm-av" aria-hidden="true">${esc(ini(d.name))}</span><div class="vzm-wm"><b>${esc(d.name || 'Your driver')}</b><span class="vzm-badge">Verified driver</span><small>${esc([vi.color, vi.name].filter(Boolean).join(' ') || '—')}${vi.year ? ' (' + esc(vi.year) + ')' : ''}</small>${d.ph ? `<a class="vzm-call" href="tel:${esc(d.ph)}">Call ${esc(d.ph)}</a>` : ''}</div><div class="vzm-plate n"><span>${esc(vi.plate || '—')}</span><small>Check before loading</small></div></div>`;
    const pin = `<div class="vzm-card"><h3 class="vzm-h3"><i>1</i>Give the driver your Start PIN</h3><p class="vzm-sub">Only when your items are loaded and ${esc(fn1(d.name) || 'the driver')} is at your pickup.</p>${(() => {
      const p = v && v.pin,
        r = raw(b),
        exp = p && Date.now() > p.exp;
      if (v && v.pinOk) return okBox('PIN verified by the driver', fmt(v.pinOk.t) + '. It is no longer valid.');
      if (p && r && !exp) {
        const left = Math.max(0, p.exp - Date.now());
        return `<div class="vzm-pinbox"><div class="vzm-digits n" aria-label="Start PIN">${r.pin.split('').join(' ')}</div><p class="vzm-sub">Expires in <b id="vz-cd" data-exp="${p.exp}" class="n">${Math.floor(left / 6e4)}:${String(Math.floor(left / 1e3) % 60).padStart(2, '0')}</b></p><div class="vzm-qr">${qr('ZM1.' + b.id + '.' + r.tok)}</div><button class="btn o sm" data-a="vz-pin">Generate a new PIN</button></div>`;
      }
      return `<div class="vzm-pinbox"><p class="vzm-sub">${exp ? 'Your PIN expired.' : 'Your PIN is hidden in this new session.'}</p><button class="btn vzm-b" data-a="vz-pin">${exp ? 'Request a new PIN' : 'Show a new PIN'}</button></div>`;
    })()}</div>`;
    const load = `<div class="vzm-card"><h3 class="vzm-h3"><i>2</i>Check what was loaded</h3><b class="vzm-cap">Booked items</b>${itemsList(b, ch)}${
      ch
        ? `<b class="vzm-cap">Driver’s checklist</b>${kv('Pieces loaded', `${ch.count ?? '—'} of ${piecesOf(b)}`)}${ch.seal ? kv('Seal reference', esc(ch.seal)) : ''}${ch.note ? kv('Driver’s note', esc(ch.note)) : ''}${okI(ch.photo) ? `<img class="vzm-ph" src="${ch.photo}" alt="Photo of the loaded cargo">` : ''}`
        : '<div class="vzm-wait"><span class="vzm-dots" aria-hidden="true"></span><div><b>Waiting for the driver</b><span>The checklist appears here when the driver saves it.</span></div></div>'
    }</div>`;
    const conf = `<div class="vzm-card"><h3 class="vzm-h3"><i>3</i>Confirm your cargo</h3>${
      v && v.cconf
        ? okBox('You confirmed the cargo', fmt(v.cconf.t) + '. The driver can now authorize departure.')
        : v && v.exc
          ? okBox('Confirmation waived', 'An administrator waived your confirmation.')
          : `<label class="p-ck vzm-ck"><input type="checkbox" id="vz-rv" ${dv('vz-rv') ? 'checked' : ''}><span>I reviewed the checklist. The recorded items match what is being transported.</span></label><button class="btn vzm-b" data-a="vz-cconf" data-ready="${ready ? 1 : 0}" ${ready && dv('vz-rv') ? '' : 'disabled'}>Confirm cargo</button><p class="vzm-sub" id="vzm-cch">${ready ? 'Tick the box above to confirm.' : 'Available once the driver verifies your PIN and saves the checklist.'}</p>`
    }</div>`;
    return `${who}<div class="vzm-g2c">${pin}${load}</div>${conf}${discH(b, 0)}${reportH(b)}`;
  };
  const modalH = (b, mode) => {
    if (!b || !b.drv || b.st != 'Items Loaded' || (b.ver && b.ver.done) || !['customer', 'driver'].includes(mode) || viewOf(b) != mode) return '';
    const drv = mode == 'driver',
      sel = drv ? dStep(b) : -1,
      d = dState(b).d;
    if (drv && !b.ver) {
      /* the record does not exist until the customer opens Track: the PIN step still works once it does */
    }
    const body = drv ? (b.ver ? drvStep(b, sel) : drvStep({ ...b, ver: null }, 0)) : custBody(b);
    const nav = drv
      ? sel > 0 || (sel < 3 && d[sel])
        ? `${sel > 0 ? `<button class="btn o" data-a="vz-step" data-n="${sel - 1}">Back</button>` : '<span></span>'}${sel < 3 && d[sel] ? `<button class="btn" data-a="vz-step" data-n="${sel + 1}">Next</button>` : '<span></span>'}`
        : ''
      : `<span class="vzm-hint">${esc(ZV.hint || '')}</span><button class="btn o" data-a="vz-close">Close</button>`;
    return `<div class="vzm" role="dialog" aria-modal="true" aria-labelledby="vzm-t" tabindex="-1"><header class="vzm-h"><div><span class="vzm-k">Pre-departure verification</span><h2 id="vzm-t">${drv ? 'Verify before departure' : 'Check your cargo'}</h2><span class="vzm-ref"><b class="n">${esc(b.id)}</b> · ${esc(stop1(b.pu))} → ${esc(stop1(b.dr))}</span></div><button class="vzm-x" type="button" data-a="vz-close" aria-label="Close">×</button></header>${stepsH(b, mode, sel)}${tripH(b, mode)}<div class="vzm-body">${body}</div><footer class="vzm-f"><div class="vz-m ${ZV.msg ? (ZV.msgGood ? 'good' : 'bad') : ''}" id="vz-m" role="status" aria-live="polite">${esc(ZV.msg || '')}</div><div class="vzm-nav">${nav}</div></footer></div>`;
  };
  let vzLast = null;
  const mountModal = (force, focusFirst) => {
    let el = $('#vzm');
    if (!ZV.open) {
      if (el) {
        el.remove();
        document.body.classList.remove('vzm-lock');
        if (vzLast && vzLast.focus && document.contains(vzLast)) vzLast.focus();
      }
      vzLast = null;
      return;
    }
    const b = S.bk.find(x => x.id == ZV.open.id),
      md = ZV.open.mode,
      h = b ? modalH(b, md) : '';
    if (!h) {
      ZV.open = null;
      return mountModal(true);
    }
    if (el && !force) {
      /* a background refresh never interrupts typing or a chosen photo */
      const a = document.activeElement;
      if ((a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || [...el.querySelectorAll('input[type=file]')].some(f => f.files && f.files.length)) return;
    }
    let fresh = false;
    if (!el) {
      el = document.createElement('div');
      el.id = 'vzm';
      el.className = 'vzm-ov';
      document.body.appendChild(el);
      document.body.classList.add('vzm-lock');
      vzLast = document.activeElement;
      fresh = true;
    }
    el.dataset.bid = b.id;
    el.dataset.mode = md;
    const old = el.querySelector('.vzm-body'),
      top = old && !fresh && !focusFirst ? old.scrollTop : 0;
    el.innerHTML = h;
    const nb = el.querySelector('.vzm-body');
    if (nb) nb.scrollTop = top;
    if (fresh || focusFirst) {
      const f = el.querySelector('.vzm-body input:not([disabled]):not([type=checkbox]):not([type=file])');
      (f || el.querySelector('.vzm')).focus({ preventScroll: true });
    }
  };
  const syncModal = () => {
    if (ZV.open && !$('#vz')) {
      /* left the booking page: close the pop-up instead of carrying it to other pages */
      ZV.open = null;
      return mountModal(false);
    }
    if (ZV.open) return mountModal(false);
    const e = $('#vz');
    if (!e || !['customer', 'driver'].includes(e.dataset.mode)) return;
    const key = 'zmvo:' + e.dataset.bid + ':' + e.dataset.mode,
      b = S.bk.find(x => x.id == e.dataset.bid);
    if (!b || b.st != 'Items Loaded' || (b.ver && b.ver.done) || ss.get(key)) return;
    ss.set(key, '1'); // opens by itself once per booking and person; the card reopens it
    ZV.open = { id: b.id, mode: e.dataset.mode };
    ZV.msg = '';
    mountModal(true, true);
  };
  let vzDown = null;
  document.addEventListener('mousedown', e => (vzDown = e.target));
  document.addEventListener('click', e => {
    if (ZV.open && e.target.classList && e.target.classList.contains('vzm-ov') && vzDown === e.target) {
      ZV.open = null;
      mountModal(true);
    }
  });
  document.addEventListener('keydown', e => {
    if (!ZV.open) return;
    if (e.key == 'Escape') {
      e.preventDefault();
      ZV.open = null;
      return mountModal(true);
    }
    if (e.key == 'Enter' && e.target && e.target.id) {
      const q = { 'vz-pi': '[data-a="vz-ver"][data-k="pin"]', 'vz-qi': '[data-a="vz-ver"][data-k="qr"]', 'vz-pl': '[data-a="vz-plate"]' }[e.target.id],
        btn = q && $('#vzm ' + q);
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    }
    if (e.key == 'Tab') {
      const el = $('#vzm');
      if (!el) return;
      const f = [...el.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), a[href], summary')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const out = !el.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === f[0] || out)) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && (document.activeElement === f[f.length - 1] || out)) {
        e.preventDefault();
        f[0].focus();
      }
    }
  });

  /* wrap track and booking cards */
  const _tk = track;
  track = function () {
    const h = _tk(),
      act = S.bk
        .filter(b => !['Cancelled', 'Rejected'].includes(b.st))
        .reverse()
        .sort((a, c) => (a.st == 'Completed') - (c.st == 'Completed')),
      b = act.find(x => x.id == msg.tid) || act[0];
    return (b && viewOf(b) == 'customer' ? dpanel(b, 'customer') + panel(b, 'customer') : '') + h;
  };
  const _bc = bcard;
  bcard = function (b) {
    let h = _bc(b);
    if (b.drv && (b.st == 'Items Loaded' || (b.ver && b.ver.done))) {
      const v = b.ver;
      h = h.replace(
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">',
        `<div class="vz-bc"><b>Pre-departure verification</b> ${v && v.done ? '<span class="tag g">Completed</span>' : '<span class="tag">Action needed</span>'}<div class="vz-sum">${sum(
          b
        )
          .map(x => `<span class="${x[1] ? 'ok' : ''}">${ck(x[1])}${x[0]}</span>`)
          .join(
            ''
          )}</div>${v && v.done ? '' : `<button class="btn sm" data-a="trk" data-id="${b.id}">Open verification</button>`}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">`
      );
    }
    if (b.drv && b.st == 'Arrived at Destination')
      h = h.replace(
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">',
        `<div class="vz-bc"><b>Delivery PIN</b> <span class="tag">Action needed</span><p class="mu" style="margin:6px 0">Your driver has arrived. Check your items, then give the driver your Delivery PIN.</p><button class="btn sm" data-a="trk" data-id="${esc(b.id)}">Show Delivery PIN</button></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">`
      );
    return h;
  };
  /* handlers */
  const run = async (t, fn, okMsg, keep) => {
    if (ZV.busy) return;
    ZV.busy = true;
    t.disabled = true;
    t.classList.add('is-busy');
    const b = cur(),
      md = modeOf();
    let r;
    try {
      r = await fn(b, actor(b, md));
    } catch (e) {
      r = no('Unexpected error: ' + e.message);
    }
    ZV.busy = false;
    ZV.msg = r.ok ? r.warn || okMsg || '' : r.err;
    ZV.msgGood = !!r.ok;
    if (r.ok && !keep) delete ZV.step[b.id];
    if (r.ok || r.saved)
      Object.keys(ZV.draft).forEach(k => {
        if (/^vz-(pi|qi|pl|dn|ex|rv)/.test(k) || /^vz-rs|^vz-rm/.test(k)) delete ZV.draft[k];
      });
    const m = S.bk.find(x => x.id == b.id);
    if (m && m.st == 'In Transit') {
      toast('Departure authorized. Booking is In Transit.');
      return render();
    }
    ref();
    const e = $('#vz-m');
    if (e && ZV.msg) {
      e.className = 'vz-m ' + (r.ok ? 'good' : 'bad');
    }
  };
  const draft = e => {
    const i = e.target.id;
    if (i == 'vz-pi' && /\D/.test(e.target.value)) e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (i && i.startsWith('vz-') && e.target.type != 'file')
      ZV.draft[i] = e.target.type == 'checkbox' ? e.target.checked : e.target.value;
  };
  document.addEventListener('input', draft);
  document.addEventListener('change', draft);
  /* customer: Confirm cargo unlocks only when "I reviewed the checklist" is ticked */
  document.addEventListener('change', e => {
    if (!e.target || e.target.id != 'vz-rv') return;
    const btn = document.querySelector('#vzm [data-a="vz-cconf"]'),
      h = document.getElementById('vzm-cch');
    if (!btn) return;
    const ready = btn.dataset.ready == '1';
    btn.disabled = !(ready && e.target.checked);
    if (h && ready) h.textContent = e.target.checked ? 'Thank you. Press Confirm cargo.' : 'Tick the box above to confirm.';
  });
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest('[data-a^="vz-"],[data-a="adv"]');
      if (!t || !S.me) return;
      const a = t.dataset.a;
      if (a == 'adv') {
        const b = S.bk.find(x => x.id == t.dataset.id);
        if (b && ['Items Loaded', 'Arrived at Destination'].includes(b.st)) {
          e.stopPropagation();
          e.preventDefault();
          msg['b' + b.id] =
            "Blocked: this step needs the customer's PIN, entered by the assigned driver on the Active trip page.";
          render();
        }
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      const dr = k => ZV.draft[k];
      if (a == 'vz-open') {
        ZV.open = { id: t.dataset.id, mode: t.dataset.mode };
        ZV.msg = '';
        return mountModal(true, true);
      }
      if (a == 'vz-close') {
        ZV.open = null;
        return mountModal(true);
      }
      if (a == 'vz-step') {
        const b0 = cur();
        if (b0) ZV.step[b0.id] = +t.dataset.n;
        ZV.msg = '';
        return mountModal(true, true);
      }
      if (a == 'vz-pin')
        return run(t, (b, x) => API.newPin(b.id, x), 'A new PIN was issued. The old one no longer works.');
      if (a == 'vz-ver')
        return run(
          t,
          (b, x) => API.verify(b.id, x, t.dataset.k == 'qr' ? dr('vz-qi') : dr('vz-pi'), t.dataset.k),
          'Verified.'
        );
      if (a == 'vz-plate')
        return run(t, (b, x) => API.plate(b.id, x, dr('vz-pl')), 'Vehicle plate verified.');
      if (a == 'vz-save')
        return run(
          t,
          async (b, x) => {
            const it = b.ver.items,
              f = $('#vz-ph'),
              photo = f && f.files[0] ? await pimg('vz-ph') : (b.ver.chk && b.ver.chk.photo) || '';
            return API.save(b.id, x, {
              count: dr('vz-n') ?? $('#vz-n').value,
              items: it.map((_, i) => !!(dr('vz-it' + i) ?? $('#vz-it' + i).checked)),
              frag: it.map((_, i) => ({
                pad: !!(dr('vz-pd' + i) ?? ($('#vz-pd' + i) || {}).checked),
                strap: !!(dr('vz-st' + i) ?? ($('#vz-st' + i) || {}).checked),
              })),
              seal: dr('vz-sl') ?? ($('#vz-sl') || {}).value,
              note: dr('vz-nt') ?? ($('#vz-nt') || {}).value,
              photo,
            });
          },
          'Checklist saved.',
          true
        );
      if (a == 'vz-dconf')
        return run(t, (b, x) => API.confirmDriver(b.id, x), 'Driver confirmation recorded.');
      if (a == 'vz-cconf')
        return run(
          t,
          (b, x) => API.confirmCustomer(b.id, x, !!dr('vz-rv')),
          'Your confirmation was recorded.'
        );
      if (a == 'vz-disc')
        return run(
          t,
          (b, x) => API.disc(b.id, x, { type: dr('vz-dt') || 'Missing items', note: dr('vz-dn') }),
          'Report submitted. Departure is blocked until an administrator resolves it.'
        );
      if (a == 'vz-resolve')
        return run(
          t,
          (b, x) =>
            API.resolve(b.id, x, {
              id: t.dataset.d,
              res: dr('vz-rs-' + t.dataset.d),
              mc: dr('vz-rm-' + t.dataset.d) ?? '',
            }),
          'Resolution recorded.'
        );
      if (a == 'vz-exc') return run(t, (b, x) => API.exception(b.id, x, dr('vz-ex')), 'Exception recorded.');
      if (a == 'vz-veh') return run(t, (b, x) => API.vehicle(b.id, x), 'Vehicle approval changed.');
      if (a == 'vz-auth') return run(t, (b, x) => API.authorize(b.id, x), '');
    },
    true
  );
  window.ZMVER.panel = panel;
  window.ZMVER.dpanel = dpanel;
  const drun = async (t, fn, okMsg) => {
    if (ZV.busy) return;
    ZV.busy = true;
    t.disabled = true;
    t.classList.add('is-busy');
    const b = dcur(),
      md = dmode();
    let r;
    try {
      r = await fn(b, actor(b, md));
    } catch (e) {
      r = no('Unexpected error: ' + e.message);
    }
    ZV.busy = false;
    ZV.dmsg = r.ok ? okMsg : r.err;
    if (r.ok) ['vz-dpi', 'vz-dnt', 'vz-dwv'].forEach(k => delete ZV.draft[k]);
    const m = S.bk.find(x => x.id == b.id);
    if (r.ok && m && m.st == 'Delivery Confirmation') {
      ZV.dmsg = '';
      toast('Delivery confirmed.');
      return render();
    }
    dref();
    const e = $('#dz-m');
    if (e && ZV.dmsg) e.className = 'vz-m ' + (r.ok ? 'good' : 'bad');
  };
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest('[data-a^="dz-"]');
      if (!t || !S.me) return;
      e.stopPropagation();
      e.preventDefault();
      const a = t.dataset.a;
      if (a == 'dz-report') {
        const b = dcur();
        msg.ib = b && b.id;
        ZV.dmsg = '';
        return go('reports');
      }
      if (a == 'dz-pin')
        return drun(
          t,
          (b, x) => API.dNewPin(b.id, x),
          'A new Delivery PIN was issued. The old one no longer works.'
        );
      if (a == 'dz-deliver')
        return drun(
          t,
          async (b, x) => {
            const f = $('#vz-dph'),
              ph = f && f.files[0] ? await pimg('vz-dph') : '';
            return API.deliver(
              b.id,
              x,
              ZV.draft['vz-dpi'] ?? ($('#vz-dpi') || {}).value,
              ZV.draft['vz-dnt'] ?? ($('#vz-dnt') || {}).value,
              ph
            );
          },
          'Delivery confirmed.'
        );
      if (a == 'dz-waive')
        return drun(
          t,
          (b, x) => API.dWaive(b.id, x, ZV.draft['vz-dwv'] ?? ($('#vz-dwv') || {}).value),
          'Delivery PIN waived. The driver can now confirm delivery with a note.'
        );
    },
    true
  );
  setInterval(() => {
    const e = $('#dz-cd');
    if (!e) return;
    if (+e.dataset.exp <= Date.now()) return dref();
    e.textContent = mmss(+e.dataset.exp);
  }, 1000);
  setInterval(() => {
    const e = $('#vz-cd');
    if (!e) return;
    const s = Math.round((+e.dataset.exp - Date.now()) / 1e3);
    if (s <= 0) return ref();
    e.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
  /* later layers (the driver workspace, the trip layouts) finish the page after this one: check once the
     whole redraw is done */
  let vzT = 0;
  const _r8 = render;
  render = function () {
    const out = _r8.apply(this, arguments);
    clearTimeout(vzT);
    vzT = setTimeout(() => {
      try {
        syncModal();
      } catch (e) {
        /* the pop-up never breaks a page redraw */
      }
    }, 0);
    return out;
  };
  render();
})();
