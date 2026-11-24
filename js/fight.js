// 회사 뿌개기 — 반격 · 막기 · 기력 (fighting back, guarding, the player's hearts). Cartoon slapstick only: nobody
// bleeds, nobody is hurt for real; the player "loses" by flopping over for two seconds and getting up again.
//
// Who fights: the floor's 보스 (role boss / ceo), one 중간보스 per floor (spec.rank 'mid', else exec / guard /
// a standing coworker) and, now and then, one short-tempered coworker who snaps after being hit
// ("참을 만큼 참았어요!"). Everybody else keeps fleeing. Fighting happens only in a rampage (rush / free / the
// story's final minute) — never in the scripted story scenes.
//
// A fighter squares up (fists up), walks in and throws ONE big telegraphed swing: ≥ 0.75 s wind-up with a "!" over
// the head + a rising whistle + a reared-back pose, a short-reach swing, then ~1 s out of breath (free hits). At most
// two fighters wind up / swing at the same time; the rest hover and wait their turn. Hits during the wind-up still
// cost 멘탈 but don't stop it (npc.hit), so a player who just keeps punching wins but loses a heart now and then;
// guarding or stepping back makes it cleaner. The 보스 can also throw a slipper in an arc (side-step or guard).
//
// Guard (hold C / L / Shift, or the 막기 button): no damage, a small push back. Raised ≤ 0.25 s before the blow =
// "딱!" perfect guard: the attacker is dizzy for 1.5 s, a little money pop + combo. 기력 5 hearts: a hit costs one
// (+1 s blink of invulnerability); at 0 you flop for ~2 s and get up with all five. Hearts refill when left alone.
import * as THREE from 'three';
import { collideCircle } from './nav.js';

const PI = Math.PI;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function wrapA(a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }
function angLerp(a, b, k) { return a + wrapA(b - a) * Math.min(1, k); }

