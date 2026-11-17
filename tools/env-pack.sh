#!/bin/zsh
# Модели окружения из Meshy (ref/meshy/env/*.glb) → public/models/env: упрощение до заданного числа треугольников,
# meshopt, текстуры 1024 webp.   zsh tools/env-pack.sh chalet 60000   (без аргументов — все)
set -e
cd "${0:A:h}/.."
typeset -A S=(chalet 2048)  # шале большое: в 1024 окна и крыша расплывались
typeset -A T=(chalet 60000 bar 25000 table 20000 umbrella 8000 balls 20000 bike 30000 bench 10000 planter 30000 fountain 25000 roller 12000)  # planter.glb — уже Remesh 30K в Meshy, исходник planter-raw.glb
for n in ${1:-${(k)T}}; do
  src=ref/meshy/env/$n.glb; [[ -f $src ]] || { echo "нет $src"; continue; }
  tris=$(npx -y @gltf-transform/cli@4 inspect $src 2>/dev/null | awk -F'│' '/TRIANGLES/ {gsub(/[ ,]/,"",$6); s+=$6} END {print s}')
  ratio=$(echo "scale=4; r=${2:-$T[$n]}/$tris; if (r>1) 1 else r" | bc)
  npx -y @gltf-transform/cli@4 optimize $src public/models/env/$n.glb --compress meshopt --texture-compress webp --texture-size ${S[$n]:-1024} \
    --simplify-ratio $ratio --simplify-error 0.01 >/dev/null 2>&1
  out=$(npx -y @gltf-transform/cli@4 inspect public/models/env/$n.glb 2>/dev/null | awk -F'│' '/TRIANGLES/ {gsub(/[ ,]/,"",$6); s+=$6} END {print s}')
  echo "$n: $tris → $out треугольников, $(du -k public/models/env/$n.glb | cut -f1) КБ"
done
