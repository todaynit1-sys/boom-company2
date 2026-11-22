// 회사 뿌개기 — shared floor builder library.
// A floor = static decor (merged per material), colliders (rects for walking, boxes for physics),
// prop specs (become physics records in phys.js: dynamic, fixed fixtures or hanging), NPC specs,
// elevators, breakable windows / out-zones and anchors. The floors themselves live in js/floors/*.js
// and only talk to this file through the `ctx` object built in makeCtx() (see js/floors/README.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeProp, deskTopLayout, PROP_TYPES } from './art/props.js';
import { makeProp2, tex2 } from './art/props2.js';
import { tex, canvasTex, KFONT } from './art/tex.js';
import { FLOORS, FLOOR_BY_ID } from './floors/index.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- props from either art module
const P1 = new Set(PROP_TYPES);
export const PROP2_PRICE_SCALE = 0.1; // props2 prices are ~10× the props.js scale → one coherent bill
export function makeAny(type, opts = {}) {
  if (P1.has(type)) return makeProp(type, opts);
  const p = makeProp2(type, opts);
  p.price = Math.round((p.price || 0) * PROP2_PRICE_SCALE);
  p.v2 = true;
  return p;
}

// ---------------------------------------------------------------- shared floor materials (module cache, never disposed)
const MATS = new Map();
function mat(key, make) { let m = MATS.get(key); if (!m) { m = make(); MATS.set(key, m); } return m; }
function rep(t, rx, ry) { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; }
export const M = {
  carpet: () => mat('carpet', () => new THREE.MeshStandardMaterial({ map: rep(tex.carpet('#3b5486'), 26, 18), roughness: 0.96 })),
  ceilOffice: () => mat('ceilO', () => new THREE.MeshStandardMaterial({ map: rep(tex.ceilingTile(), 26 / 0.6, 18 / 0.6), roughness: 1 })),
  ceilLobby: () => mat('ceilL', () => new THREE.MeshStandardMaterial({ map: rep(tex.wallPaint('#efece6'), 8, 6), roughness: 1 })),
  wall: () => mat('wall', () => new THREE.MeshStandardMaterial({ map: rep(tex.wallPaint('#ece3d3'), 6, 2), roughness: 0.92 })),
  wallBlue: () => mat('wallB', () => new THREE.MeshStandardMaterial({ color: '#c9d4e3', roughness: 0.9 })),
  skirting: () => mat('skirt', () => new THREE.MeshStandardMaterial({ color: '#5b5f68', roughness: 0.6 })),
  alu: () => mat('alu', () => new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.35, metalness: 0.5 })),
  sill: () => mat('sill', () => new THREE.MeshStandardMaterial({ color: '#e4e1da', roughness: 0.6 })),
  blinds: () => mat('blinds', () => new THREE.MeshStandardMaterial({ map: rep(tex.blinds(), 3, 1.1), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 })),
  terrazzo: () => mat('terrazzo', () => new THREE.MeshStandardMaterial({ map: rep(tex.terrazzo(), 26 / 2.6, 18 / 2.6), roughness: 0.42, metalness: 0.02 })),
  marble: (rx, ry) => mat('marble' + rx + 'x' + ry, () => new THREE.MeshStandardMaterial({ map: rep(tex.marbleWall(), rx, ry), roughness: 0.5 })),
  darkWood: () => mat('dwood', () => new THREE.MeshStandardMaterial({ color: '#4a3a2e', roughness: 0.7 })),
  cafeWall: () => mat('cafeWall', () => new THREE.MeshStandardMaterial({ map: rep(tex.woodSlat(), 8, 2.5), roughness: 0.75 })),
  header: () => mat('header', () => new THREE.MeshStandardMaterial({ color: '#34363b', roughness: 0.55 })),
  rope: () => mat('rope', () => new THREE.MeshStandardMaterial({ color: '#28336a', roughness: 0.6 })),
  street: () => mat('street', () => new THREE.MeshStandardMaterial({ color: '#a7a39b', roughness: 0.9 })),
  road: () => mat('road', () => new THREE.MeshStandardMaterial({ color: '#55585e', roughness: 0.95 })),
  lawn: () => mat('lawn', () => new THREE.MeshStandardMaterial({ color: '#6f9a5a', roughness: 1 })),
  glass: () => mat('glassL', () => new THREE.MeshStandardMaterial({ color: '#cfe6ee', roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })),
  pane: () => mat('pane', () => new THREE.MeshStandardMaterial({ color: '#d8eef6', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })),
  // plain coloured standard material, cached by key
  std: (key, params) => mat('std:' + key, () => new THREE.MeshStandardMaterial(params)),
  // a texture repeated rx × ry (the source texture is cloned once per key)
  tex: (key, texture, rx, ry, params = {}) => mat('tex:' + key + rx + 'x' + ry, () => new THREE.MeshStandardMaterial(Object.assign({ map: rep(texture, rx, ry), roughness: 0.85 }, params))),
};
const SKY = new Map();
function skyMat(time) {
  let m = SKY.get(time);
  if (!m) {
    const t = tex.skyline(time).clone(); t.repeat.set(0.7, 1); t.offset.x = 0.15; t.needsUpdate = true;
    m = new THREE.MeshBasicMaterial({ map: t, fog: false, side: THREE.BackSide, toneMapped: true });
    SKY.set(time, m);
  }
  return m;
}

