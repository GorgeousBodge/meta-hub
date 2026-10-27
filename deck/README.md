# deck/ — the shared toolkit

Everything the apps have in common, so a new app only has to contain its own idea. When you ask Claude (or anyone) to build a new app, share **this file**, **`starter/index.html`** and **`starter/app.js`**: that's enough to build one that fits in, without reading the other apps.

| File | What it is |
|---|---|
| `style.css` | The HUD look. Load it first, then the app's own CSS |
| `deck.js` | `window.Deck`: access code, lock screen, demo mode, HUD, toasts, keys, speech |
| `apps.js` | The app list the launcher shows (`window.DECK_APPS`) |

## Rules of the display

- **Black is see-through** on the additive screen. Draw with light (outlines, glow, low-opacity fills), never solid panels.
- **600×600**, fixed. The frame is three rows: HUD (58 px), stage, hints (38 px).
- **Input:** swipes arrive as arrow keys, a pinch as Enter, Back as Escape/Backspace. Every control is a focusable `<button>`; focus is the main visual state.
- **Text:** 20 px+ for reading, Chakra Petch uppercase for labels and numbers.
- **Colours:** cyan `--accent` for focus and structure, amber `--amber` for "on" or "speaking", red `--warn` for errors, green `--ok` for live.

## Page skeleton

Every app's `index.html` uses the same HUD ids, so the `Deck` HUD helpers work everywhere. Copy `starter/index.html`. The parts that matter:

```html
<link rel="stylesheet" href="/deck/style.css">
<div class="frame">
  <header class="hud">
    <button class="hud-back focusable" id="hudBack" hidden>…</button>
    <div class="hud-heading"><h1 class="hud-title" id="hudTitle"></h1><span class="hud-sub" id="hudSub"></span></div>
    <div class="hud-status"><span class="status-dot" id="hudDot"></span><span id="hudStatus"></span><time class="hud-clock" id="hudClock"></time></div>
  </header>
  <main class="stage">…your views…</main>
  <footer class="hints" id="hints"></footer>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
</div>
<script src="/deck/deck.js"></script>
<script src="/yourapp/app.js"></script>
```

Use **absolute paths** (`/yourapp/app.js`), so the page works whether or not the address ends in a slash.

## `Deck` reference

### Server calls and access
| Call | Does |
|---|---|
| `await Deck.api(path, query, { method, body, timeout })` | Fetches `/api/<path>?…&c=<code>` and returns the parsed JSON. On error it throws `Error` with `.status` and `.data`. On a 401 `{ locked: true }` it also shows the lock screen and sets `.locked` on the error: check `if (!err.locked)` before showing your own message. Default timeout 20 s |
| `Deck.demo` | `true` with `?demo` in the address. Use sample data and don't call the server |
| `Deck.locked` | `true` while the lock screen is showing. Skip polling while it is |
| `Deck.lock(msg, { calm, demo, dismissible, onUnlock })` | Show the lock screen yourself. `calm`: cyan title instead of red. `demo: false`: hide **Try demo**. `dismissible`: Back closes it. After a correct code the page reloads, unless you pass `onUnlock` |
| `Deck.code` | The saved access code (or `''`) |
| `Deck.enterDemo()` | Reload the app in demo mode |

### HUD and feedback
| Call | Does |
|---|---|
| `Deck.title(title, sub)` | Set the HUD title and subtitle. `null` leaves one unchanged |
| `Deck.status(mode, label)` | Status light: `'live'` green, `'offline'` red, `'demo'` / `'cached'` amber, `'loading'` blinking, `''` dim. `label` defaults to Live / Offline / Demo / Saved / Loading |
| `Deck.back(show)` | Show or hide the HUD back button |
| `Deck.hints([['Swipe', 'move'], ['Pinch', 'open']])` | The footer hint row |
| `Deck.toast(msg, { error, ms })` | A short message above the hints (2.2 s by default) |
| `Deck.press(el)` / `Deck.bump(el)` | Pressed flash / "can't go further" shake |

The clock runs by itself.

### Navigation
| Call | Does |
|---|---|
| `Deck.action(event)` | For a `keydown`: `'up' 'down' 'left' 'right' 'select' 'back'` or `null`. Key names are in `Deck.KEYS` |
| `Deck.nearest(items, current, dir)` | The element in `items` nearest to `current` in direction `dir`, or `null` |
| `Deck.focus(el)` | Focus and scroll into view |
| `Deck.toHub()` | Back on your top screen: returns to the launcher and gives `true` if the app was opened from it. Use `if (!Deck.toHub()) Deck.bump(el)` |

### Other
| Call | Does |
|---|---|
| `Deck.say(text, { lang, rate, onend })` | Speak through the glasses speaker (cancels anything already speaking). `Deck.hush()` stops it |
| `Deck.store.get(key, fallback)` / `.set(key, value)` / `.del(key)` | `localStorage` with JSON, which never throws. **Prefix your keys** with your app id (`services.saved`): every app shares this storage |
| `Deck.esc(text)` | Escape text for `innerHTML`. Prefer `textContent` for anything from the server |

## CSS building blocks (`style.css`)

| Class | Use |
|---|---|
| `.view` | An absolutely positioned screen inside `.stage`; toggle with `hidden` |
| `.list` | Scrolling column of cards |
| `.card`, `.card-title`, `.card-meta` | A selectable row or tile with corner brackets |
| `.card-brief` | Amber "special" card (e.g. Listen) |
| `.key`, `.key-label`, `.key-speak` | A button; `.key-speak` is the amber variant |
| `.tabs`, `.tab`, `.tab.is-active` | Section tabs |
| `.notice` | Centred grey message in a list |
| `.state`, `.state-title`, `.state-title.err`, `.state-msg`, `.spin` | Full-screen loading / error / empty states |
| `.field-wrap` + `input.field` | Text input (pinch to write or speak) |
| `.ico` | Stroke icon, 1em, `currentColor` |
| `.focusable` | Add to anything that can take focus: gets the glow, press and bump styles |

Tokens: `--accent --amber --warn --ok --text --dim --line --line-strong --panel --radius --pad --gap --hud-h --hint-h --font-display --font-body`.

## Server side (`api/_lib/common.js`)

```js
const { send, allowed, cleanKey, num, fetchT, upstreamError } = require('./_lib/common.js');
module.exports = async (req, res) => {
  if (!allowed(req, res)) return;               // checks APP_CODE; { required: true } refuses if it isn't set
  const key = cleanKey(process.env.MY_API_KEY); // strips stray pasted characters
  const r = await fetchT('https://…', {}, 12000);  // fetch with a timeout
  if (!r.ok) return send(res, 502, { error: await upstreamError(r, 'Service') });
  send(res, 200, await r.json(), 60);           // last argument: seconds to cache at Vercel's edge
};
```

`num(value, min, max)` parses a number within range or returns `null`.
