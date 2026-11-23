/* ZamMove API client, shared by the customer app and the Admin Panel.
   The browser never changes data itself: it calls the backend, and the backend answers with the
   logged-in user's view of the data (role-scoped), which replaces the local copy in S. */
const ZAPI = (() => {
  const BASE = window.ZM_API_BASE || '/api',
    TK = window.ZM_TOKEN_KEY || 'zm_token';
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
    onState: null, // called with the new view after every response that carries one
    onLogout: null, // called when the server says the session is no longer valid
    token: () => token,
    setToken,
    version: () => lastVersion,
    async req(method, path, body) {
      let r;
      try {
        r = await fetch(BASE + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        return {
          ok: false,
          net: true,
          err: 'Cannot reach the ZamMove server. Check your connection and try again.',
        };
      }
      let j = {};
      try {
        j = await r.json();
      } catch (e) {
        j = { ok: false, err: 'Unexpected server response (' + r.status + ').' };
      }
      if (r.status == 401 && token) {
        setToken(null);
        if (api.onLogout) api.onLogout(j.err || 'Your session ended. Please log in again.');
      }
      if (j.state) {
        lastVersion = j.state.version;
        if (api.onState) api.onState(j.state);
      }
      return j;
    },
    /* run a server-side action as the logged-in user */
    act: (name, payload) => api.req('POST', '/act/' + name, payload || {}),
    /* signup | login | forgot | reset | owner-setup */
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
