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
