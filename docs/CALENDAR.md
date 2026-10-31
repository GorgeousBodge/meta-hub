# Calendar Deck (`/calendar/`)

Your Gmail (Google Calendar) and Outlook.com calendars side by side on the glasses: today and the next six days, with what's on **now**, a countdown to what's **next**, and a spoken run-through of the day. It's **read-only**, so nothing on the glasses can change or reply to an event.

It uses the same two accounts as Mail, connected on `/connect/` (see `docs/ACCOUNTS.md`). Those sign-ins already include calendar permission (`calendar.readonly` / `Calendars.Read`), so **there's no new sign-in and no new key**. If Mail works, Calendar works.

## Files

**New files** (paste or upload as they are):

| Path | What |
|---|---|
| `calendar/index.html`, `calendar/app.js`, `calendar/calendar.css`, `calendar/demo.js` | The app and its demo data |
| `calendar/icon-96.png` | Browser-tab icon |
| `calendar/.well-known/meta-wearables-manifest.json`, `calendar/.well-known/calendar-icon.svg` | Glasses icon |
| `api/calendar/[op].js` | Calendar function (**7 of 12** after Mail) |
| `api/_lib/calendar/handlers.js`, `google.js`, `outlook.js`, `time.js`, `util.js` | Calendar's server code |
| `docs/CALENDAR.md` | This file |

It reuses `api/_lib/accounts.js`, `store.js`, `common.js`, `mail/text.js` and `deck/badges.js` **unchanged**.

**Small changes to shared files.** Make these by hand; don't replace the files. (The download also has full updated copies of both, made from the version you sent. Use those only if you haven't changed these files since.)

### `deck/apps.js`: add this entry after the Mail entry
```js
  {
    id: 'calendar',
    name: 'Calendar',
    blurb: 'Today · next 7 days',
    icon: '<rect x="10" y="14" width="44" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M10 26h44M22 8v10M42 8v10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><rect x="34" y="34" width="12" height="12" rx="2" fill="currentColor"/>',
    badge: 'calendar/today',   // events left today on the tile (deck/badges.js)
    badgeLabel: 'left today',
  },
```

### `api/status.js`: two additions
1. Inside `apps: {`, straight after the `mail:` line:
```js
      calendar: { ready: mailNeeds.length === 0, needs: mailNeeds, tz: raw('CAL_TZ') || 'Europe/London', mainOnly: raw('CAL_MAIN_ONLY') === '1' },
```
2. Inside `vars: {`, just above `BUS_REFRESH_SECONDS`:
```js
      CAL_TZ: { set: has('CAL_TZ'), note: 'optional: Calendar time zone, default Europe/London' },
      CAL_MAIN_ONLY: { set: has('CAL_MAIN_ONLY'), note: 'optional: 1 = only the main calendar on each account' },
```

## Calendar's own Vercel variables (both optional)

| Variable | |
|---|---|
| `CAL_TZ` | Time zone for "today", midnight and times. Default `Europe/London` (handles BST/GMT) |
| `CAL_MAIN_ONLY` | `1` shows only your main calendar on each account. Without it you see every calendar ticked in Google Calendar's sidebar, and every calendar on Outlook.com (Birthdays, UK holidays…) |

Plus the account variables in `docs/ACCOUNTS.md`, which are already set for Mail.

## Using it

| Screen | Controls |
|---|---|
| Day | Swipe left/right to change day (Today, Tmrw, then Sun 1, Mon 2…); swipe up/down through events; pinch to open. It opens on what's on now (or next). **Hear today** at the top reads the day aloud, skipping what's already done. Back on another day jumps to Today; Back on Today returns to the launcher |
| Event | When, a live "Now · 20 min left" or "Starts in 45 min", then where, online (Teams/Meet/Zoom), who with, who sent it, whether you've answered, and the notes. Swipe down to scroll; at the end, down moves to **Listen / Next**. **Next** steps to the next event, even on a later day |