// small items that should not cast shadows (keeps the shadow pass cheap)
const NO_CAST = new Set(['mouse', 'penCup', 'plantSmall', 'calendar', 'mug', 'paperStack', 'keyboard', 'phone', 'paperSheet', 'paperBall', 'smartphone', 'icedCoffee', 'hotCoffee', 'cupStack', 'bottle', 'beerMug', 'nameplate', 'parcel', 'wheelStop', 'cone', 'tambourine']);
// props whose internals animate (keep their matrices live). Every prop with set() is live as well.
const LIVE_INNER = new Set(['printer', 'elevator', 'revolvingDoor', 'coffeeTray']);

// ---------------------------------------------------------------- floor skeleton
function newFloor(kind) {
  const group = new THREE.Group(); group.name = 'floor:' + kind;
  return {
    kind, group, decor: new THREE.Group(), spec: null,
    rects: [], bodies: [], props: [], elevators: [], npcs: [], anchors: {}, lights: [], animate: [], walkers: [],
    disposables: [], ropes: [], seats: [], desks: [], sprinklers: [], windows: [], outZones: [],
    bounds: { minX: -13, maxX: 13, minZ: -9, maxZ: 9 }, ceilY: 3, skyMesh: null, sky: 'day',
  };
}
function addRect(F, x, z, hx, hz, rot = 0, y1 = 3, extra = null) {
  const r = Object.assign({ x, z, hx, hz, rot, c: Math.cos(rot), s: Math.sin(rot), y1 }, extra || {});
  F.rects.push(r); return r;
}
function addBody(F, x, y, z, hx, hy, hz, rot = 0) { F.bodies.push({ x, y, z, hx, hy, hz, rot }); }
function solid(F, x, z, hx, hz, h, rot = 0, y0 = 0) { addRect(F, x, z, hx, hz, rot, y0 + h); addBody(F, x, y0 + h / 2, z, hx, h / 2, hz, rot); }

function box(F, w, h, d, m, x, y, z, { cast = true, receive = true, collide = false, rotY = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y + h / 2, z); o.rotation.y = rotY;
  o.castShadow = cast; o.receiveShadow = receive;
  F.decor.add(o);
  if (collide) solid(F, x, z, w / 2, d / 2, h, rotY, y);
  return o;
}
function decorProp(F, type, x, y, z, rotY = 0, opts = {}, { rotX = 0, collide = false, scale = 1, cast = true } = {}) {
  const p = makeAny(type, opts);
  p.group.position.set(x, y, z); p.group.rotation.set(rotX, rotY, 0); p.group.scale.setScalar(scale);
  if (!cast) p.group.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  F.decor.add(p.group);
  if (collide) solid(F, x, z, p.size.x / 2 * scale, p.size.z / 2 * scale, p.size.y * scale, rotY, y);
  return p;
}
function liveProp(F, type, x, y, z, rotY = 0, opts = {}, collide = false) {
  const p = makeAny(type, opts);
  p.group.position.set(x, y, z); p.group.rotation.y = rotY;
  F.group.add(p.group);
  if (collide) solid(F, x, z, p.size.x / 2, p.size.z / 2, p.size.y, rotY, y);
  return p;
}
function dynProp(F, type, x, y, z, rotY = 0, opts = {}, tag = null) {
  const p = makeAny(type, opts);
  p.group.position.set(x, y, z); p.group.rotation.y = rotY;
  if (NO_CAST.has(type)) p.group.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  if (p.mass <= 0) { F.decor.add(p.group); solid(F, x, z, p.size.x / 2, p.size.z / 2, p.size.y, rotY, y); return null; }
  F.group.add(p.group);
  const spec = { prop: p, type, x, y, z, rotY, tag, opts };
  F.props.push(spec);
  return spec;
}
// rotate local (lx, lz) by rotY like Object3D.rotation.y
function rot2(lx, lz, r) { const c = Math.cos(r), s = Math.sin(r); return [lx * c + lz * s, -lx * s + lz * c]; }

