// 画をつなげた手本の効果と副作用を比べる
// usage: node tools/merge_eval.js <kanjivgDir> <kvg-refs.js>
'use strict';
const fs=require('fs'),path=require('path');
global.window=globalThis;global.document={addEventListener(){}};
require('../vendor/kanjicanvas/kanji-canvas.js');require('../vendor/kanjicanvas/ref-patterns.js');require(path.resolve(process.argv[3]));
const R=require('../js/recognizer.js');
const STROKES=new Function('window',fs.readFileSync(path.join(__dirname,'../js/stroke-counts.js'),'utf8')+';return window.POPKANJI_STROKES;')({});
R.setCandidateSet([...fs.readFileSync(path.join(__dirname,'../data/joyo-kanji.txt'),'utf8')]);R.setReplaced('衛臨熟数歌社馬鳥鳴島進駅健散験慣敬');R.setKvgRefs(window.POPKANJI_KVG_REFS);
const {loadKVG,distort}=require('./kvg.js')(process.argv[2],77);
const G=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/grade-kanji.json'))).grades;const all=[...Object.values(G).join('')];
const box={width:129,height:129},sh=st=>st.map(x=>x.map(([a,b])=>[a+10,b+10]));
const rate=(set)=>{const c={correct:0,retry:0,wrong:0};for(const[ch,st]of set){c[R.judge(R.recognize(sh(st),box,10),ch).result]++;}return Object.entries(c).map(([k,v])=>k[0]+(100*v/set.length).toFixed(1)).join(' ');};
// 1) 五をつなげて
const b5=loadKVG('五');const five=[];for(let i=0;i<10;i++){const s=distort(b5,1);five.push(['五',[s[0],s[1].concat(s[2]),s[3]]]);}
// 2) 全字：ふつう / 近い画を1か所つなげる（つなげた手本と同じ条件に限らず、いちばん近い組をつなげる）
const normal=[],joined=[];
for(const ch of all){const b=loadKVG(ch);normal.push([ch,distort(b,1)]);
  if(b.length>=3){let best=-1,bd=1e9;for(let k=0;k+1<b.length;k++){const e=b[k][b[k].length-1],s=b[k+1][0];const d=Math.hypot(e[0]-s[0],e[1]-s[1]);if(d<bd){bd=d;best=k;}}
    const s=distort(b,1);joined.push([ch,s.slice(0,best).concat([s[best].concat(s[best+1])],s.slice(best+2))]);}}
// 3) 実際の手書き
const dir=path.join(__dirname,'../data/user-samples');
const logs=fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&f!=='samples.json').flatMap(f=>JSON.parse(fs.readFileSync(path.join(dir,f))).log||[]);
const real={correct:0,retry:0,wrong:0};for(const r of logs)real[R.judge(R.recognize(r.strokes,{width:256,height:256},10),r.target).result]++;
// 4) 似た字の取り違え（実際の手書きを、似た字の答えとして判定）
const pairs='土士 末未 右石 待持 晴清 未味 日目 王玉 大犬 千干 牛午 矢失 休体 力刀 問間'.split(' ');const partner={};for(const p of pairs){const[a,b]=[...p];(partner[a]=partner[a]||[]).push(b);(partner[b]=partner[b]||[]).push(a);}
let fa=0,fn=0;for(const r of logs)for(const b of partner[r.target]||[]){fn++;if(R.judge(R.recognize(r.strokes,{width:256,height:256},10),b).result==='correct')fa++;}
console.log(path.basename(process.argv[3]).padEnd(12),'つなげた五',rate(five),'| ふつう1026字',rate(normal),'| つなげた字',rate(joined),'| 実際の手書き',JSON.stringify(real),'| 似た字の取り違え',fa+'/'+fn);
