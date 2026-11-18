// Удары кодом по кадрам видео Лёвы (ref/tennis-court.mp4). Позы задаются не углами костей, а куда смотрит каждый сегмент
// в осях игрока (x — вправо, y — вверх, z — к сетке): из позы покоя берём, куда кость смотрит, и доворачиваем.
// Так не важно, как повёрнуты локальные оси костей у скелета Meshy.
import * as THREE from 'three';
import { armTwist, foreTwist } from './twist.js';
import { applyCorrectives } from './correctives.js';

const NAMES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'];
const SEGS = [['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'],
  ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot']];
const SEG_KEY = { RightArm: 'rUp', RightForeArm: 'rFo', LeftArm: 'lUp', LeftForeArm: 'lFo', RightUpLeg: 'rTh', RightLeg: 'rSh', LeftUpLeg: 'lTh', LeftLeg: 'lSh' };
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
const GRIP_A = THREE.MathUtils.degToRad(40), WRIST_MAX = THREE.MathUtils.degToRad(40); // ручка наискосок ладони; предел сгиба запястья
// Пределы суставов: плечевая кость вокруг своей оси, предплечье с кистью (пронация и супинация от «большой палец вперёд»),
// ключица вверх (рука выше плеча) и вперёд (рука поперёк груди) — как лопатка у человека.
const HUM_MAX = THREE.MathUtils.degToRad(90), ROLL_MAX = THREE.MathUtils.degToRad(95), CLAV_UP = THREE.MathUtils.degToRad(24), CLAV_FWD = THREE.MathUtils.degToRad(24); // грудь с ключиц снята весами (tools/rig-weights.py): плечо выходит вперёд, рука поперёк груди не входит в неё
export const LOWER = /^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))$/; // ноги может вести клип бега
const LEAN0 = 6, PELVIS_LEAN = 0.6; // наклон: добавка ко всем ключам (°) и доля таза (pose)

const deg = THREE.MathUtils.degToRad;
const V = (x, y, z) => new THREE.Vector3(-x, y, z).normalize(); // у Mixamo лицо в +Z, правая рука в −X: пишем с x вправо
const flipX = (v) => v.clone().setX(-v.x);

// Ключ позы: hips/torso — поворот вокруг вертикали в градусах (+ — влево, правое плечо идёт к сетке), lean — наклон вперёд,
// руки/ноги — направления сегментов, rk — куда смотрит голова ракетки от ручки, face — нормаль струн.
export const READY = { hips: 0, torso: 0, lean: 12, look: 0, tilt: 0, nod: 0, fist: 0, crouch: 0, // look — поворот головы к мячу (°), tilt — наклон корпуса вбок (°, + вправо); nod, fist — язык тела (player.js); crouch — присед сверх стойки (м, подача)
  lh: 1, lhAt: 1, // lh — левая кисть на ракетке (0..1), lhAt — где: 0 — над правой кистью, 1 — у горла
  rUp: V(0.12, -0.95, 0.28), rFo: V(-0.55, -0.05, 0.85), lUp: V(-0.2, -0.92, 0.3), lFo: V(0.5, 0, 0.88),
  rTh: V(0.2, -1, 0.32), rSh: V(0.06, -1, -0.26), lTh: V(-0.2, -1, 0.32), lSh: V(-0.06, -1, -0.26),
  // Ракетка у пояса по центру, головкой вперёд-влево, ребром кверху, левая держит горло согнутой рукой. Правее центра нельзя:
  // левой руке тогда тянуться через корпус, она выпрямляется, плечо крутится до предела и локоть на коже выглядит вывернутым.
  rk: V(-0.7, 0.3, 0.65), face: V(0.65, 0, 0.75) };
const P = (o) => ({ ...READY, ...o });

// tilt — плечи вбок: в замахе правое плечо ниже (корпус загружен над правой ногой, как на видео), через удар плечи
// переваливаются и в проводке ниже левое — «плечо через плечо». Без этого корпус ходил ровным цилиндром.
// Время ключей от момента удара (с): разворот −0.45, петля −0.17, удар 0, ракетка вверх 0.1, захлёст 0.25, финиш 0.5,
// возврат 0.7, стойка 0.9. Проводка как на видео Лёвы: через 0,1 с ракетка вертикально у головы, к 0,25 с уже над левым
// плечом; кисть у левого плеча, предплечье ниже подбородка (лицо открыто), левая ловит ракетку за горло у плеча.
// Возврат: ракетка выходит вперёд головкой вверх, а не переворачивается вниз перед грудью.
const FH = [
  P({ t: -0.45, hips: -40, torso: -78, lean: 10, lh: 0, tilt: 8,
    rUp: V(0.5, -0.6, -0.6), rFo: V(0.3, 0.3, -0.9), lUp: V(0.35, -0.3, 0.9), lFo: V(0.85, 0.05, 0.5),
    rTh: V(0.2, -1, 0.28), rSh: V(0.05, -1, -0.32), lTh: V(-0.1, -1, 0.38), lSh: V(-0.05, -1, -0.12),
    rk: V(0.35, 0.8, -0.45), face: V(0.2, -0.5, 0.8) }),
  P({ t: -0.17, hips: -35, torso: -75, lean: 12, lh: 0, tilt: 14,
    rUp: V(0.45, -0.85, -0.35), rFo: V(0.2, -0.6, -0.8), lUp: V(0.4, -0.35, 0.85), lFo: V(0.8, 0, 0.6),
    rTh: V(0.22, -1, 0.35), rSh: V(0.06, -1, -0.4), lTh: V(-0.1, -1, 0.5), lSh: V(-0.05, -1, -0.12),
    rk: V(0.45, -0.45, -0.75), face: V(0.2, -0.3, 0.9) }),
  P({ t: 0, hips: 18, torso: 15, lean: 10, lh: 0, tilt: 6,
    rUp: V(0.7, -0.65, 0.3), rFo: V(0.55, -0.35, 0.9), lUp: V(-0.3, -0.85, 0.3), lFo: V(0.55, 0.15, 0.85),
    rTh: V(0.12, -1, -0.15), rSh: V(0.05, -1, -0.3), lTh: V(-0.12, -1, 0.42), lSh: V(-0.05, -1, -0.15),
    rk: V(0.95, 0.05, -0.2), face: V(0, 0.05, 1) }),
  P({ t: 0.1, hips: 35, torso: 45, lean: 8, lh: 0, tilt: -4,
    rUp: V(0.25, -0.05, 0.97), rFo: V(-0.1, 0.9, 0.4), lUp: V(-0.35, -0.85, 0.2), lFo: V(0.3, 0.6, 0.75),
    rTh: V(0.08, -1, -0.22), rSh: V(0.02, -1, -0.38), lTh: V(-0.11, -1, 0.35), lSh: V(-0.05, -1, -0.13),
    rk: V(-0.1, 0.95, 0.2), face: V(-0.7, 0.05, 0.7) }),
  P({ t: 0.25, hips: 45, torso: 68, lean: 6, lh: 0.5, lhAt: 1, tilt: -10,
    rUp: V(-0.35, -0.15, 0.92), rFo: V(-0.45, 0.4, -0.8), lUp: V(-0.3, -0.75, 0.3), lFo: V(0.2, 0.75, 0.6),
    rTh: V(0.05, -1, -0.3), rSh: V(0, -1, -0.45), lTh: V(-0.1, -1, 0.28), lSh: V(-0.05, -1, -0.12),
    rk: V(-0.3, 0.15, -0.94), face: V(-0.9, 0.1, 0.3) }),
  P({ t: 0.5, hips: 45, torso: 70, lean: 5, lh: 1, lhAt: 1, tilt: -10,
    rUp: V(-0.35, -0.3, 0.88), rFo: V(-0.5, 0.35, -0.8), lUp: V(-0.3, -0.8, 0.3), lFo: V(0.2, 0.7, 0.6),
    rTh: V(0.05, -1, -0.28), rSh: V(0, -1, -0.5), lTh: V(-0.1, -1, 0.22), lSh: V(-0.05, -1, -0.1),
    rk: V(-0.3, 0.05, -0.95), face: V(-0.9, 0.1, 0.3) }),
  P({ t: 0.7, hips: 15, torso: 20, lean: 9, lh: 1, lhAt: 1, tilt: -3,
    rUp: V(0.1, -0.85, 0.5), rFo: V(-0.45, 0.35, 0.82), lUp: V(-0.2, -0.85, 0.45), lFo: V(0.45, 0.3, 0.85),
    rk: V(-0.55, 0.45, 0.7), face: V(0.8, 0, 0.6) }),
  P({ t: 0.9 }),
];

