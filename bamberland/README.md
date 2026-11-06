# Bamberland

A cosy turn-based adventure for the glasses. Bodge steps one tile per swipe, and the world takes its turn after each of his actions, so nothing needs quick reflexes or held buttons.

This is **build chat 4**: Millbrook Vale. What's playable, in story order:

1. The opening cut scene, then Bamber village and the Queen's Wood, in the gloom.
2. Kev's shop, and Brendan's brambles (he wants a King's Kebab).
3. **The Hollow Oak**, through the door in the great oak's trunk: six rooms, the Hopstaff, and **the Thornmother**. Her Sunstone brings the wood's colour back.
4. Brendan reforges the Thwacker into the **Sunbright Thwacker** (twice as hard), the brambles on the west road wither, and he sets off for the river.
5. **Millbrook Vale**. At the crossing south of the vale the bridge is out. Brendan could build another from the old timbers in the Sunk Mill, but they're wedged tight while the mill wheel is stuck.
6. **The Sunk Mill**: ten rooms round the Wheel Pit, the **Grapple Line**, and **the Kilnwarden**. Its Sunstone turns the wheel again; Telkperson carries the timber to Brendan, who builds the bridge and reforges the Thwacker into the **Millstone Thwacker** (three times as hard). Over the bridge: "The road goes on (next update)."


On the glasses, add it as `…/bamberland/index.html`. The glasses don't accept an address ending in `/`.

## Controls

| Input | In play | Item ring | Shop | Map | Dialogue and cut scenes |
|---|---|---|---|---|---|
| Swipe (arrow keys) | Step one tile and face that way. Into a wall or object: just turn | Choose a slot | Choose an elixir | Change page | — |
| Pinch (Enter) | Act on the tile Bodge faces | Equip, drink or do the action | Buy | Close | Next page |
| Back (Escape) | Open the item ring | Close | Leave | Close | Close / skip |

What a pinch does depends on what Bodge faces. The hint bar always shows it: **talk**, **read**, **open**, **lift** and **throw**, **push**, **light**, **pull**, **unlock**, or use the equipped item (the **Thwacker** strikes; the **Hopstaff** vaults two tiles; the **Grapple Line** hooks).

The item ring holds the Thwacker, Hopstaff and Grapple Line, any elixirs Bodge carries (drinking one takes no turn), the **Map**, **Reset room**, **Music**, **Sound** and **Save & quit**.

## Starting a game

- **Title:** Continue (the slot you played last), Save slots, Music, Sound.
- **Save slots:** three, so friends can share a pair of glasses. Pinch an empty slot for a new game, a full one to carry on. **Erase a slot** asks twice.
- **Naming:** before a new game, anyone can be renamed: Bodge, Queen Alison, Tori, Brendan, Kev, Lauri and Telkperson. Pinch a name and a text box opens; the glasses bring up their own handwriting or dictation. Enter keeps the new name, Back keeps the old one. The defaults are the friends' real names.
- **The Mill prototype's save** (`bamberland.save`) can't be used by this version. The slot screen says so, and it's cleared when you start a new game.
- **Saves from chat 3 and the balance pass** (save version 2) are upgraded to version 3 when loaded. The Sunk Mill was rebuilt, so a save inside the old Mill wakes in Millbrook Vale with everything Bodge found, and the new Mill starts fresh. A save that had already beaten the old Mill counts it as beaten in the new one too, with the Grapple Line, so no Sunstone or heart is earned twice.

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
| `world/wood.js`, `world/oak.js`, `world/mill.js` | The rooms: the wood, the Hollow Oak, the vale, the crossing and the Sunk Mill | design rooms |
| `engine/core.js` | Rules, turns, saves, rooms, Bodge's actions | (rarely) |
| `engine/foes.js` | Bristlehog, Spindlewisp, Mimmet, embers, the Thornmother and the Kilnwarden | add an enemy |
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

`.` grass, `,` flowers, `:` path, `T` tree, `*` bush, `f` fence, `~` water, `%` brambles, `B` a bridge. People (`N`), signs (`=`), chests (`C`), pots (`P`) and `$` (a pocket of 5 Luftballons) work as in dungeons.

**Doors** lead into buildings or caves. `doors: [{ at: [7, 3], to: 'oakroot', x: 7, y: 10, face: 'up' }]` makes tile 7, 3 a door: stepping onto it takes Bodge to `oakroot`, at 7, 10, facing up. It works even on a building's tile. To come back out, give the room inside an exit to a set spot: `exits: { s: { to: 'glade', x: 7, y: 4, face: 'down' } }`.

**Brambles** (`%`) stay solid until the story flag named in the room's `thorns` is set.

**Bridges** (`B`) are broken, over water, until the story flag named in the room's `bridge` is set (`bridge: 'bridge'` at Millbrook Crossing).

**People who come and go.** `here: { if: 'flag' }` or `here: { unless: 'flag' }` on someone in `talk` means they only stand there at that point in the story. Brendan leaves the village once he's reforged the Thwacker (`unless: 'forged1'`) and turns up at the crossing (`if: 'forged1'`).

**Tone.** Until a region's Sunstone comes back, its outdoor screens are drawn in the gloom (sparse floor, cool and dim). Afterwards they're restored (filled floor, full colour), as chosen in the look test.

## Design a dungeon room

The legend is at the top of `world/mill.js`. Add `page` and `at` so a room appears on the map. Chests can also hold `coins:10` or an elixir (`tonic`).

- `%` **thorns** can't be walked through, but can be vaulted with the Hopstaff, like a gap.
- `I` a **post**. The Grapple Line hooks it and pulls Bodge to the tile just in front of it, so give every post a floor tile on the side he comes from. Gaps in the Mill are three or more tiles wide, too far for the Hopstaff, so posts are the way over. Give each crossing a post on both sides, so Bodge can get back.
- `!` a **lever**. Pinch it by hand, or yank it from up to five tiles away with the Grapple Line. `solve: 'levers'` opens the room once every lever is down; `spring: 7` makes them spring back after 7 turns, so they have to be pulled quickly.
- `G` a **sluice gate**: too heavy by hand; the Grapple Line yanks it open for good.
- `*` **machinery** (solid, drawn by the room) and `wheel: [x, y]` draw the great mill wheel over it.
- `1` `2` `3` **machinery gates**. Gate *n* opens once the story flag `stages[n − 1]` is set. A room's `sets: 'flag'` turns a flag on when the room is solved: the Sluice Room sets `mill_sluice` (gate 1 in the Wheel Pit), the Gear Loft sets `mill_gears` (gate 2).

**The Grapple Line** reaches five tiles (`GRAPPLE_RANGE` in `engine/core.js`) over floor, gaps and thorns. It stops at the first thing it meets: a post pulls Bodge over; a block slides along the floor towards him (never over a gap), so it can come out of a nook you can't push it from; a pot flies over gaps into his hands; a lever or sluice gate is yanked. Walls, chests, signs, braziers and foes stop it.

**Keys** belong to their dungeon. A small key or the big key from the Hollow Oak stays with the Hollow Oak (`G.keyring` in a save), and the HUD shows the keys for the dungeon Bodge is in.

A region's dungeons can have their own wall colour: `tint: '#7fdc5a'` in `world/regions.js`. That gives the Hollow Oak its green.

**Bosses.** Put a 2×2 square of `Z` on the map, `solve: 'boss'`, and name the boss: `boss: 'thorn'` or `boss: 'kiln'`. Their names, intro and defeat lines are under `bosses` in `data/lore.js`. Beating a boss leaves a heart vessel and the region's Sunstone, which brings its colour back and plays the cut scene named by the region's `cut`.

- **The Thornmother** (`thorn`) marks Bodge's row or column, alternately. Next turn, roots burst up along it, for two hearts if he's still there. After two waves (three on her last heart), her heart opens for a few turns. Strike it from inside her ring of thorns, which means vaulting in. Each hit throws Bodge back out. Three hits win.
- **The Kilnwarden** (`kiln`), in the Kiln Heart. Each round it **belches** embers out of its sides (along its rows at first, down its columns once hit, both ways on its last heart), **marks** Bodge's tile and the four corners round it, then **slams**: marked tiles crack, and Bodge is hurt if he's on one. Then the two **cooling vents on the side facing Bodge glow**. Line up with one and throw the Grapple Line at it to yank it open; once it's been hit, both vents on that side are needed. With its vents open the core **cools**: vault the moat with the Hopstaff and strike. Each hit throws Bodge back out. Three hits win. Miss the vents and it starts again, still hot. Its numbers (`KILN_VENT`, `KILN_VENTS`, `KILN_BELCH`, `BOSS_COOL`, `CRACK_TURNS`) are at the top of `engine/foes.js`.

**Reforging.** A talk option with `forge: 1` has the Thwacker reforged to level 1: a new name and description from `forged` in `data/lore.js`, and one extra point of damage per level. Brendan does level 1 in the village (the Sunbright Thwacker) and level 2 at the crossing (the Millstone Thwacker). Bosses still take one hit at a time.

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

People are listed in `data/lore.js` with a `sprite` (drawn in the world) and optionally a `portrait` (shown in dialogue). Without a portrait, dialogue shows their sprite large. Every friend has one now; Nettle, the sluice keeper, is drawn in line art instead.

**Shops** are in `world/regions.js`: `shops: { kev: ['tonic', 'brew', 'fizz', 'kebab'] }`. Prices and effects are in `data/lore.js` under `elixirs`, which also holds non-drinks like the King's Kebab. Bodge carries at most 3 of each.

**Kev's roof.** Every Luftballon spent goes on Kev's roof, shown in his shop as "On the roof: N / 99". `spendGoal: { at: 99, set: 'balloons99', cut: 'kev99' }` in `world/regions.js` sets the `balloons99` story flag and plays the `kev99` cut scene once. In it, Kev dances, the shop floats off and comes back with all 99 balloons. Afterwards the village shop is drawn with them, using `swap: { if: 'balloons99', art: 'shop99' }` on the building, and Kev has a new line. The tune is an original, `kev` in `data/music.js`.

**Telkperson** pops up when Bodge walks into a room, once per visit, if its conditions apply. Each visit can leave a hint for the map, give something and set a flag. They're listed in `world/regions.js`.

## Music and cut scenes

Each tune in `data/music.js` is a melody, one chord per bar, a speed and a time signature. Rooms choose one with `music: 'town'`; outdoor screens default to their region's tune and dungeons to `dungeon`. Music and sound effects have separate switches (title screen and item ring), and both start off. Music stops while the glasses' screen is off.

Tunes can also set `lead: 'square'` for a brighter melody and `bass: 'octaves'` for a bouncing bass, as in Kev's tune.

Cut scenes in `data/cutscenes.js` are panels with a line of text, a ground (a little map, in day or gloom, or fading between them) and layers of pictures that can glide, swoop, hop, fade, look dazed or glow. `opening` plays at New game and `sunstone` whenever a Sunstone is found; a room plays one on its first visit with `cut: 'id'`. Pinch moves on, Back skips. A panel moves for its `dur` seconds, then holds still to save battery.

## Check the game before you commit (optional)

The `test/` scripts run on a computer with Node, from the `bamberland` folder:

- `node test/maps.js` checks every room: sizes, letters, exits lining up both ways, signs and chests matching their lists, story flags that are used but never set, unknown names, tunes adding up, cut scenes pointing at real art. It also catches a typo that stops a file loading, like an apostrophe inside single quotes.
- `node test/play.js` plays the whole demo from New game to the bridge over Millbrook, with path-finding, hooks, vaults and simple fight tactics (including the Kilnwarden's vents), and checks shopping, Telkperson, the map, save and load, and upgrading saves from the last version on the way.

The site doesn't need them, so you don't have to upload them.

## Tune the difficulty

Everything that sets how hard the game is lives in a few numbers:

| What | Where | Now |
|---|---|---|
| How hard each foe hits, in half-hearts | `DAMAGE` at the top of `engine/foes.js` | hog charge 3, Mimmet 2, ember 1, boss attacks 3 |
| How often pots and foes drop something | `DROP_EVERY` at the top of `engine/core.js` | every 3rd |
| When a drop is a heart rather than a Luftballon | `DROP_HEART_BELOW` (same place) | when Bodge is missing a whole heart or more |
| Foes' health | `ENEMY_HP` in `engine/core.js` | hog 2, wisp 1, Mimmet 2 |
| The Kilnwarden | top of `engine/foes.js` | vents glow for 3, 5, 5 turns; 1, 2, 2 vents to open; core cool for 4, 4, 3 turns |
| How long levers stay down | `spring` on the room | Gear Loft: 7 turns |
| The Grapple Line's reach | `GRAPPLE_RANGE` in `engine/core.js` | 5 tiles |
| Starting hearts | `START_HEARTS` in `engine/core.js` | 6 (three hearts) |
| Prices | `elixirs` in `data/lore.js` | |
| Where foes and Luftballons are | the room maps (`h`, `w`, `m`, `$`) | |

A heart vessel adds one heart, already filled, but doesn't refill the others. A Sunstone refills them all. Foes outside dungeons come back each time Bodge walks into a screen; there are none in villages.

## Add an enemy

1. **`data/lore.js`:** a name under `enemies`, e.g. `mole: { name: 'Burrowmole', tip: '…' }`.
2. **`engine/core.js`:** its map letter in `ENEMY_CHARS` (e.g. `r: 'mole'`) and its health in `ENEMY_HP`.
3. **`engine/foes.js`:** write `X.turn.mole = (e, ctx) => { … }`. It runs once per world turn; `ctx.moved` is the direction Bodge stepped. Use `X.hurt(n)` (in half-hearts) and check `X.enemyCanStand(x, y, e)` before moving.
4. **`ui/render.js`:** a branch in `drawEnemy` for `e.type === 'mole'`.
5. Add the letter to the legend at the top of the region file.

## Add an item

1. **`data/lore.js`:** under `items`, with `name`, `desc` and `found`.
2. **A region file:** put it in a chest: `chests: ['lantern']`.
3. **`ui/screens.js`:** in `openRing()`, add the id to `['thwacker', 'hopstaff', 'grapple']`.
4. **`engine/core.js`:** in `pinch()`, before `return swing();`, add `if (G.equip === 'lantern') return useLantern();` and write it (call `world({})` if it takes a turn).
5. **`ui/render.js`:** its ring icon in `drawRingIcon`; **`ui/screens.js`:** its HUD icon in `ICONS`.
