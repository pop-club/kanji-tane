// 判定しきい値の検証: 距離比 (出題字の距離 / 1位の距離) で「書き直し」と「不正解」を分ける
'use strict';
const fs=require('fs'),path=require('path');
global.window=globalThis;global.document={addEventListener(){}};
require('../vendor/kanjicanvas/kanji-canvas.js');require('../vendor/kanjicanvas/ref-patterns.js');
const R=require('../js/recognizer.js');
R.setCandidateSet([...fs.readFileSync(path.join(__dirname,'../data/joyo-kanji.txt'),'utf8')]);
const {loadKVG,distort}=require('./kvg.js')(process.argv[2],4242);
const pairs='土士 末未 右石 待持 晴清 未味 日目 王玉 大犬 人入 千干 牛午 矢失 鳥島 問間 貝見 休体 力刀 刀万 白百 天夫 今令 待特 字学 名各 気汽 校交 線緑 帳張 積績 識織 復複 講構 測側 績積 適敵 輸輪'.split(' ');
const LV=+(process.env.LV||1),N=+(process.env.N||15);
const rightR=[],wrongR=[];let right=0,right1=0,wrong=0,wrong1=0;
for(const p of pairs){const [a,b]=[...p];for(const [w,ask] of [[a,b],[b,a],[a,a],[b,b]]){const same=w===ask;
 for(let s=0;s<N;s++){const c=R.recognize(distort(loadKVG(w),LV).map(x=>x.map(([u,v])=>[u+10,v+10])),{width:129,height:129},10);
  const k=c.findIndex(x=>x.char===ask);const ratio=k<0?99:c[k].score/c[0].score;
  if(same){right++;if(k===0)right1++;else rightR.push(ratio);}else{wrong++;if(k===0)wrong1++;else wrongR.push(ratio);}}}}
console.log(`正しく書いた: ${right}件 1位=${(100*right1/right).toFixed(1)}%  /  似た別字を書いた: ${wrong}件 誤って1位=${(100*wrong1/wrong).toFixed(1)}%`);
for(const t of [1.05,1.1,1.15,1.2,1.25,1.3,1.4,1.5]){
 const rewriteRight=rightR.filter(r=>r<=t).length, wrongAsWrongOK=wrongR.filter(r=>r>t).length;
 console.log(`τ=${t}: 正しく書いたのに「不正解」= ${(100*(right-right1-rewriteRight)/right).toFixed(1)}%  | 別字を書いて「書き直し」止まり= ${(100*(wrong-wrong1-wrongAsWrongOK)/wrong).toFixed(1)}%  | 別字を書いて「正解」= ${(100*wrong1/wrong).toFixed(1)}%`);}
