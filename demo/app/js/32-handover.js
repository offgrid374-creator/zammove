/**
 * 32-handover.js — rental pickup and return checked like a booking (server: domain/handover.js).
 *
 *   Renter   My rentals: share location → show the Release code (PIN + QR) → confirm the plate → confirm the
 *            owner's odometer/fuel/photos → rental starts. At the end: show the Return code (proof of return).
 *   Owner    Rentals: share location → type or scan the renter's code → (renter confirms plate) → record → wait
 *            for the renter. At the end: scan the Return code, or give a reason when the renter cannot show it.
 *   Driver   Active trip page: the rentals they drive (with-driver rentals): same checks, then "Start the rental".
 */
(function () {
  'use strict';
  const me = () => (S.me || {}).em;
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const at = t => (t ? new Date(t).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '');
  const T12 = x => (window.ZT12 ? ZT12(x) : x);
  const FAR_KM = 0.3,
    EARLY_H = 12;
  const PINS = {}; // the renter's open codes, kept only in this page: `${id}:${stage}` → { pin, qr, exp }
  const ho = (r, st) => (r.ho || {})[st] || {};
  const pickupMs = r => new Date(`${r.s}T${r.pt || '08:00'}:00+08:00`).getTime();
  const isOpen = r => Date.now() >= pickupMs(r) - EARLY_H * 36e5;
  const ready = r => {
    const paid = typeof ZPAY != 'undefined' ? ZPAY.sum(r.id) : 0,
      sg = (r.ct && r.ct.sg) || {};
    return paid >= +r.tot + (+r.dep || 0) - 0.005 && !!sg.cu && !!sg.ow;
  };
  const side = r => (r.withDrv ? 'driver' : 'owner');
  const qr = t => {
    try {
      const q = qrcode(0, 'M');
      q.addData(t);
      q.make();
      return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) {
      return '';
    }
  };
  /* the same sentences the server uses, so the owner sees why a reason is needed before pressing */
  const issues = (r, st) => {
    if (r.withDrv && st == 'back') return [];
    const L = ho(r, st).loc || {},
      place = st == 'out' ? 'pickup point' : 'return point',
      out = [];
    [
      ['cu', 'renter'],
      ['ow', side(r)],
    ].forEach(([k, who]) => {
      const x = L[k];
      if (!x) out.push(`No location from the ${who}`);
      else if (x.km != null && x.km > FAR_KM) out.push(`The ${who} is ${x.km} km from the ${place}`);
    });
    return out;
  };
  const step = (done, title, body = '', now = false) =>
    `<div class="zh-st${done ? ' d' : now ? ' n' : ''}"><span class="zh-dot" aria-hidden="true">${done ? '✓' : ''}</span><div><b>${title}</b>${body ? `<div class="zh-b">${body}</div>` : ''}</div></div>`;
  const locLine = (r, st, k, who) => {
    const x = (ho(r, st).loc || {})[k];
    if (!x) return `${who}: not shared yet`;
    return `${who}: shared ${at(x.t)}${x.km != null ? ` · ${x.km} km from the ${st == 'out' ? 'pickup' : 'return'} point${x.km > FAR_KM ? ' <span class="tag r">far</span>' : ''}` : ''}`;
  };
  const locStep = (r, st, mine) => {
    const k = mine == 'cu' ? 'cu' : 'ow',
      L = ho(r, st).loc || {};
    return step(
      !!L[k],
      'Share your location',
      `<span class="mu">${locLine(r, st, 'cu', 'Renter')}<br>${locLine(r, st, 'ow', r.withDrv ? 'Driver' : 'Owner')}</span><div class="wsa"><button class="btn o sm" data-a="zh-loc" data-id="${esc(r.id)}" data-st="${st}">${L[k] ? 'Share again' : 'Share my location'}</button></div>`,
      !L[k]
    );
  };
  const codeEntry = (r, st) => {
    const id = esc(r.id),
      key = `${id}-${st}`;
    return `<div class="wsa"><input id="zh-in-${key}" inputmode="numeric" maxlength="60" placeholder="6-digit code from the renter" style="width:200px" aria-label="Renter’s code"><button class="btn sm" data-a="zh-ver" data-id="${id}" data-st="${st}">Confirm code</button><button class="btn o sm" data-a="zh-scan" data-id="${id}" data-st="${st}">Scan QR</button></div><div id="zh-cam-${key}" hidden></div>`;
  };
  const farBox = (r, st) => {
    const L = issues(r, st);
    if (!L.length) return '';
    return `<div class="zh-warn"><b>Check the locations:</b> ${esc(L.join('. '))}.<br><span class="mu">Phone GPS can be off indoors. To continue anyway, give a reason (kept on the rental).</span><input id="zh-far-${st}-${esc(r.id)}" placeholder="e.g. Inside a covered garage, no GPS signal" style="width:100%;margin-top:6px"></div>`;
  };
  const photos = rec =>
    rec && rec.ph
      ? `<div class="zh-ph">${Object.entries(rec.ph)
          .map(([k, src]) => (src ? `<a href="#" data-a="fx-img" data-src="${esc(src)}"><img src="${esc(src)}" alt="${esc(k)}"></a>` : ''))
          .join('')}</div>`
      : '';
  const codeBox = (r, st) => {
    const P = PINS[`${r.id}:${st}`];
    if (!P || Date.now() > P.exp) return `<div class="wsa"><button class="btn sm" data-a="zh-code" data-id="${esc(r.id)}" data-st="${st}">Show my ${st == 'out' ? 'Release' : 'Return'} code</button></div>`;
    return `<div class="zh-code"><div class="zh-qr">${qr(P.qr)}</div><div><span class="mu">Your ${st == 'out' ? 'Release' : 'Return'} code</span><b class="n">${esc(P.pin.replace(/(\d{3})(\d{3})/, '$1 $2'))}</b><span class="mu" style="font-size:12px">Valid until ${at(P.exp)}. Show it to the ${side(r)} only ${st == 'out' ? 'when the vehicle is in front of you' : 'when you hand the vehicle back'}.</span></div></div>`;
  };

  /* ---------- renter ---------- */
  const renter = r => {
    if (!r.hv || r.cu != me()) return '';
    const id = esc(r.id);
    if (r.st == 'Approved') {
      if (!ready(r)) return '';
      if (!isOpen(r)) return `<div class="zh card-in"><b>Pickup check</b><p class="mu" style="margin:4px 0 0;font-size:14px">Opens ${EARLY_H} hours before your pickup (${esc(r.s)} ${T12(r.pt)}). At pickup you share your location, show a Release code to the ${side(r)} and confirm the plate.</p></div>`;
      const o = ho(r, 'out');
      return `<div class="zh card-in"><b class="zh-h">Pickup check</b><p class="mu" style="margin:2px 0 8px;font-size:13px">At ${esc(r.pu)}, ${esc(r.s)} ${T12(r.pt)}. Do these with the ${side(r)} beside you.</p>${locStep(r, 'out', 'cu')}${step(
        !!o.pinOk,
        `Show your Release code to the ${side(r)}`,
        o.pinOk ? `<span class="mu">Confirmed ${at(o.pinOk.t)}.</span>` : codeBox(r, 'out'),
        !o.pinOk
      )}${step(
        !!o.plate,
        'Confirm the plate of the vehicle',
        o.plate
          ? `<span class="mu">Plate matches the vehicle you rented.</span>`
          : o.pinOk
            ? `<div class="wsa"><input id="zh-pl-${id}" placeholder="Plate on the vehicle, e.g. ABC 1234" style="width:220px" autocapitalize="characters" aria-label="Plate number"><button class="btn sm" data-a="zh-plate" data-id="${id}">Confirm plate</button></div>`
            : '<span class="mu">After your code is confirmed.</span>',
        !!o.pinOk && !o.plate
      )}${
        r.withDrv
          ? step(false, 'Your driver starts the rental', '<span class="mu">After the plate check, the driver presses Start.</span>')
          : step(
              false,
              'Check the owner’s record and start',
              o.rec
                ? `<div class="vz-g" style="margin:6px 0"><div class="row"><span>Odometer</span><b>${Number(o.rec.odo).toLocaleString('en-PH')} km</b></div><div class="row"><span>Fuel</span><b>${esc(o.rec.fuel)}</b></div><div class="row"><span>Condition</span><b>${esc(o.rec.cond)}</b></div></div>${photos(o.rec)}<p class="mu" style="font-size:13px;margin:6px 0">Walk around the vehicle and compare. This record is what the return is checked against.</p><div class="wsa"><button class="btn sm" data-a="zh-ok" data-id="${id}">Everything matches · start my rental</button></div><details style="margin-top:6px"><summary style="cursor:pointer;font-weight:600">Something is different</summary><div class="wsa"><input id="zh-dn-${id}" placeholder="e.g. There is also a scratch on the right door" style="flex:1;min-width:200px"><button class="btn o sm" data-a="zh-diff" data-id="${id}">Start, noting the difference</button></div></details>`
                : '<span class="mu">The owner records the odometer, fuel and 6 photos after your plate check.</span>',
              !!o.rec
            )
      }</div>`;
    }
    if (r.st == 'Active') {
      const b = ho(r, 'back');
      return `<div class="zh card-in"><b class="zh-h">Return check</b><p class="mu" style="margin:2px 0 8px;font-size:13px">Due ${esc(r.e)} by ${T12(r.rtm)}${r.withDrv ? '' : ` at ${esc(r.rt)}`}.${r.withDrv ? ' At the end, show your Return code to the driver.' : ' Submit the return photos below, then show your Return code to the owner when you hand over the keys.'}</p>${r.withDrv ? '' : locStep(r, 'back', 'cu')}${step(
        !!b.pinOk,
        `Show your Return code to the ${side(r)}`,
        b.pinOk ? `<span class="ok" style="display:block">Received by the ${side(r)} at ${at(b.pinOk.t)}, ${new Date(b.pinOk.t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}. This is your proof of return.</span>` : codeBox(r, 'back'),
        !b.pinOk
      )}</div>`;
    }
    if (r.st == 'Returned' && ho(r, 'back').nocode) return `<div class="note" style="margin-top:8px">The owner recorded the return without your Return code: “${esc(ho(r, 'back').nocode.why)}”. If this is wrong, report it from the Report page.</div>`;
    return '';
  };

  /* ---------- owner (and the rental's driver): pickup ---------- */
  const ownerOut = (r, isReady, form) => {
    if (!isReady) return '';
    const id = esc(r.id),
      o = ho(r, 'out'),
      mine = r.withDrv && r.withDrv.em != me() ? `<p class="note" style="margin:0 0 8px">${esc(r.withDrv.name || 'Your driver')} does the pickup check with the renter. You can also do it yourself.</p>` : '';
    if (!isOpen(r)) return `<div class="zh card-in"><b>Pickup check</b><p class="mu" style="margin:4px 0 0;font-size:14px">Opens ${EARLY_H} hours before pickup (${esc(r.s)} ${T12(r.pt)} at ${esc(r.pu)}).</p></div>`;
    return `<div class="zh card-in"><b class="zh-h">Pickup check</b><p class="mu" style="margin:2px 0 8px;font-size:13px">${esc(r.s)} ${T12(r.pt)} at ${esc(r.pu)}. Check the renter’s face against their ID photo above.</p>${mine}${locStep(r, 'out', 'ow')}${step(
      !!o.pinOk,
      'Enter or scan the renter’s Release code',
      o.pinOk ? `<span class="mu">Confirmed ${at(o.pinOk.t)} (${o.pinOk.via == 'qr' ? 'QR' : 'PIN'}).</span>` : `<span class="mu">The renter opens it in My rentals. It proves the right person is collecting.</span>${codeEntry(r, 'out')}`,
      !o.pinOk
    )}${step(!!o.plate, 'Renter confirms the plate', `<span class="mu">${o.plate ? 'Done.' : o.pinOk ? 'Waiting for the renter to type the plate they see.' : 'After the code.'}</span>`, !!o.pinOk && !o.plate)}${
      o.rec
        ? step(false, 'Waiting for the renter to confirm your record', '<span class="mu">The rental starts as soon as they confirm.</span>', true)
        : o.pinOk && o.plate
          ? step(false, r.withDrv ? 'Start the rental' : 'Record the vehicle and send it to the renter', farBox(r, 'out') + form(), true)
          : step(false, r.withDrv ? 'Start the rental' : 'Record odometer, fuel and 6 photos', '<span class="mu">After the plate check.</span>')
    }</div>`;
  };
  /* ---------- owner (and the rental's driver): return ---------- */
  const ownerBack = r => {
    const id = esc(r.id),
      b = ho(r, 'back');
    return `<div class="zh card-in"><b class="zh-h">Return check</b><p class="mu" style="margin:2px 0 8px;font-size:13px">Due ${esc(r.e)} by ${T12(r.rtm)}${r.withDrv ? '' : ` at ${esc(r.rt)}`}. Scanning the renter’s Return code records when you received the vehicle.</p>${r.withDrv ? '' : locStep(r, 'back', 'ow')}${step(
      !!b.pinOk,
      'Enter or scan the renter’s Return code',
      b.pinOk
        ? `<span class="mu">Received ${at(b.pinOk.t)}.</span>`
        : `${codeEntry(r, 'back')}${r.owner == me() ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:14px">The renter cannot show the code</summary><input id="zh-nc-${id}" placeholder="Why (at least 10 characters), e.g. Keys left at the guard house" style="width:100%;margin-top:6px"><p class="mu" style="font-size:12px;margin:4px 0 0">Then use the return buttons below. The renter is told.</p></details>` : ''}`,
      !b.pinOk
    )}${b.pinOk && r.owner == me() ? farBox(r, 'back') : ''}${r.withDrv && b.pinOk && r.owner != me() ? '<p class="mu" style="font-size:13px">Bring the vehicle back to the owner; the owner records the return.</p>' : ''}</div>`;
  };

  /* ---------- driver: the rentals they drive ---------- */
  const driverCard = () => {
    const L = (S.rn || []).filter(r => r.hv && r.withDrv && r.withDrv.em == me() && ['Approved', 'Active'].includes(r.st));
    if (!L.length) return '';
    const nm = em => ((S.users || []).find(u => u.em == em) || {}).name || 'the renter';
    return `<section class="card zh-card"><h2 style="font-size:20px;margin:0 0 6px">Rentals you drive</h2>${L.map(r => {
      const id = esc(r.id),
        head = `<p style="margin:8px 0 4px"><b>${esc(r.vn)}</b> <span class="n mu">${esc(r.vplate || '')}</span> · ${esc(nm(r.cu))} · ${esc(r.s)} ${T12(r.pt)} → ${esc(r.e)} ${T12(r.rtm)}</p>`;
      if (r.st == 'Approved')
        return head + ownerOut(r, true, () => `<div class="wsa"><button class="btn sm" data-a="zh-start" data-id="${id}">Start the rental</button></div>`); // the server says if payment or signatures are missing
      return head + ownerBack(r);
    }).join('')}</section>`;
  };

  /* far / no-code reasons go with the owner's existing Release and Return buttons */
  const _act = ZAPI.act;
  ZAPI.act = (n, p) => {
    if (n == 'rentalDecision' && p && ['release', 'return'].includes(p.act)) {
      const st = p.act == 'release' ? 'out' : 'back';
      p = { ...p, far: p.far || v(`zh-far-${st}-${p.id}`), nocode: p.nocode || v(`zh-nc-${p.id}`) };
    }
    return _act(n, p);
  };

  /* camera scan of the renter's QR (browsers with BarcodeDetector) */
  let cam = null;
  const stopCam = () => {
    if (cam) cam.getTracks().forEach(t => t.stop());
    cam = null;
    document.querySelectorAll('[id^="zh-cam-"]').forEach(c => ((c.hidden = true), (c.innerHTML = '')));
  };
  const scan = async (id, st) => {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) return toast('This browser cannot scan codes. Type the 6-digit code instead.');
    try {
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const c = document.getElementById(`zh-cam-${id}-${st}`);
      c.hidden = false;
      c.innerHTML = '<video playsinline muted style="width:100%;max-width:320px;border-radius:12px"></video><button type="button" class="btn o sm" data-a="zh-scan-x">Stop scanning</button>';
      const vid = c.querySelector('video');
      vid.srcObject = cam;
      await vid.play();
      const tick = async () => {
        if (!cam) return;
        const code = (await det.detect(vid).catch(() => [])).map(f => f.rawValue).find(x => /^ZMR1\./.test(x));
        if (code) {
          stopCam();
          const r = await ZAPI.act('hoVerify', { id, stage: st, input: code, kind: 'qr' });
          toast(r.ok ? 'Code confirmed.' : r.err);
          return render();
        }
        setTimeout(tick, 300);
      };
      tick();
    } catch (e) {
      stopCam();
      toast('Could not open the camera. Type the 6-digit code instead.');
    }
  };
  const where = () =>
    new Promise(res => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
        () => res(null),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    });

  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest && e.target.closest('[data-a^="zh-"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        id = t.dataset.id,
        st = t.dataset.st || 'out';
      if (a == 'zh-scan-x') return stopCam();
      if (a == 'zh-scan') return scan(id, st);
      t.disabled = true;
      let r, okMsg;
      if (a == 'zh-loc') {
        const loc = await where();
        if (!loc) {
          t.disabled = false;
          return toast('Your phone did not give a location. Allow location for this site and try again.');
        }
        r = await ZAPI.act('hoLoc', { id, stage: st, loc });
        okMsg = r.ok && r.km != null ? `Location shared: ${r.km} km from the ${st == 'out' ? 'pickup' : 'return'} point.` : 'Location shared.';
      }
      if (a == 'zh-code') {
        r = await ZAPI.act('hoIssue', { id, stage: st });
        if (r.ok) PINS[`${id}:${st}`] = { pin: r.pin, qr: r.qr, exp: r.exp };
        okMsg = 'Code ready. It was also sent to your phone and email.';
      }
      if (a == 'zh-ver') (r = await ZAPI.act('hoVerify', { id, stage: st, input: v(`zh-in-${id}-${st}`) })), (okMsg = 'Code confirmed.');
      if (a == 'zh-plate') (r = await ZAPI.act('hoPlate', { id, plate: v('zh-pl-' + id) })), (okMsg = 'Plate confirmed.');
      if (a == 'zh-ok') (r = await ZAPI.act('hoConfirm', { id })), (okMsg = 'Your rental has started. Drive safely.');
      if (a == 'zh-diff') (r = await ZAPI.act('hoConfirm', { id, ok: false, note: v('zh-dn-' + id) })), (okMsg = 'Your rental has started. The owner was told about the difference.');
      if (a == 'zh-start') (r = await ZAPI.act('rentalDecision', { id, act: 'release' })), (okMsg = 'The rental has started.');
      t.disabled = false;
      if (!r) return;
      toast(r.ok ? okMsg : r.err);
      if (r.ok) render();
    },
    true
  );

  window.ZHO = { renter, ownerOut, ownerBack };
  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    setTimeout(() => {
      try {
        if (!(S.me && S.ws == 'driver' && ((S.wp || {}).driver || '') == 'trip')) return;
        const h1 = document.querySelector('#app h1');
        if (!h1) return;
        const html = driverCard();
        let box = document.getElementById('zh-drv');
        if (box && box.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
        if (!html) return box && box.remove();
        if (!box) {
          box = document.createElement('div');
          box.id = 'zh-drv';
          const top = getComputedStyle(h1.parentElement).display.includes('flex') && h1.parentElement.id != 'app' ? h1.parentElement : h1;
          top.insertAdjacentElement('afterend', box);
        }
        if (box.dataset.h != html) (box.dataset.h = html), (box.innerHTML = html);
      } catch (x) {
        /* never break a redraw */
      }
    }, 0);
    return out;
  };
  const css = document.createElement('style');
  css.textContent = `.zh{margin-top:10px;padding:12px 14px;border:1px solid var(--bd);border-radius:12px;background:var(--s,#fff);min-width:0;max-width:100%;box-sizing:border-box}.zh-h{font-size:16px}.zh-st{display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--bd)}.zh-st:first-of-type{border-top:0}.zh-dot{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid var(--bd);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-top:1px}.zh-st.d .zh-dot{background:var(--zb-pri,#0f766e);border-color:var(--zb-pri,#0f766e);color:#fff}.zh-st.n .zh-dot{border-color:var(--zb-pri,#0f766e)}.zh-st:not(.d):not(.n){opacity:.75}.zh-st>div{min-width:0;flex:1}.zh-b{font-size:14px;margin-top:4px}.zh-b .wsa{margin:6px 0 0}.zh-code{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:6px}.zh-qr{width:150px;height:150px;background:#fff;border-radius:8px;padding:4px;box-sizing:border-box}.zh-qr svg{width:100%;height:100%}.zh-code>div:last-child{display:flex;flex-direction:column;gap:2px;min-width:0}.zh-code b{font-size:30px;letter-spacing:3px}.zh-warn{margin:6px 0;padding:10px 12px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;font-size:14px;color:#7c2d12}.zh-ph{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.zh-ph img{width:64px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--bd)}.zh-card{margin:12px 0;min-width:0;max-width:100%;box-sizing:border-box}`;
  document.head.appendChild(css);
})();
