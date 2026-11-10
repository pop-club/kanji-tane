// 認識精度の自動検証（テスト専用。KanjiVG はアプリに同梱しない）
// usage: node tools/eval.js <kanjivgDir> <chars|grade:1-5> [samples] [noise:0|1|2] [seed]
'use strict';
const fs = require('fs');
const path = require('path');
global.window = globalThis;
global.document = { addEventListener() {} };
const V = path.join(__dirname, '../vendor/kanjicanvas/');
require(V + 'kanji-canvas.js');
require(V + 'ref-patterns.js');
const R = require('../js/recognizer.js');

const [kvgDir, target, samplesArg, noiseArg, seedArg] = process.argv.slice(2);
if (process.env.JOYO) R.setCandidateSet([...fs.readFileSync(path.join(__dirname, '../data/joyo-kanji.txt'), 'utf8')]);
const SAMPLES = +samplesArg || 1, NOISE = +(noiseArg ?? 1);
const seed = +seedArg || 12345;

let chars;
if (target.startsWith('grade:')) {
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/grade-kanji.json'))).grades;
  chars = [...target.slice(6)].flatMap((n) => [...g[n]]);
} else chars = [...target];

const { loadKVG, distort } = require('./kvg.js')(kvgDir, seed);

const res = { n: 0, top1: 0, top5: 0, top10: 0, miss: [], ms: 0 };
for (const ch of chars) {
  const base = loadKVG(ch);
  for (let s = 0; s < SAMPLES; s++) {
    const st = distort(base, NOISE).map((x) => x.map(([a, b]) => [a + 10, b + 10]));
    const t0 = process.hrtime.bigint();
    const cand = R.recognize(st, { width: 129, height: 129 }, 10);
    res.ms += Number(process.hrtime.bigint() - t0) / 1e6;
    const rank = cand.findIndex((c) => c.char === ch);
    res.n++; if (rank === 0) res.top1++; if (rank >= 0 && rank < 5) res.top5++; if (rank >= 0 && rank < 10) res.top10++;
    if (rank !== 0) res.miss.push({ ch, rank, top: cand.slice(0, 5).map((c) => c.char).join('') });
  }
}
const pct = (v) => (100 * v / res.n).toFixed(1) + '%';
console.log(JSON.stringify({ target, noise: NOISE, samples: res.n, top1: pct(res.top1), top5: pct(res.top5),
  top10: pct(res.top10), avgMs: (res.ms / res.n).toFixed(1) }));
if (process.env.SHOWMISS) for (const m of res.miss) console.log(`${m.ch}\trank=${m.rank}\t${m.top}`);
if (process.env.JSONOUT) fs.writeFileSync(process.env.JSONOUT, JSON.stringify(res));
