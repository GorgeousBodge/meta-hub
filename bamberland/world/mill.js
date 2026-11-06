/* ==========================================================================
   Region 2 — Millbrook Vale, the river crossing and the Sunk Mill.
   Dungeon rooms are 15 × 12 tiles. Legend:

     #  wall                 .  floor              ~  gap (3+ wide in the Mill)
     _  pressure plate       D  locked door        B  big-key door
     S  shutter (opens when the room is solved; see "solve" below)
     O  push block           P  pot (lift, throw)  C  chest (see "chests")
     =  sign (see "signs")   N  person (see "talk")
     b  brazier, unlit       L  brazier, always lit (decoration)
     K  small key            H  heart              X  heart vessel
     $  a pocket of {coins}  h  Bristlehog         w  Spindlewisp
     m  Mimmet               Z  the boss (a 2x2 square of Z)
     %  thorns (vault over them with the Hopstaff; the Grapple Line flies over)
     I  a post: hook it with the Grapple Line to be pulled across a gap
     !  a lever: pull it by hand, or yank it from afar with the Grapple Line
     G  a sluice gate: too heavy by hand; the Grapple Line yanks it open
     *  machinery: solid, drawn by the room (the mill wheel: wheel: [x, y])
     1 2 3  machinery gates: gate n opens once the story flag stages[n - 1]
            is set (see the Wheel Pit)

   THE GRAPPLE LINE reaches five tiles, over floor, gaps and thorns. A post
   pulls Bodge to the tile just in front of it, so a post needs a floor tile
   on Bodge's side. Blocks slide along the floor towards him (never over a
   gap); pots fly over gaps and land in his hands.

   EXITS: leave a gap in the outer wall and name the room next door:
     exits: { n: 'hall', s: …, e: …, w: … }. Bodge arrives on the matching
     edge of the next room, same column (n/s) or row (e/w): line them up.
     A locked door on an edge should be on one side only.

   SIGNS, TALK, CHESTS: in reading order (left to right, then top to
   bottom), one entry per = / N / C on the map.
     chests: 'key' | 'bigkey' | 'hopstaff' | 'grapple' | 'heart' |
             'container' | 'coins:10' | an elixir id ('tonic')

   SOLVE (opens every S in the room, for good):
     'plates' | 'braziers' (burn: turns lit) | 'enemies' | 'boss'
     'levers' (every ! pulled at once; spring: N makes them spring back
     after N turns, so pull them quickly)
     sets: 'flag' turns a story flag on when the room is solved.
     Beating the boss leaves a heart vessel and the region's Sunstone.

   OUTDOOR BRIDGES: on an outdoor screen, B is a bridge, broken until the
   room's bridge story flag is set (bridge: 'bridge').

   MAP: page and at: [column, row] place the room on the map screen.

   The way through the Sunk Mill:
     Mill Gate → Wheel Pit (the hub). West: Ember Gallery (light the
     braziers) → Rope Store (the Grapple Line) → Sluice Room (yank both
     levers): water reaches the wheel and the Wheel Pit's east gate lifts.
     East: Shell Garden (plates; the small key) → Gear Loft (two springing
     levers): the gears bite and the north gate lifts. The Gear Loft's
     locked door → the Hopper (the big key). North: Kiln Stair → Kiln Heart,
     where the Kilnwarden waits. Beat it and the wheel turns again.
   ========================================================================== */
