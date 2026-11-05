/* ==========================================================================
   Bamberland — music. Each tune is a short original loop, played by the
   game itself through Web Audio, so there are no audio files.

   bpm     speed            bar    beats per bar (3 = waltz, 4 = common time)
   comp    the beats in each bar where the chord plays (1 is the bar's start)
   melody  [note, beats] pairs. Notes are MIDI numbers: 60 = middle C,
           +1 = a semitone up, 72 = C an octave up. 0 is a rest.
   chords  one per bar: [bass note, [chord notes]]
   The melody should add up to the same number of beats as the chords.
   lead   'square' for a brighter, buzzier melody (default 'triangle')
   bass   'octaves' bounces the bass between low and high on every half beat

   Rooms pick a tune with music: 'id'. Outdoor screens default to their
   region's tune (world/regions.js), dungeon rooms to 'dungeon'.
   ========================================================================== */
window.BAMBER_MUSIC = {
  // The Queen's Wood: light and pastoral. 3/4, G major
  wood: {
    bpm: 96, bar: 3, comp: [2, 3],
    melody: [
      [74, 1.5], [71, 0.5], [67, 1],
      [76, 1], [74, 0.5], [72, 0.5], [76, 1],
      [74, 1.5], [72, 0.5], [69, 1],
      [71, 2], [67, 1],
      [79, 1.5], [78, 0.5], [76, 1],
      [76, 1], [72, 1], [76, 1],
      [74, 1], [69, 0.5], [71, 0.5], [72, 1],
      [71, 1], [67, 2],
    ],
    chords: [
      [43, [55, 59, 62]], [48, [55, 60, 64]], [50, [54, 57, 62]], [43, [55, 59, 62]],
      [52, [55, 59, 64]], [48, [55, 60, 64]], [50, [54, 57, 62]], [43, [55, 59, 62]],
    ],
  },

  // Towns: homely. 4/4, F major
  town: {
    bpm: 104, bar: 4, comp: [2, 4],
    melody: [
      [72, 1], [69, 0.5], [70, 0.5], [72, 1], [77, 1],
      [76, 1.5], [74, 0.5], [72, 2],
      [74, 1], [72, 0.5], [70, 0.5], [69, 1], [74, 1],
      [72, 2], [70, 1], [69, 1],
      [69, 1], [70, 0.5], [72, 0.5], [77, 1], [76, 1],
      [74, 1], [72, 1], [76, 1], [79, 1],
      [77, 1], [74, 1], [72, 1], [70, 1],
      [69, 2], [65, 2],
    ],
    chords: [
      [41, [53, 57, 60]], [48, [52, 55, 60]], [50, [53, 57, 62]], [46, [50, 53, 58]],
      [41, [53, 57, 60]], [48, [52, 55, 60]], [48, [52, 55, 58]], [41, [53, 57, 60]],
    ],
  },

  // Kev's big moment: an original, bouncy 80s synth-pop tune. 4/4, D major
  kev: {
    bpm: 132, bar: 4, comp: [2, 4], lead: 'square', bass: 'octaves',
    melody: [
      [74, 0.5], [74, 0.5], [78, 1], [81, 0.5], [78, 0.5], [76, 1],
      [73, 0.5], [76, 0.5], [81, 1.5], [0, 0.5], [79, 0.5], [78, 0.5],
      [78, 0.5], [76, 0.5], [74, 1], [71, 1], [74, 1],
      [76, 1.5], [74, 0.5], [71, 1], [0, 1],
      [81, 0.5], [81, 0.5], [83, 0.5], [81, 0.5], [78, 1], [74, 1],
      [76, 0.5], [78, 0.5], [76, 0.5], [73, 0.5], [69, 2],
      [71, 0.5], [74, 0.5], [79, 1], [78, 0.5], [76, 0.5], [74, 1],
      [76, 1], [73, 1], [74, 2],
    ],
    chords: [
      [38, [62, 66, 69]], [45, [61, 64, 69]], [47, [62, 66, 71]], [43, [62, 67, 71]],
      [38, [62, 66, 69]], [45, [61, 64, 69]], [43, [62, 67, 71]], [45, [61, 64, 69]],
    ],
  },

  // Dungeons: low and curious. 4/4, A minor
  dungeon: {
    bpm: 80, bar: 4, comp: [3],
    melody: [
      [57, 1], [0, 1], [60, 1], [59, 1],
      [56, 2], [0, 1], [59, 1],
      [57, 1], [0, 0.5], [60, 0.5], [64, 1], [62, 1],
      [59, 3], [0, 1],
      [64, 1], [0, 1], [62, 1], [60, 1],
      [62, 1.5], [60, 0.5], [57, 2],
      [56, 1], [59, 1], [62, 1], [64, 1],
      [57, 3], [0, 1],
    ],
    chords: [
      [45, [52, 57, 60]], [40, [52, 56, 59]], [41, [53, 57, 60]], [40, [52, 56, 59]],
      [45, [52, 57, 60]], [38, [50, 53, 57]], [40, [52, 56, 59]], [45, [52, 57, 60]],
    ],
  },
};
