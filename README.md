[README.md](https://github.com/user-attachments/files/34202157/README.md)
# Deck

Web apps for **Meta Ray-Ban Display** glasses, all in one repo and one Vercel project. Each app is built for the Display's 600×600 screen and the Neural Band (swipe to move, pinch to select), and they share one look: a dark HUD in cyan and amber, Chakra Petch and corner brackets.

| App | Address | What it does |
|---|---|---|
| **Deck** (launcher) | `/` | Opens the other apps and shows whether each one is set up |
| [**Home**](home/README.md) | `/home/` | Home Assistant lights, heating, scenes and a Samsung TV remote |
| [**News**](news/README.md) | `/news/` | RSS headlines with short AI summaries and a spoken briefing |
| [**Nav**](nav/README.md) | `/nav/` | Walking and cycling directions, a street map, live trains and buses |

Each app keeps its own icon on the glasses, and one access code unlocks all of them.

---

## What's where

```
index.html, hub.js          the launcher
.well-known/                launcher's glasses icon
deck/                       shared by every app
  style.css                   the HUD look: tokens, cards, keys, tabs, focus, toast, lock screen
  deck.js                     access code, lock screen, demo mode, HUD, toasts, keys, speech
  apps.js                     the app list the launcher shows
  README.md                   reference for building with it
home/  news/  nav/          one folder per app: index.html, app.js, its own CSS,
  .well-known/                and its own glasses icon (meta-wearables-manifest.json)
starter/                    a minimal working app to copy for the next one
api/                        server functions (Vercel). One per app:
  home.js                     /api/home      → Home Assistant
  news.js                     /api/news      → RSS + Claude summaries
  nav/[op].js                 /api/nav/…     → directions, search, trains, buses
  status.js                   /api/status    → setup check for everything
  _lib/                       shared server code (not a route)
docs/                       screenshots and the guide to adding an app
```

Nothing is built: Vercel serves the files as they are, and runs whatever is in `api/` as functions. Every secret lives in Vercel's environment variables and is only read by `api/`.

## Setup

### 1. Put the code on GitHub
Create a new repository (for example `meta-deck`) and upload the contents of this folder, keeping the folder structure. On the GitHub website: **Add file → Upload files**, then drag in everything at once (folders included).

> The `.well-known` folders start with a dot, so your computer may hide them. If they don't appear in the upload, add each `meta-wearables-manifest.json` and icon by hand with **Add file → Create new file** and type the path, e.g. `home/.well-known/meta-wearables-manifest.json`.

### 2. Import it into Vercel
**Add New → Project**, then import the repo.
- **Framework preset:** Other
- **Build command:** leave empty
- **Output directory:** leave as default

> Can't see the repo? Click **Adjust GitHub App Permissions** on the import screen and give Vercel access to it.

### 3. Environment variables
In the project, go to **Settings → Environment Variables** and add these. If you're moving from the three separate projects, copy the values across from them.

| Name | Used by | Value |
|---|---|---|
| `APP_CODE` | all | **Required for Home, recommended for all.** Your own access code: letters and numbers. Every request must carry it, so strangers can't use your home or your allowances. (The old `APP_KEY` still works if you haven't set this.) |
| `NABU_CASA_URL` | Home | Your Home Assistant address, e.g. `https://abcd1234.ui.nabu.casa` |
| `HA_TOKEN` | Home | A Home Assistant long-lived access token |
| `ANTHROPIC_API_KEY` | News | *Optional.* Turns on AI summaries and the briefing |
| `NEWS_MODEL` | News | *Optional.* Defaults to `claude-haiku-5-5` |
| `ORS_API_KEY` | Nav | openrouteservice / HEIGIT key: directions and search |
| `IDEAL_POSTCODES_KEY` | Nav | *Optional.* Ideal Postcodes key for house-number address search (pay as you go; see [Nav README](nav/README.md)) |
| `RAILDATA_API_KEY` | Nav | Rail Data Marketplace consumer key: trains |
| `RAILDATA_DEPARTURES_URL` | Nav | *Optional.* Only if your Live Departure Board address differs from the default |
| `TRANSPORTAPI_APP_ID` | Nav | TransportAPI app ID: buses |
| `TRANSPORTAPI_APP_KEY` | Nav | TransportAPI app key: buses |
| `BUS_REFRESH_SECONDS` | Nav | *Optional, paid bus plans only.* Turns on bus auto-refresh, e.g. `60` |

Where to get each key is in the app's own README ([Home](home/README.md), [News](news/README.md), [Nav](nav/README.md)).

Then **redeploy** (Deployments → ⋯ → Redeploy). Vercel only picks up variable changes on a new deployment.

