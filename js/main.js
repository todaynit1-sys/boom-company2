// 회사 뿌개기 — game core: loop, player, camera, story, rampage, bill, debug hook.
import * as THREE from 'three';
import { ui } from './ui.js';
import { audio } from './audio.js';
import { makeCharacter } from './art/chars.js';
import { makeProp } from './art/props.js';
import { createGfx } from './gfx.js';
import { createFx } from './fx.js';
import { buildFloor, disposeFloor, setFloorSky, FLOOR_INFO, FLOOR_LIST, FLOOR_BY_ID, FLOORS, makeAny } from './level.js';
import { createPhys, recUpright, syncRec } from './phys.js';
import { collideCircle, NavGrid, pointInRect } from './nav.js';
import { NPC } from './npc.js';
import { instanceFloor } from './inst.js';
import { createToys, WEAPON, RIDE } from './toys.js';
import { createFight } from './fight.js';
import * as DIFF from './diff.js'; // 난이도 (쉬움 · 보통 · 어려움): koRule, moneyMul, angryMul … (값은 diff.js)

const PI = Math.PI;
// #debug (may share the hash with a name link: #debug&nb=…)
const DEBUG = /(^#|&)debug(&|$)/.test(location.hash);
const TOUCH = ui.isTouch;
const FIXED = 1 / 60;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
function wrapA(a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }
function angLerp(a, b, k) { return a + wrapA(b - a) * Math.min(1, k); }

// ================================================================ state
const G = {
  mode: 'title', scene: 'title', phase: '', phaseT: 0, opts: { floor: 'office', gender: 'm' },
  time: 0, rtime: 0, timeScale: 1, slowT: 0, slowScale: 1, hitStop: 0,
  stress: 0, money: 0, items: new Map(), combo: 0, comboT: 0, special: 0,
  timeLeft: null, rampage: false, canDamage: false, busy: false, paused: false, fast: false, manual: false,
  counts: {}, taskPool: [], taskShown: [], obj: null, cand: null, focus: null, holdT: 0, needRelease: false,
  evPanel: null, timers: [], transN: 0, gen: 0, errors: [], shake: 0, frames: 0, fps: 0, impacts: [],
  floors: {}, S: null, floorKind: null, preset: 'day', queue: [], bestShown: 0,
  fcounts: {}, chal: {}, run: null, evSel: null, thrust: 0,
};
let toys = null; // js/toys.js — created once the game helpers below exist
let fight = null; // js/fight.js — 반격 · 막기 · 기력 (created with toys)
const save = loadSave();
// 저장 'ppg.save': { best: { rush, boss, free, story }, days, lv: { '1': { stars, best, clear }, … } }
// 예전 저장(best · days 뿐)이나 망가진 값도 받아 준다: 모르는 칸은 기본값, 숫자는 숫자로
function loadSave() {
  const out = { best: {}, days: 0, lv: {} };
  try {
    const s = JSON.parse(localStorage.getItem('ppg.save') || 'null');
    if (s && typeof s === 'object') {
      if (s.best && typeof s.best === 'object') for (const k of Object.keys(s.best)) { const v = Number(s.best[k]); if (v > 0 && isFinite(v)) out.best[k] = Math.round(v); }
      out.days = Math.max(0, s.days | 0);
      if (s.lv && typeof s.lv === 'object') {
        for (const k of Object.keys(s.lv)) {
          const e = s.lv[k], n = k | 0;
          if (!e || typeof e !== 'object' || n < 1 || n > 99) continue;
          out.lv[n] = { stars: clamp(e.stars | 0, 0, 3), best: Math.max(0, Math.round(Number(e.best) || 0)), clear: !!e.clear || (e.stars | 0) > 0 };
        }
      }
    }
  } catch (e) { /* ignore */ }
  return out;
}
// 난이도 값 (diff.js 가 없거나 깨져도 '보통'처럼)
function DD() { try { return (DIFF.D && DIFF.D()) || {}; } catch (e) { return {}; } }
const koRule = () => (DD().koRule === 'retry' ? 'retry' : 'getup');
const moneyMul = () => { const m = Number(DD().moneyMul); return m > 0 && isFinite(m) ? m : 1; };
function diffName() { const d = DD(); return d.n || ({ easy: '쉬움', normal: '보통', hard: '어려움' })[d.id] || '보통'; }
function writeSave() { try { localStorage.setItem('ppg.save', JSON.stringify(save)); } catch (e) { /* ignore */ } }
function report(e) {
  if (G.errors.length < 60) G.errors.push(String((e && (e.stack || e.message)) || e).slice(0, 600));
  console.error(e);
}
addEventListener('error', (e) => report(e.error || e.message));
addEventListener('unhandledrejection', (e) => report(e.reason));

// ================================================================ renderer
const canvas = document.getElementById('cv');
// 화질: 첫 화면의 [자동 · 빠르게 · 예쁘게] (ui.settings.gfx). 주소의 ?gfx=auto|fast|pretty 가 있으면 그것 (시험용, 저장 안 함).
// #debug 이고 ?gfx= 가 없으면 예전처럼 가장 예쁜 단계에 고정 (시험이 기기마다 달라지지 않게)
const GFX_Q = (location.search.match(/[?&]gfx=(auto|fast|pretty)\b/) || [])[1] || null;
const gfx = createGfx(canvas, { touch: TOUCH, debug: DEBUG, mode: GFX_Q || ui.settings.gfx || 'auto', fixed: DEBUG && !GFX_Q });
const { scene, camera } = gfx;
const fx = createFx(scene);
fx.camera = camera; // KO soul puffs turn to face it

// ================================================================ timers (unscaled game clock, step-safe)
function after(sec, fn) { const t = { at: G.rtime + sec, fn, gen: G.gen }; G.timers.push(t); return t; }
function runTimers() {
  if (!G.timers.length) return;
  const due = [];
  G.timers = G.timers.filter((t) => { if (t.at <= G.rtime) { due.push(t); return false; } return true; });
  for (const t of due) { if (t.gen !== G.gen) continue; try { t.fn(); } catch (e) { report(e); } }
}

// ================================================================ audio helpers
// every sound goes through here; with #debug the last 160 names are kept for tests (__ppg.sfxLog())
const SFX_LOG = [], SFX_COUNT = {};
function sfx(name, o) {
  audio.sfx(name, o);
  if (DEBUG) { SFX_COUNT[name] = (SFX_COUNT[name] || 0) + 1; SFX_LOG.push({ n: name, t: +G.rtime.toFixed(3), f: G.frames, at: o && o.at != null ? o.at : undefined, p: o && o.pitch != null ? +o.pitch.toFixed(3) : undefined }); if (SFX_LOG.length > 160) SFX_LOG.shift(); }
}
function vibrate(ms) { try { if (TOUCH && ui.settings.vibe && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) { /* ignore */ } }
let audioReady = false;
function initAudio() {
  if (audioReady) return; audioReady = true;
  audio.init();
  audio.setEnabled({ sfx: !!ui.settings.sfx, bgm: !!ui.settings.bgm });
}
addEventListener('pointerdown', initAudio, { capture: true });
addEventListener('keydown', initAudio, { capture: true });
audio.setEnabled({ sfx: !!ui.settings.sfx, bgm: !!ui.settings.bgm });

// ================================================================ input
const keys = new Set();
const IN = { guard: false, guardTouch: false, attack: false, kick: false, interact: false, interactQ: 0, jumpQ: 0, specialQ: 0, attackQ: 0, kickQ: 0, lookDX: 0, lookDY: 0, drag: false, lastX: 0, lastY: 0, locked: false, wantLock: false, releasing: false, lockLostAt: -1e9 };
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyJ', 'KeyK', 'KeyQ', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyL', 'ShiftLeft', 'ShiftRight']);
const GUARD_KEYS = ['KeyC', 'KeyL', 'ShiftLeft', 'ShiftRight'];
const guardKeyDown = () => GUARD_KEYS.some((k) => keys.has(k));
function playing() { return (G.mode !== 'title') && G.scene !== 'bill' && !G.paused; }
addEventListener('keydown', (e) => {
  if (e.target && e.target.closest && e.target.closest('input,textarea')) return;
  const c = e.code;
  if (c === 'Escape' || c === 'KeyP') {
    // the Esc that just broke pointer lock already paused the game (if a browser also delivers it, ignore it)
    if (c === 'Escape' && performance.now() - IN.lockLostAt < 400) return;
    if (G.mode !== 'title' && G.scene !== 'bill') { if (!e.repeat) togglePause(!G.paused); e.preventDefault(); }
    return;
  }
  if (!playing()) return;
  // elevator panel: each floor has a key (7 / 1 / 3 / 2 = 12층 / R / B = B1 / N = B2), arrows + Enter also work
  if (G.evPanel) {
    if (e.repeat && !c.startsWith('Arrow')) return;
    const id = evKeyFloor(c);
    if (id) { onElevator(id); e.preventDefault(); return; }
    if (c === 'ArrowUp' || c === 'ArrowDown') { if (!e.repeat) moveEvSel(c === 'ArrowUp' ? -1 : 1); e.preventDefault(); return; }
    if ((c === 'Enter' || c === 'NumpadEnter') && G.evSel) { onElevator(G.evSel); e.preventDefault(); return; }
  }
  if (GAME_KEYS.has(c)) {
    if (c === 'Space' || c.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    keys.add(c);
    if (c === 'Space') IN.jumpQ++;
    if (c === 'KeyQ') IN.specialQ++;
    if (c === 'KeyJ' || c === 'KeyF' || c === 'KeyZ') { IN.attack = true; IN.attackQ++; }
    if (c === 'KeyK' || c === 'KeyX') { IN.kick = true; IN.kickQ++; }
    if (c === 'KeyE') { IN.interact = true; IN.interactQ++; G.needRelease = false; }
    if (GUARD_KEYS.includes(c)) IN.guard = true;
  }
});
addEventListener('keyup', (e) => {
  const c = e.code; keys.delete(c);
  if (GUARD_KEYS.includes(c)) IN.guard = guardKeyDown();
  if (c === 'KeyJ' || c === 'KeyF' || c === 'KeyZ') IN.attack = keys.has('KeyJ') || keys.has('KeyF') || keys.has('KeyZ');
  if (c === 'KeyK' || c === 'KeyX') IN.kick = keys.has('KeyK') || keys.has('KeyX');
  if (c === 'KeyE') { IN.interact = false; G.needRelease = false; }
});
function clearInput() { keys.clear(); IN.attack = IN.kick = IN.interact = IN.guard = IN.guardTouch = false; IN.drag = false; IN.attackQ = IN.kickQ = IN.jumpQ = IN.specialQ = IN.interactQ = 0; G.needRelease = false; }
addEventListener('blur', clearInput);
// tab hidden: drop held keys (their keyup never arrives) and pause a running game
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (playing() && !G.manual) togglePause(true); } });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || TOUCH) return;
  if (!playing()) return;
  IN.drag = true; IN.lastX = e.clientX; IN.lastY = e.clientY; IN.dragMoved = 0;
  if (e.button === 0) { IN.attack = true; IN.attackQ++; }
  if (e.button === 2) { IN.kick = true; IN.kickQ++; }
  if (!IN.locked && canvas.requestPointerLock && !DEBUG) {
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* optional */ }
  }
});
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || TOUCH) return;
  if (IN.locked) { IN.lookDX += e.movementX || 0; IN.lookDY += e.movementY || 0; return; }
  if (!IN.drag) return;
  IN.lookDX += e.clientX - IN.lastX; IN.lookDY += e.clientY - IN.lastY;
  IN.lastX = e.clientX; IN.lastY = e.clientY;
});
addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch' || TOUCH) return;
  IN.drag = false;
  if (e.button === 0) IN.attack = false;
  if (e.button === 2) IN.kick = false;
});
document.addEventListener('pointerlockchange', () => {
  const was = IN.locked;
  IN.locked = document.pointerLockElement === canvas;
  if (was && !IN.locked && !IN.releasing && playing()) { togglePause(true); IN.lockLostAt = performance.now(); }
  IN.releasing = false;
});
function releaseLock() { if (document.pointerLockElement) { IN.releasing = true; try { document.exitPointerLock(); } catch (e) { /* ignore */ } } }
function onAction(name, down) {
  if (name === 'guard' && !down) { IN.guardTouch = false; return; } // (a release always counts, paused or not)
  if (name === 'kick' && !down) { IN.kick = false; return; }
  if (!playing()) return;
  if (name === 'attack') { IN.attack = down; if (down) IN.attackQ++; }
  else if (name === 'interact') { IN.interact = down; if (down) IN.interactQ++; G.needRelease = false; }
  else if (name === 'kick') { IN.kick = down; if (down) IN.kickQ++; }
  else if (name === 'jump') { if (down) IN.jumpQ++; }
  else if (name === 'special') { if (down) IN.specialQ++; }
  else if (name === 'guard') IN.guardTouch = !!down;
}
function moveInput() {
  let x = 0, y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (TOUCH) { x += ui.joy.x; y += ui.joy.y; }
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  return [x, y];
}

// ================================================================ player
const P = {
  char: null, pos: V(), y: 0, vy: 0, yaw: 0, vel: V(), onGround: true, speed: 0, seated: null, carry: null, carryKind: null, held: null,
  controls: true, rage: false, attackT: 0, swing: 0, faceT: 0, face: 'normal', stepD: 0, push: null, prev: V(), r: 0.3,
};
function makePlayerChar(gender) {
  const c = makeCharacter({ preset: gender === 'f' ? 'playerF' : 'player', seed: 1 });
  return c;
}
function setPlayerChar(gender) {
  const old = P.char;
  const c = makePlayerChar(gender);
  if (old) {
    c.setAnim(old.anim); c.setFace(old.face);
    if (old.group.parent) old.group.parent.add(c.group);
    // move carried things
    for (const a of ['chest', 'handR']) while (old[a].children.length) { const o = old[a].children[old[a].children.length - 1]; if (o.isMesh) break; old[a].remove(o); c[a].add(o); }
    old.dispose();
  }
  P.char = c;
  placePlayer();
}
function placePlayer() {
  const g = P.char.group;
  g.position.set(P.pos.x, P.y, P.pos.z);
  g.rotation.y = P.yaw;
}
function setFace(name, sec = 0) { P.char.setFace(name); if (sec > 0) P.faceT = sec; else P.faceT = 0; }
function baseFace() { return P.rage ? 'rage' : G.stress >= 60 ? 'endure' : 'normal'; }

function seatPlayer(seat) {
  P.seated = seat; P.pos.set(seat.x, 0, seat.z); P.yaw = seat.rotY; P.y = 0; P.vel.set(0, 0, 0);
  P.char.setAnim('type');
  const ch = seat.chair && seat.chair.rec;
  if (ch && !ch.removed) {
    ch.solid = true;
    const fx = Math.sin(seat.rotY), fz = Math.cos(seat.rotY);
    ch.body.position.set(seat.x + fx * 0.08, ch.hy, seat.z + fz * 0.08);
    ch.body.quaternion.setFromEuler(0, seat.rotY, 0);
    ch.body.velocity.set(0, 0, 0); ch.body.angularVelocity.set(0, 0, 0); ch.body.sleep();
    syncRec(ch);
  }
  placePlayer();
}
function unseat() {
  if (!P.seated) return;
  const s = P.seated; P.seated = null;
  P.pos.x -= Math.sin(P.yaw) * 0.62; P.pos.z -= Math.cos(P.yaw) * 0.62;
  if (s.chair && s.chair.rec) s.chair.rec.solid = false;
  P.char.setAnim('idle');
  placePlayer();
}
function dropCarry() {
  if (P.carryNpc) { releaseNpc(false); return null; } // a KO'd coworker is put down, never dropped out of the world
  if (!P.carry) return null;
  const o = P.carry; if (o.parent) o.parent.remove(o);
  P.carry = null; P.carryKind = null;
  return o;
}
function resetPlayer() {
  if (toys && toys.riding()) toys.dismount();
  if (toys) toys.reset();
  dropCarry();
  if (P.held) { const r = P.held; P.held = null; if (r.group.parent) r.group.parent.remove(r.group); r.removed = true; }
  P.seated = null; P.vel.set(0, 0, 0); P.vy = 0; P.y = 0; P.onGround = true; P.controls = true; P.rage = false; P.attackT = 0; P.push = null;
  if (fight) fight.reset();
  P.char.setAnim('idle'); setFace('normal');
  P.char.group.rotation.x = 0;
}

// ================================================================ floors
const SMALL_CAST = new Set(['keyboard', 'binders', 'phone', 'calendar', 'penCup', 'plantSmall', 'mug', 'paperStack', 'mouse', 'laptop', 'icedCoffee', 'hotCoffee', 'cupStack']);
// props with set() states that may still be drawn through the instanced batch while untouched
const BATCH_SET = new Set(['car', 'gate', 'barrierGate', 'coffeeTray']);
function getFloor(kind) {
  if (!FLOOR_BY_ID[kind]) kind = 'office';
  if (G.floors[kind]) return G.floors[kind];
  const t0 = performance.now();
  const F = buildFloor(kind, { low: TOUCH });
  const phys = createPhys(F);
  F.instanced = instanceFloor(F, phys, { batchSet: BATCH_SET }).meshes;
  // phones: the batched desk clutter does not cast shadows (barely visible, saves shadow-pass draws)
  if (TOUCH) for (const o of F.group.children) if (o.isInstancedMesh && SMALL_CAST.has(o.name.slice(5))) o.castShadow = false;
  const S = { kind, F, phys, npcs: [], walkers: [], nav: null, obst: [], lists: null, navT: 0, touched: false, used: G.mode !== 'title', buildMs: 0, ropes: [] };
  S.lists = [F.rects, S.obst];
  for (const sp of F.npcs) { const n = new NPC(sp); S.npcs.push(n); F.group.add(n.group); }
  fight.designate(S); // 보스 · 중간보스 (+ one hot-headed coworker) fight back in a rampage
  applyRunFight(S); // 레벨마다 누가 덤비는지 (낮은 레벨: 보스 · 중간보스 쉼)
  for (const w of F.walkers) {
    const n = new NPC({ preset: w.preset, x: w.x, z: w.z, rotY: PI / 2, anim: 'walk', role: 'walker', variantSeed: w.variantSeed, id: kind + ':w' + S.walkers.length, speed: w.speed, x0: w.x0, x1: w.x1 });
    n.state = 'stroll'; n.dir = w.dir; n.char.setAnim('walk');
    S.walkers.push(n); F.group.add(n.group);
  }
  // café queue ropes (hidden once a post moves)
  const rm = new THREE.MeshStandardMaterial({ color: '#28336a', roughness: 0.6 });
  for (const rp of F.ropes) {
    const a = rp.a.rec, b = rp.b.rec;
    const pa = V(a.body.position.x, 0.9, a.body.position.z), pb = V(b.body.position.x, 0.9, b.body.position.z);
    const len = pa.distanceTo(pb);
    const geo = new THREE.CylinderGeometry(0.014, 0.014, len, 6); geo.rotateZ(PI / 2);
    const m = new THREE.Mesh(geo, rm); m.position.copy(pa).add(pb).multiplyScalar(0.5); m.position.y -= 0.04;
    m.rotation.y = -Math.atan2(pb.z - pa.z, pb.x - pa.x);
    m.castShadow = true; F.group.add(m); F.disposables.push(geo);
    S.ropes.push({ m, a, b, ax: pa.x, az: pa.z, bx: pb.x, bz: pb.z });
  }
  // walkable zones for the nav grid: elevator cabins
  S.zones = F.elevators.map((ev) => { const r = Math.atan2(ev.fwd.x, ev.fwd.z); return { x: ev.cabin.x, z: ev.cabin.z, hx: 0.45, hz: 0.85, rot: r, c: Math.cos(r), s: Math.sin(r) }; });
  S.nav = new NavGrid(F.bounds);
  S.staticRects = F.rects.filter((r) => !r.active);
  rebuildNav(S);
  S.buildMs = Math.round(performance.now() - t0);
  G.floors[kind] = S;
  return S;
}
function rebuildNav(S) {
  S.phys.obstacles(S.obst);
  S.nav.build([S.staticRects, S.obst], S.zones);
}
function disposeFloors() {
  for (const k of Object.keys(G.floors)) {
    const S = G.floors[k];
    for (const n of [...S.npcs, ...S.walkers]) { ui.bubble(n.id, null); n.dispose(); }
    disposeFloor(S.F);
  }
  G.floors = {}; G.S = null; G.floorKind = null;
}
function enterFloor(kind, { at = null, yaw = null, elevator = null, door = null } = {}) {
  const S = getFloor(kind);
  kind = S.kind;
  if (G.S && G.S !== S) {
    toys.onFloorLeave();
    scene.remove(G.S.F.group);
    for (const n of [...G.S.npcs, ...G.S.walkers]) ui.bubble(n.id, null);
  }
  gfx.clearHighlight();
  gfx.adaptReset(); // (새 층: 셰이더 컴파일 · 짓기로 끊기는 첫 프레임들은 화질 판단에서 뺀다)
  G.S = S; G.floorKind = kind;
  if (!S.F.group.parent) scene.add(S.F.group);
  if (P.char.group.parent !== S.F.group) S.F.group.add(P.char.group);
  S.phys.onImpact = onImpact;
  gfx.fit(S.F.bounds, S.F.ceilY);
  applyTime(G.preset);
  let arriving = null;
  if (elevator != null) {
    const ev = S.F.elevators[elevator] || S.F.elevators[0];
    // arrive inside the car just behind the opening doors, facing the room; the player then steps out on their
    // own (see updatePlayer → G.arrive) while the camera, still in the cabin behind them, dollies out
    P.pos.copy(ev.front).addScaledVector(ev.fwd, -0.42);
    P.yaw = Math.atan2(ev.fwd.x, ev.fwd.z);
    ev.open = 0.8; ev.hold = 2.2; ev.dismissed = true;
    arriving = ev;
    after(0.1, () => sfx('ding', { vol: 0.6 }));
  } else if (at) { P.pos.set(at.x, 0, at.z); if (yaw != null) P.yaw = yaw; }
  // came through a door (spec.portals): step out of it on your own, the camera first looks back at the door
  const dp = door ? (S.F.spec.portals || []).find((q) => q.to === door) : null;
  if (dp) { P.pos.set(dp.out[0], 0, dp.out[1]); P.yaw = dp.out[2]; }
  P.y = 0; P.vy = 0; P.onGround = true; P.vel.set(0, 0, 0);
  G.arrive = arriving ? { ev: arriving, t: 0, to: arriving.front.clone().addScaledVector(arriving.fwd, 1.5) }
    : dp ? { door: true, t: 0, to: V(dp.walk[0], 0, dp.walk[1]) } : null;
  G.doorCam = null;
  placePlayer();
  snapCamera();
  if (arriving) { CAM.pitch = ARRIVE_PITCH; updateCamera(0, true); }
  if (dp) doorArrived(S, dp);
  toys.prep(S);
  floorHook(S, 'onEnter');
  return S;
}
// floor modules' escape hatch (see js/floors/README.md → hooks)
function floorHook(S, name, ...args) {
  const h = S && S.F.spec && S.F.spec.hooks && S.F.spec.hooks[name];
  if (!h) return undefined;
  try { return h(GAME, ...args); } catch (e) { report(e); return undefined; }
}
// light for a floor at a time of day: spec.light = null (follow time) | preset name | {preset, ...overrides} | fn(time)
function floorLight(kind, name) {
  const spec = FLOOR_BY_ID[kind], L = spec && spec.light;
  if (!L) return name;
  return typeof L === 'function' ? L(name) : L;
}
function applyTime(name) {
  G.preset = name;
  gfx.applyPreset(floorLight(G.floorKind, name));
  if (G.S) setFloorSky(G.S.F, name);
}

