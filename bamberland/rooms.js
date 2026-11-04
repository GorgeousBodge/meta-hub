/* ==========================================================================
   Bamberland — rooms. Each room is one screen: 15 tiles wide, 12 tall.

   LEGEND (one character per tile)
     #  wall                 .  floor              ~  gap (vault over it)
     _  pressure plate       D  locked door        B  big-key door
     S  shutter (opens when the room is solved; see "solve" below)
     O  push block           P  pot (lift, throw)  C  chest (see "chests")
     =  sign (see "signs")   N  person (see "talk")
     b  brazier, unlit       L  brazier, always lit (decoration)
     K  small key            H  heart              X  heart vessel
     @  where a new game starts (one room only)
     h  Bristlehog           w  Spindlewisp        m  Mimmet
     Z  the boss (draw it as a 2x2 square of Z)

   EXITS
     Leave a gap in the outer wall (a floor, D or B tile) and name the
     room next door: exits: { n: 'hall', s: ..., e: ..., w: ... }.
     Bodge walks off that edge and arrives on the matching edge of the
     next room, in the same column (n/s) or row (e/w), so line the gaps up.
     A locked door on an edge should be on one side only.

   SIGNS, TALK, CHESTS — listed in reading order (left to right, then top
   to bottom), one entry per = / N / C on the map:
     signs:  [ 'text', ['page one', 'page two'] ]
     talk:   [ { who: 'nettle', lines: ['page one', 'page two'] } ]
     chests: [ 'key' | 'bigkey' | 'hopstaff' | 'heart' | 'container' ]

   SOLVE (opens every S in the room, for good)
     'plates'   every _ has a block (or a Mimmet) on it at the same time
     'braziers' every b is burning at the same time; burn: turns each stays lit
     'enemies'  every enemy in the room is beaten
     'boss'     the boss is beaten
   ========================================================================== */
window.BAMBER_ROOMS = {
  start: 'gate',

  rooms: {
    gate: {
      name: 'Mill Gate',
      exits: { n: 'hall' },
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
        '#......@......#',
        '#.L...........#',
        '###############',
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
      name: 'Hopstaff Shrine',
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
      chests: ['hopstaff'],
    },

    embers: {
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
  },
};
