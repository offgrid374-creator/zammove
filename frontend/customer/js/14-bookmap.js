/**
 * 14-bookmap.js — the booking map on OpenStreetMap (loaded last).
 *
 * - Replaces the schematic picture on Book a haul with a real Leaflet + OpenStreetMap map.
 * - Click the map to set the pickup, then the drop-off; drag either pin to adjust. The address is filled in
 *   from OpenStreetMap (reverse lookup), with the exact coordinates in brackets.
 * - The road route, distance and driving time come from OSRM (OpenStreetMap routing). The server prices
 *   the booking from the same road distance (backend/src/app.js → geo.js); if routing is unavailable,
 *   both fall back to the straight-line estimate × 1.3.
 * - Every address box with suggestions also searches OpenStreetMap (Nominatim) after the built-in places.
 * Requests go through our server (/api/geo/*), which identifies the app, caches and respects the services' limits.
 */
(() => {
  const ZC = [6.9214, 122.079]; // Zamboanga City
  const API = window.ZM_API_BASE || '/api';
  const st = {
    map: null,
    el: null,
    layers: null,
    next: 'pu',
    rkey: '',
    route: null,
    routing: false,
    fit: '',
    msg: '',
  };
  const fx = n => (+n).toFixed(5);
  const keyOf = (a, b) => (a && b ? fx(a[0]) + ',' + fx(a[1]) + '|' + fx(b[0]) + ',' + fx(b[1]) : '');
  const get = async path => {
    const r = await fetch(API + path, { headers: { Accept: 'application/json' } });
    return r.json();
  };

  /* road kilometres for the current pair, used by the price estimate (02-upgrade.js autoKm) */
  window.ZMAP = {
    km: (a, b) => (st.route && keyOf(a, b) == st.rkey ? Math.max(1, Math.round(st.route.km * 10) / 10) : 0), // charged per 0.1 km
    resize: () => st.map && st.map.invalidateSize(),
    route: () => st.route,
  };

  /* ---------------- the map ---------------- */
  const pinIcon = (letter, cls) =>
    L.divIcon({
      className: 'zbm-pin ' + cls,
      html: `<span><b>${letter}</b></span>`,
      iconSize: [34, 42],
      iconAnchor: [17, 40],
    });
  function ensure() {
    const el = document.getElementById('bmap');
    if (!el) {
      if (st.map) st.map.remove();
      st.map = st.el = null;
      return null;
    }
    if (!window.L) {
      el.innerHTML =
        '<div class="note" style="margin:12px">The map could not load (no connection to OpenStreetMap). You can still choose places from the suggestions.</div>';
      return null;
    }
    if (st.map && st.el === el) return st.map;
    if (st.map) {
      st.map.off();
      st.map.remove();
    }
    el.innerHTML = '';
    el.classList.add('zbm');
    /* no zoom/fade animations: the page redraws often, and an animation on a replaced map throws */
    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView(ZC, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      referrerPolicy: 'strict-origin-when-cross-origin', // OSM tile policy needs a Referer
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routing <a href="https://project-osrm.org">OSRM</a>',
    }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    st.layers = L.layerGroup().addTo(map);
    st.map = map;
    st.el = el;
    st.fit = '';
    /* controls on top of the map */
    const ui = document.createElement('div');
    ui.className = 'zbm-ui';
    el.appendChild(ui);
    const info = document.createElement('div');
    info.className = 'zbm-info';
    info.id = 'zbm-info';
    el.appendChild(info);
    L.DomEvent.disableClickPropagation(ui);
    L.DomEvent.disableClickPropagation(info);
    ui.addEventListener('click', e => {
      const b = e.target.closest('[data-zbm]');
      if (!b) return;
      if (b.dataset.zbm == 'fit') return fitAll(true);
      st.next = b.dataset.zbm;
      paintUI();
    });
    map.on('click', e => setPoint(st.next, e.latlng.lat, e.latlng.lng));
    setTimeout(() => st.map === map && map.invalidateSize(), 50); // skip if the page already replaced this map
    return map;
  }
  const paintUI = () => {
    const ui = st.el && st.el.querySelector('.zbm-ui');
    if (!ui) return;
    ui.innerHTML = `<div class="zbm-seg" role="group" aria-label="Tap the map to set"><span>Tap map to set</span><button type="button" data-zbm="pu" aria-pressed="${st.next == 'pu'}"><i class="a"></i>Pickup</button><button type="button" data-zbm="dr" aria-pressed="${st.next == 'dr'}"><i class="b"></i>Drop-off</button></div><button type="button" class="zbm-fit" data-zbm="fit" title="Show the whole route" aria-label="Show the whole route">⤢</button>`;
  };
  function fitAll(force) {
    if (!st.map) return;
    const A = coord(val('pu')),
      B = coord(val('dr')),
      k = keyOf(A, B) || (A ? 'a' + A : B ? 'b' + B : '');
    if (!force && k == st.fit) return;
    st.fit = k;
    const pts = st.route && keyOf(A, B) == st.rkey ? st.route.line : [A, B].filter(Boolean);
    if (pts.length > 1) st.map.fitBounds(pts, { padding: [48, 48], maxZoom: 16 });
    else if (pts.length) st.map.setView(pts[0], 15);
    else st.map.setView(ZC, 13);
  }

  /* set pickup or drop-off from a map point, then fill in the address from OpenStreetMap */
  async function setPoint(which, lat, lng) {
    if (!zcBox(lat, lng)) {
      st.msg = 'That point is outside the Zamboanga City service area.';
      return draw();
    }
    const f = document.getElementById(which);
    if (!f) return;
    const pinned = `Pinned location (${fx(lat)}, ${fx(lng)})`;
    f.value = pinned;
    st.msg = '';
    const other = which == 'pu' ? 'dr' : 'pu';
    if (!coord(val(other))) st.next = other;
    refresh();
    try {
      const r = await get(`/geo/reverse?lat=${fx(lat)}&lng=${fx(lng)}`);
      if (r.ok && r.place && f.value == pinned) {
        f.value = r.place.place;
        refresh();
      }
    } catch (e) {}
  }
  /* price box, distance tiles and map all follow the two address boxes */
  const refresh = () => {
    if (typeof autoKm == 'function') autoKm();
    draw();
  };

  /* fetch the road route for the current pair (once per pair) */
  async function routeFor(A, B) {
    const k = keyOf(A, B);
    if (!k || k == st.rkey) return;
    st.rkey = k;
    st.route = null;
    st.routing = true;
    draw();
    try {
      const r = await get(`/geo/route?a=${fx(A[0])},${fx(A[1])}&b=${fx(B[0])},${fx(B[1])}`);
      if (st.rkey == k) st.route = r.ok ? r.route : null;
    } catch (e) {
      if (st.rkey == k) st.route = null;
    }
    if (st.rkey == k) {
      st.routing = false;
      st.fit = '';
      if (typeof autoKm == 'function') autoKm(); // re-prices with the road distance
      draw();
    }
  }

  function draw() {
    const map = ensure();
    if (!map) return;
    const A = coord(val('pu')),
      B = coord(val('dr')),
      k = keyOf(A, B);
    /* a tap on the map fills whichever point is still missing */
    if (st.next == 'pu' && A && !B) st.next = 'dr';
    else if (st.next == 'dr' && B && !A) st.next = 'pu';
    paintUI();
    if (k && k != st.rkey) routeFor(A, B);
    if (!k) {
      st.rkey = '';
      st.route = null;
    }
    st.layers.clearLayers();
    const road = st.route && k == st.rkey ? st.route : null;
    if (road) {
      L.polyline(road.line, { color: '#ffffff', weight: 9, opacity: 0.9 }).addTo(st.layers);
      L.polyline(road.line, { color: '#0f5c53', weight: 5, opacity: 0.95 }).addTo(st.layers);
    } else if (A && B) {
      L.polyline([A, B], { color: '#0f5c53', weight: 3, opacity: 0.7, dashArray: '6 8' }).addTo(st.layers);
    }
    const drag = which => ev => {
      const p = ev.target.getLatLng();
      setPoint(which, p.lat, p.lng);
    };
    if (A)
      L.marker(A, { icon: pinIcon('A', 'a'), draggable: true, title: 'Pickup (drag to adjust)' })
        .on('dragend', drag('pu'))
        .addTo(st.layers);
    if (B)
      L.marker(B, { icon: pinIcon('B', 'b'), draggable: true, title: 'Drop-off (drag to adjust)' })
        .on('dragend', drag('dr'))
        .addTo(st.layers);
    fitAll(false);
    /* summary on the map */
    const info = document.getElementById('zbm-info');
    if (!info) return;
    const e = typeof est == 'function' ? est() : { km: 0, tot: 0 };
    info.innerHTML = st.msg
      ? `<p class="zbm-warn">${esc(st.msg)}</p>`
      : !(A && B)
        ? `<p>${!A ? 'Set the <b>pickup</b>: search above, use your location, or tap the map.' : 'Now set the <b>drop-off</b>: search above or tap the map.'}</p>`
        : `<div class="zbm-stats"><div><b>${road ? road.km.toFixed(1) : e.km}</b><span>km ${road ? 'by road' : 'estimated'}</span></div><div><b>${road ? road.min : '—'}</b><span>min drive</span></div><div><b>${m0(e.tot)}</b><span>estimated total</span></div></div><p class="zbm-src">${st.routing ? 'Finding the road route…' : road ? 'Road route from OpenStreetMap. The fare is charged per 0.1 km of road.' : 'Road routing is unavailable, so a straight-line estimate × 1.3 is used.'}</p>`;
  }
  window.mapUpd = draw;

  /* ---------------- address boxes: OpenStreetMap search after the built-in places ---------------- */
  let tmr = null;
  document.addEventListener('input', e => {
    const f = e.target;
    if (f.dataset.a != 'ac') return;
    clearTimeout(tmr);
    const q = f.value.trim();
    if (q.length < 3 || /\(-?\d+\.\d+, -?\d+\.\d+\)$/.test(q)) return;
    tmr = setTimeout(async () => {
      const box = document.getElementById('s-' + f.id);
      if (!box || f.value.trim() != q) return;
      box.querySelectorAll('.zbm-osm').forEach(x => x.remove());
      const wait = document.createElement('div');
      wait.className = 'zbm-osm mu';
      wait.textContent = 'Searching OpenStreetMap…';
      box.appendChild(wait);
      box.hidden = false;
      let r = null;
      try {
        r = await get('/geo/search?q=' + encodeURIComponent(q));
      } catch (err) {}
      if (f.value.trim() != q) return;
      box.querySelectorAll('.zbm-osm').forEach(x => x.remove());
      const res = (r && r.ok && r.results) || [];
      if (!res.length && r && r.ok) return;
      /* drop the "no match" line from the built-in list when OpenStreetMap found something */
      if (res.length)
        [...box.children].forEach(x => x.classList.contains('mu') && !x.dataset.a && x.remove());
      const head = document.createElement('div');
      head.className = 'zbm-osm zbm-head';
      head.textContent =
        r && r.ok ? 'Addresses from OpenStreetMap' : 'OpenStreetMap search is unavailable right now';
      box.appendChild(head);
      /* skip places the built-in list above already shows */
      const shown = new Set(
        [...box.querySelectorAll('[data-a="sg"]:not(.zbm-osm)')].map(x =>
          x.dataset.v.split(',')[0].trim().toLowerCase()
        )
      );
      res.forEach(x => {
        if (shown.has(x.name.split(',')[0].trim().toLowerCase())) return;
        const d = document.createElement('div');
        d.className = 'zbm-osm';
        d.dataset.a = 'sg';
        d.dataset.f = f.id;
        d.dataset.v = x.place;
        d.innerHTML = `${esc(x.name)}${x.kind ? ` <small>${esc(x.kind.replace(/_/g, ' '))}</small>` : ''}`;
        box.appendChild(d);
      });
      if (r && r.ok && !box.querySelector('.zbm-osm[data-a="sg"]')) head.remove(); // everything was already listed
      box.hidden = false;
    }, 450);
  });
  /* choosing a suggestion: redraw at once (the booking page also polls the boxes) */
  document.addEventListener('click', e => {
    if (e.target.closest('[data-a="sg"]')) setTimeout(refresh, 0);
  });

  /* ---------------- styles ---------------- */
  const css = document.createElement('style');
  css.textContent = `
.mapbox.zbm{height:460px;z-index:0}
/* app.css stretches every svg in .mapbox (from the old schematic map): give Leaflet's own svgs their real size */
.mapbox.zbm svg{width:auto;height:auto;max-width:none;display:inline}
.mapbox.zbm .leaflet-overlay-pane svg{display:block}
@media (max-width:720px){.mapbox.zbm{height:340px}}
.zbm .leaflet-control-attribution{font-size:10px}
@media (max-width:520px){.zbm-seg>span{display:none}.zbm-seg button{padding:7px 9px}}
.zbm-ui{position:absolute;top:10px;left:56px;right:10px;z-index:500;display:flex;gap:8px;justify-content:space-between;align-items:flex-start;pointer-events:none}
.zbm-ui>*{pointer-events:auto}
.zbm-seg{display:inline-flex;align-items:center;gap:4px;background:#fff;border-radius:12px;padding:4px;box-shadow:0 2px 10px rgba(15,23,42,.15);font:600 12px var(--text)}
.zbm-seg span{color:#64748b;padding:0 6px}
.zbm-seg button{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;border-radius:9px;padding:7px 10px;font:600 13px var(--text);color:#334155;cursor:pointer}
.zbm-seg button[aria-pressed=true]{background:#0f5c53;color:#fff}
.zbm-seg i{width:10px;height:10px;border-radius:50%;display:inline-block}.zbm-seg i.a{background:#111827}.zbm-seg i.b{background:#ea580c}
.zbm-seg button[aria-pressed=true] i{box-shadow:0 0 0 2px #fff}
.zbm-fit{border:0;background:#fff;border-radius:10px;width:36px;height:36px;font-size:18px;cursor:pointer;box-shadow:0 2px 10px rgba(15,23,42,.15);color:#0f172a}
.zbm-info{position:absolute;left:10px;right:10px;bottom:22px;z-index:500;background:rgba(6,37,35,.92);color:#fff;border-radius:14px;padding:12px 14px;font:14px/1.45 var(--text);backdrop-filter:blur(6px)}
.zbm-info p{margin:0}.zbm-info b{color:#fff}
.zbm-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.zbm-stats div{display:flex;flex-direction:column}
.zbm-stats b{font:700 22px/1.1 var(--display)}
.zbm-stats span{font-size:12px;color:#a7ddd3}
.zbm-src{margin-top:6px!important;font-size:12px;color:#a7ddd3}
.zbm-warn{color:#fecaca}
.zbm-pin{background:none;border:0}
.zbm-pin span{display:grid;place-items:center;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);color:#fff;font:800 14px var(--text);box-shadow:0 3px 8px rgba(0,0,0,.35);border:3px solid #fff}
.zbm-pin b{transform:rotate(45deg);color:#fff;font:800 14px var(--text)}
.zbm-pin.a span{background:#111827}.zbm-pin.b span{background:#ea580c}
.sug .zbm-head{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;padding:8px 12px 4px;cursor:default;border-top:1px solid var(--bd)}
.sug .zbm-osm small{color:#94a3b8;font-size:11px;margin-left:4px}
`;
  document.head.appendChild(css);
  const _render = render;
  render = function () {
    _render();
    try {
      draw();
    } catch (e) {
      console.error('[zammove] booking map', e);
    }
  };
  render();
})();
