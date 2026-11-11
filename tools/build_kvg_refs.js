// KanjiVG（CC BY-SA 3.0）の筆画データから、認識用の手本を作る
// usage: node tools/build_kvg_refs.js <kanjivg/kanji ディレクトリ> [1字あたりの数=3] [出力先]
// 1つ目はそのままの形、2つ目以降は形を少しずつ崩したもの（人による書き方の違いを補う）
'use strict';
const fs = require('fs'), path = require('path');
global.window = globalThis; global.document = { addEventListener() {} };
require('../vendor/kanjicanvas/kanji-canvas.js');
const R = require('../js/recognizer.js');
const [kvgDir, nArg, outArg] = process.argv.slice(2);
const N = +nArg || 3;
const out = outArg || path.join(__dirname, '../vendor/kanjivg-refs/kvg-refs.js');
const { loadKVG, distort } = require('./kvg.js')(kvgDir, 2024);
const g = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/grade-kanji.json'))).grades;
const chars = [...Object.values(g).join('')];
const box = { width: 109, height: 109 }; // KanjiVG の座標系
const pats = [];
for (const ch of chars) {
  const b = loadKVG(ch);
  for (let i = 0; i < N; i++) {
    const p = R.makePattern(ch, i === 0 ? b : distort(b, 1), box);
    pats.push([ch, p[1], p[2].map((st) => st.map(([x, y]) => [Math.round(x), Math.round(y)]))]);
  }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out,
  '/*\n * Pop-Kanji 認識用の手本（小1〜小6 ' + chars.length + '字 × ' + N + '）\n' +
  ' * KanjiVG (c) Ulrich Apel の筆画データから作成。形を崩した手本を含む。\n' +
  ' * KanjiVG: https://kanjivg.tagaini.net/\n' +
  ' * このファイルは CC BY-SA 3.0 で提供します: https://creativecommons.org/licenses/by-sa/3.0/\n' +
  ' * 作成ツール: tools/build_kvg_refs.js\n */\n' +
  'window.POPKANJI_KVG_REFS = ' + JSON.stringify(pats) + ';\n');
console.log('手本', pats.length, '件', fs.statSync(out).size, 'bytes →', out);
