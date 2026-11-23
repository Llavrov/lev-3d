// Упражнения тренера по порядку в списке. Каждое в своём файле: данные в форме базы (тексты из тренировки/база/exercises.json),
// стартовый ракурс, снаряды (setup), поза по фазе (pose) и свои проверки (audit).
import rdl from './romanian-deadlift-db.js';
import squat from './back-squat-bb.js';
import bench from './db-bench-press.js';
import row from './bent-over-row-db.js';
import lunge from './reverse-lunge-db.js';
import plank from './side-plank.js';
import chop from './cable-woodchop.js';
// Восстановление и мобильность (23.11.2026): без хвата и без снарядов.
import hamStretch from './hamstring-static-stretch.js';
import hip9090 from './hip-90-90.js';
import spiderman from './spiderman-lunge.js';
import deadBug from './dead-bug.js';
import birdDog from './bird-dog.js';
import gluteBridge from './single-leg-glute-bridge.js';
import swimmer from './superman-swimmer.js';
import ytwl from './ytwl-raise.js';
// Работа ног под теннис (23.11.2026, исполнитель A): шаги по полу, помощник ../steps.js.
import shuffle from './lateral-shuffle.js';
import carioca from './carioca.js';
import crossover from './crossover-step-drill.js';
import spider from './spider-drill.js';
import intervals from './court-intervals.js';
// Работа ног под теннис (23.11.2026, исполнитель B): прыжки и торможение, помощник ../jump.js.
import splitStep from './split-step-reaction.js';
import bound from './lateral-bound-stick.js';
import decel from './deceleration-lunge.js';
import balance from './single-leg-balance.js';

export default [rdl, squat, bench, row, lunge, plank, chop, hamStretch, hip9090, spiderman, deadBug, birdDog, gluteBridge, swimmer, ytwl, shuffle, carioca, crossover, spider, intervals, splitStep, bound, decel, balance];
