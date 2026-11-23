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
  const ZV = { fail: false, busy: false, draft: {}, issuing: {} };
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
  function panel(b, mode) {
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
        body = `<b>Your Delivery PIN</b>${p && r && !exp ? `<div class="vz-pin n" aria-label="Delivery PIN">${r.split('').join(' ')}</div><p class="mu">Check your items first. Give this PIN to the driver only when everything arrived in good condition. Expires in <b id="dz-cd" data-exp="${p.exp}" class="n">${mmss(p.exp)}</b>.</p><button class="btn o sm" data-a="dz-pin">Generate a new PIN</button>` : `<p class="mu">${exp ? 'Your Delivery PIN expired.' : p ? 'Your PIN is hidden in this new session.' : 'Preparing your PIN…'}</p>${p ? `<button class="btn sm" data-a="dz-pin">${exp ? 'Request a new PIN' : 'Show a new PIN'}</button>` : ''}`}`;
      }
      body += rep;
    } else if (mode == 'driver')
      body = `${d.waive ? `<div class="note">Delivery PIN waived by an administrator: ${esc(d.waive.reason)}</div>` : `<label class="vz-l" for="vz-dpi">Customer's Delivery PIN</label><input id="vz-dpi" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="6-digit PIN" value="${esc(dv('vz-dpi'))}">`}<label class="vz-l" for="vz-dnt">Delivery condition</label><textarea id="vz-dnt" rows="2" style="width:100%" placeholder="Items delivered, count, condition">${esc(dv('vz-dnt'))}</textarea><label class="vz-l" for="vz-dph">Photo at drop-off <span class="mu">(optional)</span></label><input id="vz-dph" type="file" accept="image/*"><div class="vz-f"><button class="btn sm" data-a="dz-deliver">Confirm delivery</button></div>`;
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
    const e = $('#vz');
    return e && S.bk.find(x => x.id == e.dataset.bid);
  };
  const modeOf = () => {
    const e = $('#vz');
    return e ? e.dataset.mode : '';
  };
  const ref = () => {
    const b = cur();
    if (!b) return;
    const e = $('#vz');
    const h = panel(b, modeOf());
    if (!h) {
      render();
      return;
    }
    const t = document.createElement('div');
    t.innerHTML = h;
    e.replaceWith(t.firstElementChild);
  };
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
  const run = async (t, fn, okMsg) => {
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
    if (i && i.startsWith('vz-') && e.target.type != 'file')
      ZV.draft[i] = e.target.type == 'checkbox' ? e.target.checked : e.target.value;
  };
  document.addEventListener('input', draft);
  document.addEventListener('change', draft);
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
          'Checklist saved.'
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
  render();
})();
