// KanjiVG から作った手本の効果を、本人の実際の手書き記録で確かめる
// （合成データは KanjiVG 由来なので、評価には使わない）
'use strict';
const fs=require('fs'),path=require('path');
global.window=globalThis;global.document={addEventListener(){}};
require('../vendor/kanjicanvas/kanji-canvas.js');require('../vendor/kanjicanvas/ref-patterns.js');
const R=require('../js/recognizer.js');
const STROKES=new Function('window',fs.readFileSync(path.join(__dirname,'../js/stroke-counts.js'),'utf8')+';return window.POPKANJI_STROKES;')({});
R.setCandidateSet([...fs.readFileSync(path.join(__dirname,'../data/joyo-kanji.txt'),'utf8')]);R.setReplaced('衛臨熟');
const kvgDir=process.argv[2];
const {loadKVG,distort}=require('./kvg.js')(kvgDir,2024);
const g=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/grade-kanji.json'))).grades;
const GRADE=[...Object.values(g).join('')];
const PRIORITY=[...'王玉右午日衛臨熟数歌社馬鳥鳴島進駅健散験慣敬'];
const logs=['2026-11-10-pc-mouse.json','2026-11-11-pc-mouse.json'].flatMap(f=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data/user-samples',f))).log);
const usable=logs.filter(r=>r.strokes.length===STROKES[r.target]);
const make=(chars,variants)=>{const out=[];for(const ch of chars){const base=loadKVG(ch);
  out.push(R.makePattern(ch,base,{width:109,height:109}));
  for(let i=1;i<variants;i++)out.push(R.makePattern(ch,distort(base,1),{width:109,height:109}));}return out;};
const box={width:256,height:256};
const evalLogs=(label,list)=>{const c={correct:0,retry:0,wrong:0};const bad=[];
  for(const r of list){const j=R.judge(R.recognize(r.strokes,box,10),r.target);c[j.result]++;if(j.result!=='correct')bad.push(r.target+'→'+j.result[0]+(j.seenAs||''));}
  console.log(label.padEnd(30),JSON.stringify(c),bad.join(' '));};
const t0=Date.now();
for(const [label,chars,v] of [['手本なし',[],0],['KanjiVG手本 22字×1',PRIORITY,1],['KanjiVG手本 22字×3',PRIORITY,3],['KanjiVG手本 1026字×1',GRADE,1],['KanjiVG手本 1026字×3',GRADE,3]]){
  R.setExtras(v?make(chars,v):[]);
  evalLogs(label+'（全記録'+logs.length+'）',logs);
}
console.log('秒',(Date.now()-t0)/1000);
