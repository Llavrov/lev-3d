// Скиннинг: смесь линейного (LBS) и двойными кватернионами (DQS) по вершинам. Линейное смешивание матриц костей
// при повороте на 60–90° сминает объём: талия при повороте корпуса уходит в жгут, запястье — «конфетой». Двойной
// кватернион смешивает повороты, а не матрицы, и объём сохраняется, но на сгибах (локоть, колено, пах) раздувает
// выпуклость: веса Meshy раздавались под линейный. Поэтому DQS там, где кости крутятся (туловище, шея, плечо,
// предплечье по длине, запястье), LBS — на сгибах. Доля DQS — атрибут dqsMix, считается при загрузке по весам и
// именам костей. Масштаб костей (модель отмасштабирована под рост) учитываем отдельно.
import * as THREE from 'three';

const FN = /* glsl */`
#ifdef USE_SKINNING
attribute float dqsMix;
vec4 dqQuat(mat3 m) {
  float tr = m[0][0] + m[1][1] + m[2][2], s;
  if (tr > 0.0) { s = sqrt(tr + 1.0) * 2.0; return vec4((m[1][2] - m[2][1]) / s, (m[2][0] - m[0][2]) / s, (m[0][1] - m[1][0]) / s, 0.25 * s); }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { s = sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2.0; return vec4(0.25 * s, (m[1][0] + m[0][1]) / s, (m[2][0] + m[0][2]) / s, (m[1][2] - m[2][1]) / s); }
  if (m[1][1] > m[2][2]) { s = sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2.0; return vec4((m[1][0] + m[0][1]) / s, 0.25 * s, (m[2][1] + m[1][2]) / s, (m[2][0] - m[0][2]) / s); }
  s = sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2.0; return vec4((m[2][0] + m[0][2]) / s, (m[2][1] + m[1][2]) / s, 0.25 * s, (m[0][1] - m[1][0]) / s);
}
vec4 dqMul(vec4 a, vec4 b) { return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz)); }
void dqAdd(mat4 M, float w, vec4 ref, inout vec4 b0, inout vec4 be, inout float bs) {
  float s = length(M[0].xyz);
  vec4 q = dqQuat(mat3(M) / s);
  if (dot(q, ref) < 0.0) q = -q; // q и −q — один поворот: смешиваем с одной стороны
  b0 += w * q; be += w * 0.5 * dqMul(vec4(M[3].xyz, 0.0), q); bs += w * s;
}
vec3 dqRot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 dqPos(vec4 q, vec4 e) { return 2.0 * (q.w * e.xyz - e.w * q.xyz + cross(q.xyz, e.xyz)); }
#endif
`;
// Знак кватерниона сверяем с первым влиянием: у Meshy и после tools/rig-weights.py первый слот самый тяжёлый.
const BASE = /* glsl */`
#include <skinbase_vertex>
#ifdef USE_SKINNING
  vec4 dqRef = dqQuat(mat3(boneMatX) / length(boneMatX[0].xyz));
  vec4 dqB0 = vec4(0.0), dqBe = vec4(0.0); float dqBs = 0.0;
  dqAdd(boneMatX, skinWeight.x, dqRef, dqB0, dqBe, dqBs);
  dqAdd(boneMatY, skinWeight.y, dqRef, dqB0, dqBe, dqBs);
  dqAdd(boneMatZ, skinWeight.z, dqRef, dqB0, dqBe, dqBs);
  dqAdd(boneMatW, skinWeight.w, dqRef, dqB0, dqBe, dqBs);
  float dqLen = max(length(dqB0), 1e-6); dqB0 /= dqLen; dqBe /= dqLen;
  dqBs /= max(dot(skinWeight, vec4(1.0)), 1e-5);
#endif
`;
const NORMAL = /* glsl */`
#ifdef USE_SKINNING
  vec3 dqN = (bindMatrixInverse * vec4(dqRot(dqB0, (bindMatrix * vec4(objectNormal, 0.0)).xyz), 0.0)).xyz;
  #ifdef USE_TANGENT
    vec3 dqT = (bindMatrixInverse * vec4(dqRot(dqB0, (bindMatrix * vec4(objectTangent, 0.0)).xyz), 0.0)).xyz;
  #endif
#endif
#include <skinnormal_vertex>
#ifdef USE_SKINNING
  objectNormal = mix(objectNormal, dqN, dqsMix);
  #ifdef USE_TANGENT
    objectTangent = mix(objectTangent, dqT, dqsMix);
  #endif
#endif
`;
const VERT = /* glsl */`
#ifdef USE_SKINNING
  vec3 dqV = (bindMatrix * vec4(transformed, 1.0)).xyz;
  vec3 dqP = (bindMatrixInverse * vec4(dqRot(dqB0, dqV * dqBs) + dqPos(dqB0, dqBe), 1.0)).xyz;
#endif
#include <skinning_vertex>
#ifdef USE_SKINNING
  transformed = mix(transformed, dqP, dqsMix);
#endif
`;

