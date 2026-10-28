[MAIL.md](https://github.com/user-attachments/files/34104451/MAIL.md)
# Mail Deck (`/mail/`)

Gmail (Primary tab) and Outlook.com (Focused) in one inbox on the glasses: read, summarise, listen, and reply in the same thread after a confirm screen. Accounts are connected on `/connect/`; see `docs/ACCOUNTS.md`.

## Files

**New files** (paste or upload as they are):

| Path | What |
|---|---|
| `mail/index.html`, `mail/app.js`, `mail/mail.css`, `mail/demo.js` | The app and its demo data |
| `mail/.well-known/meta-wearables-manifest.json`, `mail/.well-known/mail-icon.svg` | Glasses icon |
| `connect/index.html`, `connect/connect.js`, `connect/connect.css` | Account connect page (desktop) |
| `api/mail/[op].js` | Mail function (1 of 12) |
| `api/connect/[op].js` | Connect function (1 of 12) |
| `api/_lib/store.js`, `api/_lib/accounts.js` | Shared with Calendar |
| `api/_lib/mail/handlers.js`, `gmail.js`, `outlook.js`, `text.js`, `ai.js`, `util.js` | Mail's server code |
| `deck/badges.js` | Unread count on the launcher tile |
| `docs/ACCOUNTS.md`, `docs/MAIL.md` | These docs |

**Small changes to shared files**: see below. Don't replace these files.

### `index.html` (the launcher, at the root)
Find:
```html
  <script src="/hub.js"></script>
```
Replace with:
```html
  <script src="/hub.js"></script>
  <script src="/deck/badges.js"></script>
```

### `deck/apps.js`: add this entry before the final `];`
```js
  {
    id: 'mail',
    name: 'Mail',
    blurb: 'Gmail · Outlook · replies',
    icon: '<rect x="10" y="16" width="44" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M12 20l20 15 20-15" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
    badge: 'mail/unread',      // unread count on the tile (deck/badges.js)
    badgeLabel: 'unread',
  },
```
Any app can use `badge`: point it at an endpoint returning `{ count, more }`.

### `api/status.js`: four additions

1. Find:
```js
const { cleanKey, send, allowed, accessCode } = require('./_lib/common.js');
```
Add on the next line:
```js
const store = require('./_lib/store.js');
```

2. Find:
```js
  const homeNeeds = [...missing('NABU_CASA_URL', 'HA_TOKEN'), ...(code ? [] : ['APP_CODE'])];
```
Add straight after it:
```js
  // Accounts (shared by Mail and Calendar) and Mail
  const storage = store.info();
  const google = has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET');
  const microsoft = has('MS_CLIENT_ID') && has('MS_CLIENT_SECRET');
  const accountNeeds = [...storage.missing, ...(google || microsoft ? [] : ['GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET or MS_CLIENT_ID + MS_CLIENT_SECRET'])];
  const mailNeeds = [...accountNeeds, ...(code ? [] : ['APP_CODE'])];
```

3. Inside `apps: {`, add these two lines (e.g. just above `nav: {`):
```js
      accounts: { ready: accountNeeds.length === 0, storage: storage.configured, google, microsoft, needs: accountNeeds, connectPage: '/connect/' },
      mail: { ready: mailNeeds.length === 0, ai: has('ANTHROPIC_API_KEY'), needs: mailNeeds },
```

4. Inside `vars: {`, add (e.g. just above `BUS_REFRESH_SECONDS`):
```js
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
```

## Mail's own Vercel variables

| Variable | |
|---|---|
| `ANTHROPIC_API_KEY` | Already set for News. Without it Mail still works, just without summaries, reply ideas or tidy-up |
| `NEWS_MODEL` | Optional, shared with News. Default `claude-haiku-5-5` |
| `MAIL_SIGN_OFF` | Optional, e.g. `Russ`. Added on a new line at the end of every reply (you see it on the confirm screen) |
| `MAIL_ALL_INBOX` | Optional. `1` shows the whole inbox instead of Gmail Primary + Outlook Focused |

Plus the account variables in `docs/ACCOUNTS.md`.

## Using it

| Screen | Controls |
|---|---|
| Inbox | Swipe up/down through mail; swipe left/right to change tab (All · Gmail · Outlook); pinch to open. Amber edge = unread. Back returns to the launcher |
| Message | Swipe down/up scrolls; at the end, down moves to **Listen / Reply**. Long emails get an AI summary on top (with "→ what they're asking you to do"). Opening marks it as read |
| Reply | Three AI ideas: pinch one to go straight to the confirm screen. Or swipe to the box and pinch to write or speak, then **Tidy up** (optional) and **Review**. Back saves the draft |
| Confirm | From (account), To, Re, and the full text including the sign-off. Focus starts on **Edit**: swipe right to **Send**, so a stray pinch never sends. Back returns to editing |

The count shows in the HUD and on the launcher tile. While Mail is open it checks every 2 minutes, and stops when it's hidden.

## Safety

- Mail is shown with `textContent` only. The server strips HTML to plain text, no images are ever loaded, and links are dropped (their text stays).
- Email goes to Claude as JSON data inside `<email_json>` tags, with a system prompt saying it's untrusted content to work on, never instructions. Claude's output is only shown to you or placed in a draft you confirm.
- Every endpoint needs `APP_CODE` (and won't run if it's unset). Every response is `Cache-Control: no-store`. Write actions (seen, AI, send) are POST only.
- **Send** takes only the message id and your text. The server re-reads the original from the mailbox to work out the recipient, subject and thread, and strips line breaks from headers. The same reply can't be sent twice within 10 minutes.
- No new emails, forwarding or deleting.

## Testing

### 1. Demo (no setup needed)
Open `https://YOUR-PROJECT.vercel.app/mail/?demo` on your computer (or the glasses). Use the arrow keys, Enter and Escape on a computer.
- [ ] The inbox shows 7 messages, 3 unread (amber), with GMAIL / OUTLOOK badges. HUD reads "3 unread"; tabs show counts
- [ ] ← → switches tabs; ↓ ↑ moves through rows
- [ ] Open **Surrey Hills Society**: the AI summary appears on top after a moment; ↓ scrolls; the HUD drops to 2 unread
- [ ] **Listen** reads it aloud; press again to stop
- [ ] **Reply** → three ideas → pick one → the confirm screen shows "Russ" sign-off, From/To/Re, focus on Edit → → **Send** → "Sent (demo — nothing was sent)"
- [ ] Reply again → type "um yes i can come" in the box → Escape → **Tidy up** → text tidied → **Review**
- [ ] In the browser's dev tools **Network** tab, nothing goes to `/api/` in demo

### 2. Setup checks
- [ ] `/api/status?c=YOUR-CODE`: `apps.accounts.ready` and `apps.mail.ready` are `true`; `TOKEN_KEY.valid` is `true`
- [ ] `/connect/`: all setup checks green; both accounts **Connected** with the right addresses

### 3. Safety checks (from a browser)
- [ ] `/api/mail/list` (no code) → 401 `Access code needed`
- [ ] `/api/mail/send?c=YOUR-CODE` opened as a normal page (GET) → 405 `POST only`
- [ ] In dev tools, any `/api/mail/…` response has `Cache-Control: no-store`

### 4. Live
1. From another address (e.g. your phone), send yourself a test at **each** account. For Gmail make sure it lands in Primary.
2. Open `/mail/` on the glasses (or computer). Both test mails appear, newest first, unread.
3. Open one: the text is clean, with no quoted history. It turns read in Gmail / Outlook within a few seconds.
4. Send a long newsletter-style test (more than ~180 words) to check the summary.
5. Reply to each test with a suggestion, then one written by you. Check on the phone: it arrives as a reply in the same conversation, from the account it was sent to, and appears in that account's Sent folder.
6. Badge: leave Mail, open the launcher, send another test, and within ~2 minutes the Mail tile shows the count.
7. Disconnect Outlook on `/connect/`: Mail shows Gmail only, with an "Outlook: not connected" note. Reconnect.

### Glasses
The Meta AI app won't save an address ending in `/`, so add the web app as:

`https://YOUR-PROJECT.vercel.app/mail/index.html?code=YOURCODE`

- `index.html` makes the glasses look in `mail/.well-known/` for Mail's icon (without it they read the hub's icon at the top of the site, or none).
- `?code=` saves the access code on first open (the glasses seem to keep each web app's storage separate) and is then removed from the address bar.
- The glasses fetch the icon when the app is added: after changing icon files, remove the web app and add it again.

## If something's wrong

| You see | Fix |
|---|---|
| `redirect_uri_mismatch` (Google) or `AADSTS50011` (Microsoft) | The redirect URI in Google Cloud / Azure must match `/connect/`'s exactly, including `https://` and `/api/connect/callback`. Use the production address, or set `OAUTH_REDIRECT_BASE` |
| "didn't return a refresh token" | Google: remove *Meta Deck* at myaccount.google.com/permissions, then Connect again |
| Gmail "refused access … has not been used in project" | Enable the Gmail API (and Calendar API) in the Google Cloud project |
| Gmail disconnects after a week | The consent screen is still *Testing*: publish it to *In production*, then Reconnect |
| `AADSTS700016` / `unauthorized_client` | Wrong `MS_CLIENT_ID`, or the registration isn't set to personal Microsoft accounts |
| `invalid_client` | Client secret wrong or expired (Azure secrets expire, max 24 months): make a new one, update Vercel, Redeploy |
| Outlook shows nothing | Mail may be under *Other*: set `MAIL_ALL_INBOX=1` to check |
| No summaries or reply ideas | `ANTHROPIC_API_KEY` not set; the Network tab shows 503 `AI is off` |
| "Stored value could not be decrypted" | `TOKEN_KEY` changed. Restore the old one, or Reconnect both accounts |
| Launcher has no badge | Check that `badges.js` is after `hub.js` in `index.html`, and the `badge` line is in the Mail entry |
