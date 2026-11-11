#!/bin/sh
# 静的ホスティング用に、index.html を完全な HTML 文書にして書き出す
#   build/ : ローカル確認用
#   docs/  : GitHub Pages 用（Settings → Pages → main ブランチの /docs）
set -e
cd "$(dirname "$0")"
for out in build docs; do
  rm -rf "$out" && mkdir -p "$out"
  {
    printf '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    sed -n '1,/<\/style>/p' index.html
    printf '</head>\n<body>\n'
    sed -n '/<\/style>/,$p' index.html | tail -n +2
    printf '</body>\n</html>\n'
  } > "$out/index.html"
  mkdir -p "$out/vendor"
  cp -r js "$out/"
  cp -r vendor/kanjicanvas vendor/kanjivg-refs "$out/vendor/"
  touch "$out/.nojekyll"
done
