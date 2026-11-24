// Румынская тяга со штангой: как с гантелями (romanian-deadlift-db.js), но гриф один на прямой хват чуть шире бёдер
// и скользит по передней линии ног. Колени почти прямые (16 → 18°), голень от 4° вперёд до 6° назад, корпус от 86° до 20°
// над горизонталью из тазобедренных, спина прямая. Блины Ø30 см: блин 45 см сбоку закрывает руки и колени.
import * as THREE from 'three';
import { V, lerp, smooth, cm, key, stand, feet, trunk, placeHips, look, baseAudit } from '../poses.js';
import { bar, barAt, gripOnBar, hangBar, barToLegs, hipBend } from '../posterior.js';
import { hipsOver } from './romanian-deadlift-db.js';

const BOTTOM = 20, GX = 0.24; // корпус внизу над горизонталью, °; хват от середины грифа, м
const K = key({ rUp: V(0.08, -1, 0.05), rFo: V(0.06, -1, 0.12), lUp: V(-0.08, -1, 0.05), lFo: V(-0.06, -1, 0.12),
  rTh: V(0.05, -1, 0), rSh: V(0.03, -1, 0), lTh: V(-0.05, -1, 0), lSh: V(-0.03, -1, 0) });

export default {
  id: 'romanian-deadlift-bb',
  name: 'Румынская тяга со штангой',
  muscles: { work: ['hamstrings', 'glutes', 'lower_back'], stretch: ['hamstrings'], careful: ['lower_back', 'hamstrings'] },
  phases: [
    { name: 'вниз', cue: 'Таз назад, гриф по бёдрам', tempo_s: 3, stretch: true },
    { name: 'низ', cue: 'Натяжение сзади, спина прямая', tempo_s: 1, stretch: true },
    { name: 'вверх', cue: 'Таз вперёд, сожми ягодицы', tempo_s: 1 },
  ],
  dose: { sets: '3', reps: '8', rest_s: 120 },
  mistakes: ['Круглая спина', 'Сгибание коленей как в приседе'],
  view: 'side',
  setup(T) { bar(T, 0.66); T.feetAt = feet(T, T.hipHalf); },
  motion(i, u) { const e = smooth(u); return i === 0 ? e : i === 1 ? 1 : 1 - e; },
  pose(T, { depth }) {
    stand(T);
    trunk(T, K, lerp(86, BOTTOM, depth));
    placeHips(T, hipsOver(T, lerp(16, 18, depth), lerp(4, -6, depth)), T.feetAt);
    look(T, new THREE.Vector3(0, lerp(1.2, 0, depth), lerp(5, 2, depth))); // стоя взгляд вперёд, в наклоне на пол в линию со спиной
    hangBar(T, GX);
  },
  audit(T) {
    const r = baseAudit(T);
    gripOnBar(T, r);
    const g = barToLegs(T), c = barAt(T);
    r.m.barGap = cm(g); r.m.barY = cm(c.y); r.m.hip = hipBend(T);
    if (g < -0.01) r.bad.push(`гриф в ногах (${cm(g)} см)`);
    if (g > 0.06) r.bad.push(`гриф далеко от ног (${cm(g)} см)`);
    if (c.y - T.plateR < 0.02) r.bad.push('блины в полу');
    for (const k of ['kneeL', 'kneeR']) if (r.m[k] > 25) r.bad.push(`колени согнуты как в приседе: ${r.m[k]}°`);
    return r;
  },
};
