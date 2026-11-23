// 회사 뿌개기 — procedural chibi characters (jointed groups, canvas faces, procedural anims).
// 1 unit = 1 m. Origin = feet centre on the floor, facing +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- caches
const MATS = new Map();
function mat(color, rough = 0.72, metal = 0, extra = null) {
  const key = color + '|' + rough + '|' + metal + (extra ? JSON.stringify(extra) : '');
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra || {}));
    MATS.set(key, m);
  }
  return m;
}
const GEOS = new Map();
function geo(key, make) {
  let g = GEOS.get(key);
  if (!g) { g = make(); GEOS.set(key, g); }
  return g;
}
const sph = (w = 12, h = 8) => geo('s' + w + 'x' + h, () => new THREE.SphereGeometry(1, w, h));
const caps = (r, len, cs = 2, rs = 7) => geo('c' + r + ',' + len + ',' + cs + ',' + rs, () => new THREE.CapsuleGeometry(r, len, cs, rs));
const cyl = (rt, rb, h, s = 10, open = false) => geo('y' + rt + ',' + rb + ',' + h + ',' + s + open, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open));
const rbox = (w, h, d, r = 0.01, s = 0) => geo('b' + w + ',' + h + ',' + d + ',' + r + ',' + s, () => (s ? new RoundedBoxGeometry(w, h, d, s, r) : new THREE.BoxGeometry(w, h, d)));

function mesh(g, m, parent, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true; o.receiveShadow = true;
  if (parent) parent.add(o);
  return o;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return '#' + c.getHexString();
}

// ---------------------------------------------------------------- faces (shared canvas textures)
// Face patch spans phi 2.0 rad × theta 1.25 rad of the skull. Drawing space: x centred (0 = nose line),
// horizontally compressed so circles stay round on the head.
const FACE_W = 256;
const FACE_TEX = new Map();
const EYE_X = 66, EYE_Y = 136;
const INK = '#2a1b14';

