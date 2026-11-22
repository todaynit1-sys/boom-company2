// 회사 뿌개기 — props2: the other floors (옥상 R, 12층 임원층, 3층 대강당, 1층 추가, B1 회식, B2 주차장, 7층 추가).
// Same conventions as props.js: origin = bottom-centre of the bounds, front faces +Z, geometry/materials shared
// through module caches (never dispose them). Extra info fields some props return:
//   mount: 'wall' | 'ceiling'  — built so the back (wall) / top (ceiling) is the attachment side
//   ride: 'cart' | 'forklift'   — rideable;  hold: true — fits in a hand;  floats: true — balloon
//   parts / fork                — Object3D handles the core may move or detach (car, forklift)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, finishTex, rng, KFONT } from './tex.js';

const PI = Math.PI;
// ---------------------------------------------------------------- caches & helpers (local copies; props.js does not export them)
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
const latheG = (key, pts, seg = 16) => G('la:' + key, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg));

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const B = (p, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => add(p, boxG(w, h, d), mat, x, y + h / 2, z, rx, ry, rz);
const RB = (p, w, h, d, r, mat, x, y, z, s = 1, rx = 0, ry = 0, rz = 0) => add(p, rboxG(w, h, d, r, s), mat, x, y + h / 2, z, rx, ry, rz);
const C = (p, rt, rb, h, mat, x, y, z, seg = 14, rx = 0, ry = 0, rz = 0) => add(p, cylG(rt, rb, h, seg), mat, x, y + h / 2, z, rx, ry, rz);
const S = (p, mat, x, y, z, sx, sy = sx, sz = sx, w = 12, h = 8) => add(p, sphG(w, h), mat, x, y, z, 0, 0, 0, sx, sy, sz);
const noShadow = (m) => { m.castShadow = false; return m; };
const dyn = (o) => { o.userData.dyn = true; return o; };
const grp = (p, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, rz); p.add(g); return g; };
// cylinder between two points (rods, braces, pipes)
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
function rod(p, r, mat, a, b, seg = 8) {
  _v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _v1.length();
  const m = add(p, cylG(r, r, +len.toFixed(4), seg), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  _q.setFromUnitVectors(_up, _v1.normalize()); m.quaternion.copy(_q);
  return m;
}
function shade(hex, amt) {
  const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return '#' + c.getHexString();
}
const texMat = (key, w, h, draw, extra = {}, rough = 0.7) => {
  const t = canvasTex('p2:' + key, w, h, draw);
  return M('#ffffff', rough, 0, Object.assign({ map: t }, extra), 'tx2:' + key + JSON.stringify(Object.keys(extra)));
};
const glowMat = (key, w, h, draw, intensity = 0.9) => {
  const t = canvasTex('p2:' + key, w, h, draw);
  return M('#ffffff', 0.4, 0, { map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: intensity }, 'gl2:' + key + intensity);
};
const glow = (color, emissive, k = 1.2, rough = 0.4) => M(color, rough, 0, { emissive, emissiveIntensity: k }, 'glow' + emissive + k);
function rrect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function fitText(x, text, cx, cy, maxW, size, weight = 'bold', align = 'center') {
  let s = size; x.textAlign = align; x.textBaseline = 'middle';
  do { x.font = `${weight} ${s}px ${KFONT}`; s -= 2; } while (x.measureText(text).width > maxW && s > 8);
  x.fillText(text, cx, cy);
}
// convex planar polygon (fan) with planar UVs — glass panes, decals
function polyG(key, pts) {
  return G('poly:' + key, () => {
    const pos = [], uv = [];
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of pts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
    const rg = mx.map((v, k) => v - mn[k]);
    const ax = [0, 1, 2].sort((a, b) => rg[b] - rg[a]).slice(0, 2).sort();
    const U = (p) => [(p[ax[0]] - mn[ax[0]]) / (rg[ax[0]] || 1), (p[ax[1]] - mn[ax[1]]) / (rg[ax[1]] || 1)];
    for (let i = 1; i < pts.length - 1; i++) for (const p of [pts[0], pts[i], pts[i + 1]]) { pos.push(...p); uv.push(...U(p)); }
    const ge = new THREE.BufferGeometry();
    ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    ge.computeVertexNormals();
    return ge;
  });
}
// many transformed copies of one base geometry merged (clouds, flowers, lettuce, books)
const _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function scatterG(key, base, n, seed, fn) {
  return G('sc:' + key, () => {
    const r = rng(seed), list = [];
    const bg = base.index ? base.toNonIndexed() : base;
    for (let i = 0; i < n; i++) {
      const t = fn(i, r); if (!t) continue;
      _p.set(t.x || 0, t.y || 0, t.z || 0); _e.set(t.rx || 0, t.ry || 0, t.rz || 0, 'YXZ'); _q.setFromEuler(_e);
      _s.set(t.sx, t.sy ?? t.sx, t.sz ?? t.sx); _m4.compose(_p, _q, _s);
      const ge = bg.clone(); ge.applyMatrix4(_m4); list.push(ge);
    }
    return mergeGeometries(list);
  });
}

// shared palette
const P = {
  wood: '#d8b88a', walnut: '#5a3522', walnutD: '#3f2416', gold: '#d9a93a', chrome: '#c9ced5', black: '#1d1e22', dark: '#2b2d33',
  white: '#f3f3f1', steel: '#aeb4bb', red: '#d8352a', yellow: '#efb51f', green: '#3f8f4a', cream: '#f2ead8',
};
const gold = () => M(P.gold, 0.3, 0.75);
const chrome = () => M(P.chrome, 0.25, 0.75);

// ---------------------------------------------------------------- tex2: floor/wall/sky textures (cached CanvasTextures)
const TC = new Map();
const cachedT = (k, make) => { if (!TC.has(k)) TC.set(k, make()); return TC.get(k); };
function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function speckle(x, w, h, n, cols, a, b, r, alpha = 1) {
  x.globalAlpha = alpha;
  for (let i = 0; i < n; i++) { x.fillStyle = cols[(r() * cols.length) | 0]; const s = a + r() * (b - a); x.fillRect(r() * w, r() * h, s, s); }
  x.globalAlpha = 1;
}
function blotches(x, w, h, n, cols, rMin, rMax, r, alpha) {
  for (let i = 0; i < n; i++) {
    x.globalAlpha = alpha * (0.4 + r() * 0.6); x.fillStyle = cols[(r() * cols.length) | 0];
    x.beginPath(); x.ellipse(r() * w, r() * h, rMin + r() * (rMax - rMin), rMin + r() * (rMax - rMin), r() * 3, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
}
function planks(x, w, h, n, cols, r, seam, grain) {
  const ph = h / n;
  for (let i = 0; i < n; i++) {
    let px = -r() * w * 0.5;
    while (px < w) {
      const pw = w * (0.35 + r() * 0.4);
      x.fillStyle = cols[(r() * cols.length) | 0]; x.fillRect(px, i * ph, pw, ph);
      x.globalAlpha = 0.22;
      for (let k = 0; k < 8; k++) { x.fillStyle = r() < 0.5 ? grain[0] : grain[1]; x.fillRect(px, i * ph + 2 + r() * (ph - 4), pw, 1 + r() * 1.2); }
      x.globalAlpha = 1;
      x.fillStyle = seam; x.fillRect(px, i * ph, 2, ph);
      px += pw;
    }
    x.fillStyle = seam; x.fillRect(0, i * ph, w, 2);
  }
}
export const tex2 = {
  // board-formed concrete: mottled warm grey, faint panel seams + form-tie holes (1 texture ≈ 1.2 m)
  concrete() {
    return cachedT('concrete', () => {
      const c = cvs(512, 512), x = c.getContext('2d'), r = rng(51);
      x.fillStyle = '#b3afa8'; x.fillRect(0, 0, 512, 512);
      blotches(x, 512, 512, 70, ['#a8a49d', '#bdb9b2', '#9f9b94'], 20, 70, r, 0.3);
      speckle(x, 512, 512, 9000, ['#9c9891', '#c4c0b9', '#8d8983', '#d0ccc5'], 1, 2.2, r, 0.5);
      x.fillStyle = '#948f88'; x.fillRect(0, 0, 512, 2); x.fillRect(0, 0, 2, 512);
      x.fillStyle = '#7d7973';
      for (const px of [128, 384]) for (const py of [128, 384]) { x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); }
      return finishTex(c);
    });
  },
  // rooftop urethane waterproofing: green with grey worn patches and seams (1 texture ≈ 2 m)
  asphaltRoof() {
    return cachedT('asphaltRoof', () => {
      const c = cvs(512, 512), x = c.getContext('2d'), r = rng(52);
      x.fillStyle = '#5e9071'; x.fillRect(0, 0, 512, 512);
      blotches(x, 512, 512, 50, ['#6aa07e', '#548566', '#7aa98a'], 25, 80, r, 0.35);
      blotches(x, 512, 512, 14, ['#9aa39c', '#8b948d'], 10, 40, r, 0.45);
      speckle(x, 512, 512, 7000, ['#4f7d60', '#6fa684', '#8fa898'], 1, 2, r, 0.5);
      x.strokeStyle = 'rgba(40,60,45,0.35)'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(0, 256); x.lineTo(512, 256); x.moveTo(256, 0); x.lineTo(256, 512); x.stroke();
      return finishTex(c);
    });
  },
  // parking garage epoxy: dark grey-green, subtle oil stains & tyre arcs (1 texture ≈ 4 m)
  parkingFloor() {
    return cachedT('parkingFloor', () => {
      const c = cvs(512, 512), x = c.getContext('2d'), r = rng(53);
      x.fillStyle = '#5a6263'; x.fillRect(0, 0, 512, 512);
      blotches(x, 512, 512, 40, ['#646c6d', '#525a5b', '#6b7273'], 30, 90, r, 0.3);
      blotches(x, 512, 512, 10, ['#2e3334', '#3a3f40'], 12, 34, r, 0.35);
      speckle(x, 512, 512, 6000, ['#4d5455', '#727a7b', '#808889'], 1, 2, r, 0.35);
      x.strokeStyle = 'rgba(30,34,35,0.08)'; x.lineWidth = 10;
      for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(r() * 512, r() * 512, 120 + r() * 200, r() * 6, r() * 6 + 1.2); x.stroke(); }
      x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, 0, 512, 2); x.fillRect(0, 0, 2, 512);
      return finishTex(c);
    });
  },
  // dark walnut planks (1 texture ≈ 1 m)
  darkWood() {
    return cachedT('darkWood', () => {
      const c = cvs(256, 256), x = c.getContext('2d'), r = rng(54);
      planks(x, 256, 256, 4, ['#5a3522', '#4f2e1d', '#633c27', '#563220'], r, 'rgba(25,12,5,0.55)', ['#3b2214', '#7a4c31']);
      return finishTex(c);
    });
  },
  // auditorium polished oak planks (1 texture ≈ 1.5 m)
  hallFloor() {
    return cachedT('hallFloor', () => {
      const c = cvs(512, 512), x = c.getContext('2d'), r = rng(55);
      planks(x, 512, 512, 8, ['#c48a55', '#b97f4b', '#cf9660', '#bd844f'], r, 'rgba(70,35,10,0.45)', ['#a26a3a', '#dca472']);
      const g = x.createLinearGradient(0, 0, 512, 512); g.addColorStop(0, 'rgba(255,240,210,0.10)'); g.addColorStop(0.5, 'rgba(255,240,210,0)'); g.addColorStop(1, 'rgba(255,240,210,0.08)');
      x.fillStyle = g; x.fillRect(0, 0, 512, 512);
      return finishTex(c);
    });
  },
  // BBQ pub floor: dark slate tiles with lighter grout (1 texture = 2×2 tiles ≈ 1.2 m)
  pubFloor() {
    return cachedT('pubFloor', () => {
      const c = cvs(256, 256), x = c.getContext('2d'), r = rng(56);
      x.fillStyle = '#6a625c'; x.fillRect(0, 0, 256, 256);
      const cols = ['#3c3533', '#433b38', '#383130', '#463e3a'];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        x.fillStyle = cols[(i * 2 + j + ((r() * 2) | 0)) % 4]; x.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
        x.globalAlpha = 0.18; x.fillStyle = '#5a504b'; x.fillRect(i * 128 + 3, j * 128 + 3, 122, 4); x.globalAlpha = 1;
      }
      speckle(x, 256, 256, 2500, ['#2e2826', '#544a46'], 1, 2, r, 0.5);
      return finishTex(c);
    });
  },
  // wide rooftop panoramas (wrapS repeat, horizon ≈ 62 % down). Far hills + city rooftops below eye level.
  skyDay() { return skyPano('day'); },
  skyDusk() { return skyPano('dusk'); },
};
function skyPano(kind) {
  return cachedT('sky2' + kind, () => {
    const W = 2048, H = 512, c = cvs(W, H), x = c.getContext('2d'), r = rng(kind === 'day' ? 61 : 62);
    const day = kind === 'day';
    const g = x.createLinearGradient(0, 0, 0, H);
    if (day) { g.addColorStop(0, '#4f93dc'); g.addColorStop(0.5, '#9cc8ef'); g.addColorStop(0.66, '#e4f1fa'); g.addColorStop(1, '#cfdbe4'); }
    else { g.addColorStop(0, '#2c3470'); g.addColorStop(0.35, '#7a5b9a'); g.addColorStop(0.55, '#ec8a74'); g.addColorStop(0.66, '#ffcf8f'); g.addColorStop(1, '#8a6a78'); }
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (!day) {
      const sg = x.createRadialGradient(W * 0.62, H * 0.6, 4, W * 0.62, H * 0.6, 300);
      sg.addColorStop(0, 'rgba(255,246,210,1)'); sg.addColorStop(0.08, 'rgba(255,214,150,0.85)'); sg.addColorStop(1, 'rgba(255,160,120,0)');
      x.fillStyle = sg; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff'; for (let i = 0; i < 60; i++) { x.globalAlpha = r() * 0.7; x.fillRect(r() * W, r() * H * 0.25, 1.5, 1.5); } x.globalAlpha = 1;
    }
    // puffy clouds (cartoon: flat-bottomed clumps with lighter tops)
    for (let i = 0; i < 16; i++) {
      const cx = r() * W, cy = 50 + r() * 190, s = 0.6 + r() * 0.9;
      for (let k = 0; k < 7; k++) {
        const ex = cx + (k - 3) * 26 * s, ey = cy - Math.sin((k / 6) * PI) * 22 * s;
        x.fillStyle = day ? 'rgba(255,255,255,0.92)' : 'rgba(255,200,190,0.55)';
        x.beginPath(); x.ellipse(ex, ey, 34 * s, 22 * s, 0, 0, 7); x.fill();
      }
      x.fillStyle = day ? 'rgba(200,220,240,0.6)' : 'rgba(140,90,130,0.35)';
      x.beginPath(); x.ellipse(cx, cy + 12 * s, 100 * s, 10 * s, 0, 0, 7); x.fill();
    }
    const hy = H * 0.62;
    // far mountain ridge
    x.fillStyle = day ? '#9fb4c6' : '#6d5577';
    x.beginPath(); x.moveTo(0, hy);
    for (let px = 0; px <= W; px += 32) x.lineTo(px, hy - 18 - Math.abs(Math.sin(px * 0.004) * 50) - Math.sin(px * 0.013) * 10 - r() * 6);
    x.lineTo(W, H); x.lineTo(0, H); x.fill();
    // city rooftops (below eye level → only tops visible), with rooftop tanks
    const rows = [[hy + 6, '#b9c7d2', '#8fa5b8', 0.0], [hy + 26, '#cdd6de', '#9aaebf', 0.15], [hy + 52, '#dfe3e6', '#aebdc9', 0.3]];
    const duskRows = ['#7a6280', '#8e6f86', '#a57f8c'];
    rows.forEach(([y0, col, win, lit], li) => {
      let px = -10;
      while (px < W + 10) {
        const bw = 30 + r() * 70, bh = 20 + r() * 60;
        x.fillStyle = day ? col : duskRows[li]; x.fillRect(px, y0 - bh * 0.4, bw, H);
        if (r() < 0.5) { x.fillRect(px + bw * 0.2, y0 - bh * 0.4 - 8, bw * 0.25, 8); }
        for (let i = 0; i < 6; i++) for (let j = 0; j < Math.floor(bw / 10); j++) {
          const on = !day && r() < 0.35;
          x.fillStyle = on ? '#ffd88a' : (day ? win : '#5e4a66'); x.globalAlpha = on ? 0.9 : 0.5;
          x.fillRect(px + 3 + j * 10, y0 - bh * 0.4 + 6 + i * 11, 6, 5);
        }
        x.globalAlpha = 1;
        px += bw + 3;
      }
    });
    const hz = x.createLinearGradient(0, hy - 60, 0, hy + 40);
    hz.addColorStop(0, 'rgba(255,255,255,0)'); hz.addColorStop(1, day ? 'rgba(235,243,250,0.55)' : 'rgba(255,190,150,0.35)');
    x.fillStyle = hz; x.fillRect(0, hy - 60, W, 100);
    const t = finishTex(c); t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}
const repTex = (t, rx, ry, key) => cachedT('rep:' + key + rx + ',' + ry, () => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); return c; });

// ---------------------------------------------------------------- shared materials / textures for props
const T = {
  crackGlass: () => texMat('crackGlass', 256, 256, (x, w, h) => {
    x.fillStyle = '#41586b'; x.fillRect(0, 0, w, h);
    const r = rng(77);
    x.strokeStyle = 'rgba(240,250,255,0.95)'; x.lineWidth = 2;
    for (const [cx, cy] of [[90, 110], [180, 170]]) {
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * PI * 2 + r() * 0.3; let px = cx, py = cy;
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 5; k++) { px += Math.cos(a + (r() - 0.5) * 0.6) * 26; py += Math.sin(a + (r() - 0.5) * 0.6) * 26; x.lineTo(px, py); }
        x.stroke();
      }
      for (let k = 1; k < 4; k++) { x.beginPath(); x.arc(cx, cy, k * 22 + r() * 6, 0, 7); x.stroke(); }
    }
    // holes
    x.globalCompositeOperation = 'destination-out';
    for (const [cx, cy, s] of [[90, 110, 30], [180, 170, 22], [40, 220, 14]]) {
      x.beginPath(); for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2, rr = s * (0.6 + r() * 0.7); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  }, { alphaTest: 0.5, side: THREE.DoubleSide }, 0.2),
  carGlass: () => texMat('carGlass', 128, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5d7e98'); g.addColorStop(1, '#2c3f52');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.22)';
    x.beginPath(); x.moveTo(20, 0); x.lineTo(50, 0); x.lineTo(20, h); x.lineTo(-10, h); x.fill();
    x.beginPath(); x.moveTo(62, 0); x.lineTo(72, 0); x.lineTo(42, h); x.lineTo(32, h); x.fill();
  }, { side: THREE.DoubleSide }, 0.12),
  waterGlass: () => M('#9fd6ee', 0.05, 0, { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }, 'glass2'),
  water: () => M('#3f9fd8', 0.1, 0, { transparent: true, opacity: 0.45, depthWrite: false }, 'water2'),
  puddle: () => M('#5fb4e6', 0.05, 0, { transparent: true, opacity: 0.55, depthWrite: false }, 'puddle2'),
  leather: (col) => texMat('leather' + col, 128, 128, (x, w, h) => {
    x.fillStyle = col; x.fillRect(0, 0, w, h);
    const r = rng(19);
    for (let i = 0; i < 1800; i++) { x.fillStyle = r() < 0.5 ? shade(col, -0.05) : shade(col, 0.04); x.fillRect(r() * w, r() * h, 1.5, 1.5); }
  }, {}, 0.45),
  fabric: (col) => texMat('fab' + col, 128, 128, (x, w, h) => {
    x.fillStyle = col; x.fillRect(0, 0, w, h);
    const r = rng(23);
    for (let i = 0; i < 2500; i++) { x.fillStyle = r() < 0.5 ? shade(col, -0.06) : shade(col, 0.05); x.fillRect(r() * w, r() * h, 1.2, 1.2); }
  }, {}, 0.95),
  grille: () => texMat('grille', 128, 128, (x, w, h) => {
    x.fillStyle = '#2a2b30'; x.fillRect(0, 0, w, h); x.fillStyle = '#111215';
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { x.beginPath(); x.arc(4 + i * 8 + (j % 2) * 4, 4 + j * 8, 2.4, 0, 7); x.fill(); }
  }, {}, 0.8),
  wood: () => M('#ffffff', 0.55, 0, { map: repTex(tex2.darkWood(), 1, 1, 'dw') }, 'darkWoodMat'),
  hazard: () => texMat('hazard', 128, 128, (x, w, h) => {
    x.fillStyle = '#f2c21b'; x.fillRect(0, 0, w, h); x.fillStyle = '#1e1e20';
    for (let i = -4; i < 8; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + 16, 0); x.lineTo(i * 32 + 16 + h, h); x.lineTo(i * 32 + h, h); x.fill(); }
  }, {}, 0.6),
  cardboard: () => M('#c89b62', 0.9),
};
// a wood material whose UVs are in metres (Extrude/planks)
const woodRep = (rx, ry) => M('#ffffff', 0.5, 0, { map: repTex(tex2.darkWood(), rx, ry, 'dw') }, 'dwRep' + rx + ',' + ry);

// ---------------------------------------------------------------- builders: each (g, o) => { name, mass, price, material, set?, after?, ...extra }
const D = {};

