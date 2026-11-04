/* ==========================================================================
   Bamberland — characters, items and story text.
   Rename anything here without touching the game code.

   In any text you can write {hero}, {world}, {dungeon}, {weapon}, {item},
   {boss}, {hog}, {wisp}, {mimmet} or a person's id (e.g. {nettle}):
   the game swaps in the current name.
   Keep lines short: about 90 characters per dialogue page fits best.
   ========================================================================== */
window.BAMBER_LORE = {
  world: 'Bamberland',
  dungeon: 'the Sunk Mill',

  hero: {
    name: 'Bodge',
    blurb: 'A small tinkerer with a big cap and a bigger mallet.',
  },

  // Title screen: two or three short lines
  intro: [
    'The mill wheel of {world} has stopped turning.',
    'Something hot sleeps under {dungeon}.',
  ],

  // Shown as dialogue pages when a new game starts
  opening: [
    'The river has gone quiet, and the mill with it.',
    '{hero}, take your {weapon} and find out why.',
  ],

  // Weapon and found item. Ids (thwacker, hopstaff) are used by the game.
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

  // Things you pick up or find in chests
  pickups: {
    key: { name: 'Small key', found: 'A small key. It opens one locked door.' },
    bigkey: { name: 'Big key', found: 'The big key! It fits the great door in the Grinding Hall.' },
    heart: { name: 'Heart', found: 'Your hearts are full again.' },
    container: { name: 'Heart vessel', found: 'A heart vessel! {hero} can take one more heart of harm.' },
    cog: { name: 'Mill Cog', found: 'The Mill Cog, still warm.' },
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
      'Something glints where it stood.',
    ],
  },

  // People you can talk to. Use the id in rooms.js talk entries.
  people: {
    nettle: { name: 'Nettle' },
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
  },

  outCold: {
    title: 'Out cold',
    text: '{hero} sees stars, then wakes at the last doorway.',
  },

  ending: {
    title: 'The wheel turns',
    lines: [
      'With the Mill Cog back in place, the old wheel creaks and turns.',
      'Bamberland has its river back. Thanks for playing this first dungeon.',
    ],
  },
};
