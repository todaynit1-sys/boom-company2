// 회사 뿌개기 — shared toys. Everything here works on any floor that places the matching props; floors never
// call into this file directly. Triggered from main.js through: candidate() (E prompts), attack()/special()
// (consumed when riding or holding a weapon), update(dt) (rides, spray, rain, windows, out-throws),
// afterHit(rec) / onDestroy(rec) (staged cars, safes, tanks, drums, balloons, hanging things).
//
//   ride        chair / cart (E 타기 → WASD rolls fast, ramming damages + counts 'ram'), forklift (attack raises /
//               lowers the fork, lifts and tips cars → 'lift')
//   weapons     hold:true props (+ extinguisher): E 들기. megaphone → attack/Q shout ('shout'), tambourine jingles
//               ('weapon'), trophy / bottle clubs, extinguisher → hold attack to spray, get pushed, fly ('fly')
//   alarmBell   E 비상벨 누르기 (or break it) → every sprinkler on the floor rains, puddles, people flee ('alarm')
//   car         hp thresholds → set(1..4): glass, dents, wheel off, wreck ('carStage' n = stage)
//   ceoSafe / aquarium / sojuFridge / watertank / balloon / drum / gate / barrierGate: break states + effects
//   windows     ctx.window() panes break when hit or when something is thrown through; anything past an out-zone
//               falls away → distant crash + money ('out')
import * as THREE from 'three';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
function wrapA(a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }

export const RIDE = {
  chair: { label: '바퀴의자', speed: 6.4, accel: 2.6, r: 0.42, y: 0, anim: 'sit', ram: 1, back: 0.04, yawOff: 0, seatBack: 0 },
  cart: { label: '택배 카트', speed: 7.0, accel: 2.4, r: 0.52, y: 0.19, anim: 'rageIdle', ram: 1.3, back: -0.15, yawOff: -PI / 2, seatBack: 0 },
  forklift: { label: '지게차', speed: 3.8, accel: 1.8, r: 0.9, y: 0.42, anim: 'sit', ram: 2.4, back: -0.35, yawOff: 0, seatBack: 0, steer: true },
};
// held weapon behaviour by prop type
export const WEAPON = { megaphone: 'shout', tambourine: 'jingle', trophy: 'club', bottle: 'bottle', beerMug: 'bottle', extinguisher: 'spray' };
const WEAPON_TEXT = { shout: '소리치기', jingle: '흔들기', club: '휘두르기', bottle: '휘두르기', spray: '뿌리기(누르고 있기)' };
const CAR_HP = { normal: 18, boss: 26 };
const SPRAY_MAX = 7; // seconds of extinguisher

