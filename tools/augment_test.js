// 手書きの手本を追加したときの効果と副作用を確かめる
// usage: node tools/augment_test.js <kanjivgDir> <log.json> <手本にする字(各字の最初の記録を使用)>
'use strict';
const fs=require('fs'),path=require('path');
global.window=globalThis;global.document={addEventListener(){}};
require('../vendor/kanjicanvas/kanji-canvas.js');require('../vendor/kanjicanvas/ref-patterns.js');
const R=require('../js/recognizer.js');
R.setCandidateSet([...fs.readFileSync(path.join(__dirname,'../data/joyo-kanji.txt'),'utf8')]);
const [kvgDir,logPath,trainChars]=process.argv.slice(2);
const log=JSON.parse(fs.readFileSync(logPath,'utf8')).log;
const box={width:256,height:256};
const judgeAll=(label,skip)=>{const c={correct:0,retry:0,wrong:0};const det=[];
  log.forEach((r,i)=>{if(skip.has(i))return;const j=R.judge(R.recognize(r.strokes,box,10),r.target);c[j.result]++;if(j.result!=='correct')det.push(r.target+'→'+j.result+'('+(j.seenAs||'')+')');});
  console.log(label,JSON.stringify(c),det.join(' '));};
const {loadKVG,distort}=require('./kvg.js')(kvgDir,7);
const g=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/grade-kanji.json'))).grades;
const all=Object.values(g).join('');
const synth=(label)=>{let n=0,t1=0;const flips=[];for(const ch of all){const st=distort(loadKVG(ch),1).map(x=>x.map(([a,b])=>[a+10,b+10]));const c=R.recognize(st,{width:129,height:129},10);n++;if(c[0]&&c[0].char===ch)t1++;else if(c[0]&&trainChars.includes(c[0].char))flips.push(ch+'→'+c[0].char);}
  console.log(label,'合成1026字 1位',(100*t1/n).toFixed(1)+'%','追加した手本の字に取られた字:',flips.join(' ')||'なし');};
// 手本にした記録は判定対象から外す（自分自身で当たるのは当然なので）
const used=new Set();const pats=[];
for(const ch of trainChars){const i=log.findIndex(r=>r.target===ch);if(i<0)continue;used.add(i);pats.push(R.makePattern(ch,log[i].strokes,box));}
judgeAll('追加前 記録の再判定:',used);synth('追加前');
R.addPatterns(pats);
judgeAll('追加後 記録の再判定:',used);synth('追加後');
console.log('追加した手本:',pats.map(p=>p[0]+'('+p[1]+'画)').join(' '));
