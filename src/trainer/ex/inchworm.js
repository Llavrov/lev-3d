// Гусеница (цикл 8 с): из стойки наклон, ладони на пол (колени чуть согнуты: руки модели короткие, с прямыми ногами
// до пола не достают), руки шагают вперёд в упор лёжа, потом обратно к стопам, и человек встаёт. Подушечки стоп всё
// время на месте: пока таз уходит вперёд, пятки поднимаются (стопа крутится вокруг подушечки), в упоре стоят носки.
// Тело одним целым: наклон из тазобедренных, спина прямая. Ладони ставятся по одной, кисть на полу пальцами вперёд.
// Упор лёжа: ладонь на 18 см впереди плеча (запястье около 45°), тело прямой линией от плеч до щиколоток.
// Ход «ноги шагают к рукам», как в базе, сдвигает человека вперёд на длину тела, и цикл не замыкается: руки идут назад.
import * as THREE from 'three';
import { key, w, mid, SIDES, sgn, ruSide, cm, smooth, clamp, lerp, stand, trunk, look, baseAudit } from '../poses.js';
import { palmOn, floorHand, blendHand, toesTo, legTo, PALM_Y } from '../kneel.js';
import { measureFloor } from '../warmup.js';

const K = key({});
const FOLD = -50, LEG_F = 0.93, LEG_P = 0.985, AHEAD_P = 0.18, ARM = 0.975; // корпус в наклоне, °; ноги в долях; ладонь от плеча; рука
const N = 4; // шагов каждой рукой туда
const ss = (u, a, b) => smooth(clamp((u - a) / (b - a), 0, 1));
const RX = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);

// Тело по состоянию { beta, phi, leg, elev }: нога от щиколотки к тазу под углом beta от отвеса вперёд, длиной leg
// (доля ноги), пятка поднята на phi (стопа крутится вокруг подушечки), корпус таз → шея на elev над горизонталью.
// Так таз идёт по дуге вокруг стоп, ноги почти прямые: «гусеница» держит таз высоко, пока руки уходят вперёд.
const ankleAt = (T, s, phi) => T.B[s].clone().add(T.v[s].clone().applyQuaternion(RX(phi)));
function body(T, st) {
  const { rig } = T, L = rig.L1 + rig.L2, b = THREE.MathUtils.degToRad(st.beta);
  const A = ankleAt(T, 'Right', st.phi).add(ankleAt(T, 'Left', st.phi)).multiplyScalar(0.5);
  const M = A.clone().add(new THREE.Vector3(0, Math.cos(b), Math.sin(b)).multiplyScalar(st.leg * L));
  stand(T); trunk(T, K, st.elev);
  T.wrap.position.add(M.sub(mid(rig, 'LeftUpLeg', 'RightUpLeg'))); T.wrap.updateMatrixWorld(true);
  for (const s of SIDES) {
    const H = w(rig, s + 'UpLeg'), As = ankleAt(T, s, st.phi), d = As.clone().sub(H).normalize();
    const pole = new THREE.Vector3(sgn(s) * 0.08, d.z, -d.y); // «перед» бедра: колено к носку и к полу
    legTo(T, s, As, pole, RX(st.phi).multiply(T.fq[s]));
    if (st.phi > 0.02) toesTo(T, s, new THREE.Vector3(0, -0.03, 1)); // пальцы лежат на полу
  }
  T.phi = st.phi;
}
// Путь от наклона (p = 0) к упору (p = 1) и от стойки (q = 0) к наклону (q = 1).
const along = (T, p) => ({ beta: lerp(T.F.beta, T.Pk.beta, p), phi: T.Pk.phi * p ** 1.5, leg: lerp(LEG_F, LEG_P, p), elev: lerp(FOLD, T.Pk.elev, p ** 2.2) }); // корпус остаётся вниз, пока руки не ушли далеко: плечи низко, ладони достают пол
const bend = (T, q) => ({ beta: lerp(0, T.F.beta, q), phi: 0, leg: lerp(0.975, LEG_F, q), elev: lerp(86, FOLD, q) });

