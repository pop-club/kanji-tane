#!/bin/sh
# 静的ホスティング用に index.html を完全な HTML 文書として build/ に書き出す
set -e
cd "$(dirname "$0")"
rm -rf build && mkdir -p build
{
  printf '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  sed -n '1,/<\/style>/p' index.html
  printf '</head>\n<body>\n'
  sed -n '/<\/style>/,$p' index.html | tail -n +2
  printf '</body>\n</html>\n'
} > build/index.html
cp -r js vendor data build/
