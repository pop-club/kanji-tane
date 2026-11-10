// 検証ページから書き出した「記録と手本」を取り込み、アプリ同梱の手本を作り直す
// usage: node tools/import_samples.js <書き出したJSON> [...]
//  - 判定の記録 → data/user-samples/logs/<日時>.json
//  - 手本       → data/user-samples/samples.json に追加（重複は除く）
//  - js/extra-samples.js を samples.json から作り直す
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const strokes = new Function('window', fs.readFileSync(path.join(root, 'js/stroke-counts.js'), 'utf8') + ';return window.POPKANJI_STROKES;')({});
const store = path.join(root, 'data/user-samples/samples.json');
const all = fs.existsSync(store) ? JSON.parse(fs.readFileSync(store, 'utf8')) : [];
const key = (s) => s.char + '|' + s.at;
const have = new Set(all.map(key));
let added = 0, skipped = [];
for (const f of process.argv.slice(2)) {
  const ex = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (ex.log && ex.log.length) {
    const dir = path.join(root, 'data/user-samples/logs'); fs.mkdirSync(dir, { recursive: true });
    const name = (ex.log[0].at || new Date().toISOString()).replace(/[:.]/g, '-') + '.json';
    fs.writeFileSync(path.join(dir, name), JSON.stringify({ ua: ex.ua, screen: ex.screen, summary: ex.summary, log: ex.log }));
  }
  for (const s of ex.samples || []) {
    if (have.has(key(s))) continue;
    if (strokes[s.char] && s.strokes.length !== strokes[s.char]) { skipped.push(s.char + '(' + s.strokes.length + '画)'); continue; }
    all.push({ char: s.char, strokes: s.strokes, input: s.input, at: s.at }); have.add(key(s)); added++;
  }
}
fs.writeFileSync(store, JSON.stringify(all));
fs.writeFileSync(path.join(root, 'js/extra-samples.js'),
  '// 手書きで登録した手本（同梱分）。tools/import_samples.js で生成する\n' +
  'window.POPKANJI_SAMPLES = ' + JSON.stringify(all.map((s) => ({ char: s.char, strokes: s.strokes }))) + ';\n');
const per = {}; all.forEach((s) => (per[s.char] = (per[s.char] || 0) + 1));
console.log('追加', added, '件 / 合計', all.length, '件', skipped.length ? '/ 画数違いで除外: ' + skipped.join(' ') : '');
console.log(Object.entries(per).map(([c, n]) => c + n).join(' '));