// Двуручный бэкхенд: разворот влево, ракетка сзади слева, обе кисти на ручке весь удар (левая — сразу над правой),
// проводка вверх через правое плечо: как на видео Лёвы, к 0,25 с кисти у правого плеча, правый локоть в сторону,
// ракетка обёрнута вокруг плеча почти горизонтально, назад-вправо.
const BH = [
  P({ t: -0.45, hips: 40, torso: 78, lean: 10, lh: 1, lhAt: 0, tilt: -8,
    rUp: V(-0.35, -0.8, -0.25), rFo: V(-0.6, -0.55, -0.6), lUp: V(-0.3, -0.9, -0.1), lFo: V(-0.5, -0.3, 0.5),
    rk: V(-0.3, 0.8, -0.5), face: V(-0.2, -0.5, 0.8) }),
  P({ t: -0.17, hips: 36, torso: 78, lean: 12, lh: 1, lhAt: 0, tilt: -14,
    rUp: V(-0.35, -0.85, -0.3), rFo: V(-0.5, -0.7, -0.45), lUp: V(-0.3, -0.92, -0.2), lFo: V(-0.55, -0.6, 0.3),
    rk: V(-0.5, -0.4, -0.75), face: V(-0.2, -0.3, 0.9) }),
  P({ t: 0, hips: -10, torso: -10, lean: 10, lh: 1, lhAt: 0, tilt: -6,
    rUp: V(-0.5, -0.7, 0.4), rFo: V(-0.55, -0.55, 0.6), lUp: V(-0.15, -0.8, 0.55), lFo: V(-0.1, -0.5, 0.85),
    rk: V(-0.95, 0.05, -0.2), face: V(0, 0.05, 1) }),
  P({ t: 0.1, hips: -30, torso: -40, lean: 8, lh: 1, lhAt: 0, tilt: 4,
    rUp: V(0.1, -0.3, 0.95), rFo: V(0.2, 0.5, 0.85), lUp: V(-0.2, -0.3, 0.95), lFo: V(0.35, 0.45, 0.8),
    rk: V(0.2, 0.85, 0.3), face: V(0.7, 0, 0.7) }),
  P({ t: 0.25, hips: -40, torso: -70, lean: 6, lh: 1, lhAt: 0, tilt: 10,
    rUp: V(0.6, -0.6, 0.5), rFo: V(0.15, 0.95, -0.2), lUp: V(0.55, -0.3, 0.78), lFo: V(0.55, 0.25, -0.8),
    rk: V(0.75, 0.05, -0.65), face: V(0.4, 0.75, 0.3) }),
  P({ t: 0.5, hips: -42, torso: -72, lean: 5, lh: 1, lhAt: 0, tilt: 10,
    rUp: V(0.62, -0.68, 0.4), rFo: V(0.15, 0.95, -0.2), lUp: V(0.55, -0.4, 0.73), lFo: V(0.55, 0.25, -0.8),
    rk: V(0.75, -0.05, -0.65), face: V(0.4, 0.75, 0.3) }),
  P({ t: 0.7, hips: -15, torso: -20, lean: 9, lh: 1, lhAt: 0.6, tilt: 3,
    rUp: V(0.15, -0.85, 0.5), rFo: V(-0.4, 0.35, 0.85), lUp: V(-0.15, -0.85, 0.5), lFo: V(0.45, 0.3, 0.85),
    rk: V(-0.55, 0.45, 0.7), face: V(0.8, 0, 0.6) }),
  P({ t: 0.9 }),
];
// Ноги бэкхенда — зеркало форхенда: нагружена левая.
BH.forEach((k, i) => {
  if (i === BH.length - 1) return;
  const f = FH[i];
  Object.assign(k, { rTh: flipX(f.lTh), rSh: flipX(f.lSh), lTh: flipX(f.rTh), lSh: flipX(f.rSh) });
});

// Кручёный: ракетка уходит ниже мяча, струны чуть закрыты, проводка выше («дворник»).
const topspin = (keys, s) => keys.map((k) => {
  const o = { ...k };
  if (k.t === -0.17) o.rk = V(0.4 * s, -0.75, -0.55);
  if (k.t === 0) { o.rk = V(0.9 * s, -0.18, -0.3); o.face = V(0, -0.12, 1); }
  if (k.t === 0.1) { o.rk = V(-0.05 * s, 1, 0.1); o.face = V(-0.75 * s, 0.1, 0.65); }
  return o;
});
// Смэш: боком к сетке, ракетка за спиной, левая рука показывает на мяч, удар на вытянутой вверх руке, проводка вниз влево.
const OH = [
  P({ t: -0.45, hips: -50, torso: -75, lean: -4,
    rUp: V(0.8, 0.15, -0.5), rFo: V(0.1, 1, -0.1), lUp: V(0.2, 0.85, 0.5), lFo: V(0.2, 0.95, 0.3),
    rk: V(0, 0.8, -0.6), face: V(1, 0, 0) }),
  P({ t: -0.17, hips: -35, torso: -55, lean: -6,
    rUp: V(0.7, 0.5, -0.3), rFo: V(-0.2, -0.5, -0.8), lUp: V(-0.1, 0.3, 0.9), lFo: V(0.1, -0.2, 1),
    rk: V(-0.1, -0.9, -0.4), face: V(0.8, 0, -0.3) }),
  P({ t: 0, hips: 15, torso: 25, lean: 8,
    rUp: V(0.3, 0.92, 0.25), rFo: V(0.25, 0.92, 0.35), lUp: V(-0.5, -0.6, 0.4), lFo: V(0.5, -0.2, 0.8),
    rk: V(0.15, 0.9, 0.45), face: V(0, -0.3, 1) }),
  P({ t: 0.25, hips: 35, torso: 60, lean: 20,
    rUp: V(-0.4, -0.6, 0.7), rFo: V(-0.8, -0.5, 0.2), lUp: V(-0.5, -0.8, -0.2), lFo: V(0.2, -0.3, 0.9),
    rk: V(-0.5, -0.85, -0.1), face: V(-0.6, 0, 0.8) }),
  P({ t: 0.9 }),
];
// Удар с лёта, как у живых игроков у сетки: короткий разворот плеч, замах не дальше плеча, ракетка головкой вверх
// перед корпусом, струны приоткрыты. Удар — толчок вперёд-вниз с лёгкой подрезкой, запястье твёрдое, проводка 30–50 см
// и стоп (0.12 → 0.3 ракетка почти стоит), потом возврат в стойку.
const VFH = [
  P({ t: -0.45, hips: -20, torso: -36, lean: 15,
    rUp: V(0.5, -0.62, 0.2), rFo: V(0.32, 0.25, 0.9), lUp: V(0.2, -0.5, 0.8), lFo: V(0.6, 0, 0.8),
    rk: V(0.28, 0.9, -0.1), face: V(0.3, 0.2, 0.92) }),
  P({ t: -0.17, hips: -22, torso: -40, lean: 15,
    rUp: V(0.58, -0.6, 0.08), rFo: V(0.45, 0.2, 0.8), lUp: V(0.2, -0.5, 0.8), lFo: V(0.6, 0, 0.8),
    rk: V(0.45, 0.8, -0.3), face: V(0.35, 0.3, 0.85) }),
  P({ t: 0, hips: -6, torso: -4, lean: 16,
    rUp: V(0.6, -0.55, 0.55), rFo: V(0.28, 0, 1), lUp: V(-0.3, -0.6, 0.5), lFo: V(0.2, -0.1, 1),
    rk: V(0.5, 0.6, 0.6), face: V(-0.05, 0.3, 1) }),
  P({ t: 0.12, hips: -2, torso: 3, lean: 16,
    rUp: V(0.45, -0.6, 0.7), rFo: V(0.12, -0.15, 1), lUp: V(-0.3, -0.7, 0.4), lFo: V(0.2, -0.2, 1),
    rk: V(0.35, 0.45, 0.82), face: V(-0.15, 0.42, 0.9) }),
  P({ t: 0.3, hips: -2, torso: 3, lean: 15,
    rUp: V(0.45, -0.62, 0.68), rFo: V(0.12, -0.12, 1), lUp: V(-0.3, -0.7, 0.4), lFo: V(0.2, -0.2, 1),
    rk: V(0.35, 0.5, 0.8), face: V(-0.15, 0.4, 0.9) }),
  P({ t: 0.9 }),
];
// Бэкхенд с лёта одной рукой: в замахе левая держит горло, к удару отпускает и уходит назад для равновесия.
const VBH = [
  P({ t: -0.45, hips: 20, torso: 45, lean: 15,
    rUp: V(-0.3, -0.75, 0.45), rFo: V(-0.6, 0.3, 0.6), lUp: V(-0.3, -0.7, 0.5), lFo: V(-0.3, 0.5, 0.7),
    rk: V(-0.4, 0.85, -0.1), face: V(-0.3, 0.15, 0.95) }),
  P({ t: -0.17, hips: 22, torso: 50, lean: 15,
    rUp: V(-0.35, -0.7, 0.35), rFo: V(-0.62, 0.22, 0.6), lUp: V(-0.3, -0.7, 0.4), lFo: V(-0.4, 0.5, 0.6),
    rk: V(-0.5, 0.78, -0.3), face: V(-0.35, 0.3, 0.85) }),
  P({ t: 0, hips: 5, torso: 5, lean: 16,
    rUp: V(-0.45, -0.6, 0.65), rFo: V(-0.35, -0.05, 1), lUp: V(-0.5, -0.7, -0.2), lFo: V(-0.4, -0.2, -0.6),
    rk: V(-0.5, 0.6, 0.6), face: V(0.05, 0.3, 1) }),
  P({ t: 0.12, hips: 2, torso: -2, lean: 16,
    rUp: V(-0.35, -0.65, 0.72), rFo: V(-0.15, -0.15, 1), lUp: V(-0.5, -0.7, -0.3), lFo: V(-0.4, -0.2, -0.6),
    rk: V(-0.3, 0.42, 0.85), face: V(0.15, 0.42, 0.9) }),
  P({ t: 0.3, hips: 2, torso: -2, lean: 15,
    rUp: V(-0.35, -0.67, 0.7), rFo: V(-0.15, -0.12, 1), lUp: V(-0.5, -0.7, -0.3), lFo: V(-0.4, -0.2, -0.6),
    rk: V(-0.3, 0.48, 0.82), face: V(0.15, 0.4, 0.9) }),
  P({ t: 0.9 }),
];
// Варианты по высоте мяча: руки и ракетка в ключах −0.17, 0, 0.12 (0.3 держит позу 0.12), o — остальное (наклон).
// Низкий: глубоко в коленях (player.js), корпус прямой, струны открыты к небу. Высокий: локоть на уровне плеча,
// удар сверху вниз. Полулёт: ракетка у самой земли, струны ровно, короткий подъём вперёд-вверх.
const vary = (keys, arms, o = {}) => keys.map((k) => { const a = arms[k.t === 0.3 ? 0.12 : k.t]; return a && k.t < 0.9 ? { ...k, ...o, ...a } : { ...k }; });
const VFH_LO = vary(VFH, {
  [-0.17]: { rUp: V(0.6, -0.75, 0.1), rFo: V(0.5, 0, 0.85), rk: V(0.6, 0.55, -0.15), face: V(0.3, 0.5, 0.8) },
  0: { rUp: V(0.5, -0.8, 0.35), rFo: V(0.3, -0.45, 0.85), rk: V(0.7, 0.15, 0.65), face: V(-0.05, 0.65, 0.75) },
  0.12: { rUp: V(0.4, -0.75, 0.55), rFo: V(0.15, -0.35, 0.95), rk: V(0.45, 0.25, 0.85), face: V(-0.1, 0.7, 0.65) } }, { lean: 11 });