// ================================================================ camera
const CAM = { yaw: PI, pitch: 0.3, dist: 3.7, tgt: V(), pos: V(), lastLook: -99, mode: 'follow', drift: 0, occ: 1, cabin: false, blend: 0, prev: V(), shakeOff: 0 };
const ARRIVE_PITCH = 0.1; // level look out of the elevator car
const basePitch = () => (innerWidth < innerHeight ? 0.44 : 0.3);
function camDist() { const portrait = innerWidth < innerHeight; return (portrait ? 4.9 : 3.75) + (G.S && G.S.F.ceilY > 3.6 ? 0.25 : 0) + (toys && toys.riding() && toys.T.ride.kind === 'forklift' ? 1.0 : 0); }
function snapCamera() {
  CAM.yaw = P.yaw; CAM.pitch = innerWidth < innerHeight ? 0.44 : 0.3;
  CAM.tgt.set(P.pos.x, 1.25, P.pos.z);
  updateCamera(0, true);
}
const _cv = V(), _cl = V();
function updateCamera(dt, snap = false) {
  const portrait = innerWidth < innerHeight;
  const fov = portrait ? 70 : 55;
  if (G.mode === 'title' && G.S) {
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const tc = G.S.F.anchors.titleCam;
    CAM.drift += dt;
    const a = Math.sin(CAM.drift * 0.12) * 0.35;
    const off = V().subVectors(tc.pos, tc.look);
    off.applyAxisAngle(V(0, 1, 0), a);
    camera.position.copy(tc.look).add(off);
    if (portrait) camera.position.addScaledVector(off, 0.35);
    camera.lookAt(tc.look);
    return;
  }
  // look input
  let dx = IN.lookDX, dy = IN.lookDY; IN.lookDX = 0; IN.lookDY = 0;
  if (TOUCH) { dx += ui.look.dx * 1.6; dy += ui.look.dy * 1.6; ui.look.dx = 0; ui.look.dy = 0; }
  if (dx || dy) {
    CAM.yaw -= dx * 0.0042; CAM.pitch = clamp(CAM.pitch + dy * 0.0032, -0.05, 1.05);
    CAM.lastLook = G.rtime;
  }
  // gentle auto-follow behind the player when the mouse is idle
  if (!snap && G.rtime - CAM.lastLook > 1.3 && P.speed > 0.6 && !P.seated) {
    const d = wrapA(P.yaw - CAM.yaw);
    if (Math.abs(d) < 2.3) CAM.yaw += d * Math.min(1, dt * 1.5);
  }
  if (P.seated && !snap && G.rtime - CAM.lastLook > 1.3) CAM.yaw = angLerp(CAM.yaw, P.yaw, dt * 2);
  // stepping out of an elevator: stay behind the player, level, then ease back to the normal pitch
  let arrK = 0;
  // out through a door: look back at the door a moment, then swing round behind the player (mouse look ends it)
  if (G.doorCam) {
    const D = G.doorCam; D.t += dt;
    if ((!snap && G.rtime - CAM.lastLook < 0.05) || D.t > 2.8) G.doorCam = null;
    else if (D.t > 0.7) { CAM.yaw = angLerp(CAM.yaw, P.yaw, dt * 3.0); CAM.pitch += (basePitch() - CAM.pitch) * Math.min(1, dt * 2.5); }
  } else if (G.arrive && !G.arrive.door) {
    arrK = 1 - clamp(G.arrive.t / 1.1, 0, 1);
    if (G.rtime - CAM.lastLook > 0.05 || snap) { CAM.yaw = angLerp(CAM.yaw, P.yaw, snap ? 1 : dt * 6); CAM.pitch = ARRIVE_PITCH + (basePitch() - ARRIVE_PITCH) * (1 - arrK) * (1 - arrK); }
  }
  const dist = camDist();
  const ty = P.seated ? 1.05 : 1.25 + P.y * 0.5;
  _cv.set(P.pos.x, ty, P.pos.z);
  if (snap) CAM.tgt.copy(_cv); else CAM.tgt.lerp(_cv, Math.min(1, dt * 12));
  const fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw);
  const cp = Math.cos(CAM.pitch), spch = Math.sin(CAM.pitch);
  const pos = _cl.set(CAM.tgt.x - fx * dist * cp, CAM.tgt.y + dist * spch, CAM.tgt.z - fz * dist * cp);
  const F = G.S && G.S.F;
  // a camera that would sit behind a wall in an elevator doorway goes into the car instead (over the shoulder,
  // below the car ceiling) — no wall clamp / occlusion pull-in there, which used to park it in the doorway
  // looking down at the floor
  const wasCabin = CAM.cabin;
  CAM.cabin = false;
  if (F) for (const ev of F.elevators) {
    const ax = pos.x - ev.front.x, az = pos.z - ev.front.z;
    const along = ax * ev.fwd.x + az * ev.fwd.z;
    if (along > 0.25) continue;
    const pa = (P.pos.x - ev.front.x) * ev.fwd.x + (P.pos.z - ev.front.z) * ev.fwd.z, pl = (P.pos.x - ev.front.x) * ev.right.x + (P.pos.z - ev.front.z) * ev.right.z;
    if (pa < -1.5 || pa > 4.5 || Math.abs(pl) > 0.95) continue; // player in the car or in front of its doors
    let lat = ax * ev.right.x + az * ev.right.z;
    const a = clamp(along, -1.2, 0.25);
    lat = clamp(lat, -0.34, 0.34);
    pos.x = ev.front.x + ev.fwd.x * a + ev.right.x * lat; pos.z = ev.front.z + ev.fwd.z * a + ev.right.z * lat;
    pos.y = clamp(pos.y, 1.25, 1.95);
    CAM.cabin = true;
    break;
  }
  // keep inside the room (and out of pillars / walls)
  if (F && !CAM.cabin) {
    const b = F.bounds, inside = P.pos.x > b.minX && P.pos.x < b.maxX;
    if (inside) { pos.x = clamp(pos.x, b.minX + 0.25, b.maxX - 0.25); pos.z = clamp(pos.z, b.minZ + 0.25, b.maxZ - 0.25); }
    pos.y = clamp(pos.y, 0.35, F.ceilY - 0.22);
    // a low roof inside an open-air area (the street's entrance canopy): stay under it
    const lid = F.anchors.camLid;
    if (lid && pos.x > lid.x0 && pos.x < lid.x1 && pos.z > lid.z0 && pos.z < lid.z1) pos.y = Math.min(pos.y, lid.y);
    // pillars / walls between the player and the camera: pull the camera in front of them
    // (skipped inside an elevator cabin; the first ~0.6 m behind the player is ignored so a wall the
    //  player hugs does not shove the camera into their head)
    let ok = 1;
    const N = 12, rects = G.S.staticRects;
    if (inside) {
      ok = 2 / N;
      for (let i = 3; i <= N; i++) {
        const t = i / N;
        const x = CAM.tgt.x + (pos.x - CAM.tgt.x) * t, y = CAM.tgt.y + (pos.y - CAM.tgt.y) * t, z = CAM.tgt.z + (pos.z - CAM.tgt.z) * t;
        let hit = false;
        for (let k = 0; k < rects.length; k++) { const r = rects[k]; if (r.y1 > y - 0.05 && pointInRect(r, x, z, 0.14)) { hit = true; break; } }
        if (hit) break;
        ok = t;
      }
    }
    const want = ok >= 1 ? 1 : Math.max(0.2, ok - 0.03);
    if (snap || want < CAM.occ) CAM.occ = want; else CAM.occ += (want - CAM.occ) * Math.min(1, dt * 4);
    if (CAM.occ < 0.999) pos.lerpVectors(CAM.tgt, pos, CAM.occ);
    // pulled in close (pillar / wall behind): rise above head height so the player's head does not fill the screen
    const close = Math.hypot(pos.x - CAM.tgt.x, pos.z - CAM.tgt.z);
    if (close < 1.7) pos.y = Math.min(F.ceilY - 0.22, Math.max(pos.y, CAM.tgt.y + (1.7 - close) * 0.55));
  }
  // switching between "in the car" and "in the room" glides instead of jumping
  if (!snap && wasCabin !== CAM.cabin) CAM.blend = 0.4;
  if (CAM.blend > 0 && !snap) { CAM.blend -= dt; pos.lerpVectors(CAM.prev, pos, Math.min(1, dt * 9)); }
  CAM.prev.copy(pos);
  CAM.pos.copy(pos);
  camera.position.copy(pos);
  // ---- feel: trauma shake (squared, smooth noise), directional kick, roll, FOV punch
  const calmK = ui.settings.calm ? 0.25 : 1;
  const tr = Math.min(1, G.shake), k = tr * tr * calmK;
  const ns = G.rtime * 31;
  let ox = 0, oy = 0, oz = 0;
  if (k > 1e-4) {
    ox = (Math.sin(ns * 1.13) + Math.sin(ns * 2.71 + 1.3) * 0.5) * k * 0.15;
    oy = (Math.sin(ns * 1.37 + 2.1) + Math.sin(ns * 3.07) * 0.5) * k * 0.11;
    oz = (Math.sin(ns * 0.97 + 4.2) + Math.sin(ns * 2.33 + 0.7) * 0.5) * k * 0.15;
  }
  ox += FEEL.kick.x; oy += FEEL.kick.y; oz += FEEL.kick.z;
  camera.position.x += ox; camera.position.y += oy; camera.position.z += oz;
  if (F) camera.position.y = Math.min(camera.position.y, F.ceilY - 0.12);
  CAM.shakeOff = Math.hypot(ox, oy, oz);
  const ahead = 1.1 + (CAM.cabin ? 1.4 : 0) + arrK * 1.0;
  camera.lookAt(CAM.tgt.x + fx * ahead + FEEL.kick.x * 0.5, CAM.tgt.y - 0.12 + (CAM.cabin ? 0.12 : 0) + FEEL.kick.y * 0.5, CAM.tgt.z + fz * ahead + FEEL.kick.z * 0.5);
  if (k > 1e-4 && !ui.settings.calm) camera.rotateZ(Math.sin(ns * 0.83 + 0.4) * k * 0.05);
  const wantFov = fov + FEEL.fov;
  if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
}

// ================================================================ HUD helpers
function hudStory() {
  ui.hud(true);
  ui.keys([{ k: 'WASD', t: '이동' }, { k: 'SPACE', t: '점프' }, { k: 'E', t: '행동' }]);
  ui.money(0, '피해액'); ui.timer(null); ui.combo(0);
}
function hudRampage(label = '피해 총액') {
  ui.hud(true);
  ui.keys([{ k: 'WASD', t: '이동' }, { k: 'SPACE', t: '점프' }, { k: 'Z·클릭', t: '때리기' }, { k: 'X', t: '발차기' }, { k: 'C', t: '막기' }, { k: 'E', t: '엎기·집기' }, { k: 'Q', t: '필살기' }]);
  ui.money(G.money, label); ui.special(G.special);
}
function setStress(v, pulse = true) {
  let nv = clamp(v, 0, 100);
  if (G.mode === 'story' && !G.rampage && STORY[G.scene]) nv = Math.max(G.stress, Math.min(nv, storyStressCap()));
  const up = nv > G.stress + 0.5;
  G.stress = nv;
  ui.stress(nv, { pulse: pulse && up });
  audio.intensity(nv / 100);
  if (up && !G.rampage) sfx('stressUp', { vol: 0.5 });
}
function addStress(d) { setStress(G.stress + d); }
function setTasks(list) { G.storyTasks = list; ui.tasks(list); }
function doneTask(i) { if (G.storyTasks && G.storyTasks[i]) { G.storyTasks[i].done = true; ui.tasks(G.storyTasks); sfx('check', { vol: 0.6 }); } }

// ================================================================ projection
const _pv = V();
function toScreen(v) {
  _pv.copy(v).project(camera);
  if (_pv.z > 1 || _pv.z < -1 || _pv.x < -1.3 || _pv.x > 1.3 || _pv.y < -1.3 || _pv.y > 1.3) return null;
  return { x: (_pv.x * 0.5 + 0.5) * innerWidth, y: (-_pv.y * 0.5 + 0.5) * innerHeight };
}

// ================================================================ game feel
// hit-stop (game clock nearly frozen, real clock runs: deterministic under __ppg.step), trauma shake + a
// directional camera kick (updateCamera), FOV punch, slow-mo, squash-and-stretch pops on struck props.
// Calm mode (흔들림 약하게): shake ×0.25 and no roll, no kick/FOV punch beyond a nudge, no flashes, hit-stop ≤ 30 ms.
const HITSTOP = { punch: 0.035, kick: 0.06, break: 0.06, crash: 0.11, flip: 0.11, special: 0.16 };
const FEEL = { kick: V(), fov: 0, pops: Array.from({ length: 18 }, () => ({ rec: null, t: 0, a: 0, bx: 1, by: 1, bz: 1 })), hs: [], big: 0 };
const isCalm = () => !!ui.settings.calm;
function hitStop(kind) {
  let s = typeof kind === 'number' ? kind : HITSTOP[kind] || 0;
  if (isCalm()) s = Math.min(s, 0.03);
  if (s <= 0) return;
  if (s > G.hitStop) G.hitStop = s;
  if (DEBUG) { FEEL.hs.push({ kind, s, f: G.frames }); if (FEEL.hs.length > 60) FEEL.hs.shift(); }
}
function shake(t) { G.shake = Math.min(1.25, Math.max(G.shake, t)); }
function camKick(dir, amt) {
  if (isCalm()) amt *= 0.3;
  FEEL.kick.x += dir.x * amt; FEEL.kick.z += dir.z * amt; FEEL.kick.y -= amt * 0.3;
  FEEL.kick.clampLength(0, 0.42);
}
function fovPunch(deg) { if (!isCalm()) FEEL.fov = Math.max(FEEL.fov, deg); }
function slowMo(sec = 0.3, scale = 0.4) {
  if (!(G.slowT > 0 && G.slowScale < scale)) G.slowScale = scale; // a deeper slow already running keeps its depth
  G.slowT = Math.max(G.slowT, sec);
}
// the biggest destructions: desk flip landing, car wreck, safe open, water tank burst, the special
function bigMoment(stop = 'crash', fov = 7) {
  hitStop(stop); slowMo(0.3, 0.4); fovPunch(fov); shake(1.0);
  if (!isCalm()) ui.flash('#fff0c0', 150);
  vibrate(70);
  FEEL.big++;
}
// squash-and-stretch on a struck prop (scales its group around its bottom; animated on the real clock so it
// reads during a hit-stop)
function popRec(rec, a) {
  if (!rec || rec.removed || rec.held || a <= 0) return;
  let e = null;
  for (const p of FEEL.pops) { if (p.rec === rec) { e = p; break; } if (!e && !p.rec) e = p; }
  if (!e) return;
  if (e.rec !== rec) {
    if (rec.inst) rec.inst(rec);
    const s = rec.group.scale; e.rec = rec; e.bx = s.x; e.by = s.y; e.bz = s.z;
  }
  e.t = 0; e.a = Math.min(0.32, a);
}
function updatePops(dt) {
  for (const e of FEEL.pops) {
    const r = e.rec;
    if (!r) continue;
    e.t += dt;
    const g = r.group;
    if (r.removed || r.held || e.t > 0.36) { g.scale.set(e.bx, e.by, e.bz); if (!g.matrixAutoUpdate) g.updateMatrix(); e.rec = null; continue; }
    const k = e.a * Math.exp(-e.t * 10) * Math.cos(e.t * 30); // squash first, then a springy stretch
    g.scale.set(e.bx * (1 + k * 0.55), e.by * (1 - k), e.bz * (1 + k * 0.55));
    if (!g.matrixAutoUpdate) g.updateMatrix();
  }
}
function feelTick(rdt) {
  FEEL.kick.multiplyScalar(Math.exp(-rdt * 11));
  FEEL.fov *= Math.exp(-rdt * 5.5); if (FEEL.fov < 0.02) FEEL.fov = 0;
  updatePops(rdt);
}

// ================================================================ story scenes
let STORY_ORDER = ['copier', 'coffee', 'sunset', 'rampage', 'bill'];
const STORY = {
  copier: {
    info: { time: '오전 10:30', title: '복합기 용지 걸림', sub: '급한 인쇄 한 장이 안 나온다' },
    setup() {
      G.preset = 'day';
      const S = enterFloor('office', { at: G.floors.office ? null : null });
      resetPlayer();
      seatPlayer(S.F.anchors.playerSeat);
      snapCamera(); CAM.pitch = 0.36;
      audio.music('office');
      setStress(12, false);
      hudStory();
      ui.mission({ title: '복합기 용지 걸림', sub: '7층 · 오전 10:30', note: '급한 인쇄 한 장이 안 나온다' });
      setTasks([{ text: '용지 걸림 확인' }]);
      S.F.anchors.printer.prop.set('jam');
      G.jams = 0;
      phase('intro');
      after(0.6, () => { ui.subtitle('부장', '김 대리~ 회의 자료 한 장만 급하게 뽑아 와!', 3200); sfx('mumbleLow', { vol: 0.6 }); bossLook(); });
      after(1.8, () => sfx('printerJam', { vol: 0.5 }));
      after(3.0, () => { unseat(); phase('walk'); ui.toast('복합기로 가 보세요', 1800); });
    },
    update() {
      const S = G.S, pr = S.F.anchors.printer.rec;
      if (G.phase === 'walk' && G.floorKind === 'office') {
        const front = V(pr.body.position.x, 0, pr.body.position.z - 0.85);
        objective({ pos: front, h: 1.65, cand: { id: 'printer', pos: V(pr.body.position.x, 0, pr.body.position.z), h: 1.05, obj: pr.group, text: '용지 빼기', hold: 1.0, range: 1.6, onDone: pullPaper } });
      } else objective(null);
    },
    skip() { G.jams = 3; sceneNext(); },
  },
  coffee: {
    info: { time: '낮 12:10', title: '커피 심부름', sub: '“아아 12잔, 자네 카드로”' },
    setup() {
      G.preset = 'noon';
      const S = enterFloor('office');
      resetPlayer();
      const A = S.F.anchors;
      P.pos.copy(A.bossFront); P.yaw = PI / 2; placePlayer(); snapCamera();
      const boss = npcByRole(S, 'boss');
      resetNpc(boss, A.bossStand, A.bossStandYaw, 'talk', 'smug');
      audio.music('office');
      setStress(Math.max(G.stress, 42), false);
      hudStory();
      ui.mission({ title: '커피 심부름', sub: '7층 · 낮 12:10', quote: '아아 12잔, 자네 카드로' });
      setTasks([{ text: '1층 카페 가기' }, { text: '아이스 아메리카노 받기' }, { text: '부장님께 갖다 드리기' }]);
      phase('order');
      P.controls = false;
      after(0.4, () => { boss.say('아아 12잔, 자네 카드로~', 3.4, G.rtime); sfx('mumbleLow', { vol: 0.6 }); });
      after(3.6, () => { addStress(4); setFace('endure', 1.2); boss.char.setAnim('idle'); P.controls = true; phase('toLobby'); ui.toast('엘리베이터를 타고 1층으로', 2000); });
    },
    update() {
      const S = G.S;
      const ph = G.phase;
      if (ph === 'toLobby') {
        if (G.floorKind === 'lobby') { lobbyArrived(); return; }
        objective(elevatorObjective('lobby'));
      } else if (ph === 'queue') {
        if (G.floorKind !== 'lobby') { objective(elevatorObjective('lobby')); return; }
        const spot = queueSpot();
        objective({ pos: spot, h: 2.2, floor: 'lobby' });
        if (P.pos.distanceTo(spot) < 0.75) startQueue();
      } else if (ph === 'inQueue') {
        if (G.floorKind !== 'lobby') { objective(elevatorObjective('lobby')); return; }
        objective({ pos: queueSpot(), h: 2.2, floor: 'lobby' });
      } else if (ph === 'pickup') {
        if (G.floorKind !== 'lobby') { objective(elevatorObjective('lobby')); return; }
        const t = S.F.anchors.trays[0].rec;
        const tp = V(t.body.position.x + 0.2, 0, t.body.position.z);
        objective({ pos: V(tp.x, 0, -5.45), h: 1.75, floor: 'lobby', cand: { id: 'trays', pos: tp, h: 1.25, obj: t.group, text: '커피 받기', hold: 0.6, range: 1.7, onDone: takeCoffee } });
      } else if (ph === 'toOffice') {
        if (G.floorKind === 'office') { phase('deliver'); audio.music('office'); ui.mission({ title: '커피 심부름', sub: '7층 · 낮 12:40', quote: '아아 12잔, 자네 카드로' }); return; }
        objective(elevatorObjective('office'));
      } else if (ph === 'deliver') {
        if (G.floorKind !== 'office') { objective(elevatorObjective('office')); return; }
        const boss = npcByRole(G.floors.office, 'boss');
        objective({ pos: boss.pos.clone(), h: 2.45, floor: 'office', cand: { id: 'boss', pos: boss.pos, h: 1.3, obj: boss.group, text: '커피 드리기', hold: 0.4, range: 2.0, onDone: deliverCoffee } });
      } else objective(null);
    },
    skip() { sceneNext(); },
  },
  sunset: {
    info: { time: '오후 5:50', title: '퇴근 5분 전', sub: '오늘은 정시에 간다' },
    setup() {
      G.preset = 'sunset';
      const S = enterFloor('office');
      resetPlayer();
      const seat = S.F.anchors.playerSeat;
      P.pos.set(seat.x - 0.9, 0, seat.z + 0.7); P.yaw = -PI / 2; placePlayer(); snapCamera();
      const boss = npcByRole(S, 'boss');
      resetNpc(boss, S.F.anchors.hide[0], PI / 2, 'idle', 'smug');
      boss.say('', 0);
      audio.music('sunset');
      setStress(Math.max(G.stress, 70), false);
      hudStory();
      ui.mission({ title: '퇴근 5분 전', sub: '7층 · 오후 5:50' });
      setTasks([{ text: '퇴근하기' }]);
      phase('leave');
      for (const ev of S.F.elevators) ev.locked = false;
    },
    update() {
      const S = G.S;
      const boss = npcByRole(S, 'boss');
      if (G.phase === 'leave') {
        objective(elevatorObjective(null));
        const ev = S.F.elevators[0];
        if (P.pos.x < -4.0 || P.pos.distanceTo(ev.front) < 7.5) interceptStart(boss);
      } else if (G.phase === 'intercept') {
        // keep standing in the way between the player and the elevators
        if (G.rtime - (G.bossRepath || 0) > 0.6 && boss.state !== 'walk') {
          const ev = nearestElevator(P.pos);
          const d = V().subVectors(ev.front, P.pos).setY(0);
          if (d.length() > 0.1) d.normalize();
          const want = P.pos.clone().addScaledVector(d, 1.35);
          if (want.distanceTo(boss.pos) > 0.9) { boss.walkTo(npcCtx(), want.x, want.z, { speed: 2.4, anim: 'offer' }); boss.arriveAnim = 'offer'; }
          G.bossRepath = G.rtime;
        }
        if (boss.state !== 'walk') boss.yaw = angLerp(boss.yaw, Math.atan2(P.pos.x - boss.pos.x, P.pos.z - boss.pos.z), 0.2);
        if (G.rtime - (G.bossSaid || 0) > 4.5) { boss.say('이것만 하고 가~', 3, G.rtime); G.bossSaid = G.rtime; }
        objective({ pos: boss.pos.clone(), h: 2.5, cand: { id: 'boss', pos: boss.pos, h: 1.25, obj: boss.group, text: '서류 받기', hold: 0.5, range: 2.1, onDone: takeBinders } });
      } else objective(null);
    },
    skip() { G.phase = 'boil'; startRage(); },
  },
};

// ---- floor scenes: one extra situation per floor module (spec.scene), slotted into the day by its time.
// Step vocabulary (README): mission, tasks, done, sub, say, sfx, stress, face, unseat, music, toast, npc, call,
// and the blocking steps wait, goto (ride to a floor), walk (to a point), hold (hold-E on a thing), recMove.
function clockHours(s) {
  const m = /(오전|오후|낮|저녁|밤)?\s*(\d{1,2})\s*[:시]\s*(\d{1,2})?/.exec(s || '');
  if (!m) return 99;
  let h = +m[2]; if ((m[1] === '오후' || m[1] === '저녁' || m[1] === '밤') && h < 12) h += 12;
  return h + (+(m[3] || 0)) / 60;
}
for (const f of FLOORS) {
  const sc = f.scene;
  if (!sc || !sc.steps) continue;
  const id = sc.id || 'floor:' + f.id;
  STORY[id] = {
    info: { time: sc.time, title: sc.title, sub: sc.sub || '' }, floorScene: f.id,
    setup() {
      const st = sc.start || {};
      G.preset = st.preset || 'day';
      const fl = st.floor || f.id;
      const S = enterFloor(fl);
      resetPlayer();
      if (st.seat && S.F.anchors[st.seat]) seatPlayer(S.F.anchors[st.seat]);
      else {
        const p = anchorPos(S, st.at) || S.F.anchors.spawn;
        P.pos.set(p.x, 0, p.z); P.yaw = st.yaw != null ? st.yaw : (S.F.anchors.spawnYaw || 0); placePlayer();
      }
      snapCamera();
      const boss = npcByRole(S, 'boss');
      if (boss && S.F.anchors.bossStand) resetNpc(boss, S.F.anchors.bossStand, S.F.anchors.bossStandYaw || 0, 'idle', 'smug');
      audio.music(st.music || f.music || 'office');
      if (st.stress != null) setStress(Math.max(G.stress, st.stress), false);
      hudStory();
      G.run = { steps: sc.steps, i: 0, t: 0, floor: fl, started: false, ended: false, sceneId: id };
      phase('s0');
    },
    update(dt) { runSteps(dt); },
    skip() { G.run = null; sceneNext(); },
  };
}
// 하루 전체 (시험 · 디버그 전용: __ppg.start('story', { len: 'long' | 'short' })). 화면에서는 레벨로만 고른다.
// long = every situation by the clock (8 with all floors), short = copier, coffee, 퇴근 5분 전
const STORY_LONG = Object.keys(STORY).sort((a, b) => clockHours(STORY[a].info.time) - clockHours(STORY[b].info.time)).concat(['rampage', 'bill']);
const STORY_SHORT = ['copier', 'coffee', 'sunset', 'rampage', 'bill'];
STORY_ORDER = STORY_SHORT;

