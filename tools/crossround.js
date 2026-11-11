// 本人の手書きを手本にした効果を、回をまたいで確かめる（ある回の記録を手本にして、別の回を判定する）
// usage: node tools/crossround.js <記録A.json> <記録B.json>
'use strict';
const fs=require('fs'),path=require('path');
global.window=globalThis;global.document={addEventListener(){}};
require('../vendor/kanjicanvas/kanji-canvas.js');require('../vendor/kanjicanvas/ref-patterns.js');
const R=require('../js/recognizer.js');
const STROKES=new Function('window',fs.readFileSync(path.join(__dirname,'../js/stroke-counts.js'),'utf8')+';return window.POPKANJI_STROKES;')({});
R.setCandidateSet([...fs.readFileSync(path.join(__dirname,'../data/joyo-kanji.txt'),'utf8')]);R.setReplaced('衛臨熟');
const box={width:256,height:256};
// 標準画数どおりに書かれた記録だけを使う（別の字を書いた・画をつなげた記録を除く）
const load=f=>JSON.parse(fs.readFileSync(f,'utf8')).log.filter(r=>r.strokes.length===STROKES[r.target]);
const [A,B]=process.argv.slice(2).map(load);
const W=+(process.env.W||1);R.setUserWeight(W);R.setUserStrict(process.env.STRICT!=='0');
const run=(refs,tests,label)=>{
  for(const use of [false,true]){
    R.setExtras(use?refs.map(r=>R.makePattern(r.target,r.strokes,box)):[]);
    const c={correct:0,retry:0,wrong:0};const bad=[];
    for(const r of tests){const j=R.judge(R.recognize(r.strokes,box,10),r.target);c[j.result]++;if(j.result!=='correct')bad.push(r.target+'→'+j.result[0]+(j.seenAs||''));}
    console.log(label,use?'本人の手本あり':'本人の手本なし',JSON.stringify(c),bad.join(' '));
  }
};
console.log('使える記録: A',A.length,'件 / B',B.length,'件');
run(A,B,'Aを手本→Bを判定');
run(B,A,'Bを手本→Aを判定');
