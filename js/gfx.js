// 회사 뿌개기 — renderer, lighting presets, post (bloom + outline on desktop), adaptive quality, highlight fallback.
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
};

export function createGfx(canvas, { touch = false, debug = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: debug });
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
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch (e) { /* no env on very old GPUs */ }
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
  const LEVELS = [
    { pr: dpr, shadow: 2048, post: !touch, shadows: true },
    { pr: Math.min(dpr, 1.5), shadow: 1024, post: false, shadows: true },
    { pr: Math.min(dpr, 1.0), shadow: 1024, post: false, shadows: true },
    { pr: Math.min(dpr, 0.8), shadow: 512, post: false, shadows: false },
  ];
  const G = {
    renderer, scene, camera, sun, hemi, amb, top, level: touch ? 1 : 0, preset: 'day', bounds: null,
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
      if (L.post) makeComposer();
      G.resize();
    },
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
      const P = PRESETS[G.preset] || PRESETS.day;
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
    applyPreset(name) {
      const P = PRESETS[name] || PRESETS.day;
      G.preset = name;
      sun.color.set(P.sun); sun.intensity = P.sunI;
      hemi.color.set(P.hemiSky); hemi.groundColor.set(P.hemiGround); hemi.intensity = P.hemiI;
      top.color.set(P.top); top.intensity = P.topI;
      amb.intensity = P.amb;
      renderer.toneMappingExposure = P.exposure;
      scene.fog.color.set(P.fog); scene.fog.near = P.fogNear; scene.fog.far = P.fogFar;
      scene.background.set(P.fog);
      scene.environmentIntensity = P.env;
      if (bloom) { bloom.strength = name === 'sunset' ? 0.38 : 0.3; bloom.threshold = name === 'sunset' ? 1.2 : 1.35; }
      if (G.bounds) G.fit(G.bounds);
      return P;
    },
    render(shadowEvery = 1) {
      // some browsers (iOS rotation, emulators) report the new size after the resize event, or skip it
      if (innerWidth !== lastW || innerHeight !== lastH) G.resize();
      renderer.info.reset();
      if (++shadowN >= shadowEvery) { shadowN = 0; renderer.shadowMap.needsUpdate = true; }
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

  G.setQuality(G.level);
  G.applyPreset('day');
  addEventListener('resize', () => G.resize());
  return G;
}