const VFH_HI = vary(VFH, {
  [-0.17]: { rUp: V(0.75, 0.05, -0.05), rFo: V(0.25, 0.85, 0.3), rk: V(0.3, 0.85, -0.4), face: V(0.4, 0.1, 0.9) },
  0: { rUp: V(0.6, 0.1, 0.75), rFo: V(0.2, 0.55, 0.8), rk: V(0.35, 0.7, 0.6), face: V(-0.05, 0.05, 1) },
  0.12: { rUp: V(0.45, -0.25, 0.85), rFo: V(0.1, -0.2, 1), rk: V(0.25, 0.35, 0.9), face: V(-0.1, 0, 1) } }, { lean: 10 });
const VFH_HALF = vary(VFH, {
  [-0.17]: { rUp: V(0.55, -0.8, 0.05), rFo: V(0.45, -0.45, 0.75), rk: V(0.75, -0.1, 0.2), face: V(0.25, 0.15, 0.95) },
  0: { rUp: V(0.5, -0.85, 0.3), rFo: V(0.3, -0.6, 0.75), rk: V(0.8, -0.3, 0.5), face: V(0, 0.15, 1) },
  0.12: { rUp: V(0.4, -0.7, 0.6), rFo: V(0.15, -0.3, 0.95), rk: V(0.6, 0.15, 0.75), face: V(-0.1, 0.25, 0.95) } }, { lean: 18 });
const VBH_LO = vary(VBH, {
  [-0.17]: { rUp: V(-0.4, -0.8, 0.3), rFo: V(-0.65, -0.1, 0.7), rk: V(-0.6, 0.5, -0.2), face: V(-0.3, 0.5, 0.8) },
  0: { rUp: V(-0.4, -0.8, 0.45), rFo: V(-0.35, -0.5, 0.8), rk: V(-0.7, 0.15, 0.65), face: V(0.05, 0.65, 0.75) },
  0.12: { rUp: V(-0.3, -0.75, 0.6), rFo: V(-0.15, -0.4, 0.9), rk: V(-0.45, 0.25, 0.85), face: V(0.1, 0.7, 0.65) } }, { lean: 11 });
const VBH_HI = vary(VBH, {
  [-0.17]: { rUp: V(-0.5, -0.15, 0.6), rFo: V(-0.55, 0.75, 0.1), rk: V(-0.35, 0.85, -0.35), face: V(-0.4, 0.1, 0.9) },
  0: { rUp: V(-0.5, 0.05, 0.85), rFo: V(-0.3, 0.5, 0.8), rk: V(-0.35, 0.7, 0.6), face: V(0.05, 0.05, 1) },
  0.12: { rUp: V(-0.35, -0.25, 0.9), rFo: V(-0.1, -0.2, 1), rk: V(-0.25, 0.35, 0.9), face: V(0.1, 0, 1) } }, { lean: 10 });
const VBH_HALF = vary(VBH, {
  [-0.17]: { rUp: V(-0.4, -0.85, 0.25), rFo: V(-0.6, -0.4, 0.65), rk: V(-0.75, -0.1, 0.2), face: V(-0.25, 0.15, 0.95) },
  0: { rUp: V(-0.4, -0.85, 0.4), rFo: V(-0.35, -0.6, 0.75), rk: V(-0.8, -0.3, 0.5), face: V(0, 0.15, 1) },
  0.12: { rUp: V(-0.3, -0.75, 0.6), rFo: V(-0.15, -0.35, 0.95), rk: V(-0.6, 0.15, 0.75), face: V(0.1, 0.25, 0.95) } }, { lean: 18 });
// Резаный: замах сверху, струны открыты к небу, удар сверху вниз под мяч, проводка вперёд-вниз, корпус почти не крутится.
// На бэкхенде одна рука ведёт ракетку, вторая уходит назад для равновесия.
const slice = (keys, s) => keys.map((k) => {
  const o = { ...k };
  if (k.t === -0.45) { o.rk = V(0.3 * s, 0.9, -0.3); o.face = V(0.3 * s, 0.5, 0.8); }
  if (k.t === -0.17) { o.rk = V(0.45 * s, 0.6, -0.6); o.face = V(0.2 * s, 0.6, 0.75); }
  if (k.t === 0) { o.rk = V(0.9 * s, 0.25, -0.25); o.face = V(0, 0.45, 1); }
  if (s < 0 && k.t < 0.9) Object.assign(o, { lh: k.t < 0 || k.t > 0.6 ? 1 : 0, lhAt: 1 }); // одной рукой: левая держит горло в замахе и отпускает к удару
  if (k.t === 0.1 || k.t === 0.25) {
    Object.assign(o, { hips: 12 * s, torso: 22 * s, rk: V(0.6 * s, -0.1, 0.8), face: V(0, 0.6, 0.8) });
    if (s > 0) Object.assign(o, { rUp: V(0.4, -0.6, 0.7), rFo: V(0.2, -0.3, 1) });
    else Object.assign(o, { rUp: V(0.1, -0.5, 0.85), rFo: V(0.3, -0.2, 0.95), lUp: V(-0.6, -0.5, -0.6), lFo: V(-0.5, -0.3, -0.8) });
  }
  if (k.t === 0.5) {
    Object.assign(o, { hips: 15 * s, torso: 30 * s, rk: V(0.2 * s, -0.2, 1), face: V(0, 0.7, 0.7) });
    if (s > 0) Object.assign(o, { rUp: V(0.2, -0.6, 0.8), rFo: V(0, -0.3, 1) });
    else Object.assign(o, { rUp: V(0.3, -0.4, 0.85), rFo: V(0.5, -0.2, 0.85), lUp: V(-0.6, -0.5, -0.6), lFo: V(-0.5, -0.3, -0.8) });
  }
  return o;
});
// Смэш и воллеи: левая кисть на ракетке только если оказалась рядом (как раньше), сама не тянется.
const VOLLEYS = { vfh: VFH, 'vfh-lo': VFH_LO, 'vfh-hi': VFH_HI, 'vfh-half': VFH_HALF, vbh: VBH, 'vbh-lo': VBH_LO, 'vbh-hi': VBH_HI, 'vbh-half': VBH_HALF };
for (const keys of [OH, ...Object.values(VOLLEYS)]) keys.forEach((k, i) => { if (i < keys.length - 1) k.lh = 0; });
// Подача сверху (K): боком к сетке, мяч у горла ракетки; руки вниз вместе и вверх вместе — левая подбрасывает мяч над
// головой чуть впереди и правее; «трофей»: колени согнуты, локоть на уровне плеча, ракетка вверх-назад, левая вытянута
// к мячу; ноги разгибаются, ракетка падает за спину; удар вверх на прямой руке в высшей точке, наклон в корт;
// кисть проворачивается наружу (пронация), ракетка уходит вниз вперёд и заканчивает слева у корпуса.
// Время от удара: −1.1 стойка, −0.9 руки вниз, −0.65 выпуск мяча (game.js), −0.38 трофей, −0.14 ракетка за спиной.
export const SERVE_T = { srv: 1.1, 'srv-u': 0.8 }, TOSS_AT = { srv: -0.65, 'srv-u': -0.36 }; // от нажатия до удара и выпуск мяча, с от удара
const SRV = [
  P({ t: -1.1, hips: -40, torso: -50, lean: 6,
    rUp: V(0.2, -0.88, 0.42), rFo: V(-0.3, 0.05, 0.95), lUp: V(-0.05, -0.85, 0.5), lFo: V(0.45, 0.1, 0.88),
    rk: V(-0.25, 0.35, 0.9), face: V(0.95, 0, 0.25) }),
  P({ t: -0.9, hips: -45, torso: -60, lean: 8, lh: 0, crouch: 0.02,
    rUp: V(0.25, -0.96, 0.1), rFo: V(0.2, -0.95, -0.15), lUp: V(-0.05, -0.92, 0.35), lFo: V(0.15, -0.75, 0.65),
    rk: V(0.2, -0.7, -0.68), face: V(0.95, 0.1, -0.2) }),
  P({ t: -0.65, hips: -50, torso: -75, lean: 2, lh: 0, crouch: 0.07, tilt: 6,
    rUp: V(0.4, -0.78, -0.48), rFo: V(0.35, -0.2, -0.92), lUp: V(0.25, 0.65, 0.7), lFo: V(0.25, 0.75, 0.6),
    rk: V(0.35, 0.45, -0.82), face: V(0.95, 0, 0.3) }),
  P({ t: -0.38, hips: -55, torso: -88, lean: -6, lh: 0, crouch: 0.14, tilt: 14,
    rUp: V(0.25, 0.12, -0.96), rFo: V(0.05, 0.97, -0.22), lUp: V(0.25, 0.93, 0.25), lFo: V(0.22, 0.95, 0.22),
    rk: V(0.1, 0.85, -0.5), face: V(0.95, 0.05, 0.3) }),
  // От трофея к петле плечо проворачивается наружу при согнутом локте: предплечье уходит назад, головка ракетки падает
  // за спину. Без этого ключа рука проходила через прямую «крылом» назад. Направления считаны в осях груди и повёрнуты корпусом.
  P({ t: -0.26, hips: -42, torso: -70, lean: -4, lh: 0, crouch: 0.11, tilt: 16,
    rUp: V(0.29, 0.42, -0.86), rFo: V(-0.83, 0.5, -0.2), lUp: V(0.2, 0.75, 0.6), lFo: V(0.3, 0.6, 0.75),
    rk: V(-0.8, -0.1, -0.6), face: V(0.5, 0.3, -0.8) }),
  P({ t: -0.14, hips: -22, torso: -48, lean: 0, lh: 0, crouch: 0.05, tilt: 16,
    rUp: V(0.69, 0.65, -0.32), rFo: V(-0.75, -0.45, -0.45), lUp: V(0.05, 0.2, 0.98), lFo: V(0.35, -0.35, 0.87),
    rk: V(-0.2, -0.95, -0.22), face: V(-0.7, 0.1, 0.7) }),
  P({ t: 0, hips: 10, torso: 22, lean: 8, lh: 0, crouch: -0.05, tilt: -22,
    rUp: V(0.18, 0.96, 0.2), rFo: V(0.12, 0.97, 0.22), lUp: V(-0.15, -0.8, 0.55), lFo: V(0.55, 0.15, 0.82),
    rk: V(0.08, 0.93, 0.36), face: V(0, -0.35, 1) }),
  P({ t: 0.12, hips: 35, torso: 60, lean: 24, lh: 0, crouch: 0, tilt: -8,
    rUp: V(0.4, 0.45, 0.8), rFo: V(0.35, -0.2, 0.92), lUp: V(-0.2, -0.85, 0.45), lFo: V(0.45, 0.1, 0.88),
    rk: V(0.55, -0.45, 0.7), face: V(0.7, 0.2, -0.55) }),
  P({ t: 0.4, hips: 45, torso: 70, lean: 18, lh: 0, crouch: 0.03, tilt: -6,
    rUp: V(-0.25, -0.75, 0.6), rFo: V(-0.75, -0.35, 0.55), lUp: V(-0.3, -0.92, 0.1), lFo: V(-0.05, -0.8, 0.6),
    rk: V(-0.45, -0.8, -0.4), face: V(0.25, -0.35, 0.9) }),
  P({ t: 0.9 }),
];
// Подача снизу (J): мяч у горла ракетки, ракетка маятником назад низко, левая отпускает мяч перед собой на уровне пояса,
// удар снизу вверх перед правой ногой открытой ракеткой, проводка вверх вперёд.
const SRV_U = [
  P({ t: -0.8, hips: -15, torso: -20, lean: 10,
    rUp: V(0.18, -0.9, 0.38), rFo: V(-0.2, -0.05, 0.98), lUp: V(-0.05, -0.85, 0.5), lFo: V(0.45, 0.05, 0.89),
    rk: V(-0.2, 0.4, 0.9), face: V(0.95, 0, 0.2) }),
  P({ t: -0.55, hips: -25, torso: -35, lean: 12, lh: 0, crouch: 0.03,
    rUp: V(0.35, -0.9, -0.25), rFo: V(0.3, -0.75, -0.6), lUp: V(0.05, -0.8, 0.6), lFo: V(0.45, -0.05, 0.9),
    rk: V(0.25, -0.55, -0.8), face: V(0.2, 0.45, -0.25) }),
  P({ t: -0.36, hips: -25, torso: -35, lean: 13, lh: 0, crouch: 0.05,
    rUp: V(0.35, -0.85, -0.4), rFo: V(0.3, -0.8, -0.5), lUp: V(0.05, -0.8, 0.6), lFo: V(0.4, -0.15, 0.9),
    rk: V(0.3, -0.65, -0.7), face: V(0.2, 0.45, -0.3) }),
  P({ t: 0, hips: 0, torso: 5, lean: 14, lh: 0, crouch: 0.06,
    rUp: V(0.3, -0.92, 0.25), rFo: V(0.3, -0.55, 0.78), lUp: V(-0.3, -0.9, 0.25), lFo: V(-0.1, -0.5, 0.85),
    rk: V(0.5, -0.3, 0.82), face: V(-0.1, 0.5, 0.86) }),
  P({ t: 0.25, hips: 15, torso: 25, lean: 12, lh: 0, crouch: 0.02,
    rUp: V(0.25, -0.3, 0.92), rFo: V(0.05, 0.55, 0.83), lUp: V(-0.3, -0.9, 0.2), lFo: V(-0.05, -0.55, 0.8),
    rk: V(-0.05, 0.85, 0.5), face: V(-0.4, 0.35, 0.85) }),
  P({ t: 0.5, hips: 15, torso: 25, lean: 11, lh: 0,
    rUp: V(0.1, -0.25, 0.96), rFo: V(-0.15, 0.6, 0.78), lUp: V(-0.25, -0.9, 0.25), lFo: V(0.1, -0.5, 0.85),
    rk: V(-0.2, 0.9, 0.35), face: V(-0.6, 0.2, 0.75) }),
  P({ t: 0.9 }),
];
export const STROKES = { fh: FH, bh: BH, 'fh-top': topspin(FH, 1), 'bh-top': topspin(BH, -1), 'fh-slice': slice(FH, 1), 'bh-slice': slice(BH, -1), oh: OH, ...VOLLEYS, srv: SRV, 'srv-u': SRV_U };
export const PREP = 0.45, AFTER = 0.9;

