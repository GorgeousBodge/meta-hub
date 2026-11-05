/* ==========================================================================
   Region 1's dungeon — the Hollow Oak. In through the door in the great
   oak's trunk (the glade, in wood.js), up to the Thornmother at the top.

   Same legend as the Sunk Mill (see world/mill.js), plus:
     %  thorns: can't be walked through; vault over them with the Hopstaff

   The way through:
     Root Hall → west: Hog Burrow (beat the hog) → north: Sap Well (key)
     Root Hall → east, the locked door: Larder (blocks onto plates)
       → north: the Hollow (Hopstaff, then vault the thorns for the big key)
     Root Hall → north, the great door: Crown Stair (vault the thorns)
       → north: the Thorn Heart, where the Thornmother waits.
   ========================================================================== */
BAMBER_WORLD.add('wood', {
  oakroot: {
    name: 'Root Hall',
    dungeon: 'the Hollow Oak',
    page: 'hollowoak', at: [1, 2],
    // the south doorway leads back out of the trunk, onto the path in the glade
    exits: { n: 'oakstair', w: 'oakburrow', e: 'oaklarder', s: { to: 'glade', x: 7, y: 4, face: 'down' } },
    map: [
      '#######B#######',
      '#.....#.#.....#',
      '#.=...#.#..P..#',
      '#...........$.#',
      '#..L.......L..#',
      '..............D',
      '#.............#',
      '#..L.......L..#',
      '#.............#',
      '#P...........P#',
      '#.............#',
      '#######.#######',
    ],
    signs: [
      ['The Hollow Oak. Its heart beats like a drum, and the drum is in a mood.', 'Scratched below: "Hogs west. Larder east. Upstairs: do not."'],
    ],
  },

  oakburrow: {
    name: 'Hog Burrow',
    dungeon: 'the Hollow Oak',
    page: 'hollowoak', at: [0, 2],
    exits: { e: 'oakroot', n: 'oaksap' },
    solve: 'enemies',
    map: [
      '#######S#######',
      '#.............#',
      '#..##.....##..#',
      '#..#...h...#..#',
      '#.............#',
      '#..............',
      '#.............#',
      '#..#.......#..#',
      '#..##.....##..#',
      '#....P...P....#',
      '#......$......#',
      '###############',
    ],
  },

  oaksap: {
    name: 'Sap Well',
    dungeon: 'the Hollow Oak',
    page: 'hollowoak', at: [0, 1],
    exits: { s: 'oakburrow' },
    map: [
      '###############',
      '#L...........L#',
      '#.....###.....#',
      '#.....#C#.....#',
      '#.....#.#.....#',
      '#.$....O....$.#',
      '#.............#',
      '#..P.......P..#',
      '#......=......#',
      '#.............#',
      '#L...........L#',
      '#######.#######',
    ],
    signs: [
      ['Somebody parked a block in front of the sap store.', 'Blocks slide when pushed. Push from the side, not the front.'],
    ],
    chests: ['key'],
  },

  oaklarder: {
    name: 'Squirrel Larder',
    dungeon: 'the Hollow Oak',
    page: 'hollowoak', at: [2, 2],
    exits: { w: 'oakroot', n: 'oakhollow' },
    solve: 'plates',
    map: [
      '#######S#######',
      '#............$#',
      '#.=...........#',
      '#..O..........#',
      '#........O....#',
      '..............#',
      '#..P..........#',
      '#.............#',
      '#.._......._..#',
      '#.............#',
      '#.....P.P.....#',
      '###############',
    ],
    signs: [
      ['Two plates, two blocks. A pot in the way? Lift it and throw it.'],
    ],
  },

  oakhollow: {
    name: 'The Hollow',
    dungeon: 'the Hollow Oak',
    page: 'hollowoak', at: [2, 1],
    exits: { s: 'oaklarder' },
    map: [
      '###############',
      '#.............#',
      '#..%%%%%......#',
      '#..%...%...L..#',
      '#..%.C.%......#',
      '#..%...%......#',
      '#..%%%%%......#',
      '#.............#',
      '#.......C.....#',
      '#..=..........#',
      '#...........$.#',
      '#######.#######',
    ],
    signs: [
      ['Thorns grow thick round the old chest. Far too thick to walk through.', 'Over, then?'],
    ],
    chests: ['bigkey', 'hopstaff'],
  },

  oakstair: {
    name: 'Crown Stair',
    dungeon: 'the Hollow Oak',
    page: 'hollowoak', at: [1, 1],
    exits: { s: 'oakroot', n: 'oakheart' },
    map: [
      '#######.#######',
      '#.............#',
      '#..L...H...L..#',
      '#.............#',
      '#%%%%%%%%%%%%%#',
      '#.............#',
      '#....P...P....#',
      '#%%%%%%%%%%%%%#',
      '#.............#',
      '#..=........$.#',
      '#.............#',
      '#######.#######',
    ],
    signs: [
      ['The heart of the oak is just above. It is not pleased to have visitors.', 'Vault the thorns. Mind the pots: you need somewhere to land.'],
    ],
  },

  oakheart: {
    name: 'Thorn Heart',
    dungeon: 'the Hollow Oak',
    page: 'hollowoak', at: [1, 0],
    exits: { s: 'oakstair' },
    solve: 'boss',
    boss: 'thorn',
    map: [
      '###############',
      '#.............#',
      '#...%%%%%%....#',
      '#...%....%....#',
      '#...%.ZZ.%....#',
      '#...%.ZZ.%....#',
      '#...%....%....#',
      '#...%%%%%%....#',
      '#.............#',
      '#.L.........L.#',
      '#.............#',
      '#######.#######',
    ],
  },
});