BAMBER_WORLD.add('mill', {
  vale: {
    name: 'Millbrook Vale',
    kind: 'field',
    at: [0, 0],
    exits: { n: 'millgate', e: 'village', s: 'crossing' },
    map: [
      'TTTTTTT:TTTTTTT',
      'T~~..,.:....,.T',
      'T~~~...:..*...T',
      'TT~~~..:...h..T',
      'T..~~~.:..=...T',
      'T...~~~:.....,T',
      'T....~~::::::::',
      'T,....~~...:..T',
      'T......~~..:P.T',
      'T..*....~~.:..T',
      'T.,......~~:..T',
      'TTTTTTTTT~~:TTT',
    ],
    buildings: [{ art: 'cottage', x: 11, y: 1 }],
    signs: [
      ['Millbrook Vale. The mill is north. The river crossing is south.', 'The river used to sing here. Now it mostly sulks.'],
    ],
  },

  crossing: {
    name: 'Millbrook Crossing',
    kind: 'field',
    at: [0, 1],
    exits: { n: 'vale' },
    bridge: 'bridge',          // the B tiles stay broken until Brendan builds the bridge
    map: [
      'TTTTTTTTT~~:TTT',
      'T..,.....~~:..T',
      'T.*......~~:N.T',
      'T........~~:..T',
      'T..,.....~~:=.T',
      '~~~~~~~~~~~B~~~',
      '~~~~~~~~~~~B~~~',
      '~~~~~~~~~~~B~~~',
      'T..*.......:..T',
      'T....,.....:=.T',
      'T..........f..T',
      'TTTTTTTTTTTTTTT',
    ],
    signs: [
      ['Millbrook Crossing. Over the river, the road to the Gloommarsh.', 'The bridge has other ideas.'],
      ['The road goes on (next update).'],
    ],
    talk: [
      { who: 'brendan', face: 'down', here: { if: 'forged1' }, say: [
        { if: 'forged2', lines: [
          "Bridge'll hold. Probably. Stamp on it a bit for me.",
          'The road beyond goes on to the Gloommarsh. Bring me a Sunstone from there and I\'ll see what else that mallet can do.',
        ] },
        // the bridge cut scene plays first, then these lines
        { if: 'timber', set: ['bridge', 'forged2'], forge: 2, cut: 'bridge', lines: [
          "Good oak, that. {telk} only fell over twice bringing it.",
          "Now. That's a Sunstone in your pocket. Hand it over, and your mallet. Don't look so worried.",
          '*CLANG* *CLANG* *hiss*',
          "There: the {weapon}. Three times the thwack. Off you go, {hero}. The road's open.",
        ] },
        { if: 'sun_mill', lines: [
          "Hear that? The wheel's going. Those timbers will be shaking loose.",
          'Somebody ought to fetch them. Preferably not me. I\'ve only just sat down.',
        ] },
        { lines: [
          'Bridge is out. Washed clean away. The road to the Gloommarsh is over there, and so is the river.',
          "I'd build another, but I want proper timber: the old oak beams in the Sunk Mill.",
          "They're wedged in tight while the wheel's stuck. Get it turning again and they'll shake loose.",
        ] },
      ] },
    ],
  },

  /* ---------- the Sunk Mill ---------- */
  millgate: {
    page: 'sunkmill', at: [1, 3],
    name: 'Mill Gate',
    exits: { n: 'millwheel', s: 'vale' },
    map: [
      '#######.#######',
      '#.............#',
      '#.=.........L.#',
      '#.............#',
      '#...##...##...#',
      '#...#.....#...#',
      '#.....N.......#',
      '#...#.....#...#',
      '#...##...##...#',
      '#...........h.#',
      '#.L.....P.....#',
      '#######.#######',
    ],
    signs: [
      ['{Dungeon}. Keep out.', 'Below that, in chalk: "Swipe to step. Pinch to act. Back for your things."'],
    ],
    talk: [
      { who: 'nettle', say: [
        { if: 'sun_mill', lines: [
          'Listen to that wheel go! Best noise in the vale.',
          'You did that, {hero}. I only watched. Nervously.',
        ] },
        { lines: [
          "{hero}! I'm {nettle}, keeper of the sluices. Or I was, before the furnace downstairs woke and the wheel stopped dead.",
          'Water turns the wheel; the gears turn the rest. Sluices are west, past the Ember Gallery. Gears are east.',
          'Stuck in a room? Press Back and choose Reset room.',
        ] },
      ] },
    ],
  },

  millwheel: {
    page: 'sunkmill', at: [1, 2],
    name: 'Wheel Pit',
    exits: { s: 'millgate', w: 'millembers', e: 'millshells', n: 'millstair' },
    wheel: [7, 6],                         // the great wheel is drawn centred on this tile
    stages: ['mill_sluice', 'mill_gears'], // gate 1 lifts with water, gate 2 with the gears
    map: [
      '#######2#######',
      '#.....#.#.....#',
      '#.=...#.#..P..#',
      '#.............#',
      '#....~~~~~....#',
      '.....~***~....1',
      '#....~***~....#',
      '#....~***~....#',
      '#....~~~~~....#',
      '#..L.......L..#',
      '#.............#',
      '#######.#######',
    ],
    signs: [
      ["The great wheel. It hasn't turned since the furnace woke.", 'Three ways on. West is open. East waits for water; north waits for the gears.'],
    ],
  },

  millembers: {
    page: 'sunkmill', at: [0, 2],
    name: 'Ember Gallery',
    exits: { e: 'millwheel', n: 'millrope' },
    solve: 'braziers',
    burn: 12,
    map: [
      '#######S#######',
      '#.............#',
      '#.............#',
      '#...b.....b...#',
      '#.............#',
      '#..............',
      '#......b......#',
      '#.............#',
      '#.w.........w.#',
      '#.............#',
      '#=............#',
      '###############',
    ],
    signs: [
      ['Strike a brazier to light it. They burn out fast.', 'Wisp embers catch light too.'],
    ],
  },

  millrope: {
    page: 'sunkmill', at: [0, 1],
    name: 'Rope Store',
    exits: { s: 'millembers', n: 'millsluice' },
    map: [
      '#######.#######',
      '#...........$.#',
      '#..P..I....w..#',
      '#.............#',
      '#~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~#',
      '#.............#',
      '#..=.....I....#',
      '#..C..........#',
      '#.............#',
      '#######.#######',
    ],
    signs: [
      ['Three tiles of nothing. Far too wide for the {hopstaff}.', 'Hook a post across the way and let it pull you over. Each side has one.'],
    ],
    chests: ['grapple'],
  },

  millsluice: {
    page: 'sunkmill', at: [0, 0],
    name: 'Sluice Room',
    exits: { s: 'millrope' },
    solve: 'levers',
    sets: 'mill_sluice',
    solvedText: 'Water rushes down to the wheel',
    map: [
      '###############',
      '#~~~~~~~~#C#..#',
      '#~~~!~~~~#G#..#',
      '#~~~~~~~~.~...#',
      '#~~~~~~~~.....#',
      '#~~~~~~~~..%%%#',
      '#..........%.!#',
      '#..=.......%%%#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#######.#######',
    ],
    signs: [
      ['Two sluice levers. Pull both and the water runs to the wheel.', 'Nobody said they were within reach. The line flies over thorns, too.'],
    ],
    chests: ['coins:10'],
  },

  millshells: {
    page: 'sunkmill', at: [2, 2],
    name: 'Shell Garden',
    exits: { w: 'millwheel', n: 'millgears' },
    solve: 'plates',
    map: [
      '#######S#######',
      '#............C#',
      '###########...#',
      '#_......m.#...#',
      '###########...#',
      '..............#',
      '#.............#',
      '#..=..........#',
      '#~~~~~~~~~~~~~#',
      '#..........####',
      '#........_...O#',
      '###############',
    ],
    signs: [
      ['Mimmets mirror you: step right and they step left. A shell is as heavy as a block.', "That block's wedged in its nook. Pushing won't do. Pulling might."],
    ],
    chests: ['key'],
  },

  millgears: {
    page: 'sunkmill', at: [2, 1],
    name: 'Gear Loft',
    exits: { s: 'millshells', n: 'millhopper' },
    solve: 'levers',
    spring: 7,
    sets: 'mill_gears',
    solvedText: 'The gears bite. Something clanks below',
    map: [
      '#######D#######',
      '#.............#',
      '#.!.........I.#',
      '#.............#',
      '#~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~#',
      '#.............#',
      '#.I.......!...#',
      '#.............#',
      '#....=...h....#',
      '#######.#######',
    ],
    signs: [
      ['The gear levers spring back after a few turns. Both must be down at once.', "You won't make it on foot. Yank them."],
    ],
  },

  millhopper: {
    page: 'sunkmill', at: [2, 0],
    name: 'Grain Hopper',
    exits: { s: 'millgears' },
    map: [
      '###############',
      '#~~~~~~~~~~~~~#',
      '#~~~~..I..~~~~#',
      '#~~~~.C...~~~~#',
      '#~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~#',
      '#.............#',
      '#~~~~~~~~I~~~~#',
      '#...........m.#',
      '#..=......$...#',
      '#######.#######',
    ],
    signs: [
      ['Vault the trench, then hook the island.', 'The post in the trench is for the way back.'],
    ],
    chests: ['bigkey'],
  },

  millstair: {
    page: 'sunkmill', at: [1, 1],
    name: 'Kiln Stair',
    exits: { s: 'millwheel', n: 'millheart' },
    map: [
      '#######B#######',
      '#..L.....I.L..#',
      '#.............#',
      '#~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~#',
      '#.............#',
      '#.~~~~~~~~~~I~#',
      '#~~~~~~~~~~~~~#',
      '#.~~~~~~~~~~~~#',
      '#.......P....=#',
      '#######.#######',
    ],
    signs: [
      ['Heat rises from the stair. The furnace is just above.', 'Up the side, over, then hook the far post. When it vents, yank its vents open. When it cools, strike.'],
    ],
  },

  millheart: {
    page: 'sunkmill', at: [1, 0],
    name: 'Kiln Heart',
    exits: { s: 'millstair' },
    solve: 'boss',
    boss: 'kiln',
    map: [
      '###############',
      '#.............#',
      '#...~~~~~~....#',
      '#...~....~....#',
      '#...~.ZZ.~....#',
      '#...~.ZZ.~....#',
      '#...~....~....#',
      '#...~~~~~~....#',
      '#.............#',
      '#.L.........L.#',
      '#.............#',
      '#######.#######',
    ],
  },
});
