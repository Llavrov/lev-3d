// Показ упражнения шагами, как сторис: движение целиком в обычном темпе, потом каждая фаза медленно с камерой у мышц
// этой фазы, в конце — что беречь. Здесь только расписание и текст: чистые функции, проверяются в test/trainer.test.mjs.
import { cycleOf, typo, RU } from './exercises.js';

const WORD = 0.3, LEAD = 0.35, TAIL = 1.4; // секунд на слово, до первого слова и после последнего: темп чтения в зале
const SLOW = 0.5, MAX = 8; // замедление на фазах и потолок движения в шаге, секунд (планку держат 30 с)
const names = (list) => list.slice(0, 3).map((m) => RU[m] ?? m).join(', '); // больше трёх имён в подписи не читается
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const about = (verb, list) => (list.length ? ` ${verb} ${names(list)}.` : ''); // пустой список — без фразы, а не «Работают .»

// Слова подписи по одному. Неразрывные пробелы держат предлог со словом и число с единицей: они появляются вместе.
export const words = (text) => typo(text).split(' ');
export const readTime = (text) => LEAD + words(text).length * WORD + TAIL;
// Сколько слов видно в секунду tau шага.
export const wordsShown = (tau) => Math.max(0, Math.floor((tau - LEAD) / WORD) + 1);

// Шаг: kind (whole, phase, careful), title, text, отрезок цикла from..to в секундах, speed (доля обычного темпа),
// dur — длина шага, focus — { role: work | stretch | careful, list } или null (тело целиком).
export function buildSteps(ex, dose) { // dose — дозировка из плана тренировки вместо своей
  const cyc = cycleOf(ex), m = ex.muscles, work = m.work.filter((x) => !m.careful.includes(x)), main = work.length ? work : m.work;
  const mk = (o, max = MAX) => ({ ...o, dur: Math.max(readTime(o.text), Math.min((o.to - o.from) / o.speed, max)) });
  const steps = [mk({ kind: 'whole', title: 'Целиком', from: 0, to: cyc * (cyc < 5 ? 2 : 1), speed: 1, focus: null, // короткое движение — дважды
    text: `${dose || `${ex.dose.sets} × ${ex.dose.reps}, отдых ${ex.dose.rest_s} с`}.${about('Работают', main)}` }, ex.follow ? 12 : MAX)]; // бег туда и обратно длиннее 8 с: не обрывать на полпути
  let t = 0;
  // бег вполсилы выглядит не бегом (Лёва 24.11: «слишком медленно бежит»): фазы бега идут в настоящем темпе
  for (const p of ex.phases) {
    const st = !!p.stretch && m.stretch.length > 0, list = st ? m.stretch : main;
    steps.push(mk({ kind: 'phase', title: cap(p.name), from: t, to: t + p.tempo_s, speed: ex.runs ? 1 : SLOW, focus: { role: st ? 'stretch' : 'work', list },
      text: `${p.cue.replace(/\.$/, '')}.${about(st ? 'Тянутся' : 'Работают', list)}` }));
    t += p.tempo_s;
  }
  if (m.careful.length) steps.push(mk({ kind: 'careful', title: 'Беречь', from: 0, to: cyc, speed: 1, focus: { role: 'careful', list: m.careful },
    text: `Беречь: ${names(m.careful)}.` }, 6));
  if (ex.mistakes?.length) steps.push(mk({ kind: 'whole', title: 'Ошибки', from: 0, to: cyc, speed: 1, focus: null,
    text: `Ошибки: ${ex.mistakes.map((s) => s[0].toLowerCase() + s.slice(1)).join('; ')}.` }, 6));
  return steps;
}
// Секунда цикла в момент tau шага: движение идёт своим темпом и стоит в конце отрезка, пока дочитывается подпись.
export const cycleTime = (step, tau) => step.from + Math.min(Math.max(tau, 0) * step.speed, step.to - step.from);
