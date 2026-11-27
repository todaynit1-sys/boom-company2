// 회사 뿌개기 — renderer, lighting presets, post (bloom + outline on desktop), adaptive quality, highlight fallback.
// 화질: 6단계(LEVELS) + 모드 '자동'(기기 짐작으로 시작 → 실제 프레임 간격으로 오르내림) · '빠르게' · '예쁘게'.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// time-of-day presets. sunDir points FROM the scene TOWARD the sun.
export const PRESETS = {
  day: { sun: '#fff0da', sunI: 2.4, sunDir: [-0.35, 0.72, -0.6], hemiSky: '#f4f1ea', hemiGround: '#7a6a58', hemiI: 0.95, top: '#fff6e8', topI: 0.55, amb: 0.14, exposure: 0.95, fog: '#dfe5ec', fogNear: 26, fogFar: 70, env: 0.38, sky: 'day' },
  noon: { sun: '#fff4e2', sunI: 2.7, sunDir: [0.25, 0.9, -0.45], hemiSky: '#f6f3ec', hemiGround: '#8a7a64', hemiI: 1.0, top: '#fff6e8', topI: 0.55, amb: 0.15, exposure: 0.97, fog: '#e6ebf0', fogNear: 28, fogFar: 80, env: 0.4, sky: 'day' },
  sunset: { sun: '#ff9548', sunI: 4.2, sunDir: [-0.42, 0.2, -1.0], hemiSky: '#ffc49a', hemiGround: '#4c3e5c', hemiI: 0.72, top: '#ffd6b0', topI: 0.32, amb: 0.12, exposure: 0.98, fog: '#d99a86', fogNear: 24, fogFar: 64, env: 0.28, sky: 'sunset' },
  lobby: { sun: '#fff4e2', sunI: 2.3, sunDir: [0.3, 0.85, -0.5], hemiSky: '#f3efe8', hemiGround: '#6e6456', hemiI: 0.62, top: '#fff3e2', topI: 0.3, amb: 0.1, exposure: 0.86, fog: '#e4e7ea', fogNear: 30, fogFar: 85, env: 0.32, sky: 'day' },
  title: { sun: '#fff0da', sunI: 2.4, sunDir: [-0.35, 0.72, -0.6], hemiSky: '#f4f1ea', hemiGround: '#7a6a58', hemiI: 0.95, top: '#fff6e8', topI: 0.55, amb: 0.14, exposure: 0.95, fog: '#dfe5ec', fogNear: 26, fogFar: 70, env: 0.38, sky: 'day' },
  // underground: no sky. A soft top-down "sun" only to keep contact shadows; cool fill, readable (not a cave)
  garage: { sun: '#e6eeff', sunI: 1.15, sunDir: [0.18, 1.0, 0.32], hemiSky: '#d5deec', hemiGround: '#5d6470', hemiI: 1.25, top: '#eef3ff', topI: 0.62, amb: 0.2, exposure: 1.06, fog: '#2a313b', fogNear: 17, fogFar: 46, env: 0.42, sky: 'none' },
  // windowless interiors (hall, pub) — warm
  indoor: { sun: '#fff1de', sunI: 1.2, sunDir: [0.2, 1.0, 0.25], hemiSky: '#f6efe4', hemiGround: '#6e5e50', hemiI: 1.1, top: '#fff3e2', topI: 0.55, amb: 0.16, exposure: 1.0, fog: '#3a3340', fogNear: 20, fogFar: 55, env: 0.38, sky: 'none' },
};

