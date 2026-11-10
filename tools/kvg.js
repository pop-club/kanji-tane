// テスト用: KanjiVG の SVG を筆跡に変換し、手書きらしい歪みを加える
'use strict';
const fs = require('fs');
const path = require('path');
module.exports = function (kvgDir, seed) {
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rr = (a) => (rnd() * 2 - 1) * a;
// --- KanjiVG SVG path -> polylines ---
function parsePath(d) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e-?\d+)?/g);
  let i = 0, cx = 0, cy = 0, cmd = '', lastC = null; const pts = [];
  const num = () => +toks[i++];
  const bez = (p0, p1, p2, p3) => { for (let t = 1; t <= 12; t++) { const s = t / 12, u = 1 - s;
    pts.push([u*u*u*p0[0]+3*u*u*s*p1[0]+3*u*s*s*p2[0]+s*s*s*p3[0], u*u*u*p0[1]+3*u*u*s*p1[1]+3*u*s*s*p2[1]+s*s*s*p3[1]]); } };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'M') { cx = ox + num(); cy = oy + num(); pts.push([cx, cy]); lastC = null; cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { cx = ox + num(); cy = oy + num(); pts.push([cx, cy]); lastC = null; }
    else if (C === 'C') { const p1 = [ox+num(), oy+num()], p2 = [ox+num(), oy+num()], p3 = [ox+num(), oy+num()];
      bez([cx, cy], p1, p2, p3); lastC = p2; [cx, cy] = p3; }
    else if (C === 'S') { const p1 = lastC ? [2*cx-lastC[0], 2*cy-lastC[1]] : [cx, cy];
      const p2 = [ox+num(), oy+num()], p3 = [ox+num(), oy+num()]; bez([cx, cy], p1, p2, p3); lastC = p2; [cx, cy] = p3; }
    else if (C === 'Z') { } else throw new Error('cmd ' + cmd);
  }
  return pts;
}
function loadKVG(ch) {
  const f = path.join(kvgDir, ch.codePointAt(0).toString(16).padStart(5, '0') + '.svg');
  const svg = fs.readFileSync(f, 'utf8');
  return [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => parsePath(m[1]));
}

// --- 手書きらしい歪みを加える ---
function distort(strokes, level) {
  if (level === 0) return strokes;
  const k = level; // 1: ふつう, 2: 雑
  const rot = rr(5 * k) * Math.PI / 180, sx = 1 + rr(0.08 * k), sy = 1 + rr(0.08 * k), sh = rr(0.06 * k);
  const cos = Math.cos(rot), sin = Math.sin(rot);
  let out = strokes.map((st) => {
    // 字画ごとのずれ・長さの変化
    const n = st.length, c = st[Math.floor(n / 2)];
    const ss = 1 + rr(0.07 * k), dx = rr(2 * k), dy = rr(2 * k);
    const ph = rnd() * 6, amp = 0.6 * k;
    return st.map((p, j) => [c[0] + (p[0] - c[0]) * ss + dx + amp * Math.sin(ph + j * 0.4),
                             c[1] + (p[1] - c[1]) * ss + dy + amp * Math.cos(ph + j * 0.5)]);
  });
  out = out.map((st) => st.map(([x, y]) => { x -= 54.5; y -= 54.5;
    const X = (x + sh * y) * sx, Y = y * sy; return [X * cos - Y * sin + 54.5, X * sin + Y * cos + 54.5]; }));
  // 一部の字画の書き順を入れ替える
  if (out.length > 2 && rnd() < 0.3 * k) { const a = Math.floor(rnd() * out.length), b = Math.floor(rnd() * out.length); [out[a], out[b]] = [out[b], out[a]]; }
  return out;
}

  return { loadKVG, distort };
};
