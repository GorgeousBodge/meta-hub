/* ==========================================================================
   Bamberland — characters, items and story text.
   Rename anything here without touching the game code.

   In any text you can write {hero}, {world}, {dungeon}, {weapon}, {item},
   {boss}, {coin}, {coins}, an enemy id ({hog}) or a person's id ({kev}):
   the game swaps in the current name, including names the player chose.
   Keep lines short: about 90 characters per dialogue page fits best.
   ========================================================================== */
window.BAMBER_LORE = {
  world: 'Bamberland',
  dungeon: 'the Sunk Mill',

  hero: {
    name: 'Bodge',
    blurb: 'A quiet Bamberland local with a big cap and a bigger mallet.',
  },

  // The money: red balloons, for Kev. "one" is used for 1, "many" for everything else.
  money: { one: 'Luftballon', many: 'Luftballons' },

  // Title screen: two or three short lines
  intro: [
    'The sun has gone out over {world}.',
    'Somebody has to go and fetch it back.',
  ],

  // Shown as dialogue pages after the opening cut scene
  opening: [
    'Everyone in the village is still staring at the sky.',
    '{hero} picks up the {weapon}. Somebody has to do something.',
  ],

  /* ---------- people ----------
     sprite:    a picture in art.js SPRITES (drawn in the world)
     portrait:  a picture in art.js PORTRAITS (shown in dialogue);
                without one, the sprite is shown large instead
     nameable:  true = the player can rename them at New game          */
  people: {
    queen: { name: 'Queen Alison', sprite: 'queen', portrait: 'queen', nameable: true },
    tori: { name: 'Tori', sprite: 'tori', portrait: 'tori', nameable: true },
    brendan: { name: 'Brendan', sprite: 'brendan', portrait: 'brendan', nameable: true },
    kev: { name: 'Kev', sprite: 'kev', portrait: 'kev', nameable: true },
    lauri: { name: 'Lauri', sprite: 'lauri', portrait: 'lauri', nameable: true },
    telk: { name: 'Telkperson', sprite: 'telk', portrait: 'telk', nameable: true },
    nettle: { name: 'Nettle' },
    folk: { name: 'Villager', sprite: 'folk' },
  },

  // Weapon and found items. Ids (thwacker, hopstaff) are used by the game.
  items: {
    thwacker: {
      name: 'Thwacker',
      desc: 'A stubby mallet with a bolt for a head. Knocks foes back a tile.',
    },
    hopstaff: {
      name: 'Hopstaff',
      desc: 'A springy pole. Pinch to vault two tiles, over gaps and foes.',
      found: 'You found the {item}! Press Back, choose it, then pinch to vault over gaps.',
    },
  },

  /* ---------- Kev's elixirs ----------
     price in {coins}. use: heal (full hearts), shield (blocks the next
     two hits), warm (cold stops hurting; for Frostfell), nothing.
     Which shop sells what is in world/regions.js (shops).              */
  elixirs: {
    tonic: {
      name: 'Red Tonic', price: 20, use: 'heal',
      desc: 'Fills every heart. Tastes faintly of strawberries and regret.',
      used: 'Glug. Every heart is full.',
    },
    brew: {
      name: 'Bubble Brew', price: 30, use: 'shield',
      desc: 'A bubble that soaks up the next two hits.',
      used: 'A wobbly bubble wraps round {hero}.',
    },
    warming: {
      name: 'Warming Draught', price: 25, use: 'warm',
      desc: 'Cold tiles stop hurting for a while.',
      used: '{hero} glows pleasantly warm.',
    },
    fizz: {
      name: 'Fizzwhistle', price: 5, use: 'nothing',
      desc: "Does nothing useful. Kev's best seller.",
      used: 'Fizz. Whistle. Nothing else happens. Kev was right.',
    },
  },
  bagMax: 3,    // most of each elixir you can carry

  // Things you pick up or find in chests
  pickups: {
    key: { name: 'Small key', found: 'A small key. It opens one locked door.' },
    bigkey: { name: 'Big key', found: 'The big key! It fits the great door in the Grinding Hall.' },
    heart: { name: 'Heart', found: 'Your hearts are full again.' },
    container: { name: 'Heart vessel', found: 'A heart vessel! {hero} can take one more heart of harm.' },
    coins: { found: '{n} {coins}!' },
    sunstone: {
      name: 'Sunstone',
      found: ['A Sunstone! It hums in {hero}\'s hands, warm as a kettle.', 'One more heart, and the vale outside will have its colour back.'],
    },
  },

  enemies: {
    hog: { name: 'Bristlehog', tip: 'Charges in a line. Too spiky to hit until it smacks a wall.' },
    wisp: { name: 'Spindlewisp', tip: 'Keeps its distance and spits slow embers.' },
    mimmet: { name: 'Mimmet', tip: 'Moves only when you do, in mirror: you go left, it goes right.' },
  },

  boss: {
    name: 'the Kilnwarden',
    intro: [
      'A furnace stirs in the dark. Its grate glows like an eye.',
      'The {boss} wakes. Watch its pattern: only a cool core can be hit.',
    ],
    defeat: [
      'The {boss} cracks, sighs, and goes cold.',
      'For a moment it sounded a lot like {tori} sulking.',
    ],
  },

  // Short messages (toasts). Keep them under about 40 characters.
  messages: {
    locked: 'Locked. Needs a small key',
    unlock: 'Pinch to unlock',
    bigLocked: 'A great lock. Needs the big key',
    sealed: 'Sealed. Solve the room to open it',
    gap: 'Too wide to step across',
    gapHint: 'Equip the {item} to vault',
    noVault: 'No room to land',
    clang: 'Clang! Too spiky to hurt',
    hot: 'Too hot! Wait for it to cool',
    solved: 'Something opened',
    stuck: "It won't budge",
    reset: 'Room reset',
    saved: 'Saved',
    thorns: 'Brambles. Far too thick to push through',
    bubble: 'Pop! The bubble took it',
    poor: 'Not enough {coins}',
    full: "Can't carry any more of those",
    bought: 'Bought: {name}',
    heartsFull: 'Hearts are already full',
  },

  outCold: {
    title: 'Out cold',
    text: '{hero} sees stars, then wakes at the last doorway.',
  },

  ending: {
    title: 'The sun returns',
    lines: [
      'The sun is back, the Queen is home, and everyone is happy in the sun again.',
      'Thanks for playing.',
    ],
  },
};