// ================================================================ 레벨 (본게임)
// 레벨 하나 = 상황 하나 (하루의 시간 순서) → 스트레스 100% → 그 층에서 1분 난동 → 결과(별 0~3).
// 쉬운 레벨은 보스 · 중간보스가 덤비지 않고, 갈수록 욱하는 직원 · 중간보스 · 보스가 붙는다. 난이도(diff.js)는 그 위에 곱해진다.
//   fight: boss / mid = 이 판에 덤비는지, angry = 처음부터 덤비는 평직원 수 (× 난이도 angryMul)
//   goal = ★ 목표 피해액, fl = 난동이 벌어지는 층 (카드 · 레벨 선택 표시)
// 별: ★ 끝까지 버티기(클리어) · ★ 목표 피해액 · ★ 한 번도 안 쓰러지기. 어려움(koRule 'retry')은 쓰러지면 그 판 실패.
const LEVELS = [
  { scene: 'copier', fl: '7층', fight: { boss: false, mid: false, angry: 0 }, goal: 400000, tag: '' },
  { scene: 'execReport', fl: '12층', fight: { boss: false, mid: false, angry: 1 }, goal: 500000, tag: '욱하는 직원' },
  { scene: 'coffee', fl: '7층', fight: { boss: false, mid: true, angry: 0 }, goal: 600000, tag: '중간보스' },
  { scene: 'roofLettuce', fl: '옥상', fight: { boss: false, mid: true, angry: 1 }, goal: 700000, tag: '중간보스' },
  { scene: 'hallSetup', fl: '3층', fight: { boss: false, mid: true, angry: 2 }, goal: 800000, tag: '중간보스' },
  { scene: 'parkingCar', fl: 'B2', fight: { boss: false, mid: true, angry: 2 }, goal: 900000, tag: '중간보스' },
  { scene: 'pubBooking', fl: 'B1', fight: { boss: true, mid: true, angry: 1 }, goal: 1000000, tag: '보스' },
  { scene: 'sunset', fl: '7층', fight: { boss: true, mid: true, angry: 2 }, goal: 1200000, tag: '최종 보스' },
].filter((L) => STORY[L.scene]);
const LEVEL_N = LEVELS.length;
const BOSS_BONUS = { boss: 300000, mid: 150000 }; // 보스 · 중간보스를 처음 쓰러뜨리면 (보스전 · 레벨)
function levelOf(n) { return LEVELS[clamp(n | 0, 1, LEVEL_N) - 1]; }
function lvSave(n) { return save.lv[n] || { stars: 0, best: 0, clear: false }; }
function levelOpen(n) { return n <= 1 || (n <= LEVEL_N && !!lvSave(n - 1).clear); }
function starsTotal() { let s = 0; for (let i = 1; i <= LEVEL_N; i++) s += lvSave(i).stars; return s; }
function levelRows() {
  return LEVELS.map((L, i) => {
    const n = i + 1, inf = STORY[L.scene].info, sv = lvSave(n);
    return { n, title: inf.title, time: inf.time, fl: L.fl, tag: L.tag, goal: L.goal, open: levelOpen(n), stars: sv.stars, best: sv.best, clear: sv.clear, boss: !!L.fight.boss, mid: !!L.fight.mid };
  });
}
function nextLevel() { let n = 1; while (n < LEVEL_N && lvSave(n).clear) n++; return n; }
function levelFightLine(L) {
  const f = L.fight, out = [];
  if (f.boss) out.push('보스'); if (f.mid) out.push('중간보스');
  if (f.angry) out.push('욱하는 직원');
  if (!out.length) return '아직은 다들 도망만 가요';
  return out.join(' · ') + (out[out.length - 1].endsWith('직원') ? '이' : '가') + ' 덤벼요';
}
// 이 판에서 누가 덤비나: 레벨 설정대로 보스 · 중간보스를 쉬게 하고, 욱하는 직원을 더한다 (층마다 한 번)
function applyRunFight(S) {
  if (!S || !fight || S.runFight === G.runId) return;
  S.runFight = G.runId;
  const L = G.mode === 'story' && G.level ? levelOf(G.level) : null;
  if (!L) return;
  for (const n of S.npcs) {
    if (!n.fighter) continue;
    if ((n.fighter.rank === 'boss' && !L.fight.boss) || (n.fighter.rank === 'mid' && !L.fight.mid)) n.fighter = null;
  }
  const am = Number(DD().angryMul); let extra = Math.round((L.fight.angry || 0) * (am >= 0 && isFinite(am) ? am : 1));
  const pool = S.npcs.filter((n) => n.role === 'worker' && !n.fighter && !n.gone).sort((a, b) => (a.seated ? 1 : 0) - (b.seated ? 1 : 0));
  for (const n of pool) { if (extra <= 0) break; try { if (fight.make(n, 'angry')) { n.hothead = false; extra--; } } catch (e) { report(e); break; } }
}
// 을/를 (이름 끝 글자에 받침이 있으면 을) — 사용자가 정한 이름에도 맞게
function eul(w) { const t = String(w || ''), c = t.charCodeAt(t.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 === 0 ? '를' : '을'; }
// 난동 화면 제목 (HUD · 엘리베이터를 타도 그대로)
// 레벨 시작 카드: "레벨 3 · 7층 · 보통" / 낮 12:10 / 커피 심부름 / 대사 / 목표
function levelCard(n) {
  const L = levelOf(n), inf = STORY[L.scene].info;
  return { lv: `레벨 ${n} · ${L.fl} · ${diffName()}`, time: inf.time, title: inf.title, sub: inf.sub, goal: `★ 목표 피해액 ${fmt(L.goal)}원 · ${levelFightLine(L)}` };
}
function rampTitle() {
  if (G.mode === 'free') return '자유 난동';
  if (G.mode === 'boss') return '1분 보스전';
  if (G.mode === 'story' && G.level) return `레벨 ${G.level} · 1분 난동`;
  return '1분 난동';
}
// story stress: never goes down between situations and the k-th of N situations tops out at
// 100 − 58·(N−1−k)/(N−1) (short: 42 / 71 / 100, long: 42 … 92 / 100), so only the last one reaches 100
function storyStressCap() {
  const list = STORY_ORDER.filter((id) => STORY[id]);
  const i = list.indexOf(G.scene), N = list.length;
  if (i < 0 || N < 2) return 100;
  return Math.round(100 - 58 * (N - 1 - i) / (N - 1));
}

function anchorPos(S, a) {
  if (!a) return null;
  if (Array.isArray(a)) return V(a[0], 0, a[1]);
  if (a.isVector3) return a;
  const v = S.F.anchors[a];
  return v && v.isVector3 ? v : v && v.x != null ? V(v.x, 0, v.z) : null;
}
function findNpc(who, S = G.S) {
  if (!S || !who) return null;
  if (typeof who !== 'string') return who;
  return S.npcs.find((n) => n.role === who) || S.npcs.find((n) => n.id === who || n.spec.name === who) || null;
}
function recByTag(tag, S = G.S) { return S ? S.phys.records.find((r) => r.tag === tag && !r.removed) || null : null; }
function runSteps(dt) {
  const R = G.run;
  if (!R || R.ended) return;
  for (let guard = 0; guard < 40 && R.i < R.steps.length; guard++) {
    const s = R.steps[R.i];
    if (!R.started) { R.started = true; R.t = 0; R.holdDone = false; try { startStep(s, R); } catch (e) { report(e); } }
    let done = true;
    try { done = stepDone(s, R, dt); } catch (e) { report(e); }
    if (!done) { R.t += dt; return; }
    R.i++; R.started = false;
    phase('s' + R.i);
  }
  if (R.i >= R.steps.length) { R.ended = true; objective(null); sceneNext(); }
}
function startStep(s, R) {
  if (s.mission) ui.mission(s.mission);
  if (s.tasks) setTasks(s.tasks.map((t) => (typeof t === 'string' ? { text: t } : t)));
  if (s.done != null) doneTask(s.done);
  if (s.sub) ui.subtitle(s.sub[0], s.sub[1], s.sub[2] || 2600);
  if (s.say) { const n = findNpc(s.say[0]); if (n) { n.say(s.say[1], s.say[2] || 2.6, G.rtime); sfx('mumble', { vol: 0.5 }); } }
  if (s.sfx) sfx(s.sfx, { vol: 0.65 });
  if (s.stress) setStress(typeof s.stress === 'string' && s.stress[0] === '=' ? +s.stress.slice(1) : G.stress + s.stress);
  if (s.face) setFace(s.face[0], s.face[1] || 1.5);
  if (s.unseat) unseat();
  if (s.music) audio.music(s.music);
  if (s.toast) ui.toast(s.toast, 2000);
  if (s.npc) {
    const o = s.npc, n = findNpc(o.who);
    if (n) {
      if (o.walk) { const p = anchorPos(G.S, o.walk); if (p) n.walkTo(npcCtx(), p.x, p.z, { speed: o.speed || 1.3, anim: o.anim || 'walk', onArrive: () => { n.char.setAnim(o.arrive || 'idle'); n.yaw = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z); } }); }
      else { if (o.anim) n.char.setAnim(o.anim); if (o.look === 'player') n.yaw = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z); }
      if (o.face) n.char.setFace(o.face);
      if (o.say) n.say(o.say, 2.6, G.rtime);
    }
  }
  if (s.recMove) {
    const rec = recByTag(s.recMove.tag);
    if (rec) {
      G.S.phys.setKinematic(rec, true); rec.riding = true;
      const p = rec.body.position;
      R.move = { rec, x0: p.x, z0: p.z, x1: p.x + (s.recMove.dx || 0), z1: p.z + (s.recMove.dz || 0), sec: s.recMove.sec || 1 };
    }
  }
  if (s.call) s.call(GAME);
  if (!s.recMove) R.move = null;
}
function stepDone(s, R, dt) {
  const S = G.S;
  if (s.recMove && R.move) {
    const M2 = R.move, k = Math.min(1, (R.t + dt) / M2.sec), e = k * k * (3 - 2 * k);
    M2.rec.body.position.x = M2.x0 + (M2.x1 - M2.x0) * e; M2.rec.body.position.z = M2.z0 + (M2.z1 - M2.z0) * e;
    syncRec(M2.rec);
    if (k < 1) return false;
    M2.rec.riding = false; S.phys.setKinematic(M2.rec, false); M2.rec.body.velocity.set(0, 0, 0); M2.rec.body.sleep(); syncRec(M2.rec);
    R.move = null;
    rebuildNav(S);
    return true;
  }
  if (s.wait != null) return R.t >= s.wait;
  if (s.goto) {
    if (G.floorKind === s.goto) { R.floor = s.goto; objective(null); return true; }
    objective(elevatorObjective(s.goto));
    return false;
  }
  if (s.walk || s.hold) {
    if (G.floorKind !== R.floor) { objective(elevatorObjective(R.floor)); return false; }
    if (s.walk) {
      const p = anchorPos(S, s.walk.to) || (findNpc(s.walk.to) || {}).pos;
      if (!p) return true;
      objective({ pos: p.clone(), h: 2.3 });
      if (Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < (s.walk.r || 0.8)) { objective(null); return true; }
      return false;
    }
    const o = s.hold;
    const rec = o.tag ? recByTag(o.tag) : null, n = o.who ? findNpc(o.who) : null;
    const tp = rec ? V(rec.body.position.x, 0, rec.body.position.z) : n ? n.pos.clone() : anchorPos(S, o.at);
    if (!tp) return true;
    const at = anchorPos(S, o.at) || tp;
    if (R.holdDone) { objective(null); return true; }
    objective({ pos: at.clone(), h: 2.3, cand: { id: 'step' + R.i, pos: at.clone(), h: o.h || 1.5, obj: rec ? rec.group : n ? n.group : null, text: o.text || '하기', hold: o.sec != null ? o.sec : 0.8, range: o.range || (o.at ? 1.4 : 2.2), onDone: () => { R.holdDone = true; P.char.playOnce(o.anim || 'take'); } } });
    return false;
  }
  return true;
}
function phase(p) { G.phase = p; G.phaseT = 0; }
function sceneNext() {
  // 레벨: 상황 하나가 끝나면 바로 끓어오른다 (스트레스 100% → 이 층에서 1분 난동)
  if (G.mode === 'story' && G.level && STORY[G.scene]) {
    if (G.phase === 'boil') return;
    G.run = null; objective(null); phase('boil'); unseat();
    startRage();
    return;
  }
  let order = STORY_ORDER, i = order.indexOf(G.scene);
  if (i < 0) { order = STORY_LONG; i = order.indexOf(G.scene); } // (a situation reached with __ppg.goto)
  gotoScene(order[Math.min(order.length - 1, i + 1)]);
}
// [situation that just ended, stress at its end, game time] — the story stress curve (debug + tests)
function logStoryStress() {
  if (G.mode !== 'story' || !STORY[G.scene]) return;
  const L = G.stressLog || (G.stressLog = []);
  if (!L.length || L[L.length - 1][0] !== G.scene) L.push([G.scene, Math.round(G.stress), +G.rtime.toFixed(1)]);
}
function gotoScene(id) {
  if (G.scene !== id) logStoryStress();
  G.gen++; G.timers.length = 0;
  ui.subtitle(null, null); ui.elevator(null); G.evPanel = null;
  if (STORY[id]) {
    G.scene = id; G.rampage = false; G.canDamage = false; G.timeLeft = null;
    objective(null);
    if (G.mode === 'story' && G.level) return transition(levelCard(G.level), () => STORY[id].setup(), 3000);
    return transition(STORY[id].info, () => STORY[id].setup());
  }
  if (id === 'rampage') {
    if (!G.S) { G.preset = 'sunset'; enterFloor('office'); }
    startRampage();
    return Promise.resolve();
  }
  if (id === 'bill') { showBill(); return Promise.resolve(); }
  return Promise.resolve();
}
async function transition(info, setup, ms = 2100) {
  G.busy = true;
  const my = ++G.transN;
  try {
    if (!G.fast) await ui.fade(info, ms);
    if (my !== G.transN) return;
    setup();
    G.busy = true; // setup may have cleared it (startRampage); keep play frozen until the card is gone
    renderNow();
    if (!G.fast) await ui.fadeOut();
    else ui.fade && null;
  } catch (e) { report(e); }
  if (my === G.transN) G.busy = false;
}
function npcByRole(S, role) { return S.npcs.find((n) => n.role === role); }
function resetNpc(n, pos, yaw, anim, face) {
  if (n === P.carryNpc) releaseNpc(false);
  if (n._glasses) { fx.untoss(n._glasses); n._glasses = null; }
  n.resetKo();
  n.gone = false; n.group.visible = true; n.panicked = false; n.path = null; n.onArrive = null;
  n.seated = false; n.state = 'idle'; n.t = 0; n.y = 0;
  n.pos.set(pos.x, 0, pos.z); n.yaw = yaw; n.char.setAnim(anim); n.char.setFace(face); n.bubble = null; n.char.group.rotation.x = 0;
  for (let i = n.char.chest.children.length - 1; i >= 0; i--) n.char.chest.remove(n.char.chest.children[i]);
  n.place();
}
function bossLook() { const b = G.S && npcByRole(G.S, 'boss'); if (b) b.char.setAnim('talk'); after(3, () => b && b.state === 'idle' && b.char.setAnim('idle')); }

// ---- copier
function pullPaper() {
  const S = G.S, pr = S.F.anchors.printer;
  P.char.playOnce('pull');
  pr.prop.set('ok');
  sfx('paper', { vol: 0.7 });
  G.jams++;
  phase('pulled');
  const pp = V(pr.rec.body.position.x, 0.45, pr.rec.body.position.z - 0.45);
  const ball = makeProp('paperBall', { seed: G.jams }).group;
  fx.toss(ball, pp, V(rnd(-0.6, 0.6), 2.4, -1.6), 8, S.F.group);
  const stressSteps = [22, 32, 37];
  setStress(stressSteps[Math.min(2, G.jams - 1)]);
  setFace('endure', 1.6);
  vibrate(30);
  if (G.jams < 3) {
    after(1.2, () => {
      pr.prop.set('jam'); sfx('printerJam', { vol: 0.7 });
      ui.subtitle('나', ['…또 걸렸네?', '아니 왜 또…!'][G.jams - 1], 1900);
      phase('walk');
    });
  } else {
    after(0.9, () => sfx('printerWhirr', { vol: 0.7 }));
    after(2.0, () => { sfx('printerBeep', { vol: 0.7 }); fx.papers(V(pp.x, 0.6, pp.z), 1, 0.8); ui.subtitle('나', '…드디어 나왔다', 1800); doneTask(0); });
    after(4.0, () => { ui.subtitle('부장', '아 그거 이제 필요 없어~ 회의 끝났거든', 2800); sfx('mumbleLow', { vol: 0.6 }); bossLook(); });
    after(5.6, () => { setStress(42); setFace('endure', 2.5); });
    after(7.6, () => sceneNext());
  }
}
// ---- coffee
function lobbyArrived() {
  doneTask(0);
  phase('queue');
  audio.music('lobby');
  ui.mission({ title: '커피 심부름', sub: '1층 · 낮 12:10', quote: '아아 12잔, 자네 카드로' });
  const S = G.S;
  G.queue = S.npcs.filter((n) => n.role === 'queue' && !n.gone).sort((a, b) => a.spec.queueIndex - b.spec.queueIndex);
}
function queueSpot() { const A = G.floors.lobby.F.anchors; return A.queue[Math.min(4, G.queue.length)]; }
function startQueue() {
  phase('inQueue');
  const S = G.S, A = S.F.anchors;
  const cutter = npcByRole(S, 'cutter');
  after(1.0, () => {
    if (!cutter || cutter.gone) return;
    const spot = A.queue[G.queue.length];
    cutter.walkTo(npcCtx(), spot.x, spot.z, { speed: 2.3, anim: 'phone', onArrive: () => { cutter.yaw = PI; cutter.char.setAnim('phone'); } });
    G.queue.push(cutter);
    after(1.1, () => {
      cutter.say('아, 저 하나만 빨리요~', 2.6, G.rtime); sfx('mumble', { vol: 0.6 });
      P.push = A.queue[Math.min(4, G.queue.length)].clone();
      addStress(8); setFace('endure', 1.8);
      after(1.0, () => ui.subtitle('나', '(…새치기?)', 1700));
    });
  });
  const serve = () => {
    if (G.phase !== 'inQueue') return;
    const front = G.queue.shift();
    if (!front) { phase('pickup'); return; }
    const bar = npcByRole(S, 'barista');
    if (bar) { bar.say('주문하신 아메리카노 나왔습니다~', 1.6, G.rtime); bar.char.playOnce('take'); }
    sfx('cupClink', { vol: 0.5 });
    const door = A.door;
    front.walkTo(npcCtx(), door.x, door.z, { speed: 1.6, anim: front.baseAnim === 'lookUp' ? 'walk' : front.baseAnim, onArrive: () => front.arriveExit(npcCtx(), { leave: true, dir: V(0, 0, 1) }) });
    G.queue.forEach((n, i) => {
      const s = A.queue[i];
      after(0.25 + i * 0.15, () => n.walkTo(npcCtx(), s.x, s.z, { speed: 1.2, anim: n.baseAnim === 'lookUp' ? 'walk' : n.baseAnim, onArrive: () => { n.yaw = PI; n.char.setAnim(n.baseAnim); } }));
    });
    if (G.queue.length === 0) after(1.4, () => { phase('pickup'); ui.toast('내 차례!', 1400); });
    else after(1.9, serve);
  };
  after(3.4, serve);
}
function takeCoffee() {
  const S = G.S;
  const trays = S.F.anchors.trays.map((sp) => sp.rec).filter((r) => r && !r.removed);
  const carry = new THREE.Group();
  trays.forEach((r, i) => {
    S.phys.detach(r);
    r.group.matrixAutoUpdate = true;
    r.group.position.set(i ? 0.19 : -0.19, -0.02, 0.02); r.group.rotation.set(0, 0, 0); r.group.quaternion.identity();
    carry.add(r.group);
  });
  P.char.hold(carry, { both: true });
  P.carry = carry; P.carryKind = 'coffee'; G.coffeeRecs = trays;
  P.char.playOnce('take');
  sfx('register', { vol: 0.6 }); after(0.3, () => sfx('pickup', { vol: 0.6 }));
  const bar = npcByRole(S, 'barista');
  if (bar) bar.say('12잔 맞으시죠? 카드 꽂아 주세요~', 2.6, G.rtime);
  after(1.4, () => { ui.subtitle('나', '(…내 카드로)', 1800); addStress(4); setFace('endure', 1.5); });
  doneTask(1);
  phase('toOffice');
}
function deliverCoffee() {
  const S = G.S;
  const boss = npcByRole(S, 'boss');
  phase('delivered');
  // put the trays on the boss desk
  const o = dropCarry();
  const desk = S.F.anchors.bossSeat.desk.rec;
  (G.coffeeRecs || []).forEach((r, i) => {
    if (o) o.remove(r.group);
    S.F.group.add(r.group); r.group.matrixAutoUpdate = false;
    S.phys.reattach(r, V(desk.body.position.x - 0.1, 0.77 + r.hy, desk.body.position.z - 0.35 + i * 0.4));
    r.body.sleep(); syncRec(r);
  });
  P.char.playOnce('take');
  boss.char.setAnim('talk');
  after(0.3, () => { boss.say('어? 나 오늘 따뜻한 라떼 마시기로 했는데?', 2.6, G.rtime); sfx('mumbleLow', { vol: 0.6 }); });
  after(3.1, () => { boss.say('…영수증은?', 2.2, G.rtime); sfx('mumbleLow', { vol: 0.6, pitch: 1.1 }); });
  after(3.6, () => { setStress(70); setFace('endure', 3); vibrate(40); doneTask(2); boss.char.setAnim('idle'); });
  after(6.2, () => sceneNext());
}
// ---- sunset
function interceptStart(boss) {
  phase('intercept');
  setTasks([{ text: '추가 업무 받기' }]);
  for (const ev of G.S.F.elevators) ev.locked = true;
  const stack = makeProp('binderStack', { seed: 4 });
  boss.char.hold(stack.group, { both: true });
  G.bossStack = stack;
  const ev = nearestElevator(P.pos);
  const d = V().subVectors(ev.front, P.pos).setY(0).normalize();
  const want = P.pos.clone().addScaledVector(d, 1.5);
  boss.walkTo(npcCtx(), want.x, want.z, { speed: 2.6, anim: 'offer' });
  boss.arriveAnim = 'offer';
  boss.char.setFace('smile');
  after(0.6, () => { boss.say('이것만 하고 가~', 3, G.rtime); G.bossSaid = G.rtime; sfx('mumbleLow', { vol: 0.7 }); });
  after(1.2, () => { setFace('endure', 2); ui.subtitle('나', '(…5분 남았는데)', 1800); });
}
function takeBinders() {
  const S = G.S, boss = npcByRole(S, 'boss');
  phase('boil');
  objective(null);
  const g = G.bossStack.group;
  boss.char.chest.remove(g);
  P.char.hold(g, { both: true }); P.carry = g; P.carryKind = 'binders';
  P.char.playOnce('take');
  sfx('drop', { vol: 0.6 });
  boss.char.setAnim('idle'); boss.char.setFace('smug');
  after(0.4, () => boss.say('내일 아침까지~ 수고해!', 2.4, G.rtime));
  after(1.6, () => { const h = S.F.anchors.hide[0]; boss.walkTo(npcCtx(), h.x + 1.2, h.z - 0.6, { speed: 1.2, anim: 'walk' }); });
  doneTask(0);
  startRage();
}
function startRage() {
  P.controls = false;
  audio.music('tense');
  const s0 = G.stress;
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    after(i * 0.42, () => {
      setStress(s0 + (100 - s0) * (i / steps), false);
      sfx('heartbeat', { vol: 0.75 });
      ui.vignette(0.3 + 0.7 * (i / steps));
      setFace('endure');
      if (i === steps - 2) ui.subtitle('나', '……', 1200);
    });
  }
  after(steps * 0.42 + 0.5, () => {
    P.rage = true; setFace('rage');
    ui.banner('스트레스 100%', '참을 만큼 참았다', 2000);
    if (!ui.settings.calm) ui.flash('#ff5a3a', 260);
    sfx('stressUp', { vol: 0.9 }); vibrate(80);
    G.shake = 0.8;
    // throw the binders
    const g = dropCarry();
    if (g) {
      const S = G.S;
      const prop = G.bossStack;
      const fwd = V(Math.sin(P.yaw), 0, Math.cos(P.yaw));
      S.F.group.add(prop.group);
      const rec = S.phys.addProp(prop, P.pos.x + fwd.x * 0.5, 1.0, P.pos.z + fwd.z * 0.5, P.yaw, 'thrown');
      rec.body.wakeUp(); rec.body.velocity.set(fwd.x * 7, 4, fwd.z * 7); rec.body.angularVelocity.set(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
      rec.energized = S.phys.time + 3;
      fx.papers(V(P.pos.x + fwd.x * 0.6, 1.4, P.pos.z + fwd.z * 0.6), 10, 2.2);
    }
    P.char.playOnce('smash');
  });
  after(steps * 0.42 + 1.9, () => { ui.vignette(0); startRampage(); });
}

function nearestElevator(p) {
  let best = null, bd = 1e9;
  for (const ev of G.S.F.elevators) { const d = ev.front.distanceTo(p); if (d < bd) { bd = d; best = ev; } }
  return best;
}
function elevatorObjective(dest) {
  const ev = nearestElevator(P.pos);
  // an area without elevators (the street): head back in through its door
  if (!ev) { const pt = (G.S.F.spec.portals || [])[0]; return { pos: pt ? portalGoal(pt) : P.pos.clone(), h: 2.6, kind: 'door', dest, floor: G.floorKind }; }
  return { pos: ev.cabin.clone(), h: 2.6, kind: 'elevator', dest, floor: G.floorKind };
}
function objective(o) {
  G.obj = o;
  if (o) fx.marker(o.pos, o.h || 2.3); else fx.marker(null);
  G.cand = o && o.cand ? o.cand : null;
}

// ================================================================ rampage
// generic challenges (floor spec.challenges): { id, text, kind, n?, type?, tag?, key?, bonus }
//   break / flip / out / ram / hit / weapon / knock / alarm / fly / shout / lift → counters emitted below
//   carStage (n = stage reached, 1 glass … 4 wreck) / count (legacy counter `key`: paper, coffee, special…)
const DEFAULT_CHALLENGES = [
  { id: 'd1', text: '아무거나 10개 부수기', kind: 'break', n: 10, bonus: 40000 },
  { id: 'd2', text: '사람 3명 날리기', kind: 'knock', n: 3, bonus: 30000 },
  { id: 'd3', text: '필살기 쓰기', kind: 'count', key: 'special', bonus: 40000 },
];
// (kind 'ko' takes `role` as its type: { kind: 'ko', n: 2 } any two people, { kind: 'ko', role: 'boss' } the boss)
function chalKey(c) { const ty = c.type || (c.kind === 'ko' && c.role); return c.kind === 'count' ? c.key : c.kind + (c.tag ? '#' + c.tag : ty ? ':' + ty : ''); }
// Bill tiers for one minute of rampage (rush / story). Prices are compressed above ₩80k (phys.js → payPrice), so
// a person lands ≈ ₩0.5–1.3M on any floor, a good run ₩1.5–2M; the scripted bot does ≈ ₩1.5–2.5M.
// Free mode ranks the same tiers on damage per minute played (min. one minute) — see showBill().
const RANKS = [
  [0, '모범 사원', '부순 게 거의 없네요. 내일도 출근하실 거죠?'],
  [60000, '소심한 반항아', '키보드 하나에도 손이 떨렸군요.'],
  [200000, '탕비실 파괴자', '부장님 머그컵의 명복을 빕니다.'],
  [450000, '부서 해체 전문가', '인사팀이 조직도를 다시 그리는 중이에요.'],
  [800000, '인간 태풍', '관리팀이 보험 약관을 읽기 시작했어요.'],
  [1300000, '전설의 퇴사 예정자', '사내 게시판에 당신 이름이 올라왔어요.'],
  [2000000, '회사 뿌개기 장인', '건물주가 직접 전화를 걸어 왔습니다.'],
];
const RELIEF_K = 330000; // stress relief = 1 − e^(−money / K): ₩0.5M → 78%, ₩0.8M → 91%, ₩1.3M → 98%
const BIG_MONEY = 25000; // a tick paying this much rings 'bigMoney' instead of 'coin' (windows, laptops, TVs, gates, cars… a few times a minute)
const CHAL_BONUS_TOTAL = 420000; // a floor's six challenge bonuses are scaled down to this sum at most
// car payout by damage stage (cumulative share of its price: glass, dents, wheel off; the wreck pays the rest)
const CAR_STAGE_PAY = [0, 0.15, 0.35, 0.6];
const DESKS = new Set(['desk', 'deskL', 'meetingTable', 'roundTable', 'grilltable', 'podium', 'ceoDesk']);
const flippable = (r) => DESKS.has(r.type) || !!(r.sp && r.sp.flip);
const PAPERY = new Set(['desk', 'deskL', 'printer', 'paperStack', 'binders', 'binderStack', 'paperBox', 'shelf', 'cabinet', 'cabinetTall', 'whiteboard', 'meetingTable', 'bookcase', 'ceoDesk', 'box', 'parcel', 'infoDesk', 'directory', 'podium']);
// sound by material; types that need something else override it (TYPE_*: null = the toy reaction plays its own)
const HIT_SFX = { wood: 'hitWood', glass: 'hitGlass', metal: 'hitMetal', plastic: 'hitPlastic', soft: 'hitSoft', paper: 'hitPaper', ceramic: 'hitCeramic', plant: 'hitPlant' };
const BREAK_SFX = { wood: 'breakWood', glass: 'breakGlass', metal: 'breakMetal', plastic: 'breakPlastic', ceramic: 'breakCeramic', soft: 'hitSoft', paper: 'paper', plant: 'breakCeramic' };
const TYPE_HIT = { balloon: 'hitSoft', tireStack: 'hitSoft', car: 'hitMetal', forklift: 'hitMetal' };
const TYPE_BREAK = { balloon: null, ceoSafe: null, car: 'crash', aquarium: 'breakGlass', sojuFridge: 'breakGlass', watertank: 'breakPlastic', drum: 'breakMetal', alarmBell: 'breakMetal', forklift: 'breakMetal' };
const BIG_MOMENT = new Set(['car', 'ceoSafe', 'watertank', 'aquarium']);
const hitSfxName = (r) => TYPE_HIT[r.type] || HIT_SFX[r.material] || 'hitPlastic';