// ---- 이 기기가 약한지 짐작 (첫 화면부터 버벅이지 않게 낮은 단계로 시작 → 빠르면 올라간다)
//   soft: 소프트웨어 렌더러 (SwiftShader · llvmpipe · Microsoft Basic Render) — 거의 확실히 느림
//   igpu: 내장 그래픽 (Intel UHD / HD / Iris, AMD Radeon(TM) Graphics · Vega 내장)
//   weak: 코어 4개 이하 또는 메모리 4GB 이하
export function probeDevice() {
  const out = { gpu: '', soft: false, igpu: false, weak: false };
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      out.gpu = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    }
  } catch (e) { /* 모르면 보통 기기로 */ }
  const g = out.gpu.toLowerCase();
  out.soft = /swiftshader|llvmpipe|softpipe|software|basic render/.test(g);
  out.igpu = !out.soft && (/intel|uhd|iris|hd graphics/.test(g) || /radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|radeon\(tm\) vega/.test(g));
  const cores = navigator.hardwareConcurrency || 8, mem = navigator.deviceMemory || 8;
  out.weak = cores <= 4 || mem <= 4;
  return out;
}

// ---- 화질 단계 (0 = 가장 예쁨). 단계마다 눈에 띄게 가벼워진다 (devicePixelRatio 1 에서도):
//   0 후처리(블룸 · 윤곽선) + 2048 그림자   1 후처리 끔   2 반사 환경광 끔 · 그림자 갱신 절반
//   3 그림자 끔   4 해상도 0.7 · HUD 흐림 끔   5 해상도 0.6 (= '빠르게')
export const LOWEST = 5;
const AUTO_KEY = 'ppg.gfxAuto';

