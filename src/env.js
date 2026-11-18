// Окружение клуба в альпийской долине: небо и воздух (env-sky.js), горы с лесом (env-mountains.js), клуб вокруг корта
// (env-club.js), клубный дом (env-house.js) с террасой, ели и липы. Деревья — модели Ильдара из проекта Монтероза (README).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildMountains, heightAt } from './env-mountains.js';
import { buildHouse } from './env-house.js';
import { buildSky, HAZE } from './env-sky.js';
import { buildClub, pathGap, WIND } from './env-club.js';
import { buildValley } from './env-valley.js';
export { SUN, HAZE, AIR_DENSITY, outdoorEnv } from './env-sky.js';
export { groundAt } from './env-mountains.js'; // высота газона с буграми: по ней ходят
export { door, HOUSE, indoor, shadeIndoors } from './env-house.js'; // дверь клубного дома, стены для столкновений, игроки в зале
export const HORIZON = HAZE; // старое имя цвета дымки

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- Деревья ----------
// Модели Ильдара (trees.glb из Монтерозы): ели tree_1..3 с ветками-карточками, липа broad_1, tree_4. Кусты shrub_*
// пробовали: против солнца выходили белёсыми пятнами над забором.
// Нормали листвы заменяем нормалями гладкой оболочки кроны (85 % + 15 % своей), как Ильдар в trees_lit: у дерева
// одна освещённая и одна теневая сторона, а не случайно горящие ветки. Глубже внутри кроны темнее (цвета вершин).
function shellNormals(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3()), r = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const p = geo.attributes.position, n = geo.attributes.normal, col = new Float32Array(p.count * 3), v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c).divide(r); const d = Math.min(1, v.length());
    v.normalize().multiplyScalar(0.85).add(w.fromBufferAttribute(n, i).multiplyScalar(0.15)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
    const ao = 0.45 + 0.55 * d * d; col.set([ao, ao, ao], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// Листва: без переворота нормали у изнанки (свет идёт от оболочки кроны), снизу подсвечивает газон, против солнца
// листья просвечивают; осенний оттенок атласов Ильдара тянем к летней зелени (приём из Монтерозы).
function foliage(m) {
  m.vertexColors = true; m.side = THREE.DoubleSide; m.envMapIntensity = 0.6;
  m.onBeforeCompile = (sh) => {
    // Ветерок: крона качается тем сильнее, чем выше, листья мелко дрожат; у каждого дерева своя фаза.
    sh.uniforms.wind = WIND;
    sh.vertexShader = 'uniform float wind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 io = vec3(0.);
      #ifdef USE_INSTANCING
        io = instanceMatrix[3].xyz;
      #endif
      float hh = max(transformed.y - 2., 0.);
      transformed.x += sin(wind * 1.2 + io.x * .3 + io.z * .1) * .006 * hh + sin(wind * 7. + position.z * 4. + io.x) * .012;
      transformed.z += cos(wind * .9 + io.z * .3) * .005 * hh + cos(wind * 6.3 + position.x * 4. + io.z) * .012;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <lights_pars_begin>', THREE.ShaderChunk.lights_pars_begin.replace('mix( hemiLight.groundColor,', 'mix( hemiLight.groundColor * vec3(0.45, 0.95, 0.5),'))
      .replace('#include <map_fragment>', `#include <map_fragment>
        float warm = clamp((diffuseColor.r - diffuseColor.b) * 3.0, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.15, 0.04) * (0.5 + dot(diffuseColor.rgb, vec3(1.4))), warm * 0.75);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
          float back = pow(max(dot(normalize(-vViewPosition), directionalLights[0].direction), 0.0), 2.0) * vColor.r * vColor.r;
          reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * back * vec3(0.07, 0.09, 0.03); // цвет света уже с силой солнца
        #endif`);
  };
}

// Места деревьев: [вид, x, z, масштаб]. Дальний конец долины (−z) открыт — оттуда видна большая гора;
// слева ряд высоких елей (их тень ложится на левый запас), справа у дальнего угла шале с террасой, за спиной Лёвы липы поодаль.
function treeSpots() {
  const r = rng(31), out = [];
  const free = (x, z, gap) => !(x > 9.6 && x < 34 && z > -38 && z < -12) && !(x > -50 && x < -26 && Math.abs(z) < 23) /* корт 2 */ && !(Math.abs(x) < 26 && z < -22 && z > -160) && !(Math.abs(x) < 22 && z > 22 && z < 40)
    && out.every((s) => (s[1] - x) ** 2 + (s[2] - z) ** 2 > gap * gap) && !(Math.abs(x) < 12.5 && Math.abs(z) < 23) && pathGap(x, z) > 2.5;
  const put = (kind, x, z, s, gap) => { if (free(x, z, gap)) out.push([kind, x, z, s]); };
  for (let i = 0; i < 9; i++) put(['tree_2', 'tree_3', 'tree_1'][i % 3], -15 - r() * 4, -22 + i * 5.5 + r() * 2, 0.8 + r() * 0.3, 3.5);
  for (let i = 0; i < 5; i++) put('broad_1', -22 + i * 11 + r() * 3, 44 + r() * 8, 1 + r() * 0.3, 3.4); // за спиной Лёвы подальше: в меню над забором видны горы
  for (let k = 0; k < 3000 && out.length < 60; k++) { // ближе 70 м — объёмные ели и липы группами
    const a = r() * Math.PI * 2, d = 18 + r() * 52, x = Math.sin(a) * d * 1.3, z = -Math.cos(a) * d;
    if (vnoise2(x / 40, z / 40) < 0.45) continue;
    put(r() < 0.65 ? ['tree_1', 'tree_2', 'tree_3'][Math.floor(r() * 3)] : r() < 0.6 ? 'broad_1' : 'tree_4', x, z, 0.75 + r() * 0.5, 5);
  }
  return out;
}
const vnoise2 = (x, z) => { const s = Math.sin(x * 1.7 + Math.sin(z * 1.3)) * Math.cos(z * 1.9 + Math.sin(x * 0.7)); return 0.5 + 0.5 * s; };

// Кора: Poly Haven bark_brown_02 (кадр 1 м, CC0) трипланарно по мировым координатам — на стволах Ильдара своя
// развёртка тянула текстуру 256 px в мутное пятно. Трещины объёмные: карта нормалей теми же тремя проекциями.
const texL = new THREE.TextureLoader();
const ptex = (n, data) => { const t = texL.load(`/tex/${n}.webp`); t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
let barkT, barkN;
const TONE = (kind) => (kind.startsWith('tree_') && kind !== 'tree_4' ? '#a8968c' : '#bdb7b0'); // кора елей чуть рыжее, липы серее
function barkMaterial(color) {
  barkT ??= ptex('bark'); barkN ??= ptex('bark-n', true);
  const m = new THREE.MeshStandardMaterial({ map: barkT, color, roughness: 0.95, metalness: 0 });
  m.customProgramCacheKey = () => 'bark';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.barkN = { value: barkN };
    sh.vertexShader = 'varying vec3 vTp, vTn; varying float vBase;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 tp = vec4(transformed, 1.); vec3 tn = objectNormal; float base = 0.;
      #ifdef USE_INSTANCING
        tp = instanceMatrix * tp; tn = mat3(instanceMatrix) * tn; base = instanceMatrix[3].y;
      #endif
      vTp = (modelMatrix * tp).xyz; vTn = normalize(mat3(modelMatrix) * tn); vBase = (modelMatrix * vec4(0., base, 0., 1.)).y + .1;`);
    sh.fragmentShader = 'uniform sampler2D barkN; varying vec3 vTp, vTn; varying float vBase;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 tw = pow(abs(vTn), vec3(4.)); tw /= tw.x + tw.y + tw.z;
      vec2 ua = vTp.zy / .9, ub = vTp.xz / .9, uc = vTp.xy / .9;
      vec4 bk = texture2D(map, ua) * tw.x + texture2D(map, ub) * tw.y + texture2D(map, uc) * tw.z;
      diffuseColor *= bk;
      diffuseColor.rgb *= mix(.55, 1., smoothstep(-.05, .45, vTp.y - vBase)); // у земли темнее: сырость, земля на корнях`)
      .replace('#include <normal_fragment_maps>', `
      vec2 na = texture2D(barkN, ua).xy * 2. - 1., nb = texture2D(barkN, ub).xy * 2. - 1., nc = texture2D(barkN, uc).xy * 2. - 1.;
      vec3 pw = vec3(0., na.y, na.x) * tw.x + vec3(nb.x, 0., nb.y) * tw.y + vec3(nc.x, nc.y, 0.) * tw.z;
      normal = normalize(mat3(viewMatrix) * normalize(vTn + pw * 1.4));`);
  };
  return m;
}
// Корни: у ствола расширение (верх прячется в стволе) и пять корней веером — сплюснутые конусы, кончиком в землю.
// Единица — радиус ствола у земли.
function rootGeometry() {
  const parts = [new THREE.CylinderGeometry(0.82, 1.45, 0.75, 14, 1, true).translate(0, 0.27, 0)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + (i % 2) * 0.35, len = 1.4 + 0.4 * ((i * 7) % 3) / 2;
    parts.push(new THREE.ConeGeometry(0.42, len, 9).rotateZ(-Math.PI / 2 - 0.3).scale(1, 0.55, 1).translate(0.5 + len * 0.42, 0.14, 0).rotateY(a));
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

function trees(group, spots, onAtlas) {
  new GLTFLoader().load('/models/trees.glb', (gltf) => {
    const kinds = {};
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.parent?.name && o.parent !== gltf.scene ? o.parent.name : o.name;
      (kinds[name] ??= []).push(o);
      if (o.material.alphaTest > 0 && !o.userData.done) { o.userData.done = true; if (name.startsWith('bb_')) onAtlas?.(o.material.map); }
    });
    const prepared = new Set(), barkMats = {}, trunkOf = {};
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), r = rng(7);
    const by = {}; for (const s of spots) (by[s[0] + (s[1] < -12 && s[2] > -30 && s[2] < -2 ? '+' : '')] ??= []).push(s); // тень на корт — только от елей у дальней половины: ближняя половина Лёвы на солнце
    for (const [key, list] of Object.entries(by)) {
      const parts = kinds[key.replace('+', '')]; if (!parts) continue;
      for (const part of parts) {
        if (!prepared.has(part)) {
          prepared.add(part);
          part.material.metalness = 0; part.material.roughness = 0.9; // в glTF металличность по умолчанию 1: листва выходила тёмной
          if (part.material.alphaTest > 0) { shellNormals(part.geometry); foliage(part.material); }
          else { // ствол: кора и корни по радиусу ствола у земли
            const k = key.replace('+', ''), tone = TONE(k);
            part.material = (barkMats[tone] ??= barkMaterial(tone));
            const p = part.geometry.attributes.position; part.geometry.computeBoundingBox(); const y0 = part.geometry.boundingBox.min.y;
            let cx = 0, cz = 0, n = 0, rad = 0;
            for (let i = 0; i < p.count; i++) if (p.getY(i) < y0 + 0.3) { cx += p.getX(i); cz += p.getZ(i); n++; }
            cx /= n || 1; cz /= n || 1;
            for (let i = 0; i < p.count; i++) if (p.getY(i) < y0 + 0.3) rad = Math.max(rad, Math.hypot(p.getX(i) - cx, p.getZ(i) - cz));
            trunkOf[k] = { rad: Math.min(rad, 0.6), cx, cz, y0 };
          }
        }
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        list.forEach((s, i) => { const k = s[3]; im.setMatrixAt(i, m4.compose(new THREE.Vector3(s[1], heightAt(s[1], s[2]) - 0.1, s[2]), q.setFromAxisAngle(up, r() * 6.28), new THREE.Vector3(k, k * (0.9 + r() * 0.2), k))); });
        im.castShadow = key.endsWith('+'); im.receiveShadow = true;
        group.add(im);
      }
    }
    // Корни: один вызов отрисовки на все деревья, масштаб — радиус ствола × размер дерева.
    const roots = [];
    for (const s of spots) { const t = trunkOf[s[0]]; if (t && t.rad > 0.05) roots.push([s, t]); }
    const rim = new THREE.InstancedMesh(rootGeometry(), barkMaterial('#ffffff'), roots.length), rr = rng(13), col = new THREE.Color();
    roots.forEach(([s, t], i) => {
      const k = s[3] * t.rad, a = rr() * 6.28;
      rim.setMatrixAt(i, m4.compose(new THREE.Vector3(s[1] + t.cx * s[3], heightAt(s[1], s[2]) - 0.06, s[2] + t.cz * s[3]), q.setFromAxisAngle(up, a), new THREE.Vector3(k, k, k)));
      rim.setColorAt(i, col.set(TONE(s[0])));
    });
    rim.receiveShadow = true; rim.name = 'roots'; group.add(rim);
  });
}

// ---------- Модели Meshy (17.11.2026) ----------
// Image to 3D по картинкам GPT (gpt/env/*.png), исходники в ref/meshy/env, ужаты tools/env-pack.sh (README).
// У моделей Meshy центр в середине коробки и размер около 2 условных единиц: ставим низом на землю и масштабируем
// по высоте в метрах. Лицо модели смотрит в +z, поворот −π/2 разворачивает его к корту (−x).
// Тень отбрасывают только крупные: зонты, скамейки, бар. Мелочь без теней — лишний проход по сетке не нужен.
// Шале из Meshy (один ком на 3 млн треугольников, после упрощения текстура разъезжалась осколками) 18.11 заменил дом
// кодом (env-house.js).
const DECK = 0.15; // настил террасы перед шале
// Скамейки: две у сетки внутри корта (игроков), две у дорожки за калиткой и одна за спиной Лёвы за забором (зрителей).
// Все лицом к корту. Модель смотрит в +z, поворот −π/2 — лицом к −x, π — к −z.
const BENCHES = [[7.75, -1.6, -Math.PI / 2], [7.75, 1.6, -Math.PI / 2], [12.3, -6.5, -Math.PI / 2], [12.3, 9, -Math.PI / 2], [-4.5, 21.7, Math.PI]];
const SEAT_H = 0.44; // высота сиденья скамейки над землёй (замер лучом по модели)
// Куда садиться: pos — середина места на сиденье [x, y, z] в метрах, yaw — поворот тела вокруг y, лицом в
// (sin yaw, 0, cos yaw), как у игроков (netYaw: Лёва π). На скамейке два места, по 40 см от середины, на 10 см ближе
// к переднему краю: середина сиденья, спинка сзади.
export const SEATS = BENCHES.flatMap(([x, z, rot]) => [-0.4, 0.4].map((s) => ({
  pos: [x + Math.cos(rot) * s + Math.sin(rot) * 0.1, SEAT_H, z - Math.sin(rot) * s + Math.cos(rot) * 0.1], yaw: rot,
})));
const PLACES = { // имя: [высота, м; тень; [[x, z, поворот, y], …]]
  bar: [1.25, true, [[13.6, -21.8, -Math.PI / 2, DECK]]],
  umbrella: [2.6, true, [[11.7, -26.2, 0.3, DECK], [11.7, -31.4, 1.1, DECK]]],
  table: [0.92, false, [[11.7, -26.2, -1.2, DECK], [11.7, -31.4, -2.1, DECK]]],
  // У калитки по кадке с двух сторон, на террасе по углам; две за спиной Лёвы — их видно в меню.
  planter: [0.8, false, [[14.1, -19.6, 0.4, DECK], [10.6, -34.4, 2, DECK], [9.95, 2.5, 1], [9.95, 5.5, 2.5], [-6.5, 20.7, 0.5], [6.5, 20.7, 2]]],
  bench: [0.85, true, BENCHES],
  balls: [0.95, false, [[8.3, -18.2, 0.6]]],
  bike: [1.05, false, [[9.75, -10.5, Math.PI / 2]]],
  // 18.11: деревянный фонтан-колода у дорожки к террасе, каток для грунта в дальнем левом углу корта.
  fountain: [1.5, true, [[13.7, -12.2, -Math.PI / 2]]],
  roller: [1.15, true, [[-8.1, -18.7, 0.7]]],
};

function models(g) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  for (const [name, [h, shadow, spots]] of Object.entries(PLACES)) {
    loader.load(`/models/env/${name}.glb`, ({ scene: m }) => {
      const box = new THREE.Box3().setFromObject(m), k = h / (box.max.y - box.min.y), c = box.getCenter(new THREE.Vector3());
      m.scale.setScalar(k); m.position.set(-c.x * k, -box.min.y * k, -c.z * k);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = shadow; o.receiveShadow = true; } });
      for (const [x, z, rot, y = 0] of spots) {
        const holder = new THREE.Group(); holder.name = name;
        holder.position.set(x, y, z); holder.rotation.y = rot; holder.add(m.clone()); g.add(holder);
      }
    });
  }
  // Настил террасы между кортом и шале: на нём бар, зонты и столики. Доски лиственницы по 14 см вдоль террасы,
  // каждая своего тона, стыки вразбежку, между досками тёмная щель.
  const planks = document.createElement('canvas'); planks.width = 256; planks.height = 512;
  const pg = planks.getContext('2d'), pr = rng(41);
  for (let i = 0; i < 10; i++) for (let y = -pr() * 512; y < 512; y += 180 + pr() * 300) {
    const v = 0.8 + pr() * 0.35; pg.fillStyle = `rgb(${138 * v | 0},${100 * v | 0},${70 * v | 0})`; pg.fillRect(i * 25.6, y, 25.6, 512);
    for (let k = 0; k < 14; k++) { pg.fillStyle = `rgba(60,40,25,${0.08 + pr() * 0.12})`; pg.fillRect(i * 25.6 + pr() * 24, y + pr() * 400, 1, 20 + pr() * 120); } // волокна
    pg.fillStyle = 'rgba(30,20,12,0.8)'; pg.fillRect(i * 25.6, y, 25.6, 2);
  }
  pg.fillStyle = 'rgba(25,16,10,0.9)'; for (let i = 0; i <= 10; i++) pg.fillRect(i * 25.6 - 1, 0, 2.5, 512);
  const pt = new THREE.CanvasTexture(planks); pt.colorSpace = THREE.SRGBColorSpace; pt.wrapS = pt.wrapT = THREE.RepeatWrapping; pt.repeat.set(4.4 / 1.4, 16 / 2.8); pt.anisotropy = 8;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, DECK, 16), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.85 }));
  deck.position.set(12.4, DECK / 2, -27); deck.receiveShadow = true; g.add(deck);
}

