/* ==========================================================================
   Bamberland — the world: regions, map pages, shops and Telkperson.
   The rooms themselves live in one file per region (wood.js, mill.js…),
   each added with BAMBER_WORLD.add('regionid', { …rooms… }).

   REGIONS
     name    shown on the map
     music   tune for its outdoor screens (data/music.js); rooms can override
     sun     story flag set when its Sunstone comes back. Until then its
             outdoor screens are drawn in the gloom (sparse, cool, dim)

   PAGES  map pages. A room goes on its region's page unless it says
          page: 'other'. Each room gives its square with at: [column, row].

   tint   colour of its dungeons' walls (leave it out for the cyan)
   cut    cut scene played when its Sunstone comes back (data/cutscenes.js)

   SHOPS  which elixirs (data/lore.js) each shopkeeper sells.

   TELKPERSON  pops up when Bodge walks into a room, once per event
   (the first event in the list that applies, one per visit):
     { id, enter: 'room' or ['a','b'], if, unless, has,
       lines: [...], hint: 'shown on the map', give, set }
     if / unless: story flag(s)    has: an elixir in the bag
     give: 'coins:10' | 'tonic' | 'key' | 'heart' | 'container' | an item
     set: a story flag
   ========================================================================== */
window.BAMBER_WORLD = {
  start: 'village',

  regions: {
    wood: { name: "the Queen's Wood", music: 'wood', sun: 'sun_wood', tint: '#7fdc5a', cut: 'sunstone_wood' },
    mill: { name: 'Millbrook Vale', music: 'wood', sun: 'sun_mill', cut: 'sunstone_mill', tint: '#7fd8ff' },
  },

  pages: {
    wood: "The Queen's Wood",
    hollowoak: 'The Hollow Oak',
    mill: 'Millbrook Vale',
    sunkmill: 'The Sunk Mill',
  },

  // Spend this many {coins} in shops and a story flag is set and a cut scene plays.
  // Kev puts every balloon he's paid on his roof: at 99, the shop takes off.
  spendGoal: { at: 99, set: 'balloons99', cut: 'kev99' },

  shops: {
    kev: ['tonic', 'brew', 'fizz', 'kebab'],
  },

  telk: [
    {
      id: 'wood-first', enter: 'woodpath',
      lines: [
        "{telk}! Messenger, parcel-carrier, bearer of news. Running late, as usual.",
        "The Hollow Oak is north of here, past the brambles. {brendan}'s the one for brambles.",
      ],
      hint: 'Ask {brendan} in the village about the brambles.',
    },
    {
      id: 'brambles-down', enter: ['woodpath', 'village'], if: 'brambles',
      lines: [
        "Parcel from {kev}! He says these are for the road.",
        "He also says buy more Fizzwhistle. The brambles are down, by the way. North to the Hollow Oak!",
      ],
      give: 'coins:10',
      hint: 'The Hollow Oak is at the north edge of the wood.',
    },
    {
      id: 'oak-door', enter: 'glade',
      lines: [
        "That's the Hollow Oak. Usually it hums. Today it's growling.",
        "Whatever's sulking at the top, give it a good thwack. I'll wait out here. Guarding things.",
      ],
      hint: 'Find the heart of the Hollow Oak, at the very top.',
    },
    {
      id: 'wood-sun', enter: ['glade', 'woodpath', 'village'], if: 'sun_wood',
      lines: [
        "The wood's got its colour back! And the brambles on the west road have withered away.",
        "Go and see {brendan} first. He's been polishing an anvil all morning, which is unlike him.",
      ],
      hint: '{brendan} in the village can reforge the {weapon}. Then west to Millbrook Vale.',
    },
    {
      id: 'vale-early', enter: 'vale', unless: 'forged1',
      lines: [
        "You're keen! {brendan} was after you, though. Something about that Sunstone and a very big hammer.",
      ],
      hint: 'See {brendan} in the village first. He can reforge the {weapon}.',
    },
    {
      id: 'vale-first', enter: 'vale', if: 'forged1',
      lines: [
        "Millbrook Vale. The wheel's stopped and the river's sulking.",
        "{brendan}'s gone on to the crossing, south of here, to look at the bridge. He's mostly looking at it.",
      ],
      hint: 'Meet {brendan} at the river crossing, south of the vale.',
    },
    {
      id: 'bridge-out', enter: 'crossing', if: 'forged1',
      lines: [
        "Bridge is out, then. That's the road to the Gloommarsh, too. I've got a parcel for over there and everything.",
        '{nettle} at the Mill Gate knows the mill, if it comes to that. North of the vale.',
      ],
      hint: 'Get the wheel of the Sunk Mill turning. {nettle} keeps the Mill Gate, north of the vale.',
    },
    {
      id: 'mill-sluice', enter: 'millwheel', if: 'mill_sluice',
      lines: [
        "Hear that? Water's reached the wheel. It's not turning yet, but the east gate's lifted.",
      ],
      hint: 'The Wheel Pit\'s east gate is open. The gears are that way.',
    },
    {
      id: 'mill-gears', enter: 'millwheel', if: 'mill_gears',
      lines: [
        'The gears are biting! The north gate is up. Something past it is grumbling, and it sounds hot.',
        "It'll want the big key, I expect. Things like that always do.",
      ],
      hint: 'Find the big key, then go north from the Wheel Pit to the Kiln Heart.',
    },
    {
      id: 'timber', enter: ['millwheel', 'millstair', 'millgate', 'vale', 'crossing'], if: 'sun_mill',
      lines: [
        "The wheel's turning! Old timbers are popping loose all over the mill.",
        "I'll carry them down to {brendan}. Don't wait up. Actually, do. They're heavy.",
      ],
      set: 'timber',
      hint: '{brendan} has the timber. Meet him at the crossing, south of the vale.',
    },
    {
      id: 'vale-sun', enter: ['vale', 'crossing'], if: 'bridge',
      lines: [
        'Look at it! Green again, and a bridge. Bluer river, too. You did that.',
        "Two Sunstones home. The road goes on to the Gloommarsh, when it's ready for us.",
      ],
      hint: 'More of Bamberland opens in the next update.',
    },
  ],

  rooms: {},
  add(region, rooms) {
    for (const [id, room] of Object.entries(rooms)) {
      room.region = region;
      this.rooms[id] = room;
    }
  },
};