export function patchSkinning(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n' + FN)
    .replace('#include <skinbase_vertex>', BASE)
    .replace('#include <skinnormal_vertex>', NORMAL)
    .replace('#include <skinning_vertex>', VERT);
}

function chain(m) {
  if (m.userData.dqs) return; // материал общий у клонов — второй раз функции в шейдер не вставляем
  m.userData.dqs = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) { prev.call(this, sh, r); patchSkinning(sh); };
  m.customProgramCacheKey = function () { return prevKey.call(this) + '|dqs'; };
  m.needsUpdate = true;
}

// Доля DQS по вершине: кости ног и таза — 0 (сгибы колена и паха), остальные — 1. Тоже 0 на шаровых и блоковых
// сгибах руки: где вершину делят плечо и предплечье (локоть) или туловище с ключицей и плечо (плечевой сустав —
// рука над головой раздувала там пузырь, test-out/anat-oh-cmp.png). Кручение плеча у ключицы гасит скрутка плеча,
// а DQS остаётся вдоль плеча, предплечья, на запястье, позвоночнике и шее. Скрутки считаются за свою кость.
// ?dqs=all — DQS везде, для сравнения.
const LEGS = /^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))$/;
const ss = THREE.MathUtils.smoothstep;
export function dqsMix(mesh, all = false) {
  const g = mesh.geometry;
  if (g.attributes.dqsMix) return; // геометрия общая у клонов
  const names = mesh.skeleton.bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
  const leg = names.map((n) => LEGS.test(n)), seg = names.map((n) => n.match(/^(Left|Right)(Arm|ForeArm)(Twist)?$/));
  const trunk = names.map((n, j) => !leg[j] && !/(Arm|Hand)/.test(n)); // позвоночник, шея, голова, ключицы
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, out = new Float32Array(si.count);
  const mixed = (a, b) => ss(Math.min(a, b), 0.01, 0.08); // даже 5 % ключицы на плече при руке над головой дают пузырь
  for (let i = 0; i < si.count; i++) {
    let body = 0, tr = 0;
    const arm = { Left: [0, 0], Right: [0, 0] };
    for (let k = 0; k < 4; k++) {
      const j = si.getComponent(i, k), w = sw.getComponent(i, k), m = seg[j];
      if (!leg[j]) body += w;
      if (trunk[j]) tr += w;
      if (m) arm[m[1]][m[2] === 'Arm' ? 0 : 1] += w;
    }
    const joint = Math.max(mixed(...arm.Left), mixed(...arm.Right), mixed(tr, arm.Left[0]), mixed(tr, arm.Right[0]));
    out[i] = all ? 1 : body * (1 - joint);
  }
  g.setAttribute('dqsMix', new THREE.BufferAttribute(out, 1));
}

// Все скиннированные сетки модели: и обычный материал, и тень (иначе тень гнулась бы по-старому).
export function useDQS(root) {
  const all = /[?&]dqs=all\b/.test(location.search);
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    dqsMix(o, all);
    for (const m of [o.material].flat()) chain(m);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    chain(depth);
    o.customDepthMaterial = depth;
  });
}
