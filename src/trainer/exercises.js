// Словарь мышц и суставов, русские имена, фазы по времени и типограф. Сами упражнения — src/trainer/ex/<id>.js в форме базы:
// { id, name, muscles: { work, stretch, careful }, phases: [{ name, cue, tempo_s, stretch? }], dose: { sets, reps, rest_s } }.

export const MUSCLES = ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'hip_abductors', 'hip_flexors', 'abs', 'obliques',
  'lower_back', 'lats', 'traps', 'rhomboids', 'chest', 'delts_front', 'delts_side', 'delts_rear', 'rotator_cuff', 'biceps', 'triceps',
  'forearms', 'neck'];
export const JOINTS = ['knee', 'ankle', 'shoulder_joint', 'elbow', 'wrist'];

export const RU = {
  quads: 'квадрицепс', hamstrings: 'задняя поверхность бедра', glutes: 'ягодицы', calves: 'икры', adductors: 'приводящие бедра',
  hip_abductors: 'отводящие бедра', hip_flexors: 'сгибатели бедра', abs: 'пресс', obliques: 'косые мышцы живота', lower_back: 'поясница',
  lats: 'широчайшие', traps: 'трапеции', rhomboids: 'ромбовидные', chest: 'грудь', delts_front: 'передние дельты',
  delts_side: 'средние дельты', delts_rear: 'задние дельты', rotator_cuff: 'вращательная манжета', biceps: 'бицепс', triceps: 'трицепс',
  forearms: 'предплечья', neck: 'шея',
  knee: 'колени', ankle: 'голеностоп', shoulder_joint: 'плечевой сустав', elbow: 'локти', wrist: 'запястья',
};

import LIST from './ex/index.js';

export const EXERCISES = LIST;
export const exerciseById = (id) => EXERCISES.find((e) => e.id === id) ?? EXERCISES[0];

export const cycleOf = (ex) => ex.phases.reduce((s, p) => s + p.tempo_s, 0);
// Где в цикле секунда t: номер фазы, доля фазы u и глубина движения 0 (верх) .. 1 (низ).
// Фазы с stretch идут вниз и держат низ, остальные возвращают наверх; сначала опускание, потом пауза, потом подъём.
export function phaseAt(ex, t) {
  const T = cycleOf(ex);
  t = ((t % T) + T) % T;
  let i = 0;
  while (t >= ex.phases[i].tempo_s && i < ex.phases.length - 1) t -= ex.phases[i++].tempo_s;
  const u = Math.min(1, t / ex.phases[i].tempo_s), ease = u * u * (3 - 2 * u);
  const depth = ex.motion ? ex.motion(i, u) : i === 0 ? ease : ex.phases[i].stretch ? 1 : 1 - ease; // своя кривая у упражнения — motion
  return { i, u, depth, phase: ex.phases[i] };
}

// Русская типографика: неразрывный пробел после коротких предлогов, союзов и «не», перед тире, между числом и единицей.
// Без lookbehind: старый Safari его не разбирает.
const SHORT = 'в|во|и|а|но|на|не|ни|с|со|к|ко|о|об|у|по|за|до|из|от|без|для|при|над|под|или|что|же';
export function typo(s) {
  return s
    .replace(new RegExp(`(^|[\\s(«])(${SHORT}) `, 'gi'), '$1$2 ')
    .replace(new RegExp(`(^|[\\s(«])(${SHORT}) `, 'gi'), '$1$2 ') // второй проход: «и в ...»
    .replace(/ (—|–)/g, ' $1')
    .replace(/(\d) (с|кг|см|м|мин|раз|%|°)(?=$|[\s.,;:!?)])/g, '$1 $2');
}
