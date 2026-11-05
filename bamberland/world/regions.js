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

   TELKPERSON  pops up when Bodge walks into a room, once per event:
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
    mill: { name: 'Millbrook Vale', music: 'wood', sun: 'sun_mill', cut: 'sunstone_mill' },
  },

  pages: {
    wood: "The Queen's Wood",
    hollowoak: 'The Hollow Oak',
    mill: 'Millbrook Vale',
    sunkmill: 'The Sunk Mill',
  },

  shops: {
    kev: ['tonic', 'brew', 'fizz'],
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
      id: 'vale-first', enter: 'vale',
      lines: [
        "Millbrook Vale. The wheel's stopped and the river's sulking.",
        "{nettle} keeps the Mill Gate, just north. Mind the furnace downstairs.",
      ],
      hint: 'Find {nettle} at the Mill Gate, north of the vale.',
    },
    {
      id: 'vale-sun', enter: 'vale', if: 'sun_mill',
      lines: [
        "Look at it! Green again. Bluer river, too. You did that.",
        "Two Sunstones home. The rest of Bamberland's waiting, once the roads open up.",
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
