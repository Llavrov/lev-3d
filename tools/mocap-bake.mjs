#!/usr/bin/env node
// Мокап → наши ключи направлениями сегментов (как все позы в swing.js), а не кватернионами костей: так клип садится на
// любой скелет — Meshy, Mixamo, Quaternius UAL (имена как у манекена Unreal). Кадры клипа считаются прямой кинематикой
// three.js в Node, оси — «курс» клипа (вперёд — куда он бежит, x — влево, как у Mixamo), длины — в длинах ноги.
// Цикл режется от касания левой ступни; на выходе на фазу: руки, бёдра и голени направлениями, таз (высота, поворот,
// крен), корпус (наклон, поворот плеч), ступни (вынос, высота, пятка) и профиль маха ступни.
//   node tools/mocap-bake.mjs ref/meshy/lev-rigged.glb --clips walk=Walking,run=Running --out public/anim/gait.json
import * as THREE from 'three';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const FILE = argv[0], OUT = opt('out', 'public/anim/gait.json'), N = +opt('n', 32);
const CLIPS = Object.fromEntries(opt('clips', 'walk=Walking,run=Running').split(',').map((s) => s.split('=')));

// Имена костей: Mixamo/Meshy и манекен Unreal (Quaternius UAL).
const ALIAS = {
  Hips: ['Hips', 'pelvis'], Neck: ['Neck', 'neck_01'], Spine2: ['Spine2', 'spine_03', 'spine_04'],
  LeftArm: ['LeftArm', 'upperarm_l'], LeftForeArm: ['LeftForeArm', 'lowerarm_l'], LeftHand: ['LeftHand', 'hand_l'],
  RightArm: ['RightArm', 'upperarm_r'], RightForeArm: ['RightForeArm', 'lowerarm_r'], RightHand: ['RightHand', 'hand_r'],
  LeftUpLeg: ['LeftUpLeg', 'thigh_l'], LeftLeg: ['LeftLeg', 'calf_l'], LeftFoot: ['LeftFoot', 'foot_l'], LeftToeBase: ['LeftToeBase', 'ball_l'],
  RightUpLeg: ['RightUpLeg', 'thigh_r'], RightLeg: ['RightLeg', 'calf_r'], RightFoot: ['RightFoot', 'foot_r'], RightToeBase: ['RightToeBase', 'ball_r'],
};