// ================================================================= 옥상 R
D.watertank = (g) => {
  const steel = M('#5f6873', 0.5, 0.4), steelD = M('#464d56', 0.55, 0.4), galv = M('#b9bfc6', 0.4, 0.5), conc = M('#a9a59e', 0.9);
  const panel = texMat('tankPanel', 256, 256, (x, w, h) => {
    x.fillStyle = '#7fbad9'; x.fillRect(0, 0, w, h);
    const s = w / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const X = i * s, Y = j * s;
      x.fillStyle = '#6aa6c7'; x.fillRect(X, Y, s, s);
      const g2 = x.createLinearGradient(X, Y, X + s, Y + s); g2.addColorStop(0, '#b4ddef'); g2.addColorStop(1, '#86c0dd');
      x.fillStyle = g2; rrect(x, X + 7, Y + 7, s - 14, s - 14, 10); x.fill();
      x.fillStyle = '#4f87a6'; for (let k = 0; k < 4; k++) { x.fillRect(X + 4 + k * s / 4, Y + 1, 3, 3); x.fillRect(X + 1, Y + 4 + k * s / 4, 3, 3); }
    }
  }, {}, 0.55);
  const trim = M('#5c99bb', 0.5);
  const W = 2.0, H = 1.7, Dp = 2.0, y0 = 0.62, t = 0.06;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B(g, 0.12, y0 - 0.1, 0.12, steel, sx * 0.85, 0.08, sz * 0.85); RB(g, 0.34, 0.08, 0.34, 0.02, conc, sx * 0.85, 0, sz * 0.85); }
  for (const sz of [-1, 0, 1]) B(g, W + 0.12, 0.12, 0.12, sz ? steel : steelD, 0, y0 - 0.12, sz * 0.85);
  for (const sx of [-1, 1]) B(g, 0.12, 0.12, Dp + 0.12, steel, sx * 0.85, y0 - 0.12, 0);
  for (const sx of [-1, 1]) { rod(g, 0.018, steelD, [sx * 0.85, 0.12, -0.85], [sx * 0.85, y0 - 0.14, 0.85]); rod(g, 0.018, steelD, [sx * 0.85, 0.12, 0.85], [sx * 0.85, y0 - 0.14, -0.85]); }
  // shell (front wall is a separate hinged panel)
  B(g, W, H, t, panel, 0, y0, -Dp / 2 + t / 2);
  for (const sx of [-1, 1]) B(g, t, H, Dp, panel, sx * (W / 2 - t / 2), y0, 0);
  B(g, W, t, Dp, panel, 0, y0 + H - t, 0);
  B(g, W, t, Dp, M('#3d6d88', 0.8), 0, y0, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) RB(g, 0.1, H + 0.04, 0.1, 0.04, trim, sx * W / 2, y0 - 0.02, sz * Dp / 2, 2);
  for (const sz of [-1, 1]) RB(g, W + 0.06, 0.08, 0.08, 0.035, trim, 0, y0 + H - 0.04, sz * Dp / 2, 2);
  for (const sx of [-1, 1]) RB(g, 0.08, 0.08, Dp + 0.06, 0.035, trim, sx * W / 2, y0 + H - 0.04, 0, 2);
  // top: manhole + vent
  C(g, 0.3, 0.32, 0.07, M('#5a93b4', 0.5), 0.45, y0 + H, 0.35, 20);
  C(g, 0.06, 0.06, 0.03, galv, 0.45, y0 + H + 0.07, 0.35, 8);
  C(g, 0.05, 0.05, 0.25, galv, -0.55, y0 + H, -0.4, 10);
  S(g, galv, -0.55, y0 + H + 0.27, -0.4, 0.12, 0.07, 0.12, 12, 6);
  // ladder (right side)
  const lx = W / 2 + 0.14;
  for (const sz of [-0.22, 0.22]) C(g, 0.022, 0.022, y0 + H + 0.35, galv, lx, 0, sz, 8);
  for (let i = 0; i < 8; i++) rod(g, 0.016, galv, [lx, 0.3 + i * 0.3, -0.22], [lx, 0.3 + i * 0.3, 0.22], 6);
  for (const sz of [-0.22, 0.22]) rod(g, 0.02, galv, [lx, y0 + H + 0.35, sz], [W / 2, y0 + H + 0.35, sz], 6);
  // outlet pipe + red valve
  const pipe = M('#9aa3ab', 0.45, 0.4);
  rod(g, 0.05, pipe, [-0.6, y0 + 0.15, Dp / 2], [-0.6, y0 + 0.15, Dp / 2 + 0.3], 12);
  rod(g, 0.05, pipe, [-0.6, y0 + 0.15, Dp / 2 + 0.3], [-0.6, 0.06, Dp / 2 + 0.3], 12);
  add(g, torG(0.09, 0.015, 5, 14), M('#d23a2c', 0.5), -0.6, y0 + 0.15, Dp / 2 + 0.17, 0, 0, 0);
  // water inside (visible only when burst)
  const water = dyn(grp(g, 0, y0 + t, 0));
  noShadow(add(water, boxG(W - 0.14, H * 0.82, Dp - 0.14), T.water(), 0, H * 0.41, 0));
  // front panel, hinged at the bottom
  const front = dyn(grp(g, 0, y0, Dp / 2 - t / 2));
  B(front, W, H, t, panel, 0, 0, 0);
  const plate = texMat('tankPlate', 160, 64, (x, w, h) => {
    x.fillStyle = '#f6f7f2'; rrect(x, 2, 2, w - 4, h - 4, 8); x.fill(); x.strokeStyle = '#2d6ea6'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#2d6ea6'; fitText(x, '저수조', w / 2, 26, 140, 26); x.fillStyle = '#d23a2c'; fitText(x, '음용수 · 출입금지', w / 2, 48, 140, 14);
  }, {}, 0.6);
  noShadow(add(front, planeG(0.5, 0.2), plate, 0, H * 0.72, t / 2 + 0.003));
  const crack = noShadow(add(front, planeG(0.9, 0.9), M('#ffffff', 0.6, 0, { map: canvasTex('p2:tankCrack', 128, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.strokeStyle = '#1e3d52'; x.lineWidth = 3; const r = rng(4);
    for (let i = 0; i < 6; i++) { let px = 64, py = 64; x.beginPath(); x.moveTo(px, py); const a = i * 1.05 + r(); for (let k = 0; k < 5; k++) { px += Math.cos(a + (r() - 0.5)) * 12; py += Math.sin(a + (r() - 0.5)) * 12; x.lineTo(px, py); } x.stroke(); }
  }), transparent: true, alphaTest: 0.3 }, 'tankCrack'), 0.25, H * 0.35, t / 2 + 0.004));
  crack.visible = false;
  let gush, puddle, leak;
  return {
    name: '물탱크', mass: 0, price: 8000000, material: 'plastic',
    after() {
      gush = dyn(grp(g, 0, 0, 0)); gush.visible = false;
      noShadow(add(gush, rboxG(W * 0.9, 0.12, 1.6, 0.05), T.water(), 0, y0 * 0.55, Dp / 2 + 0.7, -0.55));
      puddle = noShadow(add(gush, cylG(1, 1, 0.01, 28), T.puddle(), 0, 0.012, Dp / 2 + 1.3, 0, 0, 0, 1.9, 1, 1.3));
      leak = dyn(grp(g, 0, 0, 0)); leak.visible = false;
      noShadow(add(leak, cylG(0.025, 0.04, y0 + H * 0.35, 8), T.water(), 0.25, (y0 + H * 0.35) / 2, Dp / 2 + 0.06));
      noShadow(add(leak, cylG(1, 1, 0.01, 20), T.puddle(), 0.25, 0.012, Dp / 2 + 0.4, 0, 0, 0, 0.6, 1, 0.45));
    },
    set(s) {
      const st = s === 'burst' || s === 2 ? 2 : s === 'leak' || s === 1 ? 1 : 0;
      front.rotation.x = st === 2 ? 1.2 : 0;
      water.scale.y = st === 2 ? 0.18 : st === 1 ? 0.8 : 1;
      crack.visible = st >= 1;
      if (gush) { gush.visible = st === 2; leak.visible = st === 1; }
    },
  };
};
D.solar = (g) => {
  const cells = texMat('solarCells', 256, 160, (x, w, h) => {
    x.fillStyle = '#c9ced5'; x.fillRect(0, 0, w, h);
    const cw = (w - 8) / 10, ch = (h - 8) / 6;
    for (let i = 0; i < 10; i++) for (let j = 0; j < 6; j++) {
      const gr = x.createLinearGradient(0, 4 + j * ch, 0, 4 + j * ch + ch); gr.addColorStop(0, '#2f4f8f'); gr.addColorStop(1, '#1d335f');
      x.fillStyle = gr; x.fillRect(5 + i * cw, 5 + j * ch, cw - 2, ch - 2);
      x.fillStyle = 'rgba(200,215,240,0.35)'; x.fillRect(5 + i * cw, 5 + j * ch + ch / 2 - 1, cw - 2, 1);
    }
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.moveTo(30, 0); x.lineTo(90, 0); x.lineTo(40, h); x.lineTo(-20, h); x.fill();
  }, {}, 0.2);
  const al = M('#c4c9cf', 0.35, 0.5), conc = M('#aaa69f', 0.9);
  const pan = grp(g, 0, 0.6, 0, 0.42);
  RB(pan, 1.72, 0.05, 1.02, 0.02, al, 0, -0.025, 0);
  noShadow(add(pan, planeG(1.66, 0.96), cells, 0, 0.027, 0, -PI / 2));
  for (const sx of [-0.7, 0.7]) {
    B(g, 0.05, 0.34, 0.05, al, sx, 0.08, 0.38);
    B(g, 0.05, 0.75, 0.05, al, sx, 0.08, -0.38);
    rod(g, 0.02, al, [sx, 0.12, 0.38], [sx, 0.8, -0.38], 6);
    RB(g, 0.2, 0.08, 1.0, 0.02, conc, sx, 0, 0);
  }
  return { name: '태양광 패널', mass: 20, price: 1500000, material: 'glass' };
};
D.acunit = (g) => {
  const body = M('#ecebe3', 0.55), dk = M('#2b2d31', 0.6), grey = M('#9aa0a6', 0.45, 0.3);
  RB(g, 0.9, 0.68, 0.36, 0.035, body, 0, 0.05, 0, 2);
  for (const sx of [-0.33, 0.33]) RB(g, 0.12, 0.05, 0.42, 0.015, M('#6c7178', 0.6), sx, 0, 0);
  // fan grille (left)
  const fx = -0.17, fy = 0.39, fz = 0.181;
  noShadow(C(g, 0.27, 0.27, 0.01, dk, fx, fy - 0.005, fz - 0.01, 28, PI / 2));
  const fan = dyn(grp(g, fx, fy, fz - 0.03));
  for (let i = 0; i < 3; i++) add(fan, sphG(10, 6), M('#5d6168', 0.5), Math.cos(i * 2.09) * 0.12, Math.sin(i * 2.09) * 0.12, 0, 0, 0.35, i * 2.09, 0.13, 0.06, 0.012);
  const hub = add(fan, cylG(0.045, 0.045, 0.04, 12), M('#3b3e44', 0.5), 0, 0, 0.01, PI / 2);
  hub.onBeforeRender = () => { fan.rotation.z = -performance.now() * 0.006; };
  for (const rr of [0.08, 0.15, 0.22, 0.27]) add(g, torG(rr, 0.007, 4, 28), grey, fx, fy, fz + 0.01);
  for (const a of [0, PI / 2]) add(g, boxG(0.54, 0.012, 0.012), grey, fx, fy, fz + 0.012, 0, 0, a);
  // louvers (right)
  for (let i = 0; i < 9; i++) B(g, 0.24, 0.012, 0.01, M('#c9c8c0', 0.6), 0.28, 0.14 + i * 0.055, 0.181);
  noShadow(add(g, planeG(0.13, 0.05), texMat('acLabel', 64, 24, (x, w, h) => { x.fillStyle = '#fafaf7'; x.fillRect(0, 0, w, h); x.fillStyle = '#2f6fd6'; fitText(x, '실외기', w / 2, h / 2, 60, 16); }), 0.28, 0.66, 0.182));
  // insulated pipes out the right side
  const ins = M('#f1efe9', 0.8);
  rod(g, 0.03, ins, [0.45, 0.22, -0.05], [0.58, 0.22, -0.05], 10); rod(g, 0.03, ins, [0.58, 0.22, -0.05], [0.58, 0.0, -0.05], 10);
  rod(g, 0.02, M('#c27a3c', 0.4, 0.6), [0.45, 0.3, 0.05], [0.56, 0.3, 0.05], 8);
  return { name: '실외기', mass: 45, price: 900000, material: 'metal' };
};
D.megaphone = (g) => {
  const white = M('#f4f3ef', 0.4), red = M('#d8352a', 0.4), grey = M('#53575e', 0.5);
  const horn = latheG('mega', [[0.04, 0], [0.045, 0.05], [0.07, 0.15], [0.11, 0.22], [0.12, 0.235], [0.11, 0.235]], 18);
  add(g, horn, M('#f4f3ef', 0.4, 0, { side: THREE.DoubleSide }, 'megaHorn'), 0, 0.12, 0.02, PI / 2);
  add(g, torG(0.115, 0.012, 6, 20), red, 0, 0.12, 0.25);
  C(g, 0.06, 0.06, 0.16, white, 0, 0.12, -0.05, 14, PI / 2);
  C(g, 0.062, 0.062, 0.03, red, 0, 0.12, -0.06, 14, PI / 2);
  S(g, grey, 0, 0.12, -0.13, 0.055, 0.055, 0.025, 12, 6);
  RB(g, 0.04, 0.12, 0.05, 0.015, grey, 0, 0.0, -0.04, 1, 0.25);
  RB(g, 0.02, 0.04, 0.02, 0.006, red, 0, 0.05, -0.0);
  return { name: '확성기', mass: 1.2, price: 80000, material: 'plastic', hold: true };
};
function lettuceG() {
  return scatterG('lettuce', new THREE.SphereGeometry(1, 7, 4), 14, 81, (i, r) => {
    const a = i * 2.4 + r() * 0.4, ring = i < 5 ? 0 : 1;
    const rr = ring ? 0.05 : 0.02;
    return { x: Math.cos(a) * rr, y: 0.05 + (ring ? 0.02 : 0.05), z: Math.sin(a) * rr, rx: ring ? 0.9 : 0.45, ry: -a + PI / 2, sx: 0.05, sy: 0.012, sz: ring ? 0.085 : 0.065 };
  });
}
D.lettuce = (g) => {
  const foam = M('#f7f6f1', 0.95), soil = M('#4a3527', 0.95);
  RB(g, 0.54, 0.24, 0.36, 0.03, foam, 0, 0, 0, 2);
  RB(g, 0.56, 0.035, 0.38, 0.015, foam, 0, 0.22, 0);
  noShadow(B(g, 0.48, 0.01, 0.3, soil, 0, 0.235, 0));
  const lg = lettuceG();
  const cols = ['#8cc84b', '#6fb23d', '#a6d65d'];
  [[-0.15, -0.06], [0.0, 0.05], [0.15, -0.05], [-0.07, 0.09], [0.11, 0.09]].forEach(([x, z], i) => {
    add(g, lg, M(cols[i % 3], 0.6, 0, { side: THREE.DoubleSide }, 'lettuce' + i % 3), x, 0.2, z, 0, i * 1.3, 0, 1.25);
  });
  // hand-written warning stick
  C(g, 0.006, 0.006, 0.36, M('#c49a63', 0.8), 0.22, 0.2, 0.12, 6);
  RB(g, 0.2, 0.11, 0.01, 0.004, M('#fbfaf3', 0.8), 0.22, 0.46, 0.125);
  noShadow(add(g, planeG(0.19, 0.1), texMat('lettuceSign', 128, 64, (x, w, h) => {
    x.fillStyle = '#fbfaf3'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2a2a2a'; fitText(x, '부장님 상추', w / 2, 22, 120, 22, 'bold');
    x.fillStyle = '#d23a2c'; fitText(x, '손대지 마시오!', w / 2, 47, 120, 17, 'bold');
  }), 0.22, 0.515, 0.131));
  return { name: '부장님 상추', mass: 3, price: 30000, material: 'plant' };
};
D.railing = (g, o) => {
  const w = o.w || 2;
  const conc = M('#ffffff', 0.9, 0, { map: repTex(tex2.concrete(), w / 1.2, 0.5, 'cc') }, 'railConc' + w);
  const cap = M('#c9c5bd', 0.85), rail = M('#cfd4d9', 0.35, 0.55), post = M('#b4bac1', 0.4, 0.5);
  B(g, w, 0.5, 0.24, conc, 0, 0, 0);
  RB(g, w + 0.02, 0.06, 0.3, 0.02, cap, 0, 0.5, 0);
  const n = Math.max(1, Math.round(w / 1.0));
  for (let i = 0; i <= n; i++) { const x = -w / 2 + 0.05 + (w - 0.1) * i / n; C(g, 0.025, 0.025, 0.6, post, x, 0.56, 0, 8); C(g, 0.045, 0.045, 0.02, post, x, 0.56, 0, 10); }
  rod(g, 0.032, rail, [-w / 2, 1.15, 0], [w / 2, 1.15, 0], 10);
  rod(g, 0.02, rail, [-w / 2, 0.86, 0], [w / 2, 0.86, 0], 8);
  return { name: '옥상 난간', mass: 0, price: 300000, material: 'metal' };
};
D.vent = (g) => {
  const galv = M('#c3c8cd', 0.4, 0.55), galvD = M('#9aa1a8', 0.45, 0.5);
  C(g, 0.2, 0.22, 0.04, galvD, 0, 0, 0, 16);
  C(g, 0.11, 0.11, 0.62, galv, 0, 0.04, 0, 16);
  add(g, torG(0.112, 0.012, 4, 16), galvD, 0, 0.3, 0, PI / 2);
  for (let i = 0; i < 3; i++) { const a = i * 2.09; rod(g, 0.008, galvD, [Math.cos(a) * 0.1, 0.62, Math.sin(a) * 0.1], [Math.cos(a) * 0.15, 0.72, Math.sin(a) * 0.15], 4); }
  add(g, G('ventCap', () => new THREE.SphereGeometry(0.24, 18, 6, 0, PI * 2, 0, PI * 0.5)), M('#c3c8cd', 0.4, 0.55, { side: THREE.DoubleSide }, 'ventCap'), 0, 0.7, 0, 0, 0, 0, 1, 0.6, 1);
  C(g, 0.24, 0.24, 0.05, galvD, 0, 0.67, 0, 18);
  return { name: '환기구', mass: 12, price: 150000, material: 'metal' };
};
D.antenna = (g) => {
  const st = M('#b9bfc6', 0.4, 0.5), dk = M('#5c636b', 0.5, 0.4);
  for (let i = 0; i < 3; i++) { const a = i * 2.09; rod(g, 0.02, dk, [0, 0.6, 0], [Math.cos(a) * 0.5, 0.02, Math.sin(a) * 0.5], 6); RB(g, 0.14, 0.04, 0.14, 0.01, M('#a9a59e', 0.9), Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); }
  C(g, 0.03, 0.035, 3.0, st, 0, 0, 0, 10);
  for (const [y, len, n] of [[2.7, 1.0, 7], [2.2, 0.8, 5]]) {
    rod(g, 0.015, st, [0, y, -len / 2], [0, y, len / 2], 6);
    for (let i = 0; i < n; i++) { const z = -len / 2 + (len * i) / (n - 1), hw = 0.38 - i * 0.03; rod(g, 0.008, st, [-hw, y, z], [hw, y, z], 4); }
  }
  // small dish
  const dish = grp(g, 0.12, 1.6, 0.05, 0, 0.4, 0);
  add(dish, G('dish', () => new THREE.SphereGeometry(0.28, 16, 6, 0, PI * 2, 0, PI * 0.28)), M('#eeeeea', 0.5, 0, { side: THREE.DoubleSide }, 'dish'), 0.1, 0, 0, 0, 0, -PI / 2 + 0.3);
  rod(dish, 0.012, dk, [0, 0, 0], [0.3, 0.05, 0], 6);
  noShadow(S(g, glow('#ff5a4a', '#ff2a1a', 1.6), 0, 3.03, 0, 0.04, 0.04, 0.04, 10, 6));
  return { name: '안테나', mass: 25, price: 400000, material: 'metal' };
};
D.bench = (g) => {
  const wood = M('#c58e55', 0.65), frame = M('#33363c', 0.5, 0.3);
  for (let i = 0; i < 4; i++) RB(g, 1.6, 0.035, 0.1, 0.015, wood, 0, 0.42, -0.17 + i * 0.115);
  for (let i = 0; i < 3; i++) RB(g, 1.6, 0.09, 0.03, 0.012, wood, 0, 0.56 + i * 0.12, -0.27, 1, -0.18);
  for (const sx of [-0.68, 0.68]) {
    B(g, 0.05, 0.42, 0.05, frame, sx, 0, 0.17); B(g, 0.05, 0.86, 0.05, frame, sx, 0, -0.24, -0.1);
    B(g, 0.05, 0.04, 0.48, frame, sx, 0.38, -0.03);
    RB(g, 0.06, 0.04, 0.4, 0.015, frame, sx, 0.62, 0.0);
  }
  return { name: '벤치', mass: 18, price: 300000, material: 'wood' };
};
D.ashtray = (g) => {
  const st = M('#c9ced4', 0.3, 0.6), dk = M('#3c3f45', 0.5);
  C(g, 0.15, 0.17, 0.04, dk, 0, 0, 0, 18);
  C(g, 0.12, 0.13, 0.8, st, 0, 0.04, 0, 18);
  C(g, 0.16, 0.14, 0.06, st, 0, 0.84, 0, 20);
  noShadow(C(g, 0.135, 0.135, 0.01, M('#d9cfb8', 0.95), 0, 0.885, 0, 18));
  const butt = M('#f1ede4', 0.8), tip = M('#d98a3c', 0.8);
  [[0.05, 0.02, 0.3], [-0.04, 0.06, 1.2], [0.0, -0.07, 2.2], [-0.07, -0.02, 0.8]].forEach(([x, z, a]) => {
    add(g, cylG(0.007, 0.007, 0.05, 6), butt, x, 0.9, z, PI / 2, a, 0);
    add(g, cylG(0.0072, 0.0072, 0.015, 6), tip, x + Math.sin(a) * 0.03, 0.9, z + Math.cos(a) * 0.03, PI / 2, a, 0);
  });
  noShadow(add(g, G('ashSign', () => new THREE.CylinderGeometry(0.1305, 0.1305, 0.16, 18, 1, true, -0.6, 1.2)), texMat('ashSign', 128, 48, (x, w, h) => {
    x.fillStyle = '#2e7d4f'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; fitText(x, '흡연구역', w / 2, h / 2, 120, 28);
  }), 0, 0.6, 0));
  return { name: '재떨이 스탠드', mass: 4, price: 50000, material: 'metal' };
};
D.helipad = (g, o) => {
  const R = o.r || 2.6;
  const decal = texMat('helipad', 512, 512, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#4b5a55'; x.beginPath(); x.arc(256, 256, 254, 0, 7); x.fill();
    x.strokeStyle = '#f2c21b'; x.lineWidth = 22; x.beginPath(); x.arc(256, 256, 218, 0, 7); x.stroke();
    x.fillStyle = '#f7f6f0';
    x.fillRect(166, 140, 46, 232); x.fillRect(300, 140, 46, 232); x.fillRect(166, 233, 180, 46);
    const r = rng(9); x.globalAlpha = 0.25; for (let i = 0; i < 2500; i++) { x.fillStyle = r() < 0.5 ? '#2f3a36' : '#8a948f'; x.fillRect(r() * w, r() * h, 2, 2); } x.globalAlpha = 1;
  }, { transparent: true, alphaTest: 0.4 }, 0.85);
  const m = noShadow(add(g, G('circ' + R, () => new THREE.CircleGeometry(R, 40)), M('#ffffff', 0.85, 0, { map: decal.map, transparent: true, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, 'helipadM'), 0, 0.012, 0, -PI / 2));
  m.receiveShadow = true;
  return { name: '헬리패드', mass: 0, price: 0, material: 'paper' };
};
D.cloud = (g, o) => {
  const seed = o.seed || 1;
  const geo = scatterG('cloud' + seed, new THREE.SphereGeometry(1, 14, 10), 9, 90 + seed, (i, r) => {
    const t = i / 8, x = (t - 0.5) * 3.2;
    const s = 0.55 + Math.sin(t * PI) * 0.65 + r() * 0.2;
    return { x, y: s * 0.55 + r() * 0.2, z: (r() - 0.5) * 0.9, sx: s, sy: s * 0.82, sz: s * 0.9 };
  });
  const m = add(g, geo, M('#ffffff', 1, 0, { emissive: '#dfe9f5', emissiveIntensity: 0.35 }, 'cloud'), 0, 0, 0);
  m.castShadow = false; m.receiveShadow = false;
  const base = add(g, sphG(16, 8), M('#ffffff', 1, 0, { emissive: '#dfe9f5', emissiveIntensity: 0.35 }, 'cloud'), 0, 0.35, 0, 0, 0, 0, 2.2, 0.35, 0.9);
  base.castShadow = false; base.receiveShadow = false;
  return { name: '구름', mass: 0, price: 0, material: 'soft' };
};

