// 회사 뿌개기 — coworkers: idle/seated loops, scripted walks, panic (shock → flee → cower/leave), and slapstick hits:
// every hit costs 멘탈 (stamina) and flings them by its strength (stumble → fly → bounce → slide); at 0 they go
// 깨꼬닥 (KO: stars, spiral eyes, a little soul puff) for ~10–14 s, then sit up groggy and stagger off. Nobody is ever
// hurt for real, nobody disappears while knocked out (they only leave by walking out afterwards).
import * as THREE from 'three';
import { makeCharacter } from './art/chars.js';
import { collideCircle } from './nav.js';

const PI = Math.PI;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
function angLerp(a, b, k) { let d = b - a; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return a + d * Math.min(1, k); }

export const FLEE_LINES = ['저… 저는 퇴근할게요', '부장님 도망가요!', '김 대리 왜 저래?!', '제 모니터는 안 돼요!', '오늘 회식 취소죠?!', '살려 주세요~', '인사팀! 인사팀!'];
export const BOSS_LINES = ['자, 자네 진정하게…', '연봉 얘기 다시 하자고!', '내일 쉬어도 돼! 응?', '커피는 내가 살게…'];
// hit bubbles escalate as 멘탈 runs out: first hit → OUCH, in between → WAIT, last one left → HELP
export const HIT_LINES = {
  ouch: ['아야!', '아얏!', '왜 나한테!', '앗 따거!'],
  wait: ['잠깐만요!', '대화로 해요!', '산재 처리 되나요?!', '진정하세요!'],
  help: ['살려 주세요…', '별이 보여요…', '띠용…', '머리가 빙글빙글…'],
  ko: ['꼬르륵…', '깨꼬닥…', '…(꽥)', '퇴근… 하고… 싶다…'],
  vipKo: ['연봉… 올려… 줄게…', '휴가… 다 써도… 돼…', '자네… 승진… 이야…'],
  wake: ['…여긴 어디?', '…오늘 무슨 요일이죠?', '…퇴근 시간인가요?', '…꿈이었나?'],
  vipWake: ['…회의 끝났나?', '…내 안경 어딨지?', '…방금 뭐였지?'],
  trip: ['으앗!', '꽈당!', '아이고!'],
  ears: ['귀가!', '으아아!', '시끄러워요!'],
};
// 멘탈 per role (spec.mental overrides): coworkers take 3 punches, bosses / security 5
// (fighters get their own: 보스 15, 중간보스 10 — see fight.js RANK)
export const MENTAL = { boss: 5, ceo: 5, exec: 5, guard: 5 };
// fighting states (fight.js runs them through ctx.fightTick)
const FIGHTING = new Set(['ready', 'fight', 'windup', 'swing', 'recover', 'stun', 'taunt']);
export const KO_LEN = [10.5, 13]; // seconds knocked out (VIPs +1.5)