function resetDamage() {
  G.money = 0; G.items = new Map(); G.combo = 0; G.comboT = 0; G.special = 0; G.counts = {}; G.fcounts = {}; G.chal = {};
  G.playT = 0;
  ui.combo(0); ui.special(0);
}
function bumpCombo() {
  G.combo++; G.comboT = 1.5; ui.combo(G.combo);
  if (G.combo % 10 === 0) {
    sfx('comboUp', { vol: 0.7, pitch: 1 + Math.min(G.combo / 10, 8) * 0.06 });
    ui.banner(`연타 x${G.combo}!`, '', 900);
    if (DEBUG) G.comboMiles = (G.comboMiles || []).concat([G.combo]);
  }
}
function startRampage() {
  logStoryStress();
  G.scene = G.mode === 'free' ? 'free' : 'rampage';
  phase('');
  G.rampage = true; G.canDamage = true; G.busy = false;
  G.timeLeft = G.mode === 'free' ? null : 60;
  P.controls = true; P.rage = true; unseat(); dropCarry();
  P.char.setAnim('rageIdle'); setFace('rage');
  if (G.mode !== 'story') resetDamage();
  for (const ev of G.S.F.elevators) ev.locked = false;
  objective(null);
  audio.music('rage'); audio.intensity(1);
  hudRampage();
  setStress(100, false);
  G.relief0 = 100;
  const info = FLOOR_INFO[G.floorKind];
  ui.mission({ title: rampTitle(), sub: info.name, tone: 'rage' });
  ui.timer(G.timeLeft);
  G.kos = playerKos(); G.kos0 = G.kos; G.failed = null;
  initTasks(G.floorKind);
  if (G.mode === 'boss') {
    const S = G.S, bn = fight.bossName(S), mn = fight.midName(S);
    ui.banner('보스전!', `${bn} · ${mn}${eul(mn)} 쓰러뜨려라`, 1800); sfx('whistle', { vol: 0.6 });
    // 보스전: 보스 · 중간보스가 기다리지 않고 바로 찾아온다
    after(1.2, () => { if (!G.rampage || !G.S) return; const c = npcCtx(); for (const n of G.S.npcs) if (n.fighter && (n.fighter.rank === 'boss' || n.fighter.rank === 'mid') && !n.gone && !n.isKo) { try { n.engage(c); } catch (e) { report(e); } } });
  } else if (G.mode !== 'story') { ui.banner(G.mode === 'free' ? '자유 난동' : '1분 난동!', '다 뒤집어엎어라', 1600); sfx('whistle', { vol: 0.6 }); }
  else if (G.level) after(0.2, () => ui.toast(`★ 목표 ${fmt(levelOf(G.level).goal)}원` + (koRule() === 'retry' ? ' · 쓰러지면 실패' : ''), 2400));
  // the yell startles people nearby
  after(0.4, () => alarmAt(P.pos, 5.5));
}
// 주인공이 쓰러진 횟수 (fight.js 의 flops, 없으면 '쓰러짐' 상태가 켜진 횟수를 직접 센다)
function playerKos() {
  let f = 0;
  try { const st = fight.state(); f = Number(st.flops) || 0; const dn = !!(st.down || (fight.FT && fight.FT.downT > 0)); if (dn && !G.wasDown) G.downEdges = (G.downEdges || 0) + 1; G.wasDown = dn; } catch (e) { /* 무시 */ }
  return Math.max(f, G.downEdges || 0);
}
// 난동 중 쓰러짐 감시: 어려움(retry)이면 레벨은 실패, 보스전은 그 자리에서 끝
function watchKo() {
  if (G.failed || !(G.mode === 'story' && G.level) && G.mode !== 'boss') return;
  const k = playerKos();
  if (k <= G.kos) return;
  G.kos = k;
  if (koRule() !== 'retry') return;
  G.failed = 'ko';
  G.rampage = false; G.canDamage = false; G.timeLeft = null; ui.timer(null);
  P.controls = false;
  ui.banner('퇴사 처리…', G.mode === 'boss' ? '쓰러지면 끝 · 어려움' : '어려움: 쓰러지면 이 레벨 실패', 2000);
  sfx('whistle', { vol: 0.8, pitch: 0.7 });
  after(2.0, () => { fight.stop(); showBill(); });
}
// each floor keeps its own challenge pool (and progress) for the whole run
function initTasks(kind) {
  let C = G.chal[kind];
  if (!C) {
    const spec = FLOOR_BY_ID[kind];
    let src = spec && spec.challenges && spec.challenges.length ? spec.challenges : DEFAULT_CHALLENGES;
    // rush: a bonus goal for knocking out the floor's boss (부장님 / 사장님), when there is one and no KO goal yet
    const FS = G.floors[kind] || G.S;
    const boss = G.mode === 'rush' && FS && FS.npcs.find((n) => n.role === 'boss' && !n.gone);
    if (boss && !src.some((t) => t.kind === 'ko')) src = src.concat([{ id: 'koBoss', text: `${fight.nameOf(boss) || (boss.spec.name === 'ceo' ? '사장님' : '부장님')} 기절시키기`, kind: 'ko', role: 'boss', bonus: 60000 }]);
    // bonuses in proportion to the bill: a floor's six together pay at most CHAL_BONUS_TOTAL
    const sum = src.reduce((a, t) => a + (t.bonus || 0), 0), bk = sum > CHAL_BONUS_TOTAL ? CHAL_BONUS_TOTAL / sum : 1;
    let pool = src.map((t) => Object.assign({ done: false, doneAt: 0, need: t.n || 1, key: chalKey(t) }, t, { key: chalKey(t), bonus: Math.round((t.bonus || 0) * bk / 1000) * 1000 }));
    // rotate the order a little so runs differ
    const k = (Math.random() * Math.min(3, pool.length)) | 0;
    pool = pool.slice(k).concat(pool.slice(0, k));
    // 보스전: 이 층의 보스 · 중간보스 쓰러뜨리기가 맨 앞 (보너스는 쓰러뜨린 순간 따로 — BOSS_BONUS)
    if (G.mode === 'boss' && FS) {
      const head = [];
      for (const rank of ['boss', 'mid']) {
        const n = FS.npcs.find((m) => m.fighter && m.fighter.rank === rank && !m.gone);
        if (n) head.push({ id: 'beat' + rank, text: `${fight.nameOf(n)} 쓰러뜨리기`, kind: 'count', key: 'beat:' + rank, need: 1, done: false, doneAt: 0, bonus: 0, noPay: true });
      }
      pool = head.concat(pool);
    }
    C = G.chal[kind] = { pool, shown: pool.filter((t) => !t.done).slice(0, 2) };
  }
  G.taskPool = C.pool; G.taskShown = C.shown;
  refreshTasks();
}
function refreshTasks() { ui.tasks(G.taskShown.map((t) => ({ text: t.need > 1 && !t.done ? `${t.text} (${Math.min(t.need, chalProgress(t))}/${t.need})` : t.text, done: t.done, plain: true }))); }
function chalProgress(t) { const fc = G.fcounts[G.floorKind] || {}; return fc[t.key] || 0; }
function checkTasks() {
  let changed = false;
  // every challenge of the floor completes when reached (shown or not); the two chips then rotate
  for (const t of G.taskPool) {
    const p = chalProgress(t);
    if (t.need > 1 && !t.done && p !== t.shownP && G.taskShown.includes(t)) { t.shownP = p; changed = true; }
    if (!t.done && p >= t.need) {
      t.done = true; t.doneAt = G.rtime; changed = true;
      if (t.noPay) continue; // (보스전 머리 목표: 보너스는 쓰러뜨린 순간 npcKo 에서)
      const pay = Math.round(t.bonus * moneyMul());
      addMoney(t.bonus, null, true);
      addItem('목표 보너스 · ' + t.text, t.bonus);
      ui.toast(`${t.text} 달성! 보너스 +${fmt(pay)}원`, 2000);
      sfx('bonus', { vol: 0.8 });
    }
  }
  for (let i = 0; i < G.taskShown.length; i++) {
    const t = G.taskShown[i];
    if (t.done && G.rtime - t.doneAt > 1.4) {
      const next = G.taskPool.find((q) => !q.done && !G.taskShown.includes(q));
      if (next) { G.taskShown[i] = next; changed = true; } else if (G.taskShown.length > 1) { G.taskShown.splice(i, 1); changed = true; i--; }
    }
  }
  if (changed) refreshTasks();
}
function count(key, n = 1) {
  G.counts[key] = (G.counts[key] || 0) + n;
  const fc = G.fcounts[G.floorKind] || (G.fcounts[G.floorKind] = {});
  fc[key] = (fc[key] || 0) + n;
}
// challenge events: bumps `kind`, `kind:type` and `kind#tag`. value → max semantics (carStage)
function emit(kind, rec = null, n = 1, value = null) {
  const keys = [kind];
  if (rec && rec.type) keys.push(kind + ':' + rec.type);
  if (rec && rec.tag) keys.push(kind + '#' + rec.tag);
  const fc = G.fcounts[G.floorKind] || (G.fcounts[G.floorKind] = {});
  for (const k of keys) {
    if (value != null) { G.counts[k] = Math.max(G.counts[k] || 0, value); fc[k] = Math.max(fc[k] || 0, value); }
    else { G.counts[k] = (G.counts[k] || 0) + n; fc[k] = (fc[k] || 0) + n; }
  }
}
// 금액은 난이도 보상 배수(moneyMul)를 곱해 쌓는다 — 청구서 줄(addItem)과 합계(addMoney)가 같은 배수.
// raw = 이미 곱해서 넘어오는 돈 (fight.js 의 딱! 보너스)
function addItem(name, amount, people = false) {
  const it = G.items.get(name) || { name, count: 0, amount: 0, people };
  it.count++; it.amount += Math.round(amount * moneyMul()); G.items.set(name, it);
}
function addMoney(amt, worldPos, quiet = false, charge = false, label = null, raw = false) {
  if (amt <= 0) return;
  const base = amt;
  if (!raw) amt = Math.round(amt * moneyMul());
  G.money += amt;
  ui.money(G.money, G.rampage || G.mode !== 'story' ? '피해 총액' : '피해액');
  if (worldPos) { const s = toScreen(worldPos); if (s) ui.moneyPop(s.x, s.y, amt, G.combo, label); }
  if (!quiet) G.payAcc = (G.payAcc || 0) + amt; // one cha-ching per tick, sized by the tick's total (payCue)
  if (charge) G.special = Math.min(1, G.special + base / 380000);
  if (G.special >= 1 && !G.specialReadyShown) { G.specialReadyShown = true; sfx('specialReady', { vol: 0.8 }); ui.toast(TOUCH ? '필살기 준비 완료!' : 'Q 필살기 준비 완료!', 1600); }
  ui.special(G.special);
  // stress drains as damage accumulates (that is the relief)
  const relief = 100 * (1 - Math.exp(-G.money / RELIEF_K));
  setStress(100 - relief, false);
}
// a hit's share + the break's rest land in the same tick: ring once, bigMoney when the tick paid ≥ BIG_MONEY
function payCue() {
  const amt = G.payAcc || 0;
  if (amt <= 0) return;
  G.payAcc = 0;
  if (amt >= BIG_MONEY) sfx('bigMoney', { vol: 0.75, pitch: 1 + Math.min(G.combo, 16) * 0.02 });
  else sfx('coin', { vol: 0.45, pitch: 1 + Math.min(G.combo, 16) * 0.045 });
}
function alarmAt(pos, rad = 9) {
  const ctx = npcCtx();
  for (const n of G.S.npcs) if (!n.gone && n.pos.distanceTo(pos) < rad) n.alarm(ctx, pos);
}
const _c = V(), _d = V(), _cp = V(), _d2 = V();
function recPos(r, out = V()) { const p = r.body.position; return out.set(p.x, p.y, p.z); }
function hitRec(rec, dmg, dir, power, opts = {}) {
  const S = G.S, b = rec.body;
  S.touched = true;
  // wall / ceiling mounted things come loose on the first hit
  if (rec.hang && rec.fixed && (dmg > 0 || power > 1)) S.phys.release(rec);
  // fixtures don't move; cars only rock (their wreck is staged, see toys.js); a ridden thing is driven
  if (rec.fixed || rec.riding || rec.type === 'car') power = 0;
  b.wakeUp();
  if (power > 0) launch(rec, dir, power);
  rec.energized = S.phys.time + 2.5;
  const c = recPos(rec, _c);
  const direct = !!opts.direct;
  // contact point: the struck face, toward the hitter
  const ext = Math.min(0.5, Math.max(rec.hx, rec.hz)) * 0.7;
  const cp = _cp.set(c.x - dir.x * ext, clamp(c.y + 0.05, 0.3, 1.7), c.z - dir.z * ext);
  if (direct) fx.impact(cp, (opts.kick ? 1.15 : 0.85) * (rec.mass > 30 ? 1.25 : 1), !isCalm());
  const chunk = Math.min(0.1, 0.035 + Math.cbrt(Math.max(0.3, rec.mass)) * 0.014);
  if (rec.material === 'metal') fx.sparks(cp, opts.big ? 22 : 14, 5.5, dir, 1.4);
  else if (direct) fx.sparks(cp, 5, 3, dir);
  if (rec.material === 'glass') fx.shards(cp, opts.big ? 14 : 8, 2.4, dir, 0.04);
  fx.debris(c, rec.colors, opts.big ? 10 : 6, 2.6, chunk, dir.lengthSq() > 0.01 ? dir : null);
  if (PAPERY.has(rec.type)) count('paper', fx.papers(V(c.x, c.y + 0.3, c.z), rec.type === 'printer' ? 6 : 3, 2.0));
  sfx(hitSfxName(rec), { vol: opts.vol || 0.8, pitch: rnd(0.9, 1.1) });
  popRec(rec, direct ? (opts.kick ? 0.26 : 0.18) : power > 0 || dmg > 0 ? 0.1 : 0);
  if (rec.type === 'chair' && !rec.kicked) { rec.kicked = true; count('chairHit'); }
  if (rec.type === 'cafeChair' && !rec.kicked) { rec.kicked = true; count('cafeChairHit'); }
  if ((rec.type === 'sofa' || rec.type === 'sofaYellow') && !rec.kicked) { rec.kicked = true; count('sofaHit'); }
  if (rec.type === 'stanchion' && !rec.kicked) { rec.kicked = true; count('stanchion'); }
  if (rec.material === 'plant' && opts.kick && !rec.kicked) { rec.kicked = true; count('plantKick'); }
  if (!rec.hitOnce && (dmg > 0 || power > 0.5)) { rec.hitOnce = true; emit('hit', rec); }
  if (!rec.destroyed) {
    const before = rec.hp;
    rec.hp -= dmg;
    if (direct) bumpCombo();
    if (dmg > 0) toys.afterHit(rec); // (car: updates its damage stage first — the car pays by stage)
    let amt;
    if (rec.type === 'car') amt = Math.max(0, Math.round(rec.price * CAR_STAGE_PAY[clamp(rec.stage | 0, 0, 3)]) - rec.paid);
    else {
      const share = rec.price * 0.5;
      amt = Math.min(Math.round(share * Math.min(dmg, before) / rec.hpMax), Math.max(0, Math.round(share) - rec.paid));
    }
    rec.paid += amt;
    if (amt > 0) addMoney(amt, V(c.x, c.y + rec.hy + 0.2, c.z), false, direct);
    if (rec.hp <= 0) destroyRec(rec, dir, { charge: direct });
  }
  alarmAt(c, 9);
  if (opts.shake !== false) shake((direct ? 0.24 : 0.14) + Math.min(0.5, rec.mass / 150) + (opts.kick ? 0.1 : 0));
  if (direct) {
    // a break / big break on this very hit already set a longer stop in destroyRec
    hitStop(opts.kick || opts.big ? 'kick' : 'punch');
    camKick(dir, opts.kick ? 0.17 : 0.1);
    vibrate(rec.mass > 10 ? 25 : 12);
  }
}
// impulse from a hit: horizontal speed falls with mass (a kicked chair skids across the room, a punched monitor
// leaves the desk, a printer only shifts), plus a hop and a forward tumble
function launch(rec, dir, power) {
  const S = G.S, b = rec.body, m = clamp(rec.mass, 0.15, 160), light = m < 20;
  // (tables / desks only shove a little: they stay flippable and in reach)
  const vh = clamp(power * 4.6 / Math.pow(Math.max(0.2, m) / 5, 0.45), 0.25, 9) * (flippable(rec) && !light ? 0.45 : 1);
  // just knocked off a wall: a push toward the wall bounces back into the room instead
  const wn = rec.wallN;
  if (wn && wn.until > S.phys.time) {
    const dn = dir.x * wn.x + dir.z * wn.z;
    if (dn < 0) { dir = _d2.set(dir.x - wn.x * dn * 1.6, 0, dir.z - wn.z * dn * 1.6); if (dir.lengthSq() < 1e-4) dir.set(wn.x, 0, wn.z); dir.normalize(); }
  }
  b.velocity.x += dir.x * vh; b.velocity.z += dir.z * vh;
  b.velocity.y += light ? 1.3 + vh * 0.3 : 0.4 + vh * 0.12;
  // tumble forward (axis = up × dir) + wobble; rolling things (chairs, carts) skid and spin instead
  const roll = !!RIDE[rec.type];
  // heavy furniture slides and rocks rather than tumbling (a punched desk stays flippable)
  const spin = vh * (roll ? 0.25 : light ? 2.2 : flippable(rec) ? 0.15 : 0.4);
  b.angularVelocity.x += dir.z * spin + rnd(-1, 1) * spin * 0.35;
  b.angularVelocity.y += rnd(-1, 1) * (roll ? vh * 1.4 : spin * 0.5);
  b.angularVelocity.z += -dir.x * spin + rnd(-1, 1) * spin * 0.35;
  S.phys.wakeNear(b.position.x, b.position.y, b.position.z, Math.max(rec.hx, rec.hz) + 0.3, rec);
}
function breakSfx(rec) {
  if (rec.prop.floats) return false;
  const n = rec.type in TYPE_BREAK ? TYPE_BREAK[rec.type] : BREAK_SFX[rec.material] || 'breakPlastic';
  if (n) sfx(n, { vol: 0.85, pitch: rnd(0.92, 1.08) });
  if (n === 'paper') sfx('hitPaper', { vol: 0.7 });
  if (rec.material === 'plant') sfx('hitPlant', { vol: 0.7 });
  const big = rec.type === 'car' || rec.mass >= 35 || rec.price >= 100000 || (rec.fixed && rec.hpMax >= 4);
  if (big && n !== 'crash') sfx('crash', { vol: 0.7, pitch: rnd(0.9, 1.05) });
  return big;
}
function destroyRec(rec, dir, { flip = false, charge = false } = {}) {
  if (rec.destroyed) return;
  rec.destroyed = true;
  if (rec.inst) rec.inst(rec); // fixtures never moved, so they may still be in the instanced batch
  const rest = Math.max(0, rec.price - rec.paid);
  rec.paid = rec.price;
  addItem(rec.name, rec.price);
  const c = recPos(rec, V());
  if (rest > 0) addMoney(rest, V(c.x, c.y + rec.hy + 0.35, c.z), false, charge || flip);
  count(rec.type);
  if (!flip) emit('break', rec);
  if (rec.type === 'icedCoffee' || rec.type === 'hotCoffee') count('coffee');
  if (rec.type === 'coffeeTray') count('coffee', 6);
  if (rec.type === 'mug') count('coffee');
  let keepLook = false;
  if (!flip) {
    const big = breakSfx(rec);
    const d = dir && dir.lengthSq() > 0.01 ? dir : null;
    const heavy = rec.mass > 15 || rec.fixed;
    fx.debris(c, rec.colors, heavy ? 24 : 14, 3.4, Math.min(0.14, 0.045 + Math.cbrt(Math.max(1, rec.mass)) * 0.018), d);
    if (rec.material === 'metal') fx.sparks(c, 26, 6.5, d, 1.5);
    else fx.sparks(c, 8, 4.5, d);
    if (rec.material === 'glass') fx.shards(V(c.x, c.y + rec.hy * 0.5, c.z), heavy ? 30 : 18, 3, d, heavy ? 0.06 : 0.045);
    if (heavy) fx.dustRing(c, Math.min(1.4, 0.5 + Math.max(rec.hx, rec.hz)), 12);
    if (PAPERY.has(rec.type)) count('paper', fx.papers(V(c.x, c.y + 0.4, c.z), rec.type === 'printer' || rec.type === 'cabinetTall' ? 12 : 8, 2.8));
    fx.impact(V(c.x, clamp(c.y + 0.1, 0.4, 1.8), c.z), big ? 1.8 : 1.25, !isCalm());
    try { keepLook = toys.onDestroy(rec); } catch (e) { report(e); }
    floorHook(G.S, 'onDestroy', rec);
    if (BIG_MOMENT.has(rec.type) || rec.rawPrice >= 1500000) bigMoment('crash', rec.type === 'car' ? 9 : 7);
    else if (charge) { hitStop(big ? 'crash' : 'break'); shake(big ? 0.75 : 0.4); }
  }
  const remove = rec.prop.floats || (!rec.fixed && rec.mass < 15 && !rec.heavy);
  if (remove && !flip) {
    G.removeQ.push(rec);
  } else if (!flip && !keepLook) {
    // keep the wreck, a little darker
    rec.group.traverse((m) => {
      if (!m.isMesh || !m.material || Array.isArray(m.material)) return;
      let w = WRECK.get(m.material);
      if (!w) { w = m.material.clone(); if (w.color) w.color.multiplyScalar(0.62); WRECK.set(m.material, w); }
      m.material = w;
    });
  }
}
const WRECK = new Map();
G.removeQ = [];
// (called from inside the physics step: only queue things here)
function onImpact(rec, other, v) {
  if (!G.rampage) return;
  const t = G.S.phys.time;
  // a flipped desk slamming down / heavy things landing: dust (+ the flip's big moment)
  if ((rec.flipPending && t - rec.flipAt > 0.12 && v > 2.2) || (rec.mass >= 15 && v > 3.4 && !(rec.dustCool > t))) {
    rec.dustCool = t + 0.6;
    if (G.lands.length < 8) G.lands.push(rec);
  }
  if (rec.cool > t) return;
  const charged = rec.energized > t || (other && other.energized > t);
  if (!charged || v < 5.2) return;
  rec.cool = t + 0.35;
  G.impacts.push([rec, v]);
}
G.lands = [];
function flushImpacts() {
  if (G.lands.length) {
    for (const rec of G.lands) {
      if (rec.removed) continue;
      const p = rec.body.position;
      if (rec.flipPending) flipLanded(rec);
      else fx.dustRing(_c.set(p.x, 0, p.z), Math.min(1.2, 0.35 + Math.max(rec.hx, rec.hz) * 0.7), 9);
    }
    G.lands.length = 0;
  }
  if (!G.impacts.length) return;
  const list = G.impacts; G.impacts = [];
  for (const [rec, v] of list) {
    if (rec.removed) continue;
    hitRec(rec, v > 9 ? 2 : 1, _d.set(0, 0, 0), 0, { vol: clamp(v / 12, 0.3, 0.8), shake: false });
  }
}
function flipLanded(rec) {
  if (!rec.flipPending) return;
  rec.flipPending = false;
  const p = rec.body.position;
  sfx('crash', { vol: 0.85 });
  fx.dustRing(_c.set(p.x, 0, p.z), Math.min(1.5, 0.6 + Math.max(rec.hx, rec.hz)), 14);
  fx.debris(_c.set(p.x, 0.3, p.z), rec.colors, 10, 2.6, 0.06);
  bigMoment('flip', 6);
  alarmAt(_c, 10);
}
function flushRemovals() {
  if (!G.removeQ.length) return;
  for (const r of G.removeQ) { if (P.held === r) continue; G.S.phys.remove(r); }
  G.removeQ.length = 0;
}

