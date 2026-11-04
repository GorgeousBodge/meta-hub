[README.md](https://github.com/user-attachments/files/34385128/README.1.md)
# Bamberland

A small turn-based adventure for the glasses. Bodge steps one tile per swipe, and the world takes its turn after each of his actions, so nothing needs quick reflexes or held buttons.

Add it to the glasses as `…/bamberland/index.html`.

## Controls

| Input | In play | In the item ring | In dialogue |
|---|---|---|---|
| Swipe (arrow keys) | Step one tile and face that way. Into a wall or object: just turn | Choose a slot | — |
| Pinch (Enter) | Act on the tile Bodge faces | Equip, or do the action | Next page |
| Back (Escape) | Open the item ring | Close the ring | Close |

What a pinch does depends on what Bodge faces. The hint bar always shows it:

- **Talk** to a person, **read** a sign, **open** a chest
- **Lift** a pot, then pinch again to **throw** it (up to 4 tiles)
- **Push** a block one tile
- **Light** a brazier, **unlock** a door (if you hold the key)
- Otherwise, use the equipped item:
  - The **Thwacker** strikes and knocks a foe back one tile. Swinging at nothing still passes a turn, so it doubles as "wait".
  - The **Hopstaff** vaults two tiles, over a gap, a pot, a block or a foe.

The item ring also has **Reset room** (puts the room back as it was when you came in), **Sound** and **Save & quit**.

Back on the title screen returns to the hub.

**How Back works on the glasses.** The Back gesture isn't sent to the page as a key. The glasses step back through the page's history, and with nothing left, they leave the app. So once you start playing, the game adds one spare history entry. Back uses it up, the game handles it (ring, dialogue), and then adds a new one. On a computer, Escape does the same job. On the title screen there's no spare entry, so Back leaves as usual. The game saves itself every time you change room, after every chest and key, and when a room is solved. The save is stored as `bamberland.save`, and the sound setting as `bamberland.sound`.

If Bodge runs out of hearts, he wakes at the doorway he last came through, with full hearts. Nothing he found is lost.

## Files

| File | What it holds |
|---|---|
| `rooms.js` | Every room as a text map, plus its exits, signs, dialogue and chest contents |
| `lore.js` | Names, item descriptions, title, opening, boss and ending text |
| `game.js` | The engine (rules and turns) and the screens. No content |
| `render.js` | All drawing |
| `bamberland.css` | HUD, title, dialogue and overlay styles |
| `icon.svg`, `.well-known/meta-wearables-manifest.json` | The glasses icon |

## Design a room

Open `rooms.js`. The legend is at the top. A room is 15 characters wide and 12 rows tall:

```js
myroom: {
  name: 'Root Cellar',               // shown when you walk in
  exits: { s: 'hall', e: 'cellar2' },
  solve: 'plates',                   // optional: 'plates' | 'braziers' | 'enemies' | 'boss'
  map: [
    '#######S#######',
    '#.............#',
    '#..O......_...#',
    // …12 rows in all
    '#######.#######',
  ],
  signs: ['Push the block onto the plate.'],
  chests: ['key'],
},
```

**Exits.** Leave a gap in the outer wall where you want a doorway. Bodge comes out on the matching edge of the next room, in the same column (for north and south exits) or the same row (for east and west exits), so put the gaps in the same place on both sides. The other room needs an exit back.

- A `D` or `B` in the gap makes it a locked doorway. Put it on one side only.
- An `S` anywhere in the room opens when the room's `solve` condition is met, and stays open for good.

**Signs, people and chests** take their text or contents from the room's `signs`, `talk` and `chests` lists. They are matched to the map in reading order: left to right, then top to bottom.

- Chests can hold: `key`, `bigkey`, `hopstaff`, `heart` or `container` (a heart vessel).
- Talk entries name a person from `lore.js`: `{ who: 'nettle', lines: ['…', '…'] }`.

**Text** can use `{hero}`, `{weapon}`, `{item}`, `{boss}`, `{dungeon}`, `{world}`, or any enemy or person id. The current name is swapped in, so renaming in `lore.js` updates every room.

**Braziers** stay lit for `burn` turns (default 10). For a `braziers` room, all of them must be burning at once.

**Keys:** each small key is used up by one `D`. Make sure a player can't spend a key on a door that strands them: either give one key per door in order, or keep later doors behind the item.

To try your changes, commit, wait for Vercel, and open the game. Start a New game, or use Reset room to reload a room you're standing in.

### Check a room before you commit (optional)

The `test/` scripts that came with this build play the whole dungeon automatically. You can run them on a computer with Node (`node test/maps.js`, then `node test/solve.js`). The site doesn't need them, so you don't have to upload them to the repo.

## Add an enemy

1. **`lore.js`:** add a name under `enemies`, e.g. `mole: { name: 'Burrowmole', tip: '…' }`.
2. **`game.js`:**
   - Add its map letter to `ENEMY_CHARS`, e.g. `r: 'mole'`.
   - Add its health to `ENEMY_HP`.
   - Write a `moleTurn(e, ctx)` next to `hogTurn`. It runs once per world turn. `ctx.moved` is the direction Bodge stepped, or `undefined` if he didn't move.
   - Call `moleTurn` in `world()`.
   - Use `hurt(n)` to damage Bodge (in half-hearts), and `enemyCanStand(x, y, e)` before moving the enemy.
3. **`render.js`:** add a branch to `drawEnemy` for `e.type === 'mole'`.
4. Add the letter to the legend at the top of `rooms.js`.

## Add an item

1. **`lore.js`:** add it under `items`, with `name`, `desc` and `found` text. The id is its key, e.g. `lantern`.
2. **`rooms.js`:** put it in a chest: `chests: ['lantern']`. Opening that chest gives it to Bodge.
3. **`game.js`:**
   - In `openRing()`, add the id to the list `['thwacker', 'hopstaff']` so it appears in the ring.
   - In `pinch()`, before `return swing();`, add `if (G.equip === 'lantern') return useLantern();`, and write that function.
   - It should call `world({})` if using it takes a turn.
4. **`render.js`:** draw its ring icon in `drawRingIcon`.
5. **`game.js`:** add its HUD icon to `ICONS`.