let SEQ = 0;
const _v = new THREE.Vector3();
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
    // 멘탈 + KO state
    this.vip = this.role === 'boss' || this.role === 'ceo';
    this.mentalMax = spec.mental != null ? spec.mental : MENTAL[this.role] || 3;
    this.mental = this.mentalMax;
    this.koCount = 0; this.koT = 0; this.koLen = 0; this.koFace = false; this.koAfter = false; this.limp = false;
    this.bounced = false; this.twirl = 0; this.tumble = 0; this.airT = 0.5; this.yaw0 = 0;
    this.head = new THREE.Vector3(); this.chest = new THREE.Vector3(); // world points for stars / soul puff / bubbles
    this.starsOn = false; this.ghostOn = false; this.starSize = 1;
    // 반격: fighter = { rank: 'boss' | 'mid' | 'angry' } (set by fight.js), beaten after their first KO (then they flee)
    this.fighter = null; this.hothead = false; this.beaten = false; this.cool = 0; this.tagH = 0;
    this.bumpK = 0; this.squashT = 1; this.faceT = 0; this.nextTrip = 0; this.peekT = 0;
    this.sc = this.char.group.scale.x;
    this.char.group.rotation.order = 'YXZ'; // tumble about the body's own axes, then yaw
    // seat height offset vs an office chair: ctx.npc(…, { seatY: 0.11 }) for higher chairs (12층 board chairs)
    this.sitY = spec.seatY != null ? spec.seatY : spec.sofa ? -0.045 : 0;
    this.char.setAnim(this.baseAnim);
    this.char.setFace(this.baseFace);
    if (spec.anim === 'sit' || spec.anim === 'type' || spec.anim === 'stretch') this.seated = true;
    if (this.seat && this.seat.chair && this.seat.chair.rec) this.seat.chair.rec.solid = true;
    this.place();
  }
  get group() { return this.char.group; }
  // knocked out in any form (lying, flying limp, carried, sitting up groggy)
  get isKo() { return this.state === 'ko' || this.state === 'carried' || this.state === 'wake' || ((this.state === 'air' || this.state === 'slide') && (this.limp || this.koAfter)); }
  get lying() { return this.state === 'ko' || this.state === 'down' || this.state === 'slide' || this.state === 'carried'; }
  // punches / kicks / thrown things can reach them (KO'd bodies too: they get nudged about)
  get targetable() { return !this.gone && this.state !== 'carried' && !(this.state === 'air' && this.t < 0.15); }
  place() {
    const g = this.char.group;
    g.position.set(this.pos.x, this.y + (this.seated ? this.sitY : 0), this.pos.z);
    g.rotation.y = this.yaw;
  }
  say(text, sec = 2.6, now = 0) { this.bubble = { text, until: now + sec }; }
  // fighters stand their ground during a rampage (until they've been knocked out once)
  fights(ctx) { return !!(this.fighter && !this.beaten && ctx.fightOn && ctx.fightOn(this)); }
  get fighting() { return FIGHTING.has(this.state); }
  // square up: fists up, face the player (ready = wait for them to come close, fight = go get them)
  engage(ctx, ready = false) {
    this.standUp();
    this.path = null; this.onArrive = null;
    this.char.lookAt(null);
    if (!this.isKo) this.starsOn = false; // (dizzy / stunned stars off)
    this.state = ready ? 'ready' : 'fight'; this.t = 0;
    this.char.setAnim('fightIdle'); this.char.setFace('rage');
    if (!ready && ctx.onFight) ctx.onFight(this, 'engage');
  }
  standUp(noShift = false) {
    if (!this.seated) return;
    this.seated = false;
    if (!noShift) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      this.pos.x -= fx * 0.55; this.pos.z -= fz * 0.55;
    }
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
    if (this.state === 'air' || this.state === 'down' || this.state === 'shock' || this.state === 'slide' || this.state === 'stumble' || this.state === 'dizzy' || this.isKo) return;
    // a fighter doesn't run: squares up where they stand
    if (this.fights(ctx)) { if (!this.fighting) this.engage(ctx, true); return; }
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
  // a colleague just went 깨꼬닥 nearby: gasp + shocked face for a beat (then they carry on panicking)
  witness(ctx, from) {
    if (this.gone || this.role === 'walker' || this.isKo || this.state === 'air' || this.state === 'slide') return false;
    this.char.setFace('shock'); this.faceT = 1.1;
    if (!this.panicked) this.alarm(ctx, from);
    return true;
  }
  flee(ctx, from, opts = null) {
    if (this.fights(ctx)) { this.engage(ctx); return; } // (after a hit / a dizzy spell: back at it)
    this.standUp();
    this.char.lookAt(null);
    const groggy = !!(opts && opts.groggy);
    this.char.setFace(groggy ? 'sleepy' : 'scared');
    const speed = groggy ? rnd(1.5, 1.9) : null, anim = groggy ? 'stagger' : 'flee';
    if (this.role === 'boss') {
      const spot = ctx.pickHide(this.pos, from);
      this.walkTo(ctx, spot.x, spot.z, { speed: speed || 3.4, anim, onArrive: () => { this.state = 'cower'; this.t = 0; this.peekT = rnd(1.2, 2.2); this.char.setAnim('scared'); this.char.setFace('scared'); this.yaw = Math.atan2(from.x - this.pos.x, from.z - this.pos.z); } });
      this.state = 'flee';
      if (!groggy) this.say(pick(BOSS_LINES), 2.8, ctx.now);
      return;
    }
    const ex = ctx.pickExit(this.pos, from);
    this.walkTo(ctx, ex.x, ex.z, { speed: speed || rnd(3.6, 4.6), anim, onArrive: () => this.arriveExit(ctx, ex) });
    this.state = 'flee';
    this.nextTrip = rnd(1.2, 3);
    if (groggy) return;
    ctx.sfx('yelp', { pitch: rnd(0.85, 1.3), vol: 0.55 });
    if (Math.random() < 0.45) this.say(pick(FLEE_LINES), 2.4, ctx.now);
  }
  arriveExit(ctx, ex) {
    if (ex.leave) {
      // into the elevator / out of the door
      this.state = 'leave'; this.t = 0;
      this.leaveDir = ex.dir ? ex.dir.clone() : new THREE.Vector3(0, 0, -1);
      this.char.setAnim('run');
    } else { this.state = 'cower'; this.t = 0; this.char.setAnim('scared'); }
  }
  // legacy entry (old callers): a hit of `power` costing one 멘탈 (two for strong ones)
  knock(ctx, dir, power = 1) { return this.hit(ctx, dir, power, power >= 1.1 ? 2 : 1, 'knock') > 0; }
  // a hit: returns 0 (no effect), 1 (hit), 2 (this hit knocked them out), 3 (a KO'd body nudged / kicked about)
  // kind tunes the reaction: 'shout' covers ears and stumbles, 'spray' slips them off their feet, 'trip' is a fall
  hit(ctx, dir, power = 1, dmg = 1, kind = 'punch') {
    if (this.gone || this.state === 'carried' || this.role === 'walker') return 0;
    if (this.state === 'air' && this.t < 0.15) return 0; // already flying from this very blow
    this.char.lookAt(null);
    this.path = null; this.onArrive = null;
    if (this.state === 'ko' || ((this.state === 'air' || this.state === 'slide') && (this.limp || this.koAfter))) {
      // limp body: no 멘탈 left to lose, it just gets bumped along (a kick sends it rolling)
      if (kind === 'shout' || kind === 'spray') { this.vel.set(dir.x * 1.2, 0, dir.z * 1.2); if (this.state === 'ko') { this.state = 'slide'; this.t = 0; this.limp = true; } return 3; }
      this.limp = true;
      this.launch(dir, Math.min(1.1, power * 0.75), false, true);
      this.koT = Math.min(this.koT, Math.max(0, this.koLen - 3)); // a kick buys them a few more seconds down
      return 3;
    }
    const wasWake = this.state === 'wake';
    const fwdDot = Math.sin(this.yaw) * dir.x + Math.cos(this.yaw) * dir.z; // > 0: struck from behind
    const wasSeated = this.seated;
    this.standUp(true);
    if (wasSeated) this.y = Math.max(this.y, 0.4 + this.sitY);
    this.panicked = true; this.hitCount++;
    this.mental = wasWake ? 0 : Math.max(0, this.mental - dmg);
    const ko = this.mental <= 0;
    if (ko) {
      this.koAfter = true; this.limp = false;
      this.koFace = fwdDot > 0.45 && !this.vip; // hit from behind → face-plant (bosses always land face up: glasses fly)
      this.char.setFace('shock');
      this.launch(dir, power, true, false);
      return 2;
    }
    // a fighter mid wind-up grits their teeth: 멘탈 still drops, but no flinch / knock-back — the swing comes anyway
    // (so the "!" means: guard or step away; trading blows still wins, it just costs some 체력 now and then)
    if (this.state === 'windup' && this.fighter && kind !== 'special') {
      this.squashT = 0; this.char.setFace('rage');
      if (Math.random() < 0.5) this.say(pick(['안 아파!', '끄떡없어!', '간지러워!', '어림없다!']), 1.0, ctx.now);
      ctx.sfx('yelp', { pitch: rnd(0.75, 0.9), vol: 0.45 });
      return 1;
    }
    // 보스·중간보스 shrug off most plain punches (no stun-lock by mashing): only every Nth one staggers
    // (fighter.armor from the difficulty — 보통: 보스 3 · 중간보스 2, 어려움 5 · 3, 쉬움 2 · 1)
    if (this.fighter && this.fighter.rank !== 'angry' && power < 0.7 && kind !== 'special' && kind !== 'shout' && kind !== 'spray' && !wasSeated && this.fights(ctx)) {
      this.armorHits = (this.armorHits || 0) + 1;
      const armor = this.fighter.armor || (this.fighter.rank === 'boss' ? 3 : 2);
      if (this.armorHits % armor !== 0) {
        this.squashT = 0; this.char.playOnce('land'); this.char.setFace('rage');
        if (Math.random() < 0.35) this.say(pick(['안 아파!', '그게 다야?', '어림없다!', '간지러워!']), 1.0, ctx.now);
        ctx.sfx('yelp', { pitch: rnd(0.7, 0.85), vol: 0.45 });
        return 1;
      }
    }
    // still standing: the bubble escalates with what's left
    const left = this.mental;
    const line = left === 1 ? pick(HIT_LINES.help) : this.hitCount === 1 ? pick(HIT_LINES.ouch) : pick(HIT_LINES.wait);
    if (kind === 'shout') {
      this.state = 'stumble'; this.t = 0; this.stumbleLen = 0.9;
      this.vel.set(dir.x * 1.4, 0, dir.z * 1.4);
      this.yaw = Math.atan2(-dir.x, -dir.z);
      this.char.setAnim('coverEars'); this.char.setFace('scared');
      this.say(pick(HIT_LINES.ears), 1.4, ctx.now);
      return 1;
    }
    if (kind === 'spray') {
      // slipped on the foam: feet up, flat on the back for a moment
      this.launch(dir, 0.25, false, false);
      this.vel.y = 2.6; this.tumble = -PI / 2;
      this.say(line, 1.6, ctx.now);
      ctx.sfx('yelp', { pitch: rnd(1.1, 1.4), vol: 0.6 });
      return 1;
    }
    if (power < 0.7 && !wasSeated) {
      // a punch: flinch and skid back on the feet (stays in reach for the next one)
      this.state = 'stumble'; this.t = 0; this.stumbleLen = 0.42 + power * 0.25;
      const p = 2.2 + power * 3.2;
      this.vel.set(dir.x * p, 0, dir.z * p);
      this.yaw = Math.atan2(-dir.x, -dir.z);
      this.y = 0; this.hopV = 1.5 + power;
      this.char.setAnim('scared'); this.char.setFace(left === 1 ? 'dizzy' : 'shock');
      this.char.playOnce('land');
    } else {
      this.launch(dir, power, false, false);
      this.char.setFace('shock');
    }
    this.say(line, left === 1 ? 2.2 : 1.6, ctx.now);
    ctx.sfx('yelp', { pitch: rnd(1.0, 1.4) + (this.mentalMax - left) * 0.06, vol: 0.7 });
    return 1;
  }
  // into the air: horizontal speed and hang-time by power; KO hits fly higher and twirl, limp bodies roll
  launch(dir, power, ko, limp) {
    this.state = 'air'; this.t = 0; this.bounced = false;
    const h = 1.6 + power * 3.3, vy = 2.0 + power * 2.0 + (ko ? 1.5 : 0) - (limp ? 0.8 : 0);
    this.vel.set(dir.x * h, vy, dir.z * h);
    this.y = Math.max(this.y, 0.05);
    this.airT = (2 * vy) / 14 + Math.sqrt(2 * Math.max(0, this.y) / 14);
    if (limp) {
      // keep the lying pose, roll over once
      this.twirl = 0; this.tumble = 0; this.rollDir = Math.random() < 0.5 ? -1 : 1;
      this.char.setAnim(this.koFace ? 'koFace' : 'ko');
    } else if (ko && this.koFace) {
      this.yaw = Math.atan2(dir.x, dir.z); // falls forward along the blow
      this.twirl = 0; this.tumble = PI / 2;
      this.char.setAnim('fall');
    } else {
      this.yaw = Math.atan2(-dir.x, -dir.z);
      this.twirl = ko ? 2 * PI * (Math.random() < 0.5 ? -1 : 1) : 0;
      this.tumble = -PI / 2 - (power > 1.15 ? 2 * PI : 0); // strong blows: a full back-flip on the way
      this.char.setAnim('fall');
    }
    this.yaw0 = this.yaw;
    if (!limp) { this.starsOn = false; this.ghostOn = false; }
  }
  // E 들기: the KO'd body goes into the player's arms (main parents the group); throwLimp() lets go
  pickUp() {
    if (this.state !== 'ko' && !(this.state === 'slide' && this.koAfter)) return false;
    this.state = 'carried'; this.t = 0; this.koFace = false; this.char.setAnim('ko');
    return true;
  }
  throwLimp(x, y, z, vx, vy, vz, yaw) {
    this.pos.set(x, 0, z); this.y = Math.max(0.05, y); this.yaw = yaw;
    this.state = 'air'; this.t = 0; this.bounced = false; this.limp = true; this.koAfter = true;
    this.vel.set(vx, vy, vz);
    this.twirl = 0; this.tumble = 0; this.rollDir = 1; this.yaw0 = yaw;
    this.koT = 0;
    this.char.setAnim('ko');
  }
  update(dt, ctx) {
    if (this.gone) return;
    this.t += dt;
    const c = this.char;
    const g = c.group;
    let sp = 0;
    if (this.faceT > 0) { this.faceT -= dt; if (this.faceT <= 0 && !this.isKo && this.state !== 'air') c.setFace(this.panicked ? 'scared' : this.baseFace); }
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
        // fleeing in a blind panic: now and then they trip over their own feet
        if (this.state === 'flee' && this.walkAnim === 'flee' && this.role !== 'boss' && sp > 3) {
          this.nextTrip -= dt;
          if (this.nextTrip <= 0) { this.nextTrip = rnd(2.5, 5); if (Math.random() < 0.3) this.trip(ctx); }
        }
        break;
      }
      case 'shock': {
        if (this.t > this.shockLen) this.flee(ctx, this.from || ctx.player);
        break;
      }
      case 'cower': {
        if (ctx.player) this.yaw = angLerp(this.yaw, Math.atan2(ctx.player.x - this.pos.x, ctx.player.z - this.pos.z), dt * 4);
        if (this.role === 'boss') {
          // peek round the pillar, duck back
          this.peekT -= dt;
          if (this.peekT <= 0) {
            const peeking = c.anim === 'peek';
            c.setAnim(peeking ? 'scared' : 'peek'); c.setFace(peeking ? 'scared' : 'shock');
            this.peekT = peeking ? rnd(1.6, 3.0) : rnd(0.9, 1.4);
          }
          if (this.t > 3.5 && Math.random() < dt * 0.4) { this.say(pick(BOSS_LINES), 2.6, ctx.now); this.t = 0; }
        }
        break;
      }
      case 'leave': {
        sp = 4;
        this.pos.addScaledVector(this.leaveDir, -sp * dt);
        this.yaw = Math.atan2(-this.leaveDir.x, -this.leaveDir.z);
        if (this.t > 0.8) { this.gone = true; this.char.group.visible = false; this.bubble = null; this.starsOn = false; this.ghostOn = false; }
        break;
      }
      case 'stumble': {
        // skidding back on the feet (+ a little hop), then dizzy / flee
        const k = Math.max(0, 1 - dt * 6);
        this.vel.x *= k; this.vel.z *= k;
        this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
        if (this.hopV) { this.y += this.hopV * dt; this.hopV -= 14 * dt; if (this.y <= 0) { this.y = 0; this.hopV = 0; } }
        collideCircle(this.pos, this.r, ctx.lists, 0);
        if (ctx.keepIn) ctx.keepIn(this.pos, this.r);
        if (this.t > this.stumbleLen) { this.y = 0; this.afterHit(ctx); }
        break;
      }
      case 'dizzy': {
        if (this.t > this.dizzyLen) { this.starsOn = false; c.setFace('scared'); this.flee(ctx, ctx.player || this.pos); }
        break;
      }
      case 'air': {
        this.vel.y -= 14 * dt;
        this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.y += this.vel.y * dt;
        collideCircle(this.pos, this.r, ctx.lists, this.y);
        if (ctx.keepIn) ctx.keepIn(this.pos, this.r);
        if (this.bounced || this.limp) this.keepBody(ctx);
        const u = Math.min(1, this.t / Math.max(0.2, this.airT)), e = u * u * (3 - 2 * u);
        if (this.limp) { g.rotation.x = 0; g.rotation.z = this.bounced ? 0 : Math.sin(u * PI) * 0.6 * (this.rollDir || 1); }
        else if (!this.bounced) { g.rotation.x = this.tumble * e; this.yaw = this.yaw0 + this.twirl * (1 - e); }
        const gh = ctx.groundAt ? ctx.groundAt(this.pos.x, this.pos.z) : 0;
        if (this.y <= gh && this.vel.y < 0) {
          this.y = gh; g.rotation.x = 0; g.rotation.z = 0; this.yaw = this.yaw0;
          const hs = Math.hypot(this.vel.x, this.vel.z);
          const lie = this.koAfter || this.limp ? (this.koFace ? 'koFace' : 'ko') : this.trip_ ? 'koFace' : 'knocked';
          if (!this.bounced && this.vel.y < -3.2) {
            // first contact: flop flat, bounce once
            this.bounced = true;
            this.vel.y = -this.vel.y * 0.3; this.vel.x *= 0.72; this.vel.z *= 0.72;
            this.y = gh + 0.01;
            c.setAnim(lie); if (this.koAfter) c.setFace('ko');
            this.squashT = 0;
            ctx.onLand && ctx.onLand(this, 'bounce', hs);
          } else {
            c.setAnim(lie);
            this.state = 'slide'; this.t = 0;
            if (!this.bounced) { this.squashT = 0; ctx.onLand && ctx.onLand(this, 'land', hs); }
            this.bounced = true;
          }
        }
        break;
      }
      case 'slide': {
        // lying, skidding to a stop
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (hs > 0.05) {
          const k = Math.max(0, hs - 7 * dt) / hs;
          this.vel.x *= k; this.vel.z *= k;
          this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
          collideCircle(this.pos, this.r, ctx.lists, 0.05);
          if (ctx.keepIn) ctx.keepIn(this.pos, this.r);
          this.keepBody(ctx);
        }
        if (hs <= 0.05 || this.t > 1.2) {
          this.vel.set(0, 0, 0);
          if (this.koAfter || this.limp) this.enterKo(ctx);
          else { this.state = 'down'; this.t = 0; this.downLen = this.trip_ ? rnd(0.6, 0.9) : rnd(0.8, 1.2); c.setFace(this.mental === 1 ? 'dizzy' : 'scared'); }
        }
        break;
      }
      case 'down': {
        if (this.t > this.downLen) { this.trip_ = false; this.afterHit(ctx); }
        break;
      }
      case 'ko': {
        this.koT += dt;
        if (this.pushed) { this.pushed = false; collideCircle(this.pos, this.r, ctx.lists, 0.05); if (ctx.keepIn) ctx.keepIn(this.pos, this.r); this.keepBody(ctx); }
        if (this.koT > 0.7 && !this.ghostOn && this.koT < this.koLen - 0.6) { this.ghostOn = true; ctx.onKo && ctx.onKo(this, 'ghost'); }
        if (this.koT >= this.koLen) this.wake(ctx);
        else if (this.t % 1 < dt) ctx.onKo && ctx.onKo(this, 'keep'); // (re-attach stars after the fx pools were cleared)
        break;
      }
      case 'wake': {
        // sitting up groggy: shake the head, bump shrinks, glasses back on, then stagger off
        if (this.t > 1.0 && !this.saidWake) { this.saidWake = true; this.say(pick(this.vip ? HIT_LINES.vipWake : HIT_LINES.wake), 2.4, ctx.now); }
        if (this.t > 1.7 && !this.glassesBack) { this.glassesBack = true; ctx.onKo && ctx.onKo(this, 'glasses'); }
        if (this.t > 2.8) {
          this.mental = 1; this.koAfter = false; this.limp = false;
          c.setFace('sleepy'); this.faceT = 2.5;
          this.flee(ctx, ctx.player || this.pos, { groggy: true });
        }
        break;
      }
      case 'ready': case 'fight': case 'windup': case 'swing': case 'recover': case 'stun': case 'taunt': {
        if (ctx.fightTick && this.fighter) sp = ctx.fightTick(this, dt, ctx);
        else { this.state = 'idle'; this.t = 0; c.setAnim('idle'); }
        break;
      }
      case 'carried': break;
      case 'script': break;
      case 'stroll': {
        sp = this.spec.speed || 1.2;
        this.pos.x += this.dir * sp * dt;
        if (this.pos.x > this.spec.x1) this.dir = -1; else if (this.pos.x < this.spec.x0) this.dir = 1;
        this.yaw = this.dir > 0 ? PI / 2 : -PI / 2;
        break;
      }
    }
    // bump grows with a little overshoot while out, shrinks back while waking / walking off
    const bumpWant = this.state === 'ko' || this.state === 'carried' || (this.state === 'air' || this.state === 'slide') && this.koAfter ? 1 : 0;
    if (bumpWant || this.bumpK > 0) {
      if (bumpWant) this.bumpK = Math.min(1.45, this.bumpK + dt * 4);
      else this.bumpK = Math.max(0, this.bumpK - dt * 0.4);
      const b = bumpWant ? (this.bumpK > 1 ? 1 + (1.45 - this.bumpK) * 0.5 : this.bumpK * 1.22) : Math.min(1, this.bumpK);
      c.setBump(b);
    }
    this.speed = sp;
    if (this.state !== 'carried') this.place();
    // landing squash (flattens the body for a beat)
    if (this.squashT < 0.32) {
      this.squashT += dt;
      const u = Math.min(1, this.squashT / 0.32), k = Math.sin(u * PI) * (1 - u * 0.5);
      g.scale.set(this.sc * (1 + 0.16 * k), this.sc * (1 - 0.3 * k), this.sc * (1 + 0.16 * k));
      if (u >= 1) g.scale.setScalar(this.sc);
    }
    if (this.starsOn || this.ghostOn || this.isKo || this.state === 'dizzy' || this.state === 'stun') this.anchors();
    c.update(dt, sp);
  }
  // a body lying flat reaches ~1.2 m past its feet: keep the head end out of walls / windows / out-zones too
  keepBody(ctx) {
    if (!(this.koAfter || this.limp || this.lying || this.trip_)) return;
    const f = this.koFace ? 1 : -1, s = this.sc * 1.05;
    const hx = this.pos.x + f * Math.sin(this.yaw) * s, hz = this.pos.z + f * Math.cos(this.yaw) * s;
    _v.set(hx, 0, hz);
    collideCircle(_v, 0.22, ctx.lists, 0.05);
    if (ctx.keepIn) ctx.keepIn(_v, 0.22);
    this.pos.x += _v.x - hx; this.pos.z += _v.z - hz;
  }
  // world points for the stars / soul puff / bubble (no allocation; group transform by hand)
  anchors() {
    const g = this.char.group;
    if (this.state === 'carried') {
      g.updateWorldMatrix(true, false);
      this.head.set(0, 0.25, -1.15); g.localToWorld(this.head);
      this.chest.set(0, 0.25, -0.7); g.localToWorld(this.chest);
      return;
    }
    const s = this.sc, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const set = (out, lz, ly) => out.set(this.pos.x + lz * sy * s, this.y + ly * s, this.pos.z + lz * cy * s);
    if (this.lying || this.state === 'ko' || (this.state === 'air' && (this.limp || this.bounced))) {
      const f = this.koFace ? 1 : -1;
      set(this.head, f * 1.17, 0.27); set(this.chest, f * 0.7, 0.25);
    } else if (this.state === 'wake') { set(this.head, -0.14, 0.78); set(this.chest, -0.05, 0.45); }
    else { set(this.head, 0, 1.17); set(this.chest, 0, 0.75); }
  }
  // bubble anchor (frameUI): above the head, wherever the head is
  bubbleAt(out) {
    if (this.isKo || this.lying || this.state === 'dizzy' || this.state === 'stun') { this.anchors(); return out.set(this.head.x, this.head.y + 0.62 + (this.isKo || this.lying ? this.tagH * 0.5 : this.tagH), this.head.z); }
    return out.set(this.pos.x, this.y + (this.seated ? 1.45 : 1.95) * this.sc + this.tagH, this.pos.z);
  }
  enterKo(ctx) {
    const fresh = this.koLen === 0; // a new KO (not a limp body landing again)
    this.state = 'ko'; this.t = 0;
    this.char.setAnim(this.koFace ? 'koFace' : 'ko'); this.char.setFace('ko');
    if (fresh) { this.koT = 0; this.koLen = rnd(KO_LEN[0], KO_LEN[1]) + (this.vip ? 1.5 : 0); this.koCount++; }
    this.starsOn = true; this.starSize = this.sc;
    this.limp = false; this.koAfter = true;
    this.saidWake = false; this.glassesBack = false;
    this.keepBody(ctx);
    this.anchors();
    if (fresh) ctx.onKo && ctx.onKo(this, 'land');
  }
  wake(ctx) {
    if (this.fighter) this.beaten = true; // knocked out once: no more fighting, they stagger off like everybody else
    this.state = 'wake'; this.t = 0; this.koLen = 0;
    this.starsOn = false; this.ghostOn = false;
    this.koFace = false;
    this.char.setAnim('groggy'); this.char.setFace('sleepy');
    ctx.onKo && ctx.onKo(this, 'wake');
  }
  // scripted reset (story scenes): fresh 멘탈, no KO leftovers
  resetKo() {
    this.mental = this.mentalMax; this.koLen = 0; this.koT = 0; this.koAfter = false; this.limp = false; this.trip_ = false; this.beaten = false;
    this.starsOn = false; this.ghostOn = false; this.bumpK = 0; this.squashT = 1; this.faceT = 0;
    this.char.setBump(0); this.char.setTieFlop(0); this.char.setGlasses(true);
    this.char.group.scale.setScalar(this.sc); this.char.group.rotation.z = 0;
  }
  // after a non-KO hit: wobble when one hit from KO, else run
  afterHit(ctx) {
    if (this.mental === 1) {
      this.state = 'dizzy'; this.t = 0; this.dizzyLen = rnd(1.3, 1.8);
      this.char.setAnim('dizzy'); this.char.setFace('dizzy');
      this.starsOn = true; this.starSize = this.sc * 0.7; this.anchors();
      ctx.onKo && ctx.onKo(this, 'dizzy');
      return;
    }
    this.char.setAnim('scared');
    this.state = 'cower'; this.t = 0;
    this.flee(ctx, ctx.player || this.pos);
  }
  trip(ctx) {
    this.trip_ = true; this.koFace = false;
    const f = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.state = 'air'; this.t = 0; this.bounced = true; // no bounce: straight onto the face
    this.vel.set(f.x * 3.2, 2.2, f.z * 3.2);
    this.y = 0.05; this.airT = 0.32;
    this.twirl = 0; this.tumble = PI / 2; this.yaw0 = this.yaw;
    this.char.setAnim('fall'); this.char.setFace('shock');
    this.path = null; this.onArrive = null;
    this.say(pick(HIT_LINES.trip), 1.3, ctx.now);
    ctx.sfx('yelp', { pitch: rnd(1.2, 1.5), vol: 0.5 });
    ctx.onKo && ctx.onKo(this, 'trip');
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
