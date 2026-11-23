/* Front-end demo replacement for frontend/shared/api.js (same ZAPI interface).
   Instead of calling the network, every request goes to the in-browser engine (engine.js), which runs the
   real ZamMove business rules on data kept in this browser. Requests to /api/... made with fetch (the maps)
   are answered by the engine too. */
const ZAPI = (() => {
  const E = window.ZM_ENGINE,
    TK = 'zm_demo_token';
  let token = null;
  try {
    token = sessionStorage.getItem(TK);
  } catch (e) {}
  const setToken = t => {
    token = t || null;
    try {
      t ? sessionStorage.setItem(TK, t) : sessionStorage.removeItem(TK);
    } catch (e) {}
  };
  let lastVersion = -1;
  const api = {
    onState: null,
    onLogout: null,
    token: () => token,
    setToken,
    version: () => lastVersion,
    async req(method, path, body) {
      let st, j;
      try {
        [st, j] = await E.handle(method, path, body ? JSON.parse(JSON.stringify(body)) : undefined, token);
      } catch (e) {
        console.error(e);
        return { ok: false, err: 'Unexpected error in the demo engine.' };
      }
      j = JSON.parse(JSON.stringify(j)); // the page gets a copy, like a real network response
      if (st == 401 && token) {
        setToken(null);
        if (api.onLogout) api.onLogout(j.err || 'Your session ended. Please log in again.');
      }
      if (j.state) {
        lastVersion = j.state.version;
        if (api.onState) api.onState(j.state);
      }
      return j;
    },
    act: (name, payload) => api.req('POST', '/act/' + name, payload || {}),
    async auth(op, payload) {
      const j = await api.req('POST', '/auth/' + op, payload || {});
      if (j.ok && j.token) setToken(j.token);
      return j;
    },
    refresh: () => api.req('GET', '/state'),
    publicTrack: ref => api.req('POST', '/public/track', { ref }),
    logout() {
      setToken(null);
      lastVersion = -1;
    },
  };
  return api;
})();
window.ZAPI = ZAPI;

/* the maps fetch /api/geo/...: answer from the engine (which calls OpenStreetMap services directly) */
(() => {
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input == 'string' ? input : input && input.url;
    if (url && url.startsWith('/api/')) {
      const [st, j] = await window.ZM_ENGINE.handle((init && init.method) || 'GET', url.slice(4), init && init.body ? JSON.parse(init.body) : undefined, ZAPI.token());
      return new Response(JSON.stringify(j), { status: st, headers: { 'Content-Type': 'application/json' } });
    }
    return real(input, init);
  };
})();

/* Map tiles: tile.openstreetmap.org requires a Referer, which browsers do not send for a page opened as a file.
   In that case use OpenStreetMap France's tiles (same OpenStreetMap data, no Referer needed); if those do not
   load, switch to Esri's street map. */
(() => {
  if (!window.L || location.protocol != 'file:') return;
  const orig = L.tileLayer;
  const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const FR = OSM + ', tiles <a href="https://www.openstreetmap.fr/">OSM France</a>',
    ESRI = 'Tiles © <a href="https://www.esri.com/">Esri</a>, ' + OSM;
  L.tileLayer = (url, opts = {}) => {
    if (!/tile\.openstreetmap\.org/.test(url)) return orig(url, opts);
    const layer = orig('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', { ...opts, subdomains: 'abc', maxZoom: 19, attribution: FR });
    let errs = 0;
    layer.on('tileerror', () => {
      if (++errs != 3) return;
      const m = layer._map;
      if (m && m.attributionControl) m.attributionControl.removeAttribution(FR).addAttribution(ESRI);
      layer.options.attribution = ESRI;
      layer.setUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}');
    });
    return layer;
  };
})();