// Смесь двух поз (u = 0 — A, 1 — B): для плавных переходов между стойкой, бегом и ударом.
// Направления — по дуге с постоянной скоростью (slerp), а не прямой с нормировкой: у почти противоположных направлений
// прямая проходила рядом с нулём, и сегмент перескакивал за один кадр (предплечье на 150° при развороте на форхенд).
const _ax = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
function slerpDir(a, b, u) {
  const th = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  if (th < 1e-4 || u <= 0) return a.clone();
  _ax.crossVectors(a, b);
  if (_ax.lengthSq() < 1e-6) { _ax.crossVectors(UPV, a); if (_ax.lengthSq() < 1e-6) _ax.set(1, 0, 0); }
  return a.clone().applyAxisAngle(_ax.normalize(), th * Math.min(u, 1));
}
export function mix(A, B, u) {
  const o = {};
  for (const k in A) {
    const a = A[k], b = B[k] ?? a;
    o[k] = typeof a === 'number' ? a + (b - a) * u : a?.isVector3 ? slerpDir(a, b, u) : a;
  }
  return o;
}

// Рука с ракеткой целиком поворачивается в плече на q (в осях скелета) — так ракетка идёт к мячу, а не мяч к ракетке.
// Левая рука поворачивается так же; на двуручном её потом сажает на ручку placeRacket.
const ARM_KEYS = ['rUp', 'rFo', 'lUp', 'lFo', 'rk', 'face'];
export function turnArms(key, q) {
  const o = { ...key };
  for (const k of ARM_KEYS) o[k] = key[k].clone().applyQuaternion(q);
  return o;
}

// Между ключами smoothstep; от петли к удару рука разгоняется, после удара тормозит.
function ease(u, t) {
  if (t === -0.17) return u * u * u;
  if (t === 0) return 1 - (1 - u) ** 2;
  return u * u * (3 - 2 * u);
}
// Две соседние позы и доля между ними для момента s (с) от удара.
export function sample(keys, s) {
  if (s <= keys[0].t) return [keys[0], keys[0], 0];
  for (let i = 0; i < keys.length - 1; i++) {
    const A = keys[i], B = keys[i + 1];
    if (s <= B.t) return [A, B, ease((s - A.t) / (B.t - A.t), A.t)];
  }
  const last = keys.at(-1);
  return [last, last, 0];
}
// Поза удара в момент s с кинетической цепью: таз берём из ключей на 70 мс позже, корпус на 25 мс, руку — как есть.
// Поворот идёт снизу вверх и пик скорости таза приходится на −0,07 с, корпуса на −0,03, а не всё тело разом в момент
// удара (разбор движения 18.11: таз, плечи и рука крутились синхронно, пик скорости таза узким всплеском на касании).
export const CHAIN = { hips: 0.07, torso: 0.025 };
// Кривая через ключи с непрерывной скоростью: кубический Эрмит, касательная в ключе — по соседям с ограничением
// Фритча–Карлсона (без перелёта за ключ, на площадке ноль). У каждого отрезка раньше было своё замедление, и на стыке
// −0,17 → 0 → 0,1 скорость корпуса падала с ~1600 до 600°/с за кадр — «робот». В самих ключах поза та же; в момент
// удара касательная ×1,4 — рука всё так же разгоняется к мячу.
function curveAt(keys, s) {
  const n = keys.length, t = THREE.MathUtils.clamp(s, keys[0].t, keys[n - 1].t);
  let i = 0;
  while (i < n - 2 && t > keys[i + 1].t) i++;
  const A = keys[i], B = keys[i + 1], h = B.t - A.t, u = (t - A.t) / h, u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = 3 * u2 - 2 * u3, h11 = u3 - u2;
  const slope = (j, get) => {
    if (j === 0 || j === n - 1) return 0;
    const K0 = keys[j - 1], K = keys[j], K1 = keys[j + 1], d0 = (get(K) - get(K0)) / (K.t - K0.t), d1 = (get(K1) - get(K)) / (K1.t - K.t);
    if (d0 * d1 <= 0) return 0;
    const m = ((get(K1) - get(K0)) / (K1.t - K0.t)) * (K.t === 0 ? 1.4 : 1);
    return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(d0), 3 * Math.abs(d1));
  };
  const curve = (get) => h00 * get(A) + h10 * h * slope(i, get) + h01 * get(B) + h11 * h * slope(i + 1, get);
  const o = {};
  for (const k in A) {
    const a = A[k];
    if (typeof a === 'number') o[k] = curve((K) => K[k] ?? a);
    else if (a?.isVector3) { // направление — по дуге от ключа к ключу, по той же кривой, но в угле пути (скорость по дуге непрерывна)
      const seg = (j) => keys[j][k].angleTo(keys[j + 1][k]), th = seg(i);
      const sp = (j) => {
        if (j === 0 || j === n - 1) return 0;
        const d0 = seg(j - 1) / (keys[j].t - keys[j - 1].t), d1 = seg(j) / (keys[j + 1].t - keys[j].t);
        if (d0 < 1e-6 || d1 < 1e-6) return 0;
        return Math.min(((seg(j - 1) + seg(j)) / (keys[j + 1].t - keys[j - 1].t)) * (keys[j].t === 0 ? 1.4 : 1), 3 * d0, 3 * d1);
      };
      o[k] = th < 1e-5 ? a.clone() : slerpDir(a, B[k], (h10 * h * sp(i) + h01 * th + h11 * h * sp(i + 1)) / th);
    } else o[k] = a;
  }
  return o;
}
export function strokeAt(keys, s) {
  const at = (t) => curveAt(keys, s + t);
  const k = at(0), kt = at(CHAIN.torso);
  return { ...k, hips: at(CHAIN.hips).hips, torso: kt.torso, lean: kt.lean, tilt: kt.tilt };
}

