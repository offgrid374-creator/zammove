'use strict';
/**
 * Creates a self-signed HTTPS certificate for testing on phones over the same Wi-Fi.
 * Browsers only allow GPS (geolocation) on https:// or localhost, so a phone opening
 * http://192.168.x.x:3000 cannot share the driver's location. With this certificate the
 * server also listens on https://<your-PC-IP>:3443.
 *
 *   npm run https-cert        (then restart the server)
 *
 * Needs OpenSSL (included with Git for Windows). Writes backend/.certs/ and adds
 * HTTPS_KEY / HTTPS_CERT to backend/.env. Phones show a certificate warning the first time:
 * choose "Advanced" → "Proceed". For a warning-free link, deploy to a host with HTTPS instead.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, '.certs');
const envFile = path.join(root, '.env');
const key = path.join(dir, 'key.pem');
const cert = path.join(dir, 'cert.pem');

const candidates = [
  'openssl',
  'C:/Program Files/Git/usr/bin/openssl.exe',
  'C:/Program Files/Git/mingw64/bin/openssl.exe',
];
const openssl = candidates.find(c => {
  try {
    execFileSync(c, ['version'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
});
if (!openssl) {
  console.error('OpenSSL was not found. Install Git for Windows (it includes OpenSSL) and run this again.');
  process.exit(1);
}

const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter(i => i && i.family == 'IPv4' && !i.internal)
  .map(i => i.address);
const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map(ip => 'IP:' + ip)].join(',');

fs.mkdirSync(dir, { recursive: true });
execFileSync(
  openssl,
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-sha256',
    '-days',
    '825',
    '-keyout',
    key,
    '-out',
    cert,
    '-subj',
    '/CN=ZamMove local test',
    '-addext',
    'subjectAltName=' + san,
  ],
  { stdio: 'ignore' }
);

let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const set = (k, v) => {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, 'm').test(env)
    ? env.replace(new RegExp(`^${k}=.*$`, 'm'), line)
    : env.replace(/\s*$/, '\n') + line + '\n';
};
set('HTTPS_KEY', key.replace(/\\/g, '/'));
set('HTTPS_CERT', cert.replace(/\\/g, '/'));
fs.writeFileSync(envFile, env);

console.log('Certificate created in backend/.certs and added to backend/.env.');
console.log('Restart the server, then on the phone (same Wi-Fi) open:');
(ips.length ? ips : ['<your-PC-IP>']).forEach(ip => console.log(`  https://${ip}:3443/customer/`));
console.log('Tap "Advanced" → "Proceed" on the certificate warning once.');
console.log('If the phone cannot connect, allow Node.js through Windows Firewall (Private networks).');