// ================================================================= 12층 임원층
function fishGroup(parent, col, stripe, s = 1) {
  const f = dyn(grp(parent));
  add(f, sphG(10, 8), M(col, 0.4), 0, 0, 0, 0, 0, 0, 0.07 * s, 0.045 * s, 0.025 * s);
  add(f, G('fishTail', () => { const ge = new THREE.ConeGeometry(0.04, 0.06, 4); ge.rotateZ(PI / 2); return ge; }), M(col, 0.4), -0.085 * s, 0, 0, 0, 0, 0, s, s, 0.35 * s);
  if (stripe) add(f, sphG(8, 6), M(stripe, 0.4), 0.015 * s, 0, 0, 0, 0, 0, 0.018 * s, 0.047 * s, 0.027 * s);
  add(f, sphG(6, 4), M('#111', 0.3), 0.045 * s, 0.012 * s, 0, 0, 0, 0, 0.008 * s);
  return f;
}
D.aquarium = (g) => {
  const wood = T.wood(), blk = M('#1f2125', 0.5), goldM = gold();
  const W = 2.2, Dp = 0.62, cabH = 0.78, tH = 0.82;
  RB(g, W, cabH, Dp, 0.025, wood, 0, 0, 0, 2);
  for (const sx of [-1, 1]) { RB(g, W / 2 - 0.08, cabH - 0.14, 0.02, 0.01, woodRep(1, 1), sx * W / 4, 0.07, Dp / 2); C(g, 0.015, 0.015, 0.03, goldM, sx * 0.08, 0.45, Dp / 2 + 0.02, 8, PI / 2); }
  const y0 = cabH;
  B(g, W, 0.05, Dp, blk, 0, y0, 0);
  B(g, W, 0.09, Dp, blk, 0, y0 + tH, 0);
  RB(g, W + 0.02, 0.12, Dp + 0.02, 0.02, blk, 0, y0 + tH + 0.09, 0);
  noShadow(add(g, planeG(W - 0.1, 0.02), glow('#e9f7ff', '#bfe8ff', 1.4), 0, y0 + tH + 0.085, 0, PI / 2));
  // backdrop
  noShadow(add(g, planeG(W - 0.04, tH - 0.02), texMat('aquaBack', 256, 96, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3fa7d6'); gr.addColorStop(1, '#14507a'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(i * 50, 0); x.lineTo(i * 50 + 20, 0); x.lineTo(i * 50 - 10, h); x.lineTo(i * 50 - 30, h); x.fill(); }
  }, {}, 0.6), 0, y0 + 0.05 + tH / 2, -Dp / 2 + 0.03));
  // sand, rocks, weeds
  B(g, W - 0.04, 0.07, Dp - 0.04, M('#e6cf9c', 0.95), 0, y0 + 0.05, 0);
  const rock = G('rock', () => new THREE.DodecahedronGeometry(0.1, 0));
  [[-0.7, -0.1, 1.2, '#8a8f96'], [-0.55, 0.0, 0.7, '#a2a7ad'], [0.6, -0.12, 1.4, '#7f858d'], [0.35, 0.05, 0.6, '#9aa0a6']].forEach(([x, z, s, c]) => add(g, rock, M(c, 0.9, 0, { flatShading: true }, 'rock' + c), x, y0 + 0.12, z, 0.3, x, 0, s, s * 0.8, s));
  const weed = scatterG('weed', new THREE.SphereGeometry(1, 6, 4), 9, 33, (i, r) => ({ x: (r() - 0.5) * 0.12, y: 0.12 + i * 0.05, z: (r() - 0.5) * 0.05, rz: (r() - 0.5) * 0.6, ry: r() * 3, sx: 0.025, sy: 0.08, sz: 0.008 }));
  [[-0.85, -0.18], [-0.3, -0.2], [0.85, -0.15], [0.1, -0.2]].forEach(([x, z], i) => add(g, weed, M(i % 2 ? '#3f9a4a' : '#5ab34f', 0.6, 0, { side: THREE.DoubleSide }, 'weed' + i % 2), x, y0 + 0.05, z, 0, i, 0, 1, 1 + (i % 2) * 0.4, 1));
  // fish
  const fishes = [];
  const specs = [['#ff8a1f', '#ffffff'], ['#ffd23a', null], ['#3f7fe0', '#ffd23a'], ['#ff5a5a', '#ffffff'], ['#ff8a1f', '#ffffff'], ['#a35ad8', null], ['#ffd23a', '#2b2b2b'], ['#3fc0d0', null]];
  specs.forEach(([c, s], i) => {
    const f = fishGroup(g, c, s, i % 3 === 0 ? 1.3 : 1);
    const base = new THREE.Vector3(-0.8 + (i * 0.23) % 1.6, y0 + 0.25 + (i % 4) * 0.13, -0.15 + (i % 3) * 0.13);
    f.position.copy(base); f.userData.base = base.clone(); f.userData.ph = i * 1.7; f.rotation.y = i % 2 ? PI : 0;
    fishes.push(f);
  });
  // water + glass
  const water = dyn(grp(g, 0, y0 + 0.05, 0));
  noShadow(add(water, boxG(W - 0.05, tH - 0.08, Dp - 0.05), T.water(), 0, (tH - 0.08) / 2, 0)).renderOrder = 1;
  noShadow(add(g, boxG(W, tH, Dp), T.waterGlass(), 0, y0 + 0.05 + tH / 2, -0.001)).renderOrder = 2;
  const front = dyn(grp(g, 0, y0 + 0.05, Dp / 2 - 0.004));
  noShadow(add(front, planeG(W - 0.02, tH - 0.01), M('#bfe6f7', 0.05, 0, { transparent: true, opacity: 0.18, depthWrite: false }, 'aquaFront'), 0, tH / 2, 0.006)).renderOrder = 3;
  for (const sx of [-1, 1]) B(g, 0.04, tH, 0.04, blk, sx * (W / 2 - 0.02), y0 + 0.05, Dp / 2 - 0.02);
  let broken = false;
  fishes[0].children[0].onBeforeRender = () => {
    const t = performance.now() * 0.001;
    fishes.forEach((f, i) => {
      if (broken && i < 4) return;
      const b = f.userData.base, ph = f.userData.ph;
      const sx = Math.sin(t * 0.5 + ph);
      f.position.set(b.x * 0.2 + sx * 0.8 * (broken ? 0.4 : 1), (broken ? y0 + 0.12 : b.y) + Math.sin(t * 1.3 + ph) * 0.03, b.z);
      f.rotation.set(0, Math.cos(t * 0.5 + ph) > 0 ? 0 : PI, Math.sin(t * 6 + ph) * 0.1);
    });
  };
  let shards, puddle;
  return {
    name: '대형 수족관', mass: 0, price: 18000000, material: 'glass',
    after() {
      shards = dyn(grp(g, 0, 0, 0)); shards.visible = false;
      const sm = M('#cfeefa', 0.05, 0, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }, 'shard2');
      const r = rng(12);
      for (let i = 0; i < 9; i++) {
        const x0 = -W / 2 + 0.05 + r() * (W - 0.1), top = i % 2;
        noShadow(add(shards, polyG('aqs' + i, [[0, 0, 0], [0.12 + r() * 0.1, 0, 0], [0.04 + r() * 0.05, (top ? -1 : 1) * (0.1 + r() * 0.15), 0]]), sm, x0, top ? y0 + 0.05 + tH : y0 + 0.07, Dp / 2));
      }
      for (let i = 0; i < 7; i++) noShadow(add(shards, polyG('aqf' + i, [[0, 0, 0], [0.1, 0, 0.02], [0.05, 0, 0.09]]), sm, (r() - 0.5) * 2, 0.005, Dp / 2 + 0.2 + r() * 0.8, 0, r() * 6, 0));
      puddle = noShadow(add(shards, cylG(1, 1, 0.01, 28), T.puddle(), 0, 0.01, Dp / 2 + 0.8, 0, 0, 0, 1.6, 1, 0.8));
    },
    set(s) {
      broken = s === 'broken' || s === 1 || s === true;
      front.visible = !broken;
      water.scale.y = broken ? 0.18 : 1;
      if (shards) shards.visible = broken;
      fishes.forEach((f, i) => {
        if (i >= 4) return;
        if (broken) { f.position.set(-0.7 + i * 0.45, 0.03, Dp / 2 + 0.5 + (i % 2) * 0.35); f.rotation.set(PI / 2, i, 0); }
        else f.position.copy(f.userData.base);
      });
    },
  };
};
D.pedestal = (g) => {
  const marble = texMat('marbleDark', 128, 256, (x, w, h) => {
    x.fillStyle = '#2b2a2e'; x.fillRect(0, 0, w, h);
    const r = rng(14); x.strokeStyle = 'rgba(220,215,205,0.35)'; x.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) { x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 50; py += r() * 40; x.lineTo(px, py); } x.stroke(); }
  }, {}, 0.3);
  RB(g, 0.5, 0.08, 0.5, 0.015, marble, 0, 0, 0);
  RB(g, 0.42, 0.74, 0.42, 0.02, marble, 0, 0.08, 0);
  RB(g, 0.52, 0.06, 0.52, 0.015, marble, 0, 0.82, 0);
  for (const y of [0.075, 0.815]) B(g, 0.44, 0.012, 0.44, gold(), 0, y, 0);
  return { name: '진열대', mass: 40, price: 300000, material: 'ceramic' };
};
D.vase = (g, o) => {
  const ped = o.pedestal !== false;
  if (ped) D.pedestal(g);
  const y = ped ? 0.88 : 0;
  const prof = [[0.0, 0], [0.09, 0], [0.1, 0.02], [0.14, 0.1], [0.18, 0.24], [0.185, 0.32], [0.16, 0.44], [0.1, 0.52], [0.075, 0.56], [0.08, 0.6], [0.1, 0.63], [0.09, 0.64], [0.07, 0.62]];
  const jar = texMat('celadon', 256, 128, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9cc6ad'); gr.addColorStop(1, '#7eae94'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#f3f2e8'; x.fillStyle = '#f3f2e8'; x.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const cx = 32 + i * 64, cy = 58 + (i % 2) * 14;
      x.beginPath(); x.arc(cx, cy, 14, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(cx - 9, cy + 2); x.quadraticCurveTo(cx - 2, cy - 8, cx + 2, cy); x.quadraticCurveTo(cx + 6, cy - 8, cx + 10, cy + 2); x.stroke();
      x.beginPath(); x.ellipse(cx + 30, cy - 26, 9, 3, 0, 0, 7); x.ellipse(cx + 40, cy - 22, 6, 2, 0, 0, 7); x.fill();
    }
    x.strokeStyle = '#5e8a73'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 22); x.lineTo(w, 22); x.moveTo(0, 104); x.lineTo(w, 104); x.stroke();
  }, {}, 0.22);
  add(g, latheG('celadon', prof, 22), jar, 0, y, 0);
  return { name: '회장님 도자기', mass: ped ? 46 : 6, price: 30000000, material: 'ceramic' };
};
D.ceoSafe = (g) => {
  const W = 0.8, H = 1.05, Dp = 0.7;
  const body = M('#34403b', 0.45, 0.35), bodyD = M('#232b28', 0.5, 0.3), goldM = gold(), ch = chrome(), velvet = M('#7a1f2a', 0.95);
  RB(g, W, H, 0.12, 0.03, body, 0, 0.05, -Dp / 2 + 0.06, 2);
  for (const sx of [-1, 1]) RB(g, 0.1, H, Dp, 0.03, body, sx * (W / 2 - 0.05), 0.05, 0, 2);
  RB(g, W, 0.12, Dp, 0.03, body, 0, H - 0.07, 0, 2); RB(g, W, 0.12, Dp, 0.03, body, 0, 0.05, 0, 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 0.04, 0.05, 0.05, bodyD, sx * 0.32, 0, sz * 0.27, 10);
  // interior
  B(g, W - 0.2, H - 0.24, 0.01, velvet, 0, 0.17, -Dp / 2 + 0.125);
  B(g, W - 0.2, 0.01, Dp - 0.14, velvet, 0, 0.17, 0.0);
  B(g, W - 0.2, 0.02, Dp - 0.2, M('#4a3a30', 0.6), 0, 0.6, -0.02);
  const bar = G('goldbar', () => { const ge = new THREE.CylinderGeometry(0.045, 0.06, 0.045, 4, 1); ge.rotateY(PI / 4); ge.scale(0.85, 1, 1.9); return ge; });
  const gb = M('#f0c04a', 0.25, 0.8);
  for (let l = 0; l < 3; l++) for (let i = 0; i < 4 - l; i++) add(g, bar, gb, -0.16 + i * 0.1 + l * 0.05, 0.2 + l * 0.045, 0.02);
  const cash = texMat('cashBundle', 64, 32, (x, w, h) => { x.fillStyle = '#e3b867'; x.fillRect(0, 0, w, h); x.fillStyle = '#c2903f'; for (let i = 0; i < 8; i++) x.fillRect(0, i * 4, w, 1); x.fillStyle = '#fbfaf2'; x.fillRect(26, 0, 12, h); });
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) RB(g, 0.16, 0.05, 0.08, 0.005, cash, -0.17 + i * 0.17, 0.62 + k * 0.05, -0.05 + (i % 2) * 0.05);
  // door (hinge on the left)
  const door = dyn(grp(g, -W / 2 + 0.02, 0.05, Dp / 2 - 0.04));
  RB(door, W - 0.04, H - 0.02, 0.08, 0.03, body, W / 2 - 0.02, 0.01, 0, 2);
  B(door, W - 0.16, H - 0.16, 0.01, M('#2c3632', 0.4, 0.4), W / 2 - 0.02, 0.08, 0.04);
  for (const [w, h, y] of [[W - 0.12, 0.012, 0.06], [W - 0.12, 0.012, H - 0.09]]) B(door, w, h, 0.012, goldM, W / 2 - 0.02, y, 0.045);
  for (const x of [0.08, W - 0.12]) B(door, 0.012, H - 0.15, 0.012, goldM, x, 0.06, 0.045);
  const dial = texMat('safeDial', 128, 128, (x, w, h) => {
    const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, '#f2f4f6'); gr.addColorStop(1, '#a9afb6'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = '#222'; x.font = `bold 13px ${KFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < 40; i++) { const a = (i / 40) * PI * 2; x.save(); x.translate(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); x.rotate(a + PI / 2); x.fillRect(-1, -4, 2, i % 5 ? 5 : 9); x.restore(); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 - PI / 2; x.fillText(String(i * 10), 64 + Math.cos(a) * 38, 64 + Math.sin(a) * 38); }
  }, {}, 0.3);
  C(door, 0.1, 0.1, 0.04, ch, W / 2 - 0.02, 0.68, 0.04, 24, PI / 2);
  noShadow(add(door, G('dialFace', () => new THREE.CircleGeometry(0.095, 24)), dial, W / 2 - 0.02, 0.68, 0.081));
  C(door, 0.03, 0.03, 0.03, ch, W / 2 - 0.02, 0.68, 0.08, 10, PI / 2);
  // wheel handle
  const wh = grp(door, W / 2 - 0.02, 0.38, 0.06);
  C(wh, 0.03, 0.03, 0.06, ch, 0, 0, 0.02, 10, PI / 2);
  for (let i = 0; i < 3; i++) { const a = i * 2.09 + 0.3; rod(wh, 0.012, ch, [0, 0, 0.05], [Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.05], 6); S(wh, ch, Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.05, 0.022, 0.022, 0.022, 8, 6); }
  noShadow(add(door, planeG(0.28, 0.06), texMat('safePlate', 128, 28, (x, w, h) => { x.fillStyle = '#d9a93a'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a2a10'; fitText(x, '대표이사 금고', w / 2, h / 2 + 1, 120, 18); }, {}, 0.3), W / 2 - 0.02, H - 0.2, 0.046));
  for (const y of [0.15, H - 0.2]) C(g, 0.022, 0.022, 0.12, ch, -W / 2 + 0.01, y, Dp / 2 - 0.01, 8);
  return {
    name: '사장실 금고', mass: 0, price: 30000000, material: 'metal',
    set(v) { v = Math.max(0, Math.min(1, +v || 0)); door.rotation.y = -v * 1.9; },
  };
};
D.ceoPortrait = (g) => {
  const W = 0.86, H = 1.12, fr = 0.1;
  const goldM = gold(), goldD = M('#a77b22', 0.4, 0.7);
  RB(g, W, fr, 0.08, 0.03, goldM, 0, 0, 0, 2); RB(g, W, fr, 0.08, 0.03, goldM, 0, H - fr, 0, 2);
  RB(g, fr, H, 0.08, 0.03, goldM, -W / 2 + fr / 2, 0, 0, 2); RB(g, fr, H, 0.08, 0.03, goldM, W / 2 - fr / 2, 0, 0, 2);
  for (const sx of [-1, 1]) for (const sy of [0, 1]) S(g, goldD, sx * (W / 2 - fr / 2), fr / 2 + sy * (H - fr), 0.045, 0.06, 0.06, 0.03, 10, 6);
  S(g, goldD, 0, H - 0.02, 0.04, 0.09, 0.05, 0.03, 10, 6);
  B(g, W - 2 * fr + 0.02, H - 2 * fr + 0.02, 0.03, M('#6b4a1f', 0.5), 0, fr - 0.01, -0.01);
  const pic = texMat('ceoPortrait', 256, 336, (x, w, h) => {
    const bg = x.createRadialGradient(128, 120, 20, 128, 160, 230); bg.addColorStop(0, '#6d5a3f'); bg.addColorStop(1, '#2a2014'); x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = '#7b1f24'; x.beginPath(); x.moveTo(0, 0); x.lineTo(70, 0); x.quadraticCurveTo(40, 150, 60, 336); x.lineTo(0, 336); x.fill();
    // suit
    x.fillStyle = '#1f2433'; x.beginPath(); x.moveTo(20, 336); x.quadraticCurveTo(30, 230, 128, 222); x.quadraticCurveTo(226, 230, 236, 336); x.fill();
    x.fillStyle = '#f4f1ea'; x.beginPath(); x.moveTo(104, 226); x.lineTo(128, 290); x.lineTo(152, 226); x.fill();
    x.fillStyle = '#b8222c'; x.beginPath(); x.moveTo(121, 236); x.lineTo(135, 236); x.lineTo(140, 300); x.lineTo(128, 314); x.lineTo(116, 300); x.fill();
    x.fillStyle = '#d9a93a'; x.beginPath(); x.arc(82, 262, 6, 0, 7); x.fill();
    // neck & head
    x.fillStyle = '#e9b896'; x.fillRect(104, 196, 48, 34);
    x.beginPath(); x.ellipse(128, 150, 62, 72, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(128, 205, 40, 18, 0, 0, 7); x.fill(); // double chin
    x.fillStyle = '#d99f7d'; x.beginPath(); x.ellipse(66, 156, 10, 16, 0, 0, 7); x.ellipse(190, 156, 10, 16, 0, 0, 7); x.fill();
    // shiny bald top + grey side hair + comb-over strands
    x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.ellipse(110, 98, 22, 10, -0.3, 0, 7); x.fill();
    x.fillStyle = '#c9c7c2'; x.beginPath(); x.ellipse(70, 132, 12, 26, 0.2, 0, 7); x.ellipse(186, 132, 12, 26, -0.2, 0, 7); x.fill();
    x.strokeStyle = '#bdbab3'; x.lineWidth = 3; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(74, 112 - i * 8); x.quadraticCurveTo(128, 80 - i * 6, 172, 104 - i * 6); x.stroke(); }
    // smug half-closed eyes, raised brow
    x.strokeStyle = '#3a2a20'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(88, 128); x.quadraticCurveTo(102, 120, 116, 130); x.stroke();
    x.beginPath(); x.moveTo(140, 124); x.quadraticCurveTo(156, 112, 170, 122); x.stroke();
    x.fillStyle = '#2a1d16'; x.beginPath(); x.ellipse(102, 146, 9, 4, 0, 0, PI); x.ellipse(155, 144, 9, 4, 0, 0, PI); x.fill();
    x.strokeStyle = '#2a1d16'; x.lineWidth = 3; x.beginPath(); x.moveTo(92, 144); x.lineTo(112, 144); x.moveTo(145, 142); x.lineTo(165, 142); x.stroke();
    // nose, cheeks, moustache, smirk
    x.fillStyle = '#d99f7d'; x.beginPath(); x.ellipse(128, 166, 13, 11, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(230,110,100,0.35)'; x.beginPath(); x.arc(88, 178, 13, 0, 7); x.arc(168, 178, 13, 0, 7); x.fill();
    x.fillStyle = '#6b6560'; x.beginPath(); x.moveTo(98, 188); x.quadraticCurveTo(128, 172, 158, 188); x.quadraticCurveTo(128, 184, 98, 188); x.fill();
    x.strokeStyle = '#7a3a30'; x.lineWidth = 4; x.beginPath(); x.moveTo(108, 198); x.quadraticCurveTo(132, 206, 154, 192); x.stroke();
    // varnish crackle
    x.fillStyle = 'rgba(255,230,170,0.08)'; x.fillRect(0, 0, w, h);
  }, {}, 0.5);
  noShadow(add(g, planeG(W - 2 * fr + 0.01, H - 2 * fr + 0.01), pic, 0, H / 2, 0.006));
  noShadow(RB(g, 0.24, 0.05, 0.012, 0.005, goldM, 0, 0.025, 0.04));
  noShadow(add(g, planeG(0.22, 0.04), texMat('portraitPlate', 128, 24, (x, w, h) => { x.fillStyle = '#e2b24a'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a2a10'; fitText(x, '창업주 회장님', w / 2, h / 2 + 1, 120, 16); }), 0, 0.05, 0.047));
  return { name: '회장님 초상화', mass: 3, price: 3000000, material: 'glass', mount: 'wall' };
};
D.ceoDesk = (g) => {
  const L = 2.6, Dp = 1.15, H = 0.78;
  const wood = T.wood(), woodT = woodRep(2.6, 1.15), goldM = gold();
  const leather = T.leather('#2f5a46');
  RB(g, L, 0.06, Dp, 0.025, woodT, 0, H - 0.06, 0, 2);
  RB(g, L - 0.6, 0.012, Dp - 0.35, 0.01, leather, 0, H - 0.002, 0.05);
  for (const sx of [-1, 1]) {
    RB(g, 0.62, H - 0.08, Dp - 0.1, 0.02, wood, sx * (L / 2 - 0.36), 0.02, 0, 2);
    for (let i = 0; i < 3; i++) {
      RB(g, 0.54, 0.19, 0.02, 0.008, woodRep(1, 1), sx * (L / 2 - 0.36), 0.08 + i * 0.21, -(Dp - 0.1) / 2 - 0.005);
      C(g, 0.012, 0.012, 0.1, goldM, sx * (L / 2 - 0.36), 0.17 + i * 0.21, -(Dp - 0.1) / 2 - 0.03, 8, 0, 0, PI / 2);
    }
    RB(g, 0.66, 0.04, Dp - 0.06, 0.01, M('#2f1b10', 0.6), sx * (L / 2 - 0.36), 0, 0);
  }
  // front modesty panel with raised panels + gold trim (front = +Z faces visitors)
  RB(g, L - 1.3, H - 0.16, 0.05, 0.015, wood, 0, 0.1, Dp / 2 - 0.08);
  for (const sx of [-1, 1]) RB(g, 0.42, 0.4, 0.03, 0.012, woodRep(1, 1), sx * 0.24, 0.2, Dp / 2 - 0.04);
  for (const sx of [-1, 1]) RB(g, 0.6, 0.5, 0.03, 0.012, woodRep(1, 1), sx * (L / 2 - 0.36), 0.12, Dp / 2 - 0.035);
  B(g, L - 0.04, 0.02, 0.01, goldM, 0, H - 0.1, Dp / 2 + 0.002);
  return { name: '대표이사 책상', mass: 120, price: 9000000, material: 'wood' };
};
function execChair(g, col, tall) {
  const lea = T.leather(col), dk = M(shade(col, -0.12), 0.5), ch = chrome(), btn = M(shade(col, -0.2), 0.5);
  RB(g, 0.6, 0.14, 0.56, 0.06, lea, 0, 0.44, 0.02, 2);
  const bh = tall ? 0.95 : 0.6;
  const back = grp(g, 0, 0.55, -0.26, -0.12);
  RB(back, 0.58, bh, 0.14, 0.06, lea, 0, 0, 0, 2);
  if (tall) {
    RB(back, 0.6, 0.16, 0.18, 0.07, lea, 0, bh - 0.12, 0.01, 2);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) S(back, btn, -0.16 + c * 0.16 + (r % 2) * 0.08 - 0.04, 0.16 + r * 0.17, 0.072, 0.012, 0.012, 0.008, 6, 4);
  } else for (let i = 0; i < 3; i++) B(back, 0.5, 0.008, 0.02, btn, 0, 0.15 + i * 0.15, 0.066);
  for (const s of [-1, 1]) {
    RB(g, 0.08, 0.06, 0.42, 0.025, lea, s * 0.33, 0.66, 0.02, 2);
    B(g, 0.04, 0.16, 0.05, dk, s * 0.33, 0.5, 0.12);
  }
  C(g, 0.035, 0.035, 0.3, ch, 0, 0.12, 0, 10);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2, s = grp(g, 0, 0, 0, 0, a, 0);
    RB(s, 0.05, 0.04, 0.34, 0.015, ch, 0, 0.07, 0.16, 1, -0.1);
    S(s, M('#1d1e22', 0.5), 0, 0.035, 0.33, 0.035, 0.035, 0.03, 8, 6);
  }
}
D.ceoChair = (g) => { execChair(g, '#6e3424', true); return { name: '대표이사 의자', mass: 25, price: 2500000, material: 'soft' }; };
D.boardChair = (g) => { execChair(g, '#2d2e33', false); return { name: '회의실 의자', mass: 15, price: 600000, material: 'soft' }; };
D.nameplate = (g, o) => {
  const text = o.text || '부장';
  RB(g, 0.32, 0.03, 0.08, 0.01, M('#2a1a10', 0.45), 0, 0, 0);
  const pl = grp(g, 0, 0.03, 0, -0.45);
  RB(pl, 0.3, 0.075, 0.025, 0.006, M('#20180f', 0.4), 0, 0, 0);
  noShadow(add(pl, planeG(0.28, 0.062), texMat('nameplate:' + text, 256, 56, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f3d27a'); gr.addColorStop(1, '#c69530'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#8a6518'; x.lineWidth = 3; x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = '#2a1d0a'; fitText(x, text, w / 2, h / 2 + 2, 230, 38, 'bold');
  }, {}, 0.3), 0, 0.0375, 0.0131));
  return { name: '명패', mass: 0.5, price: 50000, material: 'wood' };
};
D.boardTable = (g, o) => {
  const L = o.w || 5.0, Dp = 1.6, H = 0.76;
  const top = G('boardTop' + L, () => {
    const s = new THREE.Shape(), hw = L / 2, hd = Dp / 2, r = hd;
    s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.absarc(hw - r, 0, r, -PI / 2, PI / 2, false); s.lineTo(-hw + r, hd); s.absarc(-hw + r, 0, r, PI / 2, PI * 1.5, false);
    const ge = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 12 });
    ge.rotateX(-PI / 2); return ge;
  });
  add(g, top, woodRep(0.8, 0.8), 0, H - 0.055, 0);
  const strip = G('boardStrip' + L, () => { const ge = new THREE.PlaneGeometry(L - 1.9, 0.32); ge.rotateX(-PI / 2); return ge; });
  noShadow(add(g, strip, T.leather('#3b2a22'), 0, H + 0.0005, 0));
  const wood = T.wood();
  const nb = Math.max(2, Math.round(L / 2.2));
  for (let i = 0; i < nb; i++) {
    const x = -L / 2 + 0.9 + (L - 1.8) * i / (nb - 1);
    RB(g, 0.32, H - 0.06, 0.6, 0.04, wood, x, 0.05, 0, 2);
    RB(g, 0.5, 0.05, 0.8, 0.02, M('#2f1b10', 0.6), x, 0, 0);
  }
  for (let i = 0; i < 3; i++) { const x = -L / 4 + i * L / 4; C(g, 0.035, 0.04, 0.012, M('#1f2024', 0.4), x, H, 0, 12); C(g, 0.005, 0.005, 0.22, M('#1f2024', 0.4), x, H + 0.01, 0, 6, 0.5); S(g, M('#2a2b30', 0.5), x, H + 0.2, 0.1, 0.014, 0.014, 0.02, 8, 6); }
  return { name: '대회의실 테이블', mass: 0, price: 4000000, material: 'wood' };
};
D.trophy = (g) => {
  const gm = M('#e9b93c', 0.22, 0.85), base = M('#1f1f22', 0.4);
  RB(g, 0.16, 0.06, 0.16, 0.01, base, 0, 0, 0);
  RB(g, 0.12, 0.04, 0.12, 0.008, M('#5a3522', 0.5), 0, 0.06, 0);
  C(g, 0.02, 0.04, 0.03, gm, 0, 0.1, 0, 12);
  C(g, 0.012, 0.012, 0.07, gm, 0, 0.13, 0, 8);
  S(g, gm, 0, 0.2, 0, 0.025, 0.012, 0.025, 10, 6);
  add(g, latheG('cup', [[0.0, 0], [0.03, 0.0], [0.06, 0.04], [0.075, 0.1], [0.08, 0.13], [0.075, 0.13], [0.06, 0.06], [0.0, 0.03]], 18), M('#e9b93c', 0.22, 0.85, { side: THREE.DoubleSide }, 'cupGold'), 0, 0.2, 0);
  for (const s of [-1, 1]) add(g, torG(0.035, 0.008, 6, 12, PI), gm, s * 0.075, 0.28, 0, 0, 0, s > 0 ? -PI / 2 : PI / 2);
  noShadow(add(g, planeG(0.1, 0.035), texMat('trophyPlate', 96, 32, (x, w, h) => { x.fillStyle = '#e2b24a'; x.fillRect(0, 0, w, h); x.fillStyle = '#2a1d0a'; fitText(x, '올해의 사장', w / 2, h / 2, 90, 15); }), 0, 0.03, 0.081));
  return { name: '트로피', mass: 1.2, price: 70000, material: 'metal', hold: true };
};
D.globe = (g) => {
  const wood = M('#6a3f22', 0.5), brass = M('#c99a3a', 0.3, 0.7);
  for (let i = 0; i < 3; i++) { const a = i * 2.09; rod(g, 0.022, wood, [Math.cos(a) * 0.1, 0.5, Math.sin(a) * 0.1], [Math.cos(a) * 0.26, 0.0, Math.sin(a) * 0.26], 8); S(g, wood, Math.cos(a) * 0.26, 0.02, Math.sin(a) * 0.26, 0.03, 0.02, 0.03, 8, 6); }
  add(g, torG(0.3, 0.025, 6, 32), wood, 0, 0.62, 0, PI / 2);
  for (let i = 0; i < 3; i++) { const a = i * 2.09; rod(g, 0.015, wood, [Math.cos(a) * 0.1, 0.5, Math.sin(a) * 0.1], [Math.cos(a) * 0.29, 0.62, Math.sin(a) * 0.29], 6); }
  const tilt = grp(g, 0, 0.66, 0, 0, 0, 0.41);
  add(tilt, torG(0.27, 0.01, 4, 28, PI * 1.25), brass, 0, 0, 0, 0, 0, -PI * 0.12);
  const map = texMat('globeMap', 256, 128, (x, w, h) => {
    x.fillStyle = '#7fb1c9'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(60,90,110,0.3)'; x.lineWidth = 1; for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, i * h / 6); x.lineTo(w, i * h / 6); x.stroke(); } for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(i * w / 12, 0); x.lineTo(i * w / 12, h); x.stroke(); }
    const r = rng(8); x.fillStyle = '#d9c48b';
    for (const [cx, cy, s] of [[50, 40, 26], [70, 82, 18], [128, 38, 24], [140, 70, 20], [190, 45, 30], [210, 92, 14], [118, 112, 30]]) {
      x.beginPath(); for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2, rr = s * (0.6 + r() * 0.6); x.lineTo(cx + Math.cos(a) * rr * 1.2, cy + Math.sin(a) * rr * 0.8); } x.fill();
    }
    x.fillStyle = 'rgba(80,120,60,0.35)'; x.beginPath(); x.arc(190, 45, 10, 0, 7); x.arc(60, 40, 9, 0, 7); x.fill();
  }, {}, 0.4);
  add(tilt, sphG(24, 16), map, 0, 0, 0, 0, 0, 0, 0.24);
  return { name: '지구본', mass: 3, price: 450000, material: 'wood' };
};
D.golfSet = (g) => {
  const mat = texMat('puttMat', 64, 256, (x, w, h) => {
    x.fillStyle = '#3f9a4a'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#47a352' : '#3a9145'; x.fillRect(0, i * 32, w, 32); }
    x.fillStyle = '#f4f4ef'; x.fillRect(0, 0, 3, h); x.fillRect(w - 3, 0, 3, h);
    x.fillStyle = '#1c1c1c'; x.beginPath(); x.arc(32, 26, 7, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke();
  }, {}, 0.95);
  RB(g, 0.5, 0.02, 2.4, 0.008, M('#2f7d3a', 0.9), 0, 0, 0);
  noShadow(add(g, planeG(0.48, 2.38), mat, 0, 0.0205, 0, -PI / 2));
  // little ramp at the hole end
  add(g, G('puttRamp', () => { const ge = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 3, 1, false, 0, PI / 2); ge.rotateZ(PI / 2); ge.scale(1, 0.18, 0.6); return ge; }), M('#2f7d3a', 0.9), 0, 0.02, -1.2, 0, PI, 0);
  C(g, 0.004, 0.004, 0.42, M('#eeeeea', 0.4), 0, 0.02, -0.98, 6);
  noShadow(add(g, G('flagG', () => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.12, -0.04, 0, 0, -0.08, 0], 3)); ge.computeVertexNormals(); return ge; }), M('#e23b2e', 0.6, 0, { side: THREE.DoubleSide }, 'flag'), 0, 0.44, -0.98));
  // putter lying on the mat
  const club = grp(g, 0.08, 0.03, 0.3, 0, 0.25, 0);
  rod(club, 0.007, chrome(), [0, 0.0, -0.4], [0, 0.0, 0.5], 6);
  rod(club, 0.012, M('#1d1d20', 0.6), [0, 0.0, 0.4], [0, 0.0, 0.62], 8);
  RB(club, 0.1, 0.03, 0.025, 0.008, chrome(), 0.03, -0.015, -0.42);
  const ball = M('#fbfbf8', 0.35);
  [[0.1, -0.2], [-0.12, 0.7], [-0.05, 0.85]].forEach(([x, z]) => S(g, ball, x, 0.042, z, 0.021, 0.021, 0.021, 10, 6));
  return { name: '퍼팅 연습기', mass: 4, price: 3500000, material: 'soft' };
};
D.rug = (g, o) => {
  const w = o.w || 3, d = o.d || 2;
  const t = texMat('persianRug', 384, 256, (x, W, H) => {
    x.fillStyle = '#7a1f2a'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#1f2d55'; x.fillRect(0, 0, W, 28); x.fillRect(0, H - 28, W, 28); x.fillRect(0, 0, 28, H); x.fillRect(W - 28, 0, 28, H);
    x.strokeStyle = '#d9a93a'; x.lineWidth = 3; x.strokeRect(32, 32, W - 64, H - 64); x.strokeRect(10, 10, W - 20, H - 20);
    x.fillStyle = '#d9a93a'; for (let i = 0; i < 24; i++) { x.beginPath(); x.arc(20 + i * 15.5, 14, 3, 0, 7); x.arc(20 + i * 15.5, H - 14, 3, 0, 7); x.fill(); }
    x.save(); x.translate(W / 2, H / 2);
    x.fillStyle = '#1f2d55'; x.beginPath(); x.moveTo(-110, 0); x.lineTo(0, -80); x.lineTo(110, 0); x.lineTo(0, 80); x.closePath(); x.fill();
    x.fillStyle = '#d9a93a'; x.beginPath(); x.moveTo(-70, 0); x.lineTo(0, -50); x.lineTo(70, 0); x.lineTo(0, 50); x.closePath(); x.fill();
    x.fillStyle = '#b8323c'; x.beginPath(); x.arc(0, 0, 24, 0, 7); x.fill();
    x.fillStyle = '#f2e6c8'; for (let i = 0; i < 8; i++) { const a = i * PI / 4; x.beginPath(); x.arc(Math.cos(a) * 36, Math.sin(a) * 26, 5, 0, 7); x.fill(); }
    x.restore();
    x.fillStyle = '#d9a93a'; for (const [cx, cy] of [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]]) { x.beginPath(); x.moveTo(cx - 18, cy); x.lineTo(cx, cy - 14); x.lineTo(cx + 18, cy); x.lineTo(cx, cy + 14); x.fill(); }
    const r = rng(3); x.globalAlpha = 0.12; for (let i = 0; i < 3000; i++) { x.fillStyle = r() < 0.5 ? '#000' : '#fff'; x.fillRect(r() * W, r() * H, 1.5, 1.5); } x.globalAlpha = 1;
  }, {}, 0.95);
  B(g, w, 0.012, d, M('#5a1720', 0.95), 0, 0, 0);
  const top = noShadow(add(g, planeG(w, d), t, 0, 0.0125, 0, -PI / 2)); top.receiveShadow = true;
  for (const sx of [-1, 1]) noShadow(B(g, 0.06, 0.006, d - 0.04, M('#efe4c8', 0.9), sx * (w / 2 + 0.03), 0, 0));
  return { name: '카펫', mass: 8, price: 2000000, material: 'soft' };
};
D.wallLamp = (g) => {
  const brass = M('#c99a3a', 0.3, 0.7);
  RB(g, 0.12, 0.2, 0.03, 0.01, brass, 0, 0, -0.08);
  rod(g, 0.012, brass, [0, 0.1, -0.07], [0, 0.18, 0.06], 6);
  C(g, 0.025, 0.025, 0.05, brass, 0, 0.17, 0.06, 10);
  noShadow(S(g, glow('#fff6dc', '#ffcf7a', 2.0), 0, 0.25, 0.06, 0.035, 0.045, 0.035, 10, 6));
  add(g, cylG(0.08, 0.12, 0.16, 18, true), M('#f1e3c4', 0.9, 0, { side: THREE.DoubleSide, emissive: '#ffcf8a', emissiveIntensity: 0.55 }, 'lampShade2'), 0, 0.3, 0.06).castShadow = false;
  return { name: '벽등', mass: 0, price: 150000, material: 'metal', mount: 'wall' };
};
function bookRow(seed, width, hMin, hMax) {
  return scatterG('books' + seed + ',' + width, new THREE.BoxGeometry(1, 1, 1), 60, seed, (() => { let x = -width / 2; return (i, r) => {
    if (x > width / 2 - 0.06) return null;
    const bw = 0.03 + r() * 0.035, bh = hMin + r() * (hMax - hMin), bd = 0.2 + r() * 0.05;
    const lean = x > width / 2 - 0.2 && r() < 0.5 ? 0.25 : 0;
    const t = { x: x + bw / 2 + (lean ? 0.05 : 0), y: bh / 2 * Math.cos(lean) + 0.002, z: 0, rz: -lean, sx: bw, sy: bh, sz: bd };
    x += bw + 0.002 + (lean ? 0.12 : 0);
    return t;
  }; })());
}
D.bookcase = (g) => {
  const W = 1.6, H = 2.1, Dp = 0.4;
  const wood = T.wood(), goldM = gold();
  B(g, 0.04, H, Dp, wood, -W / 2 + 0.02, 0, 0); B(g, 0.04, H, Dp, wood, W / 2 - 0.02, 0, 0);
  B(g, W, H, 0.02, M('#3f2416', 0.7), 0, 0, -Dp / 2 + 0.01);
  RB(g, W + 0.06, 0.06, Dp + 0.04, 0.015, wood, 0, H - 0.06, 0.01);
  B(g, W, 0.1, Dp, M('#2f1b10', 0.6), 0, 0, 0);
  // lower closed cabinet
  for (const sx of [-1, 1]) { RB(g, W / 2 - 0.05, 0.56, 0.02, 0.008, woodRep(1, 1), sx * (W / 4 - 0.005), 0.12, Dp / 2 - 0.005); S(g, goldM, sx * 0.06, 0.45, Dp / 2 + 0.015, 0.018, 0.018, 0.018, 8, 6); }
  const shelfY = [0.7, 1.15, 1.6];
  for (const y of [0.68, ...shelfY.slice(1)]) B(g, W - 0.08, 0.03, Dp - 0.02, wood, 0, y, 0);
  const cols = ['#7a1f2a', '#1f3b6b', '#2f5a3a', '#c9a66b', '#2a2a2e', '#8a4a20', '#5a2a5e'];
  shelfY.forEach((y, si) => {
    const geo = bookRow(40 + si, W - 0.12 - (si === 1 ? 0.45 : 0), 0.2, 0.32);
    cols.forEach(() => {});
    add(g, geo, M(cols[si * 2 % cols.length], 0.7), (si === 1 ? -0.22 : 0), y + 0.03, 0.02);
    const geo2 = bookRow(70 + si, W - 0.12 - (si === 1 ? 0.45 : 0), 0.18, 0.28);
    add(g, geo2, M(cols[(si * 2 + 3) % cols.length], 0.7), (si === 1 ? -0.22 : 0) + 0.018, y + 0.03, 0.03, 0, 0, 0, 1, 1, 0.95);
  });
  // gold spine bands
  for (let i = 0; i < 3; i++) B(g, W - 0.14 - (i === 1 ? 0.45 : 0), 0.012, 0.005, M('#d9a93a', 0.4, 0.6), (i === 1 ? -0.22 : 0), shelfY[i] + 0.22, 0.155);
  // decor on the middle shelf: small globe + trophy shapes
  S(g, M('#7fb1c9', 0.4), 0.55, shelfY[1] + 0.15, 0, 0.1, 0.1, 0.1, 14, 10);
  C(g, 0.05, 0.06, 0.04, M('#c99a3a', 0.3, 0.7), 0.55, shelfY[1] + 0.03, 0, 10);
  return { name: '책장', mass: 70, price: 1200000, material: 'wood' };
};
D.liquorCabinet = (g) => {
  const W = 1.0, H = 1.8, Dp = 0.45;
  const wood = T.wood(), goldM = gold();
  B(g, 0.04, H, Dp, wood, -W / 2 + 0.02, 0, 0); B(g, 0.04, H, Dp, wood, W / 2 - 0.02, 0, 0);
  RB(g, W + 0.04, 0.06, Dp + 0.03, 0.015, wood, 0, H - 0.06, 0.01);
  B(g, W - 0.08, 0.8, Dp - 0.02, wood, 0, 0.0, 0);
  for (const sx of [-1, 1]) { RB(g, W / 2 - 0.05, 0.7, 0.02, 0.008, woodRep(1, 1), sx * (W / 4 - 0.005), 0.05, Dp / 2); C(g, 0.01, 0.01, 0.12, goldM, sx * 0.06, 0.4, Dp / 2 + 0.02, 8); }
  // mirrored back + warm strip light
  noShadow(B(g, W - 0.08, H - 0.9, 0.01, M('#b9a585', 0.15, 0.6), 0, 0.82, -Dp / 2 + 0.02));
  noShadow(B(g, W - 0.1, 0.015, 0.03, glow('#fff1d0', '#ffc46a', 1.8), 0, H - 0.08, 0.0));
  for (const y of [0.8, 1.28]) B(g, W - 0.08, 0.02, Dp - 0.04, M('#cfe6ee', 0.05, 0, { transparent: true, opacity: 0.35 }, 'shelfGlass'), 0, y, 0);
  // bottles
  const amber = M('#b8641e', 0.15, 0, { emissive: '#5a2a08', emissiveIntensity: 0.25 }, 'amber'), wine = M('#3a1218', 0.2), green = M('#2f5a2f', 0.2), crystal = M('#dff2f8', 0.05, 0, { transparent: true, opacity: 0.5 }, 'crystal');
  const sqB = (x, y, m) => { RB(g, 0.08, 0.2, 0.08, 0.012, m, x, y, 0.02); C(g, 0.015, 0.02, 0.05, m, x, y + 0.2, 0.02, 8); C(g, 0.018, 0.018, 0.025, M('#1d1d1d', 0.5), x, y + 0.25, 0.02, 8); RB(g, 0.06, 0.07, 0.005, 0.002, M('#efe3c4', 0.7), x, y + 0.05, 0.062); };
  const rB = (x, y, m) => add(g, latheG('wineB', [[0, 0], [0.035, 0], [0.037, 0.18], [0.03, 0.22], [0.012, 0.25], [0.012, 0.31], [0, 0.31]], 10), m, x, y, 0.02);
  sqB(-0.34, 0.82, amber); rB(-0.2, 0.82, wine); sqB(-0.06, 0.82, amber); rB(0.08, 0.82, green); rB(0.2, 0.82, wine); sqB(0.34, 0.82, amber);
  add(g, latheG('decanter', [[0, 0], [0.07, 0], [0.09, 0.06], [0.08, 0.14], [0.03, 0.2], [0.03, 0.24], [0.045, 0.26], [0, 0.29]], 14), crystal, -0.25, 1.3, 0.02).castShadow = false;
  for (let i = 0; i < 4; i++) add(g, cylG(0.035, 0.03, 0.08, 10, true), crystal, 0.0 + i * 0.1, 1.3, 0.05).castShadow = false;
  rB(0.38, 1.3, amber);
  // glass doors
  for (const sx of [-1, 1]) {
    const dx = sx * (W / 4 - 0.005);
    noShadow(add(g, planeG(W / 2 - 0.06, H - 0.9), M('#cfe6ee', 0.05, 0, { transparent: true, opacity: 0.16, depthWrite: false }, 'cabGlass'), dx, 0.8 + (H - 0.86) / 2, Dp / 2 + 0.005));
    B(g, W / 2 - 0.04, 0.04, 0.025, wood, dx, 0.8, Dp / 2); B(g, W / 2 - 0.04, 0.04, 0.025, wood, dx, H - 0.1, Dp / 2);
    B(g, 0.04, H - 0.9, 0.025, wood, dx - sx * (W / 4 - 0.03), 0.8, Dp / 2); B(g, 0.04, H - 0.9, 0.025, wood, dx + sx * (W / 4 - 0.03), 0.8, Dp / 2);
    S(g, goldM, sx * 0.05, 1.2, Dp / 2 + 0.02, 0.015, 0.015, 0.015, 8, 6);
  }
  return { name: '양주 진열장', mass: 80, price: 5000000, material: 'wood' };
};

// ================================================================= 3층 대강당
D.podium = (g) => {
  const wood = T.wood(), goldM = gold();
  RB(g, 0.7, 0.06, 0.55, 0.02, M('#2f1b10', 0.6), 0, 0, 0);
  RB(g, 0.56, 0.95, 0.42, 0.03, wood, 0, 0.05, -0.02, 2);
  for (const sx of [-1, 1]) RB(g, 0.06, 0.95, 0.44, 0.025, woodRep(1, 1), sx * 0.29, 0.05, -0.02, 2);
  const top = grp(g, 0, 1.03, 0.0, 0.32);
  RB(top, 0.74, 0.05, 0.5, 0.02, wood, 0, -0.025, 0, 2);
  B(top, 0.7, 0.03, 0.02, wood, 0, 0.02, 0.22);
  // emblem
  C(g, 0.13, 0.13, 0.025, goldM, 0, 0.6, 0.2, 28, PI / 2);
  noShadow(add(g, G('emb', () => new THREE.CircleGeometry(0.11, 28)), texMat('podiumEmblem', 128, 128, (x, w, h) => {
    x.fillStyle = '#1f3b6b'; x.beginPath(); x.arc(64, 64, 64, 0, 7); x.fill();
    x.strokeStyle = '#e2b24a'; x.lineWidth = 5; x.beginPath(); x.arc(64, 64, 52, 0, 7); x.stroke();
    x.fillStyle = '#f2d27a'; fitText(x, '뿌개', 64, 66, 90, 40);
  }), 0, 0.73, 0.234));
  // gooseneck mic
  const gm = M('#2a2b30', 0.5, 0.3);
  rod(g, 0.008, gm, [0.18, 1.1, 0.05], [0.16, 1.25, 0.14], 6); rod(g, 0.008, gm, [0.16, 1.25, 0.14], [0.1, 1.32, 0.22], 6);
  S(g, M('#1b1c20', 0.6), 0.09, 1.33, 0.235, 0.025, 0.035, 0.025, 10, 6);
  add(g, torG(0.02, 0.004, 4, 10), M('#d8352a', 0.4, 0, { emissive: '#ff2a1a', emissiveIntensity: 0.8 }, 'micRing'), 0.09, 1.31, 0.235, PI / 2);
  return { name: '단상', mass: 40, price: 800000, material: 'wood' };
};
D.stage = (g, o) => {
  const w = o.w || 6, d = o.d || 3, h = o.h || 0.6;
  const topM = M('#ffffff', 0.45, 0, { map: repTex(tex2.hallFloor(), w / 1.5, d / 1.5, 'hf') }, 'stageTop' + w + 'x' + d);
  RB(g, w, 0.05, d, 0.012, topM, 0, h - 0.05, 0);
  B(g, w - 0.04, h - 0.05, d - 0.04, M('#2a2420', 0.9), 0, 0, 0);
  // pleated skirt (front + sides)
  const sk = G('skirt' + w, () => { const n = Math.round(w * 14), ge = new THREE.PlaneGeometry(w, h - 0.06, n, 1), p = ge.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 44) * 0.012); ge.computeVertexNormals(); return ge; });
  add(g, sk, M('#1e2030', 0.95, 0, { side: THREE.DoubleSide }, 'skirtM'), 0, (h - 0.06) / 2, d / 2 + 0.012);
  noShadow(B(g, w, 0.015, 0.02, glow('#fff1d0', '#ffcf7a', 1.2), 0, h - 0.065, d / 2 + 0.02));
  // stairs on the front-right
  const sx = w / 2 - 0.6;
  for (let i = 0; i < 2; i++) RB(g, 0.9, h * (i + 1) / 3, 0.32, 0.012, M('#2f2a26', 0.8), sx, 0, d / 2 + 0.36 + 0.32 * (1 - i) - 0.32, 1);
  for (let i = 0; i < 2; i++) noShadow(B(g, 0.9, 0.01, 0.04, M('#e2b43c', 0.5), sx, h * (i + 1) / 3, d / 2 + 0.36 + 0.32 * (1 - i) - 0.32 + 0.14));
  return { name: '무대', mass: 0, price: 2000000, material: 'wood' };
};
D.hallScreen = (g) => {
  const tr = M('#c9ced4', 0.3, 0.65), blk = M('#1b1c20', 0.5);
  const SW = 4.6, SH = 2.6, y0 = 1.05, TH = 4.05, cx = SW / 2 + 0.35;
  // two triangular truss towers + top beam
  const truss = (x0, z0) => {
    const pts = [[-0.14, -0.1], [0.14, -0.1], [0, 0.14]];
    for (const [px, pz] of pts) C(g, 0.022, 0.022, TH, tr, x0 + px, 0.04, z0 + pz, 8);
    for (let k = 0; k < 13; k++) {
      const y = 0.1 + k * 0.3, a = pts[k % 3], b = pts[(k + 1) % 3];
      rod(g, 0.01, tr, [x0 + a[0], y, z0 + a[1]], [x0 + b[0], y + 0.3, z0 + b[1]], 5);
    }
    RB(g, 0.6, 0.04, 0.6, 0.01, M('#5c636b', 0.5, 0.4), x0, 0, z0);
  };
  truss(-cx, 0); truss(cx, 0);
  for (const [dy, dz] of [[0, -0.1], [0, 0.14], [-0.3, 0.02]]) rod(g, 0.022, tr, [-cx - 0.15, TH + dy, dz], [cx + 0.15, TH + dy, dz], 8);
  for (let k = 0; k < 16; k++) { const x = -cx + (2 * cx) * k / 16; rod(g, 0.01, tr, [x, TH - 0.3, 0.02], [x + 2 * cx / 16, TH, k % 2 ? -0.1 : 0.14], 5); }
  // screen
  RB(g, SW + 0.16, SH + 0.16, 0.08, 0.03, blk, 0, y0 - 0.08, 0.2, 2);
  for (const sx of [-1, 1]) rod(g, 0.012, M('#333', 0.5), [sx * SW * 0.35, y0 + SH + 0.08, 0.2], [sx * SW * 0.35, TH - 0.3, 0.05], 4);
  const slide = glowMat('townhall', 512, 290, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1f3b7b'); gr.addColorStop(1, '#13224a'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.06)'; x.beginPath(); x.arc(440, 60, 140, 0, 7); x.fill();
    x.fillStyle = '#f2c21b'; x.fillRect(40, 54, 60, 6);
    x.fillStyle = '#ffffff'; fitText(x, '전사 타운홀', 40, 100, 300, 54, 'bold', 'left');
    x.fillStyle = '#bcd0f2'; fitText(x, '2026 하반기 · 다 함께 성장합시다!', 40, 148, 300, 20, 'normal', 'left');
    x.fillStyle = '#f2c21b'; [36, 52, 44, 76, 98].forEach((v, i) => x.fillRect(340 + i * 28, 250 - v * 1.3, 18, v * 1.3));
    x.strokeStyle = '#ff6a5a'; x.lineWidth = 4; x.beginPath(); x.moveTo(340, 220); x.lineTo(400, 196); x.lineTo(450, 150); x.lineTo(480, 110); x.stroke();
    x.fillStyle = '#ffffff'; x.font = `bold 15px ${KFONT}`; x.textAlign = 'left'; x.fillText('대표이사 인사말 · 실적 발표 · 경품 추첨', 40, 214);
    x.fillStyle = '#8fa6cf'; x.font = `13px ${KFONT}`; x.fillText('3층 대강당 · 오후 4시', 40, 250);
  }, 0.85);
  noShadow(add(g, planeG(SW, SH), slide, 0, y0 + SH / 2, 0.242));
  return { name: '대형 화면', mass: 0, price: 25000000, material: 'glass' };
};
D.foldchair = (g) => {
  const tube = M('#9aa1a8', 0.35, 0.55), seat = M('#3a3d44', 0.6);
  RB(g, 0.42, 0.04, 0.38, 0.015, seat, 0, 0.44, 0.02, 1);
  const back = grp(g, 0, 0.62, -0.2, -0.1);
  RB(back, 0.4, 0.2, 0.03, 0.012, seat, 0, 0.05, 0, 1);
  rod(g, 0.012, tube, [-0.2, 0, -0.18], [-0.2, 0.86, -0.24]); rod(g, 0.012, tube, [0.2, 0, -0.18], [0.2, 0.86, -0.24]);
  rod(g, 0.012, tube, [-0.2, 0, 0.2], [-0.2, 0.44, -0.12]); rod(g, 0.012, tube, [0.2, 0, 0.2], [0.2, 0.44, -0.12]);
  rod(g, 0.01, tube, [-0.2, 0.08, 0.17], [0.2, 0.08, 0.17], 6); rod(g, 0.01, tube, [-0.2, 0.08, -0.19], [0.2, 0.08, -0.19], 6);
  for (const s of [-1, 1]) for (const z of [-0.18, 0.2]) S(g, M('#1d1e22', 0.7), s * 0.2, 0.01, z, 0.018, 0.012, 0.018, 6, 4);
  return { name: '접이식 의자', mass: 3.5, price: 40000, material: 'metal' };
};
D.balloon = (g, o) => {
  const col = o.color || '#e8443a';
  const m = M(col, 0.22, 0, { emissive: col, emissiveIntensity: 0.08 }, 'balloon' + col);
  const bal = latheG('balloon', [[0, 0], [0.03, 0.01], [0.1, 0.06], [0.15, 0.15], [0.16, 0.24], [0.14, 0.32], [0.09, 0.38], [0, 0.4]], 18);
  add(g, bal, m, 0, 0.92, 0);
  C(g, 0.006, 0.022, 0.03, m, 0, 0.9, 0, 8);
  S(g, M('#ffffff', 0.2, 0, { transparent: true, opacity: 0.55 }, 'hilite'), -0.06, 1.24, 0.11, 0.03, 0.05, 0.015, 8, 6).castShadow = false;
  const str = G('balloonStr', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(0.05, 0.65, 0.02), new THREE.Vector3(-0.04, 0.4, -0.01), new THREE.Vector3(0.03, 0.15, 0.01), new THREE.Vector3(0, 0, 0)]), 16, 0.003, 3));
  noShadow(add(g, str, M('#f4f4f0', 0.6), 0, 0, 0));
  return { name: '풍선', mass: 0.02, price: 3000, material: 'plastic', floats: true };
};
const FLOWER_COLS = ['#ffffff', '#ffb3c7', '#ffd23a', '#ff6f8f'];
D.wreath = (g, o) => {
  const text = o.text || '축 창립기념', from = o.from || '임직원 일동';
  const leg = M('#c9a26a', 0.7);
  rod(g, 0.022, leg, [-0.32, 0, 0.12], [0, 1.6, 0], 8); rod(g, 0.022, leg, [0.32, 0, 0.12], [0, 1.6, 0], 8); rod(g, 0.022, leg, [0, 0, -0.3], [0, 1.6, 0], 8);
  rod(g, 0.012, leg, [-0.2, 0.6, 0.08], [0.2, 0.6, 0.08], 6);
  // flower disc: green backing + concentric rings of flowers
  const cy = 1.38;
  add(g, cylG(0.46, 0.46, 0.08, 24), M('#3f7f3a', 0.8), 0, cy, -0.02, PI / 2);
  const leaves = scatterG('wreathLeaf', new THREE.SphereGeometry(1, 6, 3), 26, 5, (i, r) => { const a = (i / 26) * PI * 2; return { x: Math.cos(a) * 0.5, y: Math.sin(a) * 0.5, z: -0.03, rz: a, rx: 0.2, sx: 0.12, sy: 0.05, sz: 0.012 }; });
  add(g, leaves, M('#4f9a45', 0.65, 0, { side: THREE.DoubleSide }, 'wreathLeafM'), 0, cy, 0);
  const rings = [[0.4, 22, 0], [0.31, 18, 1], [0.22, 14, 0], [0.13, 9, 3], [0.0, 1, 2]];
  rings.forEach(([rr, n, ci], k) => {
    const geo = scatterG('wr' + k, new THREE.SphereGeometry(1, 7, 4), n, 10 + k, (i, r) => { const a = (i / n) * PI * 2 + k * 0.2; return { x: Math.cos(a) * rr, y: Math.sin(a) * rr, z: 0.03 + k * 0.012, sx: 0.06 + r() * 0.012, sy: 0.06, sz: 0.035 }; });
    add(g, geo, M(FLOWER_COLS[ci], 0.7), 0, cy, 0.02);
  });
  // ribbons
  const rib = (key, str, col) => texMat('rib:' + key + str, 48, 384, (x, w, h) => {
    x.fillStyle = col; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1d1d1d'; const chars = [...str.replace(/\s/g, '')];
    const step = Math.min(56, (h - 30) / chars.length);
    x.font = `bold ${Math.min(36, step * 0.9) | 0}px ${KFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    chars.forEach((c, i) => x.fillText(c, w / 2, 26 + step * (i + 0.5)));
  }, { side: THREE.DoubleSide }, 0.8);
  const ribG = G('ribbon', () => { const ge = new THREE.PlaneGeometry(0.11, 1.05, 1, 6); const p = ge.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getY(i) + 0.5) * 6) * 0.015); ge.computeVertexNormals(); return ge; });
  noShadow(add(g, ribG, rib('r', text, '#fbf3f6'), 0.2, cy - 0.62, 0.09, 0, 0, -0.04));
  noShadow(add(g, ribG, rib('l', from, '#fbf3f6'), -0.2, cy - 0.62, 0.09, 0, 0, 0.04));
  S(g, M('#ffb3c7', 0.6), 0, cy - 0.46, 0.08, 0.06, 0.04, 0.03, 8, 6);
  return { name: '화환', mass: 6, price: 150000, material: 'plant' };
};
D.speaker = (g) => {
  const blk = M('#25262b', 0.6), dk = M('#16171a', 0.6), st = M('#3a3d44', 0.45, 0.4);
  for (let i = 0; i < 3; i++) { const a = i * 2.09 + PI / 2; rod(g, 0.016, st, [0, 0.55, 0], [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], 6); }
  C(g, 0.022, 0.022, 1.1, st, 0, 0.0 + 0.2, 0, 8);
  const bx = grp(g, 0, 1.25, 0);
  RB(bx, 0.48, 0.72, 0.38, 0.04, blk, 0, 0, 0, 2);
  noShadow(add(bx, planeG(0.42, 0.66), T.grille(), 0, 0.36, 0.191));
  add(bx, torG(0.15, 0.018, 6, 24), M('#4a4d55', 0.4, 0.4), 0, 0.22, 0.195);
  noShadow(add(bx, G('spkCone', () => new THREE.CircleGeometry(0.14, 20)), M('#1a1b1e', 0.8), 0, 0.22, 0.193));
  RB(bx, 0.3, 0.1, 0.02, 0.01, dk, 0, 0.53, 0.19);
  noShadow(S(bx, glow('#7be07b', '#3cc03c', 1.2), 0.18, 0.66, 0.195, 0.008, 0.008, 0.004, 6, 4));
  RB(bx, 0.1, 0.03, 0.06, 0.01, st, 0, 0.72, 0);
  return { name: '스피커', mass: 25, price: 1200000, material: 'plastic' };
};
D.banner = (g, o) => {
  const text = o.text || '전사 타운홀 미팅';
  const w = o.w || Math.max(2.2, Math.min(4.5, 0.42 * [...text].length)), h = o.h || 0.5;
  const tw = 1024, th = Math.round(1024 * h / w);
  const t = texMat('banner:' + text + w, tw, th, (x, W, H) => {
    x.fillStyle = '#1f3d8c'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#f2c21b'; x.fillRect(0, 6, W, 8); x.fillRect(0, H - 14, W, 8);
    x.fillStyle = '#ffffff'; fitText(x, text, W / 2, H / 2 + 2, W - 80, H * 0.62, 'bold');
    x.fillStyle = '#f2c21b'; for (const cx of [24, W - 24]) { x.beginPath(); x.arc(cx, H / 2, 8, 0, 7); x.fill(); }
  }, { side: THREE.DoubleSide }, 0.9);
  const ge = G('bannerG' + w + h, () => { const ge = new THREE.PlaneGeometry(w, h, 16, 1); const p = ge.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w) * PI * 3) * 0.012); ge.computeVertexNormals(); return ge; });
  add(g, ge, t, 0, h / 2, 0.02);
  for (const sx of [-1, 1]) { noShadow(add(g, torG(0.015, 0.004, 4, 8), M('#c9ced4', 0.3, 0.6), sx * (w / 2 - 0.03), h - 0.03, 0.02)); rod(g, 0.003, M('#e9e6dc', 0.8), [sx * (w / 2 - 0.03), h - 0.02, 0.02], [sx * (w / 2 + 0.05), h + 0.08, 0.0], 3); }
  return { name: '현수막', mass: 1.5, price: 30000, material: 'soft', mount: 'wall' };
};
D.spotlight = (g) => {
  const blk = M('#202126', 0.5, 0.2), st = M('#3a3d44', 0.45, 0.4);
  for (let i = 0; i < 3; i++) { const a = i * 2.09; rod(g, 0.016, st, [0, 0.7, 0], [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], 6); }
  C(g, 0.025, 0.025, 0.65, st, 0, 0.6, 0, 8);
  const yoke = grp(g, 0, 1.3, 0);
  add(yoke, torG(0.17, 0.018, 4, 16, PI), st, 0, 0, 0, 0, 0, PI);
  const head = grp(yoke, 0, 0, 0, -0.35);
  C(head, 0.13, 0.15, 0.55, blk, 0, -0.2, 0, 16, PI / 2);
  C(head, 0.16, 0.16, 0.05, blk, 0, 0, 0.36, 16, PI / 2);
  noShadow(add(head, G('spotLens', () => new THREE.CircleGeometry(0.13, 18)), glow('#fff6dc', '#ffe0a0', 2.2), 0, 0, 0.386));
  for (let i = 0; i < 4; i++) B(head, 0.3, 0.004, 0.06, M('#16171a', 0.6), 0, 0.1 - i * 0.06 + 0.04, -0.25);
  RB(head, 0.06, 0.08, 0.2, 0.02, blk, 0, 0.14, -0.1);
  return { name: '무대 조명', mass: 12, price: 800000, material: 'metal' };
};
D.micStand = (g) => {
  const blk = M('#1f2025', 0.45, 0.4), ch = chrome();
  C(g, 0.13, 0.14, 0.03, blk, 0, 0, 0, 20);
  C(g, 0.012, 0.012, 1.42, ch, 0, 0.03, 0, 8);
  C(g, 0.02, 0.02, 0.06, blk, 0, 0.8, 0, 8);
  const mic = grp(g, 0, 1.45, 0.02, 0.5);
  C(mic, 0.018, 0.012, 0.16, blk, 0, -0.08, 0, 10);
  S(mic, M('#9aa0a7', 0.35, 0.6), 0, 0.1, 0, 0.032, 0.036, 0.032, 12, 8);
  add(mic, torG(0.03, 0.005, 4, 12), ch, 0, 0.07, 0, PI / 2);
  return { name: '마이크 스탠드', mass: 4, price: 120000, material: 'metal' };
};
D.curtain = (g, o) => {
  const w = o.w || 3, h = o.h || 4;
  const ge = G('drape' + w + 'x' + h, () => { const n = Math.round(w * 10), ge = new THREE.PlaneGeometry(w, h, n * 2, 4), p = ge.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * PI * 2 * 3.2) * (0.06 + (0.5 - y / h) * 0.03)); } ge.computeVertexNormals(); return ge; });
  const vel = M('#a8202c', 0.9, 0, { side: THREE.DoubleSide, emissive: '#3a0508', emissiveIntensity: 0.2 }, 'velvet');
  add(g, ge, vel, 0, h / 2 + 0.06, 0);
  noShadow(B(g, w, 0.06, 0.1, M('#e2b43c', 0.5, 0.3), 0, 0, 0));
  const val = G('valance' + w, () => { const ge = new THREE.PlaneGeometry(w, 0.4, Math.round(w * 6), 1), p = ge.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(Math.sin(p.getX(i) * PI * 1.5)) * 0.08); ge.computeVertexNormals(); return ge; });
  add(g, val, vel, 0, h - 0.1, 0.1);
  noShadow(B(g, w, 0.04, 0.02, M('#e2b43c', 0.5, 0.3), 0, h - 0.32, 0.17));
  return { name: '무대 커튼', mass: 0, price: 1500000, material: 'soft', mount: 'wall' };
};