const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0), ahead = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();

export class Rig {
  constructor(root, racket) {
    this.root = root;
    this.racket = racket;
    this.b = {};
    root.traverse((o) => {
      if (!o.isBone) return;
      const n = o.name.replace(/^mixamorig:?/, '');
      if (!this.b[n]) this.b[n] = o;
    });
    const missing = NAMES.filter((n) => !this.b[n]);
    if (missing.length) throw new Error('нет костей: ' + missing.join(', '));
    root.updateMatrixWorld(true);
    this.toPlayer = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.all = Object.entries(this.b).map(([name, bone]) => ({ name, bone, lower: LOWER.test(name) }));
    this.rest = new Map(this.all.map(({ bone }) => [bone, bone.quaternion.clone()]));
    this.hipsRest = this.b.Hips.position.clone();
    this.unit = this.b.Hips.parent.getWorldScale(new THREE.Vector3()).y; // скелет Meshy бывает в сантиметрах
    this.footRest = {};
    for (const f of ['LeftFoot', 'RightFoot']) this.footRest[f] = this.toPlayer.clone().multiply(this.b[f].getWorldQuaternion(new THREE.Quaternion()));
    this.footY = this.feetY();
    this.chestRestInv = this.toPlayer.clone().multiply(this.b.Spine2.getWorldQuaternion(new THREE.Quaternion())).invert(); // грудь в покое, оси игрока
    // «Перед» плеча в его собственных осях: туда сгибается локоть (к бицепсу). В A-позе ладони к бёдрам — это вперёд.
    this.armFront = {};
    for (const s of ['Left', 'Right']) {
      const q = this.b[s + 'Arm'].getWorldQuaternion(new THREE.Quaternion()).invert();
      this.armFront[s] = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(q);
    }
    // Для постановки ног: длины бедра и голени, высота щиколотки над полом в покое.
    const w = (n) => this.b[n].getWorldPosition(new THREE.Vector3());
    this.armLen = {};
    for (const s of ['Left', 'Right']) this.armLen[s] = [w(s + 'Arm').distanceTo(w(s + 'ForeArm')), w(s + 'ForeArm').distanceTo(w(s + 'Hand'))];
    // Кисть в её собственных осях: r — к указательному, f — к пальцам, n — ладонь. Ладонь по правилу руки:
    // у правой n = r × f, у левой f × r (зеркало), — поэтому не важно, как скелет держал кисти в покое.
    this.hand = {};
    for (const s of ['Left', 'Right']) {
      const i1 = this.b[s + 'HandIndex1'], p1 = this.b[s + 'HandPinky1'], m1 = this.b[s + 'HandMiddle1'];
      if (!i1 || !p1 || !m1) continue;
      const inv = this.b[s + 'Hand'].getWorldQuaternion(new THREE.Quaternion()).invert();
      const r = w(s + 'HandIndex1').sub(w(s + 'HandPinky1')).applyQuaternion(inv).normalize();
      const fw = w(s + 'HandMiddle1').sub(w(s + 'Hand')), len = fw.length();
      const f = fw.applyQuaternion(inv); f.addScaledVector(r, -f.dot(r)).normalize();
      const n = s === 'Right' ? new THREE.Vector3().crossVectors(r, f) : new THREE.Vector3().crossVectors(f, r);
      this.hand[s] = { r, f, n, len, basisT: new THREE.Matrix4().makeBasis(r, f, n).transpose() };
    }
    this.leftOn = 0;
    this.L1 = w('LeftUpLeg').distanceTo(w('LeftLeg'));
    this.L2 = w('LeftLeg').distanceTo(w('LeftFoot'));
    this.ankleH = w('LeftFoot').y - root.parent.getWorldPosition(new THREE.Vector3()).y;
    // Ступня от щиколотки до подушечки (ToeBase): длина и угол вниз — вокруг подушечки пятка встаёт на носок.
    const toe = this.b.LeftToeBase ? w('LeftToeBase').sub(w('LeftFoot')) : new THREE.Vector3(0, -0.1, 0.15);
    this.footLen = toe.length(); this.footA0 = Math.asin(THREE.MathUtils.clamp(-toe.y / this.footLen, 0, 0.95));
  }

