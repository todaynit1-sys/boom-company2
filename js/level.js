// 회사 뿌개기 — floor builders (7층 사무실 / 1층 로비·카페).
// A floor = static decor (merged per material), colliders (rects for walking, boxes for physics),
// dynamic prop specs (become physics records in phys.js), NPC specs, elevators and anchors.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeProp, deskTopLayout } from './art/props.js';
import { tex } from './art/tex.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- shared floor materials (module cache, never disposed)
const MATS = new Map();
function mat(key, make) { let m = MATS.get(key); if (!m) { m = make(); MATS.set(key, m); } return m; }
function rep(t, rx, ry) { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; }
const M = {
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
const NO_CAST = new Set(['mouse', 'penCup', 'plantSmall', 'calendar', 'mug', 'paperStack', 'keyboard', 'phone', 'paperSheet', 'paperBall', 'smartphone', 'icedCoffee', 'hotCoffee', 'cupStack']);
// props whose internals animate (keep their matrices live)
const LIVE_INNER = new Set(['printer', 'elevator', 'revolvingDoor', 'coffeeTray']);

// ---------------------------------------------------------------- floor skeleton
function newFloor(kind) {
  const group = new THREE.Group(); group.name = 'floor:' + kind;
  return {
    kind, group, decor: new THREE.Group(),
    rects: [], bodies: [], props: [], elevators: [], npcs: [], anchors: {}, lights: [], animate: [], walkers: [],
    disposables: [], ropes: [], seats: [], desks: [],
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
  const p = makeProp(type, opts);
  p.group.position.set(x, y, z); p.group.rotation.set(rotX, rotY, 0); p.group.scale.setScalar(scale);
  if (!cast) p.group.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  F.decor.add(p.group);
  if (collide) solid(F, x, z, p.size.x / 2 * scale, p.size.z / 2 * scale, p.size.y * scale, rotY, y);
  return p;
}
function liveProp(F, type, x, y, z, rotY = 0, opts = {}, collide = false) {
  const p = makeProp(type, opts);
  p.group.position.set(x, y, z); p.group.rotation.y = rotY;
  F.group.add(p.group);
  if (collide) solid(F, x, z, p.size.x / 2, p.size.z / 2, p.size.y, rotY, y);
  return p;
}
function dynProp(F, type, x, y, z, rotY = 0, opts = {}, tag = null) {
  const p = makeProp(type, opts);
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

function floorPlane(F, m, w, d) {
  const g = new THREE.PlaneGeometry(w, d); const o = new THREE.Mesh(g, m);
  o.rotation.x = -PI / 2; o.receiveShadow = true; o.castShadow = false;
  F.decor.add(o);
}
function ceiling(F, m, w, d, h) {
  const g = new THREE.PlaneGeometry(w, d); const o = new THREE.Mesh(g, m);
  o.rotation.x = PI / 2; o.position.y = h; o.receiveShadow = false; o.castShadow = false;
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
  const ev = { index, label, prop: p, front, fwd, right, cabin, open: 0, want: 0, wasOpen: false, inside: false };
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

// ================================================================ 7층 사무실
function buildOffice(F, low) {
  const W = 26, D = 18, H = 3.0; F.ceilY = H;
  floorPlane(F, M.carpet(), W, D);
  ceiling(F, M.ceilOffice(), W, D, H);
  for (let x = -11.4; x <= 11.5; x += 2.4) for (let z = -7.2; z <= 7.3; z += 2.4) decorProp(F, 'ceilingLight', x, H, z, 0, {}, { rotX: PI, cast: false });

  // ---- walls
  const wall = M.wall();
  // south / east solid
  wallLine(F, 'x', 9, 1, -13.2, 13.2, H, wall);
  wallLine(F, 'z', 13, 1, -9, 9, H, wall);
  // west with elevator holes
  const evZ = [-1.6, 1.6];
  wallLine(F, 'z', -13, -1, -9, 9, H, wall, evZ.map((z) => ({ a0: z - 0.5, a1: z + 0.5, top: 2.1 })));
  // skirting
  box(F, 26, 0.09, 0.03, M.skirting(), 0, 0, 8.985, { cast: false });
  box(F, 0.03, 0.09, 18, M.skirting(), 12.985, 0, 0, { cast: false });
  // north window wall: sill, header, mullions, blinds
  box(F, 26.4, 0.78, 0.22, wall, 0, 0, -9.11, { collide: true });
  box(F, 26.4, 0.05, 0.3, M.sill(), 0, 0.78, -9.05);
  box(F, 26.4, 0.45, 0.22, wall, 0, H - 0.45, -9.11);
  const bays = 16, bw = 26 / bays;
  for (let i = 0; i <= bays; i++) box(F, 0.09, H - 0.45 - 0.83, 0.12, M.alu(), -13 + i * bw, 0.83, -9.02);
  box(F, 26, 0.05, 0.1, M.alu(), 0, H - 0.5, -9.02);
  for (let i = 0; i < bays; i++) {
    const g = new THREE.PlaneGeometry(bw - 0.1, 0.72);
    const o = new THREE.Mesh(g, M.blinds());
    o.position.set(-13 + (i + 0.5) * bw, H - 0.5 - 0.36, -8.96);
    o.castShadow = true; o.receiveShadow = false;
    F.decor.add(o);
  }
  skyBackdrop(F, 'day', { radius: 40, y0: -10, h: 40, center: PI, span: 2.6 });

  // ---- elevators (west wall, facing +X)
  evZ.forEach((z, i) => elevatorAt(F, -13, z, PI / 2, '7F', i));
  decorProp(F, 'floorSign', -12.985, 1.55, 0, PI / 2, { text: '7층', h: 0.42 });
  decorProp(F, 'extinguisher', -12.8, 0, 3.0, PI / 2, {}, { collide: false });
  dynProp(F, 'plantBig', -12.45, 0, 3.7);
  dynProp(F, 'plantBig', -12.45, 0, -3.0);

  // ---- pillars
  const pillars = [[-7, -1.95], [-7, 4.6], [2.4, -1.95], [2.4, 4.6]];
  for (const [x, z] of pillars) decorProp(F, 'pillar', x, 0, z, 0, { h: H }, { collide: true });
  decorProp(F, 'floorSign', -7, 1.75, -1.95 + 0.305, 0, { text: '7층', h: 0.36 }, { cast: false });
  decorProp(F, 'floorSign', 2.4, 1.75, 4.6 + 0.305, 0, { text: '7층', h: 0.36 }, { cast: false });
  F.anchors.pillars = pillars.map(([x, z]) => V(x, 0, z));

  // ---- desk pods
  const clusters = [[-3.2, -1.65, -0.1], [3.9, 5.45, 7.0]];
  const pods = [-4.4, 0.4];
  const seatMap = {};
  for (let ci = 0; ci < clusters.length; ci++) for (let pi = 0; pi < pods.length; pi++) {
    const cz = pods[pi];
    for (let k = 0; k < 3; k++) {
      const x = clusters[ci][k];
      if (low && k === 2 && pi === 0) continue;
      dynProp(F, 'partition', x, 0, cz, 0, { w: 1.5, h: 1.15 }, 'partition');
      const key = `${ci}${pi}${k}`;
      seatMap[key + 'S'] = { x, z: cz + 0.42, rotY: 0 };
      seatMap[key + 'N'] = { x, z: cz - 0.42, rotY: PI };
    }
  }
  // who sits where (S = south side desk, worker faces −Z; N = north side, worker faces +Z)
  const occupants = {
    '011S': 'player',
    '010N': ['workerF2', 'type', 'normal'],
    '001N': ['workerM1', 'type', 'normal'],
    '100S': ['chubby', 'stretch', 'relief'],
    '112N': ['glasses', 'type', 'normal'],
    '110S': ['workerF1', 'sit', 'sleepy'],
  };
  for (const [key, d] of Object.entries(seatMap)) {
    const occ = occupants[key];
    const seat = deskSet(F, d.x, d.z, d.rotY, { occupied: !!occ });
    if (occ === 'player') { F.anchors.playerSeat = seat; seat.player = true; }
    else if (occ) addNpc(F, { preset: occ[0], x: seat.x, z: seat.z, rotY: seat.rotY, anim: occ[1], face: occ[2], seat, role: 'worker' });
  }
  // trash cans at cluster ends
  for (const [x, z] of [[-4.25, -2.6], [0.95, 2.3], [8.3, -2.6], [3.0, -5.9]]) dynProp(F, 'trashcan', x, 0, z);

  // ---- printer corner (south wall, west part)
  const pr = dynProp(F, 'printer', -4.4, 0, 8.36, PI, {}, 'printer');
  pr.prop.set('ok');
  F.anchors.printer = pr;
  const pb = makeProp('paperBox');
  const pbh = pb.size.y;
  dynProp(F, 'paperBox', -3.55, 0, 8.6, PI + 0.05);
  dynProp(F, 'paperBox', -3.55, pbh, 8.6, PI - 0.08);
  dynProp(F, 'paperBox', -3.0, 0, 8.62, PI + 0.2);
  dynProp(F, 'cabinetTall', -5.55, 0, 8.7, PI);
  decorProp(F, 'frame', -4.4, 1.45, 8.985, PI, {}, { cast: false });
  dynProp(F, 'plant', -2.45, 0, 8.55);
  dynProp(F, 'shelf', -1.3, 0, 8.76, PI, { seed: 5 });
  dynProp(F, 'whiteboard', 0.6, 0, 8.45, PI);
  dynProp(F, 'waterCooler', -8.2, 0, 8.68, PI);
  dynProp(F, 'trashcan', -7.6, 0, 8.7);
  // low cabinets with things on top
  for (let i = 0; i < 4; i++) {
    const x = 3.6 + i * 0.5;
    dynProp(F, 'cabinet', x, 0, 8.68, PI);
  }
  dynProp(F, 'box', 3.85, 0.72, 8.66, PI + 0.1);
  dynProp(F, 'plantSmall', 4.7, 0.72, 8.7);
  dynProp(F, 'binders', 5.1, 0.72, 8.72, PI, { n: 4, seed: 2 });
  decorProp(F, 'frame', 6.6, 1.45, 8.985, PI, {}, { cast: false });
  decorProp(F, 'frame', -10.5, 1.45, 8.985, PI, {}, { cast: false });

  // ---- boss corner (south east)
  const bossDesk = deskSet(F, 10.3, 4.4, PI / 2, { occupied: true });
  F.anchors.bossSeat = bossDesk;
  dynProp(F, 'cabinetTall', 12.73, 0, 2.8, -PI / 2);
  dynProp(F, 'shelf', 12.78, 0, 6.2, -PI / 2, { seed: 7 });
  dynProp(F, 'plantBig', 12.4, 0, 7.9);
  decorProp(F, 'frame', 12.985, 1.5, 4.4, -PI / 2, {}, { cast: false });
  F.anchors.bossStand = V(11.05, 0, 4.4); F.anchors.bossStandYaw = -PI / 2;
  F.anchors.bossFront = V(8.75, 0, 4.4); // where the player stands to talk
  addNpc(F, { preset: 'boss', x: 11.05, z: 4.4, rotY: -PI / 2, anim: 'idle', face: 'smug', role: 'boss' });

  // ---- meeting room (north east), glass walls
  decorProp(F, 'glassWall', 8.6, 0, -7.1, PI / 2, { w: 3.8, h: 2.7 }, { collide: true });
  decorProp(F, 'glassWall', 11.3, 0, -5.2, 0, { w: 3.4, h: 2.7 }, { collide: true });
  dynProp(F, 'meetingTable', 10.9, 0, -7.2, PI / 2);
  for (const [x, z, r] of [[10.05, -7.75, PI / 2], [10.05, -6.65, PI / 2], [11.75, -7.75, -PI / 2], [11.75, -6.65, -PI / 2]]) dynProp(F, 'chair', x, 0, z, r);
  dynProp(F, 'tv', 12.7, 0, -7.2, -PI / 2);
  dynProp(F, 'laptop', 10.8, 0.75, -7.5, 0.3);
  dynProp(F, 'paperStack', 11.0, 0.75, -6.8, 1.2);
  F.anchors.meeting = V(11.4, 0, -8.2);

  // ---- lounge / meeting corner (south west)
  dynProp(F, 'roundTable', -9.6, 0, 5.4);
  for (const [dx, dz, c] of [[0.75, 0, '#d6a23b'], [-0.55, 0.55, '#4f86c6'], [-0.2, -0.75, '#d6a23b']]) {
    dynProp(F, 'cafeChair', -9.6 + dx, 0, 5.4 + dz, Math.atan2(-dx, -dz), { color: c });
  }
  dynProp(F, 'mug', -9.5, 0.74, 5.35, 0.4);
  dynProp(F, 'sofa', -12.35, 0, 6.3, PI / 2);
  // window side plants
  for (const x of [-10.5, -4.6, 0.9, 6.6]) dynProp(F, 'plant', x, 0, -8.45);
  dynProp(F, 'plantBig', -12.35, 0, -8.35);
  dynProp(F, 'plantBig', 12.35, 0, -4.6);
  dynProp(F, 'cabinet', -12.65, 0, -6.3, PI / 2);
  dynProp(F, 'cabinet', -12.65, 0, -5.8, PI / 2);
  dynProp(F, 'paperStack', -12.65, 0.72, -6.05, 0.3);

  // ---- standing coworkers
  addNpc(F, { preset: 'workerM2', x: -7.75, z: 7.55, rotY: 2.6, anim: 'talk', face: 'smile', role: 'worker' });
  addNpc(F, { preset: 'workerF2', x: -8.85, z: 7.35, rotY: 0.75, anim: 'armsCrossed', face: 'normal', role: 'worker', variantSeed: 9 });
  addNpc(F, { preset: 'workerM1', x: -2.2, z: -7.6, rotY: PI - 0.3, anim: 'phone', face: 'normal', role: 'worker', variantSeed: 12 });

  // ---- anchors
  F.anchors.spawn = V(-1.65, 0, 2.4);
  F.anchors.rushSpawn = V(-2.3, 0, -1.95); // camera behind lands at x≈1.5, clear of the pillar at x=2.4
  F.anchors.sunsetIntercept = V(-5.2, 0, -1.95);
  F.anchors.hide = [V(-7, 0, -2.55), V(2.4, 0, 5.2), V(-7, 0, 5.2), V(11.6, 0, -8.3)];
  F.anchors.exits = F.elevators.map((e) => e.front.clone().addScaledVector(e.fwd, 0.6));
  F.anchors.titleCam = { pos: V(1.2, 2.2, 4.6), look: V(-1.65, 0.9, 1.4) };
}

// ================================================================ 1층 로비 · 카페
function buildLobby(F, low) {
  const W = 26, D = 18, H = 4.6; F.ceilY = H;
  floorPlane(F, M.terrazzo(), W, D);
  ceiling(F, M.ceilLobby(), W, D, H);
  for (let x = -10.5; x <= 12; x += 3) for (let z = -6.5; z <= 8; z += 3) decorProp(F, 'ceilingLight', x, H, z, 0, {}, { rotX: PI, cast: false });

  // walls
  wallLine(F, 'x', 9, 1, -13.2, 13.2, H, M.marble(11, 2));
  wallLine(F, 'z', -13, -1, -9, 9, H, M.marble(7.5, 2));
  const evZ = [-2.0, 1.4];
  wallLine(F, 'z', 13, 1, -9, 9, H, M.marble(7.5, 2), evZ.map((z) => ({ a0: z - 0.5, a1: z + 0.5, top: 2.1 })));
  // café back wall (north, x -13..-4) – wood slats
  wallLine(F, 'x', -9, -1, -13.2, -4, H, M.cafeWall());
  // café side return wall
  box(F, 0.3, H, 1.6, M.marble(1, 2), -4.15, 0, -8.2, { collide: true });
  // header above the café with the sign
  box(F, 9.0, 0.7, 0.3, M.header(), -8.6, H - 0.7, -6.75);
  // glass front (north, x -4..13) with a revolving door at x=3
  const gl = M.glass();
  const fr = M.alu();
  const glassSeg = (x0, x1) => {
    const n = Math.max(1, Math.round((x1 - x0) / 2.9));
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) decorProp(F, 'glassWall', x0 + (i + 0.5) * w, 0, -9, 0, { w, h: H }, { collide: true });
  };
  glassSeg(-4, 1.85); glassSeg(4.15, 13);
  box(F, 2.3, H - 2.46, 0.04, gl, 3.0, 2.46, -9, { cast: false });
  box(F, 2.3, 0.06, 0.1, fr, 3.0, 2.44, -9);
  const rd = liveProp(F, 'revolvingDoor', 3.0, 0, -9);
  addRect(F, 3.0, -9, 1.15, 1.15, 0, 2.4);
  F.animate.push((dt, t) => rd.set(t * 0.35));
  F.anchors.door = V(3.0, 0, -7.5);
  // outside: sidewalk, road, lawn, trees
  const out = (w, d, m, x, z, y = -0.02) => { const g = new THREE.PlaneGeometry(w, d); const o = new THREE.Mesh(g, m); o.rotation.x = -PI / 2; o.position.set(x, y, z); o.receiveShadow = true; F.decor.add(o); };
  out(60, 7, M.street(), 4, -12.6);
  out(60, 10, M.road(), 4, -21);
  out(60, 14, M.lawn(), 4, -33, -0.03);
  for (let x = -6; x <= 16; x += 4.4) decorProp(F, 'plantBig', x, 0, -14.6, x, {}, { scale: 2.1 });
  skyBackdrop(F, 'day', { radius: 44, y0: -1.5, h: 40, center: PI, span: 2.6 });
  // passers-by outside (animated in main via F.walkers)
  F.walkers.push({ preset: 'workerM1', x: -4, z: -11.4, speed: 1.25, x0: -6, x1: 14, dir: 1, variantSeed: 31 });
  F.walkers.push({ preset: 'workerF1', x: 9, z: -12.3, speed: 1.1, x0: -6, x1: 14, dir: -1, variantSeed: 32 });
  F.walkers.push({ preset: 'glasses', x: 2, z: -13.0, speed: 1.35, x0: -6, x1: 14, dir: 1, variantSeed: 33 });

  // ---- café
  const counter = dynProp(F, 'cafeCounter', -8.6, 0, -6.4, 0, { w: 4.5 });
  // cafeCounter has mass 0 → became decor + solid automatically
  const cy = 1.05;
  decorProp(F, 'cafeSign', -8.6, H - 1.35, -6.58, 0, {}, { cast: false });
  decorProp(F, 'menuBoard', -11.8, 1.25, -8.97, 0, {}, { cast: false });
  decorProp(F, 'menuBoard', -5.2, 1.25, -8.97, 0, {}, { cast: false });
  // back counter with stock
  box(F, 6.0, 0.9, 0.55, M.darkWood(), -8.6, 0, -8.7, { collide: true });
  box(F, 6.0, 0.04, 0.6, M.sill(), -8.6, 0.9, -8.7);
  box(F, 5.0, 0.04, 0.3, M.darkWood(), -8.6, 1.75, -8.85);
  for (let i = 0; i < 6; i++) decorProp(F, 'box', -10.6 + i * 0.75, 1.79, -8.82, 0, {}, { scale: 0.7, cast: false });
  for (let i = 0; i < 3; i++) dynProp(F, 'cupStack', -7.2 + i * 0.35, 0.94, -8.65);
  dynProp(F, 'espresso', -9.65, cy, -6.55, PI);
  dynProp(F, 'grinder', -10.35, cy, -6.5, PI);
  dynProp(F, 'cupStack', -10.75, cy, -6.25);
  dynProp(F, 'pos', -6.75, cy, -6.4, 0.25);
  const trays = [dynProp(F, 'coffeeTray', -7.95, cy, -6.15, 0, { count: 6 }, 'tray'), dynProp(F, 'coffeeTray', -7.52, cy, -6.15, 0.05, { count: 6 }, 'tray')];
  F.anchors.trays = trays;
  for (let i = 0; i < 6; i++) dynProp(F, 'icedCoffee', -9.25 + i * 0.12, cy, -6.13 + (i % 2) * 0.05, i);
  for (const x of [-10.2, -8.6, -7.0]) decorProp(F, 'pendantLamp', x, 2.05, -6.35, 0, {}, { cast: false });
  for (const x of [-9.4, -7.6]) {
    const l = new THREE.PointLight('#ffc98c', 6, 6.5, 1.6);
    l.position.set(x, 1.95, -6.2);
    F.group.add(l); F.lights.push(l);
  }
  F.anchors.counterFront = V(-7.7, 0, -5.55);
  addNpc(F, { preset: 'barista', x: -8.1, z: -7.2, rotY: 0, anim: 'idle', face: 'smile', role: 'barista' });

  // ---- queue with stanchions
  const qx = -6.75;
  F.anchors.queue = [-5.45, -4.65, -3.85, -3.05, -2.25].map((z) => V(qx, 0, z));
  const posts = [-5.75, -4.45, -3.15, -1.85].map((z) => dynProp(F, 'stanchion', -6.0, 0, z, 0, {}, 'post'));
  for (let i = 0; i < posts.length - 1; i++) F.ropes.push({ a: posts[i], b: posts[i + 1], mesh: null });
  const qPeople = [['workerM1', 'phone', 'normal'], ['workerF1', 'armsCrossed', 'normal'], ['chubby', 'lookUp', 'sleepy']];
  qPeople.forEach(([p, a, f], i) => {
    const q = F.anchors.queue[i];
    addNpc(F, { preset: p, x: q.x + (i === 1 ? 0.05 : 0), z: q.z, rotY: PI, anim: a, face: f, role: 'queue', queueIndex: i, variantSeed: 40 + i });
  });
  F.anchors.cutterStart = V(-3.2, 0, -0.6);
  addNpc(F, { preset: 'workerM2', x: -3.2, z: -0.6, rotY: -0.6, anim: 'phone', face: 'smug', role: 'cutter', variantSeed: 51 });

  // ---- café tables
  for (const [x, z] of [[-11.2, -2.0], [-11.2, 1.6], [-8.4, 3.6]]) {
    dynProp(F, 'roundTable', x, 0, z);
    dynProp(F, 'cafeChair', x + 0.72, 0, z, -PI / 2, { color: '#d6a23b' });
    dynProp(F, 'cafeChair', x - 0.72, 0, z + 0.1, PI / 2, { color: '#4f86c6' });
    dynProp(F, (x + z) % 2 ? 'icedCoffee' : 'hotCoffee', x + 0.12, 0.74, z - 0.05);
  }
  addNpc(F, { preset: 'glasses', x: -11.92, z: 1.7, rotY: PI / 2, anim: 'sit', face: 'sleepy', role: 'sitter', chairY: true, variantSeed: 60 });

  // ---- elevators (east wall, facing −X)
  evZ.forEach((z, i) => elevatorAt(F, 13, z, -PI / 2, '1F', i));
  decorProp(F, 'floorSign', 12.985, 1.75, -0.3, -PI / 2, { text: '1', underline: false, h: 0.62 });
  decorProp(F, 'extinguisher', 12.82, 0, 3.0, -PI / 2);
  dynProp(F, 'plantBig', 12.35, 0, -3.6);
  dynProp(F, 'plantBig', 12.35, 0, 3.6);
  // ---- lounge
  dynProp(F, 'sofaYellow', 9.6, 0, 8.45, PI);
  dynProp(F, 'sofa', 12.45, 0, 6.0, -PI / 2);
  dynProp(F, 'roundTable', 10.1, 0, 6.4);
  dynProp(F, 'hotCoffee', 10.15, 0.74, 6.35);
  addNpc(F, { preset: 'workerF2', x: 9.3, z: 8.45, rotY: PI, anim: 'sit', face: 'sleepy', role: 'sitter', sofa: true, variantSeed: 61 });
  addNpc(F, { preset: 'workerM2', x: 7.2, z: 5.0, rotY: 0.9, anim: 'talk', face: 'smile', role: 'worker', variantSeed: 62 });
  addNpc(F, { preset: 'workerF1', x: 8.0, z: 5.7, rotY: -2.2, anim: 'armsCrossed', face: 'normal', role: 'worker', variantSeed: 63 });
  // misc
  decorProp(F, 'vending', -2.3, 0, 8.55, PI, {}, { collide: true });
  decorProp(F, 'vending', -1.35, 0, 8.55, PI, {}, { collide: true });
  dynProp(F, 'trashcan', -0.6, 0, 8.7);
  dynProp(F, 'plantBig', -12.35, 0, 8.3);
  dynProp(F, 'plantBig', -3.55, 0, -8.35);
  dynProp(F, 'plantBig', 4.9, 0, 8.3);
  dynProp(F, 'cone', 1.2, 0, -7.4);
  dynProp(F, 'cone', 4.9, 0, -7.2);
  dynProp(F, 'trashcan', 6.2, 0, -8.5);
  // marble pillars
  for (const [x, z] of [[-1.5, -2.6], [-1.5, 4.2], [6.5, 1.6]]) decorProp(F, 'pillar', x, 0, z, 0, { h: H, color: '#d8cdbf' }, { collide: true });

  F.anchors.spawn = V(8.5, 0, 0);
  F.anchors.hide = [V(-1.5, 0, -3.25), V(-1.5, 0, 4.85), V(6.5, 0, 2.25), V(11.5, 0, 8.0)];
  F.anchors.exits = [F.anchors.door.clone(), ...F.elevators.map((e) => e.front.clone().addScaledVector(e.fwd, 0.6))];
  F.anchors.titleCam = { pos: V(-3.5, 2.4, 1.5), look: V(-7.5, 1.0, -5.5) };
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

export function buildFloor(kind, { low = false } = {}) {
  deskSeed = kind === 'office' ? 1 : 101;
  const F = newFloor(kind);
  if (kind === 'office') buildOffice(F, low); else buildLobby(F, low);
  F.decorDraws = mergeDecor(F);
  // freeze inner matrices of dynamic props (the physics sync only updates the outer group)
  for (const sp of F.props) {
    if (LIVE_INNER.has(sp.type)) continue;
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
  const t = F.kind === 'lobby' ? (time === 'sunset' ? 'sunset' : 'day') : time;
  F.skyMesh.material = skyMat(t === 'noon' || t === 'title' ? 'day' : t);
  F.sky = t;
}

export const FLOOR_INFO = {
  office: { id: 'office', label: '7', sub: '7층 사무실', name: '7층 · 사무실' },
  lobby: { id: 'lobby', label: '1', sub: '1층 로비·카페', name: '1층 · 로비' },
};
