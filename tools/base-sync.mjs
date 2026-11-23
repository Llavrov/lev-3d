// Данные упражнений тренера → база тренировки/база/exercises.json: имя, мышцы, фазы и дозировка тех упражнений, что есть
// и там, и там. Тренер главнее: его данные сверены с позой на модели. node tools/base-sync.mjs, потом в базе node check.mjs && node index.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { EXERCISES } from '../src/trainer/exercises.js';

const file = new URL('../../../тренировки/база/exercises.json', import.meta.url);
const base = JSON.parse(readFileSync(file, 'utf8'));
let changed = 0;
for (const e of EXERCISES) {
  const b = base.find((x) => x.id === e.id);
  if (!b) { console.log(`нет в базе: ${e.id}`); continue; }
  const next = { name: e.name, muscles: e.muscles, phases: e.phases.map(({ name, cue, tempo_s }) => ({ name, cue, tempo_s })), dose: e.dose };
  const was = JSON.stringify({ name: b.name, muscles: b.muscles, phases: b.phases.map(({ name, cue, tempo_s }) => ({ name, cue, tempo_s })), dose: b.dose });
  if (was === JSON.stringify(next)) continue;
  Object.assign(b, next); changed++;
  console.log(`обновлено: ${e.id}`);
}
writeFileSync(file, JSON.stringify(base, null, 2) + '\n');
console.log(`в базе обновлено упражнений: ${changed}`);
