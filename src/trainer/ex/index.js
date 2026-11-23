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

export default [rdl, squat, bench, row, lunge, plank, chop, hamStretch, hip9090, spiderman, deadBug, birdDog, gluteBridge, swimmer, ytwl];
