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
// SET=mid のときは中学の漢字（漢検4級〜2級、data/kanken-levels.json）。漢検モードのときだけ読む別ファイルにする
const MID = process.env.SET === 'mid';
const g = MID ? JSON.parse(fs.readFileSync(path.join(__dirname, '../data/kanken-levels.json'))).kanji
  : JSON.parse(fs.readFileSync(path.join(__dirname, '../data/grade-kanji.json'))).grades;
const chars = [...Object.values(g).join('')];
const box = { width: 109, height: 109 }; // KanjiVG の座標系
const pats = [];
const MERGE = process.env.MERGE !== '0', MERGE_DIST = +(process.env.MERGE_DIST || 14), MAX_MERGE = 3;
let merged = 0;
for (const ch of chars) {
  const b = loadKVG(ch);
  const add = (strokes) => { const p = R.makePattern(ch, strokes, box); pats.push([ch, p[1], p[2].map((st) => st.map(([x, y]) => [Math.round(x), Math.round(y)]))]); };
  for (let i = 0; i < N; i++) add(i === 0 ? b : distort(b, 1));
  // 画をつなげて書いた形（前の画の終わりと次の画の始まりが近いところ）。1か所ずつ、元の形と崩した形の2つ
  if (MERGE) {
    let m = 0;
    for (let k = 0; k + 1 < b.length && m < MAX_MERGE; k++) {
      const e = b[k][b[k].length - 1], s = b[k + 1][0];
      if (Math.hypot(e[0] - s[0], e[1] - s[1]) > MERGE_DIST) continue;
      const join = (st) => st.slice(0, k).concat([st[k].concat(st[k + 1])], st.slice(k + 2));
      add(join(b)); add(join(distort(b, 1))); m++; merged++;
    }
  }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out,
  '/*\n * Pop-Kanji 認識用の手本（小1〜小6 ' + chars.length + '字 × ' + N + '）\n' +
  ' * KanjiVG (c) Ulrich Apel の筆画データから作成。形を崩した手本を含む。\n' +
  ' * KanjiVG: https://kanjivg.tagaini.net/\n' +
  ' * このファイルは CC BY-SA 3.0 で提供します: https://creativecommons.org/licenses/by-sa/3.0/\n' +
  ' * 作成ツール: tools/build_kvg_refs.js\n */\n' +
  (MID ? 'window.POPKANJI_KVG_REFS_MID = ' : 'window.POPKANJI_KVG_REFS = ') + JSON.stringify(pats) + ';\n');
console.log('手本', pats.length, '件（画をつなげた形', merged * 2, '件を含む）', fs.statSync(out).size, 'bytes →', out);
