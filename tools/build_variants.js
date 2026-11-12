// よくある書き方の手本（KanjiVG の筆画を書きかえたもの）を作る
//  五: 2画目を下の横線の近くまでまっすぐ伸ばし、3画目を2画目より少し左から始める形。
//      この形で書くと 王 に読まれやすかった（実際の書き方の記録で確認）。
// 全体の検証: 小学校の字3078サンプルで判定は変わらず、記録した五7つは まちがい0（正解5・書き直し2）
// usage: node tools/build_variants.js <kanjivg/kanji> vendor/kanjivg-refs/kvg-refs-variants.js
'use strict';
const fs = require('fs');
global.window = globalThis; global.document = { addEventListener() {} };
require('../vendor/kanjicanvas/kanji-canvas.js');
const R = require('../js/recognizer.js');
const [kvgDir, out] = process.argv.slice(2);
const K = require('./kvg.js')(kvgDir, 9001);
const box = { width: 109, height: 109 };
const list = [];
{ // 五
  const b = K.loadKVG('五'), s2 = b[1], s3 = b[2], s4 = b[3];
  const x2 = s2[0][0], y2 = s2[0][1], yb = Math.min(...s4.map((p) => p[1])) - 8, x3s = s3[0][0];
  const sx = x2 - (x2 - x3s) * 0.9;
  for (const lean of [0, 0.6]) for (let k = 0; k < 2; k++) {
    const v2 = []; for (let t = 0; t <= 10; t++) v2.push([x2 - lean * t, y2 + (yb - y2) * 0.85 * t / 10]);
    const v3 = s3.map(([x, y]) => [x < x2 ? sx + (x - x3s) * (x2 - sx) / (x2 - x3s || 1) : x, y]);
    const f = R.features(K.distort([b[0], v2, v3, s4], 1), box).map((s) => s.map((p) => [Math.round(p[0]), Math.round(p[1])]));
    list.push(['五', 4, f]);
  }
}
fs.writeFileSync(out, '/*\n * よくある書き方の手本（tools/build_variants.js で作成）\n * KanjiVG (c) Ulrich Apel の筆画データを書きかえて作成。CC BY-SA 3.0\n */\n' +
  'window.POPKANJI_KVG_REFS = (window.POPKANJI_KVG_REFS || []).concat(' + JSON.stringify(list) + ');\n');
console.log(list.length, '件');
