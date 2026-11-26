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
      /* never wait forever: a request that hangs is stopped and the user is told (photos get longer) */
      const data = body ? JSON.stringify(body) : undefined,
        ctl = typeof AbortController != 'undefined' ? new AbortController() : null,
        limit = data && data.length > 200000 ? 60000 : 25000,
        timer = ctl && setTimeout(() => ctl.abort(), limit);
      try {
        r = await fetch(BASE + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          body: data,
          ...(ctl ? { signal: ctl.signal } : {}),
        });
      } catch (e) {
        return {
          ok: false,
          net: true,
          err:
            e && e.name == 'AbortError'
              ? 'The server is taking too long to answer. Check your connection, then check whether it went through before trying again.'
              : 'Cannot reach the ZamMove server. Check your connection and try again.',
        };
      } finally {
        if (timer) clearTimeout(timer);
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
      /* a background refresh that started before an action can finish after it: never let older data
         replace newer data (the version only goes up) */
      if (j.state && !(typeof j.state.version == 'number' && j.state.version < lastVersion && !path.startsWith('/auth/'))) {
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