// ---- targeting
function facing() { return V(Math.sin(P.yaw), 0, Math.cos(P.yaw)); }
function pickTarget(range, includeNpc = true) {
  const S = G.S, f = facing();
  let best = null, bs = 1e9, kind = null;
  for (const r of S.phys.records) {
    if (r.removed || r.held || r.riding || r.out || r.destroyed && r.mass < 15) continue;
    const p = r.body.position;
    // too high to punch — unless it reaches down to arm height (tall curtains, a big screen on the stage)
    if (p.y > (r.hang ? 2.8 : 2.2) && p.y - r.hy > 1.5) continue;
    const dx = p.x - P.pos.x, dz = p.z - P.pos.z;
    const reach = range + Math.min(0.6, Math.max(r.hx, r.hz) * 0.7);
    const d = Math.hypot(dx, dz);
    if (d > reach) continue;
    const a = d > 0.01 ? Math.acos(clamp((dx * f.x + dz * f.z) / d, -1, 1)) : 0;
    if (a > 1.25 && d > 0.8) continue;
    let s = d + a * 0.9 + (r.destroyed ? 1.5 : 0) + (r.price <= 0 ? 2 : 0);
    if (s < bs) { bs = s; best = r; kind = 'rec'; }
  }
  if (includeNpc) for (const n of S.npcs) {
    if (!n.targetable || n.role === 'walker' || n.role === 'barista' && n.seated) continue;
    // a body on the floor is reached at its middle; it loses to anything else in reach
    const ko = n.lying || n.isKo;
    if (ko) n.anchors();
    const px = ko ? n.chest.x : n.pos.x, pz = ko ? n.chest.z : n.pos.z;
    const dx = px - P.pos.x, dz = pz - P.pos.z, d = Math.hypot(dx, dz);
    if (d > range + 0.2) continue;
    const a = d > 0.01 ? Math.acos(clamp((dx * f.x + dz * f.z) / d, -1, 1)) : 0;
    if (a > 1.0 && d > 0.7) continue;
    const s = d + a * 0.9 + (ko ? 0.9 : 0.35);
    if (s < bs) { bs = s; best = n; kind = 'npc'; }
  }
  return best ? { kind, t: best } : null;
}
function aimAt(p) { P.yaw = Math.atan2(p.x - P.pos.x, p.z - P.pos.z); }
function attack(kind) {
  if (P.attackT > 0 || P.seated || G.busy || !P.controls && G.rampage === false) return;
  if (!fight.canAttack()) return; // guarding (arms up) / flat on the floor
  if (G.canDamage && toys.attack(kind)) return; // riding (forklift fork) or swinging a held weapon
  if (P.held) { throwHeld(); return; }
  if (P.carryNpc) { if (G.canDamage) releaseNpc(true); return; }
  if (P.carry) return;
  if (!G.canDamage) {
    // story: a frustrated air punch, no damage
    P.char.playOnce(kind === 'kick' ? 'kick' : 'punch');
    sfx(kind === 'kick' ? 'whooshKick' : 'whooshPunch', { vol: 0.5 });
    setFace('endure', 0.9);
    P.attackT = 0.45;
    return;
  }
  const range = kind === 'kick' ? 1.75 : 1.6;
  const tg = pickTarget(range);
  if (tg) aimAt(tg.kind === 'rec' ? tg.t.body.position : tg.t.pos);
  P.swing ^= 1;
  P.char.playOnce(kind === 'kick' ? 'kick' : P.swing ? 'punch' : 'punchL');
  sfx(kind === 'kick' ? 'whooshKick' : 'whooshPunch', { vol: 0.5 });
  P.attackT = kind === 'kick' ? 0.46 : 0.3;
  after(kind === 'kick' ? 0.19 : 0.11, () => resolveHit(kind));
}
function resolveHit(kind) {
  if (!G.canDamage || !G.S) return;
  const tg = pickTarget(kind === 'kick' ? 2.0 : 1.85);
  // a window right in front of you (and nothing closer) shatters
  if (!tg || (tg.kind === 'rec' && Math.hypot(tg.t.body.position.x - P.pos.x, tg.t.body.position.z - P.pos.z) > 1.3)) { if (toys.punchWindow(1.25)) return; }
  if (!tg) return;
  const power = kind === 'kick' ? 2.3 : 1.25;
  if (tg.kind === 'npc') {
    const n = tg.t;
    const dir = V(n.pos.x - P.pos.x, 0, n.pos.z - P.pos.z);
    if (dir.lengthSq() < 1e-4) dir.copy(facing()); dir.normalize();
    sfx(kind === 'kick' ? 'kick' : 'punch', { vol: 0.8 });
    hitPerson(n, dir, kind === 'kick' ? 'kick' : 'punch', { direct: true });
    return;
  }
  const r = tg.t;
  const dir = V(r.body.position.x - P.pos.x, 0, r.body.position.z - P.pos.z);
  if (dir.lengthSq() < 1e-4) dir.copy(facing()); dir.normalize();
  sfx(kind === 'kick' ? 'kick' : 'punch', { vol: 0.65 });
  hitRec(r, kind === 'kick' ? 2 : 1, dir, power, { direct: true, kick: kind === 'kick', big: kind === 'kick' });
}
// ---- people: 멘탈 hits → 깨꼬닥 (KO), payouts, domino, carrying a KO'd body ---------------------------------
// kind → [fly-back power, 멘탈 cost] (kick / special / a flung desk > punch); coworkers have 3, bosses / security 5
const PERSON_HIT = {
  punch: [0.55, 1], kick: [1.25, 2], weapon: [0.8, 1], special: [1.5, 3], thrown: [0.9, 1], ram: [1.1, 2],
  domino: [0.8, 1], blast: [1.2, 2], shout: [0.35, 1], spray: [0.3, 1], knock: [1.0, 1],
};
// KO pay: a coworker ≈ a mid-size prop (치료비), the boss / CEO a jackpot (위자료); a repeat KO of the same person pays ¼
const KO_PAY = { worker: 20000, guard: 40000, exec: 40000, boss: 120000, ceo: 120000, mid: 60000 };
function koPayOf(n) { return n.fighter && n.fighter.rank === 'mid' ? KO_PAY.mid : KO_PAY[n.role] || KO_PAY.worker; }
// 보스 / 중간보스 lines carry their (player-chosen) names: "김부장 기절 — 위자료"
function koLabel(n) { return n.fighter && (n.fighter.rank === 'boss' || n.fighter.rank === 'mid') ? fight.nameOf(n) + ' 위자료' : n.role === 'boss' || n.role === 'ceo' || n.role === 'exec' ? '위자료' : '치료비'; }
function koBillLine(n) {
  if (n.fighter && (n.fighter.rank === 'boss' || n.fighter.rank === 'mid')) return fight.nameOf(n) + ' 기절 — 위자료';
  if (n.role === 'ceo' || n.spec.name === 'ceo') return '사장님 기절 — 위자료';
  if (n.role === 'boss') return '부장님 기절 — 위자료';
  if (n.role === 'exec') return '기절시킨 임원 — 위자료';
  if (n.role === 'guard') return '기절시킨 경비원 — 치료비';
  return '기절시킨 직원 — 치료비';
}
const _hp = V(), _bv = V();
// every hit on a person goes through here (fists, kicks, weapons, rides, the special, flung props, flying people…)
function hitPerson(n, dir, kind = 'punch', o = {}) {
  if (!n || n.gone || !G.S) return 0;
  const k = PERSON_HIT[kind] || PERSON_HIT.knock;
  const power = o.power != null ? o.power : k[0], dmg = o.dmg != null ? o.dmg : k[1];
  const chair = n.seated && n.seat && n.seat.chair && n.seat.chair.rec;
  const r = n.hit(npcCtx(), dir, power, dmg, kind);
  if (!r) return 0;
  if (r === 1 && n.hothead) fight.anger(n); // "참을 만큼 참았어요!" — this one fights back from now on
  const direct = !!o.direct, soft = kind === 'shout' || kind === 'spray';
  // knocked off the chair: the chair skids away too
  if (chair && !chair.removed && !soft) hitRec(chair, 0, dir, 1.3, { shake: false, vol: 0.5 });
  if (r !== 3) emit('knock');
  if (direct || kind === 'special') bumpCombo();
  const hp = _hp.set(n.pos.x - dir.x * 0.15, n.y + (r === 3 ? 0.3 : 1.0) * n.sc, n.pos.z - dir.z * 0.15);
  if (r === 3) sfx('bonk', { vol: 0.55, pitch: rnd(0.9, 1.15) });
  else if (!soft) { sfx('hitSoft', { vol: 0.65 }); if (!direct) sfx('punch', { vol: 0.45, pitch: 0.85 }); }
  if (!soft) { fx.impact(hp, (kind === 'kick' || kind === 'special' ? 1.2 : 0.95) * (r === 3 ? 0.7 : 1), !isCalm()); fx.sparks(hp, 5, 3, dir); }
  if (direct) {
    shake(r === 3 ? 0.2 : 0.4); camKick(dir, kind === 'kick' ? 0.16 : 0.1); vibrate(r === 2 ? 40 : 15);
    if (r !== 2) hitStop(kind === 'kick' ? 'kick' : 'punch');
  } else if (r !== 3 && o.shake !== false && !soft) shake(0.3);
  if (r === 2) koHit(n, dir);
  if (r !== 3) alarmAt(n.pos, 9);
  return r;
}
// the blow that knocks someone out: a beat of hang-time, then the twirl + flop (npcKo 'land' pays)
function koHit(n, dir) {
  const calm = isCalm(), vip = n.vip;
  const stop = vip ? HITSTOP.special : HITSTOP.crash;
  hitStop(stop);
  const sl = calm ? 0.1 : vip ? 0.75 : 0.32, sc = vip ? 0.3 : 0.4;
  slowMo(sl, sc); fovPunch(vip ? 6 : 3); shake(vip ? 0.8 : 0.55);
  // real seconds until the body meets the floor (the slide-whistle's thud lands there)
  const air = n.airT, slowPart = Math.min(sl, air / sc);
  const at = (calm ? 0.03 : stop) + slowPart + Math.max(0, air - slowPart * sc);
  sfx('ko', { vol: 0.85, at: clamp(at, 0.3, 1.4) });
  if (vip && n.char.hasGlasses) {
    // the boss's glasses fly off and land nearby (back on when he wakes)
    n.char.setGlasses(false);
    const gl = makeGlasses();
    fx.toss(gl, _c.set(n.pos.x, n.y + 1.2 * n.sc, n.pos.z), V(dir.x * 2.2 + rnd(-0.8, 0.8), 3.6, dir.z * 2.2 + rnd(-0.8, 0.8)), 12, G.S.F.group);
    n._glasses = gl;
  }
}
let GLASSES = null;
function makeGlasses() {
  if (!GLASSES) {
    const m = new THREE.MeshStandardMaterial({ color: '#2a2220', roughness: 0.4 });
    const g = new THREE.Group(), inner = new THREE.Group(); inner.rotation.x = -PI / 2; inner.position.y = 0.012; g.add(inner);
    const ring = new THREE.TorusGeometry(0.052, 0.008, 4, 14);
    for (const s of [1, -1]) { const r = new THREE.Mesh(ring, m); r.position.x = s * 0.06; inner.add(r); }
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 5), m); br.rotation.z = PI / 2; inner.add(br);
    for (const s of [1, -1]) { const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.15, 4), m); tp.rotation.x = PI / 2; tp.position.set(s * 0.11, 0, -0.07); inner.add(tp); }
    inner.traverse((x) => { if (x.isMesh) x.castShadow = true; });
    GLASSES = g;
  }
  return GLASSES.clone();
}
// NPC landing (bounce / first touch): dust, thump
function npcLand(n, phase, hs) {
  fx.dustRing(_c.set(n.pos.x, 0, n.pos.z), clamp(0.35 + hs * 0.08, 0.4, 1.0), phase === 'bounce' ? 10 : 7);
  sfx('land', { vol: clamp(0.3 + hs * 0.06, 0.3, 0.75), pitch: rnd(0.75, 0.9) });
  if (hs > 4 && G.S) shake(0.25);
}
// KO lifecycle hooks from npc.js: 'land' (out cold → pay), 'ghost', 'glasses', 'wake', 'dizzy', 'trip'
function npcKo(n, phase) {
  if (phase === 'land') {
    fx.koStars(n);
    if (n.vip) n.char.setTieFlop(1);
    const first = n.koCount === 1, full = koPayOf(n), amt = first ? full : Math.round(full / 4000) * 1000;
    if (G.canDamage && amt > 0) {
      n.anchors();
      addMoney(amt, _hp.set(n.head.x, n.head.y + 0.6, n.head.z), false, true, koLabel(n));
      addItem(koBillLine(n), amt, true);
      bumpCombo();
    }
    count('koAll');
    if (first) { count('ko'); emit('ko', { type: n.role }); }
    if (first) bossBeaten(n);
    n.say(n.vip ? pickOne(['연봉… 올려… 줄게…', '휴가… 다 써도… 돼…', '자네… 승진… 이야…']) : pickOne(['꼬르륵…', '깨꼬닥…', '…(꽥)', '퇴근… 하고… 싶다…']), n.vip ? 3.6 : 2.8, G.rtime);
    if (n.vip) { n.char.setFace('ko'); bigMoment('crash', 4); }
    // witnesses gasp
    const ctx = npcCtx();
    let gasps = 0;
    for (const m of G.S.npcs) {
      if (m === n || m.gone || m.pos.distanceTo(n.pos) > 7) continue;
      if (m.witness(ctx, n.pos) && gasps < 2 && Math.random() < 0.7) { gasps++; sfx('gasp', { vol: 0.45, pitch: rnd(0.95, 1.3) }); }
    }
  } else if (phase === 'ghost') { fx.ghost(n); sfx('soul', { vol: 0.5 }); }
  else if (phase === 'wake') { n.char.setTieFlop(0); sfx('soulBack', { vol: 0.45 }); }
  else if (phase === 'glasses') { if (n._glasses) { fx.untoss(n._glasses); n._glasses = null; } n.char.setGlasses(true); }
  else if (phase === 'dizzy') fx.koStars(n);
  else if (phase === 'keep') { if (n.starsOn) fx.koStars(n); if (n.ghostOn) fx.ghost(n); }
  else if (phase === 'trip') count('trip');
}
// 보스 · 중간보스를 처음 쓰러뜨림 (보스전 · 레벨): 격파 보너스 + 보스전 목표 칸
function bossBeaten(n) {
  const rank = n.fighter && n.fighter.rank;
  if (rank !== 'boss' && rank !== 'mid') return;
  if (!(G.mode === 'boss' || (G.mode === 'story' && G.level)) || !G.canDamage) return;
  const nm = fight.nameOf(n), amt = BOSS_BONUS[rank];
  count('beat:' + rank);
  addMoney(amt, null, true); addItem(`${nm} 격파 보너스`, amt);
  G.beaten = (G.beaten || 0) + 1;
  ui.banner(`${nm} 격파!`, `보너스 +${fmt(amt * moneyMul())}원`, 1700);
  sfx('bonus', { vol: 0.9 }); sfx('comboUp', { vol: 0.6 });
  if (G.mode === 'boss' && G.S && !G.S.npcs.some((m) => m.fighter && (m.fighter.rank === 'boss' || m.fighter.rank === 'mid') && !m.beaten && !m.isKo && !m.gone)) after(1.9, () => G.rampage && ui.toast('둘 다 쓰러뜨렸다! 남은 시간은 마음껏 부수기', 2400));
}
const pickOne = (a) => a[(Math.random() * a.length) | 0];
function npcGround(x, z) { const F = G.S && G.S.F; return F && F.grounds.length ? groundAt(F, x, z) : 0; }
// people (flying, sliding, thrown) never leave the floor: room bounds + out-zones (windows / roof edges)
function keepNpcIn(pos, r) {
  const F = G.S && G.S.F; if (!F) return;
  const b = F.bounds, m = r + 0.05;
  if (pos.x < b.minX + m) pos.x = b.minX + m; else if (pos.x > b.maxX - m) pos.x = b.maxX - m;
  if (pos.z < b.minZ + m) pos.z = b.minZ + m; else if (pos.z > b.maxZ - m) pos.z = b.maxZ - m;
  for (const Z of F.outZones) {
    const a = Z.axis === 'z' ? pos.x : pos.z;
    if (a < Z.from - 0.3 || a > Z.to + 0.3) continue;
    const c = Z.axis === 'z' ? pos.z : pos.x, d = (c - Z.at) * Z.side;
    if (d > -m && d < 3) { const v = Z.at - Z.side * m; if (Z.axis === 'z') pos.z = v; else pos.x = v; }
  }
}
// flying people knock over whoever is in the way (each takes a 멘탈 hit; the flyer slows down)
function updateDomino() {
  const S = G.S;
  for (const a of S.npcs) {
    if (a.state !== 'air' || a.gone || a.y > 1.4 || a.trip_) continue; // (a trip is just a stumble)
    const v2 = a.vel.x * a.vel.x + a.vel.z * a.vel.z; if (v2 < 9) continue;
    for (const b of S.npcs) {
      if (b === a || !b.targetable || b.state === 'air' || b.isKo) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.r + b.r + 0.08;
      if (dx * dx + dz * dz > rr * rr) continue;
      const sp = Math.sqrt(v2);
      _d.set(a.vel.x / sp, 0, a.vel.z / sp);
      if (hitPerson(b, _d, 'domino', { power: clamp(0.45 + sp * 0.09, 0.7, 1.2) })) {
        a.vel.x *= 0.5; a.vel.z *= 0.5;
        count('domino'); emit('domino');
        break;
      }
    }
  }
}
// E 들기 on a KO'd body: carry it like a log, click / E to fling it (it stays out cold; walls + out-zones stop it)
function koCandidate(f) {
  let best = null, bs = 1e9;
  for (const n of G.S.npcs) {
    if (n.gone || n.state !== 'ko') continue;
    n.anchors();
    const cx = n.chest.x, cz = n.chest.z, dx = cx - P.pos.x, dz = cz - P.pos.z, d = Math.hypot(dx, dz);
    if (d > 1.5) continue;
    const a = d > 0.01 ? Math.acos(clamp((dx * f.x + dz * f.z) / d, -1, 1)) : 0;
    if (a > 1.2 && d > 0.6) continue;
    const s = d + a * 0.8;
    if (s < bs) { bs = s; best = n; }
  }
  if (!best) return null;
  const n = best;
  return { id: 'npc' + n.id, pos: V(n.chest.x, 0, n.chest.z), h: 0.9, obj: null, text: '들기', hold: 0, range: 99, score: bs, onDone: () => carryNpc(n) };
}
function carryNpc(n) {
  if (P.held || P.carry || !n.pickUp()) return;
  n._home = n.group.parent;
  P.char.hold(n.group, { both: true });
  n.group.position.set(0.62 * n.sc, -0.12, 0.1); n.group.rotation.set(0, PI / 2, 0);
  P.carry = n.group; P.carryKind = 'person'; P.carryNpc = n;
  P.char.playOnce('take');
  sfx('pickup', { vol: 0.6, pitch: 0.7 }); sfx('bonk', { vol: 0.35, pitch: 0.8 });
  count('carry'); emit('carry');
  n.say(pickOne(['…(축)', '…zzZ', '…으음']), 1.6, G.rtime);
}
function releaseNpc(throwIt) {
  const n = P.carryNpc; if (!n) return;
  P.carryNpc = null; P.carry = null; P.carryKind = null;
  if (n.group.parent) n.group.parent.remove(n.group);
  n.group.position.set(0, 0, 0); n.group.rotation.set(0, n.yaw, 0);
  (n._home || (G.S && G.S.F.group)).add(n.group);
  const f = facing();
  const x = P.pos.x + f.x * 0.45, z = P.pos.z + f.z * 0.45;
  if (throwIt) {
    n.throwLimp(x, P.y + 0.9, z, f.x * 7.5, 2.8, f.z * 7.5, P.yaw + PI / 2);
    P.char.playOnce('smash'); sfx('whooshKick', { vol: 0.8 });
    P.attackT = 0.4; count('throwPerson'); emit('throwPerson');
  } else n.throwLimp(x, P.y + 0.5, z, f.x * 0.5, 0.5, f.z * 0.5, P.yaw + PI / 2);
  keepNpcIn(n.pos, n.r);
}
function flipDesk(rec) {
  const S = G.S;
  if (rec.flipped || rec.removed) return;
  rec.flipped = true;
  const b = rec.body;
  const d = V(b.position.x - P.pos.x, 0, b.position.z - P.pos.z);
  if (d.lengthSq() < 1e-4) d.copy(facing()); d.normalize();
  aimAt(b.position);
  P.char.playOnce('flip');
  b.wakeUp();
  b.velocity.set(d.x * 3.1, 4.8, d.z * 3.1);
  b.angularVelocity.set(d.z * 7.2, rnd(-1, 1), -d.x * 7.2);
  rec.energized = S.phys.time + 3;
  // everything on top flies
  const R = { x: b.position.x, z: b.position.z, hx: rec.hx + 0.12, hz: rec.hz + 0.12, rot: 0 };
  const q = b.quaternion; const yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
  R.c = Math.cos(yaw); R.s = Math.sin(yaw);
  for (const r of S.phys.records) {
    if (r === rec || r.removed || r.held) continue;
    const p = r.body.position;
    if (p.y < 0.6 || p.y > 1.8 || !pointInRect(R, p.x, p.z, 0)) continue;
    r.body.wakeUp();
    r.body.velocity.set(d.x * rnd(1.5, 4) + rnd(-1, 1), rnd(3, 6.5), d.z * rnd(1.5, 4) + rnd(-1, 1));
    r.body.angularVelocity.set(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
    r.energized = S.phys.time + 3;
  }
  sfx('flip', { vol: 0.9 });
  // the slam is felt when it lands (onImpact → flipLanded); fallback if the landing is too soft to register
  rec.flipPending = true; rec.flipAt = S.phys.time;
  after(1.1, () => { if (rec.flipPending && G.S === S) flipLanded(rec); });
  const c = recPos(rec, V());
  count('paper', fx.papers(V(c.x, 1.0, c.z), 12, 2.6));
  fx.debris(c, rec.colors, 8, 2.8, 0.055, d);
  fx.impact(V(c.x, 0.9, c.z), 1.3, !isCalm());
  destroyRec(rec, d, { flip: true });
  emit('flip', rec); // counts 'flip', 'flip:<type>'
  bumpCombo();
  shake(0.5); hitStop('kick'); camKick(d, 0.14);
  vibrate(45);
  alarmAt(c, 10);
}
function pickUp(rec) {
  const S = G.S;
  if (rec.removed || rec.held) return;
  S.phys.detach(rec);
  rec.group.matrixAutoUpdate = true;
  const both = !WEAPON[rec.type] && (rec.mass > 2.5 || rec.prop.size.y > 0.4);
  P.char.hold(rec.group, { both });
  if (!both) rec.group.position.set(0, -0.05, 0.02);
  P.held = rec; P.heldBoth = both;
  P.char.playOnce('take');
  sfx('pickup', { vol: 0.6 });
}
function throwHeld() {
  const S = G.S, rec = P.held;
  if (!rec) return;
  P.held = null;
  const wp = V(); rec.group.getWorldPosition(wp);
  if (rec.group.parent) rec.group.parent.remove(rec.group);
  S.F.group.add(rec.group);
  rec.group.matrixAutoUpdate = false;
  const f = facing();
  // released at shoulder height (clears 0.4–0.8 m sills and the roof parapet) with a slight upward arc;
  // facing a window / out-zone: aim at the middle of the nearest pane (not its mullion) with a ballistic arc
  const y0 = Math.min(G.S.F.ceilY - 0.35, P.y + 1.4);
  const o = V(P.pos.x + f.x * 0.35, y0, P.pos.z + f.z * 0.35);
  const H = 11, aim = throwAim(o, f);
  let vy = 2.4;
  if (aim) {
    f.set(aim.x - o.x, 0, aim.z - o.z); const d = f.length(); f.multiplyScalar(1 / d);
    const t = d / H; vy = clamp((aim.y - o.y + 0.5 * 13 * t * t) / t, 1.2, 6);
    P.yaw = Math.atan2(f.x, f.z);
  }
  S.phys.reattach(rec, o, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, P.yaw, 0)));
  rec.body.velocity.set(f.x * H, vy, f.z * H);
  rec.body.angularVelocity.set(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
  rec.energized = S.phys.time + 3;
  syncRec(rec);
  P.char.playOnce(P.heldBoth ? 'smash' : 'punch');
  sfx('whooshKick', { vol: 0.7 });
  P.attackT = 0.35;
}
// throw aim-assist: when the player faces a window row or an out-zone (roof edge) within 8 m and ~50°, return a
// point just past it — the centre of the nearest pane (broken ones preferred) at a height that clears the sill
function throwAim(o, f) {
  const F = G.S && G.S.F; if (!F) return null;
  let best = null, bd = 1e9;
  const test = (axis, at, side, bays, from, to, y) => {
    const fc = (axis === 'z' ? f.z : f.x) * side;
    if (fc < 0.64) return;
    const dist = (at - (axis === 'z' ? o.z : o.x)) * side;
    if (dist < 0.25 || dist > 8) return;
    const t = dist / fc, a = axis === 'z' ? o.x + f.x * t : o.z + f.z * t;
    let ta;
    if (bays && bays.length) {
      let bb = null, bs = 1e9;
      for (const b of bays) { const s = Math.abs((axis === 'z' ? b.x : b.z) - a) - (b.intact ? 0 : 0.35); if (s < bs) { bs = s; bb = b; } }
      if (!bb || bs > 1.3) return;
      ta = axis === 'z' ? bb.x : bb.z;
    } else {
      if (from == null || a < from - 0.4 || a > to + 0.4) return;
      ta = clamp(a, from + 0.3, to - 0.3);
    }
    const score = dist - (bays ? 0.05 : 0);
    if (score >= bd) return;
    bd = score;
    best = axis === 'z' ? V(ta, y, at + side * 0.4) : V(at + side * 0.4, y, ta);
  };
  for (const W of F.windows) test(W.axis, W.at, W.side, W.bays, null, null, Math.min(W.y1 - 0.25, W.y0 + 0.6));
  for (const Z of F.outZones) test(Z.axis, Z.at, Z.side, null, Z.from, Z.to, 1.55);
  return best;
}
function special() {
  if (!G.canDamage || P.seated || !fight.canAttack()) return;
  if (toys.special()) return; // megaphone: Q shouts
  if (G.special < 1) return;
  G.special = 0; G.specialReadyShown = false; ui.special(0);
  count('special');
  P.char.playOnce('special');
  // the sfx's riser lands its boom SPECIAL_AT seconds after the call: shockwave, shake, hit-stop and damage
  // fire on that same tick (timers run on the unscaled game clock, so the wind-up slow-mo doesn't shift it)
  sfx('special', { vol: 0.9, at: SPECIAL_AT });
  G.slowT = SPECIAL_AT; G.slowScale = 0.45;
  ui.windup(SPECIAL_AT * 1000);
  shake(0.25);
  const gen = G.gen;
  after(SPECIAL_AT, () => {
    if (gen !== G.gen || !G.S) return;
    const S = G.S, c = P.pos.clone();
    G.lastShock = { t: +G.rtime.toFixed(3), f: G.frames };
    fx.shockwave(c, 6.5);
    fx.impact(V(c.x, 1.0, c.z), 3.2, !isCalm());
    fx.dustRing(c, 1.6, 16);
    shake(1.2); bigMoment('special', 10);
    vibrate(120);
    for (const r of S.phys.records) {
      if (r.removed || r.held || r.riding || r.out) continue;
      const p = r.body.position;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d > 6.2) continue;
      const dir = d > 0.01 ? V(dx / d, 0, dz / d) : V(1, 0, 0);
      const k = 1 - d / 6.5;
      hitRec(r, r.type === 'car' ? 3 : 1, dir, 2.2 + k * 3.2, { shake: false, vol: 0.35 });
    }
    // windows within reach shatter too
    for (const W of S.F.windows) for (const b of W.bays) if (b.intact && Math.hypot(b.x - c.x, b.z - c.z) < 4.5) toys.breakBay(S, W, b, true);
    for (const n of S.npcs) {
      if (n.gone || n.state === 'carried') continue;
      const d = n.pos.distanceTo(c);
      if (d >= 7) continue;
      const dir = d > 0.05 ? V(n.pos.x - c.x, 0, n.pos.z - c.z).normalize() : V(Math.sin(P.yaw), 0, Math.cos(P.yaw));
      // close: 멘탈 3 (a coworker goes 깨꼬닥), further out less
      hitPerson(n, dir, 'special', { power: 1.6 * (1 - d / 8.5), dmg: d < 3.5 ? 3 : d < 5.5 ? 2 : 1 });
    }
    sfx('crash', { vol: 0.75 });
  });
}
const SPECIAL_AT = 0.5;

