// 書く字の合否チェック: 各字を KanjiVG の筆画に「雑な手書き」の歪みを加えて書き（手本とは別の乱数）、
// アプリと同じ設定で判定する。正解にならない字を一覧にする。
// usage: node tools/check_all.js <kanjivg/kanji> [1字の回数=3] [学年…]
'use strict';
const fs = require('fs'), path = require('path');
global.window = globalThis; global.document = { addEventListener() {} };
require('../vendor/kanjicanvas/kanji-canvas.js'); require('../vendor/kanjicanvas/ref-patterns.js');
require('../vendor/kanjivg-refs/kvg-refs.js'); require('../vendor/kanjivg-refs/kvg-refs-mid.js');
const R = require('../js/recognizer.js');
const [kvgDir, nArg, ...gArgs] = process.argv.slice(2);
const N = +nArg || 3;
const { loadKVG, distort } = require('./kvg.js')(kvgDir, 777);
const G = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/grade-kanji.json'))).grades;
Object.assign(G, JSON.parse(fs.readFileSync(path.join(__dirname, '../data/kanken-levels.json'))).kanji);
R.setCandidateSet([...fs.readFileSync(path.join(__dirname, '../data/joyo-kanji.txt'), 'utf8')]);
R.setReplaced('衛臨熟数歌社馬鳥鳴島進駅健散験慣敬幾御驚駆騒傍離肝貫敢騎鶏駐篤乏薦駄騰駒緻鶴罵箸璃');
const grades = gArgs.length ? gArgs : Object.keys(G);
const box = { width: 109, height: 109 };
let tot = { correct: 0, retry: 0, wrong: 0 };
for (const g of grades) {
  R.setKvgRefs(+g >= 7 ? window.POPKANJI_KVG_REFS.concat(window.POPKANJI_KVG_REFS_MID) : window.POPKANJI_KVG_REFS);
  const c = { correct: 0, retry: 0, wrong: 0 }, bad = {};
  for (const ch of G[g]) {
    const base = loadKVG(ch);
    for (let i = 0; i < N; i++) {
      const j = R.judge(R.recognize(distort(base, 2), box, 10), ch);
      c[j.result]++; tot[j.result]++;
      if (j.result !== 'correct') (bad[ch] = bad[ch] || []).push(j.result[0] + (j.seenAs || ''));
    }
  }
  const n = G[g].length * N;
  console.log(`学年${g}: 正解 ${(100 * c.correct / n).toFixed(1)}%  書き直し ${c.retry}  不正解 ${c.wrong} / ${n}`);
  const list = Object.entries(bad).filter(([, v]) => v.length >= 2);
  if (list.length) console.log('  2回以上 正解にならない字:', list.map(([k, v]) => k + '(' + v.join(',') + ')').join(' '));
}
console.log('合計', JSON.stringify(tot));
