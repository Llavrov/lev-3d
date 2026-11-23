// Скандинавские сгибания. Стоя на коленях на подушке, пятки зажаты валиком сзади. Тело от колен до головы одной прямой
// (таз не сгибается) и поворачивается вокруг колен: медленно от отвеса до 40° над горизонталью, потом падение до упора
// на ладони (локти согнуты, грудь над полом), толчок руками и возврат к отвесу. Пока руки не нужны, кисти у груди.
import * as THREE from 'three';
import { UP, deg, lerp, smooth, w, mid, key, V, SIDES, sgn, ruSide, cm, shadows, frameMat, stand, trunk, look, reachOf, baseAudit } from '../poses.js';
import { floorSetup, kneeAudit, lowest } from '../floor.js';
import { palmOn, floorHand, blendHand, footAlong, legTo, KNEE_Y } from '../kneel.js';
import { extreme, sink, skin, hipBend } from '../posterior.js';

const PAD = 0.04; // подушка под коленями, м
const LOW = 40, CATCH = 18; // конец медленной части и низ (тело над горизонталью), °
const K = key({ rUp: V(0.25, -0.5, 0.8), rFo: V(-0.6, 0.5, 0.2), lUp: V(-0.25, -0.5, 0.8), lFo: V(0.6, 0.5, 0.2),
  rTh: V(0.06, -1, 0), rSh: V(0.06, -1, 0), lTh: V(-0.06, -1, 0), lSh: V(-0.06, -1, 0) });

// Подушка под коленями и голенями, валик поверх щиколоток на стойках.
function gear(T) {
  const g = new THREE.Group(), soft = new THREE.MeshStandardMaterial({ color: '#2b3a44', roughness: 0.95 }), f = frameMat();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.62, PAD, 0.8), soft); pad.position.set(0, PAD / 2, -0.25); g.add(pad);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(T.rollR, T.rollR, 0.5, 24), new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 }));
  roll.rotation.z = Math.PI / 2; roll.position.copy(T.roll); g.add(roll);
  for (const k of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, T.roll.y + 0.03, 0.04), f); post.position.set(k * 0.28, (T.roll.y + 0.03) / 2, T.roll.z); g.add(post);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 12), f); bar.rotation.z = Math.PI / 2; bar.position.set(0, T.roll.y, T.roll.z); g.add(bar);
  }
  T.add(shadows(g));
}

// Тело под углом el над горизонталью (линия колено → шея), колени в Kn, голени назад по подушке.
function body(T, el) {
  const { rig } = T;
  stand(T); trunk(T, K);
  const cur = w(rig, 'Neck').sub(mid(rig, 'LeftUpLeg', 'RightUpLeg')).normalize();
  const want = new THREE.Vector3(0, Math.sin(deg(el)), Math.cos(deg(el)));
  T.wrap.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(cur, want)); T.wrap.updateMatrixWorld(true);
  const H = T.knee.clone().addScaledVector(want, T.thigh);
  T.wrap.position.add(H.sub(mid(rig, 'LeftUpLeg', 'RightUpLeg'))); T.wrap.updateMatrixWorld(true);
  for (const s of SIDES) {
    const Kn = T.knee.clone().setX(sgn(s) * T.hipHalf), A = T.ankle.clone().setX(sgn(s) * T.hipHalf);
    legTo(T, s, A, Kn.clone().sub(w(rig, s + 'UpLeg')), footAlong(T, s, A.clone().sub(Kn), Math.PI / 2));
  }
  T.want = want; T.front = new THREE.Vector3(0, -Math.cos(deg(el)), Math.sin(deg(el))); // «вперёд» груди
}
// Ладони: доля на полу k (0 — у груди, 1 — упор на полу под плечами, чуть шире и впереди).
function hands(T, k0) {
  const { rig } = T, hand = floorHand();
  for (const s of SIDES) {
    const S = w(rig, s + 'Arm');
    const floor = new THREE.Vector3(S.x + sgn(s) * 0.06, 0.004, S.z + 0.2);
    const chest = mid(rig, 'LeftArm', 'RightArm').addScaledVector(T.want, -0.16).addScaledVector(T.front, 0.2).add(new THREE.Vector3(sgn(s) * 0.09, 0, 0));
    // Рука идёт к полу, только когда достаёт его с согнутым локтем: прямая рука с плоской кистью ломает запястье.
    const k = Math.min(k0, Math.max(0, Math.min(1, (0.97 * reachOf(T, s) - S.distanceTo(floor)) / 0.1)));
    // Кисть у груди ладонью вперёд, пальцы вверх по корпусу; к полу ладонь разворачивается вниз (как в птице-собаке).
    const P = chest.lerp(floor, k); P.y = Math.max(P.y, 0.004);
    const h = blendHand({ F: T.want.clone(), N: T.front.clone() }, hand, k);
    const pole = new THREE.Vector3(sgn(s) * 0.5, -0.2 * (1 - k) + 0.3 * k, -1);
    // Кисть садится на пол по коже: пальцы не уходят в пол.
    for (let j = 0; j < 5; j++) { palmOn(T, s, P, h.F, h.N, pole); rig.relaxHand(s); rig.grip(s, k > 0.999 ? 0.15 : 0.4); const lo = lowest(T, [s + 'Hand']).y; if (Math.abs(lo - 0.004) < 0.003 || (k < 0.999 && lo > 0.004)) break; P.y = Math.max(0.004, P.y + 0.004 - lo); }
    rig.relaxHand(s); rig.grip(s, k > 0.999 ? 0.15 : 0.4);
  }
}

