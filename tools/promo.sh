#!/bin/sh
# Склейка промо-ролика из кадров tools/promo.mjs: 1280×720, H.264, лёгкий, чтобы Telegram играл сразу.
# Название в начале и адрес в конце — PNG из tools/promo-text.mjs (в этой сборке ffmpeg нет drawtext).
# sh tools/promo.sh [папка кадров] [выход]
set -e
IN=${1:-test-out/promo}; OUT=${2:-test-out/lev-3d-promo.mp4}; FF=/opt/homebrew/bin/ffmpeg
N=$(ls "$IN" | grep -c '^f.*\.png$'); DUR=$(echo "$N / 30" | bc -l)
END=$(echo "$DUR - 2.6" | bc -l); FADE=$(echo "$DUR - 0.6" | bc -l)
$FF -y -loglevel error -framerate 30 -i "$IN/f%04d.png" -loop 1 -i test-out/promo-title.png -loop 1 -i test-out/promo-url.png -filter_complex "\
[1]format=rgba,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=2.4:d=0.6:alpha=1[t];\
[2]format=rgba,fade=t=in:st=$END:d=0.4:alpha=1[u];\
[0][t]overlay=shortest=1[a];[a][u]overlay=shortest=1,fade=t=in:st=0:d=0.4,fade=t=out:st=$FADE:d=0.6,format=yuv420p" \
  -c:v libx264 -preset slow -crf 27 -movflags +faststart -an "$OUT"
ls -la "$OUT"
