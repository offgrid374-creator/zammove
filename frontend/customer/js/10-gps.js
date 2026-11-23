/**
 * 10-gps.js — live GPS tracking (loaded last).
 *
 * Driver:   shares the phone's location with the browser Geolocation API during active trip stages.
 *           Positions go to the server with ZAPI.act('gpsPing') about every 10 seconds (or after moving 30 m).
 * Customer: the Track page shows a live OpenStreetMap map (Leaflet) with pickup, drop-off, the driver's
 *           position and accuracy, the recent trail and a rough arrival estimate.
 * Admin:    "Live map" page with every active trip that is sharing its location.
 *
 * Browsers only allow location on https:// or http://localhost. The server decides who may send
 * and who may see a position (backend/src/domain/bookings.js gpsPing, backend/src/views.js).
 */
const ZGPS = (() => {
  const TRACK_ST = [
    'On the Way to Pickup',
    'Awaiting Down Payment',
    'Down Payment Confirmed',
    'Items Loaded',
    'In Transit',
    'Arrived at Destination',
  ];
  const SHARE_KEY = 'zm_gps_share'; // booking id this tab is sharing for (resumes after a reload)
  const SEND_MS = 10000; // send at most every 10 s ...
  const MOVE_M = 30; // ... unless the driver moved this many metres
  const ZC = [6.92, 122.08]; // Zamboanga City centre
  const st = {
    watch: null,
    bid: null,
    last: null,
    lastSent: 0,
    status: '',
    err: '',
    map: null,
    mapKey: '',
    layers: null,
    fitted: false,
  };

  const rad = Math.PI / 180;
  const distKm = (a, b) => {
    const x = (b[0] - a[0]) * rad,
      y = (b[1] - a[1]) * rad,
      h = Math.sin(x / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(y / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };
  const ago = t => {
    const s = Math.max(0, Math.round((Date.now() - new Date(t)) / 1000));
    return s < 60
      ? s + ' s ago'
      : s < 3600
        ? Math.round(s / 60) + ' min ago'
        : Math.round(s / 3600) + ' h ago';
  };
  const placeOf = text => (typeof coord == 'function' ? coord(text) : null); // coord() is defined in 02-upgrade.js
  const button = (action, label, id, outline) =>
    `<button class="btn ${outline ? 'o ' : ''}sm" data-a="${action}" data-id="${esc(id)}">${label}</button>`;
  const findBk = id => (S.bk || []).find(b => b.id == id);

  /* ---------------- driver: share the phone's location ---------------- */
  function showMsg(text, bad) {
    const e = document.getElementById('gps-msg');
    if (e) {
      e.textContent = text;
      e.className = 'vz-m ' + (bad ? 'bad' : 'good');
    }
  }
  async function send(pos) {
    const c = pos.coords,
      here = [c.latitude, c.longitude],
      t = Date.now();
    if (st.last && t - st.lastSent < SEND_MS && distKm(st.last, here) * 1000 < MOVE_M) return;
    st.last = here;
    st.lastSent = t;
    const r = await ZAPI.act('gpsPing', {
      id: st.bid,
      lat: c.latitude,
      lng: c.longitude,
      acc: c.accuracy,
      spd: c.speed,
      hdg: c.heading,
    });
    if (r.ok) {
      st.err = '';
      st.status =
        'Last sent ' + new Date().toLocaleTimeString() + ' · accuracy ±' + Math.round(c.accuracy) + ' m';
      showMsg(st.status);
    } else {
      st.err = r.err;
      showMsg(r.err, true);
      if (r.stop) stop(true);
    }
  }
  function start(bid) {
    if (!('geolocation' in navigator)) return showMsg('This browser cannot share location.', true);
    if (window.isSecureContext === false)
      return showMsg(
        'Location only works on https:// or localhost. Open ZamMove over HTTPS on your phone.',
        true
      );
    stop(true);
    st.bid = bid;
    st.last = null;
    st.lastSent = 0;
    st.err = '';
    st.status = 'Starting… allow location access if your browser asks.';
    try {
      sessionStorage.setItem(SHARE_KEY, bid);
    } catch (e) {}
    st.watch = navigator.geolocation.watchPosition(
      send,
      e => {
        st.err =
          e.code == 1
            ? 'Location permission was denied. Allow it in the browser settings, then tap Share again.'
            : e.code == 3
              ? 'Waiting for a GPS fix… move to an open area.'
              : 'Could not read your location.';
        showMsg(st.err, true);
        if (e.code == 1) stop(true);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    refreshDriverBox();
  }
  function stop(quiet) {
    if (st.watch != null && 'geolocation' in navigator) navigator.geolocation.clearWatch(st.watch);
    const bid = st.bid;
    st.watch = null;
    st.bid = null;
    try {
      sessionStorage.removeItem(SHARE_KEY);
    } catch (e) {}
    if (!quiet && bid) ZAPI.act('gpsStop', { id: bid });
    refreshDriverBox();
  }
  /* resume sharing after a page reload; stop when the trip is no longer active */
  function resume() {
    let saved = null;
    try {
      saved = sessionStorage.getItem(SHARE_KEY);
    } catch (e) {}
    const b = saved && findBk(saved);
    const active = b && S.me && b.drvUser == S.me.em && TRACK_ST.includes(b.st);
    if (st.watch == null && active) start(saved);
    else if (st.watch != null && st.bid && !(findBk(st.bid) && TRACK_ST.includes(findBk(st.bid).st)))
      stop(true);
  }
  function driverBox(b) {
    if (!TRACK_ST.includes(b.st)) return '';
    const on = st.watch != null && st.bid == b.id;
    return `<div class="vz-bc" id="gpsbox" data-bid="${esc(b.id)}"><b>Live location</b> <span class="tag ${on ? 'g' : ''}">${on ? 'Sharing' : 'Not sharing'}</span>
      <p class="mu" style="margin:6px 0">${
        on
          ? 'Keep this page open while driving. Your location is sent about every 10 seconds and only this customer and ZamMove staff can see it, during the trip only.'
          : 'Share your phone’s location so the customer can follow the trip on a live map.'
      }</p>${on ? button('gps-stop', 'Pause sharing', b.id, true) : button('gps-start', 'Share live location', b.id)}
      <div id="gps-msg" class="vz-m ${st.err ? 'bad' : 'good'}">${esc(on || st.err ? st.err || st.status : '')}</div></div>`;
  }
  function refreshDriverBox() {
    const e = document.getElementById('gpsbox');
    const b = e && findBk(e.dataset.bid);
    if (!b) return;
    const t = document.createElement('div');
    t.innerHTML = driverBox(b);
    e.replaceWith(t.firstElementChild || document.createTextNode(''));
  }

  /* ---------------- customer: live map on the Track page ---------------- */
  function infoText(b) {
    const g = b.gps;
    if (!g) return 'Waiting for the driver’s phone to share its location…';
    if (g.off)
      return 'The driver paused location sharing ' + ago(g.off) + '. Last known position ' + ago(g.t) + '.';
    const stale = Date.now() - g.ms > 120000;
    const toPickup = b.st == 'On the Way to Pickup',
      toDrop = b.st == 'In Transit',
      target = toPickup ? placeOf(b.pu) : toDrop ? placeOf(b.dr) : null;
    let eta = '';
    if (target) {
      const km = distKm([g.lat, g.lng], target) * 1.3,
        kmh = g.spd && g.spd > 2 ? Math.min(60, g.spd * 3.6) : 25;
      eta = ` · about ${km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km'}, ${Math.max(1, Math.round((km / kmh) * 60))} min to the ${toPickup ? 'pickup' : 'drop-off'}`;
    } else if (b.st == 'Arrived at Destination') eta = ' · the driver has arrived';
    else eta = ' · the driver is at the pickup';
    return `<span class="${stale ? 'vz-e' : ''}">${stale ? 'Last update' : 'Live · updated'} <b id="zmap-ago" data-t="${esc(g.t)}">${ago(g.t)}</b></span>
      · accuracy ±${esc(g.acc || '?')} m${eta}${stale ? ' · the driver’s phone may have lost signal' : ''}
      · <a href="https://www.google.com/maps?q=${g.lat},${g.lng}" target="_blank" rel="noopener">Open in Google Maps</a>`;
  }
  function trackBlock(b) {
    const panel = text =>
      `<div class="card" style="padding:16px"><b>Live map</b><p class="mu" style="margin:6px 0 0">${text}</p></div>`;
    if (!b.drvUser)
      return panel('The live map opens once a driver accepts your booking and heads to the pickup.');
    if (!TRACK_ST.includes(b.st))
      return panel(
        ['Delivery Confirmation', 'Awaiting Final Payment', 'Completed'].includes(b.st)
          ? 'The trip has ended, so live tracking is off.'
          : 'Live tracking starts when your driver heads to the pickup.'
      );
    return `<div><div id="zmap" class="zmap" data-mode="trip" data-bid="${esc(b.id)}"></div>
      <div id="zmap-info" class="mu" style="font-size:14px;margin:8px 4px">${infoText(b)}</div></div>`;
  }

  /* ---------------- admin: every active trip on one map ---------------- */
  const liveTrips = () => (S.bk || []).filter(b => b.gps && TRACK_ST.includes(b.st));
  function fleetList() {
    const l = liveTrips();
    if (!l.length) return '<p class="mu">No driver is sharing a live location right now.</p>';
    return `<div class="zw"><table class="zt"><tr><th>Booking</th><th>Driver</th><th>Status</th><th>Last update</th><th></th></tr>${l
      .map(
        b =>
          `<tr><td>${esc(b.id)}</td><td>${esc(b.drv || b.drvUser)}</td><td>${esc(b.st)}</td><td>${b.gps.off ? 'paused · ' : ''}${ago(b.gps.t)}</td><td><a href="https://www.google.com/maps?q=${b.gps.lat},${b.gps.lng}" target="_blank" rel="noopener">Google Maps</a></td></tr>`
      )
      .join('')}</table></div>`;
  }
  function fleetBlock() {
    return `<div id="zmap" class="zmap" data-mode="fleet" style="height:520px"></div><div id="zmap-info" style="margin-top:12px">${fleetList()}</div>`;
  }

  /* ---------------- map drawing (Leaflet + OpenStreetMap) ---------------- */
  function draw(refit) {
    const el = document.getElementById('zmap');
    if (!st.map || !el) return;
    st.layers.clearLayers();
    const pts = [];
    const dot = (ll, color, label, r = 7) => {
      L.circleMarker(ll, { radius: r, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 })
        .bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -8] })
        .addTo(st.layers);
      pts.push(ll);
    };
    if (el.dataset.mode == 'trip') {
      const b = findBk(el.dataset.bid);
      if (!b) return;
      const pu = placeOf(b.pu),
        dr = placeOf(b.dr);
      if (pu) dot(pu, '#111827', 'Pickup');
      if (dr) dot(dr, '#C2410C', 'Drop-off');
      if (b.trail && b.trail.length > 1)
        L.polyline(
          b.trail.map(p => [p[0], p[1]]),
          { color: '#0F766E', weight: 4, opacity: 0.6, dashArray: '6 6' }
        ).addTo(st.layers);
      if (b.gps) {
        const ll = [b.gps.lat, b.gps.lng];
        if (b.gps.acc)
          L.circle(ll, { radius: b.gps.acc, color: '#3FB8AF', weight: 1, fillOpacity: 0.12 }).addTo(
            st.layers
          );
        dot(
          ll,
          b.gps.off ? '#9AA3B4' : '#3FB8AF',
          (b.gps.off ? 'Driver (paused)' : 'Driver') + ' · ' + (b.drv || ''),
          9
        );
      }
      const info = document.getElementById('zmap-info');
      if (info) info.innerHTML = infoText(b);
    } else {
      liveTrips().forEach(b =>
        dot(
          [b.gps.lat, b.gps.lng],
          b.gps.off ? '#9AA3B4' : '#3FB8AF',
          `${b.id} · ${b.drv || ''} · ${b.st}`,
          8
        )
      );
      const info = document.getElementById('zmap-info');
      if (info) info.innerHTML = fleetList();
    }
    if (refit || !st.fitted) {
      if (pts.length > 1) st.map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
      else st.map.setView(pts[0] || ZC, pts.length ? 15 : 13);
      st.fitted = true;
    }
  }
  /* called after every render: (re)attach the map to the new #zmap element, keeping the user's zoom */
  function mount() {
    resume();
    const el = document.getElementById('zmap');
    if (!el) {
      if (st.map) st.map.remove();
      st.map = null;
      st.mapKey = '';
      return;
    }
    if (!window.L) {
      el.innerHTML =
        '<div class="note" style="margin:12px">The map could not load (no connection to the map service). The position details below still update.</div>';
      return;
    }
    const key = el.dataset.mode + ':' + (el.dataset.bid || '');
    let keep = null;
    if (st.map) {
      if (st.mapKey == key) keep = { center: st.map.getCenter(), zoom: st.map.getZoom() };
      st.map.remove();
    }
    st.map = L.map(el, { zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      referrerPolicy: 'strict-origin-when-cross-origin', // OSM tile policy needs a Referer
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(st.map);
    st.layers = L.layerGroup().addTo(st.map);
    st.mapKey = key;
    st.fitted = !!keep;
    if (keep) st.map.setView(keep.center, keep.zoom);
    draw(false);
  }
  /* new positions arrived without other changes: move the markers in place, no page re-render */
  function update() {
    draw(false);
  }

  /* clicks, and the "updated N s ago" ticker */
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest('[data-a="gps-start"],[data-a="gps-stop"]');
      if (!t || !S.me) return;
      e.preventDefault();
      e.stopPropagation();
      if (t.dataset.a == 'gps-start') start(t.dataset.id);
      else stop(false);
    },
    true
  );
  setInterval(() => {
    const e = document.getElementById('zmap-ago');
    if (e) e.textContent = ago(e.dataset.t);
  }, 1000);
  const css = document.createElement('style');
  css.textContent =
    '.zmap{height:380px;border-radius:16px;overflow:hidden;border:1px solid var(--bd);background:var(--s2);z-index:0}.zmap .leaflet-tooltip{font:600 12px var(--text);padding:2px 8px}';
  document.head.appendChild(css);

  return { TRACK_ST, driverBox, trackBlock, fleetBlock, mount, update, start, stop };
})();

window.ZGPS = ZGPS; // const does not create a window property; other files check window.ZGPS

/* Track page: replace the old illustrative map with the live map */
const _trackGps = track;
track = function () {
  const html = _trackGps();
  const act = S.bk
    .filter(x => !['Cancelled', 'Rejected'].includes(x.st))
    .reverse()
    .sort((a, c) => (a.st == 'Completed') - (c.st == 'Completed'));
  const b = act.find(x => x.id == msg.tid) || act[0];
  if (!b) return html;
  return html.replace(
    /<div class='mp'><svg[\s\S]*?Real tracking needs a driver app sending GPS, a backend and a map service\.<\/div>/,
    ZGPS.trackBlock(b)
  );
};
/* after every render, attach the map and resume location sharing */
const _renderGps = render;
render = function () {
  _renderGps();
  try {
    ZGPS.mount();
  } catch (e) {
    console.error('[zammove] map', e);
  }
};
render();
