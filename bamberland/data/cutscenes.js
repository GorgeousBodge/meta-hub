/* ==========================================================================
   Bamberland — cut scenes. Short pixel scenes of a few panels, with simple
   movement and a line or two of text each. Pinch moves on; Back skips.

   A scene:  { music: 'wood', panels: [ … ] }
   A panel:
     text     the line(s) under the picture ({hero}, {tori}… work here)
     dur      seconds the movement takes (then the picture holds still)
     ground   { map: 'meadow', tone: 'day' }  maps are listed below.
              tone 'day', 'gloom', or ['day', 'gloom'] to fade across dur
     layers   drawn in order, later ones on top. Each layer is one picture:
       art      a name from art.js (SPRITES, PROPS, BUILDINGS, OBJECTS,
                PORTRAITS), or 'hero' for Bodge in his cap colours
       x, y     screen position (the stage is 600 × 504). A pair [from, to]
                glides between them over dur
       scale    screen pixels per art pixel (4 = the size used in play)
       face     for 'hero': 'up', 'down', 'left' or 'right'
       flip     true mirrors it
       tone     'day' or 'gloom'. Leave it out to follow the ground
       alpha    1 = solid, 0 = gone; [from, to] fades it
       arc      lifts the middle of a glide by this many pixels (a swoop)
       hop      true: hops on the spot while the panel moves; 1 hops in step,
                0 hops between the others' hops
       show     [from, until] seconds when it is visible (null = for good)
       stars    true: dazed stars above it      bang: true: an amber "!"
       rays     true: soft light rays around it
     Special layers: { bunting: true, sag: [0, 8] }
   Play one from a room with cut: 'id' (first visit), or from talk with
   cut: 'id'. 'opening' plays at New game. Each region's Sunstone scene is
   named in world/regions.js (cut: 'sunstone_wood').
   ========================================================================== */