// ================================================================= 1층 로비 추가
D.gate = (g) => {
  const ss = M('#d3d7dc', 0.28, 0.6), blk = M('#1d1f24', 0.25, 0.2);
  RB(g, 0.26, 1.0, 1.4, 0.1, ss, 0, 0, 0, 3);
  RB(g, 0.27, 0.04, 1.3, 0.015, blk, 0, 0.98, 0);
  noShadow(add(g, planeG(0.16, 0.12), glowMat('gateReader', 64, 48, (x, w, h) => {
    x.fillStyle = '#18324f'; x.fillRect(0, 0, w, h); x.strokeStyle = '#6fc8ff'; x.lineWidth = 3; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(32, 30, 6 + i * 6, -2.2, -0.9); x.stroke(); }
    x.fillStyle = '#6fc8ff'; x.fillRect(22, 36, 20, 4);
  }, 1.1), 0, 1.025, 0.45, -PI / 2));
  for (const sz of [-0.62, 0.62]) {
    noShadow(add(g, planeG(0.1, 0.1), glowMat('gateArrow', 32, 32, (x, w, h) => { x.fillStyle = '#0d1a10'; x.fillRect(0, 0, w, h); x.fillStyle = '#3cff6a'; x.beginPath(); x.moveTo(16, 4); x.lineTo(28, 18); x.lineTo(20, 18); x.lineTo(20, 28); x.lineTo(12, 28); x.lineTo(12, 18); x.lineTo(4, 18); x.closePath(); x.fill(); }, 1.3), 0, 0.85, sz + Math.sign(sz) * 0.08, 0, sz > 0 ? 0 : PI));
  }
  noShadow(B(g, 0.27, 0.02, 1.32, glow('#9fdcff', '#3aa8ff', 1.2), 0, 0.9, 0));
  const flap = dyn(grp(g, 0.13, 0.42, 0.1));
  const fg = G('flapG', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.42, 0); s.quadraticCurveTo(0.5, 0, 0.5, 0.1); s.lineTo(0.5, 0.3); s.quadraticCurveTo(0.5, 0.42, 0.38, 0.42); s.lineTo(0, 0.42); s.closePath(); return new THREE.ShapeGeometry(s, 6); });
  noShadow(add(flap, fg, M('#cfeefa', 0.05, 0, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }, 'flapGlass'), 0, 0, 0));
  noShadow(B(flap, 0.5, 0.012, 0.01, glow('#9fdcff', '#3aa8ff', 1.0), 0.25, 0.41, 0));
  return {
    name: '보안 게이트', mass: 0, price: 4500000, material: 'metal',
    set(v) { v = Math.max(0, Math.min(1, +v || 0)); flap.rotation.y = -v * PI / 2; },
  };
};
function glyphG(ch) {
  return G('glyph:' + ch, () => {
    const N = 64, c = cvs(N, N), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.font = `900 ${N * 0.92}px ${KFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, N / 2, N / 2 + N * 0.04);
    const d = x.getImageData(0, 0, N, N).data;
    const runs = [];
    for (let y = 0; y < N; y++) { let s = -1; for (let i = 0; i <= N; i++) { const on = i < N && d[(y * N + i) * 4 + 3] > 110; if (on && s < 0) s = i; if (!on && s >= 0) { runs.push([y, s, i]); s = -1; } } }
    // merge identical runs on consecutive rows
    const boxes = []; const open = new Map();
    for (const [y, a, b] of runs) { const k = a + ',' + b; const o = open.get(k); if (o && o.y1 === y) { o.y1 = y + 1; } else { const nb = { a, b, y0: y, y1: y + 1 }; boxes.push(nb); open.set(k, nb); } }
    const geos = boxes.map((bx) => { const ge = new THREE.BoxGeometry((bx.b - bx.a) / N, (bx.y1 - bx.y0) / N, 1); ge.translate((bx.a + bx.b) / 2 / N - 0.5, 0.5 - (bx.y0 + bx.y1) / 2 / N, 0); return ge.toNonIndexed(); });
    return geos.length ? mergeGeometries(geos) : new THREE.BoxGeometry(0.5, 0.5, 1);
  });
}
D.logoLetter = (g, o) => {
  const ch = o.char || o.text || '뿌', col = o.color || '#d8352a';
  const S_ = o.h || 1.2, dep = 0.28;
  add(g, glyphG(ch), M(shade(col, -0.08), 0.5), 0, 0.08 + S_ / 2, 0, 0, 0, 0, S_, S_, dep);
  const face = canvasTex('p2:glyphFace:' + ch, 256, 256, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = `900 ${w * 0.92}px ${KFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, w / 2, h / 2 + h * 0.04); });
  noShadow(add(g, planeG(S_, S_), M(shade(col, 0.1), 0.35, 0, { map: face, transparent: true, alphaTest: 0.45, emissive: col, emissiveIntensity: 0.15 }, 'glyphFace:' + ch + col), 0, 0.08 + S_ / 2, dep / 2 * S_ / S_ + 0.003));
  RB(g, Math.min(1.1, S_ * 0.95), 0.08, dep + 0.12, 0.02, M('#3a3c42', 0.5, 0.3), 0, 0, 0);
  return { name: '간판 글자', mass: 6, price: 1500000, material: 'plastic' };
};
D.showcase = (g) => {
  const W = 1.3, Dp = 0.62;
  const white = M('#f4f2ee', 0.45), woodM = M('#b07a4a', 0.6), ch = chrome();
  RB(g, W, 0.82, Dp, 0.03, white, 0, 0, 0, 2);
  RB(g, W - 0.08, 0.6, 0.02, 0.01, woodM, 0, 0.12, Dp / 2);
  B(g, W, 0.04, Dp, M('#3a3c42', 0.5), 0, 0.82, 0);
  // case (back frame + curved glass front)
  B(g, W, 0.42, 0.03, M('#e9e4da', 0.5), 0, 0.86, -Dp / 2 + 0.015);
  for (const sx of [-1, 1]) B(g, 0.02, 0.42, Dp, M('#cfe6ee', 0.05, 0, { transparent: true, opacity: 0.25, depthWrite: false }, 'caseGlass'), sx * (W / 2 - 0.01), 0.86, 0);
  noShadow(add(g, G('curveGlass', () => new THREE.CylinderGeometry(0.5, 0.5, W - 0.04, 20, 1, true, 0, PI / 2)), M('#cfe6ee', 0.05, 0, { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }, 'curveGlassM'), 0, 0.86, -0.2, 0, 0, PI / 2, 1, 1, 0.86)).renderOrder = 2;
  RB(g, W, 0.04, 0.2, 0.01, M('#3a3c42', 0.5), 0, 1.3, -0.2);
  noShadow(B(g, W - 0.1, 0.01, 0.03, glow('#fff6dc', '#ffe0a0', 1.6), 0, 1.29, -0.2));
  B(g, W - 0.06, 0.012, 0.3, M('#cfe6ee', 0.05, 0, { transparent: true, opacity: 0.35 }, 'shelfGlass'), 0, 1.07, -0.12);
  for (const sx of [-1, 1]) C(g, 0.008, 0.008, 0.2, ch, sx * (W / 2 - 0.05), 0.86, -0.25, 6);
  // cakes
  const cream = M('#fbf6ee', 0.6), straw = M('#e23b3b', 0.45), choco = M('#5a3222', 0.6), matcha = M('#9cc46a', 0.6), pink = M('#f6b8c8', 0.6);
  const cake = (x, z, y, top, r = 0.1) => {
    C(g, r, r, 0.1, top, x, y, z, 16); add(g, torG(r - 0.01, 0.012, 4, 16), cream, x, y + 0.1, z, PI / 2);
    for (let i = 0; i < 6; i++) { const a = i * 1.047; S(g, top === cream ? straw : cream, x + Math.cos(a) * r * 0.6, y + 0.115, z + Math.sin(a) * r * 0.6, 0.018, 0.018, 0.018, 8, 6); }
  };
  cake(-0.42, 0.08, 0.86, cream); cake(-0.12, 0.1, 0.86, choco); cake(0.18, 0.08, 0.86, pink, 0.09); cake(0.45, 0.1, 0.86, matcha, 0.09);
  for (let i = 0; i < 5; i++) {
    const x = -0.45 + i * 0.22;
    add(g, cylG(0.08, 0.08, 0.08, 10, false, 0, PI / 3), [cream, choco, pink, matcha, cream][i], x, 1.12, -0.1, 0, -PI / 6 - PI / 2, 0);
    S(g, straw, x, 1.21, -0.06, 0.016, 0.016, 0.016, 8, 6);
  }
  noShadow(add(g, planeG(0.6, 0.08), texMat('cakeSign', 256, 36, (x, w, h) => { x.fillStyle = '#fbf6ee'; x.fillRect(0, 0, w, h); x.fillStyle = '#b07a4a'; fitText(x, '오늘의 케이크', w / 2, h / 2 + 1, 240, 24); }), 0, 0.72, Dp / 2 + 0.012));
  return { name: '케이크 진열장', mass: 0, price: 2800000, material: 'glass' };
};
D.parcel = (g, o) => {
  const sz = { s: [0.3, 0.2, 0.25], m: [0.45, 0.32, 0.35], l: [0.6, 0.45, 0.45] };
  const s = typeof o.s === 'number' ? [0.45 * o.s, 0.32 * o.s, 0.35 * o.s] : (sz[o.s] || sz.m);
  const [w, h, d] = s.map((v) => +v.toFixed(3));
  RB(g, w, h, d, 0.01, T.cardboard(), 0, 0, 0);
  const tape = M('#d9b77e', 0.4);
  noShadow(B(g, w * 0.18, 0.004, d + 0.004, tape, 0, h, 0));
  noShadow(B(g, w * 0.18, h * 0.3, 0.004, tape, 0, h * 0.7, d / 2));
  noShadow(add(g, planeG(Math.min(0.16, w * 0.4), Math.min(0.1, h * 0.45)), texMat('parcelLabel', 96, 60, (x, W, H) => {
    x.fillStyle = '#fbfaf5'; x.fillRect(0, 0, W, H); x.fillStyle = '#2f6fd6'; x.fillRect(0, 0, W, 14); x.fillStyle = '#fff'; fitText(x, '택배', W / 2, 8, 80, 12);
    x.fillStyle = '#333'; for (let i = 0; i < 26; i++) x.fillRect(8 + i * 3, 22, (i * 7) % 3 + 1, 18); x.fillStyle = '#888'; x.fillRect(8, 46, 60, 3); x.fillRect(8, 52, 40, 3);
  }), w * 0.22, h * 0.45, d / 2 + 0.003));
  const mass = { s: 2, m: 4, l: 7 }[o.s] || 4;
  return { name: '택배 상자', mass, price: 20000, material: 'paper' };
};
D.cart = (g, o) => {
  const deck = M('#3a74c6', 0.5), rub = M('#2b2d31', 0.8), ch = M('#c3c8ce', 0.3, 0.6);
  RB(g, 1.0, 0.07, 0.62, 0.02, deck, 0, 0.12, 0, 2);
  noShadow(B(g, 0.92, 0.005, 0.54, M('#2f3238', 0.9), 0, 0.19, 0));
  for (const sz of [-1, 1]) RB(g, 1.0, 0.04, 0.03, 0.012, rub, 0, 0.13, sz * 0.32);
  // handle
  for (const sz of [-0.26, 0.26]) rod(g, 0.018, ch, [-0.48, 0.18, sz], [-0.5, 0.95, sz], 8);
  rod(g, 0.022, M('#1d1e22', 0.6), [-0.5, 0.95, -0.28], [-0.5, 0.95, 0.28], 10);
  rod(g, 0.012, ch, [-0.49, 0.6, -0.26], [-0.49, 0.6, 0.26], 6);
  for (const sx of [-0.4, 0.4]) for (const sz of [-0.24, 0.24]) {
    B(g, 0.05, 0.05, 0.04, ch, sx, 0.07, sz);
    add(g, cylG(0.055, 0.055, 0.035, 12), rub, sx, 0.055, sz, PI / 2);
    add(g, cylG(0.025, 0.025, 0.04, 8), M('#e2b43c', 0.5), sx, 0.055, sz, PI / 2);
  }
  if (o.load !== false) {
    const cb = T.cardboard(), tape = M('#d9b77e', 0.4);
    RB(g, 0.5, 0.36, 0.42, 0.01, cb, 0.1, 0.19, 0.0, 1, 0, 0.08, 0); noShadow(B(g, 0.09, 0.004, 0.43, tape, 0.1, 0.55, 0, 0, 0.08, 0));
    RB(g, 0.36, 0.26, 0.3, 0.01, cb, 0.12, 0.55, 0.02, 1, 0, -0.15, 0); noShadow(B(g, 0.07, 0.004, 0.31, tape, 0.12, 0.81, 0.02, 0, -0.15, 0));
    RB(g, 0.3, 0.22, 0.24, 0.01, cb, 0.32, 0.19, -0.12 + 0.3, 1, 0, 0.3, 0);
  }
  return { name: '택배 카트', mass: 20, price: 250000, material: 'metal', ride: 'cart' };
};
D.infoDesk = (g, o) => {
  const W = 2.4, Dp = 0.7;
  const white = M('#f4f2ee', 0.45), woodM = M('#ffffff', 0.6, 0, { map: repTex(tex2.hallFloor(), 1.6, 0.7, 'hf') }, 'infoWood');
  const front = G('infoFront', () => new THREE.CylinderGeometry(2.2, 2.2, 1.0, 28, 1, true, -0.56, 1.12));
  add(g, front, M('#f4f2ee', 0.45, 0, { side: THREE.DoubleSide }, 'infoFrontM'), 0, 0.5, -1.85);
  // annular-sector slabs (counter top + inner work shelf)
  const arcSlab = (key, r0, r1, a, h) => G('arcSlab' + key, () => {
    const s = new THREE.Shape(), n = 20;
    for (let i = 0; i <= n; i++) { const t = -a + (2 * a * i) / n; const p = [r1 * Math.sin(t), -r1 * Math.cos(t)]; i ? s.lineTo(...p) : s.moveTo(...p); }
    for (let i = n; i >= 0; i--) { const t = -a + (2 * a * i) / n; s.lineTo(r0 * Math.sin(t), -r0 * Math.cos(t)); }
    const ge = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
    ge.rotateX(-PI / 2); return ge;
  });
  add(g, arcSlab('top', 1.95, 2.36, 0.58, 0.04), woodM, 0, 1.0, -1.85);
  add(g, arcSlab('in', 1.7, 2.2, 0.56, 0.03), white, 0, 0.72, -1.85);
  for (const sx of [-1, 1]) B(g, 0.04, 1.0, 0.5, white, sx * 2.2 * Math.sin(0.56) - sx * 0.02, 0, 2.2 * Math.cos(0.56) - 1.85 - 0.25, 0, -sx * 0.56, 0);
  noShadow(add(g, G('infoStrip', () => new THREE.CylinderGeometry(2.205, 2.205, 0.025, 28, 1, true, -0.56, 1.12)), glow('#cfe8ff', '#7ac0ff', 1.3), 0, 0.05, -1.85));
  noShadow(add(g, planeG(0.9, 0.22), texMat('infoSign', 256, 64, (x, w, h) => { x.fillStyle = '#1f3d8c'; rrect(x, 0, 0, w, h, 14); x.fill(); x.fillStyle = '#fff'; fitText(x, '안내  INFORMATION', w / 2, h / 2 + 2, 230, 30); }, { transparent: true }), 0, 0.62, 0.36));
  RB(g, 0.42, 0.3, 0.05, 0.01, M('#1d1f24', 0.4), 0.55, 0.76, -0.05, 1, -0.3, PI);
  S(g, M('#e2b43c', 0.3, 0.7), -0.6, 1.08, 0.12, 0.035, 0.025, 0.035, 10, 6);
  return { name: '안내 데스크', mass: 0, price: 1200000, material: 'wood' };
};
D.directory = (g) => {
  const panel = glowMat('floorDirectory', 256, 512, (x, w, h) => {
    x.fillStyle = '#1d2b4f'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f2c21b'; x.fillRect(0, 0, w, 64);
    x.fillStyle = '#1d2b4f'; fitText(x, '층별 안내', w / 2, 34, 220, 34);
    const rows = [['R', '옥상 · 헬리패드'], ['12', '임원실 · 대회의실'], ['7', '사무실 · 회의실'], ['3', '대강당'], ['1', '로비 · 카페'], ['B1', '회식당'], ['B2', '주차장']];
    rows.forEach(([f, n], i) => {
      const y = 92 + i * 58;
      x.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)'; x.fillRect(10, y - 6, w - 20, 52);
      x.fillStyle = f === '1' ? '#ff6a5a' : '#ffffff'; rrect(x, 18, y, 50, 40, 8); x.fill();
      x.fillStyle = '#1d2b4f'; fitText(x, f, 43, y + 21, 44, 26);
      x.fillStyle = '#ffffff'; fitText(x, n, 76, y + 21, 168, 22, 'bold', 'left');
    });
    x.fillStyle = '#8fa6cf'; fitText(x, '▲ 현재 위치 : 1층', w / 2, h - 18, 220, 16, 'normal');
  }, 0.55);
  RB(g, 0.9, 1.9, 0.2, 0.04, M('#2b3a60', 0.5), 0, 0.08, 0, 2);
  noShadow(add(g, planeG(0.8, 1.6), panel, 0, 1.0, 0.102));
  RB(g, 1.1, 0.08, 0.4, 0.02, M('#3a3c42', 0.5, 0.3), 0, 0, 0);
  return { name: '층별 안내판', mass: 0, price: 800000, material: 'metal' };
};

