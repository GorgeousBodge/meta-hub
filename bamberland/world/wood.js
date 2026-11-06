/* ==========================================================================
   Region 1 — the Queen's Wood: Bamber village and the wood around it.

   OUTDOOR SCREENS (kind: 'field') use their own ground letters:
     .  grass        ,  flowers      :  path
     T  tree         *  bush         f  fence      ~  water
     %  brambles (solid until the room's "thorns" story flag is set)

   doors: [{ at: [7, 3], to: 'oakroot', x: 7, y: 10, face: 'up' }] makes a
   tile (usually in a building) a way into another room: stepping onto it
   takes Bodge there. On the other side, an exit can lead back to a set
   spot: exits: { s: { to: 'glade', x: 7, y: 4, face: 'down' } }.
   and the same objects as dungeons: N person, = sign, C chest, P pot,
   $ a pocket of {coins} (5), H heart, K key, @ new-game start.

   buildings: [{ art: 'cottage', x, y }] draws a 2×2-tile picture from
   art.js BUILDINGS with its top-left on tile x, y. Its four tiles are
   solid, or list the solid ones yourself: solid: [[x, y], …].
   swap: { if: 'flag', art: 'other' } draws a different picture once a
   story flag is set (Kev's shop with all 99 balloons).

   TALK on an outdoor screen can depend on the story so far:
     { who: 'brendan', face: 'right', say: [
         { if: 'flag', lines: [...] },              // first match wins
         { has: 'fizz', take: 'fizz', set: 'brambles', lines: [...] },
         { lines: [...] },                          // the fallback
     ] }
   Each option can also have: unless (flag), give ('coins:5', 'tonic'…),
   shop ('kev', opens the shop after the lines), cut (a cut scene id),
   forge (Brendan reforges the Thwacker to that level).
   here: { if, unless } on the person (next to who:) means they only stand
   there at that point in the story.
   ========================================================================== */
BAMBER_WORLD.add('wood', {
  village: {
    name: 'Bamber village',
    kind: 'field',
    music: 'town',
    at: [0, 2],
    exits: { n: 'woodpath', w: 'vale' },
    thorns: 'sun_wood',          // the west road stays choked until the wood's Sunstone is back
    map: [
      'TTTTTTT:TTTTTTT',
      'T.,....:....,.T',
      'T......:......T',
      'T......:...N..T',
      'Tff.ff.:.ff.ffT',
      'T,.....:....=.T',
      ':%::::::::::::T',
      'TP...,.:......T',
      'T......:@.~~~.T',
      'T.*.N..:.~~~~.T',
      'T,.....:..~~.$T',
      'TTTTTTTTTTTTTTT',
    ],
    buildings: [
      { art: 'cottage', x: 2, y: 1 },
      { art: 'shop', x: 10, y: 1, swap: { if: 'balloons99', art: 'shop99' } },  // 99 balloons on the roof
      { art: 'cottage', x: 2, y: 7 },
      { art: 'well', x: 5, y: 8, solid: [[5, 8], [6, 8], [5, 9], [6, 9]] },
    ],
    signs: [
      ["Bamber village. {kev}'s Potions: under the balloons.", 'Westward: Millbrook Vale. Northward: the wood.'],
    ],
    talk: [
      { who: 'kev', face: 'down', say: [
        { if: 'balloons99', shop: 'kev', lines: [
          'Ninety-nine Luftballons. On the roof. I may never come down from this.',
          'Technically the shop did come down. Eventually. What can I get you?',
        ] },
        { unless: 'met_kev', set: 'met_kev', shop: 'kev', lines: [
          'Welcome to the finest potion shop under a balloon. Three balloons. The aim is ninety-nine.',
          "I take payment in {coins}. Red ones. Don't ask, it's a whole thing.",
          "Fizzwhistle? Does nothing at all. Best seller. Can't keep it on the shelf.",
        ] },
        { shop: 'kev', lines: ['Back again, {hero}? Lovely. Every balloon you spend goes on the roof.'] },
      ] },
      // here: Brendan leaves the village once he's reforged the Thwacker; he's at the river crossing (world/mill.js)
      { who: 'brendan', face: 'right', here: { unless: 'forged1' }, say: [
        { if: 'sun_wood', unless: 'forged1', set: 'forged1', forge: 1, lines: [
          "Is that a Sunstone? Give it here. And the {weapon}. Don't look so worried.",
          '*CLANG* *CLANG* *hiss*',
          "There. It'll hit twice as hard now. Still won't dent anything spiky, mind.",
          "The brambles on the west road have shrivelled up too. Millbrook Vale's that way.",
          "I'm off there myself. Word is the bridge over the river's out. Meet me at the crossing.",
        ] },
        { if: 'forged1', lines: ['Swing it gently. Or don\'t. I\'m not your mum.', 'Bring me another Sunstone and we\'ll see what else it can do.'] },
        { if: 'brambles', lines: ['Brambles are down. Mind the splinters.', 'Bring me some timber one day and I\'ll build you a bridge.'] },
        { has: 'kebab', take: 'kebab', set: 'brambles', lines: [
          "Is that a King's Kebab? For me? You shouldn't have. You really should have.",
          'Right then. Brambles. Give me a minute… done. Off you go, {hero}.',
        ] },
        { lines: [
          "Brambles past the wood? I'd cut them, but I've only just sat down.",
          "Fetch me a King's Kebab from {kev} and I might find the energy.",
        ] },
      ] },
    ],
  },

  woodpath: {
    name: "The Queen's Wood",
    kind: 'field',
    at: [0, 1],
    exits: { s: 'village', n: 'glade' },
    thorns: 'brambles',
    map: [
      'TTTTTTT:TTTTTTT',
      'TT..,.%%%..*.TT',
      'T..*...:..,..PT',
      'T.,....::.....T',
      'TT...T..:..T..T',
      'T.......:..=..T',
      'T..Th...:...,.T',
      'T~~~....:...$.T',
      'T~~~~...:.....T',
      'TT~~...*:..h..T',
      'TTT..$.::...TTT',
      'TTTTTTT:TTTTTTT',
    ],
    signs: [
      ["The Queen's Wood. Picnics this way.", 'Someone has scratched underneath: "Not today."'],
    ],
  },

  glade: {
    name: 'Hollow Oak Glade',
    kind: 'field',
    at: [0, 0],
    exits: { s: 'woodpath' },
    map: [
      'TTTTTTTTTTTTTTT',
      'TT..,......*.TT',
      'T.............T',
      'T.,...........T',
      'T..C...:...,..T',
      'T......:=.....T',
      'T..,...:......T',
      'TT.....:....*.T',
      'T...*..:...h..T',
      'T......:...,..T',
      'TT,....:.....TT',
      'TTTTTTT:TTTTTTT',
    ],
    buildings: [{ art: 'oak', x: 6, y: 2 }],
    doors: [{ at: [7, 3], to: 'oakroot', x: 7, y: 10, face: 'up' }],
    signs: [
      ['The Hollow Oak. Something stirs inside, and it sounds cross.', 'The door in the trunk is open. Somebody has left a muddy footprint on it.'],
    ],
    chests: ['coins:15'],
  },
});
