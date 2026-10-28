// Setup check for the whole hub: open /api/status?c=YOUR-CODE in a browser.
// Shows which environment variables are set (never their values) and which apps are ready.
// The lock screen also uses it to test a code before saving it.
const { cleanKey, send, allowed, accessCode } = require('./_lib/common.js');
const store = require('./_lib/store.js');

const raw = (name) => String(process.env[name] || '').trim();
const has = (name) => raw(name).length > 0;
// Keys: cleaned the same way the functions clean them, so stray pasted characters show up
const key = (name) => {
  const clean = cleanKey(process.env[name]);
  return { set: clean.length > 0, length: clean.length, strippedChars: raw(name).length !== clean.length };
};
const missing = (...names) => names.filter((n) => !has(n));

module.exports = (req, res) => {
  if (!allowed(req, res)) return;
  const code = accessCode();
  const homeNeeds = [...missing('NABU_CASA_URL', 'HA_TOKEN'), ...(code ? [] : ['APP_CODE'])];
  // Accounts (shared by Mail and Calendar) and Mail
  const storage = store.info();
  const google = has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET');
  const microsoft = has('MS_CLIENT_ID') && has('MS_CLIENT_SECRET');
  const accountNeeds = [...storage.missing, ...(google || microsoft ? [] : ['GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET or MS_CLIENT_ID + MS_CLIENT_SECRET'])];
  const mailNeeds = [...accountNeeds, ...(code ? [] : ['APP_CODE'])];
  send(res, 200, {
    apps: {
      home: { ready: homeNeeds.length === 0, needs: homeNeeds },
      news: { ready: true, ai: has('ANTHROPIC_API_KEY') },
      accounts: { ready: accountNeeds.length === 0, storage: storage.configured, google, microsoft, needs: accountNeeds, connectPage: '/connect/' },
      mail: { ready: mailNeeds.length === 0, ai: has('ANTHROPIC_API_KEY'), needs: mailNeeds },
      nav: {
        ready: has('ORS_API_KEY'),
        trains: has('RAILDATA_API_KEY'),
        buses: has('TRANSPORTAPI_APP_ID') && has('TRANSPORTAPI_APP_KEY'),
        needs: missing('ORS_API_KEY', 'RAILDATA_API_KEY', 'TRANSPORTAPI_APP_ID', 'TRANSPORTAPI_APP_KEY'),
      },
    },
    vars: {
      APP_CODE: { set: !!code, length: code.length, from: has('APP_CODE') ? 'APP_CODE' : has('APP_KEY') ? 'APP_KEY (old name, still works)' : null },
      NABU_CASA_URL: { set: has('NABU_CASA_URL'), https: raw('NABU_CASA_URL').startsWith('https://') },
      HA_TOKEN: key('HA_TOKEN'),
      ANTHROPIC_API_KEY: key('ANTHROPIC_API_KEY'),
      NEWS_MODEL: { set: has('NEWS_MODEL'), note: 'optional' },
      ORS_API_KEY: key('ORS_API_KEY'),
      RAILDATA_API_KEY: key('RAILDATA_API_KEY'),
      RAILDATA_DEPARTURES_URL: { set: has('RAILDATA_DEPARTURES_URL'), note: 'optional' },
      TRANSPORTAPI_APP_ID: key('TRANSPORTAPI_APP_ID'),
      TRANSPORTAPI_APP_KEY: key('TRANSPORTAPI_APP_KEY'),
      KV_REST_API_URL: { set: storage.url, from: storage.urlFrom },
      KV_REST_API_TOKEN: { set: storage.token },
      TOKEN_KEY: { set: has('TOKEN_KEY'), valid: storage.key, problem: storage.keyError },
      GOOGLE_CLIENT_ID: { set: has('GOOGLE_CLIENT_ID') },
      GOOGLE_CLIENT_SECRET: { set: has('GOOGLE_CLIENT_SECRET') },
      MS_CLIENT_ID: { set: has('MS_CLIENT_ID') },
      MS_CLIENT_SECRET: { set: has('MS_CLIENT_SECRET') },
      OAUTH_REDIRECT_BASE: { set: has('OAUTH_REDIRECT_BASE'), note: 'optional' },
      MAIL_SIGN_OFF: { set: has('MAIL_SIGN_OFF'), note: 'optional' },
      MAIL_ALL_INBOX: { set: has('MAIL_ALL_INBOX'), note: 'optional: 1 = whole inbox, not just Primary / Focused' },
      BUS_REFRESH_SECONDS: { set: has('BUS_REFRESH_SECONDS'), note: 'optional, paid bus plans only' },
    },
  });
};
