# KanjiCanvas の手本（ref-patterns.js）の小数を 小数1けた に丸めて小さくする（build.sh が使う）
# 値の変化は 0.05 以下で、認識の結果は変わらない（tools/minify_check.js で確認）
import re, sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
head, sep, body = s.partition('KanjiCanvas.refPatterns = [')
def r(m):
    v = round(float(m.group(0)), 1)
    t = ('%.1f' % v).rstrip('0').rstrip('.')
    return '0' if t in ('-0', '') else t
body = re.sub(r'-?\d+\.\d+(?:e-?\d+)?', r, body)
body = re.sub(r'\s+', '', body)
open(dst, 'w', encoding='utf-8').write(head + sep + body + '\n')