// Ладонь на полу перед плечом s: рука до запястья ARM своей длины.
function reachPalm(T, s, ahead = null, arm = ARM) {
  const { rig } = T, S = w(rig, s + 'Arm'), [L1, L2] = rig.armLen[s], h = floorHand(), hl = rig.hand[s].len;
  const off = h.F.clone().multiplyScalar(0.62 * hl).addScaledVector(h.N, 0.028); // запястье → середина ладони
  const wy = PALM_Y - off.y, R = arm * (L1 + L2);
  const dz = ahead != null ? ahead - off.z : Math.sqrt(Math.max(0, R * R - (S.y - wy) ** 2));
  return { P: new THREE.Vector3(S.x + sgn(s) * 0.02, PALM_Y, S.z + dz + off.z), dy: S.y - wy, R };
}

// Шаг руки: станции 0..N по пути тела x = N·p; на отрезке [k, k + 1] правая переносится в первой половине, левая во второй.
const WIN = { Right: [0.3, 0.62], Left: [0.66, 0.98] }; // рука встаёт на станцию, когда тело почти дошло: иначе не дотянуться
const BACK = { Right: [0.7, 0.98], Left: [0.4, 0.68] }; // назад руки уходят раньше тела (x убывает)
function handAt(T, s, x, back = false) {
  x = clamp(x, 0, N);
  let k = Math.floor(x), f = x - k;
  if (back) { k = Math.ceil(x) - 1; f = x - k; if (k < 0) { k = 0; f = 0; } } // назад: та же лестница, читается справа
  const [a, b] = (back ? BACK : WIN)[s];
  const m = smooth(clamp((f - a) / (b - a), 0, 1)), st = T.st[s];
  if (k >= N) return { P: st[N].clone(), lift: 0, planted: true, k: N };
  const P = st[k].clone().lerp(st[k + 1], m);
  const lift = 0.07 * Math.sin(Math.PI * m);
  return { P: P.setY(PALM_Y + lift), lift, planted: m <= 0 || m >= 1, k: m >= 1 ? k + 1 : k };
}