function floorPlane(F, m, w, d, x = 0, z = 0) {
  const g = new THREE.PlaneGeometry(w, d); const o = new THREE.Mesh(g, m);
  o.rotation.x = -PI / 2; o.position.set(x, 0, z); o.receiveShadow = true; o.castShadow = false;
  F.decor.add(o);
}
function ceiling(F, m, w, d, h, x = 0, z = 0) {
  const g = new THREE.PlaneGeometry(w, d); const o = new THREE.Mesh(g, m);
  o.rotation.x = PI / 2; o.position.set(x, h, z); o.receiveShadow = false; o.castShadow = false;
  F.decor.add(o);
}
function skyBackdrop(F, time, { radius = 42, y0 = -26, h = 52, center = PI, span = 2.6 } = {}) {
  const g = new THREE.CylinderGeometry(radius, radius, h, 40, 1, true, center - span / 2, span);
  const m = new THREE.Mesh(g, skyMat(time));
  m.position.set(0, y0 + h / 2, 0);
  m.castShadow = false; m.receiveShadow = false;
  m.renderOrder = -1;
  F.group.add(m);
  F.skyMesh = m; F.disposables.push(g); F.sky = time;
}

// wall along an axis with rectangular holes (holes: [{a0,a1,top}])
function wallLine(F, axis, fixed, out, a0, a1, h, m, holes = [], th = 0.2) {
  const segs = [];
  let cur = a0;
  const hs = holes.slice().sort((p, q) => p.a0 - q.a0);
  for (const ho of hs) { if (ho.a0 > cur) segs.push([cur, ho.a0, 0, h]); segs.push([ho.a0, ho.a1, ho.top, h]); cur = ho.a1; }
  if (cur < a1) segs.push([cur, a1, 0, h]);
  const c = fixed + out * th / 2;
  for (const [s0, s1, y0, y1] of segs) {
    if (y1 - y0 < 0.01 || s1 - s0 < 0.01) continue;
    const L = s1 - s0, mid = (s0 + s1) / 2;
    if (axis === 'x') box(F, L, y1 - y0, th, m, mid, y0, c, { collide: y0 === 0 });
    else box(F, th, y1 - y0, L, m, c, y0, mid, { collide: y0 === 0 });
  }
}

// elevator built into a wall. (fx,fz) = centre of the frame on the wall plane; rotY faces into the room.
function elevatorAt(F, fx, fz, rotY, label, index) {
  const fwd = V(Math.sin(rotY), 0, Math.cos(rotY));
  const right = V(Math.cos(rotY), 0, -Math.sin(rotY));
  const p = makeProp('elevator', { label });
  const back = p.frontZ - 0.1; // local z of the frame plane
  p.group.position.set(fx - fwd.x * back, 0, fz - fwd.z * back);
  p.group.rotation.y = rotY;
  F.group.add(p.group);
  const front = V(fx, 0, fz);
  const cabin = front.clone().addScaledVector(fwd, -0.74);
  const ev = { index: index == null ? F.elevators.length : index, label, prop: p, front, fwd, right, cabin, open: 0, want: 0, wasOpen: false, inside: false };
  // cabin side + back walls
  for (const s of [-1, 1]) {
    const c = front.clone().addScaledVector(fwd, -0.72).addScaledVector(right, s * 0.53);
    addRect(F, c.x, c.z, 0.04, 0.72, rotY, 2.2);
  }
  const bk = front.clone().addScaledVector(fwd, -1.42);
  addRect(F, bk.x, bk.z, 0.6, 0.05, rotY, 2.2);
  addBody(F, bk.x, 1.05, bk.z, 0.6, 1.05, 0.05, rotY);
  const dr = front.clone().addScaledVector(fwd, -0.06);
  addRect(F, dr.x, dr.z, 0.52, 0.06, rotY, 2.2, { active: () => ev.open < 0.75 });
  F.elevators.push(ev);
  return ev;
}