  // Ноги в заданные точки: таз опускается, пока обе ступни достают, колено сгибается вперёд.
  // feet: { Left: { pos, lift, yaw }, Right: {...}, crouch } — pos на корте (мир), yaw — поворот ступни от лица игрока.
  // Таз крутится вместе с ногами: ступни доворачиваются на месте (носок на грунте) на половину поворота таза,
  // колено смотрит между тазом и носком. Иначе ноги и шорты смотрели прямо, а скручивалась талия.
  legs(feet) {
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ).setY(0).normalize();
    const reach = 0.985 * (this.L1 + this.L2), hips = this.b.Hips;
    this.root.updateMatrixWorld(true);
    let drop = feet.crouch;
    const target = {}, yaw = {}, toeUp = {};
    // Дальняя задняя нога встаёт на носок (пятка вверх до 6 см, подушечка на месте), а не тянет таз вниз:
    // так на бегу и в выпаде нет «стульчика».
    const need = (hip, T) => hip.y - T.y - Math.sqrt(Math.max(0, reach * reach - (T.x - hip.x) ** 2 - (T.z - hip.z) ** 2));
    for (const s of ['Left', 'Right']) {
      const f = feet[s], hip = this.b[s + 'UpLeg'].getWorldPosition(new THREE.Vector3());
      yaw[s] = (f.yaw ?? 0) + 0.55 * (this.hipYaw || 0);
      target[s] = f.pos.clone().setY(f.pos.y + this.ankleH + f.lift);
      const behind = -target[s].clone().sub(hip).dot(fwd);
      const rise = Math.max(THREE.MathUtils.clamp(need(hip, target[s]) - feet.crouch, 0, 0.06) * THREE.MathUtils.smoothstep(behind, 0.05, 0.25), (f.toe ?? 0) * 0.07); // f.toe — пятка вверх сама (перенос веса)
      const a1 = Math.asin(Math.min(1, Math.sin(this.footA0) + rise / this.footLen)); // новый угол ступни к грунту
      toeUp[s] = a1 - this.footA0;
      const ffwd = fwd.clone().applyAxisAngle(up, yaw[s]);
      target[s].y += rise; target[s].addScaledVector(ffwd, (Math.cos(this.footA0) - Math.cos(a1)) * this.footLen);
      if (f.lift < 0.01) drop = Math.max(drop, need(hip, target[s])); // ступня в воздухе таз не тянет: нога просто согнута или вытянута
    }
    drop = Math.min(drop, feet.crouch + 0.08); // не глубже: дальняя нога лучше выпрямится, чем таз просядет
    // Таз не прыгает: просадку «дотянуться до дальней ступни» ведём плавно (feet.dt — шаг кадра). Раньше она включалась
    // в кадр, когда ступня вставала или отрывалась, и на бегу таз скакал до 11 см за 1/30 с. Вниз быстрее — ступне надо достать.
    let reachDrop = drop - feet.crouch;
    if (feet.dt && this.reachDrop != null) reachDrop = this.reachDrop + (reachDrop - this.reachDrop) * (1 - Math.exp(-feet.dt / (reachDrop > this.reachDrop ? 0.035 : 0.08)));
    this.reachDrop = reachDrop; drop = feet.crouch + reachDrop;
    hips.position.y = this.hipsRest.y - drop / hips.parent.getWorldScale(_v).y;
    this.root.updateMatrixWorld(true);
    for (const s of ['Left', 'Right']) {
      const hip = this.b[s + 'UpLeg'].getWorldPosition(new THREE.Vector3()), T = target[s];
      const d = T.clone().sub(hip), len = THREE.MathUtils.clamp(d.length(), Math.abs(this.L1 - this.L2) + 0.01, reach);
      d.normalize();
      const a = (this.L1 * this.L1 - this.L2 * this.L2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, this.L1 * this.L1 - a * a));
      const outward = new THREE.Vector3(s === 'Right' ? -1 : 1, 0, 0).applyQuaternion(rootQ); // у Mixamo правая сторона в −X
      const footYaw = yaw[s];
      const pole = fwd.clone().addScaledVector(outward, 0.15).applyAxisAngle(up, 0.5 * footYaw + 0.5 * (this.hipYaw || 0));
      pole.addScaledVector(d, -pole.dot(d)).normalize();
      const knee = hip.clone().addScaledVector(d, a).addScaledVector(pole, h);
      this.aim(s + 'UpLeg', s + 'Leg', knee.sub(hip).normalize().applyQuaternion(this.toPlayer));
      this.b[s + 'Leg'].updateWorldMatrix(true, false);
      const kneeNow = this.b[s + 'Leg'].getWorldPosition(new THREE.Vector3());
      this.aim(s + 'Leg', s + 'Foot', T.clone().sub(kneeNow).normalize().applyQuaternion(this.toPlayer));
      // Ступня плоско, носком куда повёрнута на корте.
      const bone = this.b[s + 'Foot']; bone.updateWorldMatrix(true, false);
      const want = new THREE.Quaternion().setFromAxisAngle(up, footYaw).multiply(rootQ).multiply(this.footRest[s + 'Foot']);
      const axis = new THREE.Vector3().crossVectors(up, fwd.clone().applyAxisAngle(up, footYaw)).normalize();
      if (toeUp[s] > 1e-3) want.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, toeUp[s]));
      bone.quaternion.copy(bone.parent.getWorldQuaternion(_q2).invert().multiply(want));
      const toes = this.b[s + 'ToeBase']; // пальцы остаются на грунте: сгибаются в подушечке назад
      if (toes && toeUp[s] > 1e-3) { toes.quaternion.copy(this.rest.get(toes)); this.turnWorld(toes, new THREE.Quaternion().setFromAxisAngle(axis, -toeUp[s])); }
    }
    this.root.updateMatrixWorld(true);
  }

  feetY() {
    return Math.min(...['LeftFoot', 'RightFoot'].map((f) => this.b[f].getWorldPosition(_v).applyQuaternion(this.toPlayer).y));
  }
  dir(a, c) {
    const pa = this.b[a].getWorldPosition(new THREE.Vector3()), pc = this.b[c].getWorldPosition(new THREE.Vector3());
    return pc.sub(pa).normalize().applyQuaternion(this.toPlayer);
  }
  // Поворот кости на q, заданный в осях игрока, поверх её текущего поворота.
  rotate(n, q) {
    const bone = typeof n === 'string' ? this.b[n] : n;
    bone.updateWorldMatrix(true, false);
    const parentQ = bone.parent.getWorldQuaternion(_q2);
    const qw = this.toPlayer.clone().invert().multiply(q).multiply(this.toPlayer);
    const world = parentQ.clone().multiply(bone.quaternion);
    bone.quaternion.copy(parentQ.invert().multiply(qw.multiply(world)));
  }
  // Рука как у человека: плечо направляем по u, потом проворачиваем вокруг своей оси так, чтобы локоть сгибался
  // петлёй к бицепсу в сторону предплечья f, и только тогда сгибаем предплечье. Без этого кратчайший поворот
  // оставлял плечо скрученным как попало, и локоть на коже выгибался в обратную сторону.
  // Почти прямая рука: сгиб не виден, плечо не крутим (поворот плавно гаснет к прямому локтю).
  // Если плечу надо провернуться дальше HUM_MAX, локоть уходит по кругу вокруг линии плечо–запястье (кисть на месте),
  // пока поворот не войдёт в предел: так живой человек поднимает или опускает локоть, а не выворачивает плечо.
  arm(side, u, f) {
    this.clavicle(side, u);
    const up = side + 'Arm', fore = side + 'ForeArm', bone = this.b[up];
    bone.updateWorldMatrix(true, false);
    const c0 = this.dir(up, fore), f0 = this.armFront[side].clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(this.toPlayer);
    const twist = (u, f) => {
      const bend = f.clone().addScaledVector(u, -f.dot(u)), k = THREE.MathUtils.smoothstep(Math.acos(THREE.MathUtils.clamp(u.dot(f), -1, 1)), 0.12, 0.45);
      if (k === 0) return 0;
      bend.normalize();
      const front = f0.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(c0, u));
      front.addScaledVector(u, -front.dot(u)).normalize();
      return Math.atan2(u.dot(new THREE.Vector3().crossVectors(front, bend)), front.dot(bend)) * k;
    };
    let ang = twist(u, f);
    // В игре (coherent) локоть по кругу берём ближайший к прошлому кадру и плавно возвращаем к нулю. Раньше поиск брал
    // первый подходящий угол в любую сторону, и на развороте на форхенд локоть перескакивал на другую сторону:
    // предплечье на 140° за кадр. Без coherent (замеры, проверка поз) — как раньше, ближайший к нулю.
    const prev = this.coherent ? this.orbit[side] : 0;
    if (Math.abs(ang) > HUM_MAX || Math.abs(prev) > 1e-3) {
      const [L1, L2] = this.armLen[side], d = u.clone().multiplyScalar(L1).addScaledVector(f, L2).normalize(), q = new THREE.Quaternion();
      const anchor = prev * 0.8;
      let best = null;
      for (let j = 0; j <= 144; j++) {
        const phi = (j % 2 ? (j + 1) / 2 : -j / 2) * deg(2.5); // 0, +, −, … — при равенстве как раньше: сначала «+»
        q.setFromAxisAngle(d, phi);
        const u2 = u.clone().applyQuaternion(q), f2 = f.clone().applyQuaternion(q), a = twist(u2, f2);
        const cost = Math.abs(a) <= HUM_MAX ? Math.abs(phi - anchor) : 100 + Math.abs(a);
        if (!best || cost < best[3]) best = [u2, f2, a, cost, phi];
      }
      // В игре локоть по кругу ходит не быстрее 7° за вызов: если прошлое решение стало недопустимым, плечо лучше на пару
      // кадров докрутить до предела, чем локоть прыгнет на 60° за кадр.
      if (this.coherent && Math.abs(best[4] - prev) > deg(7)) {
        const phi = prev + Math.sign(best[4] - prev) * deg(7);
        q.setFromAxisAngle(d, phi);
        const u2 = u.clone().applyQuaternion(q), f2 = f.clone().applyQuaternion(q);
        best = [u2, f2, twist(u2, f2), 0, phi];
      }
      [u, f, ang] = best;
      this.orbit[side] = Math.abs(best[4]) < deg(1) ? 0 : best[4];
      ang = THREE.MathUtils.clamp(ang, -HUM_MAX, HUM_MAX);
    } else this.orbit[side] = 0;
    this.aim(up, fore, u);
    this.rotate(up, new THREE.Quaternion().setFromAxisAngle(u, ang));
    armTwist(this, side, u, ang); // есть скрутка плеча — она возвращает часть прокрута, стык с ключицей не жгутом
    this.aim(fore, side + 'Hand', f);
  }
  // Ключица: рука выше плеча — плечо поднимается, поперёк груди — выходит вперёд, назад — сводит лопатку.
  // Считаем в осях груди (после поворота корпуса), ставим от покоя, чтобы повторный вызов не копился.
  clavicle(side, u) {
    const bone = this.b[side + 'Shoulder'];
    bone.quaternion.copy(this.rest.get(bone));
    this.b.Spine2.updateWorldMatrix(true, false);
    const D = this.toPlayer.clone().multiply(this.b.Spine2.getWorldQuaternion(new THREE.Quaternion())).multiply(this.chestRestInv), Di = D.clone().invert();
    const t = u.clone().applyQuaternion(Di), lat = new THREE.Vector3(side === 'Right' ? -1 : 1, 0, 0);
    const elev = CLAV_UP * THREE.MathUtils.smoothstep(t.y, -0.35, 1) + (this.shrug ?? 0);
    const prot = CLAV_FWD * THREE.MathUtils.clamp(t.z * 0.5 + Math.max(0, -t.dot(lat)) * 0.9, -0.6, 1);
    const q = new THREE.Quaternion().setFromAxisAngle(lat.clone().cross(up), elev).multiply(new THREE.Quaternion().setFromAxisAngle(lat.clone().cross(ahead), prot));
    this.rotate(bone, D.multiply(q).multiply(Di));
  }
  aim(a, c, target) {
    this.b[a].updateWorldMatrix(true, true);
    this.rotate(a, _q.setFromUnitVectors(this.dir(a, c), target));
  }

  // Поза между ключами A и B (доля u). Ноги — из ключей или, если переданы feet, в точки на корте (legs).
  // Возвращает rk и face ракетки, ставит её вызывающий.
  pose(A, B, u, feet = null) {
    this.coherent = !!feet?.dt; this.dt = feet?.dt ?? 0; this.orbit ??= { Left: 0, Right: 0 }; // кадры игры идут подряд — решения рук держим непрерывными
    this.root.updateMatrixWorld(true);
    this.toPlayer = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const lerp = (k) => A[k] + (B[k] - A[k]) * u;
    const vec = (k) => A[k].clone().lerp(B[k], u).normalize();
    for (const { bone } of this.all) bone.quaternion.copy(this.rest.get(bone));
    this.b.Hips.position.copy(this.hipsRest);
    this.hipYaw = deg(lerp('hips'));
    this.rotate('Hips', _q.setFromAxisAngle(up, this.hipYaw));
    // Наклон вперёд в основном в тазобедренных (таз наклоняется), остальное — позвоночник, как в атлетической стойке.
    // Раньше гнулся только позвоночник, линия таз–шея наклонялась на 55 % ключа, а в покое модель чуть откинута назад:
    // при ключе 10–12° корпус стоял отвесно («столб»), на видео Лёва наклонён на ~10° больше. LEAN0 — добавка ко всем ключам.
    // Наклоны вперёд и вбок — в осях самого тела (ось доворачивается вместе с тазом и корпусом): в развороте на замах
    // корпус наклоняется над правой ногой, как на видео, а не валится вбок к сетке.
    const leanAll = deg(lerp('lean') + LEAN0), axis = (a, yaw) => a.clone().applyAxisAngle(up, yaw);
    this.rotate('Hips', _q.setFromAxisAngle(axis(side, this.hipYaw), leanAll * PELVIS_LEAN));
    // Крен таза на ходу (roll, мокап, + — правое бедро выше): поясница возвращает корпус, ноги ставит legs.
    const roll = deg(lerp('roll') || 0);
    if (roll) { this.rotate('Hips', _q.setFromAxisAngle(axis(ahead, this.hipYaw), -roll)); this.rotate('Spine', _q.setFromAxisAngle(axis(ahead, this.hipYaw), roll)); }
    // Корпус крутится от таза не больше чем на 40°, и не поровну: поясница почти не крутится (15 %), грудной отдел — остальное.
    // Дальше плечи разворачивают ключицы (arm → clavicle).
    const twist = deg(THREE.MathUtils.clamp(lerp('torso') - lerp('hips'), -40, 40)), lean = leanAll * (1 - PELVIS_LEAN) / 3, tilt = deg(lerp('tilt') || 0) / 3;
    const _q3 = new THREE.Quaternion();
    let yaw = this.hipYaw;
    for (const [s, k] of [['Spine', 0.15], ['Spine1', 0.35], ['Spine2', 0.5]]) {
      this.rotate(s, _q.setFromAxisAngle(up, twist * k).multiply(_q2.setFromAxisAngle(axis(side, yaw), lean)).multiply(_q3.setFromAxisAngle(axis(ahead, yaw), tilt))); // + — вправо (у Mixamo правая сторона в −X)
      yaw += twist * k;
    }
    // Голова держит мяч: шея берёт 40 % поворота, голова — 60 %, как у живого человека; корпус крутится под ней.
    this.lh = lerp('lh') || 0; this.lhAt = lerp('lhAt') || 0; // левую кисть на ручку ставит placeRacket
    this.fist = lerp('fist') || 0; this.shrug = deg(lerp('shrug') || 0); // shrug — плечи вверх (°), вдох в передышке (career.js)
    const look = deg(lerp('look') || 0), nod = deg(lerp('nod') || 0) - deg(LEAN0); // nod — голова вниз (°), язык тела между очками; добавку наклона голова отдаёт — взгляд не в землю
    this.rotate('Neck', _q.setFromAxisAngle(up, -(this.hipYaw + twist) * 0.55 + look * 0.4).multiply(_q2.setFromAxisAngle(side, nod * 0.4)));
    this.rotate('Head', _q.setFromAxisAngle(up, look * 0.6).multiply(_q2.setFromAxisAngle(side, nod * 0.6)));
    this.arm('Right', vec('rUp'), vec('rFo'));
    this.arm('Left', vec('lUp'), vec('lFo'));
    for (const [a, c] of SEGS) if (!/Arm$/.test(a) && (!feet || !LOWER.test(a))) this.aim(a, c, vec(SEG_KEY[a]));
    if (feet) { this.legs({ ...feet, crouch: feet.crouch + (lerp('crouch') || 0) }); return { rk: vec('rk'), face: vec('face') }; }
    // Ступни плоско, как в покое; потом опускаем таз, пока нижняя ступня не встанет на корт.
    const fromPlayer = this.toPlayer.clone().invert();
    for (const f of ['LeftFoot', 'RightFoot']) {
      const bone = this.b[f]; bone.updateWorldMatrix(true, false);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(_q2).invert().multiply(fromPlayer.clone().multiply(this.footRest[f])));
    }
    this.root.updateMatrixWorld(true);
    this.b.Hips.position.y -= (this.feetY() - this.footY) / this.unit / this.root.getWorldScale(_v2).y;
    this.root.updateMatrixWorld(true);
    return { rk: vec('rk'), face: vec('face') };
  }

  // Пальцы сгибаются к ладони: ось — «пальцы × ладонь» кисти, так согнуть их назад нельзя. amount 1 — кулак на ручке.
  grip(s, amount) {
    const H = this.hand[s];
    if (!H) return;
    const hq = this.b[s + 'Hand'].getWorldQuaternion(new THREE.Quaternion());
    const axis = H.f.clone().applyQuaternion(hq).cross(H.n.clone().applyQuaternion(hq)).normalize();
    for (const f of FINGERS) for (let k = 1; k <= 3; k++) {
      const bone = this.b[`${s}Hand${f}${k}`];
      if (bone) this.turnWorld(bone, _q.setFromAxisAngle(axis, deg(k === 2 ? 68 : k === 3 ? 52 : f === 'Index' ? 32 : 52) * amount)); // указательный «курком», чуть врозь
    }
    for (let k = 2; k <= 3; k++) { const th = this.b[`${s}HandThumb${k}`]; if (th) this.turnWorld(th, _q.setFromAxisAngle(axis, deg(22) * amount)); }
  }
  // Поворот кости на q в мировых осях (с детьми).
  turnWorld(bone, q) {
    bone.updateWorldMatrix(true, false);
    this.setWorld(bone, q.clone().multiply(bone.getWorldQuaternion(_q2)));
  }
  setWorld(bone, qw) {
    bone.quaternion.copy(bone.parent.getWorldQuaternion(_q2).invert().multiply(qw));
    bone.updateWorldMatrix(false, true);
  }
  dirW(a, c) { return this.b[c].getWorldPosition(new THREE.Vector3()).sub(this.b[a].getWorldPosition(_v)).normalize(); }

  // Кисть на ручке. Ручка лежит в ладони наискосок — от пятки ладони к основанию указательного (GRIP_A к поперёку),
  // поэтому кисть продолжает ракетку, а не стоит к ней под прямым углом. Из всех поворотов кисти вокруг ручки берём тот,
  // где пальцы ближе всего к линии предплечья; если запястью всё равно надо согнуться больше WRIST_MAX, доворачивается
  // ракетка (возвращаем этот поворот), а не ломается кисть. grip = false — свободная кисть: R — куда смотрит большой палец.
  // Поворот кисти вокруг предплечья делим пополам с предплечьем, как лучевая кость: иначе запястье скручивается жгутом.
  orientHand(s, R, wt = 1, grip = true, wristMax = WRIST_MAX) {
    const H = this.hand[s], C = new THREE.Quaternion();
    if (!H) return C;
    const A = this.dirW(s + 'ForeArm', s + 'Hand'), hand = this.b[s + 'Hand'];
    hand.updateWorldMatrix(true, false);
    const Qc = hand.getWorldQuaternion(new THREE.Quaternion());
    const perp = A.clone().addScaledVector(R, -A.dot(R));
    if (perp.lengthSq() < 1e-4) perp.copy(H.f).applyQuaternion(Qc).addScaledVector(R, -perp.dot(R)); // ракетка ровно вдоль руки — как было
    perp.normalize();
    let F;
    if (grip) {
      F = R.clone().multiplyScalar(Math.sin(GRIP_A)).addScaledVector(perp, Math.cos(GRIP_A));
      const bend = F.angleTo(A);
      if (bend > wristMax) {
        C.setFromAxisAngle(new THREE.Vector3().crossVectors(F, A).normalize(), bend - wristMax);
        F.applyQuaternion(C); R = R.clone().applyQuaternion(C);
      }
      R = R.clone().addScaledVector(F, -Math.sin(GRIP_A)).divideScalar(Math.cos(GRIP_A)); // ось «к указательному»
    } else F = perp;
    const N = s === 'Right' ? new THREE.Vector3().crossVectors(R, F) : new THREE.Vector3().crossVectors(F, R);
    const Qd = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, F, N).multiply(H.basisT));
    if (wt < 1) Qd.copy(Qc).slerp(Qd, wt);
    const D = Qd.clone().multiply(Qc.clone().invert());
    if (D.w < 0) D.set(-D.x, -D.y, -D.z, -D.w);
    // Пронация с супинацией не больше ROLL_MAX от нейтрали: дальше вместе с кистью доворачивается ракетка, а не перекручивается предплечье.
    const roll = 2 * Math.atan2(D.x * A.x + D.y * A.y + D.z * A.z, D.w);
    if (grip && wristMax !== Infinity && Math.abs(roll) > ROLL_MAX) {
      const Cr = new THREE.Quaternion().setFromAxisAngle(A, Math.sign(roll) * ROLL_MAX - roll);
      Qd.premultiply(Cr); C.premultiply(Cr); D.premultiply(Cr);
      if (D.w < 0) D.set(-D.x, -D.y, -D.z, -D.w);
    }
    const p = new THREE.Vector3(D.x, D.y, D.z), along = A.clone().multiplyScalar(p.dot(A));
    if (along.lengthSq() + D.w * D.w > 1e-6) {
      const tw = new THREE.Quaternion(along.x, along.y, along.z, D.w).normalize();
      if (!foreTwist(this, s, tw)) this.turnWorld(this.b[s + 'ForeArm'], new THREE.Quaternion().slerp(tw, 0.5)); // со скруткой пронацию берёт она (twist.js)
    }
    this.setWorld(hand, Qd);
    return C;
  }
  // Свободная кисть: большой палец смотрит к плечу (нейтраль предплечья), пальцы продолжают руку.
  relaxHand(s) {
    const u = this.dirW(s + 'Arm', s + 'ForeArm').negate(), A = this.dirW(s + 'ForeArm', s + 'Hand');
    const R = u.addScaledVector(A, -u.dot(A));
    if (R.lengthSq() < 0.02) return;
    this.orientHand(s, R.normalize(), 1, false);
  }
  // Середина ладони, чуть со стороны ладони: тут лежит ручка.
  palm(s) {
    const H = this.hand[s], hand = this.b[s + 'Hand'];
    const p = hand.getWorldPosition(new THREE.Vector3());
    if (!H) return p;
    const q = hand.getWorldQuaternion(new THREE.Quaternion());
    return p.addScaledVector(H.f.clone().applyQuaternion(q), H.len * 0.62).addScaledVector(H.n.clone().applyQuaternion(q), 0.028);
  }
  // Рука в точку W (запястье): два сегмента, локоть сгибается туда же, куда был согнут в ключевой позе.
  armTo(s, W) {
    const S = this.b[s + 'Arm'].getWorldPosition(new THREE.Vector3()), E = this.b[s + 'ForeArm'].getWorldPosition(new THREE.Vector3());
    const [L1, L2] = this.armLen[s];
    const d = W.clone().sub(S), len = THREE.MathUtils.clamp(d.length(), Math.abs(L1 - L2) + 0.01, (L1 + L2) * 0.999);
    d.normalize();
    const a = (L1 * L1 - L2 * L2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    let pole = E.sub(S); pole.addScaledVector(d, -pole.dot(d));
    // Куда сгибается локоть — помним с прошлого кадра (в осях игрока): у почти прямой руки направление сгиба неустойчиво,
    // и на двуручном бэкхенде локоть левой в момент удара перескакивал на другую сторону (плечо на 100° за кадр).
    const mem = this.coherent ? this.poleMem?.[s]?.clone().applyQuaternion(this.toPlayer.clone().invert()) : null;
    if (mem) {
      mem.addScaledVector(d, -mem.dot(d));
      const w = 0.5 * THREE.MathUtils.smoothstep(pole.length() / L1, 0.05, 0.35);
      if (mem.lengthSq() > 1e-6) pole = (pole.lengthSq() > 1e-10 ? pole.normalize().multiplyScalar(w) : pole.set(0, 0, 0)).addScaledVector(mem.normalize(), 1 - w);
    }
    if (pole.lengthSq() < 1e-5) pole.set(0, -1, 0).addScaledVector(d, d.y);
    (this.poleMem ??= {})[s] = pole.clone().normalize().applyQuaternion(this.toPlayer);
    const elbow = S.clone().addScaledVector(d, a).addScaledVector(pole.normalize(), h);
    const target = S.clone().addScaledVector(d, len);
    this.arm(s, elbow.clone().sub(S).normalize().applyQuaternion(this.toPlayer), target.sub(elbow).normalize().applyQuaternion(this.toPlayer));
  }

  // Ракетку не сажаем на кость кисти: скручивание предплечья при прицеливании по направлениям не определено.
  // Ставим кисть по ручке, ракетку — в ладонь по rk/face (в осях игрока). Левая кисть, если она рядом с ручкой
  // (двуручный бэкхенд, стойка), садится на ручку выше правой; иначе висит свободно.
  placeRacket(rk, face) {
    this.root.updateMatrixWorld(true);
    const fromPlayer = this.toPlayer.clone().invert();
    const Y = rk.clone().applyQuaternion(fromPlayer).normalize(), Z = face.clone().applyQuaternion(fromPlayer);
    Z.addScaledVector(Y, -Z.dot(Y)).normalize();
    const C = this.orientHand('Right', Y); // запястье не гнётся дальше предела — тогда доворачивается ракетка
    Y.applyQuaternion(C); Z.applyQuaternion(C);
    const palm = this.hand.Right ? this.palm('Right') : this.b.RightHand.getWorldPosition(new THREE.Vector3());
    this.racket.quaternion.setFromRotationMatrix(_m.makeBasis(new THREE.Vector3().crossVectors(Y, Z), Y, Z));
    this.racket.position.copy(palm).addScaledVector(Y, 0.08); // ладонь держит ручку на 8 см ниже точки хвата
    this.racket.updateMatrixWorld(true);
    this.leftHand(Y);
    this.grip('Right', 1);
    this.grip('Left', Math.max(0.6 + 0.4 * this.leftOn, this.fist || 0)); // свободная кисть — мягкий полукулак, не растопырка; fist — сжатый кулак после виннера
    applyCorrectives(this); // морфы плеча по позе рук (correctives.js), если они есть в модели
  }
  leftHand(Y) {
    this.leftOn = 0;
    if (!this.hand.Left) return;
    this.relaxHand('Left');
    const o = this.racket.position, lp = this.palm('Left'), lh = this.lh || 0;
    // Куда на ручке: где кисть оказалась (от хвата до горла) или куда велит ключ (lhAt). Ключ lh тянет кисть и издалека,
    // lh < 0 (бег) — не берётся, даже если рядом.
    const along = THREE.MathUtils.lerp(THREE.MathUtils.clamp(lp.clone().sub(o).dot(Y), 0.015, 0.18), 0.015 + 0.165 * (this.lhAt ?? 0), Math.max(0, lh));
    // Не тянемся к горлу дальше, чем достаёт согнутая рука: иначе рука выпрямляется в струну, плечо выкручивается и локоть
    // на коже выглядит вывернутым (Лёва поймал на стартовом экране 17.11). Далеко — кисть съезжает по ручке к правой
    // (двуручный хват остаётся), а если не достать и туда — отпускает ракетку, если ключ не требует держать.
    const S = this.b.LeftArm.getWorldPosition(new THREE.Vector3()), [L1, L2] = this.armLen.Left, arm = (L1 + L2 + 0.08) * (this.reachK ?? 1); // reachK < 1 — отпускать раньше (девушки, girls.js)
    const reachAt = (a) => S.distanceTo(o.clone().addScaledVector(Y, a)) / arm;
    const slide = THREE.MathUtils.smoothstep(reachAt(along), 0.84, 0.95);
    const T = o.clone().addScaledVector(Y, THREE.MathUtils.lerp(along, 0.015, slide)), near = 1 - THREE.MathUtils.smoothstep(lp.distanceTo(T), 0.1, 0.3);
    const far = THREE.MathUtils.smoothstep(S.distanceTo(T) / arm, 0.9, 1.0);
    let wt = (lh >= 0 ? Math.max(lh, near) : near * (1 + lh)) * (1 - far);
    // Хват и отпускание второй рукой — не быстрее ~0,2 с: раньше на развороте рука отпускала ракетку в кадр (порог «далеко»),
    // и кисть перелетала на полметра.
    if (this.coherent && this.leftW != null) wt = this.leftW + THREE.MathUtils.clamp(wt - this.leftW, -this.dt / 0.2, this.dt / 0.2);
    this.leftW = wt;
    if (wt <= 0) return;
    this.leftOn = wt;
    for (let it = 0; it < 2; it++) {
      const wrist = this.b.LeftHand.getWorldPosition(new THREE.Vector3());
      const W = T.clone().sub(this.palm('Left').sub(wrist));
      this.armTo('Left', wrist.lerp(W, wt));
      this.orientHand('Left', Y, wt, true, Infinity); // левая кисть за ракеткой, ракетку не двигает
    }
  }
  forearm() { return this.dir('RightForeArm', 'RightHand'); }

  // Проверка анатомии текущей позы для тестировщика: локти не выгнуты назад, колени не назад, запястье не сломано,
  // ручка лежит в ладони. Углы в градусах, расстояния в метрах.
  audit() {
    const w = (n) => this.b[n].getWorldPosition(new THREE.Vector3()), q = (n) => this.b[n].getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const out = {};
    for (const s of ['Left', 'Right']) {
      const u = w(s + 'ForeArm').sub(w(s + 'Arm')).normalize(), f = w(s + 'Hand').sub(w(s + 'ForeArm')).normalize();
      const flex = THREE.MathUtils.radToDeg(u.angleTo(f));
      const front = this.armFront[s].clone().applyQuaternion(q(s + 'Arm')); front.addScaledVector(u, -front.dot(u)).normalize();
      const bend = f.clone().addScaledVector(u, -f.dot(u)).normalize();
      const o = out[s] = { elbow: Math.round(flex), elbowBack: flex > 12 && bend.dot(front) < -0.3 };
      const H = this.hand[s];
      if (H) o.wrist = Math.round(THREE.MathUtils.radToDeg(H.f.clone().applyQuaternion(q(s + 'Hand')).angleTo(f)));
      const hip = w(s + 'UpLeg'), knee = w(s + 'Leg'), ank = w(s + 'Foot');
      const line = ank.clone().sub(hip).normalize(), kb = knee.sub(hip); kb.addScaledVector(line, -kb.dot(line));
      o.kneeBack = kb.length() > 0.03 && kb.normalize().dot(fwd) < -0.3;
      o.ankleY = +ank.y.toFixed(3);
    }
    if (this.hand.Right) {
      const Y = new THREE.Vector3(0, 1, 0).applyQuaternion(this.racket.quaternion), rel = this.palm('Right').sub(this.racket.position);
      out.gripGap = +rel.addScaledVector(Y, -rel.dot(Y)).length().toFixed(3);
    }
    out.leftOn = +this.leftOn.toFixed(2);
    return out;
  }
  sweet() { return this.racket.localToWorld(this.racket.userData.sweet.clone()); }
}

