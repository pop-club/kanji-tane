// 似た漢字ペアの検証: 字Aを書いたとき、出題がBだと何位・距離比はいくつか
'use strict';
const fs=require('fs'),path=require('path');
global.window=globalThis;global.document={addEventListener(){}};
require('../vendor/kanjicanvas/kanji-canvas.js');require('../vendor/kanjicanvas/ref-patterns.js');
const R=require('../js/recognizer.js');
R.setCandidateSet([...fs.readFileSync(path.join(__dirname,'../data/joyo-kanji.txt'),'utf8')]);
const {loadKVG,distort}=require('./kvg.js')(process.argv[2],99);
const pairs=[['土','士'],['末','未'],['右','石'],['待','持'],['晴','清'],['未','味'],['日','目'],['王','玉'],['大','犬'],['太','犬'],['人','入'],['千','干'],['牛','午'],['矢','失'],['鳥','島'],['問','間'],['貝','見'],['休','体'],['力','刀'],['刀','万']];
const N=+process.env.N||20, LV=+(process.env.LV||1);
const rows=[];
for(const [a,b] of pairs) for(const [w,ask] of [[a,b],[b,a],[a,a],[b,b]]){
  let r1=0,inTop5=0,ratios=[];
  for(let s=0;s<N;s++){const st=distort(loadKVG(w),LV).map(x=>x.map(([p,q])=>[p+10,q+10]));
    const c=R.recognize(st,{width:129,height:129},10);const k=c.findIndex(x=>x.char===ask);
    if(k===0)r1++; if(k>=0&&k<5)inTop5++; if(k>0)ratios.push(c[k].score/c[0].score);}
  rows.push({w,ask,top1:r1/N,top5:inTop5/N,medRatio:ratios.length?ratios.sort((x,y)=>x-y)[ratios.length>>1]:null});
}
for(const r of rows) console.log(`書いた字=${r.w} 出題=${r.ask}\t1位一致=${(r.top1*100).toFixed(0)}%\t上位5に出題=${(r.top5*100).toFixed(0)}%\t距離比中央値=${r.medRatio?r.medRatio.toFixed(2):'-'}`);
if(process.env.JSONOUT)fs.writeFileSync(process.env.JSONOUT,JSON.stringify(rows));
