/* ==========================================================================
   Region 2 — Millbrook Vale and the Sunk Mill (the prototype dungeon).
   Dungeon rooms are 15 × 12 tiles. Legend:

     #  wall                 .  floor              ~  gap (vault over it)
     _  pressure plate       D  locked door        B  big-key door
     S  shutter (opens when the room is solved; see "solve" below)
     O  push block           P  pot (lift, throw)  C  chest (see "chests")
     =  sign (see "signs")   N  person (see "talk")
     b  brazier, unlit       L  brazier, always lit (decoration)
     K  small key            H  heart              X  heart vessel
     $  a pocket of {coins}  h  Bristlehog         w  Spindlewisp
     m  Mimmet               Z  the boss (a 2x2 square of Z)

   EXITS: leave a gap in the outer wall and name the room next door:
     exits: { n: 'hall', s: …, e: …, w: … }. Bodge arrives on the matching
     edge of the next room, same column (n/s) or row (e/w): line them up.
     A locked door on an edge should be on one side only.

   SIGNS, TALK, CHESTS: in reading order (left to right, then top to
   bottom), one entry per = / N / C on the map.
     chests: 'key' | 'bigkey' | 'hopstaff' | 'heart' | 'container' |
             'coins:10' | an elixir id ('tonic')

   SOLVE (opens every S in the room, for good):
     'plates' | 'braziers' (burn: turns lit) | 'enemies' | 'boss'
     Beating the boss leaves a heart vessel and the region's Sunstone.

   MAP: page and at: [column, row] place the room on the map screen.
   ========================================================================== */