export function createToys(api) {
  const { G, P, fx, sfx, after, ui } = api;
  const T = {
    ride: null,        // { rec, kind, spec, vel: Vector3, yaw, fork, forkWant, carried, carry, cool: Map }
    spray: 0, sprayT: 0, flew: false, shoutCool: 0, swingCool: 0, sprayV: V(), sprayY: 0,
  };
  const _v = V(), _w = V(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

  // ------------------------------------------------------------- per floor setup (once, lazily)
  function prep(S) {
    if (S.toy) return S.toy;
    const st = S.toy = { alarmT: 0, bellT: 0, rainT: 0, rainAcc: 0, puddles: null, puddleK: 0, alarmed: false };
    for (const r of S.phys.records) {
      if (r.type === 'car') { r.hpMax = r.hp = r.prop.name === '사장님 차' ? CAR_HP.boss : CAR_HP.normal; }
      if (r.type === 'balloon' || r.prop.floats) r.hpMax = r.hp = 1;
    }
    return st;
  }
  function setState(rec, s) {
    if (!rec.prop.set) return;
    if (rec.inst) rec.inst(rec); // leave the instanced batch before moving inner parts
    try { rec.prop.set(s); } catch (e) { api.report(e); }
  }
  const recPos = (r, out = V()) => out.set(r.body.position.x, r.body.position.y, r.body.position.z);
  const fwd = () => V(Math.sin(P.yaw), 0, Math.cos(P.yaw));

  // ------------------------------------------------------------- E prompts
  function candidate() {
    const S = G.S; if (!S) return null;
    prep(S);
    if (T.ride) {
      const k = T.ride.kind;
      return { id: 'ride-off', pos: P.pos.clone(), h: 2.1, obj: null, text: '내리기', hold: 0, range: 99, onDone: () => dismount() };
    }
    if (P.held || P.carry) return null;
    const f = fwd();
    let best = null, bs = 1e9;
    for (const r of S.phys.records) {
      if (r.removed || r.held || r.destroyed && r.type !== 'forklift') continue;
      const kind = RIDE[r.type] ? 'ride' : r.type === 'alarmBell' && !S.toy.alarmed ? 'alarm' : null;
      if (!kind) continue;
      const p = r.body.position;
      if (kind === 'ride' && (r.flipped || api.upright(r) < 0.85)) continue;
      const dx = p.x - P.pos.x, dz = p.z - P.pos.z, d = Math.hypot(dx, dz);
      const reach = (kind === 'alarm' ? 1.5 : 0.9) + Math.min(0.9, Math.max(r.hx, r.hz) * 0.75);
      if (d > reach) continue;
      const a = d > 0.01 ? Math.acos(clamp((dx * f.x + dz * f.z) / d, -1, 1)) : 0;
      if (a > 1.2 && d > 0.7) continue;
      // rides must be in front of you (standing on a chair at a desk still flips the desk)
      if (kind === 'ride' && (d < 0.3 || a > 1.0)) continue;
      const s = d + a * 0.8 + (kind === 'ride' ? 0.5 : -0.15);
      if (s < bs) { bs = s; best = { r, kind }; }
    }
    if (!best) return null;
    const r = best.r;
    if (best.kind === 'alarm') return { id: 'alarm' + r.id, rec: r, score: bs, pos: V(r.body.position.x, 0, r.body.position.z), h: r.body.position.y + 0.35, obj: r.group, text: '비상벨 누르기', hold: 0.3, range: 99, onDone: () => triggerAlarm(r) };
    return { id: 'ride' + r.id, rec: r, toy: true, score: bs, pos: V(r.body.position.x, 0, r.body.position.z), h: r.body.position.y + r.hy + 0.5, obj: r.group, text: RIDE[r.type].label + ' 타기', hold: 0, range: 99, onDone: () => mount(r) };
  }
  // label for the "throw / use" prompt while holding something
  function heldText() { const w = P.held && WEAPON[P.held.type]; return w ? WEAPON_TEXT[w] : null; }
  const isWeapon = (rec) => !!(rec && WEAPON[rec.type]);

  // ------------------------------------------------------------- rides
  function mount(rec) {
    const S = G.S, spec = RIDE[rec.type];
    if (!spec || T.ride) return;
    api.unseat && api.unseat();
    rec.riding = true; rec.solid = false; rec.kicked = true;
    S.phys.setKinematic(rec, true);
    rec.body.allowSleep = false;
    // stand where the vehicle is, face its forward
    const q = rec.body.quaternion;
    const yawR = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    const yaw = wrapA(yawR - spec.yawOff);
    T.ride = { rec, kind: rec.type, spec, vel: V(), yaw, fork: 0, forkWant: 0, carried: null, carry: null, cool: new Map(), t: 0 };
    P.yaw = yaw; P.vel.set(0, 0, 0);
    P.pos.set(rec.body.position.x, 0, rec.body.position.z);
    P.char.setAnim(spec.anim);
    sfx(rec.type === 'forklift' ? 'engine' : 'pickup', { vol: 0.6 });
    if (rec.type === 'forklift') ui.toast(api.TOUCH ? '때리기 버튼: 포크 올리기 / 내리기' : '클릭·Z: 포크 올리기 / 내리기', 2200);
  }
  function dismount() {
    const R = T.ride; if (!R) return;
    const S = G.S, rec = R.rec;
    if (R.carried) dropCarried(true);
    T.ride = null;
    rec.riding = false; rec.body.allowSleep = true;
    S.phys.setKinematic(rec, false);
    rec.body.velocity.set(R.vel.x, 0.2, R.vel.z); // a chair keeps rolling
    rec.energized = S.phys.time + 1.5;
    // step off to the right
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    P.pos.x += -rx * (R.spec.r + 0.35); P.pos.z += -rz * (R.spec.r + 0.35);
    P.y = 0; P.vy = 0; P.onGround = true;
    P.char.setAnim('idle');
    sfx('land', { vol: 0.4 });
  }
  // movement while riding (mx, mz = desired world direction, |m| ≤ 1). Called instead of walking.
  function updateRide(dt, mx, mz) {
    const R = T.ride, S = G.S, rec = R.rec, spec = R.spec;
    R.t += dt;
    if (rec.removed) { T.ride = null; P.char.setAnim('idle'); return; }
    const m = Math.hypot(mx, mz);
    const f = V(Math.sin(R.yaw), 0, Math.cos(R.yaw));
    if (spec.steer) {
      // forklift: tank-ish steering, can reverse
      if (m > 0.15) {
        const want = Math.atan2(mx, mz), dot = (mx * f.x + mz * f.z) / m;
        const target = dot < -0.35 ? wrapA(want + PI) : want;
        R.yaw += clamp(wrapA(target - R.yaw), -1.9 * dt, 1.9 * dt);
        const sp = (dot < -0.35 ? -0.6 : 1) * spec.speed * Math.min(1, m);
        R.vel.lerp(_v.set(Math.sin(R.yaw) * sp, 0, Math.cos(R.yaw) * sp), Math.min(1, dt * spec.accel));
      } else R.vel.multiplyScalar(1 - Math.min(1, dt * 3));
    } else {
      const sp = spec.speed * Math.min(1, m);
      R.vel.lerp(_v.set(mx * spec.speed, 0, mz * spec.speed), Math.min(1, dt * (m > 0.1 ? spec.accel : 1.1)));
      const s = Math.hypot(R.vel.x, R.vel.z);
      if (s > 0.4) R.yaw += wrapA(Math.atan2(R.vel.x, R.vel.z) - R.yaw) * Math.min(1, dt * 6);
      void sp;
    }
    const speed = Math.hypot(R.vel.x, R.vel.z);
    P.prev.copy(P.pos);
    P.pos.x += R.vel.x * dt; P.pos.z += R.vel.z * dt;
    // ram things in front
    if (speed > 2.2) ram(R, speed);
    // walls / heavy things stop us (bounce a bit)
    const hit = api.collide(P.pos, spec.r);
    if (hit) { const real = Math.hypot(P.pos.x - P.prev.x, P.pos.z - P.prev.z) / Math.max(dt, 1e-4); if (real < speed * 0.6) R.vel.multiplyScalar(0.5); }
    P.yaw = R.yaw; P.speed = Math.hypot(P.pos.x - P.prev.x, P.pos.z - P.prev.z) / Math.max(dt, 1e-4);
    // vehicle body follows (kinematic, slightly behind the integration so it lands on the player)
    const yawV = R.yaw + spec.yawOff;
    const bx = P.pos.x - Math.sin(R.yaw) * spec.back, bz = P.pos.z - Math.cos(R.yaw) * spec.back;
    rec.body.velocity.set(R.vel.x, 0, R.vel.z);
    rec.body.position.set(bx - R.vel.x * dt, rec.hy, bz - R.vel.z * dt);
    rec.body.quaternion.setFromEuler(0, yawV, 0);
    rec.body.angularVelocity.set(0, 0, 0);
    // forklift fork + carried car
    if (R.kind === 'forklift') {
      const k = Math.min(1, dt * 0.85);
      R.fork += clamp(R.forkWant - R.fork, -k, k);
      setState(rec, R.fork);
      if (R.fork > 0.1 && !R.carried) tryLift(R);
      if (R.carried) carryUpdate(R, dt);
      if (R.carried && R.fork < 0.06 && R.forkWant === 0) dropCarried(false);
    }
    P.y = spec.y;
    P.onGround = true;
    P.char.group.position.set(P.pos.x, P.y, P.pos.z);
    P.char.group.rotation.y = P.yaw;
    if (P.char.anim !== spec.anim) P.char.setAnim(spec.anim);
    P.char.update(dt, R.kind === 'cart' ? 0 : 0);
    S.phys.setPlayer(P.pos.x, P.y, P.pos.z, R.vel.x, 0, R.vel.z);
  }
  function ram(R, speed) {
    const S = G.S, f = V(R.vel.x, 0, R.vel.z).normalize();
    const cx = P.pos.x + f.x * R.spec.r * 0.8, cz = P.pos.z + f.z * R.spec.r * 0.8;
    const now = G.rtime;
    for (const r of S.phys.records) {
      if (r === R.rec || r.removed || r.held || r === R.carried) continue;
      const p = r.body.position;
      if (p.y > 1.9) continue;
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d > R.spec.r * 0.6 + Math.min(1.2, Math.max(r.hx, r.hz) * 0.85)) continue;
      if ((R.cool.get(r) || 0) > now) continue;
      R.cool.set(r, now + 0.7);
      api.hitRec(r, R.spec.ram > 2 ? 2 : 1, f, speed * 0.45 * R.spec.ram, { direct: true, big: true, ram: true });
      api.emit('ram', R.rec);
      sfx('crash', { vol: 0.45, pitch: rnd(1.1, 1.3) });
      G.shake = Math.max(G.shake, 0.35);
      R.vel.multiplyScalar(r.heavy ? 0.35 : 0.7);
      break;
    }
    for (const n of S.npcs) {
      if (n.gone || n.state === 'air' || n.state === 'down') continue;
      if (Math.hypot(n.pos.x - cx, n.pos.z - cz) > R.spec.r * 0.6 + 0.35) continue;
      if ((R.cool.get(n) || 0) > now) continue;
      R.cool.set(n, now + 1);
      if (api.knockNpc(n, f, 1.1)) { api.emit('ram', R.rec); api.emit('knock'); sfx('punch', { vol: 0.7 }); }
    }
  }
  // forklift: lift whatever heavy thing sits on the forks (cars first)
  function tryLift(R) {
    const S = G.S, f = V(Math.sin(R.yaw), 0, Math.cos(R.yaw)), rt = V(Math.cos(R.yaw), 0, -Math.sin(R.yaw));
    let best = null, bd = 1e9;
    for (const r of S.phys.records) {
      if (r === R.rec || r.removed || r.held || r.fixed || r.riding) continue;
      if (!(r.type === 'car' || r.mass >= 30)) continue;
      const dx = r.body.position.x - P.pos.x, dz = r.body.position.z - P.pos.z;
      const along = dx * f.x + dz * f.z, lat = dx * rt.x + dz * rt.z;
      // half-extents of the thing along / across the forks
      const q = r.body.quaternion, ry = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)), d = R.yaw - ry;
      const ext = r.hx * Math.abs(Math.sin(d)) + r.hz * Math.abs(Math.cos(d)), latExt = r.hx * Math.abs(Math.cos(d)) + r.hz * Math.abs(Math.sin(d));
      if (along - ext < -0.3 || along - ext > 2.05 || Math.abs(lat) > latExt + 0.3) continue;
      if (along < bd) { bd = along; best = r; }
    }
    if (!best) return;
    const r = best;
    if (r.inst) r.inst(r);
    S.phys.setKinematic(r, true);
    r.riding = true; r.body.allowSleep = false;
    const dx = r.body.position.x - P.pos.x, dz = r.body.position.z - P.pos.z;
    const q = r.body.quaternion;
    const ry = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    R.carried = r;
    R.carry = { along: dx * f.x + dz * f.z, lat: dx * rt.x + dz * rt.z, yaw: wrapA(ry - R.yaw), y0: r.body.position.y, counted: false };
    sfx('breakMetal', { vol: 0.5, pitch: 0.7 });
    G.shake = Math.max(G.shake, 0.3);
  }
  function carryUpdate(R, dt) {
    const r = R.carried, c = R.carry;
    const f = V(Math.sin(R.yaw), 0, Math.cos(R.yaw)), rt = V(Math.cos(R.yaw), 0, -Math.sin(R.yaw));
    const lift = R.fork * 1.45;
    const x = P.pos.x + f.x * c.along + rt.x * c.lat, z = P.pos.z + f.z * c.along + rt.z * c.lat;
    r.body.position.set(x, c.y0 + lift, z);
    // tip it back toward the mast as it rises
    _e.set(0, 0, 0, 'YXZ'); _e.y = R.yaw + c.yaw; _q.setFromEuler(_e);
    const tip = new THREE.Quaternion().setFromAxisAngle(rt, -R.fork * 0.32);
    r.body.quaternion.set(_q.x, _q.y, _q.z, _q.w);
    const bq = new THREE.Quaternion(r.body.quaternion.x, r.body.quaternion.y, r.body.quaternion.z, r.body.quaternion.w).premultiply(tip);
    r.body.quaternion.set(bq.x, bq.y, bq.z, bq.w);
    r.body.velocity.set(R.vel.x, 0, R.vel.z);
    api.syncRec(r);
    if (!c.counted && lift > 0.5) {
      c.counted = true;
      api.emit('lift', r);
      api.addMoney(Math.round(Math.max(20000, r.price * 0.1) / 1000) * 1000, V(x, c.y0 + lift + 1, z), false, true);
      ui.toast('번쩍! 차를 들어 올렸다', 1600);
      sfx('whoosh', { vol: 0.8, pitch: 0.6 });
    }
  }
  function dropCarried(tip) {
    const R = T.ride || {}, r = R.carried;
    if (!r) return;
    const S = G.S;
    R.carried = null; R.carry = null;
    r.riding = false; r.body.allowSleep = true;
    S.phys.setKinematic(r, false);
    r.energized = S.phys.time + 3;
    r.body.wakeUp();
    if (tip || r.body.position.y > r.hy + 0.4) {
      const rt = V(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
      r.body.angularVelocity.set(rt.x * rnd(1.5, 3), rnd(-0.5, 0.5), rt.z * rnd(1.5, 3));
    }
  }

  // ------------------------------------------------------------- attack / special while riding or holding
  function attack(kind) {
    if (T.ride) {
      if (T.ride.kind === 'forklift') { T.ride.forkWant = T.ride.forkWant > 0.5 ? 0 : 1; sfx('beep', { vol: 0.5 }); P.attackT = 0.35; }
      else { P.attackT = 0.3; } // no punching from a chair
      return true;
    }
    const w = P.held && WEAPON[P.held.type];
    if (!w) return false;
    if (w === 'spray') { if (T.spray < SPRAY_MAX) return true; club(1); return true; } // spraying is handled in update (hold)
    if (w === 'shout') { shout(); return true; }
    club(w === 'bottle' ? 2 : w === 'jingle' ? 1 : 2, w);
    return true;
  }
  function special() {
    if (P.held && WEAPON[P.held.type] === 'shout') { shout(true); return true; }
    if (T.ride) return true;
    return false;
  }
  function club(dmg, w = 'club') {
    if (T.swingCool > G.rtime || P.attackT > 0) return;
    T.swingCool = G.rtime + 0.32;
    P.attackT = 0.32;
    P.swing ^= 1;
    P.char.playOnce(P.swing ? 'punch' : 'punchL');
    sfx(w === 'jingle' ? 'jingle' : 'whooshPunch', { vol: 0.6 });
    after(0.12, () => {
      if (!G.canDamage || !G.S || !P.held) return;
      const held = P.held;
      const tg = api.pickTarget(2.05);
      if (!tg) return;
      const dir = tg.kind === 'rec' ? V(tg.t.body.position.x - P.pos.x, 0, tg.t.body.position.z - P.pos.z) : V(tg.t.pos.x - P.pos.x, 0, tg.t.pos.z - P.pos.z);
      if (dir.lengthSq() < 1e-4) dir.copy(fwd()); dir.normalize();
      if (tg.kind === 'npc') { if (api.knockNpc(tg.t, dir, 1.0)) { api.emit('knock'); api.emit('weapon', held); sfx(w === 'jingle' ? 'jingle' : 'punch', { vol: 0.8 }); } }
      else { api.hitRec(tg.t, dmg, dir, 1.6, { direct: true, big: dmg > 1 }); api.emit('weapon', held); if (w === 'jingle') sfx('jingle', { vol: 0.8, pitch: rnd(0.9, 1.2) }); }
      if (w === 'bottle') { // bottles break on the first hit
        const c = recPos(held);
        sfx('breakGlass', { vol: 0.8 }); fx.debris(V(P.pos.x, 1.1, P.pos.z), held.colors, 8, 2, 0.04);
        api.destroyHeld(); void c;
      }
    });
  }
  function shout(big = false) {
    if (T.shoutCool > G.rtime) return;
    T.shoutCool = G.rtime + 0.9;
    const S = G.S, c = P.pos.clone();
    P.char.playOnce('special');
    sfx('horn', { vol: 0.9, pitch: rnd(0.95, 1.08) });
    fx.shockwave(V(c.x, 0, c.z), big ? 6 : 4.2);
    api.emit('shout');
    G.shake = Math.max(G.shake, 0.3);
    const f = fwd();
    for (const r of S.phys.records) {
      if (r.removed || r.held || r.fixed || r.riding) continue;
      const p = r.body.position, dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d > 3.6 || r.mass > 30) continue;
      if ((dx * f.x + dz * f.z) < -0.3 * d) continue;
      api.hitRec(r, 0, V(dx / (d || 1), 0, dz / (d || 1)), 1.4 * (1 - d / 4), { shake: false, vol: 0.2 });
    }
    for (const n of S.npcs) {
      if (n.gone) continue;
      const d = n.pos.distanceTo(c);
      if (d < 2.6) api.knockNpc(n, V(n.pos.x - c.x, 0, n.pos.z - c.z).normalize(), 0.5);
      else if (d < 8) n.alarm(api.npcCtx(), c);
    }
  }

  // ------------------------------------------------------------- extinguisher spray (hold attack)
  function updateSpray(dt, down) {
    const held = P.held;
    if (!held || WEAPON[held.type] !== 'spray' || !down || T.spray >= SPRAY_MAX || !G.canDamage) {
      if (T.sprayT > 0) T.sprayT = 0;
      T.sprayV.multiplyScalar(1 - Math.min(1, dt * 2.5));
      return { thrust: 0 };
    }
    T.spray += dt; T.sprayT += dt;
    const f = fwd();
    const nz = V(P.pos.x + f.x * 0.45, P.y + 1.05, P.pos.z + f.z * 0.45);
    for (let i = 0; i < 2; i++) fx.puff(nz, V(f.x * rnd(4.5, 6.5) + rnd(-0.6, 0.6), rnd(-0.4, 0.6), f.z * rnd(4.5, 6.5) + rnd(-0.6, 0.6)), 0.16, 0.85);
    if ((T.sprayT % 0.25) < dt) sfx('spray', { vol: 0.55 });
    // recoil: pushed backwards, and up once the jet has been going for a moment → flight
    T.sprayV.x += -f.x * 9 * dt; T.sprayV.z += -f.z * 9 * dt;
    const sp = Math.hypot(T.sprayV.x, T.sprayV.z); if (sp > 3.4) T.sprayV.multiplyScalar(3.4 / sp);
    // hover a little: never into the ceiling (character ≈ 1.75 m tall)
    const cap = Math.max(0.7, Math.min(1.5, G.S.F.ceilY - 1.8));
    const thrust = T.sprayT > 0.3 ? (P.y < cap ? 23 : 14) : 0;
    if (P.y > 0.55 && !T.flew) { T.flew = true; api.emit('fly'); ui.toast('소화기 비행!', 1400); }
    // people in front flinch / flee, light things get blown about
    const S = G.S;
    if ((T.sprayT % 0.3) < dt) {
      for (const n of S.npcs) { if (!n.gone && n.pos.distanceTo(nz) < 3.2 && ((n.pos.x - P.pos.x) * f.x + (n.pos.z - P.pos.z) * f.z) > 0) n.alarm(api.npcCtx(), P.pos); }
      for (const r of S.phys.records) {
        if (r.removed || r.held || r.fixed || r.riding || r.mass > 6) continue;
        const p = r.body.position, dx = p.x - P.pos.x, dz = p.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d > 2.6 || (dx * f.x + dz * f.z) < 0.5 * d) continue;
        r.body.wakeUp(); r.body.velocity.x += f.x * 1.6; r.body.velocity.z += f.z * 1.6; r.body.velocity.y += 0.6; r.energized = S.phys.time + 1;
      }
    }
    if (T.spray >= SPRAY_MAX) { ui.toast('소화기가 다 떨어졌어요 · 이제 휘둘러요', 1800); sfx('uiBack', { vol: 0.5 }); }
    return { thrust, vmax: P.y < cap - 0.45 ? 3.0 : 0.7 };
  }

  // ------------------------------------------------------------- fire alarm → sprinklers
  function triggerAlarm(rec) {
    const S = G.S, st = prep(S);
    if (rec) setState(rec, true);
    P.char.playOnce('punch');
    if (st.alarmed) return;
    st.alarmed = true; st.alarmT = 14; st.rainT = 16; st.bellT = 0;
    api.emit('alarm');
    ui.toast('비상벨! 스프링클러 작동', 1800);
    sfx('fireBell', { vol: 0.9 });
    vibrateSafe(60);
    // everyone panics and heads out
    const ctx = api.npcCtx();
    for (const n of S.npcs) if (!n.gone && n.role !== 'walker') n.alarm(ctx, rec ? recPos(rec) : P.pos);
    if (S.F.sprinklers.length) makePuddles(S);
  }
  function vibrateSafe(ms) { try { api.vibrate && api.vibrate(ms); } catch (e) { /* ignore */ } }
  const PUD_GEO = new THREE.CircleGeometry(1, 20); PUD_GEO.rotateX(-PI / 2);
  const PUD_MAT = new THREE.MeshStandardMaterial({ color: '#7fc2ea', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  function makePuddles(S) {
    const sp = S.F.sprinklers, st = S.toy;
    const im = new THREE.InstancedMesh(PUD_GEO, PUD_MAT, sp.length);
    im.castShadow = false; im.receiveShadow = true; im.renderOrder = 1; im.frustumCulled = false;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < sp.length; i++) im.setMatrixAt(i, m);
    S.F.group.add(im);
    st.puddles = im; st.puddleK = 0;
  }
  function updateRain(S, dt) {
    const st = S.toy;
    if (st.alarmT > 0) {
      st.alarmT -= dt; st.bellT -= dt;
      if (st.bellT <= 0) { st.bellT = 0.85; sfx('fireBell', { vol: 0.5 }); }
    }
    if (st.rainT > 0) {
      st.rainT -= dt;
      const sp = S.F.sprinklers;
      if (sp.length) {
        st.rainAcc += dt * Math.min(320, sp.length * 28);
        while (st.rainAcc > 1) {
          st.rainAcc -= 1;
          const s = sp[(Math.random() * sp.length) | 0];
          const a = rnd(0, PI * 2), r = rnd(0.05, 1.3);
          fx.drop(_w.set(s.x + Math.cos(a) * 0.05, s.y - 0.05, s.z + Math.sin(a) * 0.05), V(Math.cos(a) * r * 1.6, rnd(-1.5, -0.4), Math.sin(a) * r * 1.6));
        }
      }
    }
    if (st.puddles && st.puddleK < 1) {
      st.puddleK = Math.min(1, st.puddleK + dt / 4);
      const m = new THREE.Matrix4(), sp = S.F.sprinklers;
      for (let i = 0; i < sp.length; i++) { const s = (0.6 + ((i * 37) % 10) / 14) * st.puddleK; m.makeScale(s * 1.3, 1, s); m.setPosition(sp[i].x + ((i * 13) % 7) / 20, 0.008, sp[i].z); st.puddles.setMatrixAt(i, m); }
      st.puddles.instanceMatrix.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------- hit / destroy reactions
  function afterHit(rec) {
    if (rec.type === 'car') {
      const f = rec.hp / rec.hpMax;
      const st = rec.hp <= 0 ? 4 : f < 0.3 ? 3 : f < 0.55 ? 2 : f < 0.85 ? 1 : 0;
      if (st > rec.stage && st < 4) carStage(rec, st);
    } else if (rec.type === 'ceoSafe' && !rec.destroyed) {
      setState(rec, clamp(1 - rec.hp / rec.hpMax, 0, 1) * 0.35);
    } else if (rec.type === 'watertank' && !rec.destroyed && rec.hp / rec.hpMax < 0.6 && rec.stage < 1) {
      rec.stage = 1; setState(rec, 'leak'); sfx('splash', { vol: 0.5 });
      fx.water(V(rec.body.position.x, 0.8, rec.body.position.z), 18, 1.6);
    }
  }
  function carStage(rec, st) {
    rec.stage = st;
    setState(rec, st);
    const c = recPos(rec);
    api.emit('carStage', rec, 1, st);
    if (st === 1) {
      sfx('breakGlass', { vol: 0.95 }); sfx('hitMetal', { vol: 0.6 }); after(0.25, () => sfx('carAlarm', { vol: 0.7 }));
      fx.debris(V(c.x, c.y + 0.6, c.z), [0x9fd6ee, 0xcfeefa, 0x5d7e98], 14, 2.6, 0.05);
      if (fx.shards) fx.shards(V(c.x, c.y + 0.7, c.z), 28, 3, null, 0.05);
      ui.toast(rec.tag === 'bossCar' ? '사장님 차 유리가 와장창!' : '차 유리가 와장창!', 1500);
    } else if (st === 2) {
      sfx('breakMetal', { vol: 0.9 }); fx.debris(c, rec.colors, 14, 3, 0.09);
      tossPart(rec, 'mirror');
    } else if (st === 3) {
      sfx('crash', { vol: 0.8 }); fx.debris(c, rec.colors, 16, 3.2, 0.1);
      tossPart(rec, 'wheel');
      for (let i = 0; i < 6; i++) fx.puff(V(c.x + rnd(-0.6, 0.6), c.y + 0.3, c.z + rnd(-0.6, 0.6)), V(rnd(-0.5, 0.5), rnd(0.6, 1.4), rnd(-0.5, 0.5)), 0.3, 1.4);
    }
    G.shake = Math.max(G.shake, 0.4 + st * 0.12);
  }
  const PART_GEO = { mirror: new THREE.BoxGeometry(0.16, 0.1, 0.09), wheel: new THREE.TorusGeometry(0.26, 0.11, 8, 16) };
  const TIRE_MAT = new THREE.MeshStandardMaterial({ color: '#232428', roughness: 0.85 });
  function tossPart(rec, kind) {
    const S = G.S, c = recPos(rec);
    const m = new THREE.Mesh(PART_GEO[kind], kind === 'wheel' ? TIRE_MAT : new THREE.MeshStandardMaterial({ color: rec.colors[0] || 0x888888, roughness: 0.4 }));
    m.castShadow = true;
    const d = fwd();
    fx.toss(m, V(c.x, c.y + 0.4, c.z), V(d.x * 3 + rnd(-1.5, 1.5), 4, d.z * 3 + rnd(-1.5, 1.5)), 8, S.F.group);
    if (kind === 'wheel') m.rotation.y = PI / 2;
  }
  // returns true when the default "darken the wreck" should be skipped
  function onDestroy(rec) {
    const S = G.S, c = recPos(rec), t = rec.type;
    if (t === 'car') {
      if (rec.stage < 3) carStage(rec, 3);
      rec.stage = 4; setState(rec, 4);
      api.emit('carStage', rec, 1, 4);
      sfx('boom', { vol: 0.9 }); after(0.2, () => sfx('carAlarm', { vol: 0.6, pitch: 0.8 }));
      fx.shockwave(V(c.x, 0, c.z), 3.5);
      for (let i = 0; i < 12; i++) fx.puff(V(c.x + rnd(-1, 1), c.y + 0.2, c.z + rnd(-1.6, 1.6)), V(rnd(-0.6, 0.6), rnd(0.8, 2), rnd(-0.6, 0.6)), 0.42, 2.2);
      ui.banner(rec.tag === 'bossCar' ? '사장님 차 폐차!' : '폐차!', '', 1300);
      G.shake = 1.0;
      return true;
    }
    if (t === 'drum') { drumBurst(rec, c); return false; }
    if (t === 'balloon' || rec.prop.floats) { sfx('pop', { vol: 0.9, pitch: rnd(0.9, 1.2) }); fx.debris(c, rec.colors, 10, 2, 0.03); return true; }
    if (t === 'aquarium' || t === 'sojuFridge') { setState(rec, 'broken'); sfx('splash', { vol: 0.9 }); fx.water(V(c.x, 1.0, c.z), 46, 2.6); return true; }
    if (t === 'watertank') { setState(rec, 'burst'); sfx('splash', { vol: 1 }); after(0.1, () => sfx('splash', { vol: 0.8, pitch: 0.8 })); fx.water(V(c.x, 1.2, c.z), 80, 3.2); return true; }
    if (t === 'ceoSafe') { setState(rec, 1); safeSpill(rec, c); return true; }
    if (t === 'gate') { setState(rec, 1); return true; }
    if (t === 'barrierGate') { const arm = rec.prop.parts && rec.prop.parts.arm; if (rec.inst) rec.inst(rec); if (arm) { arm.rotation.z = -0.2; arm.rotation.x = 0.5; arm.scale.x = 0.7; } sfx('breakWood', { vol: 0.9 }); return true; }
    if (t === 'alarmBell') { triggerAlarm(rec); return true; }
    if (rec.prop.set) return true;
    return false;
  }
  function drumBurst(rec, c) {
    const S = G.S;
    sfx('boom', { vol: 1 });
    if (!ui.settings.calm) ui.flash('#ffb44a', 180);
    fx.shockwave(V(c.x, 0, c.z), 3);
    fx.sparks(V(c.x, c.y + 0.4, c.z), 20, 6);
    for (let i = 0; i < 8; i++) fx.puff(V(c.x + rnd(-0.4, 0.4), c.y + 0.4, c.z + rnd(-0.4, 0.4)), V(rnd(-1.5, 1.5), rnd(1, 2.6), rnd(-1.5, 1.5)), 0.3, 1.5);
    G.shake = Math.max(G.shake, 0.9);
    after(0.05, () => {
      for (const r of S.phys.records) {
        if (r === rec || r.removed || r.held || r.riding) continue;
        const p = r.body.position, dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
        if (d > 2.4) continue;
        api.hitRec(r, 1, V(dx / (d || 1), 0, dz / (d || 1)), 3.2 * (1 - d / 2.6), { shake: false, vol: 0.3 });
      }
      for (const n of S.npcs) { if (!n.gone && n.pos.distanceTo(c) < 2.8) api.knockNpc(n, V(n.pos.x - c.x, 0, n.pos.z - c.z).normalize(), 1.2); }
      api.alarmAt(c, 12);
    });
  }
  function safeSpill(rec, c) {
    sfx('breakMetal', { vol: 1 });
    const bar = new THREE.BoxGeometry(0.16, 0.06, 0.08), gm = new THREE.MeshStandardMaterial({ color: '#f0c04a', roughness: 0.25, metalness: 0.85 });
    const S = G.S, q = rec.body.quaternion, yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    const f = V(Math.sin(yaw), 0, Math.cos(yaw));
    const bonus = Math.round(Math.max(20000, rec.price * 0.08));
    for (let i = 0; i < 6; i++) {
      after(0.08 * i, () => {
        const m = new THREE.Mesh(bar, gm); m.castShadow = true;
        fx.toss(m, V(c.x + f.x * 0.4, 0.5, c.z + f.z * 0.4), V(f.x * rnd(1.5, 3) + rnd(-1, 1), rnd(2, 3.5), f.z * rnd(1.5, 3) + rnd(-1, 1)), 6, S.F.group);
        api.addMoney(bonus, V(c.x + rnd(-0.5, 0.5), 1.4 + i * 0.1, c.z + rnd(-0.5, 0.5)), true, true);
        api.addItem('금고 속 금괴', bonus);
        if (i === 5) sfx('bigMoney', { vol: 0.8 }); else sfx('coin', { vol: 0.6, pitch: 1 + i * 0.08 });
      });
    }
    ui.toast('금고가 열렸다! 금괴가 우르르', 1800);
  }

  // ------------------------------------------------------------- windows + out-throws
  function breakBay(S, W, bay, quiet = false) {
    if (!bay.intact) return;
    bay.intact = false;
    if (bay.body) { S.phys.world.removeBody(bay.body); bay.body = null; }
    const m = new THREE.Matrix4().makeScale(0, 0, 0); W.im.setMatrixAt(bay.i, m); W.im.instanceMatrix.needsUpdate = true;
    const y = (W.y0 + W.y1) / 2;
    fx.debris(V(bay.x, y, bay.z), [0xcfeefa, 0x9fd6ee, 0xffffff], 10, 2.6, 0.05);
    if (fx.shards) fx.shards(V(bay.x, y, bay.z), 26, 2.8, null, 0.06);
    fx.sparks(V(bay.x, y, bay.z), 8, 3);
    if (!quiet) sfx('breakGlass', { vol: 0.9 });
    api.addMoney(25000, V(bay.x, y + 0.3, bay.z), false, true);
    api.addItem('유리창', 25000);
    api.emit('break', { type: 'window', tag: null });
    api.alarmAt(V(bay.x, 0, bay.z), 8);
  }
  function bayAt(W, x, z) { const a = W.axis === 'z' ? x : z; return W.bays.find((b) => a >= b.a0 && a < b.a1) || null; }
  // punches / kicks near a window break its pane
  function punchWindow(range = 1.25) {
    const S = G.S; if (!S || !S.F.windows.length) return false;
    const f = fwd();
    for (const W of S.F.windows) {
      const c = W.axis === 'z' ? P.pos.z : P.pos.x, dist = (W.at - c) * W.side; // positive = window ahead on the outside side
      const facing = (W.axis === 'z' ? f.z : f.x) * W.side;
      if (dist < 0 || dist > range || facing < 0.45) continue;
      const bay = bayAt(W, P.pos.x + f.x * dist, P.pos.z + f.z * dist);
      if (bay && bay.intact) { breakBay(S, W, bay); return true; }
    }
    return false;
  }
  function updateWindows(S, dt) {
    const F = S.F;
    if (F.windows.length) {
      const t = S.phys.time;
      for (const r of S.phys.records) {
        if (r.removed || r.held || r.fixed || r.energized < t) continue;
        const v = r.body.velocity, p = r.body.position;
        for (const W of F.windows) {
          const vn = (W.axis === 'z' ? v.z : v.x) * W.side;
          if (vn < 3.2) continue;
          const d = ((W.axis === 'z' ? p.z : p.x) - W.at) * W.side; // < 0 inside
          if (d < -0.25 - vn * dt * 2 - Math.max(r.hx, r.hz) || d > 0.1) continue;
          if (p.y < W.y0 - 0.1 || p.y > W.y1 + 0.2) continue;
          const bay = bayAt(W, p.x, p.z);
          if (bay && bay.intact) breakBay(S, W, bay);
        }
      }
    }
    // anything past an out-zone falls out of the building
    if (!F.outZones.length) return;
    for (const r of S.phys.records) {
      if (r.removed || r.held || r.fixed || r.out || r.riding) continue;
      const p = r.body.position;
      for (const Z of F.outZones) {
        const d = ((Z.axis === 'z' ? p.z : p.x) - Z.at) * Z.side;
        const a = Z.axis === 'z' ? p.x : p.z;
        if (d > 0.35 && a >= Z.from && a <= Z.to) { goOut(S, r, Z); break; }
      }
    }
  }
  function goOut(S, rec, Z) {
    rec.out = true;
    rec.body.collisionResponse = false;
    rec.body.wakeUp();
    rec.body.velocity.y = Math.min(rec.body.velocity.y, 0.5);
    rec.energized = 0;
    sfx('fallWhistle', { vol: 0.6 });
    const name = rec.name, price = rec.price;
    const rest = Math.max(0, price - rec.paid);
    const bonus = Math.max(5000, Math.round(price * 0.3));
    api.emit('out', rec);
    after(1.25, () => {
      if (!G.S) return;
      if (!rec.removed) S.phys.remove(rec);
      sfx('farCrash', { vol: 0.9 });
      G.shake = Math.max(G.shake, 0.25);
      rec.paid = price; rec.destroyed = true;
      const amt = rest + bonus;
      const at = V(P.pos.x, 2.0, P.pos.z);
      api.addMoney(amt, at, false, true);
      api.addItem('창밖 투척: ' + name, amt);
      ui.toast(`${Z.label || '밖으로!'} ${name} +${Math.round(amt).toLocaleString('ko-KR')}원`, 1800);
    });
  }

  // ------------------------------------------------------------- per tick
  function update(dt, attackDown) {
    const S = G.S; if (!S) return { thrust: 0 };
    prep(S);
    updateRain(S, dt);
    updateWindows(S, dt);
    if (P.y <= 0.02 && T.flew && !(P.held && WEAPON[P.held.type] === 'spray' && attackDown)) T.flew = false;
    return updateSpray(dt, attackDown);
  }
  function onFloorLeave() {
    if (T.ride) dismount();
    T.sprayT = 0; T.sprayV.set(0, 0, 0);
  }
  function reset() { T.ride = null; T.spray = 0; T.sprayT = 0; T.flew = false; T.sprayV.set(0, 0, 0); }
  function state() {
    const S = G.S, st = S && S.toy;
    return {
      ride: T.ride ? { kind: T.ride.kind, speed: +Math.hypot(T.ride.vel.x, T.ride.vel.z).toFixed(2), fork: +T.ride.fork.toFixed(2), carried: T.ride.carried ? T.ride.carried.type : null } : null,
      weapon: P.held && WEAPON[P.held.type] ? P.held.type : null, spray: +T.spray.toFixed(2), flying: P.y > 0.4 && T.sprayT > 0,
      alarm: st ? { on: st.alarmT > 0, rain: st.rainT > 0, alarmed: st.alarmed } : null,
      windows: S ? S.F.windows.map((W) => W.bays.filter((b) => !b.intact).length) : [],
    };
  }

  return {
    T, candidate, heldText, isWeapon, mount, dismount, updateRide, riding: () => !!T.ride, attack, special, update,
    afterHit, onDestroy, punchWindow, triggerAlarm, breakBay, onFloorLeave, reset, state, prep, setState,
    sprayPush: () => T.sprayV,
  };
}
