// Кости-скрутки рук: LeftArmTwist и LeftForeArmTwist (и правые) добавляет tools/rig-weights.py. Линейный скиннинг на
// стыке двух костей, повёрнутых друг к другу на θ вокруг оси, сжимает сечение в cos(θ/2) раз: плечо, провёрнутое
// на 90° одной костью, теряет у ключицы 29 %. Скрутка забирает часть угла, и кручение расходится по длине руки.
// У модели без скруток функции ничего не делают — swing.js работает как раньше.
import * as THREE from 'three';

const ARM_BACK = 0.6, PRONATE = 0.65; // сколько прокрута плеча скрутка возвращает назад; доля пронации на скрутке предплечья
const _q = new THREE.Quaternion();

// Плечо провернули на ang вокруг его оси u (оси игрока): скрутка у плечевого сустава доворачивается обратно,
// и стык с ключицей крутится на 0,4·ang вместо всего угла.
export function armTwist(rig, side, u, ang) {
  const b = rig.b[side + 'ArmTwist'];
  if (b) rig.rotate(b, _q.setFromAxisAngle(u, -ARM_BACK * ang));
}

// Пронация кисти tw (поворот вокруг оси предплечья, мир): скрутка предплечья берёт 0,65, само предплечье не крутится —
// лучевая кость вращается у запястья, а локоть остаётся на месте. false — скрутки нет, крутить предплечье как раньше.
export function foreTwist(rig, s, tw) {
  const b = rig.b[s + 'ForeArmTwist'];
  if (!b) return false;
  rig.turnWorld(b, _q.identity().slerp(tw, PRONATE));
  return true;
}
