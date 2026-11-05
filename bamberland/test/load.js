/* Loads the game's data and engine into Node, without a browser.
   Used by maps.js and play.js. Run them from the bamberland folder:
     node test/maps.js
     node test/play.js                                                     */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'data/lore.js', 'data/art.js', 'data/music.js', 'data/cutscenes.js',
  'world/regions.js', 'world/wood.js', 'world/oak.js', 'world/mill.js',
  'engine/core.js', 'engine/foes.js', 'engine/town.js',
];

function load() {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  return sandbox;
}

// A game with every hook recorded, ready to drive
function game() {
  const S = load();
  const log = [];
  const rec = (type) => (...a) => log.push({ type, a });
  const hooks = {};
  for (const h of ['toast', 'dialog', 'sound', 'fx', 'save', 'enter', 'win', 'over', 'change', 'cut', 'music', 'shop', 'telk']) hooks[h] = rec(h);
  const g = S.BamberEngine.create({ world: S.BAMBER_WORLD, lore: S.BAMBER_LORE }, hooks);
  return { S, g, log };
}

module.exports = { load, game, ROOT, FILES };
