# News Deck

Glanceable news for **Meta Ray-Ban Display** glasses. Headlines from RSS feeds (BBC, Guardian, Surrey Live, gaming and tech sites…), short **AI summaries**, and a **spoken briefing** through the glasses speaker. Built for the Display's 600×600 screen and the Neural Band.

- **Sections as tabs:** Top, UK, Surrey, World, Tech and Gaming out of the box, and easy to change
- **AI summaries:** one or two sentences per story, plus a 30-second audio round-up
- **Works without AI too:** if no API key is set, it uses each outlet's own one-line description
- **Offline-friendly:** shows the last news it loaded if you lose signal
- **Your AI key stays on the server**, and the shared access code stops strangers spending your credit

| Headlines | Story |
|---|---|
| ![Headlines](../docs/news/headlines.png) | ![Story view](../docs/news/story.png) |

---

## Setup

News Deck is part of the Deck hub: setup, environment variables and the glasses address are in the [main README](../README.md).

**AI summaries (optional, recommended):**
1. At [console.anthropic.com](https://console.anthropic.com), create an account, add a little credit under **Billing**, and set a monthly spending limit under **Limits**.
2. Under **API Keys**, create a normal **API key**. Don't use an Admin key.
3. In Vercel, add `ANTHROPIC_API_KEY` (and optionally `NEWS_MODEL`, which defaults to `claude-haiku-5-5`), then redeploy.

Without the key, News uses each outlet's own one-line description. When `APP_CODE` is set, every request needs it, and requests with any other extra parameters are refused, so nobody can bypass the cache to trigger repeated AI calls.

**Check it:** open `https://YOUR-PROJECT.vercel.app/api/news?section=top&c=YOUR-CODE`. Look for `"ai":true` (summaries working) and `"failed":[]` (every feed loaded).

Glasses address: `https://YOUR-PROJECT.vercel.app/news/` (with the slash at the end).

## Using it

| Gesture | Where | Action |
|---|---|---|
| Swipe up / down | Headlines | Move through stories |
| Swipe left / right | Headlines | Previous / next section |
| Pinch | Headline | Open the story |
| Pinch | Listen to briefing | Hear a spoken round-up of the section |
| Pinch | Next / Prev | Page through stories without going back |
| Pinch | Listen | Hear the current story |
| Back | Anywhere | Return to the headlines |

Add `?demo` to the address (or pinch **Try demo** on the lock screen) to see sample stories without any setup.

---

## Adding your own topics and feeds

Everything lives in the **`SECTIONS` list at the top of `api/news.js`**. That's the only file you need to edit: the tabs on the glasses update themselves from it.

Each section looks like this:

```js
gaming: {
  tab: 'Gaming',     // text on the tab (keep it short, about 8 characters)
  label: 'Gaming',   // title at the top of the screen, also used in the briefing
  feeds: [
    ['Guardian Games', 'https://www.theguardian.com/games/rss'],
    ['Eurogamer', 'https://www.eurogamer.net/feed'],
  ],
},
```

- **The key** (`gaming` above) is a short id: lowercase letters, no spaces.
- **Each feed** is `['Name shown on the card', 'RSS feed address']`. Add as many as you like; the app takes the newest stories from each in turn, so one site can't crowd out the others, and removes duplicates.
- **Order:** tabs appear in the order sections are listed. Move a block up or down to reorder.
- **Removing** a section: delete its block. The tab disappears from the glasses automatically.

### Example: add a Football section
Add this inside `SECTIONS`, after the last section:

```js
football: {
  tab: 'Football',
  label: 'Football',
  feeds: [
    ['BBC Sport', 'https://feeds.bbci.co.uk/sport/football/rss.xml'],
    ['Guardian', 'https://www.theguardian.com/football/rss'],
  ],
},
```

Commit the change. Vercel redeploys, and the new tab appears next time the app loads news.

### Finding RSS feeds
- **BBC:** most sections have a feed at `https://feeds.bbci.co.uk/news/<section>/rss.xml`, e.g. `technology`, `science_and_environment`, `business`, `england/surrey`. Sport is at `https://feeds.bbci.co.uk/sport/<sport>/rss.xml`.
- **Guardian:** add `/rss` to almost any section page, e.g. `https://www.theguardian.com/games/rss`.
- **Other sites:** look for an RSS icon or a "Feeds" link, or try adding `/feed`, `/feed/` or `/rss` to the site's address. Sites built on WordPress almost always have `/feed/`.
- **To test a feed:** open its address in a browser. A page of text starting with `<rss` or `<?xml` (or a "subscribe to this feed" page) means it works.

### Ideas
| Topic | Feeds to try |
|---|---|
| Gaming | Guardian Games, Eurogamer, VGC, Rock Paper Shotgun, Nintendo Life, Push Square |
| Tech | BBC Technology, Guardian Technology, The Verge, Ars Technica |
| Science | BBC Science & Environment, Guardian Science, New Scientist |
| Local | BBC's regional feeds (`england/<county>`), your local paper's RSS |

### Limits
- **Stories per section:** 8 (set by `MAX_STORIES` in `api/news.js`).
- **Tabs:** six fit on screen. With more, the tab row scrolls sideways as you move along it.
- **Slow feeds** are skipped after 6 seconds, so one slow site never holds up the rest.

---

## How it works

- `api/news.js` runs on Vercel. It fetches the feeds, merges them, asks Claude for summaries and the briefing, and returns everything to the app.
- **Caching:** results are cached for **15 minutes** at Vercel's edge, so the feeds and the AI are used at most four times an hour per section, however many times the app opens. The AI cost is a few pence a day at most, and your spending limit caps it.
- **Accuracy:** summaries are written only from each outlet's own headline and standfirst. The AI is told not to add facts, but summaries can still be imperfect, so check the original before relying on a story.
- **Copyright:** the app shows short summaries and credits each source. It never copies full articles.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `"ai":false` | `ANTHROPIC_API_KEY` missing or misnamed, or no redeploy since adding it. Check Vercel **Logs** for a "Summary failed…" line, which shows what went wrong |
| A name in `"failed"` | That feed is down or its address has changed. Open the address in a browser to check |
| "Couldn't load the news feeds" | Every feed in that section failed. Check the addresses |
| New section doesn't appear | Make sure the change is committed and deployed, then reopen the app. The tab list refreshes when news loads |
| Lock screen appears | `APP_CODE` is set and these glasses don't have it yet, or it's wrong. Write or speak it on the lock screen |
| Checking `/api/news` in a browser says "Access code needed" | Add `&c=YOUR-CODE` to the address |
| Briefing is silent | Check the glasses' volume. Speech uses the Display's built-in text-to-speech |

## Disclaimer

An independent hobby project. Not affiliated with or endorsed by Meta, Anthropic, Vercel, the BBC, the Guardian or any other news source. News content belongs to its publishers.
