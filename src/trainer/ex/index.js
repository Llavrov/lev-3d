// Упражнения тренера по порядку в списке. Каждое в своём файле: данные в форме базы (тексты из тренировки/база/exercises.json),
// стартовый ракурс, снаряды (setup), поза по фазе (pose) и свои проверки (audit).
import rdl from './romanian-deadlift-db.js';
import squat from './back-squat-bb.js';
import bench from './db-bench-press.js';
import row from './bent-over-row-db.js';
import lunge from './reverse-lunge-db.js';
import plank from './side-plank.js';
import chop from './cable-woodchop.js';

export default [rdl, squat, bench, row, lunge, plank, chop];