window.BAMBER_CUTS = {
  maps: {
    // grass (.) flowers (,) trees (T)
    meadow: [
      'TTTT.......TTTT',
      'TT...........TT',
      'T.............T',
      '..............,',
      '.,............T',
      'T.............T',
      'TT..,.........T',
      'TTT..........TT',
      'TTTT....,...TTT',
      'TTTTT......TTTT',
      'TTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTT',
    ],
    vale: [
      'TTTTTTT:TTTTTTT',
      'T~~..,.:....,.T',
      'T~~~...:......T',
      'TT~~~..:......T',
      'T..~~~.:......T',
      'T...~~~:......T',
      'T....~~:......T',
      'T,....~~......T',
      'T......~~.....T',
      'T.......~~....T',
      'T.,......~~...T',
      'TTTTTTTTT~~TTTT',
    ],
  },

  opening: {
    music: 'wood',
    panels: [
      {
        text: "The Queen's Wood, on the sunniest day of the year. {queen} and her loyal subjects are having a lovely time.",
        dur: 1.6,
        ground: { map: 'meadow', tone: 'day' },
        layers: [
          { art: 'sun', x: 440, y: 36 },
          { bunting: true },
          { art: 'brendan', x: 150, y: 214, hop: 1 },
          { art: 'folk', x: 205, y: 214, hop: 0 },
          { art: 'queen', x: 280, y: 214, hop: 1 },
          { art: 'kev', x: 355, y: 214, hop: 0, flip: true },
          { art: 'folk', x: 410, y: 214, hop: 1, flip: true },
          { art: 'hero', face: 'up', x: 280, y: 276 },
        ],
      },
      {
        text: 'Then clouds filled the sky, and the sun disappeared with all it's warmth and joy.',
        dur: 1.8,
        ground: { map: 'meadow', tone: ['day', 'gloom'] },
        layers: [
          { art: 'sun', x: 440, y: 36, alpha: [1, 0.15], tone: 'day' },
          { bunting: true, sag: [0, 8] },
          { art: 'brendan', x: 150, y: 214 },
          { art: 'folk', x: 205, y: 214 },
          { art: 'queen', x: 280, y: 214 },
          { art: 'kev', x: 355, y: 214, flip: true },
          { art: 'folk', x: 410, y: 214, flip: true },
          { art: 'hero', face: 'up', x: 280, y: 276 },
          { art: 'cloud', x: [-120, 260], y: 30, tone: 'day' },
          { art: 'cloud', x: [620, 360], y: 50, flip: true, tone: 'day' },
          { art: 'cloud', x: [-200, 100], y: 80, scale: 3, tone: 'day' },
          { art: 'cloud', x: [640, 240], y: 20, scale: 3, flip: true, tone: 'day' },
        ],
      },
      {
        text: 'The dark witch {tori}, who hates all things sun and fun, swooped down and carried the Queen away. Everyone stood dazed. Everyone except {hero} for he had not been paying attention.',
        dur: 1.6,
        ground: { map: 'meadow', tone: 'gloom' },
        layers: [
          { art: 'cloud', x: 120, y: 20 },
          { art: 'cloud', x: 330, y: 40 },
          { art: 'cloud', x: 40, y: 70, scale: 3 },
          { art: 'cloud', x: 420, y: 70, scale: 3 },
          { art: 'brendan', x: 150, y: 214, stars: true },
          { art: 'folk', x: 205, y: 214, stars: true },
          { art: 'queen', x: 280, y: 214, show: [0, 0.6] },
          { art: 'kev', x: 355, y: 214, flip: true, stars: true },
          { art: 'folk', x: 410, y: 214, flip: true, stars: true },
          { art: 'hero', face: 'up', x: 280, y: 276, tone: 'day' },
          { art: 'tori', x: [640, -120], y: 160, arc: 110, scale: 5, flip: true, tone: 'day', show: [0, 1.6] },
          { art: 'queen', x: [660, -100], y: 210, arc: 110, scale: 3, tone: 'day', show: [0.6, 1.6] },
          { bang: true, x: 297, y: 238, show: [1.6, null] },
        ],
      },
    ],
  },

  sunstone_wood: {
    music: 'wood',
    panels: [
      {
        text: "The Sunstone flares. Over the Queen's Wood, the clouds melt away and thick, throbbing shafts of light penetrate the gloom.",
        dur: 2.2,
        ground: { map: 'meadow', tone: ['gloom', 'day'] },
        layers: [
          { art: 'cloud', x: [120, -200], y: 20, tone: 'day' },
          { art: 'cloud', x: [380, 640], y: 50, flip: true, tone: 'day' },
          { art: 'hero', face: 'down', x: 280, y: 300, tone: 'day' },
          { art: 'sunstone', x: 282, y: [260, 170], scale: 4, tone: 'day', rays: true },
        ],
      },
      {
        text: 'In the village, {brendan} and {kev} blink up at a patch of blue sky.',
        dur: 1.4,
        ground: { map: 'meadow', tone: 'day' },
        layers: [
          { art: 'sun', x: 440, y: 36, alpha: [0, 1] },
          { art: 'brendan', x: 220, y: 230, hop: 1 },
          { art: 'kev', x: 330, y: 230, hop: 0, flip: true },
        ],
      },
      {
        text: 'Somewhere far off, {tori} stamps her foot and slams a door.',
        dur: 1,
        ground: { map: 'meadow', tone: 'gloom' },
        layers: [
          { art: 'cloud', x: 100, y: 30 },
          { art: 'cloud', x: 360, y: 60, flip: true },
          { art: 'tori', x: 268, y: 190, scale: 6, tone: 'day', hop: 1 },
        ],
      },
    ],
  },

  sunstone_mill: {
    panels: [
      {
        text: 'The Sunstone flares. Up above the vale, a patch of sky turns blue.',
        dur: 2.2,
        ground: { map: 'vale', tone: ['gloom', 'day'] },
        layers: [
          { art: 'hero', face: 'down', x: 280, y: 300, tone: 'day' },
          { art: 'sunstone', x: 282, y: [260, 170], scale: 4, tone: 'day', rays: true },
        ],
      },
      {
        text: 'Somewhere far off, {tori} stamps her foot and cranks up the A/C.',
        dur: 1,
        ground: { map: 'meadow', tone: 'gloom' },
        layers: [
          { art: 'cloud', x: 100, y: 30 },
          { art: 'cloud', x: 360, y: 60, flip: true },
          { art: 'tori', x: 268, y: 190, scale: 6, tone: 'day', hop: 1 },
        ],
      },
    ],
  },
};