export default {
  id: 'inchworm',
  name: 'Гусеница',
  muscles: { work: ['abs', 'delts_front', 'triceps'], stretch: ['hamstrings', 'calves'], careful: ['lower_back', 'wrist'] },
  phases: [
    { name: 'наклон', cue: 'Ладони к полу, колени мягко', tempo_s: 2, stretch: true },
    { name: 'ход', cue: 'Шагай руками в планку', tempo_s: 3 },
    { name: 'возврат', cue: 'Руками назад и встань', tempo_s: 3 },
  ],
  dose: { sets: '2', reps: '8–10', rest_s: 30 },
  mistakes: ['Сгибание коленей сразу', 'Провис таза в планке'],
  view: 'quarter', // сбоку камера, держа весь путь, обрезает стоящего у края кадра
  flat: 'side',
  wide: true,
  follow: true, // путь по полу длиннее роста: кадр держит текущую позу, иначе стоящий человек мелкий (main.js, fit)
  setup(T) {
    const { rig } = T, L = rig.L1 + rig.L2;
    measureFloor(T);
    T.B = {}; T.v = {};
    T.fq = {};
    for (const s of SIDES) { T.B[s] = w(rig, s + 'ToeBase'); T.v[s] = w(rig, s + 'Foot').sub(T.B[s]); T.fq[s] = rig.b[s + 'Foot'].getWorldQuaternion(new THREE.Quaternion()); }
    // Наклон: таз чуть позади щиколоток, пятки на полу, колени согнуты (ноги LEG_F): ладонь достаёт пол перед плечом.
    T.F = { beta: -3, phi: 0, leg: LEG_F, elev: FOLD };
    // Упор: носки стоят (стопа на 65° к полу), ноги прямые, тело прямой линией, плечо так высоко, что ладонь на 18 см
    // впереди него достаёт до пола: угол ноги подбирается.
    T.Pk = { beta: 75, phi: THREE.MathUtils.degToRad(65) - rig.footA0, leg: LEG_P, elev: 15 };
    for (let i = 0; i < 40; i++) {
      body(T, T.Pk);
      const r = reachPalm(T, 'Right', AHEAD_P), S = w(rig, 'RightArm'), wz = r.P.z - 0.62 * rig.hand.Right.len * floorHand().F.z;
      const need = Math.sqrt(Math.max(0, r.R ** 2 - (wz - S.z) ** 2));
      T.Pk.beta += (r.dy - need) * 60; // плечо выше нужного — нога ниже к полу
      T.Pk.elev = 90 - T.Pk.beta;
    }
    // Станции ладоней: в наклоне и в упоре по замеру, между ними — по пути тела.
    T.st = { Left: [], Right: [] };
    for (let k = 0; k <= N; k++) {
      body(T, along(T, k / N));
      for (const s of SIDES) T.st[s].push(k === N ? reachPalm(T, s, AHEAD_P).P : reachPalm(T, s, null, k ? 0.92 : ARM).P); // запас длины руки: тело до станции ещё идёт
    }
  },
  motion(i, u) { return i === 0 ? smooth(u) : i === 1 ? 1 : 1 - u; },
  pose(T, { i, u }) {
    const { rig } = T, h = floorHand();
    let st, x = { Right: 0, Left: 0 }, q = 1, p = 0;
    // Путь тела p и шаги рук: правая впереди тела на четверть шага, левая позади (туда), обратно наоборот.
    if (i === 0) q = smooth(u);
    else if (i === 1) { p = u; x = { Right: N * u, Left: N * u }; }
    else if (u < 2 / 3) { const v = 1 - u * 1.5; p = v; x = { Right: N * v, Left: N * v }; }
    else q = 1 - smooth((u - 2 / 3) * 3);
    st = q < 1 ? bend(T, q) : along(T, p);
    body(T, st);
    T.hand = {}; T.q = q; T.p = p;
    for (const s of SIDES) {
      const pole = new THREE.Vector3(sgn(s) * 0.3, 0, -1);
      if (q < 1) { // руки висят, у пола ложатся на станцию 0
        const S = w(rig, s + 'Arm'), hang = S.clone().add(new THREE.Vector3(sgn(s) * 0.03, -0.62, 0.08)), k = ss(q, 0.45, 1);
        const P = hang.lerp(T.st[s][0], k), hb = blendHand({ F: new THREE.Vector3(0, -1, 0.05), N: new THREE.Vector3(-sgn(s), 0, 0) }, h, k);
        palmOn(T, s, P, hb.F, hb.N, pole);
        rig.grip(s, 0.35 * (1 - k));
        T.hand[s] = { planted: q > 0.999, P };
      } else {
        const a = handAt(T, s, x[s], i === 2);
        palmOn(T, s, a.P, h.F, h.N, pole); rig.grip(s, 0);
        T.hand[s] = a;
      }
    }
    const mp = T.hand.Left.P.clone().add(T.hand.Right.P).multiplyScalar(0.5);
    look(T, mp.add(new THREE.Vector3(0, 0, 0.25)), 30);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    for (const s of SIDES) {
      const B = w(rig, s + 'ToeBase'), d = Math.hypot(B.x - T.B[s].x, B.z - T.B[s].z), dy = B.y - T.B[s].y;
      r.m['ball' + s[0]] = cm(Math.max(d, Math.abs(dy)));
      if (d > 0.015) r.bad.push(`${ruSide(s, true)} стопа скользит (${cm(d)} см)`);
      if (Math.abs(dy) > 0.015) r.bad.push(`${ruSide(s, true)} подушечка ${dy > 0 ? 'над полом' : 'в полу'} (${cm(dy)} см)`);
      const hd = T.hand[s];
      if (hd.planted) {
        const p = rig.palm(s), e = p.distanceTo(hd.P);
        r.m['palm' + s[0]] = cm(e);
        if (e > 0.012) r.bad.push(`${ruSide(s, true)} ладонь не на своём месте на полу (${cm(e)} см)`);
      }
    }
    // Провис или горб в упоре: таз от линии плечи → щиколотки.
    if (T.p > 0.99) {
      const S = mid(rig, 'LeftArm', 'RightArm'), A = mid(rig, 'LeftFoot', 'RightFoot'), M = mid(rig, 'LeftUpLeg', 'RightUpLeg');
      const d = A.clone().sub(S).normalize(), off = M.clone().sub(S), dev = off.addScaledVector(d, -off.dot(d)).y;
      r.m.sag = cm(dev);
      if (Math.abs(dev) > 0.03) r.bad.push(`таз ${dev < 0 ? 'провис' : 'поднят'} в упоре: ${cm(dev)} см`);
    }
    r.m.phi = Math.round(THREE.MathUtils.radToDeg(T.phi)); const Mh = mid(rig, 'LeftUpLeg', 'RightUpLeg'); r.m.M = [cm(Mh.y), cm(Mh.z)];
    delete r.m.torso;
    return r;
  },
};
