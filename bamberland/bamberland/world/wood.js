/* ==========================================================================
   Region 1 — the Queen's Wood: Bamber village and the wood around it.

   OUTDOOR SCREENS (kind: 'field') use their own ground letters:
     .  grass        ,  flowers      :  path
     T  tree         *  bush         f  fence      ~  water
     %  brambles (solid until the room's "thorns" story flag is set)
   and the same objects as dungeons: N person, = sign, C chest, P pot,
   $ a pocket of {coins} (5), H heart, K key, @ new-game start.

   buildings: [{ art: 'cottage', x, y }] draws a 2×2-tile picture from
   art.js BUILDINGS with its top-left on tile x, y. Its four tiles are
   solid, or list the solid ones yourself: solid: [[x, y], …].

   TALK on an outdoor screen can depend on the story so far:
     { who: 'brendan', face: 'right', say: [
         { if: 'flag', lines: [...] },              // first match wins
         { has: 'fizz', take: 'fizz', set: 'brambles', lines: [...] },
         { lines: [...] },                          // the fallback
     ] }
   Each option can also have: unless (flag), give ('coins:5', 'tonic'…),
   shop ('kev', opens the shop after the lines), cut (a cut scene id).
   ========================================================================== */
BAMBER_WORLD.add('wood', {
  village: {
    name: 'Bamber village',
    kind: 'field',
    music: 'town',
    at: [0, 2],
    exits: { n: 'woodpath', w: 'vale' },
    map: [
      'TTTTTTT:TTTTTTT',
      'T.,....:....,.T',
      'T......:......T',
      'T......:...N..T',
      'Tff.ff.:.ff.ffT',
      'T,.....:....=.T',
      '::::::::::::::T',
      'TP...,.:......T',
      'T......:@.~~~.T',
      'T.*.N..:.~~~~.T',
      'T,.....:..~~.$T',
      'TTTTTTTTTTTTTTT',
    ],
    buildings: [
      { art: 'cottage', x: 2, y: 1 },
      { art: 'shop', x: 10, y: 1 },
      { art: 'cottage', x: 2, y: 7 },
      { art: 'well', x: 5, y: 8, solid: [[5, 8], [6, 8], [5, 9], [6, 9]] },
    ],
    signs: [
      ["Bamber village. {kev}'s Potions: under the balloons.", 'Westward: Millbrook Vale. Northward: the wood.'],
    ],
    talk: [
      { who: 'kev', face: 'down', say: [
        { unless: 'met_kev', set: 'met_kev', shop: 'kev', lines: [
          'Welcome to the finest potion shop under a balloon.',
          "Fizzwhistle? Does nothing at all. Best seller. Can't keep it on the shelf.",
        ] },
        { shop: 'kev', lines: ['Back again, {hero}? Lovely. What can I get you?'] },
      ] },
      { who: 'brendan', face: 'right', say: [
        { if: 'brambles', lines: ['Brambles are down. Mind the splinters.', 'Bring me some timber one day and I\'ll build you a bridge.'] },
        { has: 'fizz', take: 'fizz', set: 'brambles', lines: [
          'A Fizzwhistle! My favourite. Does nothing at all.',
          'Right then. Brambles. Give me a minute… done. Off you go, {hero}.',
        ] },
        { lines: [
          "Brambles past the wood? I'd cut them, but I've only just sat down.",
          "Fetch me a Fizzwhistle from {kev} and I might find the energy.",
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
      'T..T....:...,.T',
      'T~~~....:...$.T',
      'T~~~~...:.....T',
      'TT~~...*:.....T',
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
      'T...*..:......T',
      'T......:...,..T',
      'TT,....:.....TT',
      'TTTTTTT:TTTTTTT',
    ],
    buildings: [{ art: 'oak', x: 6, y: 2 }],
    signs: [
      ['The Hollow Oak. Something stirs inside, and it sounds cross.', '(The way in opens in the next update.)'],
    ],
    chests: ['coins:15'],
  },
});