function addNpc(F, spec) { spec.id = F.kind + ':' + F.npcs.length; F.npcs.push(spec); return spec; }

// a desk with its dressing; returns seat info. rotY 0 → drawers face +Z, the worker sits on the +Z side facing −Z.
let deskSeed = 1;
function deskSet(F, x, z, rotY, { chair = true, occupied = false, items = true, chairJitter = true } = {}) {
  const desk = dynProp(F, 'desk', x, 0, z, rotY, {}, 'desk');
  const seed = deskSeed++;
  const deskItems = [];
  if (items) {
    for (const it of deskTopLayout(seed)) {
      const [ox, oz] = rot2(it.x, it.z, rotY);
      const sp = dynProp(F, it.type, x + ox, it.y, z + oz, rotY + it.rotY, {}, 'deskItem');
      if (sp) deskItems.push(sp);
    }
  }
  const [fx, fz] = rot2(0, 1, rotY);
  const face = rotY + PI;
  const seat = { x: x + fx * 0.7, z: z + fz * 0.7, rotY: face, desk, items: deskItems, chair: null };
  if (chair) {
    const j = chairJitter && !occupied ? 1 : 0;
    const cx = x + fx * (0.62 + j * 0.12) + (j ? (Math.sin(seed * 3.1) * 0.12) : 0);
    const cz = z + fz * (0.62 + j * 0.12);
    seat.chair = dynProp(F, 'chair', cx, 0, cz, face + (j ? Math.sin(seed * 7.3) * 0.5 : 0), {}, 'chair');
  }
  F.seats.push(seat); F.desks.push(desk);
  return seat;
}

// ---------------------------------------------------------------- generic placement: ctx.prop()
// placement keys (everything else is forwarded to the art builder as its options)
const PLACE = new Set(['y', 'tag', 'as', 'scale', 'noCast', 'hp', 'name', 'price', 'solid', 'flip']);
function placeProp(F, type, x, z, rotY = 0, o = {}) {
  const art = {};
  for (const k of Object.keys(o)) if (!PLACE.has(k)) art[k] = o[k];
  const p = makeAny(type, art);
  if (o.name) p.name = o.name;
  if (o.price != null) p.price = o.price;
  let as = o.as;
  if (!as) {
    if (type === 'sprinkler') as = 'sprinkler';
    else if (p.mount === 'ceiling') as = p.mass > 0 && p.price > 0 ? 'hang' : 'decor';
    else if (p.mount === 'wall') as = p.mass > 0 ? 'hang' : (p.price > 0 || p.set ? 'fixed' : 'decor');
    else if (p.mass <= 0) as = p.price > 0 || p.set ? 'fixed' : 'decor';
    else as = 'dyn';
  }
  const sc = o.scale || 1;
  let y = o.y;
  if (y == null) y = p.mount === 'ceiling' ? F.ceilY - p.size.y * sc : p.mount === 'wall' ? 1.4 : 0;
  // wall props: (x, z) is the point on the wall surface, rotY faces into the room
  if (p.mount === 'wall') { x += Math.sin(rotY) * p.size.z * sc / 2; z += Math.cos(rotY) * p.size.z * sc / 2; }
  p.group.position.set(x, y, z); p.group.rotation.y = rotY;
  if (sc !== 1) p.group.scale.setScalar(sc);
  if (o.noCast || NO_CAST.has(type)) p.group.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  const blocks = o.solid !== false && !p.mount && p.size.y * sc > 0.25;
  if (as === 'decor' || as === 'sprinkler') {
    F.decor.add(p.group);
    if (as === 'decor' && (o.solid === true || blocks)) solid(F, x, z, p.size.x * sc / 2, p.size.z * sc / 2, p.size.y * sc, rotY, y);
    if (as === 'sprinkler') F.sprinklers.push(V(x, y, z));
    p.as = as;
    return { prop: p, type, x, y, z, rotY, as, rec: null };
  }
  F.group.add(p.group);
  const spec = { prop: p, type, x, y, z, rotY, tag: o.tag || null, opts: art, as, fixed: as === 'fixed' || as === 'hang', hang: as === 'hang', hp: o.hp || 0, flip: !!o.flip };
  if (as === 'fixed' && blocks) addRect(F, x, z, p.size.x * sc / 2, p.size.z * sc / 2, rotY, y + p.size.y * sc);
  F.props.push(spec);
  return spec;
}

