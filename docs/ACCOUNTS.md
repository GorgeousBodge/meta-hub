# Accounts — the shared Gmail and Outlook.com sign-in

Mail Deck and Calendar Deck read the same two accounts: one Gmail and one personal Microsoft (Outlook.com) account. You sign in once, on a desktop page, and the server keeps the connection alive. **Attach this file to any chat that builds an app on these accounts.**

| Part | What it is |
|---|---|
| `/connect/` (`connect/index.html`, `connect.js`, `connect.css`) | Desktop page, protected by `APP_CODE`: Connected / Not connected, Connect, Disconnect, setup checks, the redirect URI to register and a TOKEN_KEY generator |
| `api/connect/[op].js` | One Vercel function: `status`, `start`, `callback`, `disconnect` |
| `api/_lib/accounts.js` | Get a working access token for an account (refreshes and saves rotations) |
| `api/_lib/store.js` | Encrypted get/set in Upstash Redis over its REST API |

Functions after Mail: `home`, `news`, `nav/[op]`, `status`, `connect/[op]`, `mail/[op]` = **6 of 12**. Calendar adds one more (`api/calendar/[op].js`) and reuses everything above unchanged.

---

## Scopes (requested once, for Mail and Calendar)

| Provider | Scopes | Why |
|---|---|---|
| Google | `gmail.modify` | Read, mark as read, send. The narrowest single scope that can mark mail read, and it already includes sending. Cannot permanently delete mail |
| | `calendar.readonly` | Calendar Deck |
| | `openid`, `email` | Shows which account is connected |
| Microsoft | `Mail.ReadWrite` | Read and mark as read (`Mail.Read` can't mark read) |
| | `Mail.Send` | Send replies |
| | `Calendars.Read` | Calendar Deck |
| | `User.Read` | Shows which account is connected |
| | `offline_access`, `openid` | Refresh tokens and sign-in |

Microsoft sign-in uses the `/consumers` endpoint, so only personal Microsoft accounts can connect; no work or school accounts.

---

## Vercel environment variables

| Variable | Where it comes from |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Added automatically by the Upstash integration (Vercel Marketplace). `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work. The integration adds a few others too (a read-only token, `KV_URL`, `REDIS_URL`); they're not used |
| `TOKEN_KEY` | 32 random bytes as base64 (44 characters). Generate one on `/connect/` (made in your browser, never sent anywhere). **Keep a copy**: if it changes, the saved sign-ins can't be read and you'd reconnect both accounts |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud (below) |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Azure app registration (below) |
| `OAUTH_REDIRECT_BASE` | Optional. e.g. `https://meta-deck.vercel.app`. Pins the redirect address; otherwise it's taken from the address you opened `/connect/` on |
| `APP_CODE` | Already set. The connect and mail endpoints refuse to run without it |

Vercel only picks up variable changes on a new deployment: after adding variables, **Deployments → ⋯ → Redeploy**.

---

## Setup, step by step

Do it on your computer, in this order. Open `/connect/` at the end of each step: its **Setup checks** go green as you go, and it shows the exact **Redirect URI** to paste (`https://YOUR-PROJECT.vercel.app/api/connect/callback`). Always use your main production address (not a preview deployment's long address), because the redirect URI must match exactly.

### 1. Upstash Redis (token storage)
1. Vercel → your **meta-deck** project → **Storage** tab → **Create Database** (or **Browse Marketplace**) → **Upstash** → **Upstash for Redis**.
2. Pick the **Free** plan and a region close to London (e.g. `eu-west-1` / Ireland, or London if offered). Name it e.g. `deck-store`.
3. **Connect to project** → meta-deck, environments **Production** and **Preview**. Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
4. The free plan allows 500K commands a month, 250 MB and one database. Mail uses a few thousand commands a month.

### 2. TOKEN_KEY
1. Open `https://YOUR-PROJECT.vercel.app/connect/` (enter your access code if asked).
2. Under **New TOKEN_KEY**, press **Generate**, then **Copy**. Save it in your password manager too.
3. Vercel → **Settings → Environment Variables** → add `TOKEN_KEY` (Production + Preview) → Save → **Redeploy**.

### 3. Google Cloud (Gmail)
1. Go to **console.cloud.google.com**, signed in with your Gmail account. Top bar project picker → **New project** → name `meta-deck` → **Create**, then select it.
2. **APIs & Services → Library**: search **Gmail API** → **Enable**. Back, search **Google Calendar API** → **Enable**.
3. Open **Google Auth Platform** (search for it in the top bar, or **APIs & Services → OAuth consent screen**). If asked to get started:
   - **App information**: app name `Meta Deck`, user support email: your Gmail.
   - **Audience**: **External**.
   - **Contact information**: your Gmail. Agree to the policy → **Create**.
4. **Data Access** → **Add or remove scopes**. Tick, or paste in "Manually add scopes":
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `openid` and `.../auth/userinfo.email`
   → **Update** → **Save**. A "verification required" notice for restricted scopes is expected: it's for apps offered to the public, not your own account.
5. **Audience** → **Publishing status** → **Publish app** → confirm. It must say **In production**. (Left in *Testing*, Google expires the refresh token after 7 days.)
6. **Clients** → **Create client** → Application type **Web application**, name `Meta Deck web`.
   - **Authorized redirect URIs** → **Add URI** → paste the Redirect URI from `/connect/`.
   - Leave *Authorized JavaScript origins* empty → **Create**.
7. Copy the **Client ID** and **Client secret** straight away (download the JSON too). Google only shows the full secret at creation; afterwards you'd need to add a new secret.
8. Vercel: add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` → **Redeploy**.

Google deletes OAuth clients that go unused for six months (with an email warning 30 days before). Using Mail keeps it in use.

### 4. Azure app registration (Outlook.com)
Microsoft no longer lets a personal account register an app "outside a directory", so you need a free Azure directory first.

1. Go to **portal.azure.com** and sign in with your Outlook.com account.
2. Search **App registrations**. If you see *"The ability to create applications outside of a directory has been deprecated"*, follow its **sign up for Azure** link (or go to azure.microsoft.com/free) and complete the free sign-up with the same account. Microsoft may ask for a card to confirm your identity. App registrations are free; don't add paid services. Then return to **App registrations**.
3. **+ New registration**:
   - **Name**: `Meta Deck`
   - **Supported account types**: **Personal Microsoft accounts only**
   - **Redirect URI**: platform **Web**, paste the Redirect URI from `/connect/`
   → **Register**.
4. On the app's **Overview**, copy **Application (client) ID** → that's `MS_CLIENT_ID`.
5. **Certificates & secrets → Client secrets → + New client secret**. Description `vercel`; expiry **24 months** (the longest offered) → **Add**. Copy the **Value** column now (not the Secret ID). That's `MS_CLIENT_SECRET`. Put a calendar reminder a month before it expires; you then add a new secret and update Vercel.
6. **API permissions → + Add a permission → Microsoft Graph → Delegated permissions**. Tick `offline_access`, `openid`, `User.Read` (usually there already), `Mail.ReadWrite`, `Mail.Send`, `Calendars.Read` → **Add permissions**. No admin consent is needed for personal accounts.
7. Vercel: add `MS_CLIENT_ID` and `MS_CLIENT_SECRET` → **Redeploy**.

### 5. Connect
1. Open `/connect/`. All setup checks should be green.
2. **Gmail → Connect**. Pick your Gmail. You'll see **"Google hasn't verified this app"**: click **Advanced → Go to Meta Deck (unsafe)**, tick every permission (Gmail and Calendar), **Continue**. You land back on `/connect/` with "Gmail connected".
3. **Outlook → Connect**. Sign in with Outlook.com → **Accept** the permissions. Back on `/connect/`: "Outlook connected".
4. `/api/status?c=YOUR-CODE` now shows `accounts.ready: true` and `mail.ready: true`.

---

## How the connection stays alive

- **Access tokens** last about an hour. `accounts.getAccessToken()` refreshes them a minute before expiry and caches the new one (encrypted) in Upstash.
- **Microsoft** issues a new refresh token on every refresh; each lasts 90 days. Every new one is saved, so any use within 90 days keeps the account connected. `/connect/` warns after 75 days without one.
- **Google** refresh tokens don't expire while the app is *In production* and in use. They stop if you change your Google password with Gmail scopes granted, revoke access at myaccount.google.com/permissions, or don't use them for six months.
- If a provider refuses the refresh token, the account is marked **Sign in again** on `/connect/` and Mail says so; press **Reconnect**. The other account keeps working.
- **Disconnect** deletes the saved sign-in. For Google it also revokes the grant. For Microsoft, also remove it at account.live.com/consent/Manage if you want it gone from your account's app list.

## Security notes

- Everything stored is AES-256-GCM encrypted with `TOKEN_KEY`, each value bound to its key name. Nothing secret reaches the browser; the connect page only ever sees account addresses and dates.
- Sign-in uses PKCE, plus a random **state** saved for 10 minutes and usable once. A matching cookie means the callback only completes in the browser that started it.
- Every connect step except the provider's callback needs `APP_CODE`, and all responses are `Cache-Control: no-store`.

---

## `api/_lib/store.js`

```js
const store = require('./store.js');          // from api/_lib/<app>/: require('../store.js')
await store.set('calendar:prefs', { tz: 'Europe/London' }, { ttl: 3600 }); // ttl optional, seconds
await store.get('calendar:prefs');           // decrypted value, or null
await store.del('calendar:prefs');
await store.take('oauth:…');                 // get and delete in one step
await store.setOnce('lock:x', true, { ttl: 60 }); // true if this call created it (NX)
store.hashId(untrustedString);               // short hash, for using ids in key names
store.info();                                // { configured, missing, keyError, … } (no secrets)
```

- Keys are prefixed `deck:` in Redis. Pick a prefix per app (`mail:`, `calendar:`).
- Values are any JSON. Throws if storage isn't configured, or a value can't be decrypted.
- Keys in use: `account:google`, `account:microsoft` (sign-ins), `oauth:<state>` (10-minute sign-in state), `mail:sum:<hash>` (summaries, 7 days), `mail:sent:<hash>` (double-send guard, 10 minutes).

## `api/_lib/accounts.js`

```js
const accounts = require('../accounts.js');  // from api/_lib/calendar/

// A working bearer token (refreshes and saves rotations as needed)
const token = await accounts.getAccessToken('google');      // or 'microsoft'

// Or let it add the header, and refresh-and-retry once on a 401
const r = await accounts.authFetch('microsoft',
  'https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=…&endDateTime=…');
const g = await accounts.authFetch('google',
  'https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=…&singleEvents=true&orderBy=startTime');

await accounts.status();   // [{ provider, label, configured, connected, email, needsReconnect, connectedAt, refreshedAt, scopes }]
accounts.NAMES;            // ['google', 'microsoft']
```

Errors are `accounts.AccountError` with `.code` and `.provider`:

| `.code` | Meaning | Show |
|---|---|---|
| `config` | Client ID/secret or storage missing in Vercel | Setup message (500) |
| `not_connected` | Never connected, or disconnected | "Connect on /connect/" |
| `reconnect` | Provider refused the refresh token | "Sign in again on /connect/" |
| `upstream` | Provider's token service failed | Try again later (502) |

Pattern for an app's handler (see `api/_lib/mail/handlers.js`): run each account in `Promise.allSettled`, so one account needing attention doesn't stop the other.

Calendar notes for the next chat:
- Google Calendar API base: `https://www.googleapis.com/calendar/v3`
- Microsoft: `https://graph.microsoft.com/v1.0/me/calendarView` (send `Prefer: outlook.timezone="Europe/London"`)
- Both scopes are already granted, so no new sign-in is needed.