function faceCtx() {
  const c = document.createElement('canvas');
  c.width = c.height = FACE_W;
  const x = c.getContext('2d');
  x.translate(128, 0);
  x.scale(1.25 / 2.0, 1);
  x.lineCap = 'round'; x.lineJoin = 'round';
  return [c, x];
}
function eyeOpen(x, ex, ey, rx = 15, ry = 20) {
  x.fillStyle = INK;
  x.beginPath(); x.ellipse(ex, ey, rx, ry, 0, 0, 7); x.fill();
  x.fillStyle = '#5b3a24';
  x.beginPath(); x.ellipse(ex, ey + ry * 0.25, rx * 0.68, ry * 0.6, 0, 0, 7); x.fill();
  x.fillStyle = INK;
  x.beginPath(); x.ellipse(ex, ey + ry * 0.12, rx * 0.4, ry * 0.42, 0, 0, 7); x.fill();
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(ex - rx * 0.35, ey - ry * 0.38, rx * 0.36, 0, 7); x.fill();
  x.beginPath(); x.arc(ex + rx * 0.35, ey + ry * 0.35, rx * 0.16, 0, 7); x.fill();
}
function eyeWhite(x, ex, ey, rx, ry, pr) {
  x.fillStyle = '#fff'; x.strokeStyle = INK; x.lineWidth = 5;
  x.beginPath(); x.ellipse(ex, ey, rx, ry, 0, 0, 7); x.fill(); x.stroke();
  x.fillStyle = INK; x.beginPath(); x.arc(ex, ey + 2, pr, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(ex - pr * 0.35, ey - pr * 0.2, pr * 0.35, 0, 7); x.fill();
}
function eyeClosedLine(x, ex, ey) {
  x.strokeStyle = INK; x.lineWidth = 6;
  x.beginPath(); x.moveTo(ex - 15, ey + 2); x.quadraticCurveTo(ex, ey + 7, ex + 15, ey + 2); x.stroke();
}
function brow(x, ex, yOut, yIn, w = 7, col = INK) {
  // ex sign tells side; inner end towards centre
  const s = Math.sign(ex);
  x.strokeStyle = col; x.lineWidth = w;
  x.beginPath();
  x.moveTo(ex + s * 17, yOut);
  x.quadraticCurveTo(ex, Math.min(yOut, yIn) - 5, ex - s * 15, yIn);
  x.stroke();
}
function blush(x, a = 0.32, col = '255,120,120') {
  x.fillStyle = `rgba(${col},${a})`;
  for (const s of [-1, 1]) { x.beginPath(); x.ellipse(s * 96, 170, 24, 11, 0, 0, 7); x.fill(); }
}
function sweat(x, px, py, s = 1) {
  x.fillStyle = '#8fd0ff'; x.strokeStyle = '#3f8fd0'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(px, py - 16 * s);
  x.quadraticCurveTo(px + 11 * s, py + 2 * s, px, py + 8 * s);
  x.quadraticCurveTo(px - 11 * s, py + 2 * s, px, py - 16 * s); x.fill(); x.stroke();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(px - 3 * s, py, 2.5 * s, 0, 7); x.fill();
}
// cartoon swirl eye (no pupil): dir = turn direction, rMax = outer radius
function spiral(x, ex, ey, dir, rMax = 22, w = 5) {
  x.strokeStyle = INK; x.lineWidth = w;
  x.beginPath();
  for (let a = 0; a <= 4.4 * Math.PI; a += 0.18) {
    const r = 1.5 + (a / (4.4 * Math.PI)) * rMax;
    const px = ex + Math.cos(a * dir) * r, py = ey + Math.sin(a * dir) * r * 1.12;
    if (a === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.stroke();
}
function gloom(x) {
  x.strokeStyle = 'rgba(70,100,200,0.45)'; x.lineWidth = 4;
  for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(i * 22, 30); x.lineTo(i * 22, 62 + (i & 1) * 10); x.stroke(); }
}

function drawFace(name, blink, frame) {
  const [c, x] = faceCtx();
  const L = -EYE_X, R = EYE_X, Y = EYE_Y;
  const eyes = (fn) => { if (blink) { eyeClosedLine(x, L, Y); eyeClosedLine(x, R, Y); } else fn(); };
  switch (name) {
    default:
    case 'normal':
      blush(x, 0.28);
      brow(x, L, 98, 96); brow(x, R, 98, 96);
      eyes(() => { eyeOpen(x, L, Y); eyeOpen(x, R, Y); });
      x.strokeStyle = '#7a3527'; x.lineWidth = 5;
      x.beginPath(); x.arc(0, 192, 14, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke();
      break;
    case 'smile':
      blush(x, 0.42);
      brow(x, L, 94, 92); brow(x, R, 94, 92);
      x.strokeStyle = INK; x.lineWidth = 7;
      for (const e of [L, R]) { x.beginPath(); x.arc(e, Y + 10, 15, 1.12 * Math.PI, 1.88 * Math.PI); x.stroke(); }
      x.fillStyle = '#8a2b2b';
      x.beginPath(); x.moveTo(-26, 188); x.quadraticCurveTo(0, 194, 26, 188); x.quadraticCurveTo(22, 228, 0, 230); x.quadraticCurveTo(-22, 228, -26, 188); x.fill();
      x.fillStyle = '#f27b7b'; x.beginPath(); x.ellipse(0, 220, 12, 7, 0, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.fillRect(-18, 189, 36, 6);
      break;
    case 'endure': {
      blush(x, 0.2);
      const tw = frame ? 1 : 0;
      brow(x, L, 92, 84 - tw * 2); brow(x, R, 92 - tw * 12, 84 + tw * 4);
      if (tw) { x.strokeStyle = INK; x.lineWidth = 3; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(R + 24 + i * 8, 70 - i * 6); x.lineTo(R + 32 + i * 8, 62 - i * 6); x.stroke(); } }
      eyes(() => {
        for (const e of [L, R]) {
          x.fillStyle = INK; x.beginPath(); x.ellipse(e, Y + 4, 15, 15, 0, 0, Math.PI); x.closePath(); x.fill();
          x.strokeStyle = INK; x.lineWidth = 6; x.beginPath(); x.moveTo(e - 17, Y + 3); x.lineTo(e + 17, Y + 3); x.stroke();
          x.fillStyle = '#fff'; x.beginPath(); x.arc(e - 4, Y + 9, 3.5, 0, 7); x.fill();
        }
      });
      // forced grin with teeth
      x.fillStyle = '#fff'; x.strokeStyle = '#7a3527'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(-34, 186); x.quadraticCurveTo(0, 196, 34, 186); x.quadraticCurveTo(28, 214, 0, 214); x.quadraticCurveTo(-28, 214, -34, 186); x.fill(); x.stroke();
      x.lineWidth = 2.5; x.beginPath(); x.moveTo(-30, 199); x.lineTo(30, 199); x.stroke();
      for (const k of [-16, 0, 16]) { x.beginPath(); x.moveTo(k, 192); x.lineTo(k, 210); x.stroke(); }
      sweat(x, 130, 92, 1.1);
      break;
    }
    case 'rage':
      blush(x, 0.45, '255,60,50');
      x.strokeStyle = INK; x.lineWidth = 9;
      for (const e of [L, R]) { const s = Math.sign(e); x.beginPath(); x.moveTo(e + s * 20, 86); x.lineTo(e - s * 16, 112); x.stroke(); }
      eyes(() => {
        for (const e of [L, R]) {
          const s = Math.sign(e);
          x.fillStyle = '#fff'; x.strokeStyle = INK; x.lineWidth = 5;
          x.beginPath(); x.moveTo(e + s * 18, Y - 8); x.lineTo(e - s * 15, Y + 4); x.quadraticCurveTo(e - s * 10, Y + 16, e, Y + 16); x.quadraticCurveTo(e + s * 18, Y + 14, e + s * 18, Y - 8); x.fill(); x.stroke();
          x.fillStyle = INK; x.beginPath(); x.arc(e - s * 2, Y + 7, 6, 0, 7); x.fill();
        }
      });
      x.fillStyle = '#fff'; x.strokeStyle = '#6a1f1f'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(-32, 190); x.lineTo(32, 190); x.lineTo(28, 216); x.lineTo(-28, 216); x.closePath(); x.fill(); x.stroke();
      x.lineWidth = 2.5; x.beginPath(); x.moveTo(-30, 203); x.lineTo(30, 203); x.stroke();
      for (const k of [-18, -6, 6, 18]) { x.beginPath(); x.moveTo(k, 191); x.lineTo(k, 215); x.stroke(); }
      // anger vein
      x.strokeStyle = '#e0302c'; x.lineWidth = 6;
      { const vx = 118, vy = 52; for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { x.beginPath(); x.moveTo(vx + a * 4, vy + b * 16); x.quadraticCurveTo(vx + a * 5, vy + b * 5, vx + a * 16, vy + b * 4); x.stroke(); } }
      break;
    case 'relief':
      blush(x, 0.4);
      brow(x, L, 92, 88); brow(x, R, 92, 88);
      x.strokeStyle = INK; x.lineWidth = 6;
      for (const e of [L, R]) { x.beginPath(); x.arc(e, Y - 4, 15, 0.18 * Math.PI, 0.82 * Math.PI); x.stroke(); }
      x.strokeStyle = '#7a3527'; x.lineWidth = 5;
      x.beginPath(); x.arc(0, 188, 16, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
      break;
    case 'scared':
      blush(x, 0.15);
      gloom(x);
      brow(x, L, 96, 76); brow(x, R, 96, 76);
      eyes(() => { eyeWhite(x, L, Y, 17, 22, 6); eyeWhite(x, R, Y, 17, 22, 6); });
      x.fillStyle = '#5a1d1d';
      x.beginPath(); x.moveTo(-20, 196);
      for (let i = -20; i <= 20; i += 8) x.lineTo(i, 192 + ((i / 8) & 1 ? 4 : -2));
      x.quadraticCurveTo(22, 222, 0, 224); x.quadraticCurveTo(-22, 222, -20, 196); x.fill();
      sweat(x, 128, 96); sweat(x, -132, 110, 0.8);
      break;
    case 'smug':
      blush(x, 0.3);
      brow(x, L, 96, 94); brow(x, R, 84, 90);
      eyes(() => {
        for (const e of [L, R]) {
          x.fillStyle = INK; x.beginPath(); x.ellipse(e, Y + 3, 15, 15, 0, 0, Math.PI); x.closePath(); x.fill();
          x.fillStyle = '#5b3a24'; x.beginPath(); x.ellipse(e, Y + 8, 9, 7, 0, 0, Math.PI); x.fill();
          x.strokeStyle = INK; x.lineWidth = 7; x.beginPath(); x.moveTo(e - 19, Y + 2); x.lineTo(e + 19, Y); x.stroke();
          x.fillStyle = '#fff'; x.beginPath(); x.arc(e - 5, Y + 8, 3.5, 0, 7); x.fill();
        }
      });
      x.strokeStyle = '#7a3527'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(-20, 198); x.quadraticCurveTo(6, 206, 26, 186); x.stroke();
      break;
    case 'sleepy':
      blush(x, 0.25);
      brow(x, L, 102, 100); brow(x, R, 102, 100);
      x.strokeStyle = INK; x.lineWidth = 6;
      for (const e of [L, R]) { x.beginPath(); x.moveTo(e - 15, Y + 4); x.quadraticCurveTo(e, Y + 10, e + 15, Y + 4); x.stroke(); }
      x.fillStyle = '#6a2a22'; x.beginPath(); x.ellipse(0, 202, 7, 9, 0, 0, 7); x.fill();
      break;
    case 'shock':
      gloom(x);
      brow(x, L, 76, 80); brow(x, R, 76, 80);
      eyes(() => { eyeWhite(x, L, Y - 2, 20, 25, 5); eyeWhite(x, R, Y - 2, 20, 25, 5); });
      x.fillStyle = '#5a1d1d'; x.beginPath(); x.ellipse(0, 206, 16, 22, 0, 0, 7); x.fill();
      x.fillStyle = '#f27b7b'; x.beginPath(); x.ellipse(0, 218, 9, 7, 0, 0, 7); x.fill();
      sweat(x, 130, 100);
      break;
    case 'ko': {
      // 깨꼬닥: big spiral eyes, brows up, slack "o" mouth with the tongue lolling out to one side (cartoon, no injury)
      blush(x, 0.3);
      brow(x, L, 82, 88, 6); brow(x, R, 82, 88, 6);
      for (const e of [L, R]) spiral(x, e, Y, e < 0 ? 1 : -1, 25, 6);
      x.fillStyle = '#6a2a22';
      x.beginPath(); x.ellipse(-4, 198, 20, 11, -0.12, 0, 7); x.fill();
      x.fillStyle = '#f27b8e'; x.strokeStyle = '#b24a5c'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(2, 200); x.lineTo(24, 200); x.quadraticCurveTo(30, 236, 16, 240); x.quadraticCurveTo(0, 240, 2, 200); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(13, 206); x.lineTo(14, 226); x.stroke();
      break;
    }
    case 'dizzy':
      // 띵~: small spirals, wavy mouth, one sweat drop
      blush(x, 0.22);
      brow(x, L, 92, 84); brow(x, R, 84, 92);
      for (const e of [L, R]) spiral(x, e, Y + 2, e < 0 ? -1 : 1, 18, 5);
      x.strokeStyle = '#7a3527'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(-26, 200);
      for (let i = -26; i <= 26; i += 2) x.lineTo(i, 200 + Math.sin(i * 0.24) * 5);
      x.stroke();
      sweat(x, 128, 92, 0.9);
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export const FACES = ['normal', 'smile', 'endure', 'rage', 'relief', 'scared', 'smug', 'sleepy', 'shock', 'ko', 'dizzy'];
const NO_BLINK = { smile: 1, relief: 1, sleepy: 1, ko: 1, dizzy: 1 };
function faceTex(name, blink, frame) {
  const k = name + (blink ? 'B' : '') + (frame ? 'F' : '');
  let t = FACE_TEX.get(k);
  if (!t) { t = drawFace(name, blink, frame); FACE_TEX.set(k, t); }
  return t;
}

// ---------------------------------------------------------------- presets
export const PRESETS = {
  player: { gender: 'm', suit: '#2c365a', pants: '#2c365a', shirt: '#f5f4f0', tie: null, hair: '#1b1a1f', hairStyle: 'swept', skin: '#f3c8a6', lanyard: true, face: 'normal' },
  playerF: { gender: 'f', suit: '#2c365a', pants: '#2c365a', shirt: '#f5f4f0', tie: null, hair: '#2a1f1d', hairStyle: 'bob', skin: '#f5ccab', lanyard: true, face: 'normal' },
  boss: { gender: 'm', suit: null, vest: '#3f4152', pants: '#6a6158', shirt: '#f4f2ec', tie: '#b52f2b', hair: '#5d5248', hair2: '#c9c3bb', hairStyle: 'old', skin: '#eebd96', glasses: true, belly: 0.75, scale: 1.04, face: 'smug' },
  barista: { gender: 'f', suit: null, pants: '#3b302b', shirt: '#f0e3cc', tie: null, hair: '#4d2f22', hairStyle: 'bun', skin: '#f6cfb0', apron: '#6e4a2c', face: 'smile' },
  workerM1: { gender: 'm', suit: null, pants: '#3b3f48', shirt: '#f6f6f3', tie: '#2f4e8e', hair: '#1c1b1e', hairStyle: 'side', skin: '#efc29f', glasses: true, lanyard: true, face: 'normal' },
  workerM2: { gender: 'm', suit: null, pants: '#4a4a4f', shirt: '#cfe0f3', tie: '#2a3352', hair: '#2b2220', hairStyle: 'short', skin: '#e9bb95', lanyard: true, face: 'normal' },
  workerF1: { gender: 'f', suit: null, pants: '#3a3a40', skirt: '#5a5a60', shirt: '#efe5cf', tie: null, hair: '#3b2620', hairStyle: 'ponytail', skin: '#f6d0b2', lanyard: true, face: 'normal' },
  workerF2: { gender: 'f', suit: null, pants: '#2f3550', shirt: '#c5d8ee', tie: null, hair: '#2e211d', hairStyle: 'bun', skin: '#f3cbaa', glasses: true, face: 'normal' },
  chubby: { gender: 'm', suit: null, pants: '#2e3038', shirt: '#f7f7f5', tie: '#a8322c', hair: '#151417', hairStyle: 'short', skin: '#efc19c', belly: 1.1, scale: 1.02, face: 'normal' },
  glasses: { gender: 'm', suit: '#6b6f7a', pants: '#4b4e57', shirt: '#f3f3ef', tie: '#3d6b4f', hair: '#231d1b', hairStyle: 'side', skin: '#f0c4a2', glasses: true, lanyard: true, face: 'normal' },
};

export const ANIMS = ['idle', 'walk', 'run', 'sit', 'type', 'carry', 'phone', 'armsCrossed', 'lookUp', 'stretch', 'talk', 'offer', 'scared', 'flee', 'cheer', 'rageIdle', 'knocked', 'fall', 'ko', 'koFace', 'dizzy', 'groggy', 'stagger', 'coverEars', 'peek'];
export const ONESHOTS = ['punch', 'punchL', 'kick', 'smash', 'flip', 'pull', 'take', 'jump', 'land', 'special'];

// ---------------------------------------------------------------- pose channels
const BY = 0, SQ = 1, BRX = 2, BRY = 3, BRZ = 4, SPX = 5, SPY = 6, SPZ = 7, HX = 8, HY = 9, HZ = 10,
  LSX = 11, LSY = 12, LSZ = 13, LEX = 14, RSX = 15, RSY = 16, RSZ = 17, REX = 18,
  LHX = 19, LHZ = 20, LKX = 21, RHX = 22, RHZ = 23, RKX = 24, LFX = 25, RFX = 26, BZ = 27, NCH = 28;

const HIP_Y = 0.47;
const SIT_LIFT = 0.04;
const abs = Math.abs, sin = Math.sin, cos = Math.cos, max = Math.max, min = Math.min, PI = Math.PI;

function zero(o) { o.fill(0); o[SQ] = 1; }
function restArms(o) { o[LSZ] = o[RSZ] = 0.13; o[LEX] = o[REX] = -0.2; o[LSX] = o[RSX] = 0.03; }
function footFlat(o) { o[LFX] = -(o[LHX] + o[LKX]) * 0.7 - o[BRX] * 0.0; o[RFX] = -(o[RHX] + o[RKX]) * 0.7; }

function pIdle(o, t) {
  zero(o); restArms(o);
  const b = sin(t * 2.1);
  o[BY] = b * 0.004; o[SQ] = 1 + b * 0.012;
  o[SPX] = 0.02 + b * 0.012; o[HX] = -0.02 - b * 0.02; o[HZ] = sin(t * 0.6) * 0.035; o[HY] = sin(t * 0.37) * 0.08;
  o[LSZ] = o[RSZ] = 0.13 + b * 0.025;
  o[BRZ] = sin(t * 0.6) * 0.012;
}
function pWalk(o, t, ph, run) {
  zero(o);
  const s = sin(ph), c = cos(ph);
  const A = run ? 0.95 : 0.6, K = run ? 1.45 : 0.85;
  o[LHX] = -s * A; o[RHX] = s * A;
  o[LKX] = 0.06 + max(0, c) * K; o[RKX] = 0.06 + max(0, -c) * K;
  if (run) { o[LHX] -= 0.25; o[RHX] -= 0.25; }
  o[LSX] = s * (run ? 1.05 : 0.7); o[RSX] = -s * (run ? 1.05 : 0.7);
  o[LEX] = (run ? -1.35 : -0.35) - max(0, -s) * 0.45; o[REX] = (run ? -1.35 : -0.35) - max(0, s) * 0.45;
  o[LSZ] = o[RSZ] = run ? 0.22 : 0.15;
  o[BY] = abs(c) * (run ? 0.07 : 0.035) - (run ? 0.03 : 0.012);
  o[SQ] = 1 + (abs(c) - 0.5) * (run ? 0.07 : 0.035);
  o[BRY] = s * (run ? 0.1 : 0.12); o[SPY] = -s * (run ? 0.22 : 0.16);
  o[BRZ] = c * 0.035;
  o[SPX] = run ? 0.26 : 0.07; o[HX] = run ? -0.16 : -0.03;
  footFlat(o);
}
function pBase(o, t, ph, sp) { if (sp > 0.15) pWalk(o, t, ph, sp > 3.2); else pIdle(o, t); }
function pSit(o, t) {
  zero(o);
  const b = sin(t * 2.0);
  o[BY] = SIT_LIFT; o[LHX] = o[RHX] = -1.5; o[LKX] = o[RKX] = 1.45; o[LHZ] = o[RHZ] = 0.06;
  o[SPX] = -0.04 + b * 0.012; o[HX] = b * -0.015; o[HY] = sin(t * 0.4) * 0.1;
  o[LSX] = o[RSX] = -0.5; o[LEX] = o[REX] = -0.55; o[LSY] = o[RSY] = 0.25; o[LSZ] = o[RSZ] = 0.12;
  o[LFX] = o[RFX] = 0.1;
}
const POSE = {
  idle: (o, t) => pIdle(o, t),
  walk: (o, t, ph) => pWalk(o, t, ph, false),
  run: (o, t, ph) => pWalk(o, t, ph, true),
  sit: (o, t) => pSit(o, t),
  type(o, t) {
    pSit(o, t);
    o[SPX] = 0.12; o[HX] = 0.12;
    o[LSX] = -0.95 + sin(t * 21) * 0.05; o[RSX] = -0.95 + sin(t * 23 + 1.7) * 0.05;
    o[LEX] = o[REX] = -0.8; o[LSY] = o[RSY] = 0.3; o[LSZ] = o[RSZ] = 0.2;
    o[HY] = sin(t * 0.8) * 0.05;
  },
  carry(o, t, ph, sp) {
    pBase(o, t, ph, sp);
    o[LSX] = o[RSX] = -0.95; o[LEX] = o[REX] = -0.9; o[LSY] = o[RSY] = 0.32; o[LSZ] = o[RSZ] = 0.18;
    o[SPX] = min(o[SPX], 0.04) - 0.04; o[SPY] *= 0.3;
  },
  phone(o, t, ph, sp) {
    pBase(o, t, ph, sp);
    o[RSX] = -0.95; o[REX] = -1.55; o[RSY] = 0.5; o[RSZ] = 0.12;
    o[HX] = 0.38 + sin(t * 1.3) * 0.02; o[HY] = -0.08; o[SPX] += 0.05;
    o[LSZ] = 0.1;
  },
  armsCrossed(o, t, ph, sp) {
    pBase(o, t, ph, sp);
    o[LSX] = o[RSX] = -0.62; o[LEX] = o[REX] = -1.95; o[LSY] = o[RSY] = 0.95; o[LSZ] = o[RSZ] = 0.32;
    o[RSX] -= 0.08;
    o[HX] = -0.1; o[HZ] = 0.05; o[SPX] = -0.03 + sin(t * 2) * 0.01;
    if (sp < 0.15) { o[LHZ] = o[RHZ] = 0.06; }
  },
  lookUp(o, t) {
    pIdle(o, t);
    o[HX] = -0.5 + sin(t * 1.1) * 0.04; o[SPX] = -0.08; o[HZ] = sin(t * 0.5) * 0.06;
    o[LSZ] = o[RSZ] = 0.08;
  },
  stretch(o, t) {
    pSit(o, t);
    const b = sin(t * 1.2);
    o[SPX] = -0.3 + b * 0.03; o[HX] = -0.22; o[BRZ] = 0;
    o[LSX] = o[RSX] = -2.75; o[LSZ] = o[RSZ] = 0.6; o[LEX] = o[REX] = -1.85; o[LSY] = o[RSY] = 0.2;
    o[LHX] = o[RHX] = -1.35; o[LKX] = o[RKX] = 1.0; o[LHZ] = o[RHZ] = 0.15;
  },
  talk(o, t, ph, sp) {
    pBase(o, t, ph, sp);
    o[RSX] = -0.75 + sin(t * 4.3) * 0.25; o[REX] = -1.15 + sin(t * 3.1) * 0.15; o[RSY] = 0.25; o[RSZ] = 0.2;
    o[LSX] = -0.25 + sin(t * 2.7) * 0.12; o[LEX] = -0.7;
    o[HX] = sin(t * 6) * 0.05; o[HY] = sin(t * 1.3) * 0.15; o[BY] += abs(sin(t * 3)) * 0.008;
  },
  offer(o, t, ph, sp) {
    pBase(o, t, ph, sp);
    o[LSX] = o[RSX] = -1.0; o[LEX] = o[REX] = -0.7; o[LSY] = o[RSY] = 0.32; o[LSZ] = o[RSZ] = 0.16;
    o[SPX] = -0.12; o[HZ] = 0.14 + sin(t * 2) * 0.04; o[HX] = -0.12;
    o[BY] += abs(sin(t * 2.4)) * 0.01;
  },
  scared(o, t) {
    zero(o);
    const tr = sin(t * 38);
    o[LSX] = o[RSX] = -1.25; o[LSZ] = o[RSZ] = 0.32; o[LEX] = o[REX] = -0.85; o[LSY] = o[RSY] = 0.05;
    o[SPX] = -0.3; o[HX] = 0.15 + tr * 0.02; o[BZ] = -0.03;
    o[LHX] = o[RHX] = -0.18; o[LKX] = o[RKX] = 0.32; o[LHZ] = o[RHZ] = 0.08; o[BY] = -0.025;
    o[BRZ] = tr * 0.018; o[SQ] = 0.98 + tr * 0.01;
    footFlat(o);
  },
  flee(o, t, ph) {
    pWalk(o, t, ph, true);
    const s = sin(ph * 1.5);
    o[LSX] = -2.5 + s * 0.6; o[RSX] = -2.5 - s * 0.6; o[LSZ] = o[RSZ] = 0.6; o[LEX] = o[REX] = -0.45;
    o[SPX] = 0.22; o[HX] = -0.25; o[HY] = sin(t * 3) * 0.3;
  },
  cheer(o, t) {
    zero(o);
    const q = abs(sin(t * 5.5));
    o[BY] = q * 0.13; o[SQ] = 1 + (q - 0.5) * 0.09;
    o[LSX] = -2.85 + sin(t * 11) * 0.22; o[RSX] = -2.85 - sin(t * 11) * 0.22; o[LSZ] = o[RSZ] = 0.45; o[LEX] = o[REX] = -0.25;
    o[LKX] = o[RKX] = (1 - q) * 0.55; o[LHX] = o[RHX] = -(1 - q) * 0.3; o[HX] = -0.15;
    footFlat(o);
  },
  rageIdle(o, t) {
    zero(o);
    const hv = sin(t * 5.5);
    o[LHZ] = o[RHZ] = 0.24; o[LHX] = o[RHX] = -0.18; o[LKX] = o[RKX] = 0.38; o[BY] = -0.04 + hv * 0.012;
    o[SPX] = 0.16 + hv * 0.05; o[SQ] = 1 + hv * 0.018;
    o[LSZ] = o[RSZ] = 0.42; o[LSX] = o[RSX] = 0.12; o[LEX] = o[REX] = -0.7 + hv * 0.1;
    o[HX] = -0.12 + hv * 0.04;
    o[LFX] = o[RFX] = -0.2;
  },
  knocked(o, t) {
    zero(o);
    o[BRX] = -PI / 2; o[BY] = 0.165;
    o[LHX] = o[RHX] = -0.35; o[LKX] = o[RKX] = 0.55; o[LHZ] = o[RHZ] = 0.1;
    o[LSZ] = o[RSZ] = 1.3; o[LEX] = o[REX] = -0.35; o[LSX] = o[RSX] = -0.2;
    o[HZ] = sin(t * 3) * 0.25; o[HX] = 0.42; // chin tucked: keeps the big head off the floor
  },
  fall(o, t) {
    zero(o);
    const s = sin(t * 14);
    o[LSX] = -2.6 + s * 0.5; o[RSX] = -2.6 - s * 0.5; o[LSZ] = o[RSZ] = 0.75; o[LEX] = o[REX] = -0.3;
    o[LHX] = -0.6 + sin(t * 12) * 0.5; o[RHX] = -0.6 - sin(t * 12) * 0.5; o[LKX] = o[RKX] = 0.9;
    o[SPX] = -0.12; o[HX] = -0.2;
  },
  // ---- 깨꼬닥 (KO) set: starfish on the back, one leg twitching now and then; head lolls, chest breathes
  ko(o, t) {
    zero(o);
    o[BRX] = -PI / 2; o[BY] = 0.165;
    o[LSZ] = o[RSZ] = 1.7; o[LSX] = o[RSX] = -0.12; o[LEX] = o[REX] = -0.3; o[LSY] = o[RSY] = 0.2;
    o[LHZ] = o[RHZ] = 0.4; o[LKX] = 0.1;
    const u = t % 1.9, k = u < 0.4 ? sin((u / 0.4) * PI) : 0;
    o[RKX] = 0.1 + k * 1.0; o[RHX] = -k * 0.6; o[RFX] = 0.2 + k * 0.6; o[LFX] = 0.25;
    o[HZ] = 0.34 + sin(t * 1.3) * 0.05; o[HX] = 0.45; o[SQ] = 1 + sin(t * 2.2) * 0.015;
  },
  // face-plant variant (hit from behind): flat on the front, arms out past the head, a foot twitching
  koFace(o, t) {
    zero(o);
    o[BRX] = PI / 2; o[BY] = 0.165;
    o[LSX] = o[RSX] = -2.75; o[LSZ] = o[RSZ] = 0.45; o[LEX] = o[REX] = -0.15;
    o[LHZ] = o[RHZ] = 0.22; o[LKX] = 0.15;
    const u = t % 1.7, k = u < 0.35 ? sin((u / 0.35) * PI) : 0;
    o[RKX] = 0.15 + k * 1.3; o[LFX] = o[RFX] = -0.4;
    o[HX] = -0.5; o[HY] = 0.45; o[SQ] = 1 + sin(t * 2.2) * 0.012;
  },
  // 띵~ (one hit from KO): swaying on wobbly knees, head circling
  dizzy(o, t) {
    pIdle(o, t);
    const w = sin(t * 3.4), c = cos(t * 3.4);
    o[BRZ] = w * 0.11; o[BRX] = c * 0.05; o[HZ] = -w * 0.28; o[HX] = 0.08 + c * 0.14;
    o[LSZ] = o[RSZ] = 0.55 + w * 0.2; o[LEX] = o[REX] = -0.55; o[LHZ] = o[RHZ] = 0.1;
    o[LKX] = o[RKX] = 0.22 + abs(w) * 0.15; o[LHX] = o[RHX] = -0.1; o[BY] = -0.025;
    footFlat(o);
  },
  // waking up: sitting on the floor, shaking the head, then a dazed look round
  groggy(o, t) {
    zero(o);
    o[BY] = -(HIP_Y - 0.085);
    o[LHX] = o[RHX] = -1.45; o[LKX] = o[RKX] = 0.28; o[LHZ] = o[RHZ] = 0.16; o[LFX] = o[RFX] = -0.25;
    o[SPX] = -0.18 + sin(t * 1.6) * 0.03; o[LSX] = o[RSX] = 0.6; o[LSZ] = o[RSZ] = 0.32; o[LEX] = o[REX] = -0.12;
    const sh = t < 1.3 ? sin(t * 17) * 0.5 * (1 - t / 1.3) : 0;
    o[HY] = sh + (t > 1.3 ? sin(t * 1.1) * 0.35 : 0); o[HZ] = sin(t * 2.1) * 0.12; o[HX] = 0.05;
  },
  stagger(o, t, ph) {
    pWalk(o, t, ph, false);
    const w = sin(t * 2.6);
    o[BRZ] += w * 0.13; o[HZ] = -w * 0.22; o[HX] = 0.12; o[LSZ] = o[RSZ] = 0.45 + w * 0.15; o[SPX] = 0.12;
  },
  // megaphone blast: hands over the ears, hunched
  coverEars(o, t) {
    zero(o);
    const tr = sin(t * 30);
    o[LSX] = o[RSX] = -0.45; o[LSZ] = o[RSZ] = 1.25; o[LSY] = o[RSY] = 0.55; o[LEX] = o[REX] = -2.35;
    o[SPX] = 0.3; o[HX] = 0.22 + tr * 0.02; o[BY] = -0.04;
    o[LHX] = o[RHX] = -0.2; o[LKX] = o[RKX] = 0.4; o[LHZ] = o[RHZ] = 0.1; o[BRZ] = tr * 0.02;
    footFlat(o);
  },
  // the hiding boss peeks round the pillar
  peek(o, t) {
    pIdle(o, t);
    const k = 0.5 + 0.5 * sin(t * 2.2);
    o[BRZ] = 0.32 * k; o[BZ] = 0.0; o[SPZ] = 0.15 * k; o[HZ] = -0.35 * k; o[HY] = 0.25 * k;
    o[RSX] = -1.0; o[RSZ] = 0.55; o[REX] = -1.2; o[LSZ] = 0.4 * k; o[LHZ] = 0.15 * k;
  },
};

// keyframe helper: a = [t0,v0,t1,v1,...] smoothstep between keys
function kf(t, a) {
  if (t <= a[0]) return a[1];
  for (let i = 2; i < a.length; i += 2) {
    if (t <= a[i]) { const t0 = a[i - 2], u = (t - t0) / (a[i] - t0), s = u * u * (3 - 2 * u); return a[i - 1] + (a[i + 1] - a[i - 1]) * s; }
  }
  return a[a.length - 1];
}
const K = {
  pS: [0, -0.3, 0.1, 0.45, 0.17, -1.62, 0.29, -1.55, 0.38, -0.5],
  pE: [0, -1.5, 0.1, -2.0, 0.17, -0.05, 0.29, -0.1, 0.38, -1.0],
  pT: [0, 0, 0.1, -0.35, 0.17, 0.5, 0.29, 0.45, 0.38, 0],
  kH: [0, 0, 0.12, 0.35, 0.22, -1.5, 0.36, -1.3, 0.5, 0],
  kK: [0, 0, 0.12, 1.25, 0.22, 0.05, 0.36, 0.25, 0.5, 0],
  kS: [0, 0, 0.22, -0.28, 0.5, 0],
  sS: [0, 0, 0.28, -3.0, 0.4, -0.95, 0.55, -0.85, 0.65, -0.2],
  sE: [0, -0.3, 0.28, -0.75, 0.4, -0.1, 0.65, -0.3],
  sP: [0, 0, 0.28, -0.32, 0.4, 0.55, 0.55, 0.5, 0.65, 0],
  sB: [0, 0, 0.28, 0.03, 0.4, -0.1, 0.55, -0.08, 0.65, 0],
  sK: [0, 0, 0.28, 0, 0.4, 0.75, 0.55, 0.6, 0.65, 0],
  sQ: [0, 1, 0.28, 1.06, 0.4, 0.86, 0.55, 0.92, 0.65, 1],
  fB: [0, 0, 0.25, -0.14, 0.45, 0.05, 0.6, 0.02, 0.75, 0],
  fK: [0, 0, 0.25, 1.35, 0.45, 0.05, 0.75, 0],
  fP: [0, 0, 0.25, 0.55, 0.45, -0.22, 0.75, 0],
  fS: [0, 0, 0.25, -0.65, 0.45, -2.75, 0.6, -2.6, 0.75, -0.2],
  fQ: [0, 1, 0.25, 0.87, 0.45, 1.12, 0.75, 1],
  lS: [0, 0, 0.15, -1.4, 0.3, -1.3, 0.45, -0.85, 0.6, -0.9, 0.7, -0.3],
  lE: [0, -0.3, 0.15, -0.12, 0.3, -0.3, 0.45, -1.35, 0.7, -0.4],
  lP: [0, 0, 0.15, 0.28, 0.3, 0.22, 0.45, -0.38, 0.6, -0.3, 0.7, 0],
  lK: [0, 0, 0.15, 0.1, 0.45, 0.5, 0.7, 0],
  lB: [0, 0, 0.45, -0.05, 0.7, 0],
  tS: [0, 0, 0.2, -1.3, 0.45, -0.95],
  tE: [0, -0.3, 0.2, -0.2, 0.45, -0.9],
  tP: [0, 0, 0.2, 0.2, 0.45, 0],
  jB: [0, 0, 0.08, -0.07, 0.18, 0.03, 0.4, 0.02],
  jQ: [0, 1, 0.08, 0.84, 0.18, 1.15, 0.4, 1],
  jK: [0, 0, 0.08, 0.85, 0.18, 0, 0.3, 0.9, 0.4, 0.7],
  jS: [0, 0, 0.08, 0.5, 0.18, -2.4, 0.4, -1.9],
  dQ: [0, 0.76, 0.1, 1.07, 0.28, 1],
  dB: [0, -0.09, 0.12, 0, 0.28, 0],
  dK: [0, 1.05, 0.28, 0],
  dP: [0, 0.32, 0.28, 0],
  xY: [0, 0, 0.2, -0.7, 0.56, 2 * PI],
  xZ: [0, 0.1, 0.2, 1.45, 0.55, 1.45, 0.62, 0.3, 0.9, 0.2],
  xB: [0, 0, 0.2, -0.09, 0.5, 0.02, 0.62, 0.17, 0.72, -0.12, 0.9, 0],
  xQ: [0, 1, 0.2, 0.88, 0.5, 1.05, 0.62, 1.12, 0.72, 0.76, 0.9, 1],
  xH: [0, 0, 0.55, 0, 0.64, -1.25, 0.72, -0.2, 0.9, 0],
  xK: [0, 0, 0.2, 0.6, 0.5, 0.2, 0.64, 1.3, 0.72, 0.4, 0.9, 0],
  xL: [0, 0, 0.2, 0.6, 0.5, 0.2, 0.64, 0.3, 0.72, 0.7, 0.9, 0],
  xP: [0, 0, 0.2, 0.3, 0.5, 0, 0.72, 0.45, 0.9, 0],
  xS: [0, 0, 0.55, 0, 0.62, -2.7, 0.72, -0.35, 0.9, 0],
};
const SHOT = {
  punch: { dur: 0.38, inT: 0.04, outT: 0.1, fn(o, t) {
    o[RSX] = kf(t, K.pS); o[REX] = kf(t, K.pE); o[RSY] = 0.2; o[RSZ] = 0.12; o[SPY] = kf(t, K.pT);
    o[LSX] = -1.1; o[LEX] = -1.9; o[LSY] = 0.4; o[SPX] = 0.12; o[HY] = -o[SPY] * 0.5;
  } },
  punchL: { dur: 0.38, inT: 0.04, outT: 0.1, fn(o, t) {
    o[LSX] = kf(t, K.pS); o[LEX] = kf(t, K.pE); o[LSY] = 0.2; o[LSZ] = 0.12; o[SPY] = -kf(t, K.pT);
    o[RSX] = -1.1; o[REX] = -1.9; o[RSY] = 0.4; o[SPX] = 0.12; o[HY] = -o[SPY] * 0.5;
  } },
  kick: { dur: 0.5, inT: 0.05, outT: 0.12, fn(o, t) {
    o[RHX] = kf(t, K.kH); o[RKX] = kf(t, K.kK); o[RHZ] = 0; o[SPX] = kf(t, K.kS); o[LKX] = 0.25; o[LHX] = -0.1; o[LHZ] = 0.03;
    o[LSZ] = o[RSZ] = 0.7; o[LSX] = 0.3; o[RSX] = -0.4; o[LEX] = o[REX] = -0.4; o[BY] = -0.02; o[RFX] = -o[RHX] * 0.3;
  } },
  smash: { dur: 0.65, inT: 0.05, outT: 0.1, fn(o, t) {
    o[LSX] = o[RSX] = kf(t, K.sS); o[LEX] = o[REX] = kf(t, K.sE); o[LSY] = o[RSY] = 0.38; o[LSZ] = o[RSZ] = 0.1;
    o[SPX] = kf(t, K.sP); o[SPY] = 0; o[BY] = kf(t, K.sB); o[SQ] = kf(t, K.sQ);
    o[LKX] = o[RKX] = kf(t, K.sK); o[LHX] = o[RHX] = -o[LKX] * 0.5; o[LHZ] = o[RHZ] = 0.15; footFlat(o);
  } },
  flip: { dur: 0.75, inT: 0.05, outT: 0.12, fn(o, t) {
    o[BY] = kf(t, K.fB); o[LKX] = o[RKX] = kf(t, K.fK); o[LHX] = o[RHX] = -o[LKX] * 0.55; o[LHZ] = o[RHZ] = 0.2;
    o[SPX] = kf(t, K.fP); o[SPY] = 0; o[LSX] = o[RSX] = kf(t, K.fS); o[LEX] = o[REX] = -0.25; o[LSY] = o[RSY] = 0.3; o[LSZ] = o[RSZ] = 0.15;
    o[SQ] = kf(t, K.fQ); footFlat(o);
  } },
  pull: { dur: 0.7, inT: 0.05, outT: 0.1, fn(o, t) {
    o[LSX] = o[RSX] = kf(t, K.lS); o[LEX] = o[REX] = kf(t, K.lE); o[LSY] = o[RSY] = 0.28; o[LSZ] = o[RSZ] = 0.15;
    o[SPX] = kf(t, K.lP); o[SPY] = 0; o[LKX] = o[RKX] = kf(t, K.lK); o[LHX] = o[RHX] = -o[LKX] * 0.4; o[BY] = kf(t, K.lB);
    o[LHX] -= 0.15; o[RHX] += 0.15; footFlat(o);
  } },
  take: { dur: 0.45, inT: 0.05, outT: 0.08, fn(o, t) {
    o[LSX] = o[RSX] = kf(t, K.tS); o[LEX] = o[REX] = kf(t, K.tE); o[LSY] = o[RSY] = 0.3; o[LSZ] = o[RSZ] = 0.16; o[SPX] = kf(t, K.tP);
  } },
  jump: { dur: 0.4, inT: 0.03, outT: 0.08, fn(o, t) {
    o[BY] = kf(t, K.jB); o[SQ] = kf(t, K.jQ); o[LKX] = o[RKX] = kf(t, K.jK); o[LHX] = o[RHX] = -o[LKX] * 0.6;
    o[LSX] = o[RSX] = kf(t, K.jS); o[LSZ] = o[RSZ] = 0.5; o[LEX] = o[REX] = -0.3; footFlat(o);
  } },
  land: { dur: 0.28, inT: 0, outT: 0.08, fn(o, t) {
    o[SQ] = kf(t, K.dQ); o[BY] = kf(t, K.dB); o[LKX] = o[RKX] = kf(t, K.dK); o[LHX] = o[RHX] = -o[LKX] * 0.55;
    o[SPX] = kf(t, K.dP); o[LSZ] = o[RSZ] = 0.55; o[LSX] = o[RSX] = 0.2; footFlat(o);
  } },
  special: { dur: 0.9, inT: 0.05, outT: 0.12, fn(o, t) {
    let y = kf(t, K.xY); if (y > PI) y -= 2 * PI; o[BRY] = y;
    o[LSZ] = o[RSZ] = kf(t, K.xZ); o[LSX] = o[RSX] = kf(t, K.xS); o[LEX] = o[REX] = -0.25; o[LSY] = o[RSY] = 0;
    o[BY] = kf(t, K.xB); o[SQ] = kf(t, K.xQ); o[RHX] = kf(t, K.xH) - kf(t, K.xK) * 0.4; o[RKX] = kf(t, K.xK);
    o[LKX] = kf(t, K.xL); o[LHX] = -o[LKX] * 0.5; o[LHZ] = o[RHZ] = 0.18; o[SPX] = kf(t, K.xP); o[SPY] = 0; o[HX] = -0.1;
    o[LFX] = -(o[LHX] + o[LKX]) * 0.7;
  } },
};

// ---------------------------------------------------------------- hair
function buildHair(skull, style, hairCol, hair2) {
  const hm = mat(hairCol, 0.55);
  const hm2 = mat(hair2 || shade(hairCol, 0.12), 0.6);
  const capG = geo('hairCap', () => new THREE.SphereGeometry(1, 18, 8, 0, PI * 2, 0, PI * 0.56));
  const blob = sph(8, 5);
  const cap = (rotX = -0.55, s = 1.075, y = 0.03, z = -0.03, m = hm) => { const c = mesh(capG, m, skull, 0, y, z, s); c.rotation.x = rotX; return c; };
  const b = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, m = hm) => { const o = mesh(blob, m, skull, x, y, z, sx, sy, sz); o.rotation.set(rx, ry, rz); return o; };
  switch (style) {
    case 'swept':
      cap(-0.62);
      b(0.1, 0.9, 0.22, 0.66, 0.34, 0.62, 0.3, 0, -0.22);       // volume on top
      b(-0.38, 0.78, 0.4, 0.5, 0.28, 0.5, 0.35, 0, 0.55);       // swoop left
      b(0.0, 0.66, 0.66, 0.62, 0.2, 0.32, 0.75, 0, 0.32);        // fringe sweeping across
      b(0.42, 0.72, 0.48, 0.38, 0.22, 0.4, 0.5, 0, -0.5);
      b(0.94, 0.12, 0.12, 0.12, 0.3, 0.22); b(-0.94, 0.12, 0.12, 0.12, 0.3, 0.22); // sideburns
      b(0, 0.35, -0.82, 0.8, 0.6, 0.35, -0.3);                 // back volume
      break;
    case 'side':
      cap(-0.6);
      b(-0.22, 0.88, 0.25, 0.62, 0.3, 0.6, 0.25, 0, 0.25);
      b(0.38, 0.83, 0.3, 0.5, 0.25, 0.48, 0.3, 0, -0.35);
      b(0.18, 0.64, 0.66, 0.62, 0.18, 0.3, 0.7, 0, -0.28);
      b(0.94, 0.12, 0.12, 0.12, 0.3, 0.22); b(-0.94, 0.12, 0.12, 0.12, 0.3, 0.22);
      break;
    case 'short':
      cap(-0.62);
      b(0, 0.86, 0.12, 0.76, 0.3, 0.72, 0.2);
      b(0, 0.64, 0.64, 0.66, 0.17, 0.3, 0.72);
      b(0.94, 0.12, 0.12, 0.12, 0.28, 0.22); b(-0.94, 0.12, 0.12, 0.12, 0.28, 0.22);
      break;
    case 'old':
      cap(-0.75, 1.07, 0.02, -0.06);
      b(0, 0.86, -0.02, 0.72, 0.3, 0.78, -0.25);
      b(0.12, 0.76, 0.5, 0.56, 0.2, 0.36, 0.55, 0, -0.2);
      b(0.88, 0.22, -0.12, 0.26, 0.46, 0.58, 0, 0, 0, hm2);
      b(-0.88, 0.22, -0.12, 0.26, 0.46, 0.58, 0, 0, 0, hm2);
      b(0, 0.25, -0.86, 0.74, 0.5, 0.3, 0, 0, 0, hm2);
      break;
    case 'bun':
      cap(-0.55);
      b(0, 0.82, -0.62, 0.42, 0.42, 0.42);                       // bun
      b(0, 0.6, -0.5, 0.18, 0.1, 0.18, -0.6, 0, 0, mat('#2b1a12', 0.6));
      b(-0.36, 0.68, 0.62, 0.52, 0.2, 0.32, 0.7, 0, 0.45);       // parted fringe
      b(0.36, 0.68, 0.62, 0.52, 0.2, 0.32, 0.7, 0, -0.45);
      b(0.9, 0.0, 0.25, 0.16, 0.5, 0.25, 0, 0, 0.1); b(-0.9, 0.0, 0.25, 0.16, 0.5, 0.25, 0, 0, -0.1); // side locks
      break;
    case 'ponytail':
      cap(-0.55);
      b(0, 0.32, -1.08, 0.3, 0.62, 0.3, 0.5);                    // tail
      b(0, 0.66, -0.88, 0.2, 0.14, 0.2, 0.4, 0, 0, mat('#c23b5a', 0.6));
      b(0.15, 0.7, 0.6, 0.66, 0.2, 0.32, 0.7, 0, -0.3);
      b(0.9, 0.0, 0.25, 0.15, 0.48, 0.24); b(-0.9, 0.0, 0.25, 0.15, 0.48, 0.24);
      break;
    case 'bob': {
      const bobG = geo('hairBob', () => new THREE.SphereGeometry(1, 18, 9, 0, PI * 2, 0, PI * 0.7));
      const c = mesh(bobG, hm, skull, 0, 0.02, -0.04, 1.1, 1.1, 1.1); c.rotation.x = -0.9;
      b(0, 0.72, 0.56, 0.78, 0.22, 0.36, 0.7);
      b(0.86, -0.2, 0.1, 0.3, 0.6, 0.55); b(-0.86, -0.2, 0.1, 0.3, 0.6, 0.55);
      break;
    }
  }
}

// ---------------------------------------------------------------- rigid skinning (one draw call per character)
const SKIN_GEO = new Map();
const KEEP_ATTR = { position: 1, normal: 1, uv: 1 };
let SKIN_MAT = null;
function skinMat() {
  if (SKIN_MAT) return SKIN_MAT;
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = rm;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
  };
  m.customProgramCacheKey = () => 'ppgSkinRM';
  SKIN_MAT = m;
  return m;
}
const _rel = new THREE.Matrix4(), _jinv = new THREE.Matrix4(), _lin = new THREE.Color();
function skinCharacter(group, sig, skip) {
  group.updateMatrixWorld(true);
  const bones = [], boneIdx = new Map(), parts = [];
  group.traverse((m) => {
    if (!m.isMesh) return;
    for (let p = m; p && p !== group; p = p.parent) if (skip.has(p)) return;
    let j = m.parent; while (j && j.isMesh) j = j.parent;
    if (!boneIdx.has(j)) { boneIdx.set(j, bones.length); bones.push(j); }
    parts.push([m, j]);
  });
  let geo = SKIN_GEO.get(sig);
  if (!geo) {
    const list = parts.map(([m, j]) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!KEEP_ATTR[k]) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.morphAttributes = {};
      _jinv.copy(j.matrixWorld).invert();
      g.applyMatrix4(_rel.multiplyMatrices(_jinv, m.matrixWorld));
      const n = g.attributes.position.count, bi = boneIdx.get(j), mt = m.material;
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3), rm = new Float32Array(n * 2);
      _lin.copy(mt.color);
      for (let i = 0; i < n; i++) {
        si[i * 4] = bi; sw[i * 4] = 1;
        col[i * 3] = _lin.r; col[i * 3 + 1] = _lin.g; col[i * 3 + 2] = _lin.b;
        rm[i * 2] = mt.roughness; rm[i * 2 + 1] = mt.metalness;
      }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('rm', new THREE.BufferAttribute(rm, 2));
      return g;
    });
    geo = mergeGeometries(list);
    for (const g of list) g.dispose();
    SKIN_GEO.set(sig, geo);
  }
  for (const [m] of parts) m.parent.remove(m);
  const sk = new THREE.SkinnedMesh(geo, skinMat());
  sk.name = 'charSkin';
  sk.bind(new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4())), new THREE.Matrix4());
  sk.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.35);
  sk.castShadow = true; sk.receiveShadow = true;
  group.add(sk);
  return sk;
}