What you'll see:
- **Amber row and edge**: on now. **Amber "In 40 min"**: your next event. **Dimmed**: finished. An amber **Now 14:32** line sits between done and to-come.
- **Not answered / Maybe**: invitations you haven't replied to, or said maybe to. Declined and cancelled events are hidden. So are Google's "working location" entries.
- **All day**, with "Day 2/3" for multi-day events. Events that run past midnight show "→ Sat", then "Until 01:00" on the next day.
- The same event on both accounts (UK bank holidays, say) shows once.
- The HUD reads **Now · until 15:00**, **Next 16:30**, **Done for today** or **Free today**.
- **Launcher badge**: how many timed events are left today (not counting all-day ones or ones marked *free*).

While open it redraws the countdowns every 30 seconds and reloads every 5 minutes. Both stop when it's hidden. The last calendar is kept on the glasses, so it opens instantly and still shows today if you lose signal (the status reads **Saved**).

## Safety

- Read-only: the server only uses `GET` requests to Google and Microsoft, and the app has no way to change anything.
- Every endpoint needs `APP_CODE` (and won't run if it's unset). Every response is `Cache-Control: no-store`.
- Event text is shown with `textContent` only. Notes are stripped to plain text, cut at the "Join Teams / Zoom / Meet" boilerplate and capped at 1,500 characters. Links and images are never shown or opened.

## Testing

### 1. Demo (no setup)
Open `https://YOUR-PROJECT.vercel.app/calendar/?demo` on your computer. Use the arrow keys, Enter and Escape.
- [ ] Today shows an amber **Budget review call** "Now · … left", a dimmed Gym, and **Pick up reserved book** "In … min" (about an hour away)
- [ ] → moves to Tmrw (Sunday lunch, Board games night marked MAYBE); Escape jumps back to Today
- [ ] Open the call: when, "Now · … left", Teams, people, notes. ↓ to the keys → **Next** opens the library event
- [ ] **Hear today** reads the day aloud; press again to stop
- [ ] In dev tools **Network**, nothing goes to `/api/` in demo

### 2. Setup check
- [ ] `/api/status?c=YOUR-CODE`: `apps.calendar.ready` is `true`
- [ ] `/api/calendar/list?c=YOUR-CODE` shows your events, and `accounts.google.ok` and `accounts.microsoft.ok` are `true`
- [ ] `/api/calendar/list` (no code) → 401

### 3. Live
1. Put a test event in each calendar for an hour from now, and one in Google for right now.
2. Open `/calendar/`: both appear, sorted together, with Google / Outlook badges; the current one is amber.
3. Make an all-day event for tomorrow in Outlook: it shows under **Tmrw** as ALL DAY.
4. Leave Calendar, open the launcher: the Calendar tile shows how many are left today.

### Glasses
Add the web app as:

`https://YOUR-PROJECT.vercel.app/calendar/index.html?code=YOURCODE`

(`index.html` makes the glasses find Calendar's own icon; the Meta AI app won't save an address ending in `/`.)

## If something's wrong

| You see | Fix |
|---|---|
| "Google refused calendar access … has not been used in project" | Enable the **Google Calendar API** in Google Cloud (APIs & Services → Library), wait a minute, reload |
| "refused calendar access" (Google or Outlook) | The calendar box wasn't ticked when you connected. On `/connect/` press **Reconnect** and tick every permission |
| Outlook: "not connected" / "needs signing in again" | Same as Mail: Reconnect on `/connect/` |
| Times an hour out | Set `CAL_TZ` (e.g. `Europe/London`) and redeploy |
| Status says **Partial** | One account failed, or one of its extra calendars (e.g. a shared one you've lost access to) couldn't be read. The note at the bottom of the day says which account |
| Too many calendars (birthdays, holidays) | Untick them in Google Calendar's sidebar, or set `CAL_MAIN_ONLY=1` |
| Launcher tile says **Needs setup** | The accounts aren't set up yet: see `docs/ACCOUNTS.md` |
| "No more than 12 Serverless Functions" | Calendar is the 7th. If you've added others, merge them into `[op].js` routers |
