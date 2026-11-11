// 同梱する KanjiVG 手本を、本人の実際の手書き記録で評価する
// usage: node tools/kvg_refs_eval.js <kvg-refs.js> [置き換える字]
'use strict';
const fs=require('fs'),path=require('path');
global.window=globalThis;global.document={addEventListener(){}};
require('../vendor/kanjicanvas/kanji-canvas.js');require('../vendor/kanjicanvas/ref-patterns.js');
require(path.resolve(process.argv[2]));
const R=require('../js/recognizer.js');
const STROKES=new Function('window',fs.readFileSync(path.join(__dirname,'../js/stroke-counts.js'),'utf8')+';return window.POPKANJI_STROKES;')({});
R.setCandidateSet([...fs.readFileSync(path.join(__dirname,'../data/joyo-kanji.txt'),'utf8')]);
R.setReplaced(process.argv[3]||'衛臨熟');R.setKvgRefs(window.POPKANJI_KVG_REFS);
const dir=path.join(__dirname,'../data/user-samples');
const logs=fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&f!=='samples.json').flatMap(f=>JSON.parse(fs.readFileSync(path.join(dir,f))).log||[]);
const box={width:256,height:256};
for(const [label,on] of [['KanjiVG手本なし',false],['KanjiVG手本あり',true]]){R.setUseKvg(on);
  for(const [sub,list] of [['全記録',logs],['画数どおり',logs.filter(r=>r.strokes.length===STROKES[r.target])]]){
    const c={correct:0,retry:0,wrong:0};const bad=[];let ms=0;
    for(const r of list){const t=Date.now();const j=R.judge(R.recognize(r.strokes,box,10),r.target);ms+=Date.now()-t;c[j.result]++;if(j.result!=='correct')bad.push(r.target+'→'+j.result[0]+(j.seenAs||''));}
    console.log((label+' '+sub+'('+list.length+')').padEnd(28),JSON.stringify(c),'平均'+(ms/list.length).toFixed(0)+'ms',bad.join(' '));}}