// ---------------------------------------------------------------- breakable windows + out zones
// axis 'z': the window plane is z = at and runs along x (from..to); axis 'x': plane x = at, runs along z.
// side = +1/−1: which way is "outside". Panes block bodies until broken; anything past the plane (+0.35)
// counts as thrown out of the building.
function windowRow(F, { axis = 'z', at, side = -1, from, to, bays = 8, y0 = 0.8, y1 = 2.5, label = '창밖으로!', glass = true } = {}) {
  const n = Math.max(1, bays | 0), L = (to - from) / n;
  const W = { axis, at, side, from, to, y0, y1, bays: [], im: null, label };
  const g = new THREE.BoxGeometry(axis === 'z' ? L - 0.04 : 0.02, y1 - y0, axis === 'z' ? 0.02 : L - 0.04);
  const im = new THREE.InstancedMesh(g, M.pane(), n);
  im.castShadow = false; im.receiveShadow = false; im.renderOrder = 2; im.name = 'windowPanes';
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = from + (i + 0.5) * L;
    const x = axis === 'z' ? a : at, z = axis === 'z' ? at : a;
    const bay = { i, a0: from + i * L, a1: from + (i + 1) * L, x, z, intact: true, body: null };
    W.bays.push(bay);
    m4.makeTranslation(x, (y0 + y1) / 2, z); im.setMatrixAt(i, m4);
    F.bodies.push({ x, y: (y0 + y1) / 2, z, hx: axis === 'z' ? L / 2 : 0.04, hy: (y1 - y0) / 2, hz: axis === 'z' ? 0.04 : L / 2, rot: 0, ref: bay });
  }
  im.instanceMatrix.needsUpdate = true;
  im.visible = glass;
  F.group.add(im); F.disposables.push(g);
  W.im = im;
  F.windows.push(W);
  F.outZones.push({ axis, at, side, from, to, label });
  return W;
}

