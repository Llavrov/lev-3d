// node --test test/: фазы тренера (секунда цикла → фаза и глубина) и русская типографика подсказок.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, MUSCLES, RU, phaseAt, cycleOf, typo, exerciseById } from '../src/trainer/exercises.js';

const ex = exerciseById('romanian-deadlift-db');

test('румынская тяга: цикл 3 + 1 + 2 с, глубина вниз, пауза внизу, вверх', () => {
  assert.equal(cycleOf(ex), 6);
  assert.deepEqual([0, 1.5, 3, 3.5, 4, 5, 5.999].map((t) => phaseAt(ex, t).i), [0, 0, 1, 1, 2, 2, 2]);
  assert.equal(phaseAt(ex, 0).depth, 0);
  assert.equal(phaseAt(ex, 1.5).depth, 0.5);
  assert.equal(phaseAt(ex, 3.5).depth, 1);
  assert.ok(Math.abs(phaseAt(ex, 6).depth) < 1e-9 && phaseAt(ex, 6).i === 0); // цикл повторяется
  assert.ok(phaseAt(ex, 5.999).depth < 0.01);
});

test('данные упражнений: поля как у будущей базы, мышцы из словаря, у каждой есть русское имя', () => {
  for (const e of EXERCISES) {
    assert.ok(e.id && e.name && e.dose.sets && e.dose.reps && e.dose.rest_s);
    for (const k of ['work', 'stretch', 'careful']) for (const m of e.muscles[k]) assert.ok(MUSCLES.includes(m) || ['knee', 'ankle', 'shoulder_joint', 'elbow', 'wrist'].includes(m), m);
    for (const p of e.phases) assert.ok(p.name && p.cue && p.tempo_s > 0);
  }
  for (const m of MUSCLES) assert.ok(RU[m], m);
});

test('типограф: предлоги и «не» не висят, тире и единицы не отрываются', () => {
  assert.equal(typo('Таз назад, гантели скользят вниз по ногам'), 'Таз назад, гантели скользят вниз по ногам');
  assert.equal(typo('не гни спину и в пол смотри — 2 м вперёд'), 'не гни спину и в пол смотри — 2 м вперёд');
  assert.equal(typo('отдых 90 с'), 'отдых 90 с');
});

// ---------- Показ шагами (show.js) ----------
import { buildSteps, cycleTime, wordsShown, words, readTime } from '../src/trainer/show.js';

test('показ румынской тяги: целиком, три фазы медленно, беречь; тексты целиком', () => {
  const st = buildSteps(ex);
  assert.deepEqual(st.map((x) => x.kind), ['whole', 'phase', 'phase', 'phase', 'careful', 'whole']);
  assert.deepEqual(st.map((x) => x.text), [
    '3\u00a0×\u00a010, отдых 90 с. Работают задняя поверхность бедра, ягодицы.',
    'Таз назад, гантели вдоль ног. Тянутся задняя поверхность бедра, ягодицы.',
    'Спина прямая, бедро сзади натянуто. Тянутся задняя поверхность бедра, ягодицы.',
    'Таз вперёд, сожми ягодицы. Работают задняя поверхность бедра, ягодицы.',
    'Беречь: поясница.',
    'Ошибки: круглая спина; гантели далеко от ног.']);
  assert.equal(st[0].focus, null);
  assert.deepEqual(st[1].focus, { role: 'stretch', list: ['hamstrings', 'glutes'] });
  assert.deepEqual(st[3].focus, { role: 'work', list: ['hamstrings', 'glutes'] }); // поясница в «беречь», в работающих её не показываем
  assert.deepEqual(st[4].focus, { role: 'careful', list: ['lower_back'] });
  assert.deepEqual(st.map((x) => [x.from, x.to, x.speed]), [[0, 6, 1], [0, 3, 0.5], [3, 4, 0.5], [4, 6, 0.5], [0, 6, 1], [0, 6, 1]]);
});

test('показ: шаг не короче чтения подписи, движение стоит в конце отрезка, слова идут по одному', () => {
  for (const e of EXERCISES) for (const s of buildSteps(e)) {
    assert.ok(s.dur >= readTime(s.text) - 1e-9 && s.dur <= 9, `${e.id} ${s.title} ${s.dur}`);
    assert.ok(s.text.length <= 95 && words(s.text).length <= 14, `${e.id}: ${s.text}`); // четыре строки на телефоне
    assert.equal(cycleTime(s, 0), s.from);
    assert.ok(cycleTime(s, s.dur) <= s.to + 1e-9 && cycleTime(s, 1e3) === s.to);
    assert.equal(wordsShown(s.dur), Math.floor((s.dur - 0.35) / 0.3) + 1);
    assert.ok(wordsShown(s.dur - 1) >= words(s.text).length, `${e.id} ${s.title}: подпись дочитана за секунду до конца шага`);
  }
  assert.equal(wordsShown(0), 0); assert.equal(wordsShown(0.35), 1); assert.equal(wordsShown(1), 3);
  assert.equal(buildSteps(exerciseById('side-plank')).length, 5); // у планки две фазы, целиком, «беречь» и «ошибки»
  assert.deepEqual(words('отдых 90 с. Таз назад и в пол'), ['отдых', '90\u00a0с.', 'Таз', 'назад', 'и\u00a0в\u00a0пол']); // предлог и единица не отрываются
});
