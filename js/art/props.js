// 회사 뿌개기 — procedural props. Origin = centre of the bottom face of the bounds, front faces +Z.
// Geometry/materials are shared through module caches: never dispose a prop's geometry/material.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tex, canvasTex, rng, KFONT } from './tex.js';

const PI = Math.PI;
// ---------------------------------------------------------------- caches & helpers
const MATS = new Map();
function M(color, rough = 0.7, metal = 0, extra = null, key = '') {
  const k = color + '|' + rough + '|' + metal + '|' + key + (extra && !key ? JSON.stringify(extra, (n, v) => (v && v.isTexture ? v.uuid : v)) : '');
  let m = MATS.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra || {})); MATS.set(k, m); }
  return m;
}
const GEOS = new Map();
function G(key, make) { let g = GEOS.get(key); if (!g) { g = make(); GEOS.set(key, g); } return g; }
const boxG = (w, h, d) => G(`bx${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const rboxG = (w, h, d, r, s = 1) => G(`rb${w},${h},${d},${r},${s}`, () => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
const cylG = (rt, rb, h, s = 14, open = false, ts = 0, tl = PI * 2) => G(`cy${rt},${rb},${h},${s},${open},${ts},${tl}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open, ts, tl));
const sphG = (w = 12, h = 8) => G(`sp${w},${h}`, () => new THREE.SphereGeometry(1, w, h));
const planeG = (w, h) => G(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h));
const torG = (r, t, rs = 6, ts = 16, arc = PI * 2) => G(`to${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
// box by size; y is the BOTTOM of the box (easier stacking)
const B = (p, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => add(p, boxG(w, h, d), mat, x, y + h / 2, z, rx, ry, rz);
const RB = (p, w, h, d, r, mat, x, y, z, s = 1, rx = 0, ry = 0, rz = 0) => add(p, rboxG(w, h, d, r, s), mat, x, y + h / 2, z, rx, ry, rz);
const C = (p, rt, rb, h, mat, x, y, z, seg = 14, rx = 0, ry = 0, rz = 0) => add(p, cylG(rt, rb, h, seg), mat, x, y + h / 2, z, rx, ry, rz);
const S = (p, mat, x, y, z, sx, sy = sx, sz = sx, w = 12, h = 8) => add(p, sphG(w, h), mat, x, y, z, 0, 0, 0, sx, sy, sz);
const noShadow = (m) => { m.castShadow = false; return m; };
const dyn = (o) => { o.userData.dyn = true; return o; };

function shade(hex, amt) {
  const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return '#' + c.getHexString();
}
const texMat = (key, w, h, draw, extra = {}, rough = 0.7) => {
  const t = canvasTex(key, w, h, draw);
  return M('#ffffff', rough, 0, Object.assign({ map: t }, extra), 'tx:' + key + JSON.stringify(Object.keys(extra)));
};
const glowMat = (key, w, h, draw, intensity = 0.9) => {
  const t = canvasTex(key, w, h, draw);
  return M('#ffffff', 0.4, 0, { map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: intensity }, 'gl:' + key + intensity);
};
function rrect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }

// shared palette
const P = {
  wood: '#d8b88a', woodD: '#b88f5e', grey: '#bfc2c6', greyD: '#8f949b', dark: '#2b2d33', black: '#1b1c20',
  white: '#f3f3f1', steel: '#c3c7cc', blue: '#2f5fa8', yellow: '#e2b43c', green: '#4f9a4a', greenD: '#2f7a3a',
};

// ---------------------------------------------------------------- shared textures
const T = {
  screenOffice: () => glowMat('scrOffice', 256, 160, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2b4f86'); g.addColorStop(1, '#1b2d52');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#eef2f7'; x.fillRect(18, 14, 220, 126);
    x.fillStyle = '#2f6fd6'; x.fillRect(18, 14, 220, 14);
    x.fillStyle = '#fff'; x.font = `bold 10px ${KFONT}`; x.fillText('주간보고_최종_진짜최종', 24, 25);
    x.strokeStyle = '#c9d2de'; x.lineWidth = 1;
    for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(18, 40 + i * 11); x.lineTo(238, 40 + i * 11); x.stroke(); }
    for (let j = 0; j < 5; j++) { x.beginPath(); x.moveTo(60 + j * 40, 30); x.lineTo(60 + j * 40, 140); x.stroke(); }
    x.fillStyle = '#9fb3cc'; for (let i = 0; i < 8; i++) x.fillRect(24, 42 + i * 11, 26 + (i * 7) % 12, 5);
    x.fillStyle = '#e8a33a'; x.fillRect(170, 100, 10, 30); x.fillStyle = '#3f8fd6'; x.fillRect(184, 88, 10, 42); x.fillStyle = '#5bb36a'; x.fillRect(198, 76, 10, 54);
    x.fillStyle = '#1b2d52'; x.fillRect(0, 148, w, 12);
  }, 0.75),
  paperDoc: () => texMat('paperDoc', 128, 180, (x, w, h) => {
    x.fillStyle = '#fbfbf8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#333'; x.font = `bold 11px ${KFONT}`; x.fillText('업무 보고서', 30, 20);
    x.fillStyle = '#9aa3ad'; for (let i = 0; i < 6; i++) x.fillRect(14, 32 + i * 8, 100 - (i % 3) * 14, 3);
    x.strokeStyle = '#b8c0c9'; x.strokeRect(14, 84, 100, 40);
    x.fillStyle = '#6fa0d8'; x.fillRect(20, 108, 12, 12); x.fillRect(38, 98, 12, 22); x.fillStyle = '#e39a5a'; x.fillRect(56, 92, 12, 28);
    x.fillStyle = '#9aa3ad'; for (let i = 0; i < 5; i++) x.fillRect(14, 134 + i * 8, 96 - (i % 2) * 20, 3);
  }, {}, 0.85),
  fabric: (color) => texMat('fabric' + color, 128, 128, (x, w, h) => {
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    const r = rng(17);
    for (let i = 0; i < 2500; i++) { x.fillStyle = r() < 0.5 ? shade(color, -0.06) : shade(color, 0.05); x.fillRect(r() * w, r() * h, 1.2, 1.2); }
  }, {}, 0.95),
  meshBack: () => texMat('meshBack', 64, 64, (x, w, h) => {
    x.fillStyle = '#34373d'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#4b4f57'; x.lineWidth = 1;
    for (let i = 0; i < w; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  }, {}, 0.8),
};

// ---------------------------------------------------------------- builders
// each: (g, o) => { name, mass, price, material, set? }
const D = {};

D.desk = (g) => {
  const top = M(P.wood, 0.55), body = M('#bdbfc2', 0.6), front = M('#c9cbce', 0.55), hd = M('#7d828a', 0.4, 0.3);
  RB(g, 1.5, 0.035, 0.75, 0.012, top, 0, 0.715, 0);
  B(g, 0.42, 0.7, 0.64, body, 0.52, 0.015, 0);
  for (let i = 0; i < 3; i++) {
    B(g, 0.39, 0.205, 0.012, front, 0.52, 0.035 + i * 0.225, 0.322);
    B(g, 0.12, 0.016, 0.018, hd, 0.52, 0.19 + i * 0.225, 0.333);
  }
  B(g, 0.035, 0.715, 0.64, body, -0.71, 0, 0);
  B(g, 0.03, 0.015, 0.7, hd, -0.71, 0, 0);
  B(g, 1.0, 0.4, 0.02, body, -0.18, 0.28, -0.3);
  return { name: '책상', mass: 45, price: 24000, material: 'wood' };
};
D.deskL = (g) => {
  const top = M(P.wood, 0.55), body = M('#bdbfc2', 0.6), front = M('#c9cbce', 0.55), hd = M('#7d828a', 0.4, 0.3);
  RB(g, 1.6, 0.035, 0.75, 0.012, top, 0, 0.715, 0);
  RB(g, 0.6, 0.035, 0.85, 0.012, top, -0.5, 0.715, 0.8);
  B(g, 0.42, 0.7, 0.64, body, 0.57, 0.015, 0);
  for (let i = 0; i < 3; i++) { B(g, 0.39, 0.205, 0.012, front, 0.57, 0.035 + i * 0.225, 0.322); B(g, 0.12, 0.016, 0.018, hd, 0.57, 0.19 + i * 0.225, 0.333); }
  B(g, 0.6, 0.715, 0.035, body, -0.5, 0, 1.2);
  B(g, 0.035, 0.715, 0.64, body, -0.78, 0, 0);
  B(g, 1.1, 0.4, 0.02, body, -0.1, 0.28, -0.3);
  return { name: 'ㄱ자 책상', mass: 70, price: 39000, material: 'wood' };
};
D.chair = (g) => {
  const seat = M('#2d2f35', 0.85), frame = M('#26282d', 0.5), chrome = M('#9ea4ab', 0.35, 0.6);
  RB(g, 0.5, 0.075, 0.48, 0.03, seat, 0, 0.37, 0.02, 1);
  const back = new THREE.Group(); back.position.set(0, 0.47, -0.22); back.rotation.x = -0.12; g.add(back);
  RB(back, 0.46, 0.52, 0.04, 0.02, T.meshBack(), 0, 0.08, 0, 1);
  B(back, 0.46, 0.04, 0.05, frame, 0, 0.58, 0);
  B(back, 0.035, 0.6, 0.05, frame, 0.23, 0.02, 0); B(back, 0.035, 0.6, 0.05, frame, -0.23, 0.02, 0);
  B(g, 0.06, 0.25, 0.04, frame, 0, 0.3, -0.2);
  for (const s of [1, -1]) {
    B(g, 0.03, 0.18, 0.035, frame, s * 0.255, 0.43, 0.0);
    RB(g, 0.06, 0.025, 0.24, 0.01, frame, s * 0.255, 0.61, 0.02);
  }
  C(g, 0.03, 0.03, 0.27, chrome, 0, 0.1, 0, 10);
  C(g, 0.045, 0.06, 0.05, frame, 0, 0.07, 0, 10);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    const s = new THREE.Group(); s.rotation.y = a; g.add(s);
    B(s, 0.04, 0.03, 0.3, frame, 0, 0.055, 0.15, -0.12);
    S(s, frame, 0, 0.03, 0.3, 0.03, 0.03, 0.03, 6, 4);
  }
  return { name: '의자', mass: 12, price: 18000, material: 'plastic' };
};
D.monitor = (g) => {
  const bez = M(P.black, 0.45);
  RB(g, 0.56, 0.34, 0.03, 0.012, bez, 0, 0.15, 0);
  noShadow(add(g, planeG(0.53, 0.31), T.screenOffice(), 0, 0.32, 0.0155));
  B(g, 0.06, 0.03, 0.04, bez, 0, 0.17, -0.025);
  B(g, 0.045, 0.17, 0.03, bez, 0, 0.012, -0.04);
  RB(g, 0.24, 0.014, 0.17, 0.006, bez, 0, 0, -0.03);
  return { name: '모니터', mass: 5, price: 32000, material: 'glass' };
};
D.keyboard = (g) => {
  RB(g, 0.44, 0.022, 0.15, 0.008, M('#2a2b31', 0.6), 0, 0, 0);
  noShadow(add(g, planeG(0.42, 0.13), texMat('keys', 128, 40, (x, w, h) => {
    x.fillStyle = '#26272c'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#4a4c55';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 18; c++) x.fillRect(2 + c * 7 + (r % 2) * 2, 2 + r * 7.5, 5.5, 6);
    x.fillRect(30, 2 + 4 * 7.5, 50, 6);
  }), 0, 0.0225, 0, -PI / 2));
  return { name: '키보드', mass: 0.8, price: 6000, material: 'plastic' };
};
D.mouse = (g) => { S(g, M('#2a2b31', 0.45), 0, 0.016, 0, 0.033, 0.02, 0.055, 10, 6); return { name: '마우스', mass: 0.1, price: 2000, material: 'plastic' }; };
D.mug = (g, o) => {
  const col = o.color || '#f4f2ee';
  C(g, 0.042, 0.038, 0.1, M(col, 0.35), 0, 0, 0, 14);
  noShadow(C(g, 0.037, 0.037, 0.002, M('#4a2a17', 0.25), 0, 0.09, 0, 12));
  add(g, torG(0.028, 0.008, 5, 10, PI * 1.2), M(col, 0.35), 0.045, 0.05, 0, 0, 0, -PI * 0.6);
  return { name: '머그컵', mass: 0.3, price: 3000, material: 'ceramic' };
};
D.penCup = (g) => {
  C(g, 0.035, 0.035, 0.1, M('#3a3d44', 0.5), 0, 0, 0, 12);
  const cols = ['#d23a3a', '#2f6fd6', '#222', '#e6b422'];
  cols.forEach((c, i) => { const a = (i / 4) * PI * 2; C(g, 0.005, 0.005, 0.15, M(c, 0.5), Math.cos(a) * 0.015, 0.03, Math.sin(a) * 0.015, 6, Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15); });
  return { name: '펜꽂이', mass: 0.2, price: 1000, material: 'plastic' };
};
D.phone = (g) => {
  const b = M('#33363d', 0.5);
  RB(g, 0.2, 0.05, 0.19, 0.012, b, 0, 0, 0);
  RB(g, 0.17, 0.03, 0.12, 0.01, b, 0.02, 0.04, 0.02, 1, -0.25);
  RB(g, 0.045, 0.04, 0.19, 0.015, M('#2a2c32', 0.45), -0.075, 0.05, 0);
  noShadow(add(g, planeG(0.06, 0.025), M('#8fc0a0', 0.4, 0, { emissive: '#4d8a64', emissiveIntensity: 0.5 }), 0.04, 0.09, -0.03, -PI / 2 - 0.25));
  return { name: '전화기', mass: 1, price: 8000, material: 'plastic' };
};
D.smartphone = (g) => {
  RB(g, 0.075, 0.009, 0.15, 0.004, M('#1d2230', 0.35), 0, 0, 0);
  noShadow(add(g, planeG(0.066, 0.138), M('#6f9de0', 0.3, 0, { emissive: '#2f5fb0', emissiveIntensity: 0.5 }), 0, 0.0095, 0, -PI / 2));
  return { name: '휴대폰', mass: 0.2, price: 15000, material: 'glass' };
};
D.laptop = (g) => {
  const al = M('#b9bcc2', 0.4, 0.3);
  RB(g, 0.34, 0.018, 0.24, 0.008, al, 0, 0, 0);
  noShadow(add(g, planeG(0.3, 0.13), M('#2c2e34', 0.6), 0, 0.0185, 0.03, -PI / 2));
  const lid = new THREE.Group(); lid.position.set(0, 0.016, -0.115); lid.rotation.x = -0.32; g.add(lid);
  RB(lid, 0.34, 0.23, 0.012, 0.008, al, 0, 0, 0);
  noShadow(add(lid, planeG(0.31, 0.19), T.screenOffice(), 0, 0.115, 0.0065));
  return { name: '노트북', mass: 1.8, price: 45000, material: 'metal' };
};
function binderRow(g, n, x0, y0, z0, seed = 1) {
  const r = rng(seed);
  const cols = [P.blue, P.yellow, '#25467e', P.blue, '#ece6d6', P.yellow, '#3c7a5a'];
  const lab = M('#f6f3ea', 0.7), ring = M('#22252b', 0.5);
  for (let i = 0; i < n; i++) {
    const c = cols[(i + seed) % cols.length];
    const x = x0 + i * 0.068;
    const tilt = i === n - 1 && r() < 0.6 ? 0.12 : 0;
    const b = new THREE.Group(); b.position.set(x, y0, z0); b.rotation.z = -tilt; g.add(b);
    B(b, 0.062, 0.31, 0.27, M(c, 0.6), 0, 0, 0);
    B(b, 0.04, 0.09, 0.004, lab, 0, 0.17, 0.136);
    C(b, 0.011, 0.011, 0.004, ring, 0, 0.06, 0.137, 8, PI / 2);
  }
}
D.binders = (g, o) => { binderRow(g, o.n || 5, 0, 0, 0, o.seed || 1); return { name: '바인더', mass: 3, price: 3000, material: 'paper' }; };
D.binderStack = (g, o) => {
  const r = rng(o.seed || 4);
  const cols = [P.yellow, '#f2efe6', P.yellow, P.blue, '#f2efe6', P.yellow, '#efe3b0'];
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const h = 0.05 + r() * 0.02;
    RB(g, 0.32, h, 0.27, 0.006, M(cols[i], 0.65), (r() - 0.5) * 0.03, y, (r() - 0.5) * 0.03, 1, 0, (r() - 0.5) * 0.12);
    if (i % 2) B(g, 0.3, 0.012, 0.25, M('#fbfaf5', 0.9), (r() - 0.5) * 0.02, y + h, 0);
    y += h + (i % 2 ? 0.012 : 0);
  }
  return { name: '서류 더미', mass: 7, price: 4000, material: 'paper' };
};
D.paperStack = (g, o) => {
  const r = rng(o.seed || 2), pw = M('#f7f6f1', 0.9);
  let y = 0;
  for (let i = 0; i < 4; i++) { B(g, 0.21, 0.018, 0.297, pw, (r() - 0.5) * 0.02, y, (r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.15); y += 0.018; }
  noShadow(add(g, planeG(0.21, 0.297), T.paperDoc(), 0, y + 0.001, 0, -PI / 2, 0, 0.05));
  return { name: '서류 뭉치', mass: 2, price: 1000, material: 'paper' };
};
D.paperSheet = (g) => {
  add(g, boxG(0.21, 0.002, 0.297), M('#f7f6f1', 0.9), 0, 0.001, 0);
  noShadow(add(g, planeG(0.21, 0.297), T.paperDoc(), 0, 0.0021, 0, -PI / 2));
  return { name: '서류', mass: 0.005, price: 100, material: 'paper' };
};
D.paperBall = (g, o) => {
  const v = (o.seed || 0) % 3;
  const geo = G('pball' + v, () => {
    const ge = new THREE.IcosahedronGeometry(0.045, 1);
    const p = ge.attributes.position, r = rng(31 + v);
    const map = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
      if (!map.has(k)) map.set(k, 0.75 + r() * 0.45);
      const s = map.get(k);
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
    }
    ge.computeVertexNormals();
    return ge;
  });
  add(g, geo, M('#f4f3ee', 0.95, 0, { flatShading: true }), 0, 0.045, 0);
  return { name: '구겨진 종이', mass: 0.005, price: 10, material: 'paper' };
};
D.partition = (g, o) => {
  const w = o.w || 1.5, h = o.h || 1.15;
  const al = M('#c9ccd0', 0.4, 0.3);
  B(g, w - 0.06, h - 0.06, 0.055, T.fabric('#8f9bb1'), 0, 0.03, 0);
  B(g, w, 0.035, 0.065, al, 0, h - 0.035, 0);
  B(g, 0.035, h, 0.065, al, w / 2 - 0.0175, 0, 0); B(g, 0.035, h, 0.065, al, -w / 2 + 0.0175, 0, 0);
  B(g, w, 0.04, 0.06, M('#6f747c', 0.6), 0, 0, 0);
  return { name: '파티션', mass: 15, price: 22000, material: 'soft' };
};
function drawerFronts(g, w, n, hTot, y0, z, col, hd) {
  const dh = hTot / n;
  for (let i = 0; i < n; i++) {
    B(g, w - 0.03, dh - 0.02, 0.012, col, 0, y0 + i * dh + 0.01, z);
    B(g, Math.min(0.16, w * 0.35), 0.025, 0.02, hd, 0, y0 + i * dh + dh - 0.07, z + 0.012);
  }
}
D.cabinet = (g) => {
  const b = M('#c4c6c9', 0.55), f = M('#cfd1d4', 0.5), hd = M('#7b8088', 0.4, 0.3);
  B(g, 0.45, 0.72, 0.6, b, 0, 0, 0);
  drawerFronts(g, 0.45, 2, 0.68, 0.02, 0.3, f, hd);
  return { name: '서랍장', mass: 25, price: 16000, material: 'metal' };
};
D.cabinetTall = (g) => {
  const b = M('#c4c6c9', 0.55), f = M('#cfd1d4', 0.5), hd = M('#7b8088', 0.4, 0.3);
  B(g, 0.9, 1.8, 0.45, b, 0, 0, 0);
  drawerFronts(g, 0.9, 4, 1.74, 0.03, 0.225, f, hd);
  return { name: '캐비닛', mass: 60, price: 38000, material: 'metal' };
};
D.shelf = (g, o) => {
  const b = M('#b9bcc0', 0.55);
  const w = 0.9, h = 1.8, d = 0.38;
  B(g, 0.025, h, d, b, -w / 2 + 0.0125, 0, 0); B(g, 0.025, h, d, b, w / 2 - 0.0125, 0, 0);
  B(g, w, h, 0.015, b, 0, 0, -d / 2 + 0.0075);
  for (let i = 0; i < 5; i++) B(g, w, 0.025, d, b, 0, i * 0.44, 0);
  binderRow(g, 9, -0.38, 0.025, 0.02, o.seed || 3);
  binderRow(g, 6, -0.38, 0.465, 0.02, (o.seed || 3) + 2);
  RB(g, 0.3, 0.22, 0.3, 0.01, M('#c49a63', 0.85), 0.25, 0.465, 0.0);
  binderRow(g, 4, 0.1, 0.905, 0.02, (o.seed || 3) + 4);
  RB(g, 0.32, 0.25, 0.3, 0.01, M('#c49a63', 0.85), -0.2, 1.345, 0.0);
  return { name: '책장', mass: 40, price: 26000, material: 'metal' };
};
D.printer = (g) => {
  const body = M('#d7d8da', 0.5), body2 = M('#c3c5c8', 0.5), dark = M('#3a3d44', 0.55), seam = M('#9a9ea5', 0.5);
  RB(g, 0.64, 0.06, 0.6, 0.01, dark, 0, 0, 0);
  RB(g, 0.62, 0.48, 0.58, 0.015, body, 0, 0.06, 0, 1);
  // lower paper drawers (fixed)
  for (let i = 0; i < 2; i++) { B(g, 0.58, 0.004, 0.01, seam, 0, 0.17 + i * 0.13, 0.291); B(g, 0.14, 0.03, 0.012, body2, 0, 0.1 + i * 0.13, 0.292); }
  // middle body, output recess
  RB(g, 0.62, 0.22, 0.58, 0.015, body, 0, 0.665, 0, 1);
  B(g, 0.5, 0.11, 0.5, M('#55595f', 0.7), -0.03, 0.56, 0.05);
  noShadow(B(g, 0.38, 0.008, 0.28, M('#f4f3ee', 0.9), -0.05, 0.57, 0.06));
  B(g, 0.62, 0.025, 0.58, body2, 0, 0.885, 0);
  // scanner + document feeder
  RB(g, 0.62, 0.1, 0.58, 0.015, body, 0, 0.91, 0, 1);
  RB(g, 0.48, 0.07, 0.4, 0.02, M('#e2e3e4', 0.5), -0.04, 1.01, -0.04, 1);
  B(g, 0.3, 0.012, 0.22, M('#bfc1c4', 0.5), -0.04, 1.08, -0.04, -0.1);
  // control panel
  const pan = new THREE.Group(); pan.position.set(0.18, 0.96, 0.3); pan.rotation.x = 0.45; g.add(pan);
  RB(pan, 0.26, 0.03, 0.14, 0.01, M('#5a5e66', 0.5), 0, 0, 0);
  noShadow(add(pan, planeG(0.11, 0.07), glowMat('mfpScr', 64, 40, (x, w, h) => {
    x.fillStyle = '#2f7fd6'; x.fillRect(0, 0, w, h); x.fillStyle = '#d8ecff'; x.fillRect(4, 4, 56, 8); x.fillRect(4, 16, 24, 18); x.fillRect(32, 16, 28, 18);
  }, 0.8), -0.02, 0.031, 0, -PI / 2));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) C(pan, 0.008, 0.008, 0.006, M('#e9ebee', 0.4), 0.065 + i * 0.02, 0.03, -0.025 + j * 0.03, 6);
  const light = noShadow(add(pan, sphG(8, 6), new THREE.MeshStandardMaterial({ color: '#ffb02e', emissive: '#ff8a00', emissiveIntensity: 0.2, roughness: 0.3 }), 0.115, 0.035, 0.045, 0, 0, 0, 0.012));
  dyn(light);
  // side bypass tray
  B(g, 0.02, 0.18, 0.3, body2, 0.32, 0.4, 0.0);
  // main paper drawer (top tray) — slides on jam
  const dr = dyn(new THREE.Group()); g.add(dr);
  RB(dr, 0.6, 0.13, 0.02, 0.008, body2, 0, 0.37, 0.29);
  B(dr, 0.16, 0.03, 0.012, M('#a9adb2', 0.5), 0, 0.46, 0.3);
  const inside = new THREE.Group(); dr.add(inside);
  B(inside, 0.56, 0.1, 0.012, body2, 0, 0.385, 0.0);
  B(inside, 0.012, 0.1, 0.3, body2, 0.28, 0.385, 0.14); B(inside, 0.012, 0.1, 0.3, body2, -0.28, 0.385, 0.14);
  B(inside, 0.56, 0.012, 0.3, body2, 0, 0.385, 0.14);
  B(inside, 0.3, 0.04, 0.25, M('#f7f6f1', 0.9), 0, 0.397, 0.14);
  const crumple = new THREE.Group(); inside.add(crumple);
  const pm = M('#f4f3ee', 0.95, 0, { flatShading: true });
  const pg = G('crumple', () => new THREE.IcosahedronGeometry(0.04, 1));
  add(crumple, pg, pm, 0.05, 0.47, 0.15, 0.3, 0.2, 0, 1.4, 1.0, 1.6);
  add(crumple, pg, pm, -0.06, 0.465, 0.1, 0, 0.5, 0.2, 1.1, 0.8, 1.2);
  add(crumple, pg, pm, 0.12, 0.46, 0.08, 0.7, 0.1, 0.4, 1.0, 0.8, 1.1);
  B(crumple, 0.22, 0.004, 0.26, M('#f7f6f1', 0.9), -0.02, 0.44, 0.16, 0.35, 0.2, 0.15);
  inside.visible = false;
  let state = 'ok';
  light.onBeforeRender = () => {
    if (state === 'jam') light.material.emissiveIntensity = (performance.now() % 600) < 300 ? 2.2 : 0.15;
  };
  return {
    name: '복합기', mass: 90, price: 120000, material: 'plastic',
    set(s) {
      state = s === 'jam' ? 'jam' : 'ok';
      dr.position.z = state === 'jam' ? 0.24 : 0;
      inside.visible = state === 'jam';
      light.material.color.set(state === 'jam' ? '#ffb02e' : '#7be07b');
      light.material.emissive.set(state === 'jam' ? '#ff8a00' : '#3cc03c');
      light.material.emissiveIntensity = state === 'jam' ? 2 : 0.8;
    },
  };
};
D.paperBox = (g) => {
  const side = texMat('paperBoxSide', 128, 64, (x, w, h) => {
    x.fillStyle = '#f5f5f2'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#3b6fc0'; x.fillRect(0, 20, w, 6); x.fillRect(0, 44, w, 6);
    x.fillStyle = '#3b6fc0'; x.font = `bold 11px ${KFONT}`; x.fillText('A4 복사용지', 34, 39);
  }, {}, 0.8);
  RB(g, 0.45, 0.28, 0.3, 0.01, side, 0, 0, 0);
  B(g, 0.46, 0.04, 0.31, M('#f0f0ec', 0.8), 0, 0.26, 0);
  return { name: '복사용지 박스', mass: 5, price: 8000, material: 'paper' };
};
D.waterCooler = (g) => {
  const w = M('#eef0f1', 0.45), d = M('#5d636b', 0.5);
  RB(g, 0.3, 1.0, 0.32, 0.03, w, 0, 0, 0, 2);
  B(g, 0.2, 0.22, 0.02, d, 0, 0.6, 0.155);
  C(g, 0.015, 0.015, 0.04, M('#d33', 0.4), -0.05, 0.75, 0.17, 8); C(g, 0.015, 0.015, 0.04, M('#36c', 0.4), 0.05, 0.75, 0.17, 8);
  B(g, 0.2, 0.02, 0.08, M('#9aa0a7', 0.4, 0.3), 0, 0.6, 0.18);
  const glass = M('#8cc7ee', 0.08, 0, { transparent: true, opacity: 0.55 }, 'bottle');
  noShadow(C(g, 0.06, 0.06, 0.05, glass, 0, 1.0, 0, 14));
  const bot = add(g, cylG(0.13, 0.13, 0.32, 18), glass, 0, 1.24, 0);
  bot.castShadow = false;
  S(g, glass, 0, 1.08, 0, 0.13, 0.05, 0.13, 16, 6).castShadow = false;
  S(g, glass, 0, 1.4, 0, 0.13, 0.05, 0.13, 16, 6).castShadow = false;
  return { name: '정수기', mass: 20, price: 30000, material: 'plastic' };
};
D.whiteboard = (g) => {
  const al = M('#c7cbd0', 0.35, 0.4);
  const board = texMat('wbChart', 384, 256, (x, w, h) => {
    x.fillStyle = '#fbfbf9'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#2b4fa8'; x.fillStyle = '#2b4fa8'; x.lineWidth = 2.5;
    x.font = `bold 22px ${KFONT}`; x.fillText('주간 목표', 18, 34);
    x.beginPath(); x.moveTo(16, 42); x.lineTo(130, 40); x.stroke();
    x.font = `15px ${KFONT}`; x.fillStyle = '#333';
    x.fillText('1. 매출 20% ↑', 20, 70); x.fillText('2. 회의 줄이기?', 20, 96); x.fillText('3. 야근 금지 (?!)', 20, 122);
    x.fillStyle = '#d23a3a'; x.fillText('→ 금요일까지!!', 30, 150);
    // chart
    x.strokeStyle = '#333'; x.lineWidth = 2; x.beginPath(); x.moveTo(220, 40); x.lineTo(220, 200); x.lineTo(360, 200); x.stroke();
    x.fillStyle = '#5b8fd6'; [[232, 60], [256, 80], [280, 70], [304, 110], [328, 130]].forEach(([bx, bh]) => x.fillRect(bx, 200 - bh, 16, bh));
    x.strokeStyle = '#d23a3a'; x.lineWidth = 3; x.beginPath(); x.moveTo(230, 170); x.lineTo(262, 150); x.lineTo(290, 158); x.lineTo(320, 100); x.lineTo(350, 70); x.stroke();
    x.beginPath(); x.moveTo(350, 70); x.lineTo(338, 72); x.moveTo(350, 70); x.lineTo(347, 82); x.stroke();
    x.fillStyle = '#ffe37a'; x.fillRect(30, 180, 60, 50); x.fillStyle = '#ffb3c7'; x.fillRect(100, 190, 55, 45);
    x.fillStyle = '#555'; x.font = `12px ${KFONT}`; x.fillText('회의 3시', 36, 205); x.fillText('보고서!', 106, 215);
  }, {}, 0.35);
  RB(g, 1.2, 0.8, 0.03, 0.01, M('#fbfbf9', 0.3), 0, 0.95, 0);
  noShadow(add(g, planeG(1.16, 0.76), board, 0, 1.35, 0.0155));
  B(g, 1.22, 0.025, 0.04, al, 0, 1.74, 0); B(g, 1.22, 0.025, 0.04, al, 0, 0.935, 0);
  B(g, 0.025, 0.83, 0.04, al, 0.6, 0.935, 0); B(g, 0.025, 0.83, 0.04, al, -0.6, 0.935, 0);
  B(g, 0.5, 0.02, 0.07, al, 0, 0.93, 0.04);
  add(g, cylG(0.008, 0.008, 0.1, 6), M('#2b4fa8', 0.5), -0.1, 0.958, 0.05, 0, 0, PI / 2);
  for (const s of [1, -1]) {
    B(g, 0.035, 1.8, 0.035, al, s * 0.64, 0.03, 0);
    B(g, 0.04, 0.03, 0.5, al, s * 0.64, 0.02, 0);
    S(g, M('#33363c', 0.6), s * 0.64, 0.02, 0.22, 0.022, 0.022, 0.022, 8, 6); S(g, M('#33363c', 0.6), s * 0.64, 0.02, -0.22, 0.022, 0.022, 0.022, 8, 6);
  }
  return { name: '화이트보드', mass: 12, price: 15000, material: 'plastic' };
};
D.trashcan = (g) => {
  const meshT = canvasTex('binMesh', 64, 64, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 2.2;
    for (let i = 0; i < w; i += 6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); x.beginPath(); x.moveTo(i, 0); x.lineTo(i - h, h); x.stroke(); }
    x.beginPath(); x.moveTo(-64, 0); x.lineTo(0, 64); x.stroke(); x.beginPath(); x.moveTo(128, 0); x.lineTo(64, 64); x.stroke();
  });
  meshT.wrapS = meshT.wrapT = THREE.RepeatWrapping; meshT.repeat.set(5, 3);
  const mm = M('#3d4047', 0.5, 0.3, { alphaMap: meshT, alphaTest: 0.5, side: THREE.DoubleSide }, 'binmesh');
  add(g, cylG(0.15, 0.12, 0.34, 18, true), mm, 0, 0.17, 0);
  C(g, 0.12, 0.12, 0.01, M('#3d4047', 0.5, 0.3), 0, 0, 0, 16);
  add(g, torG(0.15, 0.008, 5, 20), M('#3d4047', 0.4, 0.4), 0, 0.34, 0, PI / 2);
  add(g, torG(0.12, 0.008, 5, 20), M('#3d4047', 0.4, 0.4), 0, 0.01, 0, PI / 2);
  return { name: '휴지통', mass: 1.5, price: 3000, material: 'metal' };
};
// foliage: merged leaf cluster (cached per variant)
function leaves(g, variant, n, h0, h1, spread, leafS, cols) {
  const geos = G('leaf:' + variant, () => {
    const r = rng(variant.length * 13 + n);
    const base = new THREE.SphereGeometry(1, 6, 3).toNonIndexed();
    const lists = cols.map(() => []);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const y = h0 + (h1 - h0) * Math.pow(r(), 0.7);
      const a = r() * PI * 2;
      const rad = spread * (0.35 + 0.65 * Math.sin(Math.min(1, (y - h0) / (h1 - h0 + 1e-6)) * PI * 0.9 + 0.3)) * (0.6 + r() * 0.5);
      pv.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      e.set(-0.5 - r() * 0.6, -a + PI / 2, (r() - 0.5) * 0.6, 'YXZ');
      q.setFromEuler(e);
      const s = leafS * (0.75 + r() * 0.5);
      sv.set(s * 0.58, s * 0.08, s);
      m4.compose(pv, q, sv);
      // offset leaf so it extends outward from its stem point
      const lg = base.clone(); lg.translate(0, 0, 0.8); lg.applyMatrix4(m4);
      lists[(i + (t > 0.5 ? 1 : 0)) % cols.length].push(lg);
    }
    return lists.map((l) => mergeGeometries(l));
  });
  geos.forEach((ge, i) => add(g, ge, M(cols[i], 0.65, 0, { side: THREE.DoubleSide }, 'leaf' + cols[i])));
}
D.plant = (g) => {
  C(g, 0.2, 0.16, 0.42, M('#f1efea', 0.6), 0, 0, 0, 18);
  noShadow(C(g, 0.18, 0.18, 0.01, M('#4a3426', 0.9), 0, 0.395, 0, 14));
  C(g, 0.015, 0.02, 0.5, M('#6b5a3a', 0.8), 0, 0.4, 0, 6);
  leaves(g, 'plant', 42, 0.55, 1.25, 0.34, 0.16, ['#4c9a45', '#2f7a36', '#62ad4f']);
  return { name: '화분', mass: 8, price: 12000, material: 'plant' };
};
D.plantBig = (g) => {
  C(g, 0.24, 0.2, 0.5, M('#e9e6df', 0.6), 0, 0, 0, 18);
  noShadow(C(g, 0.22, 0.22, 0.01, M('#4a3426', 0.9), 0, 0.475, 0, 14));
  C(g, 0.025, 0.035, 1.2, M('#6b5a3a', 0.8), 0, 0.48, 0, 6);
  C(g, 0.015, 0.02, 0.5, M('#6b5a3a', 0.8), 0.05, 0.9, 0.0, 6, 0, 0, -0.5);
  leaves(g, 'plantBig', 46, 0.75, 1.95, 0.45, 0.2, ['#3f8f3f', '#2a6e33', '#5aa64a']);
  return { name: '큰 화분', mass: 15, price: 25000, material: 'plant' };
};
D.plantSmall = (g) => {
  C(g, 0.06, 0.05, 0.09, M('#f1efea', 0.5), 0, 0, 0, 12);
  noShadow(C(g, 0.055, 0.055, 0.005, M('#4a3426', 0.9), 0, 0.085, 0, 10));
  leaves(g, 'plantSmall', 16, 0.1, 0.22, 0.07, 0.05, ['#5aa64a', '#3c8a3c']);
  return { name: '작은 화분', mass: 0.5, price: 3000, material: 'plant' };
};
D.frame = (g) => {
  const pic = texMat('framePic', 160, 120, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7e8fc0'); gr.addColorStop(0.6, '#d9a6b5'); gr.addColorStop(1, '#f2c9a0');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = '#6d6f97'; const r = rng(5);
    let px = 0; while (px < w) { const bw = 8 + r() * 14, bh = 20 + r() * 50; x.fillRect(px, h - bh, bw, bh); px += bw + 1; }
    x.fillStyle = '#545780'; x.fillRect(40, 30, 3, 40);
  }, {}, 0.6);
  RB(g, 0.6, 0.45, 0.03, 0.006, M('#7a5534', 0.6), 0, 0, 0);
  noShadow(add(g, planeG(0.52, 0.37), pic, 0, 0.225, 0.0155));
  return { name: '액자', mass: 1.5, price: 9000, material: 'wood' };
};
D.calendar = (g) => {
  const page = texMat('calPage', 96, 72, (x, w, h) => {
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d23a3a'; x.fillRect(0, 0, w, 16);
    x.fillStyle = '#fff'; x.font = `bold 12px ${KFONT}`; x.fillText('11월', 34, 13);
    x.fillStyle = '#555';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) { x.fillStyle = c === 0 ? '#d23a3a' : '#666'; x.fillRect(6 + c * 12.5, 22 + r * 12, 6, 6); }
    x.strokeStyle = '#d23a3a'; x.lineWidth = 2; x.beginPath(); x.arc(59, 37, 6, 0, 7); x.stroke();
  }, {}, 0.7);
  const f = new THREE.Group(); f.rotation.x = -0.32; f.position.z = 0.035; g.add(f);
  B(f, 0.18, 0.14, 0.004, M('#fff', 0.7), 0, 0, 0);
  noShadow(add(f, planeG(0.17, 0.13), page, 0, 0.07, 0.0025));
  const b = new THREE.Group(); b.rotation.x = 0.32; b.position.z = -0.035; g.add(b);
  B(b, 0.18, 0.14, 0.004, M('#3a3d44', 0.6), 0, 0, 0);
  add(g, cylG(0.006, 0.006, 0.18, 6), M('#888', 0.4, 0.5), 0, 0.132, 0, 0, 0, PI / 2);
  return { name: '탁상 달력', mass: 0.2, price: 1000, material: 'paper' };
};
function sofa(g, col) {
  const m = M(col, 0.9), base = M(shade(col, -0.12), 0.85), leg = M('#2b2b2b', 0.5);
  RB(g, 1.8, 0.2, 0.8, 0.04, base, 0, 0.06, 0, 1);
  for (const s of [-1, 1]) RB(g, 0.72, 0.14, 0.6, 0.06, m, s * 0.37, 0.26, 0.08, 2);
  RB(g, 1.8, 0.42, 0.2, 0.08, m, 0, 0.26, -0.3, 2);
  for (const s of [-1, 1]) RB(g, 0.18, 0.5, 0.8, 0.07, m, s * 0.81, 0.06, 0, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.05, 0.06, 0.05, leg, sx * 0.82, 0, sz * 0.34);
}
D.sofa = (g) => { sofa(g, '#9ba2ae'); return { name: '소파', mass: 50, price: 60000, material: 'soft' }; };
D.sofaYellow = (g) => { sofa(g, '#d7a93a'); return { name: '노란 소파', mass: 50, price: 60000, material: 'soft' }; };
D.roundTable = (g) => {
  C(g, 0.4, 0.4, 0.03, M('#f4f2ee', 0.4), 0, 0.71, 0, 28);
  C(g, 0.03, 0.03, 0.7, M('#3a3a3d', 0.4, 0.3), 0, 0.01, 0, 10);
  C(g, 0.22, 0.24, 0.02, M('#3a3a3d', 0.4, 0.3), 0, 0, 0, 20);
  return { name: '원형 테이블', mass: 15, price: 14000, material: 'wood' };
};
D.cafeChair = (g, o) => {
  const col = o.color || '#d6a23b';
  const m = M(col, 0.85), w = M('#9a6a3d', 0.6);
  RB(g, 0.44, 0.07, 0.42, 0.03, m, 0, 0.42, 0, 2);
  const back = add(g, cylG(0.24, 0.24, 0.32, 14, true, PI * 0.7, PI * 0.6), M(col, 0.85, 0, { side: THREE.DoubleSide }, 'cafeback' + col), 0, 0.68, 0.06);
  back.scale.set(1, 1, 1.1);
  add(g, cylG(0.24, 0.24, 0.32, 14, true, PI * 0.7, PI * 0.6), M(col, 0.85, 0, { side: THREE.DoubleSide }, 'cafeback' + col), 0, 0.68, 0.075, 0, 0, 0, 0.94, 1, 1.03);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 0.016, 0.012, 0.43, w, sx * 0.18, 0, sz * 0.17, 6, sz * 0.08, 0, -sx * 0.08);
  return { name: '카페 의자', mass: 6, price: 9000, material: 'soft' };
};
D.stanchion = (g) => {
  const ch = M('#c2c7ce', 0.25, 0.7);
  C(g, 0.15, 0.17, 0.035, M('#55595f', 0.4, 0.5), 0, 0, 0, 20);
  C(g, 0.025, 0.025, 0.86, ch, 0, 0.035, 0, 10);
  C(g, 0.04, 0.04, 0.07, ch, 0, 0.86, 0, 12);
  S(g, ch, 0, 0.94, 0, 0.035, 0.03, 0.035, 10, 6);
  return { name: '차단봉', mass: 6, price: 7000, material: 'metal', ropeY: 0.9 };
};
D.cafeCounter = (g, o) => {
  const L = o.w || 4.5;
  const slat = tex.woodSlat().clone(); slat.needsUpdate = true; slat.repeat.set(L / 0.5, 1);
  const terr = tex.terrazzo().clone(); terr.needsUpdate = true; terr.repeat.set(L / 1.2, 0.7);
  const front = M('#ffffff', 0.7, 0, { map: slat }, 'counterSlat' + L);
  const top = M('#ffffff', 0.35, 0, { map: terr }, 'counterTop' + L);
  B(g, L, 0.92, 0.04, front, 0, 0.08, 0.33);
  B(g, 0.04, 0.92, 0.7, front, L / 2 - 0.02, 0.08, 0); B(g, 0.04, 0.92, 0.7, front, -L / 2 + 0.02, 0.08, 0);
  B(g, L - 0.06, 0.08, 0.7, M('#3a3530', 0.8), 0, 0, -0.01);
  B(g, L - 0.08, 0.9, 0.04, M('#4a4038', 0.8), 0, 0.08, -0.33);
  B(g, L - 0.08, 0.03, 0.62, M('#4a4038', 0.8), 0, 0.5, 0);
  RB(g, L + 0.1, 0.05, 0.8, 0.012, top, 0, 1.0, 0.03, 1);
  noShadow(B(g, L - 0.1, 0.012, 0.02, M('#ffe2a8', 0.5, 0, { emissive: '#ffcf7a', emissiveIntensity: 1.2 }), 0, 0.985, 0.4));
  return { name: '카페 카운터', mass: 0, price: 180000, material: 'wood' };
};
D.espresso = (g) => {
  const st = M('#c9cdd2', 0.32, 0.55), dk = M('#2c2e33', 0.5), blk = M('#18191c', 0.5);
  RB(g, 0.64, 0.36, 0.48, 0.03, st, 0, 0.1, 0, 2);
  RB(g, 0.66, 0.1, 0.52, 0.02, dk, 0, 0, 0.0, 1);
  B(g, 0.6, 0.15, 0.015, dk, 0, 0.3, 0.24);
  for (const s of [-1, 1]) {
    C(g, 0.045, 0.05, 0.06, st, s * 0.16, 0.22, 0.25, 12);
    add(g, cylG(0.012, 0.012, 0.16, 6), blk, s * 0.16, 0.235, 0.35, PI / 2 - 0.15);
    C(g, 0.035, 0.03, 0.05, M('#f4f2ee', 0.4), s * 0.16, 0.105, 0.27, 10);
    C(g, 0.03, 0.03, 0.006, M('#f4f2ee', 0.4), s * 0.06, 0.39, 0.265, 12, PI / 2);
  }
  C(g, 0.008, 0.008, 0.18, st, 0.3, 0.12, 0.26, 6, 0.2);
  B(g, 0.5, 0.012, 0.3, dk, 0, 0.46, 0);
  for (let i = 0; i < 5; i++) C(g, 0.03, 0.026, 0.05, M('#f4f2ee', 0.4), -0.2 + i * 0.1, 0.472, 0, 10);
  return { name: '에스프레소 머신', mass: 30, price: 150000, material: 'metal' };
};
D.grinder = (g) => {
  RB(g, 0.17, 0.24, 0.22, 0.02, M('#25262a', 0.45), 0, 0, 0, 2);
  C(g, 0.06, 0.06, 0.05, M('#c9cdd2', 0.3, 0.5), 0, 0.24, 0, 12);
  const glass = M('#6b4a35', 0.1, 0, { transparent: true, opacity: 0.45 }, 'hopper');
  add(g, cylG(0.09, 0.055, 0.2, 14), glass, 0, 0.39, 0).castShadow = false;
  C(g, 0.075, 0.05, 0.13, M('#3a2416', 0.9), 0, 0.29, 0, 12);
  C(g, 0.095, 0.095, 0.02, M('#25262a', 0.45), 0, 0.49, 0, 14);
  B(g, 0.08, 0.02, 0.06, M('#25262a', 0.45), 0, 0.1, 0.13);
  return { name: '커피 그라인더', mass: 6, price: 40000, material: 'metal' };
};
D.cupStack = (g) => {
  const cup = M('#f6f4ef', 0.6), lid = M('#ece9e2', 0.5);
  [-0.1, 0, 0.1].forEach((x, i) => {
    const h = 0.22 + i * 0.04;
    C(g, 0.045, 0.034, h, cup, x, 0, 0, 14);
    for (let k = 1; k < 3; k++) noShadow(add(g, torG(0.043, 0.003, 3, 10), lid, x, h * k / 3, 0, PI / 2));
  });
  return { name: '컵 더미', mass: 0.5, price: 2000, material: 'paper' };
};
D.menuBoard = (g) => {
  const chalk = texMat('menuChalk', 256, 360, (x, w, h) => {
    x.fillStyle = '#2b2e2c'; x.fillRect(0, 0, w, h);
    const r = rng(8); x.globalAlpha = 0.06; for (let i = 0; i < 400; i++) { x.fillStyle = '#fff'; x.fillRect(r() * w, r() * h, 3, 1); } x.globalAlpha = 1;
    x.fillStyle = '#f3efe2'; x.font = `bold 26px ${KFONT}`; x.fillText('메뉴', 96, 44);
    x.strokeStyle = '#f3efe2'; x.lineWidth = 2; x.beginPath(); x.moveTo(30, 58); x.lineTo(226, 58); x.stroke();
    x.font = `19px ${KFONT}`;
    [['아메리카노', '3,500'], ['아이스 아메리카노', '4,000'], ['카페라떼', '4,500'], ['바닐라라떼', '5,000']].forEach(([n, p], i) => {
      x.fillStyle = '#f3efe2'; x.fillText(n, 22, 100 + i * 48); x.fillStyle = '#ffd27a'; x.fillText(p, 186, 100 + i * 48);
    });
    x.fillStyle = '#f3efe2'; x.fillText('. . . . . .', 22, 300);
    x.font = `13px ${KFONT}`; x.fillStyle = '#b7d7a8'; x.fillText('오늘도 힘내세요 :)', 70, 340);
  }, {}, 0.9);
  RB(g, 0.72, 1.02, 0.04, 0.008, M('#7a5534', 0.6), 0, 0, 0);
  noShadow(add(g, planeG(0.66, 0.95), chalk, 0, 0.51, 0.0205));
  return { name: '메뉴판', mass: 4, price: 10000, material: 'wood' };
};
D.cafeSign = (g) => {
  const face = glowMat('cafeSign', 512, 128, (x, w, h) => {
    x.fillStyle = '#34363b'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#f4efe4'; x.fillStyle = '#f4efe4'; x.lineWidth = 6;
    const cx = 170, cy = 76;
    x.beginPath(); x.moveTo(cx - 34, cy - 18); x.lineTo(cx + 26, cy - 18); x.lineTo(cx + 20, cy + 22); x.quadraticCurveTo(cx - 4, cy + 34, cx - 28, cy + 22); x.closePath(); x.stroke();
    x.beginPath(); x.arc(cx + 30, cy, 11, -PI / 2, PI / 2); x.stroke();
    x.beginPath(); x.moveTo(cx - 44, cy + 34); x.lineTo(cx + 36, cy + 34); x.stroke();
    for (const sx of [-14, 2]) { x.beginPath(); x.moveTo(cx + sx, cy - 28); x.bezierCurveTo(cx + sx - 10, cy - 38, cx + sx + 10, cy - 46, cx + sx, cy - 58); x.stroke(); }
    x.font = `bold 64px ${KFONT}`; x.fillText('커피', 236, 98);
  }, 0.55);
  RB(g, 2.4, 0.6, 0.14, 0.04, M('#34363b', 0.55), 0, 0, 0, 2);
  noShadow(add(g, planeG(2.0, 0.5), face, 0, 0.3, 0.071));
  noShadow(B(g, 2.3, 0.02, 0.03, M('#ffe2a8', 0.5, 0, { emissive: '#ffcf7a', emissiveIntensity: 1.4 }), 0, 0, 0.06));
  return { name: '카페 간판', mass: 0, price: 50000, material: 'metal' };
};
D.pendantLamp = (g) => {
  const shadeGeo = G('lampShade', () => new THREE.LatheGeometry([new THREE.Vector2(0.17, 0), new THREE.Vector2(0.16, 0.04), new THREE.Vector2(0.12, 0.11), new THREE.Vector2(0.04, 0.15), new THREE.Vector2(0.02, 0.17)], 18));
  add(g, shadeGeo, M('#232427', 0.45, 0.2, { side: THREE.DoubleSide }, 'lampShade'), 0, 0.02, 0);
  noShadow(S(g, M('#fff3d6', 0.3, 0, { emissive: '#ffd48a', emissiveIntensity: 2.2 }), 0, 0.05, 0, 0.05, 0.045, 0.05, 10, 6));
  noShadow(C(g, 0.004, 0.004, 0.8, M('#111', 0.5), 0, 0.19, 0, 4));
  return { name: '펜던트 조명', mass: 0, price: 12000, material: 'metal' };
};
function icedCoffee(g, x = 0, y = 0, z = 0) {
  const cupGeo = G('icedCup', () => new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.031, 0), new THREE.Vector2(0.045, 0.14), new THREE.Vector2(0.047, 0.142)], 10));
  const coffeeGeo = G('icedCof', () => new THREE.CylinderGeometry(0.041, 0.029, 0.112, 10));
  const lidGeo = G('icedLid', () => new THREE.SphereGeometry(0.048, 10, 3, 0, PI * 2, 0, PI * 0.42));
  const clear = M('#e8f2f6', 0.08, 0, { transparent: true, opacity: 0.32, depthWrite: false }, 'cupClear');
  add(g, coffeeGeo, M('#3b2014', 0.25), x, y + 0.058, z);
  const ic = M('#d9c4b3', 0.15, 0, { transparent: true, opacity: 0.7 }, 'ice');
  add(g, boxG(0.022, 0.02, 0.022), ic, x + 0.012, y + 0.118, z + 0.006, 0.3, 0.5, 0.2).castShadow = false;
  add(g, boxG(0.02, 0.02, 0.02), ic, x - 0.014, y + 0.12, z - 0.008, 0.6, 0.2, 0.1).castShadow = false;
  add(g, cupGeo, clear, x, y, z).castShadow = false;
  add(g, lidGeo, clear, x, y + 0.13, z).castShadow = false;
  C(g, 0.0045, 0.0045, 0.24, M('#151515', 0.5), x + 0.008, y + 0.02, z, 6, 0, 0, -0.06);
}
D.icedCoffee = (g) => { icedCoffee(g); return { name: '아이스 아메리카노', mass: 0.4, price: 4500, material: 'plastic' }; };
D.hotCoffee = (g) => {
  C(g, 0.045, 0.034, 0.12, M('#f6f4ef', 0.6), 0, 0, 0, 14);
  C(g, 0.044, 0.038, 0.05, M('#a67c52', 0.8), 0, 0.035, 0, 14);
  C(g, 0.048, 0.046, 0.015, M('#2b2b2b', 0.5), 0, 0.12, 0, 14);
  return { name: '따뜻한 커피', mass: 0.35, price: 3500, material: 'paper' };
};
D.coffeeTray = (g, o) => {
  const n = o.count == null ? 6 : o.count;
  const wd = M('#b98a55', 0.75);
  RB(g, 0.36, 0.025, 0.25, 0.008, wd, 0, 0, 0);
  B(g, 0.36, 0.05, 0.015, wd, 0, 0.025, 0.118); B(g, 0.36, 0.05, 0.015, wd, 0, 0.025, -0.118);
  B(g, 0.015, 0.05, 0.25, wd, 0.173, 0.025, 0); B(g, 0.015, 0.05, 0.25, wd, -0.173, 0.025, 0);
  const cups = [];
  for (let i = 0; i < 6; i++) {
    const c = dyn(new THREE.Group()); g.add(c);
    icedCoffee(c, -0.11 + (i % 3) * 0.11, 0.02, i < 3 ? -0.058 : 0.058);
    c.visible = i < n; cups.push(c);
  }
  g.userData.cups = cups;
  return {
    name: '커피 캐리어', mass: +(1 + n * 0.4).toFixed(2), price: 3000 + n * 4500, material: 'wood',
    set(k) { cups.forEach((c, i) => (c.visible = i < k)); },
  };
};
D.pos = (g) => {
  const scr = glowMat('posScr', 128, 96, (x, w, h) => {
    x.fillStyle = '#eaf1f8'; x.fillRect(0, 0, w, h); x.fillStyle = '#2f6fd6'; x.fillRect(0, 0, w, 16);
    x.fillStyle = '#fff'; x.font = `bold 11px ${KFONT}`; x.fillText('주문', 6, 12);
    x.fillStyle = '#c9d6e6'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) x.fillRect(6 + j * 30, 22 + i * 22, 26, 18);
    x.fillStyle = '#ff8a3a'; x.fillRect(98, 66, 26, 26); x.fillStyle = '#fff'; x.font = `bold 10px ${KFONT}`; x.fillText('결제', 101, 83);
  }, 0.7);
  RB(g, 0.2, 0.05, 0.18, 0.01, M('#2a2c31', 0.5), 0, 0, 0);
  B(g, 0.04, 0.16, 0.04, M('#2a2c31', 0.5), 0, 0.05, -0.04);
  const head = new THREE.Group(); head.position.set(0, 0.24, -0.02); head.rotation.x = -0.35; g.add(head);
  RB(head, 0.3, 0.22, 0.03, 0.01, M('#1f2125', 0.5), 0, -0.11, 0);
  noShadow(add(head, planeG(0.27, 0.19), scr, 0, 0, 0.0155));
  return { name: '포스기', mass: 3, price: 35000, material: 'plastic' };
};
D.elevator = (g, o) => {
  const label = o.label || '7F';
  const steel = M('#c1c5cb', 0.3, 0.45), frame = M('#a9aeb5', 0.35, 0.45), dark = M('#2b2d31', 0.5);
  // frame (opening 1.0 × 2.1)
  B(g, 0.22, 2.3, 0.2, frame, -0.61, 0, 0); B(g, 0.22, 2.3, 0.2, frame, 0.61, 0, 0);
  B(g, 1.44, 0.2, 0.2, frame, 0, 2.1, 0);
  B(g, 1.44, 0.01, 0.2, M('#8d9299', 0.4, 0.4), 0, 0, 0.0);
  // car interior
  B(g, 1.0, 2.1, 0.02, M('#d9cfbf', 0.5), 0, 0, -1.35);
  B(g, 0.02, 2.1, 1.35, M('#cfc5b4', 0.5), 0.5, 0, -0.68); B(g, 0.02, 2.1, 1.35, M('#cfc5b4', 0.5), -0.5, 0, -0.68);
  B(g, 1.0, 0.01, 1.35, M('#6b6660', 0.7), 0, 0.001, -0.68);
  noShadow(B(g, 1.0, 0.02, 1.35, M('#fff8e8', 0.4, 0, { emissive: '#fff1d0', emissiveIntensity: 1.0 }), 0, 2.08, -0.68));
  B(g, 0.9, 0.04, 0.04, steel, 0, 0.9, -1.32);
  // doors
  const dl = dyn(new THREE.Group()), dr = dyn(new THREE.Group()); g.add(dl); g.add(dr);
  RB(dl, 0.5, 2.1, 0.04, 0.005, steel, -0.25, 0, -0.06);
  RB(dr, 0.5, 2.1, 0.04, 0.005, steel, 0.25, 0, -0.06);
  for (const [d, s] of [[dl, -1], [dr, 1]]) noShadow(B(d, 0.006, 2.08, 0.042, M('#8d9299', 0.4, 0.4), s * 0.003, 0.01, -0.06));
  // indicator
  const ind = glowMat('elevInd' + label, 128, 48, (x, w, h) => {
    x.fillStyle = '#141518'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff5a3a'; x.font = `bold 30px ${KFONT}`; x.textAlign = 'center'; x.fillText(label, 76, 36);
    x.beginPath(); x.moveTo(20, 34); x.lineTo(34, 34); x.lineTo(27, 14); x.closePath(); x.fill();
  }, 1.1);
  RB(g, 0.36, 0.14, 0.03, 0.01, dark, 0, 2.38, 0.0);
  noShadow(add(g, planeG(0.33, 0.12), ind, 0, 2.45, 0.016));
  // call buttons
  RB(g, 0.09, 0.22, 0.02, 0.008, steel, 0.9, 1.0, 0.0);
  for (const [y, up] of [[1.15, 1], [1.06, 0]]) {
    noShadow(C(g, 0.022, 0.022, 0.012, M('#ffb34a', 0.3, 0, { emissive: '#ff8a1a', emissiveIntensity: up ? 1.2 : 0.3 }, 'callBtn' + up), 0.9, y - 0.006, 0.012, 12, PI / 2));
  }
  return {
    name: '엘리베이터', mass: 0, price: 0, material: 'metal', frontZ: 0.1,
    set(v) { v = Math.max(0, Math.min(1, +v || 0)); dl.position.x = -v * 0.48; dr.position.x = v * 0.48; },
  };
};
D.revolvingDoor = (g) => {
  const glass = M('#cfe6ee', 0.05, 0, { transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }, 'glassRD');
  const metal = M('#9ba1a8', 0.3, 0.5), dark = M('#6a7078', 0.45, 0.35);
  C(g, 1.12, 1.12, 0.02, M('#8b9097', 0.4, 0.4), 0, 0, 0, 32);
  C(g, 1.15, 1.15, 0.28, dark, 0, 2.32, 0, 32);
  for (const s of [0, PI]) {
    add(g, cylG(1.1, 1.1, 2.3, 20, true, s + PI * 0.18, PI * 0.64), glass, 0, 1.17, 0).castShadow = false;
    add(g, cylG(1.1, 1.1, 0.04, 20, true, s + PI * 0.18, PI * 0.64), metal, 0, 2.3, 0);
  }
  const wings = dyn(new THREE.Group()); g.add(wings);
  C(wings, 0.05, 0.05, 2.3, metal, 0, 0.02, 0, 10);
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Group(); w.rotation.y = i * PI / 2; wings.add(w);
    add(w, boxG(1.02, 2.2, 0.015), glass, 0.56, 1.15, 0).castShadow = false;
    B(w, 1.04, 0.05, 0.04, metal, 0.56, 0.03, 0); B(w, 1.04, 0.05, 0.04, metal, 0.56, 2.22, 0);
    B(w, 0.04, 2.24, 0.04, metal, 1.07, 0.03, 0);
    B(w, 0.5, 0.03, 0.05, metal, 0.6, 1.0, 0);
  }
  g.userData.wings = wings;
  return { name: '회전문', mass: 0, price: 0, material: 'glass', set(a) { wings.rotation.y = +a || 0; } };
};
D.pillar = (g, o) => {
  const h = o.h || 3.0, col = o.color || '#3d6ea8';
  RB(g, 0.6, h, 0.6, 0.03, M(col, 0.6), 0, 0, 0, 1);
  B(g, 0.62, 0.1, 0.62, M(shade(col, -0.18), 0.6), 0, 0, 0);
  return { name: '기둥', mass: 0, price: 0, material: 'metal' };
};
D.ceilingLight = (g) => {
  B(g, 0.6, 0.04, 0.6, M('#f2f2f0', 0.5), 0, 0.005, 0);
  noShadow(add(g, planeG(0.55, 0.55), M('#ffffff', 0.4, 0, { emissive: '#fffaf0', emissiveIntensity: 1.6 }), 0, 0.004, 0, PI / 2));
  g.children.forEach((c) => (c.castShadow = false));
  return { name: '천장 조명', mass: 0, price: 8000, material: 'glass' };
};
D.box = (g) => {
  const cb = M('#c49a63', 0.9);
  RB(g, 0.4, 0.3, 0.32, 0.008, cb, 0, 0, 0);
  noShadow(B(g, 0.08, 0.004, 0.33, M('#d8b682', 0.6), 0, 0.3, 0));
  noShadow(add(g, planeG(0.14, 0.09), texMat('boxLabel', 64, 40, (x, w, h) => {
    x.fillStyle = '#f5f2ea'; x.fillRect(0, 0, w, h); x.fillStyle = '#333'; x.font = `bold 12px ${KFONT}`; x.fillText('취급주의', 6, 18); x.fillStyle = '#999'; x.fillRect(6, 26, 50, 3);
  }), 0.08, 0.17, 0.161));
  return { name: '상자', mass: 4, price: 2000, material: 'paper' };
};
D.tv = (g) => {
  const scr = glowMat('tvScr', 256, 144, (x, w, h) => {
    x.fillStyle = '#f2f5fa'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2f5fa8'; x.fillRect(0, 0, w, 26); x.fillStyle = '#fff'; x.font = `bold 16px ${KFONT}`; x.fillText('3분기 실적 보고', 12, 19);
    x.fillStyle = '#5b8fd6'; [40, 60, 52, 88, 104].forEach((v, i) => x.fillRect(30 + i * 34, 130 - v, 22, v));
    x.strokeStyle = '#d23a3a'; x.lineWidth = 3; x.beginPath(); x.moveTo(30, 110); x.lineTo(80, 90); x.lineTo(130, 96); x.lineTo(180, 50); x.lineTo(222, 36); x.stroke();
  }, 0.7);
  RB(g, 1.2, 0.7, 0.05, 0.012, M(P.black, 0.4), 0, 0.85, 0);
  noShadow(add(g, planeG(1.14, 0.64), scr, 0, 1.2, 0.0255));
  B(g, 0.08, 0.85, 0.05, M('#3a3d44', 0.4, 0.3), 0, 0.02, -0.05);
  RB(g, 0.6, 0.03, 0.4, 0.01, M('#3a3d44', 0.4, 0.3), 0, 0, -0.05);
  return { name: 'TV', mass: 15, price: 80000, material: 'glass' };
};
D.meetingTable = (g) => {
  RB(g, 2.4, 0.05, 1.1, 0.02, M('#c9a374', 0.5), 0, 0.7, 0, 1);
  const lg = M('#3a3d44', 0.45, 0.3);
  for (const s of [-1, 1]) { B(g, 0.06, 0.7, 0.8, lg, s * 0.9, 0, 0); B(g, 0.1, 0.03, 0.9, lg, s * 0.9, 0, 0); }
  B(g, 1.74, 0.06, 0.06, lg, 0, 0.6, 0);
  B(g, 0.3, 0.012, 0.12, M('#2a2c31', 0.5), 0, 0.75, 0);
  return { name: '회의 테이블', mass: 60, price: 45000, material: 'wood' };
};
D.floorSign = (g, o) => {
  const text = o.text || '7층';
  const H = o.h || 0.5;
  const cw = 96 + text.length * 120;
  const t = canvasTex('floorSign:' + text, cw, 160, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = o.color || '#3a3c42';
    x.font = `bold 128px ${KFONT}`; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.fillText(text, w / 2, 124);
    const tw = Math.min(w - 20, x.measureText(text).width);
    if (o.underline !== false) x.fillRect(w / 2 - tw / 2, 142, tw, 10);
  });
  const W = H * cw / 160;
  noShadow(add(g, planeG(W, H), M('#ffffff', 0.7, 0, { map: t, transparent: true, alphaTest: 0.3 }, 'fs:' + text + (o.color || '')), 0, H / 2, 0.003));
  return { name: '층 표시', mass: 0, price: 0, material: 'paper' };
};
D.cone = (g) => {
  C(g, 0.02, 0.15, 0.5, M('#ff7a1a', 0.55), 0, 0.03, 0, 16);
  noShadow(C(g, 0.075, 0.105, 0.08, M('#f5f5f5', 0.5), 0, 0.22, 0, 16));
  RB(g, 0.36, 0.035, 0.36, 0.01, M('#2b2b2b', 0.7), 0, 0, 0);
  return { name: '라바콘', mass: 1, price: 3000, material: 'plastic' };
};
D.extinguisher = (g) => {
  const red = M('#d42a26', 0.4);
  C(g, 0.075, 0.075, 0.4, red, 0, 0, 0, 16);
  S(g, red, 0, 0.4, 0, 0.075, 0.05, 0.075, 14, 6);
  C(g, 0.02, 0.02, 0.05, M('#2b2b2b', 0.5), 0, 0.44, 0, 8);
  B(g, 0.12, 0.015, 0.03, M('#2b2b2b', 0.5), 0.03, 0.49, 0, 0, 0, -0.2);
  noShadow(C(g, 0.077, 0.077, 0.12, M('#f4f2ec', 0.6), 0, 0.14, 0, 16));
  add(g, torG(0.09, 0.009, 4, 12, PI * 0.9), M('#1d1d1d', 0.6), 0.06, 0.37, 0.04, 0, -PI / 2, -PI / 2);
  return { name: '소화기', mass: 5, price: 7000, material: 'metal' };
};
D.vending = (g) => {
  const body = M('#2a6fbf', 0.45), front = M('#f2f4f6', 0.45), dark = M('#25272c', 0.5);
  RB(g, 0.9, 1.85, 0.75, 0.03, body, 0, 0, 0, 1);
  B(g, 0.84, 1.75, 0.02, front, 0, 0.05, 0.37);
  B(g, 0.58, 1.18, 0.02, M('#2d3340', 0.5), -0.1, 0.55, 0.375);
  const cols = ['#e0322c', '#f2b021', '#3fa34d', '#2f6fd6', '#f2f2f2', '#8a4fd0'];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    C(g, 0.032, 0.032, 0.12, M(cols[(r * 2 + c) % cols.length], 0.4), -0.35 + c * 0.09, 0.6 + r * 0.28, 0.33, 10);
  }
  for (let r = 0; r < 4; r++) B(g, 0.56, 0.015, 0.12, M('#c9ccd1', 0.4, 0.3), -0.1, 0.585 + r * 0.28, 0.33);
  noShadow(add(g, planeG(0.56, 1.16), M('#cfe6ee', 0.05, 0, { transparent: true, opacity: 0.25 }, 'vendGlass'), -0.1, 1.14, 0.388));
  B(g, 0.17, 0.5, 0.02, M('#d9dde2', 0.4), 0.3, 1.1, 0.38);
  for (let i = 0; i < 6; i++) noShadow(C(g, 0.014, 0.014, 0.01, M('#ff8a3a', 0.4, 0, { emissive: '#ff6a1a', emissiveIntensity: 0.6 }, 'vbtn'), 0.3, 1.5 - i * 0.06, 0.39, 8, PI / 2));
  B(g, 0.08, 0.1, 0.012, dark, 0.3, 1.15, 0.39);
  B(g, 0.5, 0.18, 0.04, dark, -0.1, 0.18, 0.36);
  noShadow(add(g, planeG(0.8, 0.16), glowMat('vendTop', 256, 52, (x, w, h) => {
    x.fillStyle = '#2a6fbf'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = `bold 30px ${KFONT}`; x.textAlign = 'center'; x.fillText('시원한 음료', w / 2, 37);
  }, 0.5), 0, 1.86, 0.381));
  return { name: '자판기', mass: 0, price: 90000, material: 'metal' };
};
D.glassWall = (g, o) => {
  const w = o.w || 3, h = o.h || 2.7;
  const al = M('#b7bcc3', 0.35, 0.45);
  const glass = M('#cfe6ee', 0.05, 0, { transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }, 'glassW');
  const frost = M('#ffffff', 0.6, 0, { transparent: true, opacity: 0.55, depthWrite: false }, 'frost');
  add(g, boxG(w, h - 0.1, 0.012), glass, 0, h / 2, 0).castShadow = false;
  noShadow(add(g, boxG(w, 0.3, 0.014), frost, 0, 1.15, 0));
  B(g, w, 0.06, 0.08, al, 0, 0, 0); B(g, w, 0.06, 0.08, al, 0, h - 0.06, 0);
  const n = Math.max(1, Math.round(w / 1.0));
  for (let i = 0; i <= n; i++) B(g, 0.04, h, 0.07, al, -w / 2 + 0.02 + (w - 0.04) * i / n, 0, 0);
  return { name: '유리벽', mass: 0, price: 40000, material: 'glass' };
};

export const PROP_TYPES = Object.keys(D);

// ---------------------------------------------------------------- assembly (merge static meshes by material, cached)
const KEEP = new Set(['position', 'normal', 'uv']);
function prepGeo(m) {
  let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.applyMatrix4(m.matrixWorld);
  return g;
}
function underDyn(o, root) { for (let p = o; p && p !== root; p = p.parent) if (p.userData.dyn) return true; return false; }
function mergeStatic(inner) {
  inner.updateMatrixWorld(true);
  const buckets = new Map(), victims = [];
  inner.traverse((m) => {
    if (!m.isMesh || underDyn(m, inner) || m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return;
    const k = m.material.uuid + (m.castShadow ? 'c' : 'n') + (m.renderOrder | 0);
    let b = buckets.get(k);
    if (!b) { b = { mat: m.material, cast: m.castShadow, geos: [] }; buckets.set(k, b); }
    b.geos.push(prepGeo(m)); victims.push(m);
  });
  for (const v of victims) v.parent.remove(v);
  const parts = [];
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    parts.push({ geo, mat: b.mat, cast: b.cast });
  }
  return parts;
}
function partsToMeshes(parts, parent) {
  for (const p of parts) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = p.cast; m.receiveShadow = true; parent.add(m); }
}
function colorsOf(obj) {
  const set = new Set();
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const mm = m.material; if (!mm || !mm.color || mm.transparent || mm.map) return;
    set.add(mm.color.getHex());
  });
  const arr = [...set];
  return arr.length ? arr.slice(0, 6) : [0xcccccc];
}
const STATIC = new Map();
const _box = new THREE.Box3();

export function makeProp(type, opts = {}) {
  const build = D[type];
  if (!build) throw new Error('makeProp: unknown type ' + type);
  const key = type + JSON.stringify(opts);
  const group = new THREE.Group();
  group.name = 'prop:' + type;
  const cached = STATIC.get(key);
  if (cached) {
    const inner = new THREE.Group(); inner.position.copy(cached.offset); group.add(inner);
    partsToMeshes(cached.parts, inner);
    return Object.assign({ group, type, size: { ...cached.size }, colors: cached.colors.slice() }, cached.info);
  }
  const inner = new THREE.Group();
  const info = build(inner, opts) || {};
  const colors = colorsOf(inner);
  const parts = mergeStatic(inner);
  partsToMeshes(parts, inner);
  inner.updateMatrixWorld(true);
  _box.setFromObject(inner);
  const size = { x: +(_box.max.x - _box.min.x).toFixed(3), y: +(_box.max.y - _box.min.y).toFixed(3), z: +(_box.max.z - _box.min.z).toFixed(3) };
  const offset = new THREE.Vector3(-(_box.max.x + _box.min.x) / 2, -_box.min.y, -(_box.max.z + _box.min.z) / 2);
  inner.position.copy(offset);
  group.add(inner);
  let hasDyn = false; inner.traverse((o) => { if (o !== inner && o.userData.dyn) hasDyn = true; });
  const base = { name: info.name || type, mass: info.mass || 0, price: info.price || 0, material: info.material || 'plastic' };
  if (info.ropeY != null) base.ropeY = info.ropeY;
  if (info.frontZ != null) base.frontZ = +(info.frontZ + offset.z).toFixed(3);
  if (!hasDyn && !info.set) STATIC.set(key, { parts, info: base, size, offset, colors });
  const out = Object.assign({ group, type, size, colors }, base);
  if (info.set) { out.set = info.set; }
  return out;
}

// ---------------------------------------------------------------- desk top dressing
export function deskTopLayout(seed = 1) {
  const r = rng((seed | 0) * 7919 + 13);
  const Y = 0.75, items = [];
  const jit = (a) => (r() - 0.5) * a;
  items.push({ type: 'monitor', x: -0.08 + jit(0.12), y: Y, z: -0.18 + jit(0.04), rotY: jit(0.25) });
  items.push({ type: 'keyboard', x: -0.08 + jit(0.06), y: Y, z: 0.12 + jit(0.04), rotY: jit(0.12) });
  items.push({ type: 'mouse', x: 0.27 + jit(0.04), y: Y, z: 0.14 + jit(0.04), rotY: jit(0.4) });
  const leftBinders = r() < 0.65;
  if (leftBinders) items.push({ type: 'binders', x: -0.56, y: Y, z: -0.2, rotY: jit(0.1) });
  else if (r() < 0.6) items.push({ type: 'paperStack', x: -0.56 + jit(0.05), y: Y, z: -0.12 + jit(0.08), rotY: jit(0.5) });
  if (r() < 0.7) items.push({ type: 'mug', x: r() < 0.5 ? 0.45 + jit(0.06) : -0.42 + jit(0.06), y: Y, z: 0.12 + jit(0.06), rotY: r() * PI * 2 });
  if (r() < 0.55) items.push({ type: 'paperStack', x: 0.45 + jit(0.06), y: Y, z: -0.12 + jit(0.06), rotY: jit(0.6) });
  if (r() < 0.5) items.push({ type: 'penCup', x: 0.27 + jit(0.04), y: Y, z: -0.25, rotY: r() * PI });
  if (r() < 0.55) items.push({ type: 'plantSmall', x: 0.62 + jit(0.04), y: Y, z: -0.25 + jit(0.04), rotY: r() * PI });
  if (r() < 0.4) items.push({ type: 'phone', x: -0.5 + jit(0.06), y: Y, z: 0.15, rotY: jit(0.4) });
  else if (r() < 0.4) items.push({ type: 'calendar', x: -0.4 + jit(0.06), y: Y, z: 0.17, rotY: 0.4 + jit(0.3) });
  return items;
}
