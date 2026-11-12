// 丸めた手本（ref-patterns.min）で認識の結果が変わらないか確かめる
// usage: node tools/minify_check.js <kanjivg/kanji> <丸めたref-patterns.js> [1字の回数=1]
'use strict';
const fs = require('fs'), path = require('path');
global.window = globalThis; global.document = { addEventListener() {} };
const [kvgDir, minFile, nArg] = process.argv.slice(2);
const N = +nArg || 1;
const load = (f) => { const K = require.resolve('../vendor/kanjicanvas/kanji-canvas.js'); delete require.cache[K]; require(K); require(path.resolve(f)); return window.KanjiCanvas; };
require('../vendor/kanjivg-refs/kvg-refs.js'); require('../vendor/kanjivg-refs/kvg-refs-mid.js');
const { loadKVG, distort } = require('./kvg.js')(kvgDir, 31337);
const G = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/grade-kanji.json'))).grades;
Object.assign(G, JSON.parse(fs.readFileSync(path.join(__dirname, '../data/kanken-levels.json'))).kanji);
const chars = Object.keys(G).filter(g => +g <= 10).flatMap(g => [...G[g]]);
const samples = []; for (const ch of chars) { const b = loadKVG(ch); if (b) for (let i = 0; i < N; i++) samples.push([ch, distort(b, 2)]); }
function run(refFile) {
  load(refFile);
  const RP = require.resolve('../js/recognizer.js'); delete require.cache[RP]; const R = require(RP);
  R.setCandidateSet([...fs.readFileSync(path.join(__dirname, '../data/joyo-kanji.txt'), 'utf8')]);
  R.setReplaced('衛臨熟数歌社馬鳥鳴島進駅健散験慣敬幾御驚駆騒傍離肝貫敢騎鶏駐篤乏薦駄騰駒緻鶴罵箸璃');
  R.setKvgRefs(window.POPKANJI_KVG_REFS.concat(window.POPKANJI_KVG_REFS_MID));
  return samples.map(([ch, st]) => { const c = R.recognize(st, { width: 109, height: 109 }, 10); return [c.slice(0, 5).map(x => x.char).join(''), R.judge(c, ch).result]; });
}
const a = run(path.join(__dirname, '../vendor/kanjicanvas/ref-patterns.js')), b = run(minFile);
let top5 = 0, res = 0; for (let i = 0; i < a.length; i++) { if (a[i][0] !== b[i][0]) top5++; if (a[i][1] !== b[i][1]) res++; }
console.log(`サンプル ${a.length}  上位5の並びが変わった ${top5}  判定が変わった ${res}`);
