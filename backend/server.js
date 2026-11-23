'use strict';
/* ZamMove backend entry point: loads data from the store, then serves the API and the frontend. */
const fs = require('fs');
const https = require('https');
const os = require('os');
const cfg = require('./src/config');
const { createStore } = require('./src/store');
const { State } = require('./src/state');
const createDomain = require('./src/domain');
const { createApp } = require('./src/app');

const lanIps = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family == 'IPv4' && !i.internal)
    .map(i => i.address);

async function main() {
  const state = await new State(createStore(cfg)).init();
  const domain = createDomain(state.S);
  const app = createApp({ state, domain, cfg });
  setInterval(
    () => state.run(() => domain.h.sweep()).catch(e => console.error('[zammove] sweep failed', e)),
    30000
  ).unref();
  app.listen(cfg.port, () => {
    console.log(
      `[zammove] store=${state.store.kind}  http://localhost:${cfg.port}/customer/  (admin panel: /admin/)`
    );
    if (!state.S.users.some(u => u.adm == 'super'))
      console.log(
        `[zammove] no owner admin yet: open http://localhost:${cfg.port}/customer/#owner-setup${cfg.ownerSetupCode ? ' (setup code required)' : ''}`
      );
  });
  /* HTTPS for phones on the same Wi-Fi: browsers block GPS on plain http:// (except localhost) */
  if (cfg.httpsKey && cfg.httpsCert) {
    try {
      const opts = { key: fs.readFileSync(cfg.httpsKey), cert: fs.readFileSync(cfg.httpsCert) };
      https.createServer(opts, app).listen(cfg.httpsPort, () => {
        const ips = lanIps();
        console.log(`[zammove] HTTPS on port ${cfg.httpsPort}. On a phone (same Wi-Fi) open:`);
        ips.forEach(ip => console.log(`           https://${ip}:${cfg.httpsPort}/customer/`));
        console.log('           (accept the certificate warning once; then GPS sharing works)');
      });
    } catch (e) {
      console.error(
        '[zammove] HTTPS not started:',
        e.message,
        '(check HTTPS_KEY / HTTPS_CERT in backend/.env)'
      );
    }
  } else {
    const ips = lanIps();
    if (ips.length)
      console.log(
        `[zammove] phones on http://${ips[0]}:${cfg.port} cannot share GPS (browsers need HTTPS). Run "npm run https-cert" once, then restart.`
      );
  }
}
main().catch(e => {
  console.error('[zammove] failed to start:', e.message);
  process.exit(1);
});