// ---- interact candidates during the rampage
function rampageCandidate() {
  const tc = toys.candidate(); // ride / get off / fire alarm (scored, competes with desks + pick-ups below)
  if (tc && tc.id === 'ride-off') return tc;
  const fc = floorHook(G.S, 'candidate');
  if (fc) return fc;
  if (P.held || P.carryNpc) return null;
  const S = G.S, f = facing();
  const koc = koCandidate(f); // a KO'd body in reach: 들기 (scored against the toys / desks / pick-ups below)
  let best = null, bs = 1e9, desk = null, bsD = 1e9, pick = null, bsP = 1e9;
  for (const r of S.phys.records) {
    if (r.removed || r.held || r.fixed || r.riding || r.out) continue;
    const isDesk = flippable(r) && !r.flipped && recUpright(r) > 0.9;
    const canPick = r.mass <= 8 && !isDesk && r.price > 0 && !RIDE[r.type];
    if (!isDesk && !canPick) continue;
    const p = r.body.position;
    const dx = p.x - P.pos.x, dz = p.z - P.pos.z;
    const reach = (isDesk ? 1.05 : 0.95) + Math.min(0.75, Math.max(r.hx, r.hz) * 0.8);
    const d = Math.hypot(dx, dz);
    if (d > reach || p.y > 1.6) continue;
    const a = d > 0.01 ? Math.acos(clamp((dx * f.x + dz * f.z) / d, -1, 1)) : 0;
    if (a > 1.1 && d > 0.7) continue;
    const s = d + a * 0.8 + (isDesk ? -0.2 : 0);
    if (s < bs) { bs = s; best = r; }
    if (isDesk && s < bsD) { bsD = s; desk = r; }
    if (!isDesk && s < bsP) { bsP = s; pick = r; }
  }
  if (koc && koc.score < bs && (!tc || koc.score < tc.score)) return koc;
  if (tc && tc.score < bs) return tc;
  if (!best) return null;
  // a flippable table in reach and a pickable thing too (on it or next to it, whichever has the better score):
  // tap E = pick the thing up, hold E = flip the table — one prompt "엎기(꾹) · 톡: 집기"
  if (desk && pick) {
    const dp = desk.body.position;
    {
      const pk = pick, dk = desk, verb = WEAPON[pk.type] ? '들기' : '집기';
      return {
        // same id as the plain table prompt: the hold keeps counting if the small thing changes
        id: 'rec' + dk.id, rec: dk, tapRec: pk, pos: V(dp.x, 0, dp.z), h: 0.55, obj: pk.group,
        text: TOUCH ? `엎기(꾹) · 톡: ${verb}` : `엎기(꾹) · 톡: ${verb}`, hold: 0.42, range: 99,
        onDone: () => flipDesk(dk), onTap: () => pickUp(pk),
      };
    }
  }
  const isDesk = flippable(best) && !best.flipped;
  return {
    id: 'rec' + best.id, rec: best, pos: V(best.body.position.x, 0, best.body.position.z), h: isDesk ? 0.55 : best.body.position.y + 0.15, obj: best.group,
    text: isDesk ? '엎기' : WEAPON[best.type] ? '들기' : '집기', hold: isDesk ? 0.42 : 0, range: 99, onDone: () => (isDesk ? flipDesk(best) : pickUp(best)),
  };
}

// ================================================================ bill
function showBill() {
  if (G.scene === 'bill') return;
  G.scene = 'bill'; G.rampage = false; G.canDamage = false; G.timeLeft = null; G.homeWalk = null;
  ui.prompt(null); ui.timer(null); ui.combo(0); ui.elevator(null); ui.vignette(0); ui.subtitle(null, null);
  gfx.clearHighlight(); objective(null);
  const kos = Math.max(G.kos || 0, playerKos()) - (G.kos0 || 0);
  fight.stop(); fight.hud(); ui.bubble('player', null); G.pBubble = false;
  releaseLock();
  const all = [...G.items.values()].sort((a, b) => b.amount - a.amount);
  const items = all.filter((it) => !it.people), people = all.filter((it) => it.people); // people: own bill section
  const total = Math.round(G.money);
  // 레벨: 별 (★ 클리어 · ★ 목표 피해액 · ★ 안 쓰러짐), 레벨별 최고 기록, 다음 레벨 열기
  let lv = null, prev, isBest;
  if (G.mode === 'story' && G.level) {
    const n = G.level, L = levelOf(n), sv = lvSave(n);
    const fail = G.failed || null; // 'ko' (어려움에서 쓰러짐) | 'quit' (그만두기)
    const got = fail ? [false, false, false] : [true, total >= L.goal, kos <= 0];
    const stars = got.filter(Boolean).length;
    const wasOpen = levelOpen(n + 1);
    prev = sv.best; isBest = !fail && total > prev && total > 0;
    if (!fail) {
      save.lv[n] = { stars: Math.max(sv.stars, stars), best: Math.max(sv.best, total), clear: true };
      save.days = (save.days | 0) + 1;
      if (total > (save.best.story || 0)) save.best.story = total;
    }
    const unlocked = !fail && n < LEVEL_N && !wasOpen && levelOpen(n + 1);
    lv = { n, title: STORY[L.scene].info.title, goal: L.goal, fail, stars, got, newStars: !fail && stars > sv.stars, hasNext: n < LEVEL_N, nextOpen: n < LEVEL_N && levelOpen(n + 1), unlocked, last: n === LEVEL_N, diff: diffName(), kos };
  } else {
    const key = G.mode;
    prev = save.best[key] || 0;
    isBest = total > prev && total > 0;
    if (isBest) save.best[key] = total; // (보스전은 어려움에서 쓰러져 끝나도 그때까지 점수가 기록)
  }
  writeSave();
  // free mode has no clock: rank the damage per minute played (at least one minute counts)
  let score = total, meta = '';
  if (G.mode === 'free') {
    const sec = Math.max(1, G.playT || 0), mins = Math.max(1, sec / 60);
    score = Math.round(total / mins);
    meta = `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초 · 분당 ${fmt(score)}원`;
  }
  let rank = RANKS[0];
  for (const r of RANKS) if (score >= r[0]) rank = r;
  let title = rank[1], comment = rank[2];
  if (G.mode === 'boss') meta = (G.beaten ? `보스 ${G.beaten}명 격파` : '보스 격파 못 함') + (G.failed ? ' · 쓰러져서 끝' : '');
  if (lv && lv.fail === 'ko') { title = '퇴사 처리'; comment = '어려움에서는 쓰러지면 그 레벨이 끝나요. 막기(C)로 버텨 보세요.'; }
  else if (lv && lv.fail === 'quit') { title = '조퇴 처리'; comment = '중간에 그만두면 별을 받을 수 없어요.'; }
  else if (lv && lv.last) comment = '오늘 하루 끝! ' + comment;
  const relief = clamp(100 - G.stress, 0, 100);
  after(0.3, () => {
    ui.hud(false);
    ui.bill({ mode: G.mode, company: '(주)가족같은회사', items, people, total, best: prev, isBest, relief, title, comment, meta, who: (ui.names && ui.names.me) || '', diff: diffName(), level: lv });
    audio.music('bill');
    after(0.5, () => sfx('stamp', { vol: 0.8 }));
    after(0.9, () => sfx(lv && lv.fail ? 'sigh' : isBest || (lv && lv.newStars) ? 'newRecord' : 'fanfare', { vol: 0.7 }));
  });
  if (G.fast) runTimersNow();
  P.rage = false;
  const sad = !!(lv && lv.fail);
  setFace(sad ? 'endure' : total > 0 ? 'relief' : 'normal');
  P.char.setAnim(sad ? 'idle' : total > 0 ? 'cheer' : 'idle');
  G.lastBill = { mode: G.mode, items: items.length, people: people.map((it) => ({ name: it.name, count: it.count, amount: it.amount })), total, isBest, relief, rank: title, score, playT: +(G.playT || 0).toFixed(1), storySec: G.mode === 'story' ? +(G.rtime - (G.storyT0 || 0)).toFixed(1) : null, fight: fight.state(), level: lv, diff: DD().id || 'normal', beaten: G.beaten || 0, failed: G.failed || null };
}
function runTimersNow() { /* timers run on the next ticks; nothing to force */ }
function endRampage() {
  G.rampage = false; G.canDamage = false;
  fight.stop();
  ui.timer(0);
  sfx('whistle', { vol: 0.9 });
  G.slowT = 1.3; G.slowScale = 0.3;
  // ended in the lobby or outside: a little 퇴근 walk under the banner (out of the door / away from the tower)
  const home = G.floorKind === 'lobby' || G.floorKind === 'street';
  ui.banner(home ? '퇴근!' : '끝!', home ? '오늘은 여기까지' : '', 1500);
  P.controls = false;
  if (home) {
    if (toys.riding()) toys.dismount();
    const A = G.S.F.anchors, to = G.floorKind === 'lobby' ? A.door : V(P.pos.x, 0, P.pos.z + 5);
    const d = V(to.x - P.pos.x, 0, to.z - P.pos.z); if (d.lengthSq() < 0.04) d.set(0, 0, 1);
    G.homeWalk = d.normalize(); setFace('relief');
  }
  after(1.7, () => showBill());
}

// ================================================================ elevators
function updateElevators(dt) {
  const S = G.S; if (!S) return;
  for (const ev of S.F.elevators) {
    const rel = V().subVectors(P.pos, ev.front);
    const along = rel.dot(ev.fwd), lat = rel.dot(ev.right);
    const inside = along < -0.3 && along > -1.6 && Math.abs(lat) < 0.6;
    const near = along > -0.3 && along < 2.4 && Math.abs(lat) < 1.6;
    let npcNear = false;
    for (const n of S.npcs) if (!n.gone && (n.state === 'flee' || n.state === 'leave') && n.pos.distanceTo(ev.front) < 2.4) npcNear = true;
    if (ev.hold > 0) ev.hold -= dt;
    const want = !ev.closing && !ev.locked && (G.mode !== 'title') && (near || inside || npcNear || ev.hold > 0);
    const target = want ? 1 : 0;
    if (target && ev.open < 0.02 && !ev.sounding) { sfx('doorOpen', { vol: 0.5 }); ev.sounding = true; }
    if (!target && ev.open > 0.98 && ev.sounding) { sfx('doorClose', { vol: 0.4 }); ev.sounding = false; }
    ev.open = clamp(ev.open + (target ? 1 : -1) * dt * 1.6, 0, 1);
    ev.prop.set(ev.open);
    ev.inside = inside;
    if (inside && !ev.dismissed && !G.evPanel && !G.busy && G.scene !== 'bill' && G.mode !== 'title' && ev.open > 0.6 && !ev.closing) {
      G.evPanel = ev;
      releaseLock(); // the floor buttons need a visible cursor
      G.evSel = null;
      ui.elevator(evPanelData());
      sfx('ui', { vol: 0.5 });
    }
    if (!inside) { ev.dismissed = false; if (G.evPanel === ev) { G.evPanel = null; ui.elevator(null); } }
  }
}
// all seven floors, top to bottom, with their keyboard shortcut
const KEY_LABEL = { Digit7: '7', Digit1: '1', Digit2: '2', Digit3: '3', KeyR: 'R', KeyB: 'B', KeyN: 'N' };
function evPanelData() {
  return { current: G.floorKind, sel: G.evSel, floors: FLOOR_LIST.map((f) => Object.assign({}, f, { keyLabel: TOUCH ? null : KEY_LABEL[f.key] || null })) };
}
function evKeyFloor(code) {
  const c = code.replace(/^Numpad(\d)$/, 'Digit$1');
  const f = FLOOR_LIST.find((x) => x.key === c);
  return f ? f.id : null;
}
function moveEvSel(d) {
  const ids = FLOOR_LIST.map((f) => f.id);
  let i = ids.indexOf(G.evSel || G.floorKind);
  i = clamp(i + d, 0, ids.length - 1);
  G.evSel = ids[i];
  ui.elevator(evPanelData());
  sfx('ui', { vol: 0.35 });
}
function onElevator(id) {
  const ev = G.evPanel; G.evPanel = null;
  ui.elevator(null);
  if (!ev) return;
  if (!id || id === G.floorKind) { ev.dismissed = true; return; }
  ride(ev, id);
}
function ride(ev, dest) {
  if (G.busy) return;
  G.busy = true; P.controls = false;
  ev.closing = true; ev.dismissed = true;
  P.yaw = Math.atan2(ev.fwd.x, ev.fwd.z);
  sfx('doorClose', { vol: 0.5 });
  const go = () => {
    ev.closing = false;
    const idx = ev.index;
    transition(null, () => {
      if (G.mode === 'free') G.preset = dest === 'lobby' ? 'noon' : 'day';
      enterFloor(dest, { elevator: idx });
      P.controls = true;
      if (G.rampage) {
        ui.mission({ title: rampTitle(), sub: FLOOR_INFO[G.floorKind].name, tone: 'rage' });
        initTasks(G.floorKind);
      }
    }, 700);
  };
  after(0.7, go);
}

// ================================================================ doors (spec.portals: lobby ⇄ 회사 앞 거리)
// Prompt-free: during a rampage, walking into a portal's trigger box (moving along `enter`) spins the revolving
// door, whooshes and fades to the other side, where you step out on your own (enterFloor → door).
function portalGoal(pt) { const [x0, z0, x1, z1] = pt.box; return V((x0 + x1) / 2 + pt.enter[0] * 0.8, 0, (z0 + z1) / 2 + pt.enter[1] * 0.8); }
function checkPortals() {
  const S = G.S, ps = S && S.F.spec.portals;
  if (!ps || !G.rampage || G.busy || !P.controls || P.seated || G.scene === 'bill' || G.rtime < (G.portalCool || 0)) return;
  if (_bot && _bot.on && !_bot.forceDest) return; // the bot only goes through when it was sent somewhere
  const v = toys.riding() ? toys.T.ride.vel : P.vel;
  for (const pt of ps) {
    const [x0, z0, x1, z1] = pt.box;
    if (P.pos.x < x0 || P.pos.x > x1 || P.pos.z < z0 || P.pos.z > z1) continue;
    if (v.x * pt.enter[0] + v.z * pt.enter[1] < 0.6) continue;
    doorRide(pt); return;
  }
}
function doorRide(pt) {
  if (G.busy) return;
  G.busy = true; P.controls = false; P.vel.set(0, 0, 0);
  const spin = G.S.F.anchors.doorSpin, from = G.floorKind;
  if (spin) spin.k = 5;
  sfx('whoosh', { vol: 0.75, pitch: 0.8 }); sfx('doorOpen', { vol: 0.35 });
  if (DEBUG) G.doorTrips = (G.doorTrips || 0) + 1;
  after(0.35, () => transition(null, () => {
    if (spin) spin.k = 0.35;
    enterFloor(pt.to, { door: from });
    P.controls = true;
    if (G.rampage) {
      ui.mission({ title: rampTitle(), sub: FLOOR_INFO[G.floorKind].name, tone: 'rage' });
      initTasks(G.floorKind);
    }
  }, 450));
}
// just came out of a door (enterFloor): spin it, whoosh, first look back at the door if the portal asks for it
function doorArrived(S, pt) {
  G.portalCool = G.rtime + 1.2;
  const spin = S.F.anchors.doorSpin;
  if (spin) { spin.k = 4; after(0.9, () => { spin.k = 0.35; }); }
  after(0.05, () => sfx('whoosh', { vol: 0.5, pitch: 0.7 }));
  if (pt.cam) { CAM.yaw = P.yaw + pt.cam[0]; CAM.pitch = pt.cam[1]; G.doorCam = { t: 0 }; updateCamera(0, true); }
}
// how the bot gets to `dest`: { portal } (walk through a door here) or { via } (take the elevator to `via`)
function routeTo(dest) {
  const spec = G.S.F.spec, ps = spec.portals || [];
  const direct = ps.find((q) => q.to === dest);
  if (direct) return { portal: direct };
  if (!G.S.F.elevators.length && ps.length) return { portal: ps[0] };
  const ds = FLOOR_BY_ID[dest];
  if (ds && ds.outside) { const hub = FLOORS.find((f) => (f.portals || []).some((q) => q.to === dest)); if (hub) return { via: hub.id }; }
  return { via: dest };
}

// ================================================================ NPC context
let _ctx = null;
const _head = V();
function npcCtx() {
  if (!_ctx) _ctx = { sfx, pickExit, pickHide, keepIn: keepNpcIn, groundAt: npcGround, onLand: npcLand, onKo: npcKo, fightOn: () => fight.on(), fightTick: (n, dt, c) => fight.npcTick(n, dt, c), onFight: (n, ev) => fight.onFight(n, ev) };
  const S = G.S;
  _ctx.nav = S ? S.nav : null;
  _ctx.lists = S ? S.lists : [];
  _ctx.player = P.pos; _ctx.playerHead = _head.set(P.pos.x, 1.45, P.pos.z);
  _ctx.now = G.rtime;
  return _ctx;
}
function pickExit(pos, from) {
  const S = G.S; const A = S.F.anchors;
  let best = null, bs = 1e9;
  const cands = [];
  for (const ev of S.F.elevators) cands.push({ p: ev.front.clone().addScaledVector(ev.fwd, 0.55), leave: true, dir: ev.fwd });
  if (A.door) cands.push({ p: A.door.clone(), leave: true, dir: A.doorDir || V(0, 0, 1) });
  for (const e of A.leaves || []) cands.push({ p: e.p.clone(), leave: true, dir: e.dir }); // off the ends of the street
  for (const h of A.hide || []) cands.push({ p: h.clone(), leave: false });
  if (A.meeting) cands.push({ p: A.meeting.clone(), leave: false });
  for (const c of cands) {
    const s = c.p.distanceTo(pos) - 0.9 * c.p.distanceTo(from) + rnd(0, 2.5);
    if (s < bs) { bs = s; best = c; }
  }
  return { x: best.p.x, z: best.p.z, leave: best.leave, dir: best.dir };
}
function pickHide(pos, from) {
  const S = G.S;
  let best = S.F.anchors.hide[0], bs = 1e9;
  for (const h of S.F.anchors.hide) { const s = h.distanceTo(pos) - 1.2 * h.distanceTo(from); if (s < bs) { bs = s; best = h; } }
  return best;
}

// ================================================================ player update
let _bot = null;
function updatePlayer(dt) {
  const S = G.S;
  const c = P.char;
  if (P.faceT > 0) { P.faceT -= dt; if (P.faceT <= 0) c.setFace(baseFace()); }
  if (P.seated) {
    P.speed = 0;
    c.update(dt, 0);
    S.phys.setPlayer(P.pos.x, 0, P.pos.z, 0, 0, 0);
    return;
  }
  // movement intent (world space)
  let mx = 0, mz = 0;
  if (_bot && _bot.on) { mx = _bot.move.x; mz = _bot.move.z; }
  else {
    const [ix, iy] = moveInput();
    if (ix || iy) {
      const fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw);
      mx = fx * iy - fz * ix; mz = fz * iy + fx * ix;
      // right = (-fz, fx)
      mx = fx * iy + (-fz) * ix; mz = fz * iy + fx * ix;
    }
  }
  if (!P.controls || G.busy) { mx = 0; mz = 0; }
  // 막기 (hold C / L / Shift / the 막기 button): arms up, slow walk, no swings; flat on the floor: no moving at all
  const guardWant = IN.guard || IN.guardTouch || !!(_bot && _bot.on && _bot.guard);
  const canGuard = P.controls && !G.busy && !toys.riding() && !P.carry && !(P.held && P.heldBoth) && G.mode !== 'title' && G.scene !== 'bill';
  fight.setGuard(guardWant, canGuard);
  const ms = fight.moveScale(); mx *= ms; mz *= ms;
  // the rampage ended in the lobby / outside: walk home (퇴근!) under the final banner
  if (G.homeWalk && !G.busy) { mx = G.homeWalk.x * 0.5; mz = G.homeWalk.z * 0.5; }
  // just arrived by elevator: walk out of the car on your own; any move input after a moment takes over
  if (G.arrive && !G.busy) {
    const A = G.arrive;
    A.t += dt / Math.max(0.03, G.timeScale); // real seconds
    const [ix, iy] = moveInput();
    if (!A.done) {
      const dx = A.to.x - P.pos.x, dz = A.to.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.15 || A.t > 2.4 || (A.t > (A.door ? 0.8 : 0.3) && (ix || iy))) A.done = true;
      else { mx = dx / d * 0.55; mz = dz / d * 0.55; }
    }
    if (A.done && (A.t > 1.1 || ix || iy)) G.arrive = null;
  }
  if (toys.riding()) { toys.updateRide(dt, mx, mz); keepIn(); return; }
  const carrying = !!P.carry || (P.held && P.heldBoth);
  const vmax = carrying ? 1.9 : (G.rampage || G.mode === 'free' ? 4.7 : 3.0);
  const tx = mx * vmax, tz = mz * vmax;
  const acc = Math.min(1, dt * (mx || mz ? 12 : 16));
  P.vel.x += (tx - P.vel.x) * acc; P.vel.z += (tz - P.vel.z) * acc;
  P.prev.copy(P.pos);
  if (P.push) {
    const d = V().subVectors(P.push, P.pos).setY(0);
    if (d.length() < 0.06) P.push = null; else { d.clampLength(0, dt * 2.2); P.pos.add(d); }
  }
  P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
  // extinguisher recoil
  const sv = toys.sprayPush();
  if (sv.x || sv.z) { P.pos.x += sv.x * dt; P.pos.z += sv.z * dt; }
  // collisions: static + heavy props + people
  collideCircle(P.pos, P.r, S.lists, P.y);
  for (const n of S.npcs) {
    if (n.gone || n.state === 'air' || n.state === 'carried') continue;
    const dx = P.pos.x - n.pos.x, dz = P.pos.z - n.pos.z, d = Math.hypot(dx, dz), m = P.r + n.r;
    if (d >= m || d <= 1e-4) continue;
    // someone lying on the floor gets shoved along (feet end) instead of blocking you
    if (n.lying || n.state === 'wake') { if (n.state === 'ko') { n.pos.x -= dx / d * (m - d) * 0.6; n.pos.z -= dz / d * (m - d) * 0.6; n.pushed = true; } continue; }
    P.pos.x += dx / d * (m - d); P.pos.z += dz / d * (m - d);
  }
  collideCircle(P.pos, P.r, [S.F.rects], P.y);
  keepIn();
  const realV = Math.hypot(P.pos.x - P.prev.x, P.pos.z - P.prev.z) / Math.max(dt, 1e-4);
  P.speed = Math.min(realV, Math.hypot(P.vel.x, P.vel.z));
  if (P.speed > 0.25 && (mx || mz)) P.yaw = angLerp(P.yaw, Math.atan2(P.vel.x, P.vel.z), dt * 12);
  // guarding: turn to face whoever is winding up close by (so a block works from any side)
  if (fight.FT.guard) {
    let best = null, bd = 4;
    for (const n of S.npcs) { if (!n.fighter || n.gone || (n.state !== 'windup' && n.state !== 'swing')) continue; const d = n.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = n; } }
    if (best) P.yaw = angLerp(P.yaw, Math.atan2(best.pos.x - P.pos.x, best.pos.z - P.pos.z), dt * 12);
  }
  // jump / gravity
  if (IN.jumpQ > 0) {
    IN.jumpQ = 0;
    if (P.onGround && P.controls && !G.busy && !P.carry && !fight.playerDown()) { P.vy = 6.0; P.onGround = false; c.playOnce('jump'); sfx('jump', { vol: 0.45 }); }
  }
  if (G.thrust > 0) { P.onGround = false; P.vy = Math.min(Math.max(P.vy, G.thrustMax), P.vy + G.thrust * dt); }
  // raised walkable floors (ctx.ground): only floors that declare them; others keep y = 0 (and their own hooks)
  const gh = S.F.grounds.length ? groundAt(S.F, P.pos.x, P.pos.z) : 0;
  if (P.onGround && S.F.grounds.length) {
    if (gh > P.y + 1e-3) { if (gh - P.y <= 0.45) P.y = gh; }
    else if (gh < P.y - 1e-3) { if (P.y - gh <= 0.25) P.y = gh; else { P.onGround = false; P.vy = 0; } }
  }
  if (!P.onGround) {
    P.vy -= 18 * dt; P.y += P.vy * dt;
    if (P.y <= gh) { P.y = gh; P.vy = 0; P.onGround = true; c.playOnce('land'); sfx('land', { vol: 0.5 }); }
  }
  // animation
  let anim;
  if (P.carry || (P.held && P.heldBoth)) anim = 'carry';
  else if (P.speed > 3.2) anim = 'run';
  else if (P.speed > 0.15) anim = 'walk';
  else anim = G.scene === 'bill' && G.money > 0 ? 'cheer' : P.rage ? 'rageIdle' : 'idle';
  const fa = fight.playerAnim(); // guard / flat out / getting up
  if (fa && !(fa === 'guard' && (P.carry || (P.held && P.heldBoth)))) anim = fa;
  if (c.anim !== anim) c.setAnim(anim);
  c.update(dt, P.speed);
  // footsteps
  if (P.onGround && P.speed > 0.5) {
    P.stepD += P.speed * dt;
    if (P.stepD > (P.speed > 3.2 ? 0.95 : 0.7)) { P.stepD = 0; sfx((S.F.spec && S.F.spec.stepSfx) || 'step', { vol: 0.22, pitch: rnd(0.9, 1.1) }); }
  }
  placePlayer();
  S.phys.setPlayer(P.pos.x, P.y, P.pos.z, (P.pos.x - P.prev.x) / dt, P.onGround ? 0 : P.vy, (P.pos.z - P.prev.z) / dt);
}

