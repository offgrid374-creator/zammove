'use strict';
/* OpenStreetMap services, called by the server (never directly by browsers):
     - Nominatim: address search and reverse lookup (usage policy: identify the app, at most 1 request/second, cache)
     - OSRM (project-osrm.org): road distance, driving time and route shape for pricing and the map
   Results are cached in memory. Everything is limited to the Zamboanga City service area. If a service is
   unreachable, callers fall back to the straight-line estimate (see constants.kmBetween). */
const C = require('./domain/constants');

const UA = process.env.GEO_USER_AGENT || 'ZamMove/1.0 (Zamboanga City logistics prototype)';
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const VIEWBOX = '121.90,7.50,122.40,6.85'; // west,north,east,south: Zamboanga City
const TIMEOUT = 7000;

/* small LRU cache */
const cache = (max = 500) => {
  const m = new Map();
  return {
    get: k => {
      if (!m.has(k)) return undefined;
      const v = m.get(k);
      m.delete(k);
      m.set(k, v);
      return v;
    },
    set: (k, v) => {
      m.set(k, v);
      if (m.size > max) m.delete(m.keys().next().value);
      return v;
    },
  };
};
const searches = cache(),
  reverses = cache(),
  routes = cache(1000);

/* Nominatim allows one request per second: requests wait their turn */
let nextSlot = 0;
const turn = async () => {
  const now = Date.now(),
    wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 1100;
  if (wait) await new Promise(r => setTimeout(r, wait));
};
const getJSON = async url => {
  const ctl = new AbortController(),
    t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
};
const r5 = x => Math.round(x * 1e5) / 1e5;
/* a short, readable label: "KCC Mall de Zamboanga, Governor Camins Avenue, Camino Nuevo, Zamboanga City" */
const label = (d, name) => {
  const a = d.address || {};
  const parts = [
    name || d.name,
    [a.house_number, a.road].filter(Boolean).join(' '),
    a.neighbourhood || a.quarter || a.suburb || a.village || a.hamlet,
  ].filter((x, i, l) => x && l.indexOf(x) == i);
  return (parts.length ? parts.join(', ') + ', ' : '') + 'Zamboanga City';
};
/* "Label (lat, lng)": the format the booking forms and the server already understand */
const asPlace = (name, lat, lng) =>
  `${String(name).replace(/[()]/g, '').slice(0, 150)} (${r5(lat).toFixed(5)}, ${r5(lng).toFixed(5)})`;

async function search(q) {
  q = String(q || '')
    .trim()
    .slice(0, 120);
  if (q.length < 3) return [];
  const key = q.toLowerCase();
  const hit = searches.get(key);
  if (hit) return hit;
  await turn();
  /* naming the city ranks real Zamboanga places above shops that merely contain a word of the query */
  const full = /zamboanga/i.test(q) ? q : q + ' Zamboanga';
  const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=ph&viewbox=${VIEWBOX}&bounded=1&q=${encodeURIComponent(full)}`;
  const rows = await getJSON(url);
  /* rank: places whose own name contains the words typed come first (a mall before the shops inside it) */
  const words = q
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter(w => w.length > 1 && !['zamboanga', 'city', 'the', 'de', 'of'].includes(w));
  const score = d =>
    words.filter(w =>
      String(d.name || '')
        .toLowerCase()
        .includes(w)
    ).length;
  const out = (Array.isArray(rows) ? rows : [])
    .map((d, i) => ({ lat: +d.lat, lng: +d.lon, d, i, s: score(d) }))
    .filter(x => C.zcBox(x.lat, x.lng))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(x => {
      const name = label(x.d);
      return {
        name,
        lat: r5(x.lat),
        lng: r5(x.lng),
        place: asPlace(name, x.lat, x.lng),
        kind: x.d.addresstype || x.d.type || '',
      };
    })
    .filter((x, i, l) => l.findIndex(y => y.name == x.name) == i)
    .slice(0, 6);
  return searches.set(key, out);
}

async function reverse(lat, lng) {
  lat = +lat;
  lng = +lng;
  if (!C.zcBox(lat, lng)) return null;
  const key = lat.toFixed(4) + ',' + lng.toFixed(4); // ~11 m
  const hit = reverses.get(key);
  if (hit) return hit;
  await turn();
  const d = await getJSON(
    `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`
  );
  const name = d && !d.error ? label(d) : 'Pinned location, Zamboanga City';
  return reverses.set(key, { name, lat: r5(lat), lng: r5(lng), place: asPlace(name, lat, lng) });
}

/* road route through 2–4 [lat, lng] points: { km, min, line: [[lat, lng], ...], legs: [{ km, min }] } */
async function route(a, b, ...more) {
  const pts = [a, b, ...more].filter(Boolean);
  if (pts.length < 2 || pts.length > 4 || !pts.every(x => C.zcBox(x[0], x[1]))) return null;
  const key = pts.map(x => (+x[0]).toFixed(5) + ',' + (+x[1]).toFixed(5)).join(';');
  const hit = routes.get(key);
  if (hit) return hit;
  const url = `${OSRM}/route/v1/driving/${pts.map(x => x[1] + ',' + x[0]).join(';')}?overview=simplified&geometries=geojson&alternatives=false&steps=false`;
  const d = await getJSON(url);
  const rt = d && d.code == 'Ok' && d.routes && d.routes[0];
  if (!rt) return null;
  return routes.set(key, {
    km: Math.round(rt.distance / 100) / 10,
    min: Math.max(1, Math.round(rt.duration / 60)),
    line: rt.geometry.coordinates.map(([lng, lat]) => [r5(lat), r5(lng)]),
    legs: (rt.legs || []).map(l => ({
      km: Math.round(l.distance / 100) / 10,
      min: Math.max(1, Math.round(l.duration / 60)),
    })),
  });
}

/* road kilometres for pricing (to 0.1 km, at least 1), or null when routing is unavailable */
async function roadKm(pu, dr) {
  if (process.env.GEO_OFFLINE == '1') return null; // tests and offline demos: straight-line estimate
  try {
    const r = await route(C.coord(pu), C.coord(dr));
    /* charged per 0.1 km of road (it used to round up to a whole km) */
    return r ? { km: Math.max(1, Math.round(r.km * 10) / 10), min: r.min } : null;
  } catch (e) {
    return null;
  }
}

module.exports = { search, reverse, route, roadKm, asPlace };
