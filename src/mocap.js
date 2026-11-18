// Ходьба и бег по мокапу: клипы, перенесённые на скелет направлениями сегментов (tools/mocap-bake.mjs →
// public/anim/gait.json), а не кватернионами костей. На фазу шага φ (0 — касание левой) — руки, таз и корпус;
// ступни по фазе ставит player.js (опора стоит на месте, мах — по профилю клипа). Сейчас клипы Walking и Running
// из выгрузки Meshy; другой пакет (Quaternius UAL и т. п.) — тем же скриптом, имена костей он знает.
import * as THREE from 'three';

const smooth = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp;
const VEC = ['rUp', 'rFo', 'lUp', 'lFo'];
let G = null, loading = null;
export const gaitReady = () => !!G;

// Грузится после старта, ~24 КБ; до загрузки игроки ходят по-старому.
export function loadGait(url = '/anim/gait.json') {
  if (!loading && typeof fetch === 'function') loading = fetch(url).then((r) => r.json()).then(setGait).catch(() => {});
  return loading;
}

export const setGait = (j) => { G = prep(j); }; // для тестов и своих клипов

// Повороты и крены — только качание вокруг среднего за цикл (средний разворот плеч клипа — манера актёра, не наша);
// наклон — от среднего наклона шага (бег наклонён сильнее шага). Направления — в Vector3, средние — для «маха» правой.
export function prep(j) {
  const walkLean = mean(j.clips.walk.samples, 'lean');
  for (const c of Object.values(j.clips)) {
    for (const k of ['hips', 'torso', 'roll', 'tilt', 'hipH']) { const m = mean(c.samples, k); for (const s of c.samples) s[k] -= m; }
    for (const s of c.samples) { s.lean -= walkLean; for (const k of [...VEC, 'lTh', 'lSh']) s[k] = new THREE.Vector3(...s[k]); }
    c.mean = Object.fromEntries(VEC.map((k) => [k, c.samples.reduce((a, s) => a.add(s[k]), new THREE.Vector3()).normalize()]));
    c.heel = c.prof.h[0]; // щиколотка над опорой в момент отрыва (пятка вверх), длин ноги
  }
  return j;
}
const mean = (ss, k) => ss.reduce((a, s) => a + s[k], 0) / ss.length;

// Темп по скорости (м/с): период цикла (два шага) как у людей — шаг 1,4 м/с ~1,07 с, трусца 3,3 м/с ~0,74 с,
// спринт 6 м/с ~0,6 с; длина шага — скорость × период. Доля бега в позе, доля опоры, вынос ступни вперёд при касании.
// Под ногу Лёвы (таз–щиколотка 0,77 м, щиколотка у Meshy высоко) шаг на ~7 % чаще: иначе передняя и задняя ступни
// в двойной опоре тянули таз вниз на 9 см. У длинноногих период длиннее (√ длины ноги).
const TV = [[0, 1.12], [1, 1.05], [1.45, 0.98], [2.2, 0.84], [3.3, 0.71], [4.5, 0.64], [6, 0.58], [9, 0.54]];
export function gaitParams(v, L) {
  let i = 0; while (i < TV.length - 2 && v > TV[i + 1][0]) i++;
  const T = lerp(TV[i][1], TV[i + 1][1], THREE.MathUtils.clamp((v - TV[i][0]) / (TV[i + 1][0] - TV[i][0]), 0, 1)) * Math.sqrt(L / 0.77);
  const run = smooth(v, 1.9, 3.0), fast = smooth(v, 3.3, 6); // fast — от трусцы к спринту клипа
  const W = G.clips.walk, R = G.clips.run;
  // Опора: шаг — как в клипе, трусца 0,3, спринт 0,17 — по следу клипа (касание +0,24, отрыв −0,47 длины ноги от таза
  // при цикле 4,3): дольше — задняя ступня к отрыву уже за пределом ноги, и нога в махе висит прямой назад.
  const duty = lerp(W.duty, lerp(0.3, 0.17, fast), run);
  const stance = v * T * duty; // путь тела за опору
  // Где ступня встаёт относительно тазобедренных: доля опорного пути впереди, как в клипах (шаг 0,43, бег 0,34).
  const ahead = stance * lerp(0.43, lerp(0.36, 0.34, fast), run);
  return { v, T, run, fast, duty, rOff: lerp(W.rOffset, R.rOffset, run), ahead, L,
    half: Math.max(0.065, L * lerp(0.085, 0.05, run)), // полширины следа; не уже 6,5 см — ступни не заходят друг в друга
    swing: run * lerp(0.55, 1, fast), // нога в махе: доля бегового клипа (на трусце колено складывается меньше спринта)
    heel: Math.min(1, (L * lerp(W.heel, R.heel, run)) / 0.07) }; // пятка вверх на отрыве (Rig.legs: носок, до 7 см)
}

// Нога в махе направлениями бедра и голени из клипа (левая; правой — зеркально по x) на доле маха u (0 — отрыв,
// 1 — касание), оси скелета. Прямой кинематикой от тазобедренного сустава колено складывается, как у живого:
// на бегу пятка к ягодице. Путь ступни от таза (первая попытка) не годился: при другой длине шага ступня отставала,
// и нога висела прямой назад.
export function swingLeg(u, p) {
  const at = (c) => sample(c, c.duty + THREE.MathUtils.clamp(u, 0, 1) * (1 - c.duty));
  const a = at(G.clips.walk), b = at(G.clips.run);
  return { th: a.lTh.clone().lerp(b.lTh, p.swing).normalize(), sh: a.lSh.clone().lerp(b.lSh, p.swing).normalize() };
}

// Поза на фазе φ: руки направлениями (оси скелета), таз и корпус в градусах, hipH — качание таза (доля высоты).
// Средние руки шага и бега — для правой (с ракеткой она качается меньше вокруг своей позы).
export function gaitPose(phase, p) {
  const a = sample(G.clips.walk, phase), b = sample(G.clips.run, phase), out = {};
  // Размах: на трусце руки и корпус качаются на 2/3 спринта клипа, на медленном шаге — слабее.
  const amp = lerp(lerp(0.6, 1, smooth(p.v, 0.4, 1.3)), lerp(0.65, 1, p.fast), p.run);
  for (const k of ['hips', 'torso', 'roll', 'tilt', 'hipH']) out[k] = lerp(a[k], b[k], p.run) * amp;
  out.lean = lerp(a.lean, b.lean, p.run);
  for (const k of VEC) {
    const m = G.clips.walk.mean[k].clone().lerp(G.clips.run.mean[k], p.run).normalize(), cur = a[k].clone().lerp(b[k], p.run).normalize();
    out[k + 'Mean'] = m; out[k] = m.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(m, cur), amp));
  }
  return out;
}
function sample(c, phase) {
  const N = c.samples.length, x = (((phase % 1) + 1) % 1) * N, i = Math.floor(x) % N, j = (i + 1) % N, f = x - Math.floor(x), A = c.samples[i], B = c.samples[j], o = {};
  for (const k in A) o[k] = typeof A[k] === 'number' ? A[k] + (B[k] - A[k]) * f : A[k]?.isVector3 ? A[k].clone().lerp(B[k], f).normalize() : A[k];
  return o;
}