// ---------------------------------------------------------------- the ctx handed to floor modules
function makeCtx(F, spec, low) {
  const ctx = {
    F, THREE, PI, V, low, spec, M, tex, tex2, canvasTex, KFONT, makeProp: makeAny,
    get anchors() { return F.anchors; },
    size: spec.size,
    // ---- shell
    floor: (m, w = spec.size.w, d = spec.size.d, x = 0, z = 0) => floorPlane(F, m, w, d, x, z),
    ceiling: (m, w = spec.size.w, d = spec.size.d, h = F.ceilY, x = 0, z = 0) => ceiling(F, m, w, d, h, x, z),
    wall: (axis, fixed, out, a0, a1, h, m, holes, th) => wallLine(F, axis, fixed, out, a0, a1, h, m, holes, th),
    box: (w, h, d, m, x, y, z, opts) => box(F, w, h, d, m, x, y, z, opts),
    sky: (time, opts) => skyBackdrop(F, time, opts),
    elevator: (fx, fz, rotY, label, index) => elevatorAt(F, fx, fz, rotY, label, index),
    // walls on all four sides with an elevator pair, lights in a grid → a usable room in one call
    room(o = {}) {
      const w = o.w || spec.size.w, d = o.d || spec.size.d, h = o.h || F.ceilY;
      const hw = w / 2, hd = d / 2;
      if (o.floor !== false) ctx.floor(o.floor || M.carpet(), w, d);
      if (o.ceiling !== false) ctx.ceiling(o.ceiling || M.ceilLobby(), w, d, h);
      const wm = o.wall || M.wall();
      const ev = o.elevators === false ? null : Object.assign({ wall: 'west', at: [-1.6, 1.6], label: spec.label + 'F' }, o.elevators || {});
      const holes = (side) => (ev && ev.wall === side ? ev.at.map((a) => ({ a0: a - 0.5, a1: a + 0.5, top: 2.1 })) : []);
      const skip = new Set(o.skip || []);
      if (!skip.has('north')) wallLine(F, 'x', -hd, -1, -hw - 0.2, hw + 0.2, h, wm, holes('north'));
      if (!skip.has('south')) wallLine(F, 'x', hd, 1, -hw - 0.2, hw + 0.2, h, wm, holes('south'));
      if (!skip.has('west')) wallLine(F, 'z', -hw, -1, -hd, hd, h, wm, holes('west'));
      if (!skip.has('east')) wallLine(F, 'z', hw, 1, -hd, hd, h, wm, holes('east'));
      if (ev) {
        const R = { west: [-hw, null, PI / 2], east: [hw, null, -PI / 2], north: [null, -hd, 0], south: [null, hd, PI] }[ev.wall];
        ev.at.forEach((a, i) => elevatorAt(F, R[0] == null ? a : R[0], R[1] == null ? a : R[1], R[2], ev.label, i));
        const mid = (ev.at[0] + ev.at[ev.at.length - 1]) / 2;
        const sx = R[0] == null ? mid : R[0] + Math.sin(R[2]) * 0.015, sz = R[1] == null ? mid : R[1] + Math.cos(R[2]) * 0.015;
        decorProp(F, 'floorSign', sx, 1.55, sz, R[2], { text: spec.label, h: 0.42 });
      }
      if (o.lights !== false) {
        const st = o.lights || 2.4;
        for (let x = -hw + st / 2; x < hw; x += st) for (let z = -hd + st / 2; z < hd; z += st) decorProp(F, 'ceilingLight', x, h, z, 0, {}, { rotX: PI, cast: false });
      }
    },
    // ---- props
    prop: (type, x, z, rotY = 0, o = {}) => placeProp(F, type, x, z, rotY, o),
    decorProp: (type, x, y, z, rotY, opts, place) => decorProp(F, type, x, y, z, rotY, opts, place),
    dynProp: (type, x, y, z, rotY, opts, tag) => dynProp(F, type, x, y, z, rotY, opts, tag),
    liveProp: (type, x, y, z, rotY, opts, collide) => liveProp(F, type, x, y, z, rotY, opts, collide),
    desk: (x, z, rotY, opts) => deskSet(F, x, z, rotY, opts),
    tag: (spec2, tag) => { if (spec2) spec2.tag = tag; return spec2; },
    // ---- people
    npc: (preset, x, z, o = {}) => addNpc(F, Object.assign({ preset, x, z, rotY: 0, anim: 'idle', face: 'normal', role: 'worker' }, o)),
    addNpc: (s) => addNpc(F, s),
    walker: (w) => F.walkers.push(w),
    // ---- collision
    collider: (x, z, hx, hz, h = 3, rot = 0, y0 = 0) => solid(F, x, z, hx, hz, h, rot, y0),
    rect: (x, z, hx, hz, rot = 0, y1 = 3, extra = null) => addRect(F, x, z, hx, hz, rot, y1, extra),
    // ---- light & surface
    light(x, y, z, { color = '#ffd9a0', intensity = 6, distance = 7, decay = 1.6 } = {}) {
      const l = new THREE.PointLight(color, intensity, distance, decay);
      l.position.set(x, y, z); F.group.add(l); F.lights.push(l); return l;
    },
    // flat sticker on the floor (no z-fighting: polygonOffset + tiny lift). material or { map | color }
    decal(x, z, w, d, { material = null, map = null, color = '#ffffff', rotY = 0, y = 0.006, key = null } = {}) {
      const m = material || M.std('decal:' + (key || (map ? map.uuid : color)), { color, map, transparent: !!map, alphaTest: map ? 0.3 : 0, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const g = new THREE.PlaneGeometry(w, d); const o = new THREE.Mesh(g, m);
      o.rotation.set(-PI / 2, 0, rotY); o.position.set(x, y, z); o.receiveShadow = true; o.castShadow = false;
      F.decor.add(o); return o;
    },
    add(obj, { decor = true } = {}) { (decor ? F.decor : F.group).add(obj); return obj; },
    dispose: (geo) => F.disposables.push(geo),
    animate: (fn) => F.animate.push(fn),
    rope: (a, b) => F.ropes.push({ a, b, mesh: null }),
    // ---- out of the building
    window: (o) => windowRow(F, o),
    outZone: (o) => F.outZones.push(Object.assign({ side: -1, from: -1e9, to: 1e9, label: '밖으로!' }, o)),
    // ---- anchors
    spawn(x, z, yaw = 0) { F.anchors.spawn = V(x, 0, z); F.anchors.spawnYaw = yaw; },
    anchor(name, x, z) { F.anchors[name] = V(x, 0, z); return F.anchors[name]; },
    hide(x, z) { (F.anchors.hide || (F.anchors.hide = [])).push(V(x, 0, z)); },
    bounds(minX, maxX, minZ, maxZ) { Object.assign(F.bounds, { minX, maxX, minZ, maxZ }); },
  };
  return ctx;
}

// ---------------------------------------------------------------- finalize: merge static decor per material
function mergeDecor(F) {
  const root = F.decor;
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const tmp = [];
  root.traverse((m) => {
    if (!m.isMesh) return;
    const k = m.material.uuid + (m.castShadow ? 'c' : 'n') + (m.receiveShadow ? 'r' : 'x') + (m.renderOrder | 0);
    let b = buckets.get(k);
    if (!b) { b = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, ro: m.renderOrder | 0, geos: [] }; buckets.set(k, b); }
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes = {};
    g.applyMatrix4(m.matrixWorld);
    b.geos.push(g); tmp.push(g);
  });
  // dispose the BoxGeometry/PlaneGeometry instances we created ourselves (prop geometry is shared — untouched)
  root.traverse((m) => { if (m.isMesh && m.geometry && m.geometry.type !== 'BufferGeometry' && !m.geometry.userData.shared && m.parent === root) m.geometry.dispose(); });
  const meshes = [];
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.renderOrder = b.ro;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    F.group.add(mesh); meshes.push(mesh);
    F.disposables.push(geo);
  }
  F.decor = null;
  return meshes.length;
}