export const FIGHT_STATES = new Set(['ready', 'fight', 'windup', 'swing', 'recover', 'stun', 'taunt']);
// tuning ("웬만하면 우리가 이기게": slow, loud wind-ups, long recoveries, one heart per hit, two attackers at most)
export const TUNE = {
  hearts: 5, invuln: 1.0, regenDelay: 4.0, regenEvery: 2.2, flop: 2.0, getUp: 0.75, upInvuln: 1.5,
  perfect: 0.25, stun: 1.5, maxAttackers: 2, aggro: 3.4, leash: 10, guardSpeed: 0.45, perfectPay: 5000,
  hover: 2.3,
};
export const RANK = {
  boss: { mental: 8, speed: 2.25, windup: 0.9, reach: 1.45, recover: 1.15, cool: [1.1, 1.9], throw: true },
  mid: { mental: 6, speed: 2.45, windup: 0.8, reach: 1.4, recover: 1.0, cool: [0.9, 1.7] },
  angry: { mental: null, speed: 2.5, windup: 0.75, reach: 1.35, recover: 1.0, cool: [1.3, 2.3] },
};
// bubbles ({B} boss name, {M} mid-boss name, {P} the player's name)
const LINES = {
  boss: {
    engage: ['이 {B}한테 감히?!', '{P}! 거기 서!', '자네, 각오는 됐나?', '내가 왕년에 말이야!'],
    windup: ['에잇!', '받아라!', '이야압!', '정신 차려!'], throw: ['슬리퍼 간다!', '피해 보시지!'],
    taunt: ['어딜 감히!', '허허, 아직 멀었어~', '{B}을 뭘로 보고!'], stun: ['어, 어라?', '띠용~', '내 허리…'], whiff: ['헛!', '어디 갔지?'],
  },
  mid: {
    engage: ['{M} 참교육 들어간다!', '{P}! 선 넘었어!', '부장님은 내가 지킨다!', '보고서는 다 썼고?!'],
    windup: ['에잇!', '각오해!', '이얍!'],
    taunt: ['그러게 왜 그랬어~', '결재 반려!'], stun: ['어지러워…', '띠용~'], whiff: ['헛!', '어라?'],
  },
  angry: {
    engage: ['참을 만큼 참았어요!', '저도 화났어요!'], windup: ['에잇!', '이얍!'],
    taunt: ['쌤통이다~'], stun: ['어지러워…'], whiff: ['헛!'],
  },
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export function createFight(D) {
  // D: { G, P, fx, sfx, ui, isCalm, shake, hitStop, camKick, vibrate, setFace, addMoney, bumpCombo, breakCombo,
  //       onPlayerHit, hitNpc, solidAt, keepIn, count, report }
  const { G, P } = D;
  const FT = {
    hearts: TUNE.hearts, invuln: 0, downT: 0, getUpT: 0, guard: false, guardWant: false, guardT0: -9, lastHit: -99, regenT: 0,
    started: false, perfects: 0, blocks: 0, hitsTaken: 0, flops: 0, attackers: 0, maxAttackers: 0, kb: new THREE.Vector3(),
    bubble: null, blink: 0,
  };
  const star = { head: new THREE.Vector3(), starsOn: false, starSize: 1, gone: false }; // the player's KO stars (fx owner)
  const shots = []; // slippers in flight / on the floor

  // ---------------------------------------------------------------- names
  function rawNames() { return (D.ui && D.ui.names) || {}; }
  function nameOf(n) {
    const N = rawNames();
    if (!n || !n.fighter) return '';
    if (n.fighter.rank === 'boss') return N.boss || (n.role === 'ceo' || n.spec.name === 'ceo' ? '사장님' : '부장님');
    if (n.fighter.rank === 'mid') return N.mid || (n.role === 'exec' ? '상무님' : n.role === 'guard' ? '경비반장님' : '과장님');
    return '';
  }
  function bossName(S) { const b = S && S.npcs.find((n) => n.fighter && n.fighter.rank === 'boss'); return b ? nameOf(b) : (rawNames().boss || '부장님'); }
  function midName(S) { const m = S && S.npcs.find((n) => n.fighter && n.fighter.rank === 'mid'); return m ? nameOf(m) : (rawNames().mid || '과장님'); }
  function meName() { return rawNames().me || '김 대리'; }
  function fill(line, n) {
    const S = G.S;
    return line.replace(/\{B\}/g, n && n.fighter && n.fighter.rank === 'boss' ? nameOf(n) : bossName(S))
      .replace(/\{M\}/g, n && n.fighter && n.fighter.rank === 'mid' ? nameOf(n) : midName(S)).replace(/\{P\}/g, meName());
  }
  function say(n, kind, sec = 1.8, chance = 1) {
    if (Math.random() > chance) return;
    const L = LINES[n.fighter.rank] && LINES[n.fighter.rank][kind];
    if (L && L.length) n.say(fill(pick(L), n), sec, G.rtime);
  }

  // ---------------------------------------------------------------- who fights (per floor, at build time)
  function setFighter(n, rank) {
    n.fighter = { rank };
    const m = RANK[rank].mental;
    if (m != null && n.spec.mental == null) { n.mentalMax = m; n.mental = m; }
  }
  function designate(S) {
    const L = S.npcs.filter((n) => n.role !== 'walker');
    const boss = L.find((n) => n.role === 'boss' || n.role === 'ceo');
    if (boss) setFighter(boss, 'boss');
    const mid = L.find((n) => n.spec.rank === 'mid' && n !== boss) || L.find((n) => (n.role === 'exec' || n.role === 'guard') && n !== boss) || L.find((n) => n.role === 'worker' && !n.seated && n !== boss);
    if (mid) setFighter(mid, 'mid');
    // one short-tempered coworker per floor (snaps after the first hit)
    const pool = L.filter((n) => n.role === 'worker' && !n.fighter);
    if (pool.length >= 3) pick(pool).hothead = true;
  }
  // a hot-head who just got hit and is still standing: fights from now on
  function anger(n) {
    if (!n || n.fighter || !n.hothead || !on()) return false;
    n.hothead = false; n.fighter = { rank: 'angry' };
    n.say(pick(LINES.angry.engage), 2.2, G.rtime);
    D.sfx('gasp', { vol: 0.4, pitch: 0.8 });
    return true;
  }

  // fighting allowed: rampage running (rush / free / the story's last minute), not during a ride / transition
  function on() { return G.rampage && G.canDamage && G.mode !== 'title' && G.scene !== 'bill'; }
  const down = () => FT.downT > 0 || FT.getUpT > 0;

  function enter(n, st) { n.state = st; n.t = 0; n.swung = false; }
  // called by npc.js (alarm / engage)
  function onFight(n, ev) {
    if (ev === 'engage') {
      if (!n.engagedOnce) { n.engagedOnce = true; say(n, 'engage', 2.2); D.sfx('gasp', { vol: 0.35, pitch: 0.7 }); }
      if (!FT.started) { FT.started = true; hud(); }
    }
  }
  function startWindup(n, atk) {
    enter(n, 'windup'); n.atk = atk;
    n.char.setAnim(atk === 'throw' ? 'windupThrow' : 'windup'); n.char.setFace('rage');
    D.sfx('windup', { vol: 0.55, pitch: atk === 'throw' ? 0.85 : n.fighter.rank === 'boss' ? 0.92 : 1.05 });
    say(n, atk === 'throw' ? 'throw' : 'windup', 1.0, atk === 'throw' ? 1 : 0.45);
    if (!FT.started) { FT.started = true; hud(); }
  }
  // movement helper: walk the nav path toward (x, z) (replanned every ~0.45 s), npc.follow does the stepping
  function walkToward(n, x, z, speed, dt, ctx) {
    if (!n.path || (n.fPathT || 0) <= 0 || !n.goal || Math.hypot(n.goal.x - x, n.goal.z - z) > 0.6) {
      n.fPathT = 0.45;
      n.goal = (n.goal || new THREE.Vector3()).set(x, 0, z);
      n.path = ctx.nav ? ctx.nav.path(n.pos.x, n.pos.z, x, z) : null;
      if (!n.path) n.path = [[x, z]];
      n.pathI = 0; n.stuckT = 0; n.lastMoved.copy(n.pos);
    }
    n.fPathT -= dt;
    n.walkSpeed = speed; n.onArrive = null;
    return n.follow(dt, ctx);
  }
  function slide(n, vx, vz, dt, ctx) {
    n.pos.x += vx * dt; n.pos.z += vz * dt;
    collideCircle(n.pos, n.r, ctx.lists, 0);
    if (ctx.keepIn) ctx.keepIn(n.pos, n.r);
  }

  // ---------------------------------------------------------------- per-NPC brain (npc.update → ctx.fightTick)
  function npcTick(n, dt, ctx) {
    const c = n.char;
    if (!on()) {
      // the fight is over (bill / story): stand down where they are
      n.state = 'idle'; n.t = 0; n.starsOn = false; n.path = null; c.setAnim('idle'); c.setFace(n.baseFace);
      return 0;
    }
    const R = RANK[n.fighter.rank];
    const dx = P.pos.x - n.pos.x, dz = P.pos.z - n.pos.z, d = Math.hypot(dx, dz) || 1e-4;
    const toYaw = Math.atan2(dx, dz);
    if (n.cool > 0) n.cool -= dt;
    let sp = 0;
    switch (n.state) {
      case 'ready': {
        c.setAnim('fightIdle');
        n.yaw = angLerp(n.yaw, toYaw, dt * 4);
        if (!G.busy && !down() && d < TUNE.aggro) { enter(n, 'fight'); onFight(n, 'engage'); }
        break;
      }
      case 'taunt': {
        c.setAnim('cheer');
        n.yaw = angLerp(n.yaw, toYaw, dt * 4);
        if (!down() && n.t > 0.6) enter(n, 'fight');
        break;
      }
      case 'fight': {
        if (down()) { enter(n, 'taunt'); say(n, 'taunt', 1.8, 0.6); break; }
        if (d > TUNE.leash) { n.far = (n.far || 0) + dt; if (n.far > 2) { n.far = 0; enter(n, 'ready'); n.path = null; break; } } else n.far = 0;
        const canAtk = !G.busy && !n.aiHold && n.cool <= 0 && FT.attackers < TUNE.maxAttackers && FT.invuln <= 0.15 && P.y < 0.6;
        // 보스: a slipper from mid range now and then (line of sight only)
        if (canAtk && R.throw && d > 3.0 && d < 7.5 && Math.random() < dt * 0.55 && clearLine(n.pos, P.pos)) { startWindup(n, 'throw'); FT.attackers++; break; }
        const want = canAtk ? R.reach * 0.78 : TUNE.hover + (n.fighter.rank === 'angry' ? 0.4 : 0);
        if (d > want + 0.2) sp = walkToward(n, P.pos.x, P.pos.z, R.speed * (canAtk ? 1 : 0.75), dt, ctx);
        else if (!canAtk && d < want - 0.6) {
          // too close while waiting their turn: shuffle back a little
          slide(n, -dx / d * 1.1, -dz / d * 1.1, dt, ctx); sp = 1.1; n.path = null;
        } else n.path = null;
        if (d < 4) n.yaw = angLerp(n.yaw, toYaw, dt * 8);
        c.setAnim('fightIdle');
        if (canAtk && d <= R.reach * 0.98 && Math.abs(wrapA(toYaw - n.yaw)) < 0.6) { startWindup(n, 'melee'); FT.attackers++; }
        break;
      }
      case 'windup': {
        // slow turn while rearing back: you can step out of the way
        n.yaw = angLerp(n.yaw, toYaw, dt * (n.atk === 'throw' ? 5 : 2.4));
        if (n.t >= R.windup) {
          if (n.atk === 'throw') { throwSlipper(n); enter(n, 'recover'); n.recLen = 0.8; c.setAnim('fightIdle'); }
          else { enter(n, 'swing'); c.setAnim('fightIdle'); c.playOnce('punch'); D.sfx('whooshPunch', { vol: 0.55, pitch: 0.85 }); }
        }
        break;
      }
      case 'swing': {
        // lunge forward with the swing; the blow lands ~0.08 s in
        const v = 3.0 * Math.max(0, 1 - n.t / 0.25);
        slide(n, Math.sin(n.yaw) * v, Math.cos(n.yaw) * v, dt, ctx); sp = v;
        if (!n.swung && n.t >= 0.08) { n.swung = true; melee(n, R); }
        if (n.t >= 0.3) { enter(n, 'recover'); n.recLen = R.recover; c.setAnim('pant'); c.setFace('sleepy'); }
        break;
      }
      case 'recover': {
        if (n.t >= (n.recLen || R.recover)) { enter(n, 'fight'); n.cool = rnd(R.cool[0], R.cool[1]); c.setFace('rage'); }
        break;
      }
      case 'stun': {
        c.setAnim('dizzy'); c.setFace('dizzy');
        if (n.t >= TUNE.stun) { n.starsOn = false; enter(n, 'fight'); n.cool = 0.7; c.setFace('rage'); }
        break;
      }
    }
    // never stand inside the player (the player pushes out too), and fighters do not stack on each other
    const pr = P.r + n.r;
    const ex = n.pos.x - P.pos.x, ez = n.pos.z - P.pos.z, ed = Math.hypot(ex, ez);
    if (ed < pr && ed > 1e-4) { n.pos.x = P.pos.x + ex / ed * pr; n.pos.z = P.pos.z + ez / ed * pr; }
    if (G.S) for (const m of G.S.npcs) {
      if (m === n || !m.fighter || m.gone || !FIGHT_STATES.has(m.state)) continue;
      const fx = n.pos.x - m.pos.x, fz = n.pos.z - m.pos.z, fd = Math.hypot(fx, fz);
      if (fd < 0.62 && fd > 1e-4) { const k = (0.62 - fd) * 0.5; n.pos.x += fx / fd * k; n.pos.z += fz / fd * k; }
    }
    return sp;
  }
  function clearLine(a, b) {
    if (!D.solidAt) return true;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4);
    for (let i = 1; i < n; i++) { const t = i / n; if (D.solidAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 1.2)) return false; }
    return true;
  }
  function melee(n, R) {
    const dx = P.pos.x - n.pos.x, dz = P.pos.z - n.pos.z, d = Math.hypot(dx, dz) || 1e-4;
    const ang = Math.abs(wrapA(Math.atan2(dx, dz) - n.yaw));
    if (d <= R.reach + 0.15 && ang < 1.15 && P.y < 0.7) hitPlayer(n, _v.set(dx / d, 0, dz / d), 'melee');
    else { D.sfx('whooshPunch', { vol: 0.3, pitch: 0.7 }); say(n, 'whiff', 1.2, 0.5); }
  }
  function stun(n) {
    if (!n || n.gone || n.isKo) return;
    enter(n, 'stun'); n.path = null;
    n.char.setAnim('dizzy'); n.char.setFace('dizzy');
    n.starsOn = true; n.starSize = n.sc * 0.75; n.anchors();
    D.fx.koStars(n);
    say(n, 'stun', 1.5, 0.8);
  }

  // ---------------------------------------------------------------- the player takes a blow (or blocks it)
  // returns 'perfect' | 'block' | 'hit' | 'none'
  function hitPlayer(src, dir, kind = 'melee') {
    if (FT.downT > 0 || FT.getUpT > 0 || FT.invuln > 0) return 'none';
    const calm = D.isCalm();
    const cp = _w.set(P.pos.x - dir.x * 0.32, P.y + 1.2, P.pos.z - dir.z * 0.32);
    if (FT.guard) {
      const perfect = G.rtime - FT.guardT0 <= TUNE.perfect;
      FT.blocks++;
      FT.kb.set(dir.x * (perfect ? 1.4 : 2.8), 0, dir.z * (perfect ? 1.4 : 2.8));
      _v.set(-dir.x, 0, -dir.z);
      D.fx.sparks(cp, perfect ? 18 : 8, perfect ? 4.8 : 3, _v, perfect ? 1.3 : 1);
      D.fx.impact(cp, perfect ? 1.15 : 0.7, !calm);
      D.sfx('block', { vol: 0.75, pitch: rnd(0.95, 1.08) });
      P.char.playOnce('land');
      if (perfect) {
        FT.perfects++;
        D.sfx('perfect', { vol: 0.8 });
        D.hitStop('kick'); D.shake(0.32); D.vibrate(35);
        if (!calm) D.ui.flash('#fff3b0', 140);
        D.addMoney(TUNE.perfectPay, _v.set(P.pos.x, P.y + 2.0, P.pos.z), false, true, '딱!');
        D.bumpCombo();
        D.count('perfectGuard');
        if (kind === 'melee') stun(src);
      } else { D.shake(0.18); D.hitStop('punch'); D.vibrate(15); }
      return perfect ? 'perfect' : 'block';
    }
    // unguarded: one heart, a flinch + a hop back, combo broken, a second of blinking invulnerability
    FT.hearts = Math.max(0, FT.hearts - 1); FT.invuln = TUNE.invuln; FT.lastHit = G.rtime; FT.regenT = 0; FT.hitsTaken++;
    FT.kb.set(dir.x * 4.2, 0, dir.z * 4.2);
    if (P.onGround) { P.vy = 2.4; P.onGround = false; }
    P.char.playOnce('land'); D.setFace('shock', 0.9);
    D.sfx('hurt', { vol: 0.8, pitch: rnd(0.95, 1.1) }); D.sfx('hitSoft', { vol: 0.5 });
    D.fx.impact(cp, 0.9, !calm); D.fx.sparks(cp, 6, 3, dir);
    D.shake(0.45); D.camKick(dir, 0.12); D.vibrate(60);
    if (!calm) D.ui.flash('rgba(255,70,90,.55)', 200); // (calm mode: no flashes)
    D.breakCombo();
    D.onPlayerHit();
    if (!FT.started) FT.started = true;
    if (FT.hearts <= 0) flop();
    hud(true);
    return 'hit';
  }
  function flop() {
    FT.downT = TUNE.flop; FT.getUpT = 0; FT.flops++;
    P.char.setAnim('ko'); D.setFace('ko');
    star.starsOn = true; updateStar(); D.fx.koStars(star);
    D.sfx('ko', { vol: 0.7, at: 0.35 });
    FT.bubble = { text: '아이고…', until: G.rtime + 2.0 };
    // everyone backs off and gloats (no piling on someone lying down)
    if (G.S) for (const n of G.S.npcs) if (n.fighter && (n.state === 'windup' || n.state === 'swing')) { enter(n, 'taunt'); }
  }
  function updateStar() {
    // lying on the back: the head is ~1.1 m behind the feet
    const s = 1.0, sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    if (FT.downT > 0) star.head.set(P.pos.x - sy * 1.12 * s, P.y + 0.3, P.pos.z - cy * 1.12 * s);
    else star.head.set(P.pos.x, P.y + 1.3, P.pos.z);
  }

  // ---------------------------------------------------------------- slippers (보스's throw)
  let slipperGeo = null;
  function makeSlipper() {
    if (!slipperGeo) {
      const sole = new THREE.BoxGeometry(0.11, 0.03, 0.27); sole.translate(0, 0.015, 0);
      const strap = new THREE.BoxGeometry(0.12, 0.035, 0.09); strap.translate(0, 0.045, 0.05);
      slipperGeo = { sole, strap, mSole: new THREE.MeshStandardMaterial({ color: '#3d74e0', roughness: 0.7 }), mStrap: new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.6 }) };
    }
    const g = new THREE.Group();
    const a = new THREE.Mesh(slipperGeo.sole, slipperGeo.mSole), b = new THREE.Mesh(slipperGeo.strap, slipperGeo.mStrap);
    a.castShadow = b.castShadow = true;
    g.add(a, b); g.scale.setScalar(1.35);
    return g;
  }
  function throwSlipper(n) {
    if (!G.S) return;
    const f = _v.set(Math.sin(n.yaw), 0, Math.cos(n.yaw));
    const o = new THREE.Vector3(n.pos.x + f.x * 0.35, n.y + 1.65 * n.sc, n.pos.z + f.z * 0.35);
    const tx = P.pos.x, tz = P.pos.z, ty = P.y + 1.0;
    const dist = Math.hypot(tx - o.x, tz - o.z), T = clamp(dist / 6.5, 0.6, 1.15), g = 11;
    const vel = new THREE.Vector3((tx - o.x) / T, (ty - o.y + 0.5 * g * T * T) / T, (tz - o.z) / T);
    const mesh = makeSlipper(); mesh.position.copy(o);
    G.S.F.group.add(mesh);
    shots.push({ mesh, p: o, v: vel, from: n, S: G.S, t: 0, rest: 0, done: false, back: false, spin: rnd(9, 13) });
    n.char.playOnce('punch');
    D.sfx('whooshKick', { vol: 0.65, pitch: 1.1 });
  }
  function updateShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (s.S !== G.S) { if (s.mesh.parent) s.mesh.parent.remove(s.mesh); shots.splice(i, 1); continue; }
      s.t += dt;
      if (s.rest > 0) {
        s.rest -= dt;
        if (s.rest <= 0) { if (s.mesh.parent) s.mesh.parent.remove(s.mesh); shots.splice(i, 1); }
        continue;
      }
      s.v.y -= 11 * dt;
      s.p.addScaledVector(s.v, dt);
      s.mesh.position.copy(s.p);
      s.mesh.rotation.x += s.spin * dt; s.mesh.rotation.y += s.spin * 0.4 * dt;
      if (!s.done && !s.back) {
        const dx = s.p.x - P.pos.x, dz = s.p.z - P.pos.z, dy = s.p.y - P.y;
        if (Math.hypot(dx, dz) < 0.5 && dy > 0.2 && dy < 1.9) {
          const hs = Math.hypot(s.v.x, s.v.z) || 1;
          const r = hitPlayer(s.from, _v.set(s.v.x / hs, 0, s.v.z / hs), 'shot');
          if (r === 'perfect' && s.from && !s.from.gone) {
            // "딱!": straight back at the thrower
            const b = s.from, T = 0.45;
            s.v.set((b.pos.x - s.p.x) / T, (b.y + 1.3 - s.p.y + 0.5 * 11 * T * T) / T, (b.pos.z - s.p.z) / T);
            s.back = true;
          } else if (r === 'block') { s.v.set(-s.v.x * 0.25, 2.5, -s.v.z * 0.25); s.done = true; }
          else if (r === 'hit') { s.v.set(s.v.x * 0.15, 1.5, s.v.z * 0.15); s.done = true; }
        }
      } else if (s.back && s.from && !s.from.gone && !s.hitBack) {
        const b = s.from, dx = s.p.x - b.pos.x, dz = s.p.z - b.pos.z;
        if (Math.hypot(dx, dz) < 0.55 && s.p.y < b.y + 2.0) {
          s.hitBack = true; s.done = true;
          const hs = Math.hypot(s.v.x, s.v.z) || 1;
          D.hitNpc(b, _v.set(s.v.x / hs, 0, s.v.z / hs));
          s.v.set(-s.v.x * 0.2, 2, -s.v.z * 0.2);
        }
      }
      // walls: bounce off and drop
      if (D.solidAt && D.solidAt(s.p.x, s.p.z, s.p.y)) { s.p.addScaledVector(s.v, -dt); s.v.set(-s.v.x * 0.3, Math.min(s.v.y, 0), -s.v.z * 0.3); s.done = true; }
      if (s.p.y <= 0.02 && s.v.y < 0) {
        s.p.y = 0.02; s.mesh.position.copy(s.p); s.mesh.rotation.set(0, s.mesh.rotation.y, 0);
        s.rest = 2.5; s.done = true;
        D.sfx('drop', { vol: 0.3, pitch: 1.3 });
      }
      if (s.t > 6) { s.rest = 0.01; }
    }
  }

  // ---------------------------------------------------------------- per tick (before the NPC updates)
  function update(gdt, rdt) {
    // how many are winding up / swinging right now (the cap counts these)
    let a = 0, ctx = null;
    const live = on() && !G.busy;
    if (G.S) for (const n of G.S.npcs) {
      if (!n.fighter || n.gone) continue;
      if (n.state === 'windup' || n.state === 'swing') a++;
      // standing around (or still panicking from before) when the player walks up: square up
      if (live && !n.beaten && (n.state === 'idle' || n.state === 'cower' || n.state === 'walk' || n.state === 'flee' || n.state === 'shock') && Math.hypot(P.pos.x - n.pos.x, P.pos.z - n.pos.z) < TUNE.aggro) {
        ctx = ctx || D.npcCtx();
        n.engage(ctx);
      }
    }
    FT.attackers = a; if (a > FT.maxAttackers) FT.maxAttackers = a;
    if (FT.invuln > 0) FT.invuln -= gdt;
    // knock-back
    if (FT.kb.lengthSq() > 1e-4) {
      P.pos.x += FT.kb.x * gdt; P.pos.z += FT.kb.z * gdt;
      const k = Math.max(0, 1 - gdt * 7); FT.kb.multiplyScalar(k);
      if (G.S) { collideCircle(P.pos, P.r, G.S.lists, P.y); D.keepIn(); }
    }
    // flop → get up (full hearts)
    if (FT.downT > 0) {
      FT.downT -= gdt; updateStar();
      if (FT.downT <= 0) {
        FT.downT = 0; FT.getUpT = TUNE.getUp; star.starsOn = false;
        P.char.setAnim('groggy'); D.setFace('sleepy');
        D.sfx('soulBack', { vol: 0.45 });
      }
    } else if (FT.getUpT > 0) {
      FT.getUpT -= gdt;
      if (FT.getUpT <= 0) {
        FT.getUpT = 0; FT.hearts = TUNE.hearts; FT.invuln = TUNE.upInvuln; FT.lastHit = G.rtime;
        P.char.setAnim('rageIdle'); D.setFace('rage');
        FT.bubble = { text: '다시 간다!', until: G.rtime + 1.4 };
        D.sfx('jump', { vol: 0.4 });
        hud();
      }
    } else if (FT.hearts < TUNE.hearts && G.rtime - FT.lastHit > TUNE.regenDelay) {
      FT.regenT += gdt;
      if (FT.regenT >= TUNE.regenEvery) { FT.regenT = 0; FT.hearts++; hud(); }
    }
    updateShots(gdt);
  }
  // the guard button / keys (want) → actual guard (allowed only on foot, hands free of a person, not lying down)
  function setGuard(want, canGuard) {
    FT.guardWant = !!want;
    const g = FT.guardWant && canGuard && !down();
    if (g && !FT.guard) { FT.guardT0 = G.rtime; D.sfx('guardUp', { vol: 0.35 }); }
    FT.guard = g;
    return g;
  }
  function hud(hit = false) {
    const show = FT.started && (G.rampage || G.mode !== 'story') && G.scene !== 'bill' && G.mode !== 'title';
    D.ui.hearts(FT.hearts, TUNE.hearts, { show, hit, down: down() });
  }

  // ---------------------------------------------------------------- per frame: name tags, "!" marks, blink
  const tagMats = new Set();
  function tagTexture(text, rank) {
    const dpr = 2, H = 40 * dpr, pad = 14 * dpr, icon = 30 * dpr;
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d');
    const font = `900 ${22 * dpr}px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
    g.font = font;
    const tw = Math.ceil(g.measureText(text).width);
    cv.width = pad + icon + 6 * dpr + tw + pad; cv.height = H;
    const W = cv.width;
    g.font = font;
    // pill
    const r = H / 2 - 2;
    g.beginPath(); g.moveTo(r + 2, 2); g.lineTo(W - r - 2, 2); g.arc(W - r - 2, H / 2, r, -PI / 2, PI / 2); g.lineTo(r + 2, H - 2); g.arc(r + 2, H / 2, r, PI / 2, -PI / 2); g.closePath();
    const boss = rank === 'boss';
    const gr = g.createLinearGradient(0, 0, 0, H);
    if (boss) { gr.addColorStop(0, '#ffe680'); gr.addColorStop(1, '#ffb21f'); } else { gr.addColorStop(0, '#6f9dff'); gr.addColorStop(1, '#2f5fd8'); }
    g.fillStyle = gr; g.fill();
    g.lineWidth = 3 * dpr; g.strokeStyle = boss ? '#2a1600' : '#ffffff'; g.stroke();
    // icon: crown (보스) / star badge (중간보스)
    const cx = pad + icon / 2, cy = H / 2;
    if (boss) {
      const s = icon * 0.5;
      g.beginPath(); g.moveTo(cx - s, cy + s * 0.55); g.lineTo(cx - s, cy - s * 0.45); g.lineTo(cx - s * 0.5, cy); g.lineTo(cx, cy - s * 0.75); g.lineTo(cx + s * 0.5, cy); g.lineTo(cx + s, cy - s * 0.45); g.lineTo(cx + s, cy + s * 0.55); g.closePath();
      g.fillStyle = '#d92335'; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = '#2a1600'; g.stroke();
    } else {
      g.beginPath(); g.arc(cx, cy, icon * 0.46, 0, 2 * PI); g.fillStyle = '#ffffff'; g.fill();
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rr = (i % 2 ? 0.17 : 0.37) * icon; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.closePath(); g.fillStyle = '#2f5fd8'; g.fill();
    }
    g.fillStyle = boss ? '#2a1600' : '#ffffff';
    g.textBaseline = 'middle';
    g.fillText(text, pad + icon + 6 * dpr, H / 2 + dpr);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
    return { tex, aspect: W / H };
  }
  let bangTex = null;
  function bangTexture() {
    if (bangTex) return bangTex;
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.beginPath();
    for (let i = 0; i < 24; i++) { const a = i * PI / 12, rr = (i % 2 ? 0.36 : 0.48) * S; const x = S / 2 + Math.cos(a) * rr, y = S / 2 + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 7; g.strokeStyle = '#d92335'; g.stroke();
    g.fillStyle = '#d92335'; g.font = '900 84px "Black Han Sans", "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('!', S / 2, S / 2 + 4);
    bangTex = new THREE.CanvasTexture(cv); bangTex.colorSpace = THREE.SRGBColorSpace;
    return bangTex;
  }
  function spriteFor(map) {
    const m = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: true, toneMapped: false });
    const s = new THREE.Sprite(m); s.renderOrder = 12; s.castShadow = false;
    return s;
  }
  function tagFor(n, S) {
    const text = nameOf(n);
    let t = n._tag;
    if (t && t.text === text && t.fontsOk === fontsOk) return t;
    if (t) { t.sprite.material.map.dispose(); t.sprite.material.dispose(); if (t.sprite.parent) t.sprite.parent.remove(t.sprite); tagMats.delete(t); }
    const { tex, aspect } = tagTexture(text, n.fighter.rank);
    const sp = spriteFor(tex);
    const h = n.fighter.rank === 'boss' ? 0.23 : 0.2;
    sp.scale.set(h * aspect, h, 1);
    S.F.group.add(sp);
    t = n._tag = { sprite: sp, text, fontsOk, h };
    tagMats.add(t);
    S.F.disposables.push({ dispose() { tex.dispose(); sp.material.dispose(); } });
    return t;
  }
  let fontsOk = 0;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fontsOk++; });
  function frame() {
    const S = G.S;
    const show = !!S && G.rampage && G.mode !== 'title';
    if (S) for (const n of S.npcs) {
      const tagged = show && n.fighter && n.fighter.rank !== 'angry' && !n.gone && n.group.visible;
      n.tagH = (tagged ? 0.3 : 0) + (show && n.fighter && n.state === 'windup' ? 0.45 : 0); // bubbles sit above the tag / "!"
      if (!tagged) { if (n._tag) n._tag.sprite.visible = false; }
      else {
        const t = tagFor(n, S);
        t.sprite.visible = true;
        if (n.isKo || n.lying || n.state === 'carried') { n.anchors(); t.sprite.position.set(n.head.x, n.head.y + 0.5, n.head.z); }
        else t.sprite.position.set(n.pos.x, n.y + (n.seated ? 1.45 * n.sc : (n.char.height || 1.8 * n.sc) + 0.16), n.pos.z);
      }
      // "!" over a fighter winding up (pops in, pulses; calm: steady)
      const bang = show && n.fighter && n.state === 'windup' && !n.gone;
      if (bang) {
        if (!n._bang) { n._bang = spriteFor(bangTexture()); S.F.group.add(n._bang); }
        const b = n._bang; b.visible = true;
        const base = n._tag && tagged ? n._tag.sprite.position.y + 0.34 : n.y + (n.char.height || 1.8 * n.sc) + 0.42;
        const pop = Math.min(1, n.t / 0.12), pulse = D.isCalm() ? 1 : 1 + 0.18 * Math.abs(Math.sin(n.t * 16));
        const s = 0.42 * pop * pulse;
        b.scale.set(s, s, 1);
        b.position.set(n.pos.x, base, n.pos.z);
        b.material.color.setRGB(1, D.isCalm() ? 1 : 0.75 + 0.25 * Math.abs(Math.sin(n.t * 16)), D.isCalm() ? 1 : 0.75 + 0.25 * Math.abs(Math.sin(n.t * 16)));
      } else if (n._bang) n._bang.visible = false;
    }
    // invulnerable: the player blinks (calm: no blink)
    const blink = FT.invuln > 0 && FT.downT <= 0 && FT.getUpT <= 0 && !D.isCalm() && G.rampage;
    if (blink) { P.char.group.visible = Math.floor(G.rtime * 12) % 2 === 0; FT.blink = 1; }
    else if (FT.blink) { P.char.group.visible = true; FT.blink = 0; }
  }
  // the player's bubble (아이고… / 다시 간다!) for frameUI
  function playerBubble() {
    const b = FT.bubble;
    if (!b || b.until < G.rtime || !G.S || G.mode === 'title') return null;
    return b.text;
  }
  function playerAnim() {
    if (FT.downT > 0) return 'ko';
    if (FT.getUpT > 0) return 'groggy';
    if (FT.guard) return 'guard';
    return null;
  }
  function reset() {
    FT.hearts = TUNE.hearts; FT.invuln = 0; FT.downT = 0; FT.getUpT = 0; FT.guard = false; FT.guardWant = false; FT.guardT0 = -9; FT.lastHit = -99; FT.regenT = 0;
    FT.started = false; FT.perfects = 0; FT.blocks = 0; FT.hitsTaken = 0; FT.flops = 0; FT.attackers = 0; FT.maxAttackers = 0; FT.kb.set(0, 0, 0); FT.bubble = null;
    star.starsOn = false;
    if (FT.blink) { P.char.group.visible = true; FT.blink = 0; }
    for (const s of shots) if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
    shots.length = 0;
    D.ui.hearts(FT.hearts, TUNE.hearts, { show: false });
  }
  // the minute is up / the bill: back on your feet, nothing pending
  function stop() {
    FT.downT = 0; FT.getUpT = 0; FT.guard = false; FT.invuln = 0; FT.kb.set(0, 0, 0); FT.bubble = null; star.starsOn = false;
    if (FT.blink) { P.char.group.visible = true; FT.blink = 0; }
  }
  // debug / tests: make someone a fighter, make them swing right now
  function make(n, rank = 'mid') { if (!n) return false; setFighter(n, rank); return true; }
  function attackNow(n, atk = 'melee') {
    if (!n || !n.fighter || !on()) return false;
    n.standUp(); n.char.lookAt(null); n.path = null;
    n.yaw = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z);
    startWindup(n, atk);
    return true;
  }
  function state() {
    return {
      hearts: FT.hearts, max: TUNE.hearts, guard: FT.guard, guardWant: FT.guardWant, down: FT.downT > 0, gettingUp: FT.getUpT > 0, invuln: +Math.max(0, FT.invuln).toFixed(2),
      attackers: FT.attackers, maxAttackers: FT.maxAttackers, perfects: FT.perfects, blocks: FT.blocks, hitsTaken: FT.hitsTaken, flops: FT.flops, started: FT.started,
      shots: shots.filter((s) => !s.rest).length,
    };
  }
  return {
    FT, TUNE, RANK, on, designate, anger, nameOf, bossName, midName, meName, onFight, npcTick, update, frame, setGuard, playerAnim, playerBubble,
    hitPlayer, reset, stop, make, attackNow, state, hud, playerDown: down, canAttack: () => !FT.guard && !down(),
    moveScale: () => (down() ? 0 : FT.guard ? TUNE.guardSpeed : 1),
    resetMaxAttackers() { FT.maxAttackers = 0; },
    // a slipper in flight heading for the player within r metres (the bot guards)
    incoming(r = 2.2) { for (const s of shots) { if (s.done || s.back || s.rest) continue; const dx = P.pos.x - s.p.x, dz = P.pos.z - s.p.z; if (Math.hypot(dx, dz) < r && dx * s.v.x + dz * s.v.z > 0) return true; } return false; },
  };
}