// ---------- Прогулка и скамейка (club.js, player.stroll) ----------
// Шаг по клубу: корпус прямо, руки вдоль тела (мах — в player.stroll), ракетка в правой головкой вперёд-вниз, левая свободна.
export const WALK = P({ lean: -3, lh: -1,
  rUp: V(0.12, -1, 0.02), rFo: V(0.05, -0.75, 0.6), lUp: V(-0.12, -1, 0.02), lFo: V(-0.05, -0.85, 0.45),
  rk: V(0.32, -0.3, 0.9), face: V(1, 0, 0) }); // головка вперёд и наружу: на махе назад рукой ракетка идёт мимо ноги
// Сидя на скамейке: таз на сиденье (~0,45 м, player.js), бёдра вперёд, стопы на земле (ноги ставит legs), спина прямо,
// кисти на бёдрах, ракетка в правой головкой на земле справа от ног. Бёдра и голени в ключе — для позы без ступней.
export const SIT = P({ lean: -3, lh: -1,
  rUp: V(0.16, -0.85, 0.4), rFo: V(0.08, -0.45, 0.9), lUp: V(-0.06, -0.85, 0.45), lFo: V(-0.02, -0.4, 0.92),
  rTh: V(0.1, -0.05, 1), rSh: V(0, -1, 0.05), lTh: V(-0.1, -0.05, 1), lSh: V(0, -1, 0.05),
  rk: V(0.3, -0.85, 0.35), face: V(1, 0, 0.2) }); // ракетка снаружи правой ноги, не поперёк колен
