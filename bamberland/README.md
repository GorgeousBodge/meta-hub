# Bamberland

A cosy turn-based adventure for the glasses. Bodge steps one tile per swipe, and the world takes its turn after each of his actions, so nothing needs quick reflexes or held buttons.

Add it to the glasses as `…/bamberland/` (keep the final slash).

This is the **engine upgrade** (build chat 2). What's playable: the opening cut scene, Bamber village, the Queen's Wood and the Hollow Oak glade (in the gloom), Kev's shop, Brendan's brambles, Telkperson, Millbrook Vale and the whole Sunk Mill, ending with its Sunstone, which brings the vale's colour back.

## Controls

| Input | In play | Item ring | Shop | Map | Dialogue and cut scenes |
|---|---|---|---|---|---|
| Swipe (arrow keys) | Step one tile and face that way. Into a wall or object: just turn | Choose a slot | Choose an elixir | Change page | — |
| Pinch (Enter) | Act on the tile Bodge faces | Equip, drink or do the action | Buy | Close | Next page |
| Back (Escape) | Open the item ring | Close | Leave | Close | Close / skip |

What a pinch does depends on what Bodge faces. The hint bar always shows it: **talk**, **read**, **open**, **lift** and **throw**, **push**, **light**, **unlock**, or use the equipped item (the **Thwacker** strikes; the **Hopstaff** vaults two tiles).

The item ring holds the Thwacker and Hopstaff, any elixirs Bodge carries (drinking one takes no turn), the **Map**, **Reset room**, **Music**, **Sound** and **Save & quit**.

## Starting a game

- **Title:** Continue (the slot you played last), Save slots, Music, Sound.
- **Save slots:** three, so friends can share a pair of glasses. Pinch an empty slot for a new game, a full one to carry on. **Erase a slot** asks twice.
- **Naming:** before a new game, anyone can be renamed: Bodge, Queen Alison, Tori, Brendan, Kev, Lauri and Telkperson. Pinch a name and a text box opens; the glasses bring up their own handwriting or dictation. Enter keeps the new name, Back keeps the old one. The defaults are the friends' real names.
- **The Mill prototype's save** (`bamberland.save`) can't be used by this version. The slot screen says so, and it's cleared when you start a new game.

The game saves itself on every room change, after chests, keys, shopping and talk that changes the story, and when a room is solved. Saves live in `bamberland.slot1` to `bamberland.slot3`; settings in `bamberland.music` and `bamberland.sound`. Each save has a version number. A newer game that changes the format upgrades old saves in `migrate()` in `engine/core.js`, or says clearly that it can't.

If Bodge runs out of hearts, he wakes at the doorway he last came through, with full hearts. Nothing he found is lost.

**How Back works on the glasses.** The Back gesture isn't sent to the page as a key. The glasses step back through the page's history, and with nothing left, they leave the app. So off the title screen, the game keeps one spare history entry: Back uses it up, the game handles it, then adds a new one. On a computer, Escape does the same. On the title screen, Back returns to the hub.

## Files

| Folder / file | What it holds | Edit it to… |
|---|---|---|
| `data/lore.js` | Names, items, Kev's elixirs and prices, the money's name, pickups, boss lines, short messages | rename things, write lines, change prices |
| `data/art.js` | Every picture as a text grid, one letter per pixel, plus the palette | draw sprites, tiles, buildings, portraits |
| `data/music.js` | The tunes, as notes | write or change a tune |
| `data/cutscenes.js` | The cut scenes, panel by panel | write a cut scene |
| `world/regions.js` | Regions, map pages, shops, Telkperson's visits | add a region, stock a shop, add a Telkperson visit |
| `world/wood.js`, `world/mill.js` | The rooms, one file per region | design rooms |
| `engine/core.js` | Rules, turns, saves, rooms, Bodge's actions | (rarely) |
| `engine/foes.js` | Bristlehog, Spindlewisp, Mimmet, embers, the boss | add an enemy |
| `engine/town.js` | Talk that follows the story, the shop, Telkperson, the map | (rarely) |
| `ui/pixel.js` | Pixel drawing: tones, ground, sprites | |
| `ui/render.js` | The room, ring, shop and map pictures | add a ring icon |
| `ui/audio.js` | Sound effects and the music player | add a sound effect |
| `ui/cutscene.js` | The cut-scene player | |
| `ui/screens.js` | Title, slots, naming, play, ring, shop, map, dialogue, Back | |
| `bamberland.css` | HUD, title, slots, naming, dialogue | |
| `.well-known/` | The glasses icon (`bamberland-icon.svg`) and its manifest | |
| `looktest/` | The chat 1 look test, unchanged | |
| `test/` | Checks you can run on a computer (optional, not needed on the site) | |

## Design an outdoor screen

Outdoor screens have `kind: 'field'` and their own ground letters. The legend is at the top of `world/wood.js`:

```js
pond: {
  name: 'Duck Pond',
  kind: 'field',
  at: [1, 1],                       // its square on the map
  exits: { w: 'village' },
  map: [
    'TTTTTTTTTTTTTTT',
    ':::::::::.....T',              // a path out of the west edge
    // …12 rows of 15
  ],
  buildings: [{ art: 'cottage', x: 9, y: 2 }],   // 2×2 tiles, solid
  signs: ['Do not feed the ducks.'],
},
```