export default {
  id: 'nordic-hamstring',
  name: 'Скандинавские сгибания',
  muscles: { work: ['hamstrings', 'glutes'], stretch: ['hamstrings'], careful: ['hamstrings', 'knee'] },
  phases: [
    { name: 'наклон', cue: 'Тело прямое от колен', tempo_s: 4, stretch: true },
    { name: 'падение', cue: 'Тормози как можно дольше', tempo_s: 1, stretch: true },
    { name: 'возврат', cue: 'Оттолкнись руками вверх', tempo_s: 1 },
  ],
  dose: { sets: '2–3', reps: '4–6', rest_s: 120 },
  mistakes: ['Сгибание в тазу', 'Быстрое падение без торможения'],
  view: 'side',
  flat: 'side',
  setup(T) {
    const { rig } = T;
    floorSetup(T);
    T.thigh = rig.L1; T.knee = new THREE.Vector3(0, PAD + KNEE_Y, 0);
    const dy = KNEE_Y - 0.065; // щиколотка над подушкой, стопа подъёмом вниз
    T.ankle = T.knee.clone().add(new THREE.Vector3(0, -dy, -Math.sqrt(rig.L2 ** 2 - dy * dy)));
    // Валик поверх голеней у щиколоток: по верху кожи в этом месте.
    T.rollR = 0.045; T.roll = new THREE.Vector3(0, 0, T.ankle.z + 0.05);
    body(T, 90);
    let top = -1; skin(T, ['LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'], (v) => { if (Math.abs(v.z - T.roll.z) < T.rollR) top = Math.max(top, v.y + Math.sqrt(T.rollR ** 2 - (v.z - T.roll.z) ** 2) - T.rollR); });
    T.roll.y = top + T.rollR + 0.003;
    gear(T);
  },
  // el: тело над горизонталью; k: ладони к полу.
  motion(i, u) { return i + u; },
  pose(T, { depth }) {
    const i = Math.min(2, Math.floor(depth)), u = depth - i;
    let el, k;
    if (i === 0) { el = lerp(90, LOW, smooth(u)); k = 0; }
    else if (i === 1) { el = lerp(LOW, CATCH, u * u); k = smooth(Math.min(1, u * 1.4)); }
    else { el = lerp(CATCH, 90, smooth(u)); k = 1 - smooth(Math.min(1, u * 2.5)); }
    T.el = el; T.k = k;
    body(T, el);
    look(T, w(T.rig, 'Head').addScaledVector(T.front, 2).addScaledVector(T.want, -0.6), 25); // взгляд вперёд по линии тела, чуть вниз
    hands(T, k);
  },
  audit(T) {
    const { rig } = T, r = baseAudit(T, { feet: [] });
    delete r.m.torso;
    kneeAudit(T, r);
    r.m.el = Math.round(T.el);
    r.m.hip = hipBend(T);
    if (r.m.hip > 12) r.bad.push(`сгиб в тазу ${r.m.hip}°`);
    // Колени на подушке, голени под валиком, корпус и лицо над полом.
    r.m.kneeY = cm(w(rig, 'LeftLeg').y - PAD);
    const under = sink(T, ['LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftUpLeg', 'RightUpLeg'], PAD);
    r.m.padSink = cm(under);
    if (under > 0.015) r.bad.push(`ноги в подушке на ${cm(under)} см`);
    let roll = 0; skin(T, ['LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'], (v) => { const d = Math.hypot(v.y - T.roll.y, v.z - T.roll.z); if (Math.abs(v.x) < 0.25) roll = Math.max(roll, T.rollR - d); });
    r.m.rollIn = cm(roll);
    if (roll > 0.015) r.bad.push(`валик в ногах на ${cm(roll)} см`);
    const legTop = extreme(T, ['LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'], UP, (v) => Math.abs(v.z - T.roll.z) < 0.02);
    r.m.rollGap = cm(T.roll.y - T.rollR - (legTop?.y ?? 0));
    if (r.m.rollGap > 2) r.bad.push(`валик не прижимает голени (${r.m.rollGap} см)`);
    const floorIn = sink(T, ['Spine2', 'Spine1', 'Hips', 'Head', 'Neck', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'], 0);
    r.m.floorSink = cm(floorIn);
    if (floorIn > 0.01) r.bad.push(`тело или руки в полу на ${cm(floorIn)} см`);
    if (T.el <= CATCH + 0.5) for (const s of SIDES) { const g = extreme(T, [s + 'Hand'], UP.clone().negate()).y; r.m['hand' + s[0]] = cm(g); if (g > 0.015) r.bad.push(`${ruSide(s, true)} ладонь над полом`); }
    return r;
  },
};