// ---------- GLB: узлы и анимации без загрузчика (Node, без DOM) ----------
const buf = readFileSync(FILE), jlen = buf.readUInt32LE(12), J = JSON.parse(buf.subarray(20, 20 + jlen).toString()), BIN = 20 + jlen + 8;
const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(i) {
  const a = J.accessors[i], bv = J.bufferViews[a.bufferView], n = COMP[a.type], off = BIN + (bv.byteOffset || 0) + (a.byteOffset || 0);
  if (a.componentType !== 5126) throw new Error('ожидаю float32 в анимации');
  const stride = (bv.byteStride || n * 4) / 4, out = new Float32Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = buf.readFloatLE(off + (k * stride + c) * 4);
  return out;
}
const nodes = J.nodes.map((n) => {
  const o = new THREE.Object3D(); o.name = n.name ?? '';
  if (n.translation) o.position.fromArray(n.translation);
  if (n.rotation) o.quaternion.fromArray(n.rotation);
  if (n.scale) o.scale.fromArray(n.scale);
  if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
  return o;
});
J.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => nodes[i].add(nodes[c])));
const root = new THREE.Object3D(); for (const i of J.scenes[J.scene ?? 0].nodes) root.add(nodes[i]);
const rest = nodes.map((o) => [o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
const bone = {};
for (const [k, names] of Object.entries(ALIAS)) {
  const o = nodes.find((n) => names.some((nm) => n.name.replace(/^mixamorig:?/, '') === nm || n.name.endsWith(':' + nm)));
  if (!o) throw new Error('нет кости ' + k + ' (' + names.join('/') + ')');
  bone[k] = o;
}
const W = (k) => bone[k].getWorldPosition(new THREE.Vector3());

function sampler(anim) {
  const ch = anim.channels.map((c) => ({ node: nodes[c.target.node], path: c.target.path, t: accessor(anim.samplers[c.sampler].input), v: accessor(anim.samplers[c.sampler].output) }));
  const dur = Math.max(...ch.map((c) => c.t[c.t.length - 1]));
  return { dur, at(time) {
    nodes.forEach((o, i) => { o.position.copy(rest[i][0]); o.quaternion.copy(rest[i][1]); o.scale.copy(rest[i][2]); });
    for (const c of ch) {
      const n = c.t.length; let k = 0;
      while (k < n - 2 && time > c.t[k + 1]) k++;
      const u = n > 1 ? THREE.MathUtils.clamp((time - c.t[k]) / (c.t[k + 1] - c.t[k] || 1), 0, 1) : 0, j = Math.min(k + 1, n - 1);
      if (c.path === 'rotation') {
        const a = new THREE.Quaternion().fromArray(c.v, k * 4), b = new THREE.Quaternion().fromArray(c.v, j * 4);
        c.node.quaternion.copy(a.slerp(b, u));
      } else if (c.path === 'translation' || c.path === 'scale') {
        const a = new THREE.Vector3().fromArray(c.v, k * 3), b = new THREE.Vector3().fromArray(c.v, j * 3);
        c.node[c.path === 'translation' ? 'position' : 'scale'].copy(a.lerp(b, u));
      }
    }
    root.updateMatrixWorld(true);
  } };
}

// Покой: длина ноги, высота таза и щиколотки над полом (пол — y = 0 сцены).
root.updateMatrixWorld(true);
const legLen = W('LeftUpLeg').distanceTo(W('LeftLeg')) + W('LeftLeg').distanceTo(W('LeftFoot'));
const restHip = W('Hips').y, restAnkle = (W('LeftFoot').y + W('RightFoot').y) / 2, restToe = (W('LeftToeBase').y + W('RightToeBase').y) / 2;

const UP = new THREE.Vector3(0, 1, 0), r3 = (v) => +v.toFixed(3);
const out = { src: FILE.split('/').pop(), legLen: r3(legLen), clips: {} };
for (const [key, name] of Object.entries(CLIPS)) {
  const anim = J.animations.find((a) => a.name === name);
  if (!anim) throw new Error('нет клипа ' + name + ': ' + J.animations.map((a) => a.name).join(', '));
  const S = sampler(anim), fps = 120, M = Math.round(S.dur * fps); // кадры клипа плотно, потом на фазу
  const raw = [];
  for (let i = 0; i < M; i++) {
    S.at(i / fps);
    const P = Object.fromEntries(Object.keys(ALIAS).map((k) => [k, W(k)]));
    raw.push(P);
  }
  // Курс: таз смотрит «up × вправо» (вправо — от левого бедра к правому), среднее за цикл.
  const fwd = new THREE.Vector3();
  for (const P of raw) fwd.add(new THREE.Vector3().crossVectors(UP, P.RightUpLeg.clone().sub(P.LeftUpLeg)).setY(0).normalize());
  fwd.normalize();
  const left = new THREE.Vector3().crossVectors(UP, fwd); // x модели — влево (у Mixamo правая в −X)
  const H = (v) => new THREE.Vector3(v.dot(left), v.y, v.dot(fwd)); // в осях курса
  // Скорость клипа «на месте»: опорная ступня едет назад со скоростью бега. Опора — щиколотка или подушечка у пола.
  const lowS = (P, s) => Math.min(P[s + 'Foot'].y - restAnkle, P[s + 'ToeBase'].y - restToe);
  const floor = { Left: Math.min(...raw.map((P) => lowS(P, 'Left'))), Right: Math.min(...raw.map((P) => lowS(P, 'Right'))) };
  const contact = (P, s) => lowS(P, s) - floor[s] < 0.02 * legLen;
  const vz = [];
  for (let i = 1; i < M; i++) for (const s of ['Left', 'Right']) if (contact(raw[i], s) && contact(raw[i - 1], s)) vz.push(-(H(raw[i][s + 'ToeBase']).z - H(raw[i - 1][s + 'ToeBase']).z) * fps);
  vz.sort((a, b) => a - b);
  const speed = vz[Math.floor(vz.length / 2)] ?? 0; // м/с клипа
  // Касание левой: первый кадр опоры после маха.
  const onL = raw.map((P) => contact(P, 'Left')), onR = raw.map((P) => contact(P, 'Right'));
  const i0 = onL.findIndex((c, i) => c && !onL[(i - 1 + M) % M]);
  const dutyOf = (on) => on.filter(Boolean).length / M;
  const offR = onR.findIndex((c, i) => c && !onR[(i - 1 + M) % M]);
  const duty = (dutyOf(onL) + dutyOf(onR)) / 2;
  // Ключи на фазу φ = 0..1 (N точек), φ = 0 — касание левой.
  const samples = [];
  for (let k = 0; k < N; k++) {
    const P = raw[(i0 + Math.round((k / N) * M)) % M], hip = H(P.Hips);
    const d = (a, b) => H(P[b].clone().sub(P[a])).normalize().toArray().map(r3);
    const rel = (s) => { const a = H(P[s + 'Foot']).sub(hip).divideScalar(legLen); return [r3(a.x), r3((P[s + 'Foot'].y - restAnkle) / legLen), r3(a.z)]; };
    const right = P.RightUpLeg.clone().sub(P.LeftUpLeg), sh = P.RightArm.clone().sub(P.LeftArm), trunk = H(P.Neck.clone().sub(P.Hips));
    const yaw = (v) => THREE.MathUtils.radToDeg(Math.atan2(H(v).z, -H(v).x)); // + — правое бедро/плечо вперёд, т. е. поворот влево (как hips/torso в swing.js)
    samples.push({
      hipH: r3(P.Hips.y / restHip), hips: +yaw(right).toFixed(1), torso: +yaw(sh).toFixed(1),
      roll: +THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(right.y / right.length(), -1, 1))).toFixed(1), // + — правое бедро выше
      lean: +THREE.MathUtils.radToDeg(Math.atan2(trunk.z, trunk.y)).toFixed(1), tilt: +THREE.MathUtils.radToDeg(Math.atan2(-trunk.x, trunk.y)).toFixed(1), // tilt + — вправо
      rUp: d('RightArm', 'RightForeArm'), rFo: d('RightForeArm', 'RightHand'), lUp: d('LeftArm', 'LeftForeArm'), lFo: d('LeftForeArm', 'LeftHand'),
      rTh: d('RightUpLeg', 'RightLeg'), rSh: d('RightLeg', 'RightFoot'), lTh: d('LeftUpLeg', 'LeftLeg'), lSh: d('LeftLeg', 'LeftFoot'),
      fl: rel('Left'), fr: rel('Right'),
      tl: r3((P.LeftToeBase.y - restToe) / legLen), tr: r3((P.RightToeBase.y - restToe) / legLen), // подушечка над полом
    });
  }
  // Мах ступни (левая и правая вместе, правая — со сдвигом на полцикла): доля пути вперёд p(u) и высота щиколотки h(u)
  // над опорой (в длинах ноги) на u = 0..1 от отрыва до касания. По ним игра ведёт ступню в махе.
  const prof = { p: [], h: [], heel: [] };
  const swing = [];
  for (const [s, on] of [['Left', onL], ['Right', onR]]) {
    const off = on.findIndex((c, i) => !c && on[(i - 1 + M) % M]); // отрыв
    let len = 0; while (len < M && !on[(off + len) % M]) len++;
    const xs = [], hs = [];
    for (let j = 0; j <= len; j++) { const P = raw[(off + j) % M]; xs.push(H(P[s + 'Foot']).z - H(P.Hips).z + (speed * j) / fps); hs.push((P[s + 'Foot'].y - restAnkle - floor[s]) / legLen); }
    swing.push({ xs, hs, len });
  }
  const K = 12;
  for (let k = 0; k <= K; k++) {
    let p = 0, h = 0;
    for (const { xs, hs, len } of swing) { const j = Math.round((k / K) * len); p += (xs[j] - xs[0]) / (xs[len] - xs[0] || 1) / 2; h += Math.max(0, hs[j]) / 2; }
    prof.p.push(r3(p)); prof.h.push(r3(h));
  }
  out.clips[key] = { name, T: r3(S.dur), speed: r3(speed / legLen), duty: r3(duty), rOffset: r3(((offR - i0 + M) % M) / M), prof, samples };
  console.log(key, name, `T ${S.dur.toFixed(3)} с, скорость ${speed.toFixed(2)} м/с клипа (${(speed / legLen).toFixed(2)} ног/с), опора ${(duty * 100).toFixed(0)}%, правая касается на φ=${(((offR - i0 + M) % M) / M).toFixed(2)}`);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(OUT, (JSON.stringify(out).length / 1024).toFixed(1), 'КБ');