// ================================================================= B1 회식
function bottleGeo() { return latheG('soju', [[0, 0], [0.032, 0], [0.034, 0.01], [0.034, 0.14], [0.026, 0.17], [0.013, 0.2], [0.013, 0.23], [0, 0.23]], 10); }
const bottleMat = () => M('#2f9a58', 0.12, 0.05, { emissive: '#0d3a1e', emissiveIntensity: 0.25 }, 'sojuGlass');
function bottleOn(p, x, y, z, rx = 0, rz = 0) {
  add(p, bottleGeo(), bottleMat(), x, y, z, rx, 0, rz);
  if (!rx && !rz) {
    noShadow(add(p, cylG(0.0345, 0.0345, 0.06, 10, true), M('#f2f5f0', 0.6), x, y + 0.06, z));
    C(p, 0.0135, 0.0135, 0.015, M('#2a7a45', 0.5), x, y + 0.225, z, 8);
  }
}
D.bottle = (g) => {
  bottleOn(g, 0, 0, 0);
  noShadow(add(g, G('sojuLab', () => new THREE.CylinderGeometry(0.0347, 0.0347, 0.055, 12, 1, true, -0.7, 1.4)), texMat('sojuLabel', 64, 32, (x, w, h) => { x.fillStyle = '#f2f5f0'; x.fillRect(0, 0, w, h); x.fillStyle = '#2a7a45'; fitText(x, '소주', w / 2, h / 2, 56, 18); }), 0, 0.0875, 0));
  return { name: '소주병', mass: 0.5, price: 5000, material: 'glass', hold: true };
};
D.beerMug = (g) => {
  const glass = M('#e8f4f6', 0.05, 0, { transparent: true, opacity: 0.35, depthWrite: false }, 'mugGlass');
  C(g, 0.052, 0.052, 0.012, M('#d8eef2', 0.1, 0, { transparent: true, opacity: 0.6 }, 'mugBase'), 0, 0, 0, 14);
  C(g, 0.046, 0.044, 0.12, M('#e8a22a', 0.2, 0, { emissive: '#7a4a08', emissiveIntensity: 0.3 }, 'beer'), 0, 0.012, 0, 14);
  S(g, M('#fffaf0', 0.8), 0, 0.135, 0, 0.05, 0.025, 0.05, 12, 6);
  noShadow(add(g, cylG(0.055, 0.052, 0.15, 14, true), glass, 0, 0.075, 0)).renderOrder = 2;
  add(g, torG(0.04, 0.01, 6, 12, PI), M('#e8f4f6', 0.05, 0, { transparent: true, opacity: 0.5 }, 'mugHandle'), 0.055, 0.075, 0, 0, 0, -PI / 2).castShadow = false;
  return { name: '맥주잔', mass: 0.8, price: 8000, material: 'glass', hold: true };
};
D.grilltable = (g) => {
  const ss = M('#c3c8cd', 0.3, 0.6), ssD = M('#8e959c', 0.4, 0.5), blk = M('#232428', 0.6);
  C(g, 0.3, 0.34, 0.66, ss, 0, 0, 0, 22);
  for (const y of [0.15, 0.5]) add(g, torG(0.31, 0.014, 4, 22), ssD, 0, y, 0, PI / 2);
  for (let i = 0; i < 6; i++) { const a = i * 1.047; noShadow(add(g, G('ventH', () => new THREE.CircleGeometry(0.03, 10)), blk, Math.cos(a) * 0.335, 0.08, Math.sin(a) * 0.335, 0, PI / 2 - a, 0)); }
  C(g, 0.52, 0.52, 0.04, ss, 0, 0.66, 0, 32);
  add(g, torG(0.52, 0.016, 4, 32), ssD, 0, 0.7, 0, PI / 2);
  // charcoal pit + grill
  C(g, 0.2, 0.2, 0.02, blk, 0, 0.69, 0, 20);
  noShadow(C(g, 0.17, 0.17, 0.005, glow('#ff7a2a', '#ff4a0a', 1.6), 0, 0.705, 0, 18));
  add(g, torG(0.19, 0.012, 4, 20), M('#2a2b2f', 0.5, 0.3), 0, 0.73, 0, PI / 2);
  for (let i = -3; i <= 3; i++) { const hw = Math.sqrt(0.19 * 0.19 - (i * 0.05) ** 2); rod(g, 0.005, M('#3a3b40', 0.5, 0.3), [-hw, 0.73, i * 0.05], [hw, 0.73, i * 0.05], 4); }
  const meat = texMat('samgyeop', 64, 32, (x, w, h) => { x.fillStyle = '#e88a7a'; x.fillRect(0, 0, w, h); x.fillStyle = '#fbeee0'; x.fillRect(0, 6, w, 5); x.fillRect(0, 20, w, 4); x.fillStyle = 'rgba(120,50,20,0.5)'; x.fillRect(0, 0, w, 3); }, {}, 0.6);
  [[-0.06, -0.06, 0.2], [0.06, -0.02, -0.15], [-0.02, 0.08, 0.6], [0.09, 0.09, 1.2]].forEach(([x, z, a]) => RB(g, 0.16, 0.015, 0.05, 0.006, meat, x, 0.735, z, 1, 0, a, 0));
  S(g, M('#f6efd8', 0.6), 0.1, 0.745, -0.1, 0.015, 0.008, 0.015, 8, 4); S(g, M('#f6efd8', 0.6), -0.11, 0.745, 0.05, 0.015, 0.008, 0.015, 8, 4);
  // side dishes
  const bowl = M('#f4f2ee', 0.4);
  const dish = (a, col) => { const x = Math.cos(a) * 0.37, z = Math.sin(a) * 0.37; C(g, 0.06, 0.045, 0.03, bowl, x, 0.7, z, 12); S(g, M(col, 0.7), x, 0.73, z, 0.048, 0.015, 0.048, 10, 6); };
  dish(0.3, '#d23a2c'); dish(1.0, '#6fb23d'); dish(2.2, '#7a4a28'); dish(3.0, '#f3e9a0'); dish(4.0, '#d23a2c');
  // lettuce basket + soju + shot glasses
  RB(g, 0.16, 0.05, 0.11, 0.015, M('#c9a26a', 0.8), Math.cos(5.0) * 0.36, 0.7, Math.sin(5.0) * 0.36, 1, 0, -5.0, 0);
  add(g, lettuceG(), M('#8cc84b', 0.6, 0, { side: THREE.DoubleSide }, 'lettuce0'), Math.cos(5.0) * 0.36, 0.69, Math.sin(5.0) * 0.36, 0, 0, 0, 0.9, 0.5, 0.7);
  bottleOn(g, Math.cos(5.7) * 0.4, 0.7, Math.sin(5.7) * 0.4);
  for (const a of [5.45, 5.95]) noShadow(C(g, 0.022, 0.018, 0.05, M('#eef6f8', 0.05, 0, { transparent: true, opacity: 0.5 }, 'shot'), Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3, 10));
  return { name: '회식 테이블', mass: 40, price: 450000, material: 'metal' };
};
D.stool = (g, o) => {
  const col = o.color || '#d8352a', m = M(col, 0.45);
  RB(g, 0.32, 0.04, 0.32, 0.03, m, 0, 0.42, 0, 2);
  add(g, cylG(0.155, 0.155, 0.04, 24), m, 0, 0.44, 0);
  noShadow(add(g, planeG(0.09, 0.03), M('#1d1d1d', 0.8), 0, 0.4615, 0, -PI / 2));
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; const s = grp(g, 0, 0, 0, 0, -a, 0); RB(s, 0.05, 0.44, 0.07, 0.02, m, 0.14, 0, 0, 1, 0, 0, 0.12); }
  add(g, torG(0.15, 0.012, 4, 20), m, 0, 0.12, 0, PI / 2);
  return { name: '스툴', mass: 2.5, price: 20000, material: 'plastic' };
};
D.sojuFridge = (g) => {
  const W = 1.2, H = 1.95, Dp = 0.62;
  const body = M('#d8dde2', 0.4, 0.3), dk = M('#2b2d31', 0.5);
  B(g, W, H, 0.04, body, 0, 0, -Dp / 2 + 0.02);
  for (const sx of [-1, 1]) RB(g, 0.06, H, Dp, 0.02, body, sx * (W / 2 - 0.03), 0, 0, 1);
  RB(g, W, 0.12, Dp, 0.02, dk, 0, 0, 0);
  RB(g, W, 0.24, Dp, 0.02, M('#2f9a58', 0.45), 0, H - 0.24, 0, 2);
  noShadow(add(g, planeG(W - 0.1, 0.19), glowMat('fridgeHead', 256, 48, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#47c27a'); gr.addColorStop(1, '#2a8a52'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff'; fitText(x, '시원한 소주 · 맥주', w / 2, h / 2 + 1, 230, 30);
  }, 0.75), 0, H - 0.12, Dp / 2 + 0.002));
  const inner = M('#f4fbff', 0.5, 0, { emissive: '#dff4ff', emissiveIntensity: 0.55 }, 'fridgeInner');
  const innerOff = M('#9aa3a8', 0.6);
  const back = noShadow(B(g, W - 0.12, H - 0.38, 0.01, inner, 0, 0.12, -Dp / 2 + 0.045));
  const shelf = M('#b9c0c7', 0.4, 0.4);
  const rows = [0.16, 0.52, 0.88, 1.24];
  for (const y of rows) B(g, W - 0.12, 0.015, Dp - 0.12, shelf, 0, y - 0.015, -0.02);
  // bottles: rows of green + a row of brown beer
  const lowB = latheG('sojuLow', [[0, 0], [0.033, 0], [0.034, 0.14], [0.014, 0.195], [0.013, 0.23], [0, 0.23]], 7);
  const rowG = (key, mat, n) => scatterG('fridgeRow' + key, lowB, n, 1, (i) => ({ x: -0.48 + i * (0.96 / (n - 1)), y: 0, z: 0, sx: 1 }));
  const greenRow = rowG('g', null, 11), beer = M('#7a3f12', 0.15, 0, { emissive: '#3a1a04', emissiveIntensity: 0.3 }, 'beerGlass');
  const standing = [];
  rows.forEach((y, i) => standing.push(add(i === 2 ? dyn(grp(g)) : g, greenRow, i === 0 ? beer : bottleMat(), 0, y, 0.0)));
  noShadow(B(g, W - 0.14, 1.2, 0.01, M('#3a7a52', 0.6), 0, 0.15, -0.15)); // dim "more bottles" backdrop
  // doors
  const glassOk = M('#cfeefa', 0.05, 0, { transparent: true, opacity: 0.2, depthWrite: false }, 'fridgeGlass');
  const doors = dyn(grp(g));
  const panes = [];
  for (const sx of [-1, 1]) {
    const dx = sx * (W / 4 - 0.015);
    for (const [w, h, x, y] of [[W / 2 - 0.04, 0.05, dx, 0.12], [W / 2 - 0.04, 0.05, dx, H - 0.29], [0.05, H - 0.41, dx - sx * (W / 4 - 0.05), 0.12], [0.05, H - 0.41, dx + sx * (W / 4 - 0.05), 0.12]]) RB(doors, w, h, 0.035, 0.012, M('#3a3d44', 0.45, 0.3), x, y, Dp / 2);
    RB(doors, 0.025, 0.6, 0.04, 0.01, M('#c3c8ce', 0.3, 0.6), dx - sx * (W / 4 - 0.11), 0.7, Dp / 2 + 0.03);
    panes.push(noShadow(add(doors, planeG(W / 2 - 0.1, H - 0.5), glassOk, dx, 0.12 + (H - 0.41) / 2, Dp / 2 + 0.002)));
  }
  panes.forEach((p) => (p.renderOrder = 2));
  let shards;
  return {
    name: '소주 냉장고', mass: 0, price: 2500000, material: 'glass',
    after() {
      shards = dyn(grp(g)); shards.visible = false;
      for (let i = 0; i < 4; i++) add(shards, bottleGeo(), bottleMat(), -0.4 + i * 0.25, 0.034, Dp / 2 + 0.25 + (i % 2) * 0.2, PI / 2, i * 0.9, 0);
      const sm = M('#cfeefa', 0.05, 0, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }, 'shard2');
      const r = rng(31);
      for (let i = 0; i < 10; i++) noShadow(add(shards, polyG('fs' + i, [[0, 0, 0], [0.09, 0, 0.02], [0.03, 0, 0.08]]), sm, (r() - 0.5) * 1.1, 0.005, Dp / 2 + 0.1 + r() * 0.6, 0, r() * 6, 0));
      noShadow(add(shards, cylG(1, 1, 0.01, 24), M('#cfe8a8', 0.05, 0, { transparent: true, opacity: 0.45, depthWrite: false }, 'sojuPuddle'), 0, 0.008, Dp / 2 + 0.45, 0, 0, 0, 0.7, 1, 0.4));
    },
    set(s) {
      const br = s === 'broken' || s === 1 || s === true;
      panes.forEach((p) => { p.material = br ? T.crackGlass() : glassOk; });
      back.material = br ? innerOff : inner;
      if (shards) shards.visible = br;
      standing[2].visible = !br;
    },
  };
};
D.karaoke = (g) => {
  const cab = M('#2a2033', 0.5), blk = M('#15161a', 0.5);
  RB(g, 0.72, 0.86, 0.5, 0.03, cab, 0, 0, 0, 2);
  for (const sx of [-1, 1]) { add(g, torG(0.1, 0.014, 6, 20), M('#4a4d55', 0.4, 0.4), sx * 0.18, 0.32, 0.252); noShadow(add(g, G('kspk', () => new THREE.CircleGeometry(0.1, 20)), T.grille(), sx * 0.18, 0.32, 0.251)); }
  noShadow(B(g, 0.7, 0.025, 0.01, glow('#ff6fd0', '#ff2fb0', 1.6), 0, 0.62, 0.252));
  noShadow(B(g, 0.7, 0.025, 0.01, glow('#6ff0ff', '#20d8ff', 1.6), 0, 0.08, 0.252));
  // number pad
  RB(g, 0.3, 0.05, 0.12, 0.01, blk, 0, 0.86, 0.15, 1, 0.25);
  noShadow(add(g, planeG(0.28, 0.1), glowMat('kpad', 96, 36, (x, w, h) => { x.fillStyle = '#101114'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff4fa0'; x.font = `bold 13px monospace`; x.fillText('12345', 6, 15); x.fillStyle = '#9aa0a7'; for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) x.fillRect(48 + i * 7.5, 6 + j * 14, 5, 10); }, 0.8), 0, 0.915, 0.163, -PI / 2 + 0.25));
  // TV
  RB(g, 0.06, 0.08, 0.06, 0.01, blk, 0, 0.86, -0.1);
  RB(g, 0.96, 0.58, 0.05, 0.015, blk, 0, 0.93, -0.12);
  noShadow(add(g, planeG(0.9, 0.52), glowMat('karaokeScreen', 320, 180, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3b1d6e'); gr.addColorStop(0.5, '#a8337a'); gr.addColorStop(1, '#f08a4a'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(40 + i * 55, 40 + (i % 2) * 20, 20, 0, 7); x.fill(); }
    x.fillStyle = '#fff'; fitText(x, '♪ 오늘은 회식이다 ♪', w / 2, 34, 280, 22);
    x.fillStyle = '#7be0ff'; fitText(x, '부장님 노래 한 곡 더~', w / 2, 112, 290, 22);
    x.fillStyle = '#ffffff'; fitText(x, '내일은 출근이다 랄라라', w / 2, 144, 290, 20, 'normal');
    x.fillStyle = '#ffe14a'; fitText(x, '100점!', w - 50, h - 22, 80, 22);
  }, 0.9), 0, 1.22, -0.094));
  // two mics in holders
  const micM = [M('#c9ced4', 0.3, 0.6), M('#d9a93a', 0.3, 0.7)];
  [-0.27, 0.27].forEach((x, i) => {
    C(g, 0.04, 0.04, 0.05, blk, x, 0.86, 0.16, 10);
    const m = grp(g, x, 0.88, 0.16, 0.15);
    C(m, 0.017, 0.012, 0.17, blk, 0, 0, 0, 10);
    S(m, micM[i], 0, 0.2, 0, 0.033, 0.036, 0.033, 12, 8);
  });
  return { name: '노래방 기계', mass: 30, price: 2500000, material: 'plastic' };
};
D.mirrorball = (g) => {
  const tiles = texMat('mirrorTiles', 256, 128, (x, w, h) => {
    const r = rng(5);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 16; j++) {
      const l = 150 + (r() * 105) | 0, tint = r();
      x.fillStyle = tint < 0.06 ? '#ff9fe0' : tint < 0.12 ? '#9feaff' : tint < 0.16 ? '#fff09f' : `rgb(${l},${l},${l + 8})`;
      x.fillRect(i * 8, j * 8, 7, 7);
    }
    x.fillStyle = '#4a4d55'; for (let i = 0; i < 33; i++) x.fillRect(i * 8 - 1, 0, 1, h);
  }, { flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.18 }, 0.12);
  tiles.metalness = 0.35; tiles.emissiveMap = tiles.map;
  const ball = dyn(grp(g, 0, 0.25, 0));
  const bm = add(ball, sphG(24, 14), tiles, 0, 0, 0, 0, 0, 0, 0.25);
  bm.onBeforeRender = () => { ball.rotation.y = performance.now() * 0.0006; };
  C(g, 0.01, 0.01, 0.08, M('#2b2d31', 0.5), 0, 0.49, 0, 6);
  C(g, 0.06, 0.07, 0.07, M('#2b2d31', 0.5), 0, 0.57, 0, 12);
  C(g, 0.004, 0.004, 0.4, M('#9aa0a7', 0.4, 0.6), 0, 0.64, 0, 4);
  return { name: '미러볼', mass: 5, price: 600000, material: 'glass', mount: 'ceiling' };
};
D.tambourine = (g) => {
  const ring = M('#d8352a', 0.45, 0, { side: THREE.DoubleSide }, 'tambRing'), jing = M('#d9dde2', 0.25, 0.8);
  add(g, cylG(0.13, 0.13, 0.05, 24, true), ring, 0, 0.03, 0);
  add(g, torG(0.13, 0.008, 4, 24), M('#b82a20', 0.4), 0, 0.055, 0, PI / 2);
  C(g, 0.126, 0.126, 0.004, M('#f3ead6', 0.8), 0, 0.05, 0, 24);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2, x = Math.cos(a) * 0.13, z = Math.sin(a) * 0.13;
    for (const dy of [0.018, 0.034]) add(g, cylG(0.022, 0.022, 0.004, 10), jing, x, dy, z, 0, 0, 0);
  }
  for (const [c, a] of [['#3fa8ff', 0.5], ['#ffd23a', 0.65]]) { noShadow(add(g, planeG(0.025, 0.2), M(c, 0.8, 0, { side: THREE.DoubleSide }, 'tambRib' + c), Math.cos(PI + a) * 0.14, 0.0, Math.sin(PI + a) * 0.14 + 0.02, -PI / 2 + 0.2, 0, a)); }
  return { name: '탬버린', mass: 0.4, price: 15000, material: 'wood', hold: true };
};
D.neonSign = (g, o) => {
  const text = o.text || '회식', col = o.color || '#ff4fa0';
  const n = [...text].length;
  const cw = 200 * n + 80, chH = 240;
  const tex = canvasTex('p2:neon:' + text + col, cw, chH, (x, w, h) => {
    x.fillStyle = '#121218'; x.fillRect(0, 0, w, h);
    x.lineJoin = 'round'; x.lineCap = 'round';
    x.strokeStyle = col; x.shadowColor = col; x.shadowBlur = 24; x.lineWidth = 10;
    rrect(x, 16, 16, w - 32, h - 32, 26); x.stroke();
    x.font = `bold 170px ${KFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 16; x.strokeText(text, w / 2, h / 2 + 8);
    x.shadowBlur = 0; x.strokeStyle = '#fff6fb'; x.lineWidth = 5; x.strokeText(text, w / 2, h / 2 + 8);
    x.lineWidth = 3; rrect(x, 16, 16, w - 32, h - 32, 26); x.stroke();
  });
  const H = o.h || 0.55, W = H * cw / chH;
  RB(g, W + 0.06, H + 0.06, 0.04, 0.02, M('#1b1c22', 0.4), 0, 0, -0.02);
  noShadow(add(g, planeG(W, H), M('#ffffff', 0.4, 0, { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.6 }, 'neonM:' + text + col), 0, H / 2 + 0.03, 0.002));
  for (const sx of [-1, 1]) for (const sy of [0, 1]) C(g, 0.012, 0.012, 0.04, chrome(), sx * (W / 2 - 0.03), 0.06 + sy * (H - 0.06), -0.06, 6, PI / 2);
  return { name: '네온사인', mass: 0, price: 600000, material: 'glass', mount: 'wall' };
};
D.smokeHood = (g) => {
  const ss = M('#c9ced4', 0.28, 0.65), ssD = M('#9aa1a8', 0.35, 0.55);
  add(g, latheG('hoodBell', [[0.34, 0], [0.33, 0.04], [0.26, 0.18], [0.14, 0.3], [0.12, 0.34]], 22), M('#c9ced4', 0.28, 0.65, { side: THREE.DoubleSide }, 'hoodBellM'), 0, 0, 0);
  add(g, torG(0.34, 0.012, 4, 24), ssD, 0, 0.0, 0, PI / 2);
  C(g, 0.12, 0.12, 0.55, ss, 0, 0.32, 0, 16);
  C(g, 0.135, 0.135, 0.5, ss, 0, 0.82, 0, 16);
  for (const y of [0.32, 0.86, 1.32]) add(g, torG(0.137, 0.01, 4, 16), ssD, 0, y, 0, PI / 2);
  C(g, 0.15, 0.15, 0.06, ssD, 0, 1.32, 0, 16);
  rod(g, 0.008, ssD, [0.25, 0.12, 0], [0.25, 0.2, 0.15], 4); add(g, torG(0.05, 0.008, 4, 12), ssD, 0.3, 0.12, 0.2, 0, 0.5, 0);
  return { name: '연기 후드', mass: 0, price: 300000, material: 'metal', mount: 'ceiling' };
};
D.apronRack = (g) => {
  const wood = M('#8a5a32', 0.6);
  C(g, 0.2, 0.22, 0.04, wood, 0, 0, 0, 16);
  C(g, 0.025, 0.03, 1.75, wood, 0, 0.04, 0, 10);
  S(g, wood, 0, 1.8, 0, 0.04, 0.04, 0.04, 10, 6);
  const cols = ['#d8352a', '#2b2d33', '#8a5a32'];
  cols.forEach((c, i) => {
    const a = PI / 2 + (i - 1) * 1.1, hx = Math.cos(a) * 0.1, hz = Math.sin(a) * 0.1;
    rod(g, 0.01, wood, [0, 1.6, 0], [hx, 1.66, hz], 6);
    const ap = grp(g, hx * 1.4, 1.62, hz * 1.4, 0.05, -a + PI / 2, 0);
    RB(ap, 0.22, 0.5, 0.02, 0.01, T.fabric(c), 0, -0.52, 0.04, 1);
    RB(ap, 0.3, 0.2, 0.02, 0.01, T.fabric(c), 0, -0.8, 0.045, 1);
    add(ap, torG(0.07, 0.006, 4, 12, PI), M(c, 0.9), 0, -0.02, 0.04, 0, 0, PI);
    noShadow(B(ap, 0.16, 0.08, 0.005, M(shade(c, -0.1), 0.9), 0, -0.85, 0.058));
  });
  return { name: '앞치마 걸이', mass: 6, price: 60000, material: 'wood' };
};
D.boothSeat = (g, o) => {
  const w = o.w || 1.4;
  const vin = T.leather('#8a2f2a'), wood = M('#5a3522', 0.6);
  RB(g, w, 0.36, 0.55, 0.02, wood, 0, 0, 0.02);
  RB(g, w - 0.04, 0.12, 0.5, 0.05, vin, 0, 0.34, 0.04, 2);
  const n = Math.max(3, Math.round(w / 0.25));
  for (let i = 0; i < n; i++) RB(g, (w - 0.06) / n - 0.01, 0.62, 0.14, 0.05, vin, -w / 2 + 0.03 + ((w - 0.06) / n) * (i + 0.5), 0.46, -0.2, 2, -0.06);
  RB(g, w, 0.06, 0.2, 0.02, wood, 0, 1.08, -0.24);
  B(g, w, 1.08, 0.06, wood, 0, 0.02, -0.28);
  return { name: '부스 좌석', mass: 0, price: 400000, material: 'soft' };
};

// ================================================================= B2 주차장
function carPaintDamaged(col) {
  return texMat('carDent' + col, 128, 128, (x, w, h) => {
    x.fillStyle = col; x.fillRect(0, 0, w, h);
    const r = rng(66);
    for (let i = 0; i < 9; i++) { const gr = x.createRadialGradient(0, 0, 1, 0, 0, 22); const cx = r() * w, cy = r() * h; gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(cx, cy); x.fillStyle = gr; x.fillRect(-24, -24, 48, 48); x.restore(); }
    x.strokeStyle = 'rgba(230,230,230,0.8)'; x.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) { x.beginPath(); const sx = r() * w, sy = r() * h; x.moveTo(sx, sy); x.lineTo(sx + (r() - 0.5) * 60, sy + (r() - 0.5) * 16); x.stroke(); }
    x.fillStyle = 'rgba(150,80,40,0.5)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(r() * w, r() * h, 2 + r() * 4, 0, 7); x.fill(); }
  }, {}, 0.5);
}
const carBurnt = () => texMat('carBurnt', 128, 128, (x, w, h) => {
  x.fillStyle = '#2e2a28'; x.fillRect(0, 0, w, h);
  const r = rng(67);
  for (let i = 0; i < 40; i++) { x.fillStyle = r() < 0.7 ? 'rgba(14,12,11,0.6)' : 'rgba(120,64,32,0.4)'; x.beginPath(); x.arc(r() * w, r() * h, 3 + r() * 12, 0, 7); x.fill(); }
}, {}, 0.95);
D.car = (g, o) => {
  const boss = !!o.boss;
  const col = o.color || (boss ? '#2e323a' : '#4a86d0');
  const L = boss ? 4.7 : 4.1, W = boss ? 1.86 : 1.76;
  const paint = M(col, boss ? 0.26 : 0.32, boss ? 0.15 : 0.08);
  const dark = M('#26282d', 0.7), trim = M('#3a3d44', 0.55), ch = chrome();
  const zF = L / 2, wz = L / 2 - 0.75, wr = 0.37;
  const body = dyn(grp(g));
  const paintMeshes = [];
  const pm = (m) => { paintMeshes.push(m); return m; };
  pm(RB(body, W, 0.6, L, 0.24, paint, 0, 0.3, 0, 3));
  B(body, W - 0.35, 0.12, L - 0.7, dark, 0, 0.22, 0);
  // wheel arches
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(body, torG(0.43, 0.05, 6, 16, PI), trim, sx * (W / 2 - 0.02), 0.36, sz * wz, 0, PI / 2, 0, 1, 1, 1.6);
  // cabin
  const cl = boss ? { rb: -2.0, rt: -1.5, ft: 0.25, fb: 0.95, h: 0.52 } : { rb: -1.75, rt: -1.3, ft: 0.2, fb: 0.82, h: 0.5 };
  const Wc = W - 0.28, bt = 0.07, bs = 0.07, cy = 0.86;
  const cabGeo = G('carCab' + (boss ? 'B' : 'N'), () => {
    const s = new THREE.Shape();
    s.moveTo(-cl.rb, 0); s.lineTo(-cl.fb, 0); s.lineTo(-cl.ft, cl.h); s.lineTo(-cl.rt, cl.h); s.closePath();
    const ge = new THREE.ExtrudeGeometry(s, { depth: Wc - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 3, curveSegments: 2 });
    ge.translate(0, 0, -(Wc - 2 * bt) / 2); ge.rotateY(PI / 2); return ge;
  });
  const cabin = dyn(grp(body, 0, cy, 0));
  pm(add(cabin, cabGeo, paint, 0, 0, 0));
  // glass + dark interior behind it
  const glass = dyn(grp(cabin));
  const interior = M('#1b1d22', 0.8);
  const glassM = T.carGlass();
  const slope = (p0, p1, out, k0, k1, xw) => {
    const dz = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dz, dy), n = [dy / len * out, -dz / len * out];
    if (n[1] < 0) { n[0] = -n[0]; n[1] = -n[1]; }
    const P_ = (k, x, off) => [x, p0[1] + dy * k + n[1] * off, p0[0] + dz * k + n[0] * off];
    return (off) => [P_(k0, -xw, off), P_(k0, xw, off), P_(k1, xw, off), P_(k1, -xw, off)];
  };
  const xw = Wc / 2 - bt - 0.05;
  const ws = slope([cl.fb, 0], [cl.ft, cl.h], 1, 0.16, 0.9, xw);
  const rw = slope([cl.rb, 0], [cl.rt, cl.h], 1, 0.18, 0.88, xw * 0.92);
  const kind = boss ? 'B' : 'N';
  const panes = [];
  const pane = (key, pts) => { panes.push(noShadow(add(glass, polyG('cg' + kind + key, pts), glassM))); };
  add(cabin, polyG('ci' + kind + 'ws', ws(bs + 0.004)), interior); pane('ws', ws(bs + 0.012));
  add(cabin, polyG('ci' + kind + 'rw', rw(bs + 0.004)), interior); pane('rw', rw(bs + 0.012));
  const zf = (y) => cl.fb + (cl.ft - cl.fb) * (y / cl.h) - 0.1, zr = (y) => cl.rb + (cl.rt - cl.rb) * (y / cl.h) + 0.1;
  const y0w = 0.07, y1w = cl.h - 0.07, bp = (cl.ft + cl.rt) / 2 + 0.05;
  for (const sx of [-1, 1]) {
    const X = (off) => sx * (Wc / 2 + off);
    const fwd = (off) => [[X(off), y0w, zf(y0w)], [X(off), y1w, zf(y1w)], [X(off), y1w, bp + 0.05], [X(off), y0w, bp + 0.05]];
    const rear = (off) => [[X(off), y0w, bp - 0.05], [X(off), y1w, bp - 0.05], [X(off), y1w, zr(y1w)], [X(off), y0w, zr(y0w)]];
    add(cabin, polyG('ci' + kind + 'f' + sx, fwd(0.004)), interior); pane('f' + sx, fwd(0.01));
    add(cabin, polyG('ci' + kind + 'r' + sx, rear(0.004)), interior); pane('r' + sx, rear(0.01));
  }
  if (boss) { for (const sx of [-1, 1]) noShadow(add(cabin, boxG(0.012, 0.012, (zf(y0w) - zr(y0w))), ch, sx * (Wc / 2 + 0.012), y0w - 0.015, (zf(y0w) + zr(y0w)) / 2)); }
  // mirrors
  for (const sx of [-1, 1]) { RB(body, 0.14, 0.09, 0.08, 0.03, paint, sx * (W / 2 + 0.03), 0.98, cl.fb - 0.05); }
  // front: grille, headlights, plate
  const plate = (txt) => texMat('plate' + txt, 160, 40, (x, w, h) => { x.fillStyle = '#f6f7f2'; rrect(x, 1, 1, w - 2, h - 2, 6); x.fill(); x.strokeStyle = '#222'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#1d1d1d'; fitText(x, txt, w / 2, h / 2 + 1, 150, 28); }, {}, 0.5);
  const plateTxt = o.plate || (boss ? '01가 0001' : '12가 3456');
  if (boss) { RB(body, 0.7, 0.26, 0.05, 0.02, ch, 0, 0.48, zF - 0.01); for (let i = 0; i < 6; i++) noShadow(B(body, 0.012, 0.22, 0.01, dark, -0.28 + i * 0.112, 0.5, zF + 0.016)); }
  else RB(body, 0.62, 0.14, 0.04, 0.03, dark, 0, 0.56, zF - 0.01);
  for (const sx of [-1, 1]) {
    noShadow(S(body, glow('#fffbe8', '#fff1c0', 1.3), sx * (W / 2 - 0.3), 0.7, zF - 0.03, 0.16, 0.09, 0.06, 14, 8));
    noShadow(S(body, glow('#ff4a3a', '#ff1a0a', 1.0), sx * (W / 2 - 0.26), 0.72, -zF + 0.03, 0.15, 0.07, 0.05, 12, 6));
  }
  // bumpers (pivot at the right end so the left end can hang)
  const bumpF = dyn(grp(body, W / 2, 0.3, zF + 0.04)), bumpR = dyn(grp(body, W / 2, 0.3, -zF - 0.04));
  pm(RB(bumpF, W + 0.04, 0.18, 0.18, 0.08, boss ? paint : trim, -W / 2, -0.03, -0.06, 2));
  pm(RB(bumpR, W + 0.04, 0.18, 0.18, 0.08, boss ? paint : trim, -W / 2, -0.03, 0.06, 2));
  noShadow(add(bumpF, planeG(0.42, 0.11), plate(plateTxt), -W / 2, 0.06, 0.035));
  noShadow(add(bumpR, planeG(0.42, 0.11), plate(plateTxt), -W / 2, 0.06, -0.035, 0, PI, 0));
  // hood (pivot at its rear edge)
  const hood = dyn(grp(body, 0, 0.9, cl.fb + 0.08));
  const hoodLen = zF - cl.fb - 0.2;
  pm(RB(hood, W - 0.24, 0.04, hoodLen, 0.02, paint, 0, -0.01, hoodLen / 2));
  if (boss) { C(hood, 0.012, 0.02, 0.06, ch, 0, 0.03, hoodLen - 0.05, 8); }
  // doors (pivot at the front edge)
  const doors = [];
  const doorSpan = [[cl.fb - 0.02, bp + 0.02], [bp - 0.02, -wz + 0.48]];
  for (const sx of [-1, 1]) doorSpan.forEach(([z0, z1], k) => {
    const d = dyn(grp(body, sx * (W / 2 - 0.005), 0, z0));
    const len = z0 - z1;
    pm(RB(d, 0.05, 0.42, len, 0.02, paint, 0, 0.42, -len / 2));
    noShadow(B(d, 0.06, 0.008, len - 0.02, trim, 0, 0.84, -len / 2));
    RB(d, 0.03, 0.025, 0.13, 0.01, ch, sx * 0.03, 0.72, -len * 0.75);
    d.userData.sx = sx; doors.push(d);
  });
  // wheels
  const wheels = [];
  const tire = M('#232428', 0.85), rim = M(boss ? '#d6dade' : '#e8e9ea', 0.3, 0.5);
  for (const sx of [-1, 1]) for (const sz of [1, -1]) {
    const wg = dyn(grp(g, sx * (W / 2 - 0.12), wr, sz * wz));
    add(wg, torG(0.26, 0.11, 8, 20), tire, 0, 0, 0, 0, PI / 2, 0);
    C(wg, 0.19, 0.19, 0.2, rim, 0, 0, 0, 16, 0, 0, PI / 2);
    C(wg, 0.07, 0.07, 0.22, M('#9aa0a7', 0.35, 0.5), 0, 0, 0, 10, 0, 0, PI / 2);
    for (let i = 0; i < 5; i++) { const a = i * 1.2566; add(wg, boxG(0.205, 0.035, 0.14), M(shade(boss ? '#d6dade' : '#e8e9ea', -0.18), 0.35, 0.4), 0, Math.sin(a) * 0.1, Math.cos(a) * 0.1, a); }
    wheels.push(wg);
  }
  // remember rest transforms
  const all = [body, cabin, glass, hood, bumpF, bumpR, ...doors, ...wheels];
  for (const ob of all) ob.userData.rest = { p: ob.position.clone(), r: ob.rotation.clone(), s: ob.scale.clone(), v: ob.visible };
  const dent = carPaintDamaged(col), burnt = carBurnt(), cracked = T.crackGlass();
  return {
    name: boss ? '사장님 차' : '자동차', mass: boss ? 2000 : 1500, price: boss ? 150000000 : 60000000, material: 'metal',
    parts: { body, cabin, glass, wheels, hood, doors, bumpers: [bumpF, bumpR] },
    set(stage) {
      const st = Math.max(0, Math.min(4, Math.round(+stage || 0)));
      for (const ob of all) { const r = ob.userData.rest; ob.position.copy(r.p); ob.rotation.copy(r.r); ob.scale.copy(r.s); ob.visible = r.v; }
      panes.forEach((p) => { p.material = st >= 1 ? cracked : glassM; });
      paintMeshes.forEach((m) => { m.material = st >= 4 ? burnt : st >= 2 ? dent : paint; });
      if (st >= 2) {
        hood.rotation.set(-0.32, 0, 0.07); hood.scale.set(0.97, 1, 0.92);
        doors[0].rotation.y = -0.55; doors[3].rotation.y = 0.12; doors[3].position.x += 0.04;
        bumpF.rotation.z = 0.32; bumpR.rotation.z = -0.12;
        body.rotation.z = 0.015;
      }
      if (st >= 3) {
        cabin.scale.y = 0.62; cabin.rotation.z = -0.05;
        body.position.y = -0.24; body.rotation.set(0.03, 0, -0.06);
        const fl = wheels[0], f2 = wheels[3];
        fl.position.set(-W / 2 - 0.7, 0.11, wz + 0.4); fl.rotation.set(0, 0.4, PI / 2);
        f2.position.set(W / 2 + 0.75, 0.11, -wz - 0.3); f2.rotation.set(0, -0.3, PI / 2);
        wheels[1].rotation.z = 0.45; wheels[1].position.y -= 0.12; wheels[2].rotation.z = -0.4; wheels[2].position.y -= 0.12;
        doors[0].rotation.y = -1.1;
      }
      if (st >= 4) {
        glass.visible = false;
        cabin.scale.y = 0.22; body.scale.y = 0.62; body.position.y = -0.3; body.rotation.set(0.05, 0.04, -0.08);
        hood.rotation.set(-0.7, 0.1, 0.15); hood.scale.set(0.9, 1, 0.7);
        doors[0].position.set(-W / 2 - 0.5, 0.05 / 0.62, doors[0].userData.rest.p.z - 0.3); doors[0].rotation.set(0, 0.3, -PI / 2);
        wheels[1].visible = false; wheels[2].rotation.z = -PI / 2; wheels[2].position.set(W / 2 + 0.6, 0.11, wz + 0.6);
        bumpF.rotation.z = 0.9; bumpR.rotation.z = -0.5;
      }
    },
  };
};
D.forklift = (g) => {
  const yel = M('#f0b21c', 0.45), dk = M('#2b2d31', 0.6), steel = M('#4c5259', 0.45, 0.45), tire = M('#1f2024', 0.85);
  // chassis + counterweight
  RB(g, 1.1, 0.5, 1.6, 0.1, yel, 0, 0.22, -0.1, 2);
  RB(g, 1.12, 0.62, 0.5, 0.18, M('#3a3d44', 0.55), 0, 0.2, -0.95, 2);
  RB(g, 1.0, 0.06, 1.2, 0.02, dk, 0, 0.72, -0.05);
  // seat + steering
  RB(g, 0.48, 0.1, 0.45, 0.04, M('#1f2024', 0.7), 0, 0.78, -0.35, 2);
  RB(g, 0.48, 0.5, 0.1, 0.04, M('#1f2024', 0.7), 0, 0.85, -0.6, 2, -0.12);
  rod(g, 0.03, dk, [0, 0.75, 0.25], [0, 1.15, 0.1], 8);
  add(g, torG(0.15, 0.022, 6, 18), dk, 0, 1.17, 0.08, -0.9);
  for (const sx of [-0.18, -0.08]) RB(g, 0.03, 0.18, 0.03, 0.01, M('#d8352a', 0.5), sx, 0.78, 0.35);
  // overhead guard
  const post = (a, b) => rod(g, 0.035, M('#2e3238', 0.5, 0.3), a, b, 8);
  post([0.45, 0.72, 0.35], [0.45, 2.1, 0.25]); post([-0.45, 0.72, 0.35], [-0.45, 2.1, 0.25]);
  post([0.45, 0.72, -0.8], [0.45, 2.1, -0.6]); post([-0.45, 0.72, -0.8], [-0.45, 2.1, -0.6]);
  RB(g, 1.0, 0.06, 0.95, 0.02, M('#2e3238', 0.5, 0.3), 0, 2.08, -0.17);
  for (let i = 0; i < 5; i++) noShadow(B(g, 0.9, 0.02, 0.06, yel, 0, 2.14, -0.55 + i * 0.19));
  // beacon
  C(g, 0.05, 0.05, 0.04, dk, 0.3, 2.14, -0.5, 10);
  noShadow(S(g, glow('#ffa24a', '#ff7a00', 1.5), 0.3, 2.22, -0.5, 0.05, 0.06, 0.05, 10, 6));
  // wheels
  for (const sx of [-1, 1]) {
    add(g, torG(0.22, 0.11, 8, 18), tire, sx * 0.55, 0.33, 0.5, 0, PI / 2, 0); C(g, 0.17, 0.17, 0.2, yel, sx * 0.55, 0.33, 0.5, 12, 0, 0, PI / 2);
    add(g, torG(0.17, 0.09, 8, 16), tire, sx * 0.52, 0.26, -0.75, 0, PI / 2, 0); C(g, 0.12, 0.12, 0.16, dk, sx * 0.52, 0.26, -0.75, 10, 0, 0, PI / 2);
  }
  // mast
  for (const sx of [-0.32, 0.32]) { RB(g, 0.08, 2.3, 0.1, 0.01, steel, sx, 0.12, 0.85); RB(g, 0.06, 2.2, 0.07, 0.01, M('#5d646c', 0.45, 0.4), sx * 0.85, 0.15, 0.9); }
  B(g, 0.72, 0.08, 0.1, steel, 0, 2.32, 0.85); B(g, 0.72, 0.06, 0.1, steel, 0, 0.12, 0.85);
  rod(g, 0.03, M('#9aa1a8', 0.3, 0.6), [0, 0.3, 0.8], [0, 2.0, 0.8], 10);
  // carriage + forks (moves)
  const car = dyn(grp(g, 0, 0, 0.98));
  B(car, 0.8, 0.45, 0.05, dk, 0, 0.08, 0);
  for (let i = 0; i < 3; i++) B(car, 0.8, 0.03, 0.06, yel, 0, 0.12 + i * 0.15, 0.01);
  for (const sx of [-0.22, 0.22]) { B(car, 0.1, 0.5, 0.05, steel, sx, 0.05, 0.04); RB(car, 0.1, 0.05, 1.05, 0.01, steel, sx, 0.05, 0.57); }
  const fork = new THREE.Object3D(); fork.position.set(0, 0.1, 0.6); car.add(fork);
  return {
    name: '지게차', mass: 2500, price: 25000000, material: 'metal', ride: 'forklift', fork,
    parts: { carriage: car },
    set(v) { v = Math.max(0, Math.min(1, +v || 0)); car.position.y = v * 1.6; },
  };
};
D.drum = (g, o) => {
  const col = o.color || '#c8372b', m = M(col, 0.45, 0.25);
  C(g, 0.29, 0.29, 0.88, m, 0, 0, 0, 22);
  for (const y of [0.3, 0.58]) add(g, torG(0.292, 0.016, 4, 22), m, 0, y, 0, PI / 2);
  for (const y of [0.01, 0.87]) add(g, torG(0.285, 0.02, 4, 22), M(shade(col, -0.1), 0.4, 0.3), 0, y, 0, PI / 2);
  noShadow(C(g, 0.275, 0.275, 0.005, M(shade(col, -0.05), 0.5, 0.2), 0, 0.875, 0, 20));
  C(g, 0.035, 0.035, 0.02, M('#9aa0a7', 0.35, 0.6), 0.14, 0.875, 0.05, 8); C(g, 0.022, 0.022, 0.02, M('#9aa0a7', 0.35, 0.6), -0.15, 0.875, -0.04, 8);
  noShadow(add(g, G('drumLab', () => new THREE.CylinderGeometry(0.293, 0.293, 0.22, 16, 1, true, -0.45, 0.9)), texMat('drumLabel', 128, 96, (x, w, h) => {
    x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, w, h);
    x.save(); x.translate(64, 44); x.rotate(PI / 4); x.fillStyle = '#e8472a'; x.fillRect(-26, -26, 52, 52); x.strokeStyle = '#1d1d1d'; x.lineWidth = 3; x.strokeRect(-23, -23, 46, 46); x.restore();
    x.fillStyle = '#1d1d1d'; x.beginPath(); x.moveTo(64, 26); x.quadraticCurveTo(78, 44, 70, 56); x.quadraticCurveTo(64, 48, 60, 56); x.quadraticCurveTo(50, 44, 64, 26); x.fill();
    x.fillStyle = '#1d1d1d'; fitText(x, '인화성 물질', 64, 86, 120, 14);
  }), 0, 0.44, 0));
  return { name: '드럼통', mass: 40, price: 120000, material: 'metal' };
};
D.parkingPillar = (g, o) => {
  const h = o.h || 3.0, txt = o.text || 'A';
  const conc = M('#ffffff', 0.85, 0, { map: repTex(tex2.concrete(), 0.7, h / 1.2, 'cc') }, 'pillarConc' + h);
  B(g, 0.8, h, 0.8, conc, 0, 0, 0);
  const haz = T.hazard();
  B(g, 0.82, 1.0, 0.82, haz, 0, 0, 0);
  const sign = texMat('zone:' + txt, 128, 192, (x, w, h2) => {
    x.fillStyle = '#2f6fd6'; x.fillRect(0, 0, w, h2);
    x.fillStyle = '#ffffff'; fitText(x, 'B2', w / 2, 30, 110, 30);
    x.fillStyle = '#ffffff'; fitText(x, txt, w / 2, 112, 110, 110);
    x.fillStyle = '#f2c21b'; x.fillRect(0, h2 - 14, w, 14);
  }, {}, 0.6);
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; noShadow(add(g, planeG(0.5, 0.75), sign, Math.sin(a) * 0.402, 1.75, Math.cos(a) * 0.402, 0, a, 0)); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) RB(g, 0.08, 1.0, 0.08, 0.02, M('#1d1d1d', 0.8), sx * 0.4, 0, sz * 0.4);
  return { name: '주차장 기둥', mass: 0, price: 0, material: 'metal' };
};
D.wheelStop = (g) => {
  const t = texMat('wheelStop', 256, 32, (x, w, h) => { x.fillStyle = '#f2c21b'; x.fillRect(0, 0, w, h); x.fillStyle = '#1e1e20'; for (let i = 0; i < 8; i++) x.fillRect(i * 32 + 16, 0, 16, h); }, {}, 0.7);
  RB(g, 1.6, 0.12, 0.18, 0.04, t, 0, 0, 0, 2);
  for (const sx of [-0.55, 0.55]) C(g, 0.025, 0.025, 0.01, M('#9aa0a7', 0.4, 0.5), sx, 0.12, 0, 8);
  return { name: '카스토퍼', mass: 15, price: 30000, material: 'plastic' };
};
D.barrierGate = (g) => {
  const body = M('#f2c21b', 0.45), dk = M('#2b2d31', 0.6);
  RB(g, 0.4, 1.0, 0.36, 0.04, body, 0, 0.04, 0, 2);
  RB(g, 0.46, 0.06, 0.42, 0.02, dk, 0, 0, 0);
  RB(g, 0.42, 0.1, 0.38, 0.03, dk, 0, 1.0, 0);
  noShadow(add(g, planeG(0.3, 0.3), T.hazard(), 0, 0.6, 0.181));
  noShadow(S(g, glow('#ff5a4a', '#ff2a1a', 1.3), 0, 1.13, 0, 0.05, 0.04, 0.05, 10, 6));
  const arm = dyn(grp(g, 0.22, 0.88, 0.0));
  C(arm, 0.08, 0.08, 0.1, dk, 0, 0, 0, 14, PI / 2);
  const armT = texMat('armStripe', 256, 16, (x, w, h) => { x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, w, h); x.fillStyle = '#d8352a'; for (let i = 0; i < 8; i++) x.fillRect(i * 32, 0, 16, h); }, {}, 0.5);
  RB(arm, 3.3, 0.08, 0.06, 0.03, armT, 1.7, -0.04, 0, 2);
  noShadow(S(arm, glow('#ff5a4a', '#ff2a1a', 1.0), 3.32, 0, 0.035, 0.02, 0.02, 0.01, 8, 4));
  return {
    name: '주차 차단기', mass: 0, price: 2500000, material: 'metal',
    parts: { arm },
    set(v) { v = Math.max(0, Math.min(1, +v || 0)); arm.rotation.z = v * PI * 0.48; },
  };
};
D.ticketBooth = (g) => {
  const W = 1.5, H = 2.3, Dp = 1.4;
  const white = M('#eef0f1', 0.45), blue = M('#2f6fd6', 0.45), glassM = M('#9fc6dc', 0.15, 0.2, { emissive: '#bfe3ff', emissiveIntensity: 0.18 }, 'boothGlass');
  RB(g, W, 1.0, Dp, 0.04, white, 0, 0.06, 0, 2);
  RB(g, W + 0.06, 0.08, Dp + 0.06, 0.02, M('#5c636b', 0.5), 0, 0, 0);
  // window band
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) RB(g, 0.08, 1.1, 0.08, 0.02, blue, sx * (W / 2 - 0.04), 1.06, sz * (Dp / 2 - 0.04));
  B(g, W - 0.12, 1.08, Dp - 0.12, glassM, 0, 1.07, 0);
  for (const sx of [-1, 1]) B(g, 0.03, 1.08, Dp - 0.1, white, sx * 0.0 + sx * 0.001, 1.07, 0).scale.set(1, 1, 1);
  RB(g, W + 0.3, 0.16, Dp + 0.3, 0.04, blue, 0, 2.16, 0, 2);
  RB(g, W + 0.1, 0.04, 0.3, 0.01, M('#5c636b', 0.5), 0, 1.02, Dp / 2 + 0.1);
  RB(g, 1.1, 0.3, 0.06, 0.02, M('#1d2b4f', 0.5), 0, 2.32, Dp / 2 + 0.05);
  noShadow(add(g, planeG(1.04, 0.26), texMat('boothSign', 256, 64, (x, w, h) => { x.fillStyle = '#f2c21b'; rrect(x, 0, 0, w, h, 10); x.fill(); x.fillStyle = '#1d2b4f'; fitText(x, '주차 정산소', w / 2, h / 2 + 2, 230, 38); }, { transparent: true }), 0, 2.47, Dp / 2 + 0.082));
  noShadow(add(g, planeG(0.5, 0.3), texMat('boothPrice', 128, 76, (x, w, h) => { x.fillStyle = '#fbfaf5'; x.fillRect(0, 0, w, h); x.fillStyle = '#1d2b4f'; fitText(x, '주차요금', w / 2, 14, 110, 16); x.fillStyle = '#333'; x.font = `12px ${KFONT}`; x.textAlign = 'left'; x.fillText('최초 30분  무료', 8, 38); x.fillText('10분당  1,000원', 8, 56); x.fillText('임원  전액 무료', 8, 72); }), 0.3, 0.68, Dp / 2 + 0.002));
  return { name: '정산소', mass: 0, price: 3000000, material: 'metal' };
};
D.pipeRun = (g, o) => {
  const w = o.w || 4, top = 0.6;
  const red = M('#c8372b', 0.45, 0.2), grey = M('#aeb4bb', 0.4, 0.45), grn = M('#4f8f5a', 0.5), tray = M('#e2b43c', 0.5, 0.2), rodM = M('#6c737c', 0.45, 0.5);
  rod(g, 0.06, red, [-w / 2, 0.3, -0.3], [w / 2, 0.3, -0.3], 12);
  rod(g, 0.14, grey, [-w / 2, 0.2, 0.05], [w / 2, 0.2, 0.05], 16);
  rod(g, 0.045, grn, [-w / 2, 0.36, 0.35], [w / 2, 0.36, 0.35], 10);
  B(g, w, 0.02, 0.26, tray, 0, 0.45, -0.05); for (const sz of [-0.18, 0.08]) B(g, w, 0.06, 0.01, tray, 0, 0.45, sz);
  for (let i = 0; i < 4; i++) rod(g, 0.012, M(['#222', '#3a3d44', '#1f3b6b', '#222'][i], 0.7), [-w / 2, 0.48, -0.15 + i * 0.05], [w / 2, 0.48, -0.15 + i * 0.05], 5);
  const n = Math.max(2, Math.round(w / 1.5));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.3 + (w - 0.6) * i / (n - 1);
    for (const z of [-0.36, 0.42]) rod(g, 0.008, rodM, [x, 0.06, z], [x, top, z], 4);
    rod(g, 0.012, rodM, [x, 0.06, -0.36], [x, 0.06, 0.42], 4);
    add(g, torG(0.07, 0.01, 4, 12), rodM, x, 0.3, -0.3, 0, PI / 2, 0);
  }
  for (const x of [-w / 2 + 0.6, w / 2 - 0.9]) { C(g, 0.03, 0.03, 0.05, M('#c9a227', 0.35, 0.6), x, 0.2, -0.3, 10); }
  return { name: '천장 배관', mass: 0, price: 0, material: 'metal', mount: 'ceiling' };
};
D.exitSign = (g) => {
  RB(g, 0.44, 0.18, 0.08, 0.015, M('#f2f2ee', 0.5), 0, 0, -0.04);
  noShadow(add(g, planeG(0.4, 0.15), glowMat('exitSign', 256, 96, (x, w, h) => {
    x.fillStyle = '#1aa84f'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f4fff6'; x.fillRect(8, 10, 64, 76); x.fillStyle = '#1aa84f'; x.fillRect(16, 18, 48, 68);
    x.fillStyle = '#f4fff6';
    x.beginPath(); x.arc(100, 22, 9, 0, 7); x.fill();
    x.lineWidth = 9; x.lineCap = 'round'; x.strokeStyle = '#f4fff6';
    x.beginPath(); x.moveTo(98, 34); x.lineTo(88, 58); x.lineTo(70, 78); x.moveTo(88, 58); x.lineTo(104, 66); x.lineTo(104, 84); x.moveTo(96, 40); x.lineTo(80, 46); x.moveTo(97, 40); x.lineTo(112, 52); x.stroke();
    fitText(x, '출구', 184, 52, 120, 56);
  }, 1.3), 0, 0.09, 0.0015));
  return { name: '비상구 유도등', mass: 0, price: 80000, material: 'plastic', mount: 'wall' };
};
D.cctv = (g) => {
  const wh = M('#f2f2ee', 0.4), dk = M('#1d1e22', 0.4);
  RB(g, 0.12, 0.16, 0.03, 0.01, wh, 0, 0, -0.18);
  rod(g, 0.02, wh, [0, 0.08, -0.17], [0, 0.12, 0.0], 8);
  const cam = grp(g, 0, 0.16, 0.06, 0.35);
  RB(cam, 0.12, 0.11, 0.3, 0.04, wh, 0, -0.055, 0, 2);
  RB(cam, 0.15, 0.015, 0.34, 0.006, wh, 0, 0.055, 0.02);
  C(cam, 0.04, 0.04, 0.01, dk, 0, 0, 0.15, 14, PI / 2);
  noShadow(S(cam, M('#2a3a5a', 0.1, 0.4), 0, 0, 0.155, 0.03, 0.03, 0.01, 10, 6));
  noShadow(S(cam, glow('#ff4a3a', '#ff1a0a', 1.6), 0.045, 0.03, 0.15, 0.007, 0.007, 0.004, 6, 4));
  return { name: 'CCTV', mass: 1.5, price: 300000, material: 'plastic', mount: 'wall' };
};
D.tireStack = (g) => {
  const tire = M('#232428', 0.88), rimM = M('#3a3c42', 0.6);
  const r = rng(4);
  for (let i = 0; i < 4; i++) {
    const x = (r() - 0.5) * 0.06, z = (r() - 0.5) * 0.06;
    add(g, torG(0.25, 0.11, 8, 20), tire, x, 0.11 + i * 0.215, z, PI / 2, 0, (r() - 0.5) * 0.06);
    noShadow(C(g, 0.15, 0.15, 0.01, rimM, x, 0.105 + i * 0.215, z, 14));
  }
  return { name: '타이어 더미', mass: 60, price: 600000, material: 'soft' };
};
D.floorArrow = (g, o) => {
  const col = o.color || '#f4f4ee';
  const t = texMat('floorArrow', 128, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(64, 6); x.lineTo(120, 92); x.lineTo(84, 92); x.lineTo(84, 250); x.lineTo(44, 250); x.lineTo(44, 92); x.lineTo(8, 92); x.closePath(); x.fill();
    x.globalCompositeOperation = 'destination-out'; const r = rng(8);
    for (let i = 0; i < 300; i++) { x.globalAlpha = r() * 0.7; x.fillRect(r() * w, r() * h, 2 + r() * 4, 1 + r() * 3); }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }, { transparent: true, alphaTest: 0.35, color: col }, 0.8);
  const m = M(col, 0.8, 0, { map: t.map, transparent: true, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2 }, 'floorArrowM' + col);
  const p = noShadow(add(g, planeG(1.0, 2.0), m, 0, 0.004, 0, -PI / 2)); p.receiveShadow = true;
  return { name: '바닥 화살표', mass: 0, price: 0, material: 'paper' };
};
D.parkingLine = (g, o) => {
  const w = o.w || 2.5, d = o.d || 5.0, txt = o.text || '';
  const t = canvasTex('p2:bay' + w + 'x' + d + txt, 256, Math.round(256 * d / w), (x, W, H) => {
    x.clearRect(0, 0, W, H); x.fillStyle = '#fff'; const lw = Math.round(W * 0.12 / w);
    x.fillRect(0, 0, lw, H); x.fillRect(W - lw, 0, lw, H); x.fillRect(0, 0, W, lw);
    if (txt) { x.font = `bold ${Math.round(W * 0.35)}px ${KFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, W / 2, H * 0.16); }
    x.globalCompositeOperation = 'destination-out'; const r = rng(9);
    for (let i = 0; i < 500; i++) { x.globalAlpha = r() * 0.7; x.fillRect(r() * W, r() * H, 2 + r() * 5, 1 + r() * 3); }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  });
  const m = M('#f4f4ee', 0.8, 0, { map: t, transparent: true, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2 }, 'bayM' + w + 'x' + d + txt);
  const p = noShadow(add(g, planeG(w, d), m, 0, 0.004, 0, -PI / 2)); p.receiveShadow = true;
  return { name: '주차선', mass: 0, price: 0, material: 'paper' };
};

