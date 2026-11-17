#!/bin/bash
# Пересборка моделей одной командой: чистка весов Meshy и скрутки (tools/rig-weights.py, Блендер без окна),
# сжатие под браузер, отчёт о весах. Исходник ref/meshy/<имя>-rigged.glb → public/models/<имя>-<OUT>.glb.
#   tools/rig-build.sh                 лев и соперник → lev-v2.glb, opp-v2.glb
#   OUT=v3 FLAGS="--auto" tools/rig-build.sh lev    вариант для сравнения (?rig=3 в игре)
# Новая модель: положи ref/meshy/<имя>-rigged.glb (Meshy, скелет Mixamo) и запусти с её именем.
set -eo pipefail
cd "$(dirname "$0")/.."
B=/Applications/Blender.app/Contents/MacOS/Blender
PY=/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13
OUT=${OUT:-v2}
mkdir -p ref/rig
for m in ${*:-lev opp}; do
  echo "== $m"
  $B -b --python tools/rig-weights.py -- ref/meshy/$m-rigged.glb ref/rig/$m-$OUT-raw.glb $FLAGS 2>&1 | grep -E '^(было|стало|Left|Right|копия|групп)|Error|Traceback'
  npx -y @gltf-transform/cli@4 optimize ref/rig/$m-$OUT-raw.glb public/models/$m-$OUT.glb \
    --compress meshopt --texture-compress webp --texture-size 2048 --simplify false 2>&1 | grep -E '^info|rror'
  $PY -I tools/skin-report.py ref/rig/$m-$OUT-raw.glb | tail -1
  # MORPH=1 — ещё корректирующие морфы плеча (<имя>-<OUT>m.glb, ?rig=2m): позы снимаются из игры, нужен dev-сервер.
  # По умолчанию выключены: складку в подмышке убирают слабо, а текстура морфов на телефоне ~24 МБ (docs в скилле human-3d).
  if [ -n "$MORPH" ]; then
    who=$([ "$m" = lev ] && echo lev || echo opp)
    node tools/rig-poses.mjs --who $who --out ref/rig/$m-poses.json --q "&rig=${OUT#v}"
    $B -b --python tools/rig-correctives.py -- ref/rig/$m-$OUT-raw.glb ref/rig/$m-poses.json ref/rig/$m-${OUT}m-raw.glb 2>&1 | grep -E 'мм|ключей'
    npx -y @gltf-transform/cli@4 optimize ref/rig/$m-${OUT}m-raw.glb public/models/$m-${OUT}m.glb \
      --compress meshopt --texture-compress webp --texture-size 2048 --simplify false 2>&1 | grep -E '^info|rror'
  fi
done
