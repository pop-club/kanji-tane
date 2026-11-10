// 画数差ペナルティの効果を、実際の手書き記録・合成データ（画をつなげた字を含む）・似た字ペアで比べる
'use strict';
const fs=require('fs'),path=require('path');
global.window=globalThis;global.document={addEventListener(){}};
require('../vendor/kanjicanvas/kanji-canvas.js');require('../vendor/kanjicanvas/ref-patterns.js');
const R=require('../js/recognizer.js');
R.setCandidateSet([...fs.readFileSync(path.join(__dirname,'../data/joyo-kanji.txt'),'utf8')]);
const [kvgDir,logPath]=process.argv.slice(2);
const log=JSON.parse(fs.readFileSync(logPath,'utf8')).log;
const g=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/grade-kanji.json'))).grades;
const all=[...Object.values(g).join('')];
const {loadKVG,distort}=require('./kvg.js')(kvgDir,31);
// 合成サンプルを固定で作る（ふつう / 画を1か所つなげた字）
let s2=77;const rnd=()=>((s2=(s2*1103515245+12345)&0x7fffffff)/0x7fffffff);
const normal=[],merged=[];
for(const ch of all){const st=distort(loadKVG(ch),1).map(x=>x.map(([a,b])=>[a+10,b+10]));normal.push([ch,st]);
  if(st.length>=3){const i=Math.floor(rnd()*(st.length-1));const m=st.slice();m.splice(i,2,st[i].concat(st[i+1]));merged.push([ch,m]);}}
const pairs='土士 末未 右石 待持 晴清 未味 日目 王玉 大犬 人入 千干 牛午 矢失 鳥島 問間 貝見 休体 力刀 刀万 白百 天夫 今令 待特 字学 名各 気汽 校交 線緑 帳張 積績 識織 復複 講構 測側 適敵 輸輪'.split(' ');
const wrongPairs=[];for(const p of pairs){const[a,b]=[...p];for(let k=0;k<5;k++){wrongPairs.push([a,b,distort(loadKVG(a),1)]);wrongPairs.push([b,a,distort(loadKVG(b),1)]);}}
const top1=(set)=>{let ok=0;for(const[ch,st]of set){const c=R.recognize(st,{width:129,height:129},10);if(c[0]&&c[0].char===ch)ok++;}return(100*ok/set.length).toFixed(1)+'%';};
for(const a of [0,0.05,0.1,0.15,0.2,0.3]){R.setStrokePenalty(a);
  const c={correct:0,retry:0,wrong:0};const det=[];for(const r of log){const j=R.judge(R.recognize(r.strokes,{width:256,height:256},10),r.target);c[j.result]++;if(j.result!=='correct')det.push(r.target+'→'+(j.seenAs||'?'));}
  let fa=0;for(const[w,ask,st]of wrongPairs){const j=R.judge(R.recognize(st.map(x=>x.map(([u,v])=>[u+10,v+10])),{width:129,height:129},10),ask);if(j.result==='correct')fa++;}
  console.log(`α=${a}\t手書き記録 正${c.correct}/直${c.retry}/誤${c.wrong} [${det.join(' ')}]\t合成 1位 ${top1(normal)}\t画をつなげた字 1位 ${top1(merged)}\t別字を正解にした ${(100*fa/wrongPairs.length).toFixed(1)}%`);}