function groundAt(F, x, z) {
  let h = 0;
  for (const g of F.grounds) if (x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1 && g.h > h) h = g.h;
  return h;
}
// window panes / out-zones stop bodies only when intact; the player never leaves the building through them
// (not even by jumping the sill or riding a chair at a broken pane)
function keepIn() {
  const F = G.S && G.S.F; if (!F) return;
  const m = P.r + 0.06;
  // hard floor bounds: whatever shoved the player (knock-back, spray, rides, jumping over low walls),
  // they never end up outside the room. Elevator cabins sit behind the wall, so the doorway → cabin
  // stretch is allowed; scripted moves (G.busy) are left alone.
  if (!G.busy) {
    const b = F.bounds;
    if (P.pos.x < b.minX + m || P.pos.x > b.maxX - m || P.pos.z < b.minZ + m || P.pos.z > b.maxZ - m) {
      let inCar = false;
      for (const ev of F.elevators) {
        const ax = P.pos.x - ev.front.x, az = P.pos.z - ev.front.z;
        const along = -(ax * ev.fwd.x + az * ev.fwd.z), lat = Math.abs(ax * ev.right.x + az * ev.right.z);
        if (along > -0.6 && along < 3.2 && lat < 1.05) { inCar = true; break; }
      }
      if (!inCar) {
        P.pos.x = clamp(P.pos.x, b.minX + m, b.maxX - m);
        P.pos.z = clamp(P.pos.z, b.minZ + m, b.maxZ - m);
      }
    }
  }
  for (const Z of F.outZones) {
    const a = Z.axis === 'z' ? P.pos.x : P.pos.z;
    if (a < Z.from - 0.3 || a > Z.to + 0.3) continue;
    const c = Z.axis === 'z' ? P.pos.z : P.pos.x, d = (c - Z.at) * Z.side;
    if (d > -m && d < 3) { const v = Z.at - Z.side * m; if (Z.axis === 'z') P.pos.z = v; else P.pos.x = v; }
  }
}
// ---- interaction focus + prompt
function updateInteract(dt) {
  let cand = null;
  if (G.mode !== 'title' && G.scene !== 'bill' && !G.busy && !P.seated && P.controls && !fight.playerDown()) {
    if (G.cand) {
      const c = G.cand;
      const d = Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z);
      if (d < c.range) cand = c;
    }
    if (!cand && G.canDamage) cand = rampageCandidate();
  }
  if (!cand || !G.focus || cand.id !== G.focus.id) { G.holdT = 0; G.tapArm = false; }
  G.focus = cand;
  // a quick tap (down + up between two frames) still counts once
  const press = (_bot && _bot.on) ? _bot.interact : (IN.interact || IN.interactQ > 0);
  IN.interactQ = 0;
  if (cand) {
    if (press && !G.needRelease) {
      if (cand.hold > 0) {
        G.holdT += dt; G.tapArm = !!cand.onTap;
        if (G.holdT >= cand.hold) { G.holdT = 0; G.tapArm = false; G.needRelease = !(_bot && _bot.on); fire(cand); }
      } else { G.needRelease = !(_bot && _bot.on); fire(cand); }
    } else if (!press) {
      // let go before the hold finished: a tap (tap E = pick up, hold E = flip)
      if (G.tapArm && cand.onTap && G.holdT > 0 && G.holdT < cand.hold) { G.tapArm = false; G.holdT = 0; try { cand.onTap(); } catch (e) { report(e); } G.focus = null; }
      G.holdT = 0; G.tapArm = false;
    }
  } else if ((P.held || P.carryNpc) && press && !G.needRelease) { G.needRelease = !(_bot && _bot.on); if (P.carryNpc) releaseNpc(true); else throwHeld(); }
  if (_bot && _bot.on && _bot.interact && cand && cand.hold === 0) _bot.interact = false;
}
function fire(c) { try { c.onDone(); } catch (e) { report(e); } floorHook(G.S, 'onInteract', c); G.focus = null; }

// ================================================================ main tick
function tick(dt) {
  G.frames++;
  const rdt = dt;
  G.rtime += rdt;
  runTimers();
  // time scale: hit-stop and slow motion
  let scale = 1;
  if (G.hitStop > 0) { G.hitStop -= rdt; scale = 0.03; }
  else if (G.slowT > 0) { G.slowT -= rdt; scale = G.slowScale; }
  G.timeScale = scale;
  const gdt = rdt * scale;
  G.time += gdt;
  const S = G.S;
  if (!S) return;

  if (_bot && _bot.on) botUpdate(rdt);
  // story logic
  if (!G.busy && G.mode === 'story' && STORY[G.scene]) { G.phaseT += rdt; STORY[G.scene].update(rdt); }
  // inputs → actions
  if (G.mode !== 'title' && G.scene !== 'bill' && !G.busy && P.controls) {
    const botA = _bot && _bot.on;
    if (IN.attackQ > 0 || IN.attack || (botA && _bot.attack)) { IN.attackQ = 0; attack('punch'); }
    if (IN.kickQ > 0 || IN.kick || (botA && _bot.kick)) { IN.kickQ = 0; attack('kick'); }
    if (IN.specialQ > 0 || (botA && _bot.special)) { IN.specialQ = 0; if (G.canDamage) special(); else if (G.mode === 'story') { /* nothing yet */ } }
  } else { IN.attackQ = 0; IN.kickQ = 0; IN.specialQ = 0; }

  // toys: extinguisher spray (hold attack), sprinkler rain, windows / out-throws (before physics)
  const attackDown = G.mode !== 'title' && !G.busy && P.controls && (IN.attack || !!(_bot && _bot.on && (_bot.attack || _bot.spray)));
  const tu = toys.update(gdt, attackDown);
  G.thrust = tu.thrust; G.thrustMax = tu.vmax || 3;
  if (P.attackT > 0) P.attackT -= rdt; // swing cooldown on the real clock: hit-stop / slow-mo never make you slower
  try { fight.update(gdt, rdt); } catch (e) { report(e); } // attackers count, knock-back, flop / get up, hearts, slippers
  updatePlayer(gdt > 0 ? gdt : rdt * 0.06);
  checkPortals();
  updateInteract(rdt);
  // physics
  S.phys.step(gdt);
  flushImpacts();
  flushRemovals();
  // flying things knock people over (reach grows with the thing's size, power with its speed and weight)
  if (G.rampage) {
    const t = S.phys.time;
    for (const r of S.phys.records) {
      if (r.removed || r.held || r.riding || r.energized < t) continue;
      const v = r.body.velocity, v2 = v.x * v.x + v.z * v.z; if (v2 < 9) continue;
      const p = r.body.position;
      if (p.y > 2.0 || p.y < 0.05) continue;
      const reach = 0.42 + Math.min(0.6, Math.max(r.hx, r.hz));
      if (r.pCool > t) continue;
      for (const n of S.npcs) {
        if (!n.targetable || n.state === 'air') continue;
        const dx = n.pos.x - p.x, dz = n.pos.z - p.z;
        if (dx * dx + dz * dz > reach * reach) continue;
        if (n.lying && p.y > 0.7) continue; // flies over someone lying on the floor
        const sp = Math.sqrt(v2);
        _d.set(v.x / sp, 0, v.z / sp);
        // a flung desk / cabinet costs 3 멘탈, a chair or a box 2, small stuff 1
        if (hitPerson(n, _d, 'thrown', { power: clamp(0.45 + sp * 0.07 + Math.min(r.mass, 60) * 0.008, 0.6, 1.45), dmg: r.mass >= 15 ? 3 : r.mass >= 3 ? 2 : 1 })) {
          r.pCool = t + 0.3;
          v.x *= 0.55; v.z *= 0.55; // the hit takes some speed out of the thing
          break;
        }
      }
    }
    updateDomino();
  }
  // carrying a KO'd body: dropped where you stand if a scene / the elevator takes over
  if (P.carryNpc && (G.busy || !G.canDamage || !S.npcs.includes(P.carryNpc))) releaseNpc(false);
  // idle chatter (spec.lines) when you walk past, outside the rampage
  if (!G.rampage && G.mode !== 'title') {
    for (const n of S.npcs) {
      const L = n.spec.lines;
      if (!L || !L.length || n.gone || n.panicked || (n.nextLine || 0) > G.rtime || (n.bubble && n.bubble.until > G.rtime)) continue;
      if (n.pos.distanceTo(P.pos) < 2.6) { n.say(L[(Math.random() * L.length) | 0], 2.4, G.rtime); n.nextLine = G.rtime + 8; }
    }
  }
  floorHook(S, 'onTick', gdt);
  // obstacles + nav refresh
  S.phys.obstacles(S.obst);
  S.navT += rdt;
  if (G.rampage && S.navT > 1.5) { S.navT = 0; rebuildNav(S); }
  // NPCs
  const ctx = npcCtx();
  if (S.F.grounds.length) for (const n of S.npcs) {
    if (n.gone || n.state === 'air') continue;
    const h = groundAt(S.F, n.pos.x, n.pos.z);
    if (n.y !== h) n.y = h > n.y ? h : Math.max(h, n.y - gdt * 3.5);
  }
  for (const n of S.npcs) { try { n.update(gdt, ctx); } catch (e) { report(e); } }
  for (const w of S.walkers) w.update(gdt, ctx);
  for (const fn of S.F.animate) fn(gdt, G.time);
  for (const rp of S.ropes) {
    if (!rp.m.visible) continue;
    const a = rp.a.body.position, b = rp.b.body.position;
    if (rp.a.removed || rp.b.removed || Math.abs(a.x - rp.ax) + Math.abs(a.z - rp.az) > 0.05 || Math.abs(b.x - rp.bx) + Math.abs(b.z - rp.bz) > 0.05) rp.m.visible = false;
  }
  updateElevators(rdt);
  fx.update(gdt, G.rtime, rdt);
  feelTick(rdt);
  payCue();
  if (G.rampage && !G.busy) G.playT = (G.playT || 0) + gdt;
  // rampage clock
  if (G.rampage) {
    if (G.special < 1) { G.special = Math.min(1, G.special + gdt / 45); ui.special(G.special); if (G.special >= 1 && !G.specialReadyShown) { G.specialReadyShown = true; sfx('specialReady', { vol: 0.8 }); ui.toast(TOUCH ? '필살기 준비 완료!' : 'Q 필살기 준비 완료!', 1600); } }
    if (G.comboT > 0) { G.comboT -= gdt; if (G.comboT <= 0) { G.combo = 0; ui.combo(0); } }
    checkTasks();
    watchKo();
    if (G.rampage && G.timeLeft != null && !G.busy) {
      G.timeLeft -= gdt;
      ui.timer(Math.max(0, G.timeLeft));
      const sec = Math.ceil(G.timeLeft);
      if (sec !== G.lastSec && sec <= 10 && sec > 0) sfx(sec <= 3 ? 'tickLast' : 'clockTick', { vol: 0.6 });
      G.lastSec = sec;
      if (G.timeLeft <= 0) { G.timeLeft = 0; endRampage(); }
    }
  }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - rdt * 2.6);
  if (!G.rampage && G.mode === 'story' && G.scene !== 'bill' && G.phase !== 'boil') ui.vignette(clamp((G.stress - 62) / 50, 0, 0.6));
  updateCamera(rdt);
}

// ================================================================ per-frame UI (prompt, bubbles, highlight)
function frameUI() {
  const S = G.S;
  // prompt + highlight
  const f = G.focus;
  if (f && G.mode !== 'title' && G.scene !== 'bill') {
    const s = toScreen(V(f.pos.x, f.h, f.pos.z));
    if (s) ui.prompt({ key: TOUCH ? '행동' : 'E', text: f.text, x: s.x - 70, y: s.y, hold: f.hold > 0 ? G.holdT / f.hold : 0 });
    else ui.prompt(null);
    gfx.highlight(f.obj, G.rtime);
  } else if (P.held && G.mode !== 'title' && G.scene !== 'bill') {
    const s = toScreen(V(P.pos.x, 1.9, P.pos.z));
    const wt = toys.heldText();
    if (s) ui.prompt(wt ? { key: TOUCH ? '때리기' : '클릭', text: wt + (TOUCH ? '' : ' · E 던지기'), x: s.x + 90, y: s.y, hold: 0 } : { key: TOUCH ? '때리기' : '클릭', text: '던지기', x: s.x + 80, y: s.y, hold: 0 }); else ui.prompt(null);
    gfx.highlight(null, 0);
  } else { ui.prompt(null); gfx.highlight(null, 0); }
  // bubbles
  if (!S) return;
  fight.frame(); // name tags, "!" over a wind-up, the player's blink
  const pb = fight.playerBubble();
  if (pb) {
    const down = fight.FT.downT > 0 || fight.FT.getUpT > 0;
    const s = toScreen(V(P.pos.x, P.y + (down ? 1.0 : 2.05), P.pos.z));
    if (s) { ui.bubble('player', { text: pb, x: s.x, y: s.y }); G.pBubble = true; } else if (G.pBubble) { ui.bubble('player', null); G.pBubble = false; }
  } else if (G.pBubble) { ui.bubble('player', null); G.pBubble = false; }
  for (const n of S.npcs) {
    const b = n.bubble;
    if (!b || !b.text || b.until < G.rtime || n.gone || G.mode === 'title') { if (n._bubbleOn) { ui.bubble(n.id, null); n._bubbleOn = false; } if (b && b.until < G.rtime) n.bubble = null; continue; }
    const hp = n.bubbleAt(V()); // above the head, wherever it is (standing, seated, flat on the floor)
    const d = hp.distanceTo(camera.position);
    const s = d < 18 ? toScreen(hp) : null;
    if (s) { ui.bubble(n.id, { text: b.text, x: s.x, y: s.y }); n._bubbleOn = true; } else if (n._bubbleOn) { ui.bubble(n.id, null); n._bubbleOn = false; }
  }
}
function renderNow() {
  try { frameUI(); gfx.render(G.manual || G.rampage || (G.S && G.S.phys.awake > 0) ? 1 : 2); } catch (e) { report(e); }
}

// ================================================================ loop + adaptive quality (gfx.adapt: 자동 화질)
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!G.manual && !G.paused) {
    acc += dt;
    let n = 0;
    while (acc >= FIXED && n < 4) { try { tick(FIXED); } catch (e) { report(e); } acc -= FIXED; n++; }
    if (n === 4) acc = 0;
  }
  renderNow();
  // fps + adaptive quality during play
  G.fpsAcc = (G.fpsAcc || 0) + dt; G.fpsN = (G.fpsN || 0) + 1;
  if (G.fpsAcc > 1) { G.fps = Math.round(G.fpsN / G.fpsAcc); G.fpsAcc = 0; G.fpsN = 0; }
  // (첫 화면에서도 잰다: 느린 기기는 메뉴를 고르는 동안 이미 알맞은 단계로 내려가 있다)
  gfx.adapt((now - G.lastNow) / 1000 || 0, !G.manual && !document.hidden && !G.paused && G.lastNow > 0);
  G.lastNow = now;
}

// ================================================================ modes
function start(mode, opts = {}) {
  initAudio();
  G.gen++; G.transN++; G.timers.length = 0;
  G.mode = mode; G.opts = Object.assign({ floor: 'office', gender: ui.settings.gender }, opts);
  G.paused = false; ui.pause(false); ui.bill(null); ui.title(false); ui.elevator(null); G.evPanel = null;
  ui.subtitle(null, null); ui.vignette(0); ui.banner(null);
  resetDamage(); G.rampage = false; G.canDamage = false; G.timeLeft = null; G.stress = 0; G.queue = []; G.stressLog = [];
  G.homeWalk = null; G.outWrecks = []; // (things thrown out upstairs this run → wrecks on the street plaza)
  G.failed = null; G.beaten = 0; G.kos = 0; G.kos0 = 0; G.downEdges = 0; G.wasDown = false; G.runId = (G.runId || 0) + 1;
  // 본게임 = 레벨 (opts.level, 기본 1). opts.len ('long' | 'short') 은 하루 전체를 도는 시험 · 디버그 전용
  G.level = mode === 'story' && !G.opts.len ? clamp(G.opts.level | 0 || 1, 1, LEVEL_N) : 0;
  if (G.level) G.opts.level = G.level;
  if (G.opts.gender && G.opts.gender !== (P.char.group.name.endsWith('F') ? 'f' : 'm')) setPlayerChar(G.opts.gender);
  // fresh floors (reuse the title office if nobody touched it)
  const keep = G.floors.office && !G.floors.office.used && Object.keys(G.floors).length === 1 && mode === 'story';
  if (!keep) disposeFloors();
  else { scene.remove(G.S.F.group); G.S = null; G.floors.office.used = true; applyRunFight(G.floors.office); }
  fx.clear();
  gfx.adaptReset();
  if (mode === 'story' && G.level) {
    const id = levelOf(G.level).scene;
    STORY_ORDER = [id, 'rampage', 'bill']; G.storyT0 = G.rtime; G.scene = id;
    return gotoScene(id);
  }
  if (mode === 'story') { STORY_ORDER = G.opts.len === 'long' ? STORY_LONG : STORY_SHORT; G.storyT0 = G.rtime; G.scene = 'copier'; return gotoScene('copier'); }
  if (mode === 'rush' || mode === 'boss') {
    const boss = mode === 'boss';
    const S0 = getFloor('office');
    const card = boss
      ? { time: '오후 3:00', title: '1분 보스전', sub: `${fight.bossName(S0)} · ${fight.midName(S0)}${eul(fight.midName(S0))} 쓰러뜨려라`, lv: `1분 난동 · 보스전 · ${diffName()}`, goal: `보스 격파 +${fmt(BOSS_BONUS.boss * moneyMul())}원 · 중간보스 격파 +${fmt(BOSS_BONUS.mid * moneyMul())}원` }
      : { time: '오후 3:00', title: '1분 난동', sub: '참지 말고, 다 뒤집어엎자', lv: `1분 난동 · 일반 · ${diffName()}` };
    return transition(card, () => {
      G.preset = 'day';
      const S = enterFloor('office', { at: S0.F.anchors.rushSpawn, yaw: -PI / 2 });
      resetPlayer(); snapCamera();
      startRampage();
      void S;
    }, boss ? 2600 : 2100);
  }
  if (mode === 'free') {
    const fl = FLOOR_BY_ID[G.opts.floor] ? G.opts.floor : 'office';
    return transition({ time: fl === 'lobby' ? '낮 12:30' : '오후 3:00', title: '자유 난동', sub: FLOOR_INFO[fl].name }, () => {
      G.preset = fl === 'lobby' ? 'noon' : 'day';
      const S = getFloor(fl);
      const A = S.F.anchors;
      enterFloor(fl, { at: A.rushSpawn || A.spawn, yaw: A.rushSpawn ? -PI / 2 : (A.spawnYaw || 0) });
      resetPlayer(); snapCamera();
      startRampage();
    });
  }
  return Promise.resolve();
}
function toTitle() {
  G.gen++; G.transN++; G.timers.length = 0;
  releaseLock();
  G.mode = 'title'; G.scene = 'title'; G.paused = false; G.rampage = false; G.canDamage = false; G.busy = false; G.homeWalk = null;
  ui.pause(false); ui.bill(null); ui.hud(false); ui.prompt(null); ui.elevator(null); ui.subtitle(null, null); ui.vignette(0); ui.banner(null);
  objective(null); G.evPanel = null;
  if (!G.floors.office || G.floors.office.used || Object.keys(G.floors).length > 1) disposeFloors();
  fx.clear();
  G.preset = 'title';
  const S = enterFloor('office');
  resetPlayer();
  const seat = S.F.anchors.playerSeat;
  P.pos.set(seat.x + 0.15, 0, seat.z + 0.62); P.yaw = 0.35; P.rage = true; placePlayer();
  P.char.setAnim('rageIdle'); setFace('endure');
  setStress(0, false);
  for (const ev of S.F.elevators) { ev.open = 0; ev.prop.set(0); }
  audio.music('title');
  G.level = 0;
  ui.title(true, titleData());
  CAM.drift = 0;
  updateCamera(0, true);
}
// 첫 화면 · 레벨 선택에 보여 줄 것: 기록, 별, 난이도
function titleData() {
  return {
    best: save.best.rush || 0, bestBoss: save.best.boss || 0, days: save.days,
    stars: starsTotal(), starsMax: LEVEL_N * 3, next: nextLevel(), levelN: LEVEL_N, levels: levelRows(),
    diffs: DIFF.DIFFS || [], diff: (DIFF.getDiff && DIFF.getDiff()) || 'normal',
  };
}
function togglePause(on) {
  if (G.mode === 'title' || G.scene === 'bill') return;
  if (on === G.paused) return;
  G.paused = on;
  if (on) {
    releaseLock();
    ui.pause(true, { canSkip: G.mode === 'story' && !!STORY[G.scene] && G.phase !== 'boil', level: G.mode === 'story' ? G.level : 0 });
    audio.suspend();
    clearInput();
  } else { ui.pause(false); audio.resume(); last = performance.now(); }
}

// ================================================================ auto bot (debug)
function botUpdate(dt) {
  const B = _bot;
  B.move.set(0, 0, 0); B.attack = false; B.kick = false; B.special = false; B.guard = false;
  if (G.mode === 'title' || G.scene === 'bill' || G.busy || G.paused) { B.interact = false; return; }
  // elevator panel → pick the destination
  if (G.evPanel) {
    const dest = B.dest || (G.obj && G.obj.dest) || (G.mode === 'free' ? (G.floorKind === 'office' ? 'lobby' : 'office') : null);
    if (dest && dest !== G.floorKind) { onElevator(dest); B.dest = null; } else onElevator(null);
    return;
  }
  let goal = null, wantInteract = false, near = 0.35;
  B.spray = false;
  // 막기: someone about to swing at us (or a slipper on its way) → arms up for a moment (usually a perfect guard)
  B.guard = false;
  if (G.rampage && B.guardOn !== false) {
    for (const n of G.S.npcs) {
      if (!n.fighter || n.gone || n.atk === 'throw' || n.pos.distanceTo(P.pos) > 2.6) continue;
      if ((n.state === 'windup' && n.t >= fight.RANK[n.fighter.rank].windup - 0.18) || (n.state === 'swing' && n.t < 0.15)) B.guard = true;
    }
    if (fight.incoming(2.2)) B.guard = true;
    if (B.guard) { B.interact = false; return; }
  }
  if (G.rampage && !B.forceDest && B.toys !== false) {
    const r = botToys(B, dt);
    if (r) { if (r.goal) { goal = r.goal; near = r.near || 0.3; } wantInteract = !!r.interact; if (!r.goal && !r.interact) { B.interact = false; return; } }
  }
  if (G.rampage && !goal && !wantInteract) {
    if (G.special >= 1 && !toys.riding()) B.special = true;
    if (toys.riding() && B.forceDest) toys.dismount();
    if (B.forceDest && B.forceDest !== G.floorKind) {
      const rt = routeTo(B.forceDest);
      if (rt.portal) {
        // walk up to the door, then straight into it (the trigger needs you moving through)
        const g = portalGoal(rt.portal), ap = g.clone().addScaledVector(V(rt.portal.enter[0], 0, rt.portal.enter[1]), -2.2);
        goal = Math.hypot(P.pos.x - ap.x, P.pos.z - ap.z) > 0.5 && Math.hypot(P.pos.x - g.x, P.pos.z - g.z) > 2.0 ? ap : g; near = 0.02;
      } else { const ev = nearestElevator(P.pos); goal = ev.cabin.clone(); B.dest = rt.via; near = 0.2; }
    } else {
      if (B.forceDest === G.floorKind) B.forceDest = null;
      // nearest live target
      let tr = B.target;
      if (!tr || tr.removed || tr.destroyed || tr.held || G.rtime - B.targetT > 4) {
        tr = null; let bd = 1e9;
        for (const r of G.S.phys.records) {
          if (r.removed || r.destroyed || r.held || r.riding || r.out || r.price <= 0 || (B.skip.get(r) || 0) > G.rtime) continue;
          const p = r.body.position; if (p.y > 1.8 && p.y - r.hy > 1.5) continue;
          const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z) + (r.mass < 1 ? 1.5 : 0);
          if (d < bd) { bd = d; tr = r; }
        }
        if (B.target && B.target === tr) B.skip.set(tr, G.rtime + 6);
        B.target = tr; B.targetT = G.rtime;
      }
      if (tr) {
        const p = tr.body.position;
        const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z);
        goal = V(p.x, 0, p.z); near = 0.9 + Math.max(tr.hx, tr.hz) * 0.6;
        if (d < 1.4 + Math.max(tr.hx, tr.hz) * 0.7) {
          aimAt(p);
          if (G.focus && G.focus.rec === tr && flippable(tr) && !tr.flipped) wantInteract = true;
          else if (P.held) B.attack = true;
          else { B.flip = !B.flip; if (B.flip) B.attack = true; else B.kick = true; }
          goal = null;
        }
      }
    }
  } else if (G.obj) {
    const o = G.obj;
    if (o.kind === 'elevator') { goal = o.pos.clone(); B.dest = o.dest; near = 0.15; }
    else {
      goal = o.cand ? o.cand.pos.clone() : o.pos.clone();
      near = o.cand ? Math.min(1.2, o.cand.range * 0.6) : 0.3;
      if (o.cand && G.focus && G.focus.id === o.cand.id) { wantInteract = true; aimAt(o.cand.pos); }
    }
  }
  B.interact = wantInteract;
  if (!goal || wantInteract) return;
  const d = Math.hypot(goal.x - P.pos.x, goal.z - P.pos.z);
  if (d < near) { if (G.obj && G.obj.cand) aimAt(G.obj.cand.pos); return; }
  if (!B.path || G.rtime - B.pathT > 0.7 || B.goal.distanceTo(goal) > 0.4) {
    B.path = G.S.nav.path(P.pos.x, P.pos.z, goal.x, goal.z) || [[goal.x, goal.z]];
    B.pathI = 0; B.pathT = G.rtime; B.goal = goal.clone();
  }
  while (B.pathI < B.path.length - 1 && Math.hypot(B.path[B.pathI][0] - P.pos.x, B.path[B.pathI][1] - P.pos.z) < 0.3) B.pathI++;
  const [wx, wz] = B.path[B.pathI];
  const dx = wx - P.pos.x, dz = wz - P.pos.z, dl = Math.hypot(dx, dz);
  if (dl > 0.01) { const k = Math.min(1, dl / 0.4 + 0.3); B.move.set(dx / dl * k, 0, dz / dl * k); }
  // unstick: if we barely moved for a while, sidestep
  if (!B.lastPos) B.lastPos = P.pos.clone();
  B.stuckT = (B.stuckT || 0) + dt;
  if (B.unstick > 0) { B.unstick -= dt; B.move.set(B.side.x, 0, B.side.z); }
  else if (B.stuckT > 1.0) {
    if (B.lastPos.distanceTo(P.pos) < 0.2) {
      const s = Math.random() < 0.5 ? 1 : -1;
      B.side = V(-B.move.z * s - B.move.x * 0.4, 0, B.move.x * s - B.move.z * 0.4).normalize();
      B.unstick = 0.45; B.path = null;
      if (G.rampage && B.target) { B.skip.set(B.target, G.rtime + 5); B.target = null; }
    }
    B.stuckT = 0; B.lastPos.copy(P.pos);
  }
}