`.` grass, `,` flowers, `:` path, `T` tree, `*` bush, `f` fence, `~` water, `%` brambles. People (`N`), signs (`=`), chests (`C`), pots (`P`) and `$` (a pocket of 5 Sunpennies) work as in dungeons.

**Brambles** (`%`) stay solid until the story flag named in the room's `thorns` is set.

**Tone.** Until a region's Sunstone comes back, its outdoor screens are drawn in the gloom (sparse floor, cool and dim). Afterwards they're restored (filled floor, full colour), as chosen in the look test.

## Design a dungeon room

Same as before; the legend is at the top of `world/mill.js`. Add `page` and `at` so it appears on the map. Chests can now also hold `coins:10` or an elixir (`tonic`). Beating a boss leaves a heart vessel and the region's Sunstone.

**Exits** work the same in both kinds of room: leave a gap in the edge, name the room next door, line the gaps up on both sides. A `D` or `B` locked doorway goes on one side only; an `S` opens when the room is solved.

## People, the story and the shop

Talk can change with the story. Each person can have several options, and the first one that applies is used:

```js
{ who: 'brendan', face: 'right', say: [
  { if: 'brambles', lines: ['Brambles are down.'] },
  { has: 'fizz', take: 'fizz', set: 'brambles', lines: ['A Fizzwhistle! …'] },
  { lines: ['Fetch me a Fizzwhistle from {kev}.'] },
] },
```

- `if` / `unless`: story flags. `has` / `take`: an elixir in Bodge's bag.
- `set`: turns a story flag on. `give`: `'coins:5'`, `'tonic'`, `'key'`, `'heart'`, `'container'`, or an item.
- `shop: 'kev'` opens that shop after the lines. `cut: 'id'` plays a cut scene.

People are listed in `data/lore.js` with a `sprite` (drawn in the world) and optionally a `portrait` (shown in dialogue). Without a portrait, dialogue shows their sprite large. Only Lauri has a portrait so far; send a photo for each friend and they get one too.

**Shops** are in `world/regions.js`: `shops: { kev: ['tonic', 'brew', 'fizz'] }`. Prices and effects are in `data/lore.js` under `elixirs`. Bodge carries at most 3 of each.

**Telkperson** pops up when Bodge walks into a room, once per visit, if its conditions apply. Each visit can leave a hint for the map, give something and set a flag. They're listed in `world/regions.js`.

## Music and cut scenes

Each tune in `data/music.js` is a melody, one chord per bar, a speed and a time signature. Rooms choose one with `music: 'town'`; outdoor screens default to their region's tune and dungeons to `dungeon`. Music and sound effects have separate switches (title screen and item ring), and both start off. Music stops while the glasses' screen is off.

Cut scenes in `data/cutscenes.js` are panels with a line of text, a ground (a little map, in day or gloom, or fading between them) and layers of pictures that can glide, swoop, hop, fade, look dazed or glow. `opening` plays at New game and `sunstone` whenever a Sunstone is found; a room plays one on its first visit with `cut: 'id'`. Pinch moves on, Back skips. A panel moves for its `dur` seconds, then holds still to save battery.

## Check the game before you commit (optional)

The `test/` scripts run on a computer with Node, from the `bamberland` folder:

- `node test/maps.js` checks every room: sizes, letters, exits lining up both ways, signs and chests matching their lists, story flags that are used but never set, unknown names, tunes adding up, cut scenes pointing at real art.
- `node test/play.js` plays the whole demo from New game to the Sunstone, with path-finding and simple fight tactics, and checks shopping, Telkperson, the map and save and load on the way.

The site doesn't need them, so you don't have to upload them.

## Add an enemy

1. **`data/lore.js`:** a name under `enemies`, e.g. `mole: { name: 'Burrowmole', tip: '…' }`.
2. **`engine/core.js`:** its map letter in `ENEMY_CHARS` (e.g. `r: 'mole'`) and its health in `ENEMY_HP`.
3. **`engine/foes.js`:** write `X.turn.mole = (e, ctx) => { … }`. It runs once per world turn; `ctx.moved` is the direction Bodge stepped. Use `X.hurt(n)` (in half-hearts) and check `X.enemyCanStand(x, y, e)` before moving.
4. **`ui/render.js`:** a branch in `drawEnemy` for `e.type === 'mole'`.
5. Add the letter to the legend at the top of the region file.

## Add an item

1. **`data/lore.js`:** under `items`, with `name`, `desc` and `found`.
2. **A region file:** put it in a chest: `chests: ['lantern']`.
3. **`ui/screens.js`:** in `openRing()`, add the id to `['thwacker', 'hopstaff']`.
4. **`engine/core.js`:** in `pinch()`, before `return swing();`, add `if (G.equip === 'lantern') return useLantern();` and write it (call `world({})` if it takes a turn).
5. **`ui/render.js`:** its ring icon in `drawRingIcon`; **`ui/screens.js`:** its HUD icon in `ICONS`.
