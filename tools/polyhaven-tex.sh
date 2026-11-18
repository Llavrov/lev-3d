#!/bin/zsh
# Текстуры Poly Haven (CC0) из ref/polyhaven/<asset>/ → public/tex/<имя>.webp и <имя>-n.webp (карта нормалей GL), 1024
# (земля и гравий 768: кадр 2 м, хватает). Сжатие подобрано по весу: всё вместе ~3 МБ.
#   zsh tools/polyhaven-tex.sh
# Исходники 2k jpg (газон, земля, гравий, кора, камень) и 1k (штукатурка, доски, кровля) качали с api.polyhaven.com/files/<asset>.
set -e
cd "${0:A:h}/.."
R=${PH:-ref/polyhaven}  # PH — папка исходников, если запускаешь из копии без ref/
typeset -A A=(lawn leafy_grass dirt dirt_floor gravel gravel_floor_02 bark bark_brown_02 stone rustic_stone_wall plaster white_stucco_02 wood wood_planks slate roof_slates_02)
typeset -A Z=(dirt 768 gravel 768)
for n src in ${(kv)A}; do
  d=$(ls $R/$src/*_diff_*.jpg | head -1); m=$(ls $R/$src/*_nor_gl_*.jpg | head -1); z=${Z[$n]:-1024}
  magick $d -resize ${z}x$z -quality 76 -define webp:method=6 public/tex/$n.webp
  magick $m -resize ${z}x$z -quality 70 -define webp:method=6 public/tex/$n-n.webp
  echo "$n: $(du -k public/tex/$n.webp | cut -f1) + $(du -k public/tex/$n-n.webp | cut -f1) КБ"
done