BAMBER_WORLD.add('mill', {
  vale: {
    name: 'Millbrook Vale',
    kind: 'field',
    at: [0, 0],
    exits: { n: 'gate', e: 'village' },
    map: [
      'TTTTTTT:TTTTTTT',
      'T~~..,.:....,.T',
      'T~~~...:..*...T',
      'TT~~~..:......T',
      'T..~~~.:..=...T',
      'T...~~~:......T',
      'T....~~::::::::',
      'T,....~~......T',
      'T......~~..P..T',
      'T..*....~~....T',
      'T.,..$...~~...T',
      'TTTTTTTTT~~TTTT',
    ],
    buildings: [{ art: 'cottage', x: 11, y: 1 }],
    signs: [
      ['Millbrook Vale. The mill is north.', 'The river used to sing here. Now it mostly sulks.'],
    ],
  },

  gate: {
    page: 'sunkmill', at: [1, 3],
    name: 'Mill Gate',
    exits: { n: 'hall', s: 'vale' },
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
      '#.............#',
      '#.L...........#',
      '#######.#######',
    ],
    signs: [
      ['{dungeon}. Keep out.', 'Below that, in chalk: "Swipe to step. Pinch to act. Back for your things."'],
    ],
    talk: [
      { who: 'nettle', lines: [
        "{hero}! I'm {nettle}, keeper of the sluices.",
        'The wheel stopped when the furnace below woke up. Keys open doors; the big key opens the great door.',
        'Stuck in a room? Press Back and choose Reset room.',
      ] },
    ],
  },

  hall: {
    page: 'sunkmill', at: [1, 2],
    name: 'Grinding Hall',
    exits: { s: 'gate', w: 'sluice', e: 'corridor', n: 'ante' },
    map: [
      '#######B#######',
      '#P...##.##...P#',
      '#.....=.......#',
      '#.............#',
      '#..L.......L..#',
      '..............D',
      '#.............#',
      '#..L.......L..#',
      '#.............#',
      '#.............#',
      '#P...##.##...P#',
      '#######.#######',
    ],
    signs: [
      ['The great door. Only the big key turns this lock.', 'Pots break when thrown. Some hide a heart.'],
    ],
  },

  sluice: {
    page: 'sunkmill', at: [0, 2],
    name: 'Sluice Room',
    exits: { e: 'hall', n: 'embers' },
    solve: 'plates',
    map: [
      '#######.#######',
      '#~~~~~~~~~~~~~#',
      '#........=....#',
      '#...O.........#',
      '#.........O...#',
      '#..............',
      '#.............#',
      '#._.........._#',
      '#.....#S#.....#',
      '#.....#C#.....#',
      '#.....###.....#',
      '###############',
    ],
    signs: [
      ['The old sluice gap. Too wide to step.', 'Pinch a block to push it. Weigh down both plates.'],
    ],
    chests: ['key'],
  },

  corridor: {
    page: 'sunkmill', at: [2, 2],
    name: 'Hog Run',
    exits: { w: 'hall', n: 'maze' },
    solve: 'enemies',
    map: [
      '#######S#######',
      '#.............#',
      '#.##.......##.#',
      '#.#....h....#.#',
      '#.............#',
      '..............#',
      '#.............#',
      '#.#.........#.#',
      '#.##.......##.#',
      '#.......P.....#',
      '#.............#',
      '###############',
    ],
  },

  maze: {
    page: 'sunkmill', at: [2, 1],
    name: 'Shell Garden',
    exits: { s: 'corridor', n: 'shrine' },
    solve: 'plates',
    map: [
      '#######S#######',
      '#.............#',
      '###########...#',
      '#_......m.#...#',
      '###########...#',
      '#.............#',
      '#.............#',
      '#...O....._...#',
      '#............=#',
      '#...##...##...#',
      '#....m........#',
      '#######.#######',
    ],
    signs: [
      ['Mimmets mirror you: step right and they step left.', 'A shell is as heavy as a block.'],
    ],
  },

  shrine: {
    page: 'sunkmill', at: [2, 0],
    name: 'Spring Shrine',
    exits: { s: 'maze' },
    map: [
      '###############',
      '#.............#',
      '#.............#',
      '#.............#',
      '#...~~~..L.L..#',
      '#...~K~...C...#',
      '#...~~~.......#',
      '#.............#',
      '#..=.......w..#',
      '#.............#',
      '#.............#',
      '#######.#######',
    ],
    signs: [
      ['Face a gap with the {item} and pinch: up, over, down.'],
    ],
    chests: ['coins:20'],
  },

  embers: {
    page: 'sunkmill', at: [0, 1],
    name: 'Ember Gallery',
    exits: { s: 'sluice', n: 'gaps' },
    solve: 'braziers',
    burn: 12,
    map: [
      '#######S#######',
      '#.............#',
      '#.............#',
      '#...b.....b...#',
      '#.............#',
      '#.............#',
      '#......b......#',
      '#.............#',
      '#.w.........w.#',
      '#.............#',
      '#=............#',
      '#######.#######',
    ],
    signs: [
      ['Strike a brazier to light it. They burn out fast.', 'Wisp embers catch light too.'],
    ],
  },

  gaps: {
    page: 'sunkmill', at: [0, 0],
    name: 'Broken Floor',
    exits: { s: 'embers' },
    map: [
      '###############',
      '#.....#C#.....#',
      '#.....#D#.....#',
      '#.............#',
      '#..h..........#',
      '#~~~~~~~~~~~~~#',
      '#....~...~....#',
      '#..H..........#',
      '#~~~~~~~~~~~~~#',
      '#.............#',
      '#..=..........#',
      '#######.#######',
    ],
    signs: [
      ['The floor fell in years ago. Mind the hog above.'],
    ],
    chests: ['bigkey'],
  },

  ante: {
    page: 'sunkmill', at: [1, 1],
    name: 'Kiln Stair',
    exits: { s: 'hall', n: 'lair' },
    map: [
      '#######.#######',
      '#.............#',
      '#.P.L.....L.P.#',
      '#.............#',
      '#..##.....##..#',
      '#..#.......#..#',
      '#......=......#',
      '#..#.......#..#',
      '#..##..w..##..#',
      '#.............#',
      '#.P.........P.#',
      '#######.#######',
    ],
    signs: [
      ['Heat rises from the stair.', 'Its shell cools after it vents. Strike the core then.'],
    ],
  },

  lair: {
    page: 'sunkmill', at: [1, 0],
    name: 'Kiln Heart',
    exits: { s: 'ante' },
    solve: 'boss',
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