// ---------------------------------------------------------------- character
let SEQ = 1;
export function makeCharacter(opts = {}) {
  const base = opts.preset && PRESETS[opts.preset] ? PRESETS[opts.preset] : PRESETS.player;
  const o = Object.assign({}, base, opts);
  const seed = (o.seed != null ? o.seed : SEQ++) | 0;
  let rs = (seed * 2654435761 >>> 0) || 7;
  const rnd = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };

  const female = o.gender === 'f';
  const skin = mat(o.skin, 0.62);
  const skinD = mat(shade(o.skin, -0.06), 0.65);
  const shirt = mat(o.shirt, 0.8);
  const pantsM = mat(o.pants, 0.78);
  const torsoCol = o.suit || o.vest || o.shirt;
  const torsoM = mat(torsoCol, o.suit ? 0.7 : 0.8);
  const armM = o.suit ? mat(o.suit, 0.7) : shirt;
  const shoeM = mat(female ? '#2a2526' : '#1d1a1a', 0.38);
  const belly = o.belly || 0;

  const group = new THREE.Group();
  group.name = 'char:' + (o.preset || 'custom');
  const sc = o.scale || 1;
  group.scale.setScalar(sc);
  const body = new THREE.Group(); group.add(body);

  // ---- legs
  const legs = [];
  const thighM = o.skirt && female ? mat(o.skirt, 0.8) : pantsM;
  const shinM = o.skirt && female ? mat(shade(o.skin, -0.1), 0.55) : pantsM;
  for (const s of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.088, HIP_Y, 0); body.add(hip);
    mesh(caps(0.078, 0.1), thighM, hip, 0, -0.1, 0);
    const knee = new THREE.Group(); knee.position.y = -0.2; hip.add(knee);
    mesh(caps(o.skirt && female ? 0.055 : 0.07, 0.1), shinM, knee, 0, -0.095, 0);
    const ank = new THREE.Group(); ank.position.y = -0.19; knee.add(ank);
    mesh(sph(8, 6), shoeM, ank, 0, -0.03, 0.035, 0.072, 0.052, 0.125);
    legs.push(hip, knee, ank);
  }
  // pelvis
  mesh(sph(10, 6), pantsM, body, 0, HIP_Y + 0.02, 0, 0.175, 0.1, 0.13);
  if (o.skirt && female) {
    const sk = mesh(cyl(0.17, 0.205, 0.25, 14), mat(o.skirt, 0.8), body, 0, HIP_Y - 0.08, 0);
    sk.scale.z = 0.82;
  }
  if (o.apron) {
    mesh(rbox(0.34, 0.25, 0.03), mat(o.apron, 0.85), body, 0, HIP_Y - 0.06, 0.15);
  }

  // ---- spine / torso
  const spine = new THREE.Group(); spine.position.y = HIP_Y + 0.02; body.add(spine);
  const torsoG = geo('torsoLathe', () => new THREE.LatheGeometry([
    [0, -0.035], [0.13, -0.03], [0.175, 0.0], [0.19, 0.08], [0.195, 0.2], [0.185, 0.3], [0.16, 0.37], [0.11, 0.42], [0.05, 0.44], [0, 0.445],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 14));
  mesh(torsoG, torsoM, spine, 0, 0, 0, 1.15, 1, 0.8);
  if (o.suit) mesh(cyl(0.195, 0.205, 0.11, 14), torsoM, spine, 0, 0.035, 0, 1.15, 1, 0.82);
  else if (!o.apron) mesh(cyl(0.181, 0.181, 0.03, 14), mat('#2a2422', 0.5), spine, 0, 0.012, 0, 1.15, 1, 0.81); // belt
  if (belly > 0) mesh(sph(12, 8), torsoM, spine, 0, 0.13, 0.04, 0.18 + belly * 0.02, 0.16 + belly * 0.02, 0.1 + belly * 0.06);
  // collar V (shirt) + jacket lapel hint
  mesh(cyl(0.074, 0.085, 0.045, 10), shirt, spine, 0, 0.43, 0.005);              // collar band
  if (o.suit || o.vest) {
    const vee = mesh(cyl(0.085, 0.085, 0.03, 3), shirt, spine, 0, 0.36, 0.118);
    vee.rotation.x = PI / 2 - 0.35;                                                 // shirt V inside the jacket
  }
  let tieB = null;
  if (o.tie) {
    const tm = mat(o.tie, 0.55);
    mesh(rbox(0.04, 0.035, 0.03), tm, spine, 0, 0.385, 0.128);
    // the blade hangs from its own joint (flops about when knocked out)
    tieB = new THREE.Group(); tieB.position.set(0, 0.375, 0.145); spine.add(tieB);
    const tb = mesh(rbox(0.046, 0.2, 0.016), tm, tieB, 0, -0.105, 0.013);
    tb.rotation.x = -0.15;
  }
  if (o.apron) {
    const am = mat(o.apron, 0.85);
    const ap = mesh(rbox(0.27, 0.3, 0.025), am, spine, 0, 0.17, 0.162); ap.rotation.x = -0.05;
    for (const s of [1, -1]) { const st = mesh(rbox(0.025, 0.18, 0.012, 0.004), am, spine, s * 0.09, 0.36, 0.125); st.rotation.set(-0.5, 0, s * -0.25); }
  }
  if (o.lanyard) {
    const lm = mat('#2f6fd6', 0.5);
    const a = new THREE.Vector3(), bb = new THREE.Vector3(0, 0.215, 0.158);
    for (const s of [1, -1]) {
      a.set(s * 0.075, 0.41, 0.075);
      const len = a.distanceTo(bb);
      const st = mesh(cyl(0.007, 0.007, len, 5), lm, spine, (a.x + bb.x) / 2, (a.y + bb.y) / 2, (a.z + bb.z) / 2);
      st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(bb).normalize());
    }
    mesh(rbox(0.06, 0.08, 0.01, 0.004), mat('#f4f6fa', 0.5), spine, 0, 0.17, 0.16);
    mesh(rbox(0.062, 0.022, 0.012, 0.004), lm, spine, 0, 0.2, 0.16);
  }
  // chest anchor (two-hand carry)
  const chest = new THREE.Object3D(); chest.position.set(0, 0.2, 0.3); spine.add(chest);

  // ---- arms
  const arms = [];
  let handL = null, handR = null;
  for (const s of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.192, 0.335, 0); spine.add(sh);
    mesh(caps(0.06, 0.09), armM, sh, 0, -0.09, 0);
    const el = new THREE.Group(); el.position.y = -0.185; sh.add(el);
    mesh(caps(0.056, 0.08), armM, el, 0, -0.085, 0);
    if (o.suit) mesh(cyl(0.052, 0.052, 0.03, 10), shirt, el, 0, -0.155, 0);
    const hand = new THREE.Group(); hand.position.y = -0.215; el.add(hand);
    mesh(sph(9, 6), skin, hand, 0, 0, 0, 0.066, 0.072, 0.07);
    mesh(sph(6, 4), skin, hand, -s * 0.035, 0.012, 0.04, 0.028, 0.034, 0.028); // thumb
    const anchor = new THREE.Object3D(); anchor.position.set(0, -0.02, 0.03); hand.add(anchor);
    arms.push(sh, el);
    if (s === 1) handL = anchor; else handR = anchor;
  }
  // built-in phone (shown in 'phone' anim when right hand is free)
  const phoneM = mesh(rbox(0.07, 0.13, 0.012, 0.006), mat('#1d2230', 0.35), handR, 0, 0.03, 0.03);
  phoneM.rotation.x = -1.2;
  const scr = mesh(geo('phScr', () => new THREE.PlaneGeometry(0.058, 0.11)), mat('#7fb3ff', 0.3, 0, { emissive: '#3a6fd0', emissiveIntensity: 0.6 }), phoneM, 0, 0, 0.0065);
  scr.castShadow = false;
  phoneM.visible = false;

  // ---- neck + head
  mesh(cyl(0.06, 0.07, 0.08, 10), skin, spine, 0, 0.43, 0);
  const neck = new THREE.Group(); neck.position.y = 0.43; spine.add(neck);
  const R = 0.268;
  const skull = new THREE.Group(); skull.position.set(0, 0.245, 0.01); skull.scale.set(R * 1.06, R * 0.97, R); neck.add(skull);
  mesh(sph(18, 12), skin, skull);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex(o.face || 'normal', false, 0), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const faceG = geo('facePatch', () => new THREE.SphereGeometry(1.01, 12, 8, PI / 2 - 1.0, 2.0, 0.95, 1.25));
  const faceMesh = new THREE.Mesh(faceG, faceMat); faceMesh.renderOrder = 1; skull.add(faceMesh);
  for (const s of [1, -1]) mesh(sph(7, 5), skin, skull, s * 0.99, -0.06, 0.02, 0.15, 0.24, 0.12);
  mesh(sph(6, 4), skinD, skull, 0, -0.2, 0.97, 0.1, 0.08, 0.07);
  buildHair(skull, o.hairStyle || 'short', o.hair, o.hair2);
  // glasses + a cartoon bump each on their own joint: scaled to ~0 to hide (glasses knocked off / no bump yet)
  let glassesB = null;
  if (o.glasses) {
    const gm = mat('#2a2220', 0.4);
    glassesB = new THREE.Group(); skull.add(glassesB);
    const ring = geo('glRing', () => new THREE.TorusGeometry(0.2, 0.03, 4, 14));
    for (const s of [1, -1]) mesh(ring, gm, glassesB, s * 0.34, -0.06, 1.0, 1, 0.9, 1);
    const br = mesh(cyl(0.022, 0.022, 0.26, 5), gm, glassesB, 0, -0.03, 1.04); br.rotation.z = PI / 2;
    for (const s of [1, -1]) { const tp = mesh(cyl(0.02, 0.02, 0.7, 5), gm, glassesB, s * 0.58, -0.04, 0.65); tp.rotation.x = PI / 2; tp.rotation.y = s * 0.55; }
  }
  const bumpB = new THREE.Group(); bumpB.position.set(0.22, 1.02, 0.28); skull.add(bumpB);
  mesh(sph(10, 7), mat('#' + new THREE.Color(o.skin).lerp(new THREE.Color('#ff8c8c'), 0.32).getHexString(), 0.5), bumpB, 0, 0, 0, 0.36, 0.33, 0.36);
  mesh(sph(6, 4), mat('#ffffff', 0.3), bumpB, -0.1, 0.17, 0.12, 0.09, 0.06, 0.07); // shine

  // ---- all body parts → ONE rigidly skinned mesh (each joint group is a bone, colour + roughness per vertex).
  // Same look as the per-part meshes, but 1 draw call (+1 shadow) instead of ~25 (+~24).
  const sig = JSON.stringify(Object.assign({}, o, { seed: 0, face: 0, scale: 0 }));
  const skip = new Set([faceMesh, phoneM, scr]);
  const skinned = skinCharacter(group, sig, skip);
  group.traverse((m) => { if (m.isMesh && m !== faceMesh && m !== scr) { m.castShadow = true; m.receiveShadow = true; } });
  const HIDE = 1e-3;
  bumpB.scale.setScalar(HIDE);
  let tieFlop = 0;

  // ---- anim state (preallocated)
  const P0 = new Float32Array(NCH), P1 = new Float32Array(NCH), PS = new Float32Array(NCH);
  const st = {
    anim: 'idle', prev: null, blend: 1, tA: rnd() * 10, tP: 0, ph: rnd() * 6,
    shot: null, shotT: 0, shotCb: null,
    face: o.face || 'normal', blinkT: 1 + rnd() * 3, blinking: 0, frameT: 0.6, frame: 0,
    look: null, lyaw: 0, lpitch: 0,
  };
  const tmpV = _tmpV;

  function applyFace() {
    faceMat.map = faceTex(st.face, st.blinking > 0 && !NO_BLINK[st.face], st.frame);
  }
  function computeLoop(name, out, t, sp) {
    (POSE[name] || POSE.idle)(out, t, st.ph, sp);
  }

  const api = {
    group, height: 0, handR, handL, chest,
    get anim() { return st.anim; },
    get face() { return st.face; },
    setAnim(name) {
      if (!POSE[name]) name = 'idle';
      if (name === st.anim) return;
      st.prev = st.anim; st.tP = st.tA; st.anim = name; st.tA = 0; st.blend = 0;
    },
    playOnce(name, onDone) {
      const s = SHOT[name];
      if (!s) { if (onDone) onDone(); return 0; }
      st.shot = s; st.shotT = 0; st.shotCb = onDone || null;
      return s.dur;
    },
    setFace(name) {
      if (FACES.indexOf(name) < 0) name = 'normal';
      if (name === st.face) return;
      st.face = name; st.frame = 0; applyFace();
    },
    hold(obj, { both = false } = {}) {
      if (!obj) {
        for (const a of [handR, chest]) for (let i = a.children.length - 1; i >= 0; i--) a.remove(a.children[i]);
        return;
      }
      const anchor = both ? chest : handR;
      anchor.add(obj);
      obj.position.set(0, both ? 0 : -0.05, both ? 0 : 0.02);
      obj.rotation.set(0, 0, 0);
    },
    lookAt(v) { st.look = v ? (st.look || new THREE.Vector3()).copy(v) : null; },
    // KO props: glasses on/off the face, bump size 0..1 (+ overshoot), tie flopping 0..1
    get hasGlasses() { return !!glassesB; },
    setGlasses(on) { if (glassesB) glassesB.scale.setScalar(on ? 1 : HIDE); },
    setBump(k) { bumpB.scale.setScalar(k > 0.01 ? k : HIDE); },
    setTieFlop(k) { tieFlop = k; if (tieB && k <= 0) tieB.rotation.set(0, 0, 0); },
    update(dt, speed = 0) {
      if (dt > 0.1) dt = 0.1;
      st.tA += dt; st.tP += dt;
      const run = st.anim === 'run' || st.anim === 'flee' || speed > 3.2;
      st.ph += dt * (run ? max(9, speed * 3.4) : (speed > 0.05 ? max(5, speed * 6.4) : (st.anim === 'walk' ? 6.5 : 0)));
      if (st.ph > 1000) st.ph -= 2 * PI * 150;
      // face timers
      if (!NO_BLINK[st.face]) {
        if (st.blinking > 0) { st.blinking -= dt; if (st.blinking <= 0) applyFace(); }
        else { st.blinkT -= dt; if (st.blinkT <= 0) { st.blinking = 0.11; st.blinkT = 1.8 + rnd() * 3.2; applyFace(); } }
      }
      if (st.face === 'endure') {
        st.frameT -= dt;
        if (st.frameT <= 0) { st.frame = st.frame ? 0 : 1; st.frameT = st.frame ? 0.14 : 0.35 + rnd() * 0.8; applyFace(); }
      }
      // loop pose (+ cross-blend)
      computeLoop(st.anim, P0, st.tA, speed);
      if (st.blend < 1) {
        st.blend = min(1, st.blend + dt / 0.15);
        computeLoop(st.prev, P1, st.tP, speed);
        const w = st.blend * st.blend * (3 - 2 * st.blend);
        for (let i = 0; i < NCH; i++) P0[i] = P1[i] + (P0[i] - P1[i]) * w;
      }
      // one-shot overlay
      if (st.shot) {
        const s = st.shot;
        st.shotT += dt;
        const t = st.shotT;
        if (t >= s.dur) {
          st.shot = null; const cb = st.shotCb; st.shotCb = null; if (cb) cb();
        } else {
          PS.set(P0);
          s.fn(PS, t);
          const w = min(1, s.inT > 0 ? t / s.inT : 1, (s.dur - t) / s.outT);
          for (let i = 0; i < NCH; i++) P0[i] += (PS[i] - P0[i]) * w;
        }
      }
      // look-at
      let ty = 0, tp = 0;
      if (st.look) {
        tmpV.copy(st.look); group.worldToLocal(tmpV);
        const dx = tmpV.x, dz = tmpV.z, dy = tmpV.y - 1.17;
        let yaw = Math.atan2(dx, dz);
        if (abs(yaw) < 2.4) {
          ty = yaw > 1.2 ? 1.2 : yaw < -1.2 ? -1.2 : yaw;
          tp = -Math.atan2(dy, Math.hypot(dx, dz)); tp = tp > 0.45 ? 0.45 : tp < -0.5 ? -0.5 : tp;
        }
      }
      const k = min(1, dt * 8);
      st.lyaw += (ty - st.lyaw) * k; st.lpitch += (tp - st.lpitch) * k;
      P0[HY] += st.lyaw * 0.75; P0[SPY] += st.lyaw * 0.25; P0[HX] += st.lpitch;
      // apply
      const p = P0;
      body.position.set(0, p[BY], p[BZ]);
      body.rotation.set(p[BRX], p[BRY], p[BRZ]);
      const q = p[SQ] > 0.3 ? p[SQ] : 0.3, iq = 1 / Math.sqrt(q);
      body.scale.set(iq, q, iq);
      spine.rotation.set(p[SPX], p[SPY], p[SPZ]);
      neck.rotation.set(p[HX], p[HY], p[HZ]);
      arms[0].rotation.set(p[LSX], -p[LSY], p[LSZ]); arms[1].rotation.x = p[LEX];
      arms[2].rotation.set(p[RSX], p[RSY], -p[RSZ]); arms[3].rotation.x = p[REX];
      legs[0].rotation.set(p[LHX], 0, p[LHZ]); legs[1].rotation.x = p[LKX]; legs[2].rotation.x = p[LFX];
      legs[3].rotation.set(p[RHX], 0, -p[RHZ]); legs[4].rotation.x = p[RKX]; legs[5].rotation.x = p[RFX];
      phoneM.visible = st.anim === 'phone' && handR.children.length === 1 && st.blend > 0.5;
      if (tieB && tieFlop > 0) tieB.rotation.set(-tieFlop * (0.9 + sin(st.tA * 2.3) * 0.15), 0, tieFlop * (1.1 + sin(st.tA * 3.1) * 0.3));
    },
    dispose() {
      if (group.parent) group.parent.remove(group);
      faceMat.dispose();
      skinned.skeleton.dispose();
    },
  };
  api.update(0, 0);
  group.updateMatrixWorld(true);
  api.height = +new THREE.Box3().setFromObject(group).max.y.toFixed(3);
  return api;
}
const _tmpV = new THREE.Vector3();
