// Солнце, воздух и небо. Солнце после обеда слева-сзади от игровой камеры: горы впереди освещены сбоку, у каждого
// гребня светлая и теневая сторона (при солнце в спину склоны выходили плоской стеной).
import * as THREE from 'three';

export const SUN = new THREE.Vector3(-14, 11.5, 7).normalize();
export const HAZE = new THREE.Color(0.5, 0.61, 0.78); // дымка у дна долины, линейный цвет
export const ZENITH = new THREE.Color(0.11, 0.26, 0.62);
export const AIR_DENSITY = 1 / 20000; // у дна долины: за 3 км гора отдаёт дымке седьмую часть цвета, за 10 км — треть

const v3 = (v) => `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;
// Воздушная перспектива: дымка гуще у дна долины и реже к вершинам (плотность падает в e раз на 1400 м), в сторону
// солнца теплее и светлее. Пропускание — интеграл плотности вдоль луча от камеры, как в «Восхождении» (glsl.js).
export const AIR = /* glsl */ `
const vec3 SUN_DIR = ${v3(SUN)};
vec3 airColor(vec3 rd, vec3 haze){
  float s = max(dot(rd, SUN_DIR), 0.);
  return haze * (1. + .35 * pow(s, 5.)) + vec3(.35, .22, .05) * pow(s, 24.);
}
float airT(vec3 p, float den){
  vec3 v = p - cameraPosition; float d = length(v);
  float e0 = exp(-cameraPosition.y / 1400.), e1 = exp(-p.y / 1400.);
  float k = abs(v.y) > 1. ? (e0 - e1) * 1400. / v.y : e0;
  return exp(-d * den * k);
}
vec3 airApply(vec3 c, vec3 p, vec3 haze, float den){ return mix(airColor(normalize(p - cameraPosition), haze), c, airT(p, den)); }
`;

// Туман three заменяем этим воздухом во всех материалах. Подмешиваем до тонмаппинга: на компьютере кадр идёт через
// проходы и тонмаппинг в конце, на телефоне сразу в экран, а туман three смешивался уже после перевода в sRGB —
// дымка выходила разной. Нужен scene.fog = FogExp2(HAZE, AIR_DENSITY): его цвет и плотность идут в формулу.
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying vec3 vFogW;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogW = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);\n#endif';
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor; uniform float fogDensity; varying vec3 vFogW;
${AIR}
#endif`;
THREE.ShaderChunk.fog_fragment = '';
if (!THREE.ShaderChunk.tonemapping_fragment.includes('airApply')) {
  THREE.ShaderChunk.tonemapping_fragment = '#ifdef USE_FOG\n gl_FragColor.rgb = airApply(gl_FragColor.rgb, vFogW, fogColor, fogDensity);\n#endif\n' + THREE.ShaderChunk.tonemapping_fragment;
}

const NOISE = /* glsl */ `
float h12(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f); return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= .5; } return s; }
`;

// Небо: от дымки у горизонта к синему зениту, свечение вокруг солнца, кучевые облака на плоскости ~3 км.
// Облако светлее со стороны солнца и темнее в толще; к горизонту тонет в дымке; медленно плывёт.
export function buildSky() {
  const time = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { zen: { value: ZENITH }, haze: { value: HAZE }, time },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }',
    fragmentShader: `uniform vec3 zen, haze; uniform float time; varying vec3 vDir;
      ${NOISE}
      ${AIR}
      float cloud(vec2 cp){ vec2 w = vec2(fbm(cp * .7 + 3.), fbm(cp * .7 + 11.)); return fbm(cp + (w - .5) * 1.2) * .62 + fbm(cp * 2.7 + w) * .38; }
      void main(){
        vec3 rd = normalize(vDir);
        float up = max(rd.y, 0.), s = max(dot(rd, SUN_DIR), 0.);
        vec3 col = mix(airColor(rd, haze), zen, pow(smoothstep(0., 1., up), .45));
        col += vec3(1., .82, .55) * (.25 * pow(s, 8.) + .5 * pow(s, 90.)) + vec3(40.) * pow(s, 4000.);
        if (rd.y > .004) {
          vec2 cp = rd.xz / (rd.y + .05) * .55 + vec2(time * .0015, time * .0004);
          float cov = .53 + .06 * rd.z; // над дальним концом долины (−z) облаков больше
          float n = cloud(cp), n2 = cloud(cp + normalize(SUN_DIR.xz) * .12);
          float cl = smoothstep(cov, cov + .16, n) * smoothstep(.0, .08, rd.y), thick = smoothstep(cov + .04, cov + .3, n);
          float lit = clamp(.6 + (n - n2) * 6., 0., 1.); // со стороны солнца плотность ниже — край светится
          vec3 cc = mix(vec3(.55, .6, .7), vec3(1.25, 1.18, 1.08), lit * (1. - .45 * thick)) * 1.5 + vec3(.6, .45, .3) * pow(s, 6.) * (1. - thick);
          cc = mix(cc, airColor(rd, haze) * 1.15, smoothstep(.22, .0, rd.y));
          col = mix(col, cc, cl * .95);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // Радиус 20 км, а не единичный шар: проход затенения рисует сцену своим материалом, и шар в 1 м вставал серым
  // кругом посреди корта.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), mat);
  sky.frustumCulled = false; sky.renderOrder = -10; sky.name = 'sky';
  sky.onBeforeRender = () => { time.value = performance.now() / 1000; };
  return sky;
}

// Окружение для рассеянного света и отражений: небо сверху, горы и лес по горизонту, газон снизу.
export function outdoorEnv() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { zen: { value: ZENITH }, hor: { value: HAZE }, green: { value: new THREE.Color(0.1, 0.16, 0.06) }, ground: { value: new THREE.Color(0.2, 0.17, 0.1) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 zen, hor, green, ground; varying vec3 vDir;
      const vec3 SUN_DIR = ${v3(SUN)};
      void main(){ vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y > 0. ? mix(green, mix(hor, zen, smoothstep(.2, .9, y)), smoothstep(.04, .2, y)) : ground * (.7 + .3 * smoothstep(-.3, 0., y));
        c += vec3(1., .85, .6) * pow(max(dot(d, SUN_DIR), 0.), 16.) * 2.;
        gl_FragColor = vec4(c * 1.4, 1.); }`,
  })));
  return s;
}
