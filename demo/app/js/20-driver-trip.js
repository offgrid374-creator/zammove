/**
 * 20-driver-trip.js — driver "Active trip" page from Figma (C02–C22 driver side, C08c, C12c, C18, C18c).
 *
 *   Header "Active trip · REF" with a status pill, a dark "Next step" banner holding the one button
 *   to press, a slim live-location line, then two columns: the work for this step (payment form,
 *   cargo note, Start/Delivery PIN panel) and "Trip progress" on the left; the customer card, the
 *   amount to collect and the trip tools (report a problem / the customer) on the right.
 *
 *   C08c  Waiting at pickup: a timer from arrival and a "Customer not here?" card; after 15 minutes
 *         "Report no-show" opens the existing report-the-customer form (an admin reviews it).
 *   C12c  Wrong Start PIN: the PIN panel from 08-verification moves to the top of the left column.
 *   C18c  GPS lost: a red bar at the top and a red location line when sharing stopped sending.
 *
 * The page itself is still built by 09-workspaces (stepUI), 10-gps, 16-ops and 17-improve. This file
 * moves those same elements into the new layout after render, so every button keeps its handler.
 */
(() => {
  const NOSHOW_MIN = 15;
  const hm = t => (t ? new Date(t).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
  const place = s => esc(String(s || '').split(',')[0]);
  const first = n => esc(String(n || 'the customer').split(' ')[0]);
  const evAt = (b, sts) => ((b.ev || []).find(x => sts.includes(x.to)) || {}).t || '';
  const lastEv = b => (b.ev || [])[(b.ev || []).length - 1] || {};
  const custOf = b => S.users.find(u => u.em == b.cu) || {};
  const paid = (b, k) => ZPAY.sum(b.id, k);
  const sub = (b, k) => S.pay.find(p => p.bid == b.id && p.kind == k && p.method == 'GCash' && p.status == 'Submitted');
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const osm = addr => {
    const c = typeof coord == 'function' ? coord(addr) : null;
    return c
      ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${c[0]}%2C${c[1]}`
      : `https://www.openstreetmap.org/search?query=${encodeURIComponent(addr || '')}`;
  };
  const waitSecs = b => {
    const t = evAt(b, ['Awaiting Down Payment']);
    return t ? (Date.now() - new Date(t)) / 1000 : 0;
  };
  const noShowCase = b => b.st == 'Awaiting Down Payment' && !sub(b, 'down') && !paid(b, 'down');

  /* pill + banner per status: [pill, tone, title, subtitle, navigate-to] */
  const NEXT = b => {
    const c = custOf(b),
      cn = first(c.name),
      due = k => peso(ZPAY.r2(ZPAY.due(b, k) - paid(b, k)));
    switch (b.st) {
      case 'Accepted':
        return ['Accepted', 'ok', `Head to ${place(b.pu)} when you’re ready`, `<b>${esc(b.pu)}</b> · pickup ${esc(b.dt || '')} ${esc(b.tm || '')}`, b.pu];
      case 'On the Way to Pickup':
        return ['Heading to pickup', 'ok', `Drive to ${place(b.pu)} and pick up`, `<b>${esc(b.pu)}</b> · ${cn} gets a notice when you arrive`, b.pu];
      case 'Awaiting Down Payment': {
        const s = sub(b, 'down');
        if (s) return ['Check GCash payment', 'wait', `Check ${cn}’s GCash payment, then record it`, `${peso(s.amount)} · reference <b>${esc(s.ref)}</b>. The form below is filled in for you.`, ''];
        const w = waitSecs(b);
        if (w > 120)
          return ['Waiting at pickup', 'warn', `${cn} isn’t at the pickup yet?`, `You arrived at ${hm(evAt(b, ['Awaiting Down Payment']))} · waiting <span id="ztd-wait">${mmss(w)}</span> of ${NOSHOW_MIN}:00`, ''];
        return ['Collect down payment', 'wait', `Collect the ${due('down')} down payment`, `${cn} pays half before loading · GCash or cash`, ''];
      }
      case 'Down Payment Confirmed':
        return ['Loading', 'ok', 'Load the cargo', `Down payment received. Describe what you loaded, then tap <b>Cargo loaded</b>.`, ''];
      case 'Items Loaded':
        return ['Loading', 'wait', `Enter ${cn}’s Start PIN to begin the trip`, `Items loaded at ${hm(evAt(b, ['Items Loaded']))} · check the plate and cargo, then authorize departure`, ''];
      case 'In Transit':
        return ['In transit', 'ok', `Drive to ${place(b.dr)} and deliver`, `<b>${esc(b.dr)}</b>`, b.dr];
      case 'Arrived at Destination':
        return ['Get Delivery PIN', 'wait', `Ask ${cn} for the Delivery PIN`, 'Unload and check the items together first. The trip completes only with the right PIN.', ''];
      case 'Delivery Confirmation':
        return ['Delivered', 'ok', 'Request the final payment', `Delivery confirmed. ${cn} pays the balance next.`, ''];
      case 'Awaiting Final Payment': {
        const s = sub(b, 'final');
        return s
          ? ['Check GCash payment', 'wait', `Check ${cn}’s GCash payment, then record it`, `${peso(s.amount)} · reference <b>${esc(s.ref)}</b>`, '']
          : ['Collect balance', 'wait', `Collect the ${due('final')} balance`, 'GCash or cash. The trip completes when you record it.', ''];
      }
      case 'Interrupted':
        return ['Trip stopped', 'bad', 'The trip was stopped', esc((b.int || {}).why || 'An administrator decides the next step.'), ''];
    }
    return [b.st, 'wait', esc(b.st), '', ''];
  };

  /* driver wording for the timeline */
  const ROWS = [
    ['Requested', ['Pending'], b => `${first(custOf(b).name)} booked ${/^[aeiou]/i.test(b.vn) ? 'an' : 'a'} ${esc(b.vn)} for ${esc(b.tm || '')}`],
    ['Accepted', ['Accepted'], () => 'You accepted the booking'],
    ['On the way to pickup', ['On the Way to Pickup'], b => `You left for ${place(b.pu)}`],
    ['Arrived at pickup', ['Awaiting Down Payment'], () => 'You arrived at the pickup address'],
    [
      'Down payment confirmed',
      ['Down Payment Confirmed'],
      b => {
        const p = S.pay.filter(x => x.bid == b.id && x.kind == 'down' && ZPAY.counted(x)).pop();
        return p ? `${peso(paid(b, 'down'))} by ${p.method == 'Cash' ? 'cash' : 'GCash'}, confirmed by you` : 'Confirmed by you';
      },
    ],
    ['Loaded and checked', ['Items Loaded'], () => 'Start PIN, plate and cargo checklist passed'],
    ['In transit', ['In Transit'], b => `On the way to ${place(b.dr)}`],
    ['Delivered', ['Arrived at Destination', 'Delivery Confirmation'], b => `Confirmed with ${first(custOf(b).name)}’s Delivery PIN`],
    ['Completed', ['Awaiting Final Payment', 'Completed'], () => 'Balance collected'],
  ];
  const IX = {
    Accepted: 1,
    'On the Way to Pickup': 2,
    'Awaiting Down Payment': 3,
    'Down Payment Confirmed': 4,
    'Items Loaded': 5,
    'In Transit': 6,
    'Arrived at Destination': 7,
    'Delivery Confirmation': 7,
    'Awaiting Final Payment': 8,
  };
  const HINT = {
    Accepted: () => ['Tap “Heading to pickup” when you leave.', 0],
    'On the Way to Pickup': () => ['Now · you are driving', 1],
    'Awaiting Down Payment': b => [`Collect the down payment from ${first(custOf(b).name)}`, 1],
    'Down Payment Confirmed': () => ['Load the cargo and describe it', 1],
    'Items Loaded': b => [`Ask ${first(custOf(b).name)} for the Start PIN`, 1],
    'In Transit': b => [`On the way to ${place(b.dr)}`, 1, 'Now · you are driving'],
    'Arrived at Destination': b => [`Ask ${first(custOf(b).name)} for the Delivery PIN after unloading`, 1],
    'Delivery Confirmation': () => ['Request the final payment', 1],
    'Awaiting Final Payment': b => [`Collect the ${peso(ZPAY.due(b, 'final'))} balance`, 1],
  };
  const timeline = b => {
    const cur = IX[b.st] ?? 0,
      [hint, , badge] = (HINT[b.st] || (() => ['', 0]))(b),
      upd = lastEv(b).t;
    return `<section class="zt-card zt-tl"><div class="zt-h"><h2>Trip progress</h2>${upd ? `<span class="n">Updated ${hm(upd)}</span>` : ''}</div><ol>${ROWS.map((r, i) => {
      const t = evAt(b, r[1]),
        st = i < cur ? 'done' : i == cur ? 'now' : 'todo';
      const todoHint = i == 7 ? `Ask ${first(custOf(b).name)} for the Delivery PIN after unloading` : i == 8 ? `Collect the ${peso(ZPAY.due(b, 'final'))} balance` : '—';
      return `<li class="${st}"${st == 'now' ? ' aria-current="step"' : ''}><span class="zt-t n">${t && st != 'todo' ? hm(t) : '—'}</span><i aria-hidden="true"></i><div><b>${r[0]}</b><span>${st == 'now' ? hint : st == 'done' ? r[2](b) : todoHint}</span>${st == 'now' && badge ? `<em class="go">${badge}</em>` : st == 'now' ? '<em>Your turn</em>' : ''}</div></li>`;
    }).join('')}</ol></section>`;
  };

  const custCard = b => {
    const c = custOf(b),
      ph = b.rph && ['In Transit', 'Arrived at Destination'].includes(b.st) ? '' : c.ph;
    return `<section class="zt-card ztd-cust"><div class="ztd-ch"><div><h2>${esc(c.name || b.cu)}</h2>${c.ph ? `<b class="n">${esc(c.ph)}</b>` : ''}</div>${ph ? `<a class="zb-btn pri" href="tel:${esc(ph)}">Call customer</a>` : ''}</div><dl><div><dt>Pickup</dt><dd>${esc(b.pu)}</dd></div><div><dt>Drop-off</dt><dd><b>${esc(b.dr)}</b></dd></div><div><dt>Items</dt><dd>${esc(b.it || '—')}</dd></div><div><dt>Helpers</dt><dd>${b.mv ? b.mv + ' helper' + (b.mv > 1 ? 's' : '') + ' riding along' : 'None'}</dd></div>${b.rn ? `<div><dt>Receiver</dt><dd>${esc(b.rn)} · ${esc(b.rph || '')} <small>(has the Delivery PIN)</small></dd></div>` : ''}</dl>${b.si ? `<p class="ztd-note"><b>Customer note:</b> ${esc(b.si)}</p>` : ''}</section>`;
  };
  const collectCard = b => {
    const downLeft = ZPAY.r2(ZPAY.due(b, 'down') - paid(b, 'down')),
      k = downLeft > 0 ? 'down' : 'final',
      amt = ZPAY.r2(ZPAY.due(b, k) - paid(b, k));
    if (amt <= 0) return '';
    return `<section class="zt-card ztd-col"><span>${k == 'down' ? 'Collect before loading' : 'Collect after delivery'}</span><b class="n">${peso(amt)}</b><p>${k == 'down' ? 'Half of the fare, by GCash or cash. Loading starts after you record it.' : 'GCash or cash. Ask for the customer’s Delivery PIN first; the trip completes only with the right PIN.'}</p></section>`;
  };
  const noShowCard = b => {
    const w = waitSecs(b),
      ready = w >= NOSHOW_MIN * 60,
      cn = first(custOf(b).name);
    return `<section class="zt-card ztd-ns"><h2>If the customer doesn’t come out</h2><ol><li>Call ${cn} from this screen.</li><li>Wait at the pickup address until the ${NOSHOW_MIN}-minute timer ends.</li><li>Mark the no-show. The booking closes and the customer owes a 10% fee, which goes to you. The customer can dispute it, and ZamMove reviews disputes.</li></ol><button class="zb-btn ${ready ? 'dng' : 'sec'}" data-a="ztd-noshow" data-id="${esc(b.id)}" id="ztd-nsb"${ready ? '' : ' disabled'}>${ready ? 'Mark as no-show' : `Mark as no-show (after ${NOSHOW_MIN}:00)`}</button></section>`;
  };

  const layoutTrip = () => {
    const app = $('#app');
    const cards = app ? [...app.querySelectorAll(':scope > .card.zc')] : [];
    if (!cards.length || app.querySelector('.ztd')) return;
    const h1 = app.querySelector(':scope > h1');
    const tools = app.querySelector('.z7-box');
    cards.forEach((card, n) => {
      const id = ((card.querySelector('h2') || {}).textContent || '').split('·')[0].trim(),
        b = S.bk.find(x => x.id == id);
      if (!b) return;
      const [pt, tone, title, subt, nav] = NEXT(b),
        c = custOf(b);
      const wrap = document.createElement('div');
      wrap.className = 'ztd';
      wrap.innerHTML = `<div class="ztd-head"><div class="zb-ref"><${n ? 'h2' : 'h1'}>Active trip · ${esc(b.id)}</${n ? 'h2' : 'h1'}><span class="zb-pill ${tone == 'ok' ? 'ok' : tone == 'bad' ? 'bad' : 'wait'}">${esc(pt)}</span></div></div><div class="ztd-next t-${tone}"><div><span>${tone == 'warn' ? 'Waiting at pickup' : 'Next step'}</span><h2>${title}</h2>${subt ? `<p>${subt}</p>` : ''}</div><div class="ztd-go"></div></div><div class="ztd-loc"></div><div class="zt-grid"><div class="zt-l"></div><div class="zt-r"></div></div>`;
      const go = wrap.querySelector('.ztd-go'),
        L = wrap.querySelector('.zt-l'),
        R = wrap.querySelector('.zt-r'),
        loc = wrap.querySelector('.ztd-loc');
      /* the one status button from stepUI goes into the banner */
      const stBtn = card.querySelector(':scope > button[data-a="w-st"]');
      if (stBtn) {
        stBtn.className = 'zb-btn ztd-cta';
        if (b.st == 'In Transit') stBtn.textContent = 'I’ve arrived at drop-off';
        go.appendChild(stBtn);
      } else if (tone == 'warn' && c.ph) go.insertAdjacentHTML('beforeend', `<a class="zb-btn ztd-cta amber" href="tel:${esc(c.ph)}">Call ${first(c.name)}</a>`);
      if (nav) go.insertAdjacentHTML('beforeend', `<a class="ztd-osm" href="${osm(nav)}" target="_blank" rel="noopener">Navigate in OpenStreetMap ↗</a>`);
      /* live location: a slim line, red when sharing stopped sending (C18c) */
      const gpsBox = card.querySelector('#gpsbox');
      if (gpsBox) {
        const st = (() => {
          const on = /Sharing/.test((gpsBox.querySelector('.tag') || {}).textContent || ''),
            err = ((gpsBox.querySelector('#gps-msg.bad') || {}).textContent || '').trim(),
            t = b.gps && b.gps.t,
            stale = on && t && Date.now() - new Date(t) > 90000;
          return { on, err, t, lost: !!(err || stale) };
        })();
        loc.classList.toggle('bad', st.lost);
        loc.classList.toggle('on', st.on && !st.lost);
        loc.innerHTML = `<i aria-hidden="true"></i><span>${st.lost ? `<b>Not sharing</b>${st.t ? ' · last sent ' + new Date(st.t).toLocaleTimeString('en-PH', { hour12: false }) : ''}` : st.on ? `<b>Sharing your location</b> with ${esc(c.name || 'the customer')} until delivery${st.t ? ' · last sent ' + new Date(st.t).toLocaleTimeString('en-PH', { hour12: false }) : ''}` : `<b>Location not shared</b> · ${first(c.name)} can’t follow the trip on the map`}</span>`;
        loc.appendChild(gpsBox);
        if (st.lost && !n)
          wrap.insertAdjacentHTML('afterbegin', `<div class="ztd-lost" role="alert"><span><b>Your location stopped sending${st.t ? ' at ' + hm(st.t) : ''}.</b> Turn on GPS and keep ZamMove open. ${first(c.name)} now sees “last seen” on the map.</span><button class="ztd-retry" data-a="gps-start" data-id="${esc(b.id)}">Retry</button></div>`);
      } else loc.remove();
      /* work for this step (payment form, cargo note, PIN panel): top of the left column */
      const skip = new Set(['H2', 'P']);
      const work = [...card.children].filter(
        el => !(skip.has(el.tagName) && (el === card.querySelector(':scope > h2') || el === card.querySelector(':scope > p.mu') || el.querySelector('a[href*="waze.com"]'))) && !el.classList.contains('zo-route') && el.id != 'fx-wz'
      );
      if (work.length) {
        const sec = document.createElement('section');
        sec.className = 'zt-card ztd-work';
        work.forEach(el => sec.appendChild(el));
        L.appendChild(sec);
      }
      if (noShowCase(b) && waitSecs(b) > 120) L.insertAdjacentHTML('beforeend', noShowCard(b));
      else L.insertAdjacentHTML('beforeend', timeline(b));
      /* road route map from 16-ops: full width under the next step, so the driver sees where to go first */
      const route = card.querySelector('.zo-route');
      if (route) {
        route.classList.add('zt-card', 'ztd-map');
        route.querySelectorAll('a[href*="waze.com"]').forEach(a => a.remove()); // OpenStreetMap / Google only
        const t = route.querySelector('b');
        const toPickup = ['Accepted', 'On the Way to Pickup', 'Awaiting Down Payment', 'Down Payment Confirmed', 'Items Loaded'].includes(b.st);
        if (t && /Best route/.test(t.textContent)) t.textContent = toPickup ? 'Route to the pickup' : 'Route to the drop-off';
        (wrap.querySelector('.ztd-loc') || wrap.querySelector('.ztd-next')).insertAdjacentElement('afterend', route); // the location line is absent until sharing starts
      }
      R.insertAdjacentHTML('beforeend', custCard(b) + collectCard(b));
      if (tools && !n) {
        tools.classList.add('ztd-tools');
        R.appendChild(tools);
      }
      card.replaceWith(wrap);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
      setTimeout(() => window.dispatchEvent(new Event('zm-refit')), 120); // zoom the route map to the route at its new size
    });
    if (h1 && app.querySelector('.ztd h1')) h1.remove();
  };

  /* live waiting timer (C08c) */
  setInterval(() => {
    const w = document.getElementById('ztd-wait');
    if (!w) return;
    const b = S.bk.find(x => x.id == (document.querySelector('[data-a="ztd-noshow"]') || {}).dataset?.id);
    if (!b) return;
    const s = waitSecs(b);
    w.textContent = mmss(s);
    const btn = document.getElementById('ztd-nsb');
    if (btn && btn.disabled && s >= NOSHOW_MIN * 60) render();
  }, 1000);

  window.addEventListener(
    'click',
    e => {
      const t = e.target.closest('[data-a="ztd-noshow"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const id = t.dataset.id,
        b = S.bk.find(x => x.id == id);
      if (!b) return;
      const fee = Math.round((+b.tot || 0) * 10) / 100;
      if (!confirm(`Mark ${id} as a no-show?\n\nThe booking closes and the customer owes a ${peso(fee)} no-show fee, which goes to you. Only do this if you waited at the right address and called.`)) return;
      t.disabled = true;
      ZAPI.act('noShow', { id }).then(r => {
        t.disabled = false;
        if (!r.ok) return toast(r.err);
        toast(`Closed as a no-show. ${peso(r.fee)} fee is due to you.`);
        render();
      });
    },
    true
  );

  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    try {
      if (S.me && S.ws == 'driver' && (S.wp || {}).driver == 'trip') layoutTrip();
    } catch (e) {
      console.error('[zammove] driver trip layout', e);
    }
    return out;
  };
  render();
})();
