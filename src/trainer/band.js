// Резинка (эспандер) и любой шнур между двумя точками: тонкий цилиндр, который каждый кадр тянется от a к b.
// setup: T.band = band(T); pose: stretch(T.band, якорь, кисть). Общий для всех упражнений с резинкой.
import * as THREE from 'three';

const Y = new THREE.Vector3(0, 1, 0);
export function band(T, color = '#d23b3b', r = 0.008) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  m.castShadow = true; T.add(m);
  return m;
}
export function stretch(m, a, b) {
  const d = b.clone().sub(a), len = d.length();
  m.visible = len > 1e-4;
  if (!m.visible) return;
  m.position.copy(a).addScaledVector(d, 0.5); m.scale.y = len; m.quaternion.setFromUnitVectors(Y, d.divideScalar(len));
}