// ================================================================= 7층 추가
D.alarmBell = (g) => {
  const red = M('#d8302a', 0.4), ch = chrome();
  RB(g, 0.32, 0.44, 0.08, 0.025, red, 0, 0, 0, 2);
  // bell dome
  add(g, G('bellDome', () => new THREE.SphereGeometry(0.075, 16, 8, 0, PI * 2, 0, PI / 2)), M('#d8302a', 0.3, 0.2, { side: THREE.DoubleSide }, 'bellDome'), 0, 0.33, 0.04, PI / 2);
  C(g, 0.012, 0.012, 0.02, ch, 0, 0.33, 0.12, 8, PI / 2);
  // pilot lamp
  const lampM = new THREE.MeshStandardMaterial({ color: '#ff6a5a', emissive: '#ff2a1a', emissiveIntensity: 0.4, roughness: 0.3 });
  const lamp = dyn(noShadow(S(g, lampM, 0.1, 0.38, 0.05, 0.025, 0.025, 0.02, 10, 6)));
  // push button with clear cover
  C(g, 0.06, 0.06, 0.02, M('#f4f2ee', 0.4), 0, 0.17, 0.04, 20, PI / 2);
  const btn = dyn(grp(g, 0, 0.17, 0.05));
  C(btn, 0.035, 0.035, 0.03, M('#f4f2ee', 0.35), 0, 0, 0.0, 16, PI / 2);
  noShadow(add(g, planeG(0.26, 0.07), texMat('alarmLabel', 160, 44, (x, w, h) => { x.fillStyle = '#d8302a'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; fitText(x, '화재 발신기', w / 2, 14, 150, 18); fitText(x, '누르면 경보가 울립니다', w / 2, 33, 150, 11, 'normal'); }), 0, 0.055, 0.041));
  noShadow(add(g, planeG(0.05, 0.02), texMat('alarmPush', 64, 24, (x, w, h) => { x.fillStyle = '#f4f2ee'; x.fillRect(0, 0, w, h); x.fillStyle = '#d8302a'; fitText(x, '누름', w / 2, h / 2, 60, 18); }), 0, 0.17, 0.081));
  let on = false;
  lamp.onBeforeRender = () => { if (on) lampM.emissiveIntensity = (performance.now() % 500) < 250 ? 2.4 : 0.3; };
  return {
    name: '비상벨', mass: 0, price: 50000, material: 'metal', mount: 'wall',
    set(s) { on = !!s && s !== 'off'; btn.position.z = on ? 0.035 : 0.05; lampM.emissiveIntensity = on ? 2.4 : 0.4; },
  };
};
D.sprinkler = (g) => {
  const brass = M('#c9a227', 0.35, 0.65), ch = chrome();
  C(g, 0.05, 0.05, 0.008, ch, 0, 0.082, 0, 16);
  C(g, 0.015, 0.018, 0.03, brass, 0, 0.052, 0, 10);
  for (const s of [-1, 1]) rod(g, 0.0045, brass, [s * 0.012, 0.052, 0], [s * 0.008, 0.012, 0], 4);
  noShadow(C(g, 0.0045, 0.0045, 0.02, M('#e8302a', 0.1, 0, { transparent: true, opacity: 0.85, emissive: '#a01010', emissiveIntensity: 0.4 }, 'sprBulb'), 0, 0.022, 0, 8));
  C(g, 0.022, 0.022, 0.004, brass, 0, 0.006, 0, 12);
  let spray;
  return {
    name: '스프링클러', mass: 0, price: 30000, material: 'metal', mount: 'ceiling',
    after() {
      spray = dyn(grp(g)); spray.visible = false;
      noShadow(add(spray, cylG(0.02, 1.2, 2.2, 18, true), M('#bfe6ff', 0.1, 0, { transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }, 'spray'), 0, -1.1, 0));
    },
    set(s) { if (spray) spray.visible = !!s && s !== 'off'; },
  };
};