// the bot plays with toys now and then: rides a chair / cart and rams things, drives the forklift under a car
// and lifts it, presses the fire alarm, sprays an extinguisher. Returns null to fall back to smashing.
function botToys(B, dt) {
  const S = G.S;
  if (toys.riding()) {
    const R = toys.T.ride;
    B.rideT = (B.rideT || 0) - dt;
    if (R.kind === 'forklift') {
      // find a car, line up in front of it, raise the fork, lower it, get off
      let car = B.liftCar && !B.liftCar.removed ? B.liftCar : null;
      if (!car) { let bd = 1e9; for (const r of S.phys.records) { if (r.type !== 'car' || r.removed || r.riding) continue; const d = Math.hypot(r.body.position.x - P.pos.x, r.body.position.z - P.pos.z); if (d < bd) { bd = d; car = r; } } B.liftCar = car; }
      if (!car || B.rideT < -14) { toys.dismount(); B.toyCool = G.rtime + 20; return null; }
      if (R.carried) {
        B.liftHold = (B.liftHold || 0) + dt;
        if (B.liftHold > 2.2 && R.forkWant > 0.5) { toys.attack('punch'); }
        if (R.fork < 0.05 && R.forkWant === 0) { toys.dismount(); B.toyCool = G.rtime + 25; B.liftHold = 0; B.liftCar = null; return null; }
        return {};
      }
      const cp = car.body.position, q = car.body.quaternion;
      const cyaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
      // approach from the car's side (forks under the long side)
      const side = V(Math.cos(cyaw), 0, -Math.sin(cyaw));
      const s = (P.pos.x - cp.x) * side.x + (P.pos.z - cp.z) * side.z >= 0 ? 1 : -1;
      const front = V(cp.x + side.x * s * 2.35, 0, cp.z + side.z * s * 2.35);
      const d = Math.hypot(front.x - P.pos.x, front.z - P.pos.z);
      if (d < 0.45) {
        const want = Math.atan2(cp.x - P.pos.x, cp.z - P.pos.z);
        const dy = wrapA(want - R.yaw);
        if (Math.abs(dy) > 0.12) { B.move.set(Math.sin(want) * 0.5, 0, Math.cos(want) * 0.5); return {}; }
        if (R.forkWant < 0.5) toys.attack('punch');
        return {};
      }
      return { goal: front, near: 0.4 };
    }
    // chair / cart: charge at the nearest breakable thing for a few seconds
    if (B.rideT <= 0) { toys.dismount(); B.toyCool = G.rtime + 14; return null; }
    let tr = null, bd = 1e9;
    for (const r of S.phys.records) {
      if (r.removed || r.destroyed || r.held || r.riding || r.price <= 0 || r === R.rec) continue;
      const p = r.body.position, d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z);
      if (d < 1.0 || p.y > 1.6) continue;
      if (d < bd) { bd = d; tr = r; }
    }
    return tr ? { goal: V(tr.body.position.x, 0, tr.body.position.z), near: 0.1 } : {};
  }
  // extinguisher in hand: spray for a bit, then throw it
  if (P.held && WEAPON[P.held.type] === 'spray') {
    B.sprayT = (B.sprayT || 0) + dt;
    if (B.sprayT < 2.4 && toys.T.spray < 6.5) { B.spray = true; return {}; }
    B.sprayT = 0; throwHeld(); B.toyCool = G.rtime + 10; return null;
  }
  if (G.rtime < (B.toyCool || 6) || P.held) return null;
  // pick a toy: unalarmed fire bell, something to ride, an extinguisher
  if (!B.toy || B.toy.removed || B.toy.riding || G.rtime - B.toyT > 9) {
    B.toy = null; let bd = 14;
    for (const r of S.phys.records) {
      if (r.removed || r.held || r.riding || r.destroyed) continue;
      const ok = (RIDE[r.type] && recUpright(r) > 0.85) || (r.type === 'alarmBell' && !(S.toy && S.toy.alarmed)) || r.type === 'extinguisher';
      if (!ok || (B.skip.get(r) || 0) > G.rtime) continue;
      const d = Math.hypot(r.body.position.x - P.pos.x, r.body.position.z - P.pos.z) + (r.type === 'chair' ? 2 : 0);
      if (d < bd) { bd = d; B.toy = r; }
    }
    B.toyT = G.rtime;
    if (!B.toy) { B.toyCool = G.rtime + 8; return null; }
  }
  const r = B.toy, p = r.body.position;
  if (G.focus && G.focus.rec === r) {
    aimAt(p);
    if (RIDE[r.type]) B.rideT = r.type === 'forklift' ? 0 : 5;
    B.toyPress = (B.toyPress || 0) + dt;
    if (B.toyPress > 1.0) { B.skip.set(r, G.rtime + 30); B.toy = null; B.toyPress = 0; B.toyCool = G.rtime + 2; }
    return { interact: true };
  }
  B.toyPress = 0;
  const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z);
  if (d < 1.3) { aimAt(p); }
  if (G.rtime - B.toyT > 8) { B.skip.set(r, G.rtime + 20); B.toy = null; B.toyCool = G.rtime + 4; return null; }
  return { goal: V(p.x, 0, p.z), near: 0.9 };
}

// ================================================================ toys + the API floor modules see (hooks / scene `call`)
toys = createToys({
  G, P, fx, sfx, after, ui, TOUCH, report, vibrate,
  hitRec, destroyRec, addMoney, addItem, emit, alarmAt, npcCtx, syncRec, pickTarget,
  upright: recUpright,
  // toys hitting people (kind: ram / weapon / shout / blast / spray …, see PERSON_HIT) → true when it landed
  knockNpc: (n, dir, power, kind = 'knock', o = {}) => hitPerson(n, dir, kind, Object.assign({ power }, o)) > 0,
  collide(pos, r) {
    const S = G.S;
    let hit = collideCircle(pos, r, S.lists, 0);
    for (const n of S.npcs) {
      if (n.gone || n.state === 'air' || n.lying || n.state === 'wake') continue;
      const dx = pos.x - n.pos.x, dz = pos.z - n.pos.z, d = Math.hypot(dx, dz), m = r + n.r;
      if (d < m && d > 1e-4) { pos.x += dx / d * (m - d); pos.z += dz / d * (m - d); }
    }
    hit = collideCircle(pos, r, [S.F.rects], 0) || hit;
    return hit;
  },
  unseat: () => unseat(),
  destroyHeld() { const r = P.held; if (!r) return; P.held = null; if (r.group.parent) r.group.parent.remove(r.group); r.removed = true; r.destroyed = true; addItem(r.name, r.price); addMoney(Math.max(0, r.price - r.paid), null, true); emit('break', r); },
});
fight = createFight({
  G, P, fx, sfx, ui, report, vibrate, isCalm, shake, hitStop, camKick, setFace, bumpCombo, count, keepIn, npcCtx,
  // (딱! 보너스는 fight.js 가 난이도 배수를 이미 곱해서 준다 → raw)
  addMoney: (amt, pos, quiet, charge, label) => addMoney(amt, pos, quiet, charge, label, true),
  // 어려움: 쓰러지면 이 판 실패 (레벨 · 보스전). 다른 모드는 fight.js 가 잠시 뒤 일으켜 세운다
  onPlayerKo() { if (G.rampage) watchKo(); },
  breakCombo() { G.combo = 0; G.comboT = 0; ui.combo(0); },
  // a blow lands: get off the chair / cart, put the carried coworker down (held props stay in hand)
  onPlayerHit() { if (toys.riding()) toys.dismount(); if (P.carryNpc) releaseNpc(false); P.attackT = Math.max(P.attackT, 0.25); },
  // a perfect-guarded slipper flies back and bonks the boss
  hitNpc: (n, dir) => hitPerson(n, dir, 'thrown', { power: 0.7, dmg: 1 }),
  // walls / pillars / big fixtures at (x, z) up to height y (slipper flight, line of sight)
  solidAt(x, z, y = 1) {
    const S = G.S; if (!S) return false;
    const F = S.F, b = F.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
    for (const r of S.staticRects) if ((r.y1 == null || r.y1 > y) && pointInRect(r, x, z, 0.05)) return true;
    return false;
  },
});
const GAME = {
  get G() { return G; }, get P() { return P; }, get S() { return G.S; }, get F() { return G.S && G.S.F; },
  get rampage() { return G.rampage; }, get mode() { return G.mode; }, get floor() { return G.floorKind; }, get time() { return G.rtime; },
  fx, sfx, ui, after,
  npc: (who) => findNpc(who),
  npcs: (role) => (G.S ? G.S.npcs.filter((n) => !role || n.role === role) : []),
  rec: (tag) => recByTag(tag),
  recs: (pred) => (G.S ? G.S.phys.records.filter((r) => !r.removed && (!pred || pred(r))) : []),
  anchor: (name) => (G.S ? anchorPos(G.S, name) : null),
  say(n, text, sec = 2.6) { n = findNpc(n); if (n) n.say(text, sec, G.rtime); },
  subtitle: (speaker, text, ms) => ui.subtitle(speaker, text, ms),
  toast: (text, ms) => ui.toast(text, ms),
  walkNpc(n, to, o = {}) {
    n = findNpc(n); const p = anchorPos(G.S, to) || to; if (!n || !p) return;
    n.walkTo(npcCtx(), p.x, p.z, { speed: o.speed || 1.3, anim: o.anim || 'walk', onArrive: () => { n.char.setAnim(o.arrive || 'idle'); if (o.onArrive) o.onArrive(n); } });
  },
  money(amount, pos = null, label = null) { addMoney(amount, pos); if (label) addItem(label, amount); },
  emit: (kind, rec, n, value) => emit(kind, rec, n, value),
  stress: (d) => addStress(d),
  alarm: (pos, rad) => alarmAt(pos, rad),
  hitRec: (rec, dmg, dir, power, opts) => hitRec(rec, dmg, dir || V(), power || 0, opts || {}),
  setState: (rec, s) => toys.setState(rec, s),
  triggerAlarm: (rec) => toys.triggerAlarm(rec || null),
};

// 그만두기: 레벨은 '조퇴 처리'(별 없음, 기록 안 남김), 나머지는 지금까지로 청구서
function quitRun() {
  togglePause(false);
  if (G.mode === 'story' && G.level && !G.failed) G.failed = 'quit';
  G.rampage = false;
  showBill();
}

// ================================================================ handlers + boot
ui.init({
  start(mode, opts) { start(mode, opts); },
  pause() { togglePause(!G.paused); },
  resume() { togglePause(false); },
  skipTask() {
    togglePause(false);
    if (G.mode === 'story' && STORY[G.scene] && G.phase !== 'boil') { G.gen++; G.transN++; G.timers.length = 0; G.busy = false; P.controls = true; STORY[G.scene].skip(); }
  },
  quit() { quitRun(); },
  toTitle() { toTitle(); },
  retry() { ui.bill(null); start(G.mode, G.opts); },
  // 레벨: 다음 레벨 / 레벨 선택 창 / 고른 레벨 시작 / 난이도
  next() { const n = (G.level || 0) + 1; ui.bill(null); if (n <= LEVEL_N && levelOpen(n)) start('story', Object.assign({}, G.opts, { level: n })); else { toTitle(); ui.levels(true, titleData()); } },
  levels() { if (G.mode !== 'title') toTitle(); ui.levels(true, titleData()); },
  level(n) { n = n | 0; if (n >= 1 && n <= LEVEL_N && levelOpen(n)) { ui.levels(false); start('story', { level: n, gender: ui.settings.gender }); } },
  diff(id) { if (DIFF.setDiff) DIFF.setDiff(id); if (G.mode === 'title') { ui.title(true, titleData()); ui.levelsRefresh(titleData()); } },
  elevator(id) { onElevator(id); },
  action(name, down) { onAction(name, down); },
  setting(key, val) {
    if (key === 'sfx' || key === 'bgm') audio.setEnabled({ [key]: !!val });
    else if (key === 'gender') setPlayerChar(val === 'f' ? 'f' : 'm');
    else if (key === 'gfx') gfx.setMode(val);
  },
});
P.char = makePlayerChar(ui.settings.gender);
try { toTitle(); } catch (e) { report(e); }
requestAnimationFrame(frame);

// ================================================================ debug hook
if (DEBUG) {
  _bot = { on: false, move: V(), interact: false, attack: false, kick: false, special: false, guard: false, path: null, pathI: 0, pathT: 0, goal: V(), target: null, targetT: 0, skip: new Map(), dest: null, forceDest: null };
  const info = () => { const i = gfx.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures }; };
  window.__ppg = {
    G, P, gfx, fx, scene, camera,
    get errors() { return G.errors; },
    get fast() { return G.fast; }, set fast(v) { G.fast = !!v; },
    state() {
      const S = G.S;
      const pc = S ? S.phys.counts() : null;
      return {
        mode: G.mode, scene: G.scene, phase: G.phase, floor: G.floorKind, preset: G.preset, busy: G.busy, paused: G.paused,
        stress: Math.round(G.stress), money: Math.round(G.money), timeLeft: G.timeLeft == null ? null : +G.timeLeft.toFixed(2),
        player: { x: +P.pos.x.toFixed(2), y: +P.y.toFixed(2), z: +P.pos.z.toFixed(2), yaw: +P.yaw.toFixed(2), anim: P.char.anim, face: P.char.face, seated: !!P.seated, carry: P.carryKind, held: P.held ? P.held.type : null },
        tasks: G.rampage ? G.taskShown.map((t) => t.text + (t.done ? ' ✓' : '')) : (G.storyTasks || []).map((t) => t.text + (t.done ? ' ✓' : '')),
        focus: G.focus ? G.focus.text : null, objective: G.obj ? { x: +G.obj.pos.x.toFixed(2), z: +G.obj.pos.z.toFixed(2), kind: G.obj.kind || (G.obj.cand ? 'interact' : 'goto'), dest: G.obj.dest || null } : null,
        bodies: pc, npcs: S ? { total: S.npcs.length, gone: S.npcs.filter((n) => n.gone).length, panicked: S.npcs.filter((n) => n.panicked).length, knocked: S.npcs.reduce((a, n) => a + n.hitCount, 0), ko: S.npcs.filter((n) => n.isKo).length, koTotal: S.npcs.reduce((a, n) => a + n.koCount, 0) } : null,
        items: [...G.items.values()].length, counts: G.counts, combo: G.combo, special: +G.special.toFixed(2),
        fps: G.fps, quality: gfx.level, post: gfx.usingPost, render: info(), errors: G.errors.length, rtime: +G.rtime.toFixed(2), bill: G.lastBill || null,
        floorsBuilt: Object.fromEntries(Object.entries(G.floors).map(([k, s]) => [k, s.buildMs])),
        toys: toys.state(), fcounts: G.fcounts[G.floorKind] || {},
        challenges: G.taskPool ? G.taskPool.map((t) => ({ id: t.id, text: t.text, key: t.key, need: t.need, p: chalProgress(t), done: t.done })) : [],
        fight: fight.state(),
        fighters: S ? S.npcs.filter((n) => n.fighter).map((n) => ({ i: S.npcs.indexOf(n), rank: n.fighter.rank, name: fight.nameOf(n), state: n.state, mental: n.mental, ko: n.isKo, beaten: n.beaten })) : [],
      };
    },
    // ---- 반격 / 막기 / 이름 (tests)
    names(o, save = false) { if (o) ui.setNames(o, save); return Object.assign({}, ui.names); },
    fight: {
      get api() { return fight; },
      state: () => fight.state(),
      // make npc q a fighter ('boss' | 'mid' | 'angry'); attack(q) = wind up right now (melee | throw)
      make(q, rank = 'mid') { const n = __ppg._n(q); return fight.make(n, rank); },
      attack(q, atk = 'melee') { const n = __ppg._n(q); return fight.attackNow(n, atk); },
      hearts(h) { if (h != null) { fight.FT.hearts = h; fight.hud(); } return fight.FT.hearts; },
      // player blow from npc q (or from the front): bypasses the AI, same rules (guard / perfect / hearts)
      hitPlayer(q) { const n = q != null ? __ppg._n(q) : null; const d = n ? V(P.pos.x - n.pos.x, 0, P.pos.z - n.pos.z).normalize() : V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); return fight.hitPlayer(n, d, 'melee'); },
      resetMax() { fight.resetMaxAttackers(); return true; },
      tune: () => ({ TUNE: fight.TUNE, RANK: fight.RANK }),
    },
    _n(q) { const L = G.S ? G.S.npcs : []; return typeof q === 'number' ? L[q] : L.find((x) => x.id === q) || L.find((x) => x.fighter && x.fighter.rank === q) || L.find((x) => x.role === q); },
    // ---- floors / toys helpers (debug + tests)
    floors() { return FLOOR_LIST.map((f) => Object.assign({}, f, { built: !!G.floors[f.id], wrecked: G.floors[f.id] ? G.floors[f.id].phys.records.filter((r) => r.destroyed || r.removed).length : 0 })); },
    chal(floor) { const C = G.chal[floor || G.floorKind]; return C ? C.pool.map((t) => ({ id: t.id, text: t.text, key: t.key, need: t.need, done: t.done, shown: C.shown.includes(t) })) : null; },
    rec(tag) { const r = recByTag(tag); return r ? { id: r.id, type: r.type, x: +r.body.position.x.toFixed(2), y: +r.body.position.y.toFixed(2), z: +r.body.position.z.toFixed(2), hp: r.hp, hpMax: r.hpMax, stage: r.stage, destroyed: r.destroyed, fixed: r.fixed } : null; },
    recs(type) { return G.S.phys.records.filter((r) => r.type === type && !r.removed).map((r) => ({ id: r.id, tag: r.tag, x: +r.body.position.x.toFixed(2), z: +r.body.position.z.toFixed(2), hp: r.hp, destroyed: r.destroyed, stage: r.stage })); },
    // stand `dist` metres from a record (by id, tag or first of a type), facing it; side picks the approach direction
    near(q, dist = 1.0, side = null) {
      const r = typeof q === 'number' ? G.S.phys.records[q] : recByTag(q) || G.S.phys.records.find((x) => x.type === q && !x.removed && !x.destroyed);
      if (!r) return null;
      const p = r.body.position;
      let dx, dz;
      if (side) { dx = side[0]; dz = side[1]; } else { dx = P.pos.x - p.x; dz = P.pos.z - p.z; }
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      P.pos.set(p.x + dx * dist, 0, p.z + dz * dist); P.vel.set(0, 0, 0); P.y = 0;
      P.yaw = Math.atan2(-dx, -dz); placePlayer(); snapCamera(); CAM.yaw = P.yaw; updateCamera(0, true);
      return { id: r.id, type: r.type, x: +P.pos.x.toFixed(2), z: +P.pos.z.toFixed(2) };
    },
    // spawn any prop straight into the player's hands (weapons test: give('tambourine'))
    give(type, opts = {}) {
      const S = G.S, p = makeAny(type, opts);
      S.F.group.add(p.group);
      const rec = S.phys.addProp(p, P.pos.x, 1.0, P.pos.z, P.yaw, opts.tag || null, { prop: p, type });
      pickUp(rec); return rec.id;
    },
    toys,
    emit,
    // ---- feel / sound checks
    sfxLog(clear = false) { const l = SFX_LOG.slice(); if (clear) { SFX_LOG.length = 0; for (const k in SFX_COUNT) delete SFX_COUNT[k]; } return l; },
    sfxCount() { return Object.assign({}, SFX_COUNT); },
    feel(clear = false) {
      const o = { hs: FEEL.hs.slice(), hitStop: +G.hitStop.toFixed(3), shake: +G.shake.toFixed(3), shakeOff: +CAM.shakeOff.toFixed(4), kick: +FEEL.kick.length().toFixed(4), fov: +camera.fov.toFixed(2), fovPunch: +FEEL.fov.toFixed(2), big: FEEL.big, lastShock: G.lastShock || null, comboMiles: G.comboMiles || [], cabin: CAM.cabin, arrive: !!G.arrive, pitch: +CAM.pitch.toFixed(3), cam: camera.position.toArray().map((v) => +v.toFixed(2)), timeScale: G.timeScale, slowT: +G.slowT.toFixed(3) };
      if (clear) { FEEL.hs.length = 0; G.comboMiles = []; FEEL.big = 0; }
      return o;
    },
    fxStats() { return fx.stats(); },
    // ---- people (KO tests): npc(i | id | role) → pos / state / 멘탈; spawn extras; stand in front of one
    npc(q) {
      const L = G.S ? G.S.npcs : [];
      const n = typeof q === 'number' ? L[q] : L.find((x) => x.id === q) || L.find((x) => x.role === q) || L.find((x) => x.spec.name === q);
      if (!n) return null;
      return { i: L.indexOf(n), id: n.id, role: n.role, name: n.spec.name || null, x: +n.pos.x.toFixed(2), y: +n.y.toFixed(2), z: +n.pos.z.toFixed(2), yaw: +n.yaw.toFixed(2), state: n.state, mental: n.mental, mentalMax: n.mentalMax, ko: n.isKo, koCount: n.koCount, koT: +n.koT.toFixed(2), koLen: +n.koLen.toFixed(2), anim: n.char.anim, face: n.char.face, seated: !!n.seated, gone: n.gone, visible: n.group.visible, inScene: !!n.group.parent, stars: n.starsOn, ghost: n.ghostOn, bubble: n.bubble && n.bubble.until > G.rtime ? n.bubble.text : null, head: n.head.toArray().map((v) => +v.toFixed(2)), rotX: +n.group.rotation.x.toFixed(2), fighter: n.fighter ? n.fighter.rank : null, hothead: !!n.hothead, beaten: n.beaten, tag: n.fighter ? fight.nameOf(n) : null, tagShown: !!(n._tag && n._tag.sprite.visible), bang: !!(n._bang && n._bang.visible), t: +n.t.toFixed(2) };
    },
    npcs() { return G.S ? G.S.npcs.map((n, i) => __ppg.npc(i)) : []; },
    spawnNpc(x, z, o = {}) {
      const n = new NPC(Object.assign({ preset: 'workerM2', x, z, rotY: 0, anim: 'idle', role: 'worker', id: 'extra' + G.S.npcs.length, variantSeed: 500 + G.S.npcs.length }, o));
      G.S.npcs.push(n); G.S.F.group.add(n.group); return G.S.npcs.length - 1;
    },
    faceNpc(q, dist = 1.0) {
      const L = G.S.npcs, n = typeof q === 'number' ? L[q] : L.find((x) => x.id === q) || L.find((x) => x.role === q);
      if (!n) return null;
      let dx = Math.sin(n.yaw), dz = Math.cos(n.yaw); // in front of them
      P.pos.set(n.pos.x + dx * dist, 0, n.pos.z + dz * dist); P.vel.set(0, 0, 0); P.y = 0;
      P.yaw = Math.atan2(-dx, -dz); placePlayer(); snapCamera(); CAM.yaw = P.yaw; updateCamera(0, true);
      return { x: +P.pos.x.toFixed(2), z: +P.pos.z.toFixed(2) };
    },
    koStats() { return fx.koStats(); },
    stressCap: () => storyStressCap(),
    stressLog: () => (G.stressLog || []).slice(),
    // drop any prop on the floor at (x, z) (tests: a chair in an empty aisle)
    spawn(type, x, z, rotY = 0, opts = {}) {
      const S = G.S, p = makeAny(type, opts);
      S.F.group.add(p.group);
      return S.phys.addProp(p, x, 0, z, rotY, opts.tag || null, { prop: p, type }).id;
    },
    // a hit on record `id` as if from the player (direct: counts combo / hit-stop / kick like a punch)
    hit(id, dmg = 1, power = 0, o = {}) {
      const r = G.S.phys.records[id]; if (!r) return null;
      const d = V(r.body.position.x - P.pos.x, 0, r.body.position.z - P.pos.z); if (d.lengthSq() < 1e-4) d.set(0, 0, 1); d.normalize();
      hitRec(r, dmg, d, power, Object.assign({ direct: true }, o)); return { hp: r.hp, destroyed: r.destroyed, paid: r.paid, price: r.price };
    },
    calm(on = true) { ui.settings.calm = !!on; document.documentElement.classList.toggle('calm', !!on); return ui.settings.calm; },
    // camera forward vector (pitch check: y < 0 looks down)
    camDir() { const d = V(); camera.getWorldDirection(d); return d.toArray().map((v) => +v.toFixed(3)); },
    start(mode, opts) { G.fast = true; return start(mode, opts || {}); },
    goto(id) {
      G.fast = true;
      if (G.mode !== 'story') { G.mode = 'story'; G.level = 0; ui.title(false); disposeFloors(); resetDamage(); }
      if (G.level && STORY[id] && levelOf(G.level).scene !== id) G.level = 0; // (다른 상황으로 뛰면 하루 모드로)
      ui.bill(null);
      if (id === 'rampage') {
        G.gen++; G.transN++; G.timers.length = 0;
        G.preset = 'sunset'; enterFloor('office'); resetPlayer(); P.pos.copy(G.S.F.anchors.rushSpawn); snapCamera(); setStress(100, false);
        startRampage(); return true;
      }
      if (id === 'bill') { G.gen++; showBill(); return true; }
      gotoScene(id); return true;
    },
    step(n = 1) {
      G.manual = true;
      for (let i = 0; i < n; i++) { try { tick(FIXED); } catch (e) { report(e); } }
      renderNow();
      return __ppg.state();
    },
    realtime() { G.manual = false; last = performance.now(); },
    auto(on = true) { _bot.on = !!on; _bot.path = null; return _bot.on; },
    bot: _bot,
    tp(x, z) { P.pos.set(x, 0, z); P.vel.set(0, 0, 0); placePlayer(); snapCamera(); return [x, z]; },
    time(p) { applyTime(p); return p; },
    yaw(a) { CAM.yaw = a; P.yaw = a; updateCamera(0, true); },
    look(yaw, pitch) { CAM.yaw = yaw; if (pitch != null) CAM.pitch = pitch; CAM.lastLook = G.rtime + 1e6; updateCamera(0, true); renderNow(); },
    ride(dest) { _bot.forceDest = dest; return dest; },
    quit() { quitRun(); return true; },
    // ---- 레벨 · 난이도 (tests)
    level(n = 1) { G.fast = true; return start('story', { level: n }); },
    levels: () => ({ rows: levelRows(), stars: starsTotal(), next: nextLevel(), save: JSON.parse(JSON.stringify(save)) }),
    levelSelect(show = true) { if (show && G.mode !== 'title') toTitle(); ui.levels(!!show, titleData()); return !!show; },
    unlock(n = LEVEL_N) { for (let i = 1; i < n; i++) if (!lvSave(i).clear) save.lv[i] = { stars: lvSave(i).stars, best: lvSave(i).best, clear: true }; writeSave(); return levelRows().filter((r) => r.open).length; },
    resetLevels() { save.lv = {}; writeSave(); return true; },
    // 지금 상황 건너뛰기 (레벨: 바로 끓어올라 난동으로)
    skip() { if (G.mode === 'story' && STORY[G.scene] && G.phase !== 'boil') { G.gen++; G.transN++; G.timers.length = 0; G.busy = false; P.controls = true; STORY[G.scene].skip(); return true; } return false; },
    diff(id) { if (id && DIFF.setDiff) DIFF.setDiff(id); return Object.assign({ id: DIFF.getDiff ? DIFF.getDiff() : 'normal' }, DD()); },
    koRule: () => koRule(),
    // npc q 를 주인공이 때린 것처럼 (mental 을 주면 먼저 그만큼으로: 보스 격파 시험)
    hitNpc(q, kind = 'punch', mental = null) {
      const n = __ppg._n(q); if (!n) return null;
      if (mental != null) n.mental = mental;
      const d = V(n.pos.x - P.pos.x, 0, n.pos.z - P.pos.z); if (d.lengthSq() < 1e-4) d.set(0, 0, 1); d.normalize();
      hitPerson(n, d, kind, {}); return __ppg.npc(G.S.npcs.indexOf(n));
    },
    pause(on = true) { togglePause(!!on); return G.paused; },
    render() { renderNow(); return info(); },
    info,
    quality(l) { gfx.setQuality(l); return gfx.level; },
    // 화질 모드 ('auto' | 'fast' | 'pretty') · 자동 화질 상태
    gfxMode(m) { if (m) gfx.setMode(m); return gfx.adaptState(); },
  };
}