// ---------- У корта ----------
// Вышка судьи слева, коробка с полотенцами между скамейками, волокуша на заборе. Скамейки и корзина мячей — модели Meshy.
// Ограждение по бокам на x = ±9.15, стойки сетки на ±6.4: всё стоит между ними.
function props() {
  const g = new THREE.Group(); g.name = 'props';
  const metal = new THREE.MeshStandardMaterial({ color: '#25332c', roughness: 0.45, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: '#a47c58', roughness: 0.75 });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  // Коробка с полотенцами между скамейками и бутылки воды на ней.
  add(new THREE.BoxGeometry(0.5, 0.42, 0.5), new THREE.MeshStandardMaterial({ color: '#2d4a3c', roughness: 0.6 }), 7.8, 0.21, 0);
  const towel = new THREE.MeshStandardMaterial({ color: '#f6f4ee', roughness: 1 });
  add(new THREE.BoxGeometry(0.42, 0.08, 0.3), towel, 7.8, 0.46, 0.05).rotation.y = 0.2;
  const bottle = new THREE.MeshStandardMaterial({ color: '#cfe3ea', roughness: 0.15, transparent: true, opacity: 0.75 });
  for (const dz of [-0.12, 0.14]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 10), bottle, 7.68, 0.62, dz);
  // Вышка судьи: четыре стойки, площадка, сиденье на 1.9 м, лестница со стороны забора.
  const ch = new THREE.Group(); ch.position.set(-7.55, 0, 0.6); g.add(ch);
  for (const [sx, sz] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) add(new THREE.BoxGeometry(0.05, 1.75, 0.05), metal, sx, 0.875, sz, ch);
  add(new THREE.BoxGeometry(0.78, 0.05, 0.78), metal, 0, 1.15, 0, ch);
  add(new THREE.BoxGeometry(0.6, 0.06, 0.55), wood, 0, 1.78, 0, ch);
  add(new THREE.BoxGeometry(0.06, 0.6, 0.55), wood, -0.3, 2.1, 0, ch);
  for (const sz of [-0.27, 0.27]) add(new THREE.BoxGeometry(0.45, 0.04, 0.04), metal, 0.05, 2.02, sz, ch);
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.04, 0.035, 0.5), metal, -0.55 + i * 0.05, 0.25 + i * 0.3, 0, ch);
  for (const sz of [-0.25, 0.25]) add(new THREE.BoxGeometry(0.04, 1.65, 0.04), metal, -0.45, 0.8, sz, ch).rotation.z = -0.18;
  // Волокуша — сетка 2 м на раме, висит на левом заборе у дальнего угла: ею затирают корт после игры.
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.1, 16, 9), new THREE.MeshStandardMaterial({ color: '#3a3330', roughness: 0.8, wireframe: true }));
  mat.position.set(-9.05, 1.0, -15.5); mat.rotation.set(0, Math.PI / 2, 0.04); g.add(mat);
  add(new THREE.BoxGeometry(0.03, 0.03, 2.05), metal, -9.04, 1.55, -15.5);
  return g;
}

export function buildEnv() {
  const g = new THREE.Group(), spots = treeSpots(), club = buildClub(spots), mountains = buildMountains(club.uniforms);
  g.add(buildSky(), mountains, club.group, buildValley(spots), props(), buildHouse());
  models(g);
  trees(g, spots, (atlas) => mountains.userData.addForest(atlas)); // лес на склонах ждёт атлас из той же модели
  return g;
}
