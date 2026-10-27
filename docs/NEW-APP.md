# Adding an app

This walks through adding a new app called **services** at `/services/`. Swap in your own name: lowercase letters, numbers and hyphens.

A new app is three things: a folder with its page, one line in the launcher, and (only if it needs keys or other websites) one server file. The shared look, access code, lock screen, demo mode, HUD and toasts come from `deck/` for free, and it uses the environment variables already in the Vercel project.

## 1. Make the folder

Copy `starter/` to `services/`. On the GitHub website there's no folder copy, so for each file open the starter version, copy its contents, then **Add file → Create new file** and type the new path:

| From | To |
|---|---|
| `starter/index.html` | `services/index.html` |
| `starter/app.js` | `services/app.js` |
| `starter/.well-known/meta-wearables-manifest.json` | `services/.well-known/meta-wearables-manifest.json` |
| `starter/.well-known/starter-icon.svg` | `services/.well-known/services-icon.svg` |

In the new files, replace `starter` with `services` (the script and icon paths in `index.html`, and `Deck.api('starter')` in `app.js`). Optionally upload a 96×96 `services/icon-96.png` for the browser tab.

## 2. Give it a glasses icon

Edit `services/.well-known/meta-wearables-manifest.json`: set `name`, `description`, and `"src": "services-icon.svg"`. Then draw the icon in `services-icon.svg`: a 64×64 SVG in plain white (`#fff`) on nothing. The glasses use it as a mask and tint it, so only the shape matters. Keep the same `icon_background` as the other apps so they match.

## 3. Add it to the launcher

In `deck/apps.js`, add an entry:

```js
{
  id: 'services',
  name: 'Services',
  blurb: 'One short line',
  icon: '<path d="…" fill="none" stroke="currentColor" stroke-width="4"/>',   // same shapes as the glasses icon
},
```

## 4. A server function (only if it needs one)

If the app calls an API that needs a key, or a site the browser can't reach directly, create **one** file, `api/services.js`:

```js
// /api/services — Services Deck server
const { send, allowed, cleanKey, fetchT, upstreamError } = require('./_lib/common.js');

module.exports = async (req, res) => {
  if (!allowed(req, res)) return;                      // shared APP_CODE
  const key = cleanKey(process.env.SERVICES_API_KEY);
  if (!key) return send(res, 500, { error: 'SERVICES_API_KEY is not set in Vercel' });
  try {
    const r = await fetchT(`https://api.example.com/things?key=${key}`);
    if (!r.ok) return send(res, 502, { error: await upstreamError(r, 'Example API') });
    const data = await r.json();
    send(res, 200, { items: data.things.map((t) => ({ title: t.name, meta: t.when })) }, 60);
  } catch (e) {
    send(res, 502, { error: e.message });
  }
};
```

Then in `services/app.js`, set `HAS_SERVER = true`. The app calls it with `Deck.api('services')`, which adds the access code.

**Several endpoints?** Make `api/services/[op].js` as one router (copy `api/nav/[op].js`) and put the handlers in `api/_lib/services/`. Each file directly in `api/` is one Vercel function, and the free plan allows 12; files in `api/_lib/` don't count.

**Status check:** add a line for the app to `apps` in `api/status.js`, e.g. `services: { ready: has('SERVICES_API_KEY') }`, and its variables to `vars`. The launcher then marks it "Needs setup" until the key is in.

## 5. Keys and deploy

Add any new environment variables in Vercel (**Settings → Environment Variables**), then commit. Vercel redeploys on every commit, but only picks up variable changes on a new deployment, so redeploy if you added variables after the last commit.

## 6. Put it on the glasses

Add a web app with `https://YOUR-PROJECT.vercel.app/services/`, keeping the slash at the end so the glasses find its icon. The code is already on the glasses if you've opened another Deck app.

## Asking Claude to build one

Give it:
- `deck/README.md` (the toolkit reference)
- `starter/index.html` and `starter/app.js` (the pattern to follow)
- what the app should do, what data it needs, and any API docs

Ask for: `services/index.html`, `services/app.js`, `services/services.css` if needed, the manifest and icon, the `deck/apps.js` entry, and `api/services.js` if it needs a server. That's all it has to read, rather than the code of the other apps.
