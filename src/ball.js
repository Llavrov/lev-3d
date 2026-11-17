// Теннисный мяч: диаметр 6.7 см, жёлтый ворс и белый шов-«восьмёрка».
import * as THREE from 'three';

export const BALL_R = 0.0335;

// Шов — кривая на сфере x = a·cos t + b·cos 3t, y = a·sin t − b·sin 3t, z = 2√(ab)·sin 2t (при a + b = 1 лежит на единичной сфере).
function feltTexture() {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#d3ee3b'; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 30; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.5; }
  g.putImageData(img, 0, 0);
  const a = 0.68, b = 0.32, k = 2 * Math.sqrt(a * b);
  g.fillStyle = '#f2f1e6';
  for (let i = 0; i < 4000; i++) {
    const t = (i / 4000) * Math.PI * 2;
    const x = a * Math.cos(t) + b * Math.cos(3 * t), y = a * Math.sin(t) - b * Math.sin(3 * t), z = k * Math.sin(2 * t);
    // Та же развёртка, что у SphereGeometry: x = −cos φ·sin θ, y = cos θ, z = sin φ·sin θ.
    const theta = Math.acos(y), phi = Math.atan2(z, -x);
    const u = ((phi / (Math.PI * 2)) % 1 + 1) % 1, v = theta / Math.PI;
    const ry = 6, rx = Math.min(ry / Math.max(Math.sin(theta), 0.05), 60);
    for (const du of [0, -1, 1]) { g.beginPath(); g.ellipse((u + du) * W, v * H, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function buildBall() {
  const mat = new THREE.MeshPhysicalMaterial({ map: feltTexture(), roughness: 1, sheen: 1, sheenColor: new THREE.Color('#f4ff9a'), sheenRoughness: 0.7 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 48, 24), mat);
  ball.castShadow = true; ball.name = 'ball';
  return ball;
}
