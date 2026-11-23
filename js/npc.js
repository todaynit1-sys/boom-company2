// 회사 뿌개기 — coworkers: idle/seated loops, scripted walks, panic (shock → flee → cower/leave), comic knock-back.
import * as THREE from 'three';
import { makeCharacter } from './art/chars.js';
import { collideCircle } from './nav.js';

const PI = Math.PI;
const rnd = (a, b) => a + Math.random() * (b - a);
function angLerp(a, b, k) { let d = b - a; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return a + d * Math.min(1, k); }

export const FLEE_LINES = ['저… 저는 퇴근할게요', '부장님 도망가요!', '김 대리 왜 저래?!', '제 모니터는 안 돼요!', '오늘 회식 취소죠?!', '살려 주세요~', '인사팀! 인사팀!'];
export const BOSS_LINES = ['자, 자네 진정하게…', '연봉 얘기 다시 하자고!', '내일 쉬어도 돼! 응?', '커피는 내가 살게…'];

let SEQ = 0;
export class NPC {
  constructor(spec, opts = {}) {
    this.spec = spec;
    this.id = spec.id || 'npc' + SEQ++;
    this.role = spec.role || 'worker';
    // spec.look: optional colour overrides for the preset (e.g. a guard uniform: { suit, pants, shirt, tie })
    this.char = makeCharacter(Object.assign({}, spec.look || {}, { preset: spec.preset, seed: spec.variantSeed != null ? spec.variantSeed : (spec.id ? hash(spec.id) : SEQ) }));
    this.pos = new THREE.Vector3(spec.x, 0, spec.z);
    this.y = 0;
    this.yaw = spec.rotY || 0;
    this.baseAnim = spec.anim || 'idle';
    this.baseFace = spec.face || 'normal';
    this.seat = spec.seat || null;
    this.home = this.pos.clone(); this.homeYaw = this.yaw;
    this.state = 'idle'; this.t = 0;
    this.path = null; this.pathI = 0; this.goal = null; this.onArrive = null; this.walkSpeed = 1.3; this.walkAnim = 'walk';
    this.vel = new THREE.Vector3();
    this.r = 0.27;
    this.speed = 0;
    this.bubble = null;
    this.gone = false;
    this.lastMoved = new THREE.Vector3(); this.stuckT = 0;
    this.panicked = false; this.hitCount = 0;
    // seat height offset vs an office chair: ctx.npc(…, { seatY: 0.11 }) for higher chairs (12층 board chairs)
    this.sitY = spec.seatY != null ? spec.seatY : spec.sofa ? -0.045 : 0;
    this.char.setAnim(this.baseAnim);
    this.char.setFace(this.baseFace);
    if (spec.anim === 'sit' || spec.anim === 'type' || spec.anim === 'stretch') this.seated = true;
    if (this.seat && this.seat.chair && this.seat.chair.rec) this.seat.chair.rec.solid = true;
    this.place();
  }
  get group() { return this.char.group; }
  place() {
    const g = this.char.group;
    g.position.set(this.pos.x, this.y + (this.seated ? this.sitY : 0), this.pos.z);
    g.rotation.y = this.yaw;
  }
  say(text, sec = 2.6, now = 0) { this.bubble = { text, until: now + sec }; }
  standUp() {
    if (!this.seated) return;
    this.seated = false;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.pos.x -= fx * 0.55; this.pos.z -= fz * 0.55;
    if (this.seat && this.seat.chair && this.seat.chair.rec) this.seat.chair.rec.solid = false;
    this.place();
  }
  walkTo(ctx, x, z, { speed = 1.3, anim = 'walk', onArrive = null } = {}) {
    this.standUp();
    this.goal = new THREE.Vector3(x, 0, z);
    this.path = ctx.nav ? ctx.nav.path(this.pos.x, this.pos.z, x, z) : [[x, z]];
    if (!this.path) this.path = [[x, z]];
    this.pathI = 0; this.walkSpeed = speed; this.walkAnim = anim; this.onArrive = onArrive;
    this.state = 'walk'; this.t = 0; this.stuckT = 0; this.lastMoved.copy(this.pos);
    this.char.setAnim(anim);
  }
  // panic reaction (rampage)
  alarm(ctx, from) {
    if (this.gone || this.role === 'walker') return;
    if (this.state === 'air' || this.state === 'down' || this.state === 'shock') return;
    if (this.panicked && (this.state === 'flee' || this.state === 'hide')) return;
    if (this.panicked && this.state === 'cower') {
      if (this.pos.distanceTo(from) < 3.2 && this.t > 1.5) this.flee(ctx, from);
      return;
    }
    this.panicked = true;
    this.state = 'shock'; this.t = 0; this.shockLen = rnd(0.35, 0.75);
    this.char.setFace('shock');
    this.char.setAnim(this.seated ? (this.baseAnim === 'type' ? 'sit' : this.baseAnim) : 'scared');
    this.char.lookAt(from.clone().setY(1.2));
    this.from = from.clone();
    if (Math.random() < 0.5 || this.role === 'boss') ctx.sfx('gasp', { pitch: rnd(0.9, 1.25), vol: 0.5 });
  }
  flee(ctx, from) {
    this.standUp();
    this.char.lookAt(null);
    this.char.setFace('scared');
    if (this.role === 'boss') {
      const spot = ctx.pickHide(this.pos, from);
      this.walkTo(ctx, spot.x, spot.z, { speed: 3.4, anim: 'flee', onArrive: () => { this.state = 'cower'; this.t = 0; this.char.setAnim('scared'); this.yaw = Math.atan2(from.x - this.pos.x, from.z - this.pos.z); } });
      this.state = 'flee';
      this.say(BOSS_LINES[(Math.random() * BOSS_LINES.length) | 0], 2.8, ctx.now);
      return;
    }
    const ex = ctx.pickExit(this.pos, from);
    this.walkTo(ctx, ex.x, ex.z, { speed: rnd(3.6, 4.6), anim: 'flee', onArrive: () => this.arriveExit(ctx, ex) });
    this.state = 'flee';
    ctx.sfx('yelp', { pitch: rnd(0.85, 1.3), vol: 0.55 });
    if (Math.random() < 0.45) this.say(FLEE_LINES[(Math.random() * FLEE_LINES.length) | 0], 2.4, ctx.now);
  }
  arriveExit(ctx, ex) {
    if (ex.leave) {
      // into the elevator / out of the door
      this.state = 'leave'; this.t = 0;
      this.leaveDir = ex.dir ? ex.dir.clone() : new THREE.Vector3(0, 0, -1);
      this.char.setAnim('run');
    } else { this.state = 'cower'; this.t = 0; this.char.setAnim('scared'); }
  }
  knock(ctx, dir, power = 1) {
    if (this.gone) return false;
    if (this.state === 'air') return false;
    this.standUp();
    this.panicked = true; this.hitCount++;
    this.state = 'air'; this.t = 0;
    const p = 3.2 + power * 2.2;
    this.vel.set(dir.x * p, 3.6 + power * 1.2, dir.z * p);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.y = Math.max(this.y, 0.05);
    this.char.setAnim('fall'); this.char.setFace('shock'); this.char.lookAt(null);
    this.path = null;
    ctx.sfx('yelp', { pitch: rnd(1.0, 1.4), vol: 0.7 });
    return true;
  }
  update(dt, ctx) {
    if (this.gone) return;
    this.t += dt;
    const c = this.char;
    let sp = 0;
    switch (this.state) {
      case 'idle': {
        // look at the player when near (story feel)
        if (ctx.player && !this.seatedLook) {
          const d = this.pos.distanceTo(ctx.player);
          c.lookAt(d < 3.2 ? ctx.playerHead : null);
        }
        break;
      }
      case 'walk': case 'flee': {
        sp = this.follow(dt, ctx);
        break;
      }
      case 'shock': {
        if (this.t > this.shockLen) this.flee(ctx, this.from || ctx.player);
        break;
      }
      case 'cower': {
        if (ctx.player) this.yaw = angLerp(this.yaw, Math.atan2(ctx.player.x - this.pos.x, ctx.player.z - this.pos.z), dt * 4);
        if (this.role === 'boss' && this.t > 3.5 && Math.random() < dt * 0.4) { this.say(BOSS_LINES[(Math.random() * BOSS_LINES.length) | 0], 2.6, ctx.now); this.t = 0; }
        break;
      }
      case 'leave': {
        sp = 4;
        this.pos.addScaledVector(this.leaveDir, -sp * dt);
        this.yaw = Math.atan2(-this.leaveDir.x, -this.leaveDir.z);
        if (this.t > 0.8) { this.gone = true; this.char.group.visible = false; this.bubble = null; }
        break;
      }
      case 'air': {
        this.vel.y -= 14 * dt;
        this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.y += this.vel.y * dt;
        collideCircle(this.pos, this.r, ctx.lists, this.y);
        c.group.rotation.x = -Math.min(1.1, this.t * 3.2);
        if (this.y <= 0 && this.vel.y < 0) {
          this.y = 0; c.group.rotation.x = 0;
          this.state = 'down'; this.t = 0; this.downLen = rnd(1.7, 2.4);
          c.setAnim('knocked'); c.setFace('scared'); c.playOnce('land');
          ctx.sfx('land', { vol: 0.5, pitch: 0.8 });
          ctx.onLand && ctx.onLand(this);
        }
        break;
      }
      case 'down': {
        if (this.t > this.downLen) {
          c.setAnim('scared');
          this.state = 'cower'; this.t = 0;
          this.flee(ctx, ctx.player || this.pos);
        }
        break;
      }
      case 'script': break;
      case 'stroll': {
        sp = this.spec.speed || 1.2;
        this.pos.x += this.dir * sp * dt;
        if (this.pos.x > this.spec.x1) this.dir = -1; else if (this.pos.x < this.spec.x0) this.dir = 1;
        this.yaw = this.dir > 0 ? PI / 2 : -PI / 2;
        break;
      }
    }
    this.speed = sp;
    this.place();
    c.update(dt, sp);
  }
  follow(dt, ctx) {
    if (!this.path || this.pathI >= this.path.length) { this.arrive(); return 0; }
    const [tx, tz] = this.path[this.pathI];
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    const last = this.pathI === this.path.length - 1;
    if (d < (last ? 0.12 : 0.3)) { this.pathI++; if (this.pathI >= this.path.length) { this.arrive(); return 0; } return this.walkSpeed; }
    const sp = Math.min(this.walkSpeed, last ? Math.max(0.6, d * 3) : this.walkSpeed);
    this.pos.x += (dx / d) * sp * dt; this.pos.z += (dz / d) * sp * dt;
    this.yaw = angLerp(this.yaw, Math.atan2(dx, dz), dt * 10);
    collideCircle(this.pos, this.r, ctx.lists, 0);
    // stuck → replan
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      if (this.pos.distanceTo(this.lastMoved) < 0.25 && this.goal) {
        const p = ctx.nav && ctx.nav.path(this.pos.x, this.pos.z, this.goal.x, this.goal.z);
        if (p) { this.path = p; this.pathI = 0; } else this.pathI++;
        this.stuckCount = (this.stuckCount || 0) + 1;
        if (this.stuckCount > 6) { this.arrive(); }
      }
      this.stuckT = 0; this.lastMoved.copy(this.pos);
    }
    return sp;
  }
  arrive() {
    this.path = null; this.stuckCount = 0;
    const cb = this.onArrive; this.onArrive = null;
    if (this.state === 'walk') { this.state = 'idle'; this.char.setAnim(this.arriveAnim || 'idle'); }
    if (cb) cb();
  }
  dispose() { this.char.dispose(); }
}

function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 997; }
