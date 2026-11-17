// Корректирующие морфы плеча (пишет tools/rig-correctives.py). Морф — поправка плеча, подмышки и груди, снятая в
// позе удара из игры (дельта-маш поверх линейного скиннинга) и переведённая в позу покоя. Линейный скиннинг на
// стыке руки и туловища даёт складку и белую полосу растянутой футболки, когда рука вперёд-вверх или поперёк груди.
// Морф включается по направлению плеча в осях груди: в своей позе полностью, дальше 45° от неё — ноль.
// Имя морфа несёт свою позу: «cRight|x|y|z» — сторона и направление плеча (Arm → ForeArm) в осях груди.
// У модели без морфов ничего не делает.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3();
const NEAR = Math.cos(THREE.MathUtils.degToRad(8)), FAR = Math.cos(THREE.MathUtils.degToRad(45));

// Направление плеча в осях груди: поворот Spine2 от позы покоя (вместе с поворотом игрока) снимаем с вектора плеча.
export function armInChest(rig, side, mesh, out = new THREE.Vector3()) {
  const sk = mesh.skeleton, sp = rig.b.Spine2;
  _m.multiplyMatrices(sp.matrixWorld, sk.boneInverses[sk.bones.indexOf(sp)]).decompose(_p, _q, _s);
  out.setFromMatrixPosition(rig.b[side + 'ForeArm'].matrixWorld).sub(_t.setFromMatrixPosition(rig.b[side + 'Arm'].matrixWorld));
  return out.applyQuaternion(_q.invert()).normalize();
}

function setup(rig) {
  let mesh = null;
  rig.root.traverse((o) => { if (!mesh && o.isSkinnedMesh && o.morphTargetDictionary) mesh = o; });
  if (!mesh) return null;
  const keys = [];
  for (const [name, i] of Object.entries(mesh.morphTargetDictionary)) {
    const [side, ...d] = name.split('|');
    if (side === 'cLeft' || side === 'cRight') keys.push({ i, side: side.slice(1), dir: new THREE.Vector3(...d.map(Number)).normalize() });
  }
  return keys.length ? { mesh, keys } : null;
}

// Каждый кадр после позы: доли морфов по близости плеча к их позам; сумма на сторону не больше 1.
export function applyCorrectives(rig) {
  if (rig.corr === undefined) rig.corr = setup(rig);
  const c = rig.corr;
  if (!c) return;
  rig.root.updateMatrixWorld(true);
  const inf = c.mesh.morphTargetInfluences;
  for (const side of ['Left', 'Right']) {
    const u = armInChest(rig, side, c.mesh, _u);
    let sum = 0;
    for (const k of c.keys) if (k.side === side) sum += inf[k.i] = THREE.MathUtils.smoothstep(u.dot(k.dir), FAR, NEAR);
    if (sum > 1) for (const k of c.keys) if (k.side === side) inf[k.i] /= sum;
  }
}