export function createGfx(canvas, { touch = false, debug = false, mode = 'auto', fixed = false } = {}) {
  const dev = probeDevice();
  let saved = null;
  try { const v = JSON.parse(localStorage.getItem(AUTO_KEY) || 'null'); if (v && v.gpu === dev.gpu && v.level >= 0 && v.level <= LOWEST) saved = v.level | 0; } catch (e) { /* 무시 */ }
  const topLv = touch ? 1 : 0; // 자동이 올라갈 수 있는 가장 예쁜 단계 (휴대폰은 후처리 없이)
  // 자동의 첫 단계: 지난번에 자리 잡은 단계, 없으면 기기 짐작
  let guess = topLv;
  if (dev.soft) guess = LOWEST;
  else if (dev.igpu && dev.weak) guess = 3;
  else if (dev.igpu || dev.weak) guess = 2;
  guess = Math.max(topLv, guess);
  const startLevel = mode === 'fast' ? LOWEST : mode === 'pretty' || fixed ? topLv : saved != null ? Math.max(topLv, saved) : guess;
  // 계단 현상 줄이기(MSAA)는 컨텍스트를 만들 때만 정할 수 있다: 가장 낮은 단계로 시작할 때만 끈다 (다음 실행부터 반영)
  const antialias = startLevel < 4;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: debug });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  renderer.shadowMap.autoUpdate = false;
  let shadowN = 0, lastW = 0, lastH = 0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfd8e2');
  scene.fog = new THREE.Fog('#dfe5ec', 26, 70);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.08, 160);

  // environment for metals / glass
  // (조각마다 큐브맵을 여러 번 읽는 비싼 부분: 낮은 단계에서는 끄고 주변광으로 밝기를 메운다)
  let envTex = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch (e) { /* no env on very old GPUs */ }
  scene.environment = envTex;
  scene.environmentIntensity = 0.38;

  const hemi = new THREE.HemisphereLight('#eef3ff', '#8a7a66', 1.2); scene.add(hemi);
  const amb = new THREE.AmbientLight('#ffffff', 0.18); scene.add(amb);
  const top = new THREE.DirectionalLight('#fff8ee', 0.7); top.position.set(0.3, 10, 0.6); scene.add(top); scene.add(top.target);
  const sun = new THREE.DirectionalLight('#fff1de', 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);

  // ---- post
  let composer = null, outline = null, bloom = null;
  function makeComposer() {
    if (composer) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    outline = new OutlinePass(new THREE.Vector2(size.x, size.y), scene, camera);
    outline.edgeStrength = 5; outline.edgeGlow = 0.35; outline.edgeThickness = 1.6; outline.pulsePeriod = 0;
    outline.visibleEdgeColor.set('#ffd23f'); outline.hiddenEdgeColor.set('#000000'); // additive overlay: black = no outline through the player / walls
    outline.downSampleRatio = 2;
    composer.addPass(outline);
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.5, 1.35);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ---- quality
  const dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2);
  // shEvery: 그림자 지도 갱신 간격 배수 · env: 반사 환경광 · lowUI: HUD 의 배경 흐림(backdrop-filter) 끔
  const LEVELS = [
    { pr: dpr, shadow: 2048, post: !touch, shadows: true, shEvery: 1, env: true },
    { pr: Math.min(dpr, 1.5), shadow: 1024, post: false, shadows: true, shEvery: 1, env: true },
    { pr: Math.min(dpr, 1.0), shadow: 1024, post: false, shadows: true, shEvery: 2, env: false },
    { pr: Math.min(dpr, 0.85), shadow: 1024, post: false, shadows: false, shEvery: 1, env: false },
    { pr: Math.min(dpr, 0.7), shadow: 1024, post: false, shadows: false, shEvery: 1, env: false, lowUI: true },
    { pr: Math.min(dpr, 0.6), shadow: 1024, post: false, shadows: false, shEvery: 1, env: false, lowUI: true },
  ];
  const G = {
    renderer, scene, camera, sun, hemi, amb, top, level: startLevel, preset: 'day', bounds: null,
    dev, mode, antialias, levels: LEVELS.length,
    get composer() { return composer; },
    get usingPost() { return !!(composer && LEVELS[G.level].post); },
    setQuality(level) {
      level = Math.max(0, Math.min(LEVELS.length - 1, level | 0));
      G.level = level;
      const L = LEVELS[level];
      renderer.setPixelRatio(L.pr);
      if (sun.shadow.mapSize.x !== L.shadow) {
        sun.shadow.mapSize.set(L.shadow, L.shadow);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      sun.castShadow = L.shadows;
      if (!L.shadows) renderer.shadowMap.needsUpdate = false;
      applyEnv();
      if (L.post) makeComposer();
      document.documentElement.classList.toggle('lowgfx', !!L.lowUI);
      A.grace = 1.5; A.win.length = 0; A.winT = 0;
      G.resize();
    },
    // 화질 고르기: 'auto' (기기 짐작 + 실제 속도로 오르내림) · 'fast' (가장 낮은 단계) · 'pretty' (가장 예쁜 단계)
    setMode(m) {
      m = m === 'fast' || m === 'pretty' ? m : 'auto';
      G.mode = m;
      A.failed.clear(); A.good = 0; A.probe = 0; A.bottom = LEVELS.length - 1; A.downFrom = -1; A.noGain = 0;
      if (m === 'fast') G.setQuality(LOWEST);
      else if (m === 'pretty') G.setQuality(topLv);
      else G.setQuality(saved != null ? Math.max(topLv, saved) : guess);
      return G.level;
    },
    // 매 프레임 (main): dt = 실제 프레임 간격(초), live = 재도 되는 때 (탭이 보이고 · 멈춤 아님)
    adapt(dt, live) { adaptStep(dt, live); },
    adaptReset(grace = 1.5) { A.grace = Math.max(A.grace, grace); A.win.length = 0; A.winT = 0; },
    get adaptOn() { return G.mode === 'auto' && !fixed; },
    adaptState() { return { level: G.level, mode: G.mode, failed: [...A.failed], bottom: A.bottom, good: A.good, probe: A.probe, lastMed: +(A.lastMed * 1000).toFixed(1), guess, saved, dev, antialias }; },
    resize() {
      const w = innerWidth, h = innerHeight;
      lastW = w; lastH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(w, h);
      }
    },
    // fit the shadow camera of the sun to the room bounds
    fit(bounds, ceilY = 3) {
      G.bounds = bounds;
      const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
      const P = G.cur || PRESETS[G.preset] || PRESETS.day;
      const d = new THREE.Vector3(...P.sunDir).normalize();
      sun.target.position.set(cx, 0, cz);
      sun.position.set(cx + d.x * 40, d.y * 40, cz + d.z * 40);
      const half = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 1.5;
      const c = sun.shadow.camera;
      c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 5; c.far = 90;
      c.updateProjectionMatrix();
      top.target.position.set(cx, 0, cz);
      top.position.set(cx + 0.3, 10, cz + 0.6);
    },
    // name: a PRESETS key, or an object { preset?: key, ...overrides } (floor modules' custom light)
    applyPreset(name) {
      let P;
      if (name && typeof name === 'object') { P = Object.assign({}, PRESETS[name.preset] || PRESETS.day, name); name = name.preset || 'custom'; }
      else P = PRESETS[name] || PRESETS.day;
      G.preset = name; G.cur = P;
      sun.color.set(P.sun); sun.intensity = P.sunI;
      hemi.color.set(P.hemiSky); hemi.groundColor.set(P.hemiGround); hemi.intensity = P.hemiI;
      top.color.set(P.top); top.intensity = P.topI;
      amb.intensity = P.amb;
      renderer.toneMappingExposure = P.exposure;
      scene.fog.color.set(P.fog); scene.fog.near = P.fogNear; scene.fog.far = P.fogFar;
      scene.background.set(P.fog);
      applyEnv();
      if (bloom) { bloom.strength = name === 'sunset' ? 0.38 : 0.3; bloom.threshold = name === 'sunset' ? 1.2 : 1.35; }
      if (G.bounds) G.fit(G.bounds);
      return P;
    },
    render(shadowEvery = 1) {
      // some browsers (iOS rotation, emulators) report the new size after the resize event, or skip it
      if (innerWidth !== lastW || innerHeight !== lastH) G.resize();
      renderer.info.reset();
      if (sun.castShadow && ++shadowN >= shadowEvery * LEVELS[G.level].shEvery) { shadowN = 0; renderer.shadowMap.needsUpdate = true; }
      if (G.usingPost) composer.render();
      else renderer.render(scene, camera);
    },
    // highlight: OutlinePass when post is on, otherwise an emissive pulse on cloned materials
    highlight(obj, t = 0) {
      if (obj && obj.userData.unbatch) obj.userData.unbatch();
      if (G.usingPost) {
        hl.clear();
        outline.selectedObjects = obj ? [obj] : [];
        return;
      }
      if (outline) outline.selectedObjects = [];
      hl.set(obj, t);
    },
  };

  // ---- emissive highlight fallback
  const hlCache = new Map();
  const hl = {
    obj: null, swapped: [],
    clear() {
      for (const [m, orig] of hl.swapped) m.material = orig;
      hl.swapped.length = 0; hl.obj = null;
    },
    set(obj, t) {
      if (obj !== hl.obj) {
        hl.clear();
        hl.obj = obj;
        if (obj) obj.traverse((m) => {
          if (!m.isMesh || !m.material || Array.isArray(m.material)) return;
          let c = hlCache.get(m.material);
          if (!c) {
            c = m.material.clone();
            if (m.material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) { c.onBeforeCompile = m.material.onBeforeCompile; c.customProgramCacheKey = () => m.material.customProgramCacheKey() + ':hl'; }
            if (c.emissive) { c.emissive = new THREE.Color('#ffc21a'); c.emissiveMap = null; }
            hlCache.set(m.material, c);
          }
          hl.swapped.push([m, m.material]); m.material = c;
        });
      }
      if (obj) {
        const k = 0.28 + Math.sin(t * 7) * 0.14;
        for (const [m] of hl.swapped) if (m.material.emissive) m.material.emissiveIntensity = k;
      }
    },
  };
  G.clearHighlight = () => { hl.clear(); if (outline) outline.selectedObjects = []; };

  // ---- 반사 환경광 켜고 끄기 (끌 때는 그만큼 주변광 · 하늘빛을 올려 밝기를 맞춘다)
  // (사무실 · 로비 화면 평균 밝기를 켰을 때와 맞춘 값: tools/sc-prof 와 같은 방식으로 readPixels 평균 비교)
  const ENV_AMB = 2.8, ENV_HEMI = 1.4;
  function applyEnv() {
    const P = G.cur || PRESETS.day, on = !!(envTex && LEVELS[G.level].env);
    scene.environment = on ? envTex : null;
    scene.environmentIntensity = P.env;
    amb.intensity = P.amb + (on ? 0 : P.env * ENV_AMB);
    hemi.intensity = P.hemiI + (on ? 0 : P.env * ENV_HEMI);
  }

  // ---- 자동 화질: 1초 남짓 창마다 프레임 간격 중앙값을 보고 오르내린다. 흔들리지 않게:
  //   · 느려서 내려온 단계(failed)로는 다시 안 올라간다 (이번 실행 동안)
  //   · 올라가기는 6창(≈6초+) 연속 넉넉할 때 한 단계씩만
  //   · 내렸는데 하나도 안 빨라지면 (절전 모드 30fps 고정 같은 경우) 되돌리고 더 안 내린다 (bottom)
  //   · 단계를 바꾼 직후 · 층을 새로 지은 직후 1.5초는 안 잰다 (셰이더 컴파일 끊김)
  const A = { win: [], winT: 0, grace: 2, good: 0, failed: new Set(), bottom: LEVELS.length - 1, probe: 0, lastMed: 0, downFrom: -1, downMed: 0, noGain: 0, capFrom: 0 };
  const SLOW = 0.0205, VERY_SLOW = 0.045, FINE = 0.0175;
  function adaptStep(dt, live) {
    if (!G.adaptOn || !live || !(dt > 0)) return;
    if (A.grace > 0) { A.grace -= dt; return; }
    A.win.push(Math.min(dt, 0.5)); A.winT += dt;
    if (A.winT < 1.0 || A.win.length < 6) return;
    const s = A.win.sort((a, b) => a - b), med = s[s.length >> 1];
    let mean = 0; for (const v of s) mean += v; mean /= s.length;
    A.win.length = 0; A.winT = 0; A.lastMed = med;
    const slow = med > SLOW || mean > SLOW * 1.25;
    // 두 번 내려도 하나도 안 빨라지면: 화면이 아니라 다른 데(절전 모드 30fps · 탭 제한)가 묶고 있다
    // → 처음 내리기 전 단계로 되돌리고 그 아래로는 안 내린다
    if (A.downFrom >= 0) {
      const from = A.downFrom; A.downFrom = -1;
      if (slow && med > A.downMed * 0.92 && A.downMed < VERY_SLOW) {
        if (++A.noGain === 1) A.capFrom = from;
        else { const c = A.capFrom; A.noGain = 0; A.failed.delete(c); A.bottom = c; setAuto(c); return; }
      } else A.noGain = 0;
    }
    if (slow) {
      A.good = 0;
      if (A.probe) { A.probe = 0; } // 올라가 본 단계가 버거웠다
      if (G.level >= A.bottom) return;
      const to = Math.min(A.bottom, G.level + (med > VERY_SLOW ? 2 : 1));
      A.failed.add(G.level); A.downFrom = G.level; A.downMed = med;
      setAuto(to);
      return;
    }
    A.probe = 0;
    if (med <= FINE && mean <= FINE * 1.15) {
      if (++A.good >= 6 && G.level > topLv && !A.failed.has(G.level - 1)) { A.good = 0; A.probe = 1; setAuto(G.level - 1); }
    } else A.good = 0;
  }
  function setAuto(l) {
    G.setQuality(l);
    saved = G.level;
    try { localStorage.setItem(AUTO_KEY, JSON.stringify({ level: G.level, gpu: dev.gpu })); } catch (e) { /* 무시 */ }
  }

  G.setQuality(G.level);
  G.applyPreset('day');
  addEventListener('resize', () => G.resize());
  return G;
}