export const PROP2_TYPES = Object.keys(D);

// ---------------------------------------------------------------- assembly (same as props.js: merge static meshes by material, cached)
const KEEP = new Set(['position', 'normal', 'uv']);
function prepGeo(m) {
  let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
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
    if (!b) { b = { mat: m.material, cast: m.castShadow, order: m.renderOrder | 0, geos: [] }; buckets.set(k, b); }
    b.geos.push(prepGeo(m)); victims.push(m);
  });
  for (const v of victims) v.parent.remove(v);
  const parts = [];
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    parts.push({ geo, mat: b.mat, cast: b.cast, order: b.order });
  }
  return parts;
}
function partsToMeshes(parts, parent) {
  for (const p of parts) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = p.cast; m.receiveShadow = true; m.renderOrder = p.order; parent.add(m); }
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
const PARTS = new Map();
const _box = new THREE.Box3();
const BASE_KEYS = new Set(['name', 'mass', 'price', 'material', 'set', 'after']);

export function makeProp2(type, opts = {}) {
  const build = D[type];
  if (!build) throw new Error('makeProp2: unknown type ' + type);
  const key = type + JSON.stringify(opts);
  const group = new THREE.Group();
  group.name = 'prop2:' + type;
  const cached = STATIC.get(key);
  if (cached) {
    const inner = new THREE.Group(); inner.position.copy(cached.offset); group.add(inner);
    partsToMeshes(cached.parts, inner);
    return Object.assign({ group, type, size: { ...cached.size }, colors: cached.colors.slice() }, cached.info);
  }
  const inner = new THREE.Group();
  const info = build(inner, opts) || {};
  const colors = colorsOf(inner);
  let parts = mergeStatic(inner);
  // props with set()/moving parts are rebuilt per instance, but their merged static parts are identical for the
  // same options → share those geometries so untouched copies can still be drawn through one InstancedMesh
  const prevParts = PARTS.get(key);
  if (prevParts && prevParts.length === parts.length && prevParts.every((p, i) => p.mat === parts[i].mat)) { for (const p of parts) p.geo.dispose(); parts = prevParts; }
  else PARTS.set(key, parts);
  partsToMeshes(parts, inner);
  inner.updateMatrixWorld(true);
  _box.setFromObject(inner);
  const size = { x: +(_box.max.x - _box.min.x).toFixed(3), y: +(_box.max.y - _box.min.y).toFixed(3), z: +(_box.max.z - _box.min.z).toFixed(3) };
  const offset = new THREE.Vector3(-(_box.max.x + _box.min.x) / 2, -_box.min.y, -(_box.max.z + _box.min.z) / 2);
  inner.position.copy(offset);
  group.add(inner);
  let hasDyn = false; inner.traverse((o) => { if (o !== inner && o.userData.dyn) hasDyn = true; });
  const base = { name: info.name || type, mass: info.mass || 0, price: info.price || 0, material: info.material || 'plastic' };
  let plain = true;
  for (const k of Object.keys(info)) if (!BASE_KEYS.has(k)) { base[k] = info[k]; if (info[k] && typeof info[k] === 'object') plain = false; }
  if (!hasDyn && !info.set && plain) STATIC.set(key, { parts, info: base, size, offset, colors });
  const out = Object.assign({ group, type, size, colors }, base);
  if (info.set) {
    // hidden extras (puddles, shards, spray) are only built on the first "active" set() so they never widen the rest bounds
    let built = !info.after;
    out.set = (s) => { if (!built && s && s !== 'ok' && s !== 'off') { built = true; info.after(inner); } info.set(s); };
  }
  return out;
}
