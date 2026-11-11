#!/usr/bin/env python3
"""問題の元ファイルを、手がかりの文字列を含む問題ごとに直すための小さな道具（作業用）
  mark(key)          : key を含む問題の末尾に ※（文の意味で決まることを確認済み）を付ける
  replace(key, new)  : key を含む問題を new に差し替える
  append(key, tail)  : key を含む問題の末尾に tail を足す（文にするため）"""
import re
class Src:
    def __init__(self, path): self.path = path; self.lines = open(path).read().split('\n'); self.miss = []
    def _apply(self, key, fn):
        for i, ln in enumerate(self.lines):
            if ln.startswith('#') or '|' not in ln: continue
            head, qs = ln.rsplit('|', 1)
            qq = [q.strip() for q in qs.split(';')]
            hit = [j for j, q in enumerate(qq) if key in q]
            if hit:
                j = hit[0]; qq[j] = fn(qq[j]); self.lines[i] = head + '| ' + ' ; '.join(qq); return
        self.miss.append(key)
    def mark(self, key): self._apply(key, lambda q: q if q.endswith('※') else q + '※')
    def replace(self, key, new): self._apply(key, lambda q: new)
    def append(self, key, tail): self._apply(key, lambda q: q.rstrip('※') + ' ' + tail)
    def save(self):
        open(self.path, 'w').write('\n'.join(self.lines))
        if self.miss: print('見つからなかった手がかり:', self.miss)
