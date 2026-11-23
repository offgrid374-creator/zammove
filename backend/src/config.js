'use strict';
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const env = process.env;
const cfg = {
  port: +env.PORT || 3000,
  /* supabase | file | memory. Default: supabase when SUPABASE_URL is set, otherwise a local JSON file */
  store: env.STORE || (env.SUPABASE_URL ? 'supabase' : 'file'),
  supabaseUrl: env.SUPABASE_URL || '',
  supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
  dataFile: env.DATA_FILE || path.join(__dirname, '..', '.data', 'zammove.json'),
  tokenSecret: env.TOKEN_SECRET || '',
  ownerSetupCode: env.OWNER_SETUP_CODE || '',
  allowTestSeed: env.ALLOW_TEST_SEED === '1' && env.NODE_ENV !== 'production',
  production: env.NODE_ENV === 'production',
  /* optional HTTPS (phones only share GPS on https:// or localhost): paths to a key and certificate (PEM) */
  httpsKey: env.HTTPS_KEY || '',
  httpsCert: env.HTTPS_CERT || '',
  httpsPort: +env.HTTPS_PORT || 3443,
  frontendDir: path.join(__dirname, '..', '..', 'frontend'),
};
if (!cfg.tokenSecret) {
  if (cfg.production) throw new Error('TOKEN_SECRET is required in production (backend/.env).');
  cfg.tokenSecret = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[zammove] TOKEN_SECRET not set: using a random one, so logins reset when the server restarts.'
  );
}
module.exports = cfg;