const DESK_SEED = { office: 1, lobby: 101 };
export function buildFloor(kind, { low = false } = {}) {
  const spec = FLOOR_BY_ID[kind] || FLOOR_BY_ID.office;
  deskSeed = DESK_SEED[spec.id] != null ? DESK_SEED[spec.id] : 200 + FLOORS.indexOf(spec) * 100;
  const F = newFloor(spec.id);
  F.spec = spec;
  const { w = 26, d = 18, h = 3 } = spec.size || {};
  F.bounds = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 };
  F.ceilY = h;
  const ctx = makeCtx(F, spec, low);
  spec.build(ctx);
  // defaults for anchors the game relies on
  const A = F.anchors;
  const ev0 = F.elevators[0];
  if (!A.spawn) {
    if (ev0) { A.spawn = ev0.front.clone().addScaledVector(ev0.fwd, 2.2); A.spawnYaw = Math.atan2(ev0.fwd.x, ev0.fwd.z); }
    else A.spawn = V(0, 0, 0);
  }
  if (A.spawnYaw == null) A.spawnYaw = 0;
  if (!A.hide || !A.hide.length) {
    const b = F.bounds;
    A.hide = [V(b.minX + 1.5, 0, b.minZ + 1.5), V(b.maxX - 1.5, 0, b.minZ + 1.5), V(b.minX + 1.5, 0, b.maxZ - 1.5), V(b.maxX - 1.5, 0, b.maxZ - 1.5)];
  }
  if (!A.exits) A.exits = [...(A.door ? [A.door.clone()] : []), ...F.elevators.map((e) => e.front.clone().addScaledVector(e.fwd, 0.6))];
  if (!A.titleCam) A.titleCam = { pos: A.spawn.clone().add(V(2.5, 2.2, 2.5)), look: A.spawn.clone().add(V(0, 0.9, 0)) };
  F.decorDraws = mergeDecor(F);
  // freeze inner matrices of dynamic props (the physics sync only updates the outer group)
  for (const sp of F.props) {
    if (LIVE_INNER.has(sp.type) || sp.prop.set) continue;
    sp.prop.group.children.forEach((c) => c.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; }));
  }
  for (const ev of F.elevators) ev.prop.set(0);
  return F;
}

export function disposeFloor(F) {
  if (!F) return;
  if (F.group.parent) F.group.parent.remove(F.group);
  for (const g of F.disposables) g.dispose();
  F.disposables.length = 0;
}

export function setFloorSky(F, time) {
  if (!F || !F.skyMesh) return;
  const t = F.spec && F.spec.skyFor ? F.spec.skyFor(time) : time;
  F.skyMesh.material = skyMat(t === 'noon' || t === 'title' ? 'day' : t);
  F.sky = t;
}

// floor id → { id, label, sub, name } for menus, panels and HUD
export const FLOOR_INFO = Object.fromEntries(FLOORS.map((f) => [f.id, { id: f.id, label: f.label, sub: f.sub || '', name: f.name || f.id, key: f.key || null, placeholder: !!f.placeholder }]));
export const FLOOR_LIST = FLOORS.map((f) => FLOOR_INFO[f.id]);
export { FLOORS, FLOOR_BY_ID };