### 4. Check it
Open `https://YOUR-PROJECT.vercel.app/api/status?c=YOUR-CODE`. It lists every variable (`"set": true` or `false`, never the value) and which apps are ready. Or just open `https://YOUR-PROJECT.vercel.app/?code=YOUR-CODE`: the launcher marks any app that still needs setup.

### 5. Add the apps to your glasses
In the Meta AI app, add each one as a web app. Add the code to the first one you open; the others share it.

```
https://YOUR-PROJECT.vercel.app/home/?code=YOUR-CODE
https://YOUR-PROJECT.vercel.app/news/
https://YOUR-PROJECT.vercel.app/nav/
https://YOUR-PROJECT.vercel.app/            (the launcher, optional)
```

**Keep the slash at the end of each folder** (`/home/`, not `/home`). The glasses look for an app's icon in the `.well-known` folder next to the address you give them, so without the slash they find the launcher's icon instead.

Use the main project address, not a preview link: preview links can ask for a Vercel login.

## The access code

- Set once as `APP_CODE` in Vercel. Every app sends it with every request, and the server functions refuse anything without it.
- On the glasses it's typed once, by opening any app with `?code=…` or by writing or speaking it on the lock screen. All the apps live at the same address, so they share it. It's removed from the address bar straight away.
- **Wrong or missing code:** the app shows a lock screen, where you can enter the code or pinch **Try demo**.
- **Change it:** update `APP_CODE` in Vercel and redeploy. Each app then shows the lock screen; enter the new code once (or use the launcher's **Code** tile).
- **Demo mode** (`?demo` on any address) uses sample data made on the glasses. It never contacts the server, so it costs nothing.

## Moving from three separate projects

1. Deploy this repo as a new Vercel project (steps 1–4 above), copying the variables across from the old projects. Use `APP_CODE` for the code; if Home and News used `APP_KEY`, you can reuse the same value as `APP_CODE`.
2. On the glasses, add the new addresses (step 5), check they work, then remove the old web apps.
3. Delete the old Vercel projects, or leave them until you're happy.

What changed for each app:
- **Home:** the server function is now `/api/home` (was `/api/ha`), and the code is `APP_CODE` and `?code=` (was `APP_KEY` and `?key=`; `?key=` still works). Key mapping moved to `KEYS` in `deck/deck.js`, shared by every app.
- **News:** uses the shared access code when `APP_CODE` is set. Its glasses icon now works: the old repo's manifest file was misspelt (`meta-wearables-maifest.json`), so the glasses never found it.
- **Nav:** the server functions moved to `/api/nav/…` (one function instead of seven). Without a code it now shows the lock screen with a **Try demo** button, rather than going straight into demo mode.

## Adding an app

Copy `starter/` to a new folder, add one line to `deck/apps.js`, and (if it needs a server) one file in `api/`. Step by step in [docs/NEW-APP.md](docs/NEW-APP.md); the shared toolkit is described in [deck/README.md](deck/README.md).

**Function budget:** Vercel's free Hobby plan allows 12 server functions per project, and each file in `api/` is one function (files in `api/_lib/` don't count). This repo uses 4: `home`, `news`, `nav/[op]` and `status`. Give each new app one file; if it needs several endpoints, use one `api/<app>/[op].js` router like Nav's.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Lock screen keeps coming back | The code on the glasses doesn't match `APP_CODE`, or the redeploy hasn't finished. Use the launcher's **Code** tile to enter it again |
| "Server setup incomplete: set APP_CODE" | Home won't run without an access code. Add `APP_CODE` and redeploy |
| An app shows the launcher's icon on the glasses | The address is missing its final slash. Remove the web app and add it again as `…/home/` |
| An app's icon doesn't update | Check `https://YOUR-PROJECT.vercel.app/home/.well-known/meta-wearables-manifest.json` opens, then remove and re-add the web app |
| An app address shows "404" | Add the final slash (`/news/`, not `/news`) |
| Launcher says "Needs setup" | Open `/api/status?c=YOUR-CODE` to see which variable is missing |
| A variable change has no effect | Redeploy: Vercel only reads variables on a new deployment |
| "No more than 12 Serverless Functions" when deploying | Too many files in `api/`. Merge an app's endpoints into one `[op].js` router, or move helpers into `api/_lib/` |

Each app's README has its own troubleshooting table too.

## Disclaimer

An independent hobby project. Not affiliated with or endorsed by Meta, Home Assistant / Nabu Casa, Samsung, Anthropic, HEIGIT, Rail Delivery Group, National Rail, TransportAPI, Traveline, Vercel, the BBC, the Guardian or any other news source. Use at your own risk: you're responsible for the security of your own home setup. Directions are a guide only: always follow road signs, crossings and local conditions. Map data © OpenStreetMap contributors. Train data: National Rail Enquiries. Bus data: Traveline NextBuses via TransportAPI. News content belongs to its publishers.
