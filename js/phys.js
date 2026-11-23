// 회사 뿌개기 — physics per floor (cannon-es). Every breakable prop is a sleeping box body until disturbed.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const HEAVY = 15;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SLEEPING = CANNON.Body.SLEEPING;

export function hpFor(mass) { return clamp(Math.round(Math.sqrt(Math.max(0.1, mass)) * 0.9), 1, 8); }
// What a thing pays on the bill. Everyday office things (≤ ₩80,000) pay their price; above that the price is
// compressed logarithmically so one huge item (a ₩15M boss car, a ₩3M vase) is a jackpot of ₩250–330k instead
// of five times a whole good minute. 120k → 99k · 250k → 135k · 800k → 190k · 3M → 254k · 6M → 287k · 15.4M → 332k
export const PAY_KNEE = 80000;
export function payPrice(raw) {
  raw = Math.max(0, raw || 0);
  if (raw <= PAY_KNEE) return Math.round(raw);
  return Math.round(PAY_KNEE * (1 + 0.6 * Math.log(raw / PAY_KNEE)) / 1000) * 1000;
}

export function createPhys(F) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -13, 0), allowSleep: true });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 7;
  world.defaultContactMaterial.friction = 0.42;
  world.defaultContactMaterial.restitution = 0.12;
  world.defaultContactMaterial.contactEquationStiffness = 5e6;
  world.defaultContactMaterial.contactEquationRelaxation = 4;

  const ground = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  // ceiling (keeps launched props inside)
  const ceil = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ceil.quaternion.setFromEuler(Math.PI / 2, 0, 0); ceil.position.set(0, F.ceilY, 0);
  world.addBody(ceil);
  for (const b of F.bodies) {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(b.hx, b.hy, b.hz)) });
    body.position.set(b.x, b.y, b.z);
    body.quaternion.setFromEuler(0, b.rot || 0, 0);
    world.addBody(body);
    if (b.ref) b.ref.body = body; // breakable window panes keep their body so they can be removed
  }
  // kinematic player capsule (nudges chairs and small things)
  const playerBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, allowSleep: false });
  playerBody.addShape(new CANNON.Sphere(0.25), new CANNON.Vec3(0, 0.3, 0));
  playerBody.addShape(new CANNON.Sphere(0.24), new CANNON.Vec3(0, 0.85, 0));
  world.addBody(playerBody);

  const records = [];
  const byBody = new Map();
  const P = {
    world, records, playerBody, onImpact: null, time: 0,
    addProp(prop, x, y, z, rotY = 0, tag = null, sp = null) {
      const s = prop.size;
      const hx = Math.max(0.02, s.x / 2), hy = Math.max(0.012, s.y / 2), hz = Math.max(0.02, s.z / 2);
      // fixed = breakable fixture (static body: aquarium, safe, wall-mounted things until knocked loose)
      const fixed = !!(sp && sp.fixed);
      const body = new CANNON.Body({
        mass: fixed ? 0 : clamp(prop.mass, 0.15, 160), type: fixed ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
        shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
        linearDamping: 0.06, angularDamping: 0.12, allowSleep: true,
      });
      body.sleepSpeedLimit = 0.3; body.sleepTimeLimit = 0.45;
      body.position.set(x, y + hy, z);
      body.quaternion.setFromEuler(0, rotY, 0);
      world.addBody(body);
      if (!fixed) body.sleep();
      const hpMax = sp && sp.hp ? sp.hp : fixed && prop.mass <= 0 ? clamp(Math.round(Math.sqrt(Math.max(1, prop.price) / 20000)), 2, 10) : hpFor(prop.mass);
      const rec = {
        id: records.length, sp, prop, type: prop.type, name: prop.name, group: prop.group, body, hx, hy, hz,
        mass: prop.mass, price: payPrice(prop.price), rawPrice: prop.price || 0, material: prop.material, colors: prop.colors,
        hp: hpMax, hpMax, paid: 0, destroyed: false, wrecked: false, flipped: false, held: false, removed: false,
        heavy: prop.mass >= HEAVY && !fixed, tag, energized: 0, cool: 0, awakeLast: false, solid: false, kicked: false,
        fixed, hang: !!(sp && sp.hang), riding: false, stage: 0,
        box: { x: 0, z: 0, hx: 0, hz: 0, rot: 0, c: 1, s: 0, y1: 0, off: false },
      };
      prop.group.matrixAutoUpdate = false;
      syncRec(rec);
      body.addEventListener('collide', (e) => {
        if (!P.onImpact) return;
        let v = 0;
        try { v = Math.abs(e.contact.getImpactVelocityAlongNormal()); } catch (err) { v = 0; }
        if (v > 3) P.onImpact(rec, byBody.get(e.body) || null, v);
      });
      byBody.set(body, rec);
      records.push(rec);
      return rec;
    },
    recOf(body) { return byBody.get(body) || null; },
    step(dt) {
      if (dt <= 0) return;
      P.time += dt;
      // poor man's CCD: when something is flying fast, step in halves / thirds so a 0.2 m partition is never
      // skipped in one step (cannon-es has no continuous collision); speeds are capped at 16 m/s
      let pre = 0;
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.removed || r.held || r.fixed || r.body.sleepState === SLEEPING) continue;
        const v = r.body.velocity, s2 = v.x * v.x + v.y * v.y + v.z * v.z;
        if (s2 > pre) pre = s2;
      }
      P.fast = Math.sqrt(pre);
      const h = Math.min(dt, 1 / 30), n = P.fast > 11 ? 3 : P.fast > 6 ? 2 : 1;
      for (let k = 0; k < n; k++) world.step(h / n);
      let awake = 0;
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.removed || r.held || r.fixed) continue;
        const aw = r.body.sleepState !== SLEEPING;
        if (aw) {
          const v = r.body.velocity, s2 = v.x * v.x + v.y * v.y + v.z * v.z;
          if (s2 > 256) { const k = 16 / Math.sqrt(s2); v.x *= k; v.y *= k; v.z *= k; }
        }
        if (aw) awake++;
        if (aw || r.awakeLast) syncRec(r);
        r.awakeLast = aw;
        if (aw && r.body.position.y < -2 && !r.out) { r.body.position.set(r.body.position.x, 1, r.body.position.z); r.body.velocity.set(0, 0, 0); }
      }
      // keep the active set sane: put slow, non-energised bodies to sleep when too many are awake
      if (awake > 110) {
        for (const r of records) {
          if (r.removed || r.held || r.fixed || r.riding || r.body.sleepState === SLEEPING || r.energized > P.time) continue;
          const b = r.body;
          if (b.velocity.lengthSquared() < 1.2) { b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); b.sleep(); syncRec(r); if (--awake <= 80) break; }
        }
      }
      P.awake = awake;
    },
    wake(rec) { if (rec.body.sleepState === SLEEPING) rec.body.wakeUp(); },
    // a fixture knocked loose (wall clock, CCTV, mirror ball…) becomes an ordinary falling body
    release(rec) {
      if (!rec.fixed || rec.removed) return false;
      if (rec.inst) rec.inst(rec);
      rec.fixed = false; rec.hang = false;
      const b = rec.body;
      b.type = CANNON.Body.DYNAMIC; b.mass = clamp(rec.mass || 1, 0.15, 160); b.updateMassProperties();
      // a wall-hung thing faces the room (local +Z): step it off the wall so a punch toward the wall can't
      // start it inside the wall body (thin portraits used to tunnel through)
      const q = b.quaternion, fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
      b.position.x += fx * 0.07; b.position.z += fz * 0.07;
      b.velocity.x += fx * 0.6; b.velocity.z += fz * 0.6;
      rec.wallN = { x: fx, z: fz, until: P.time + 1.0 };
      b.wakeUp();
      rec.heavy = rec.mass >= HEAVY;
      return true;
    },
    // riding / forklift-carried: the body follows the game, still pushes other bodies around
    setKinematic(rec, on) {
      const b = rec.body;
      if (on) { if (rec.inst) rec.inst(rec); b.type = CANNON.Body.KINEMATIC; b.mass = 0; b.updateMassProperties(); b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); b.wakeUp(); }
      else { b.type = CANNON.Body.DYNAMIC; b.mass = clamp(rec.mass, 0.15, 160); b.updateMassProperties(); b.wakeUp(); }
    },
    wakeNear(x, y, z, rad, except) {
      for (const r of records) {
        if (r === except || r.removed || r.held || r.fixed) continue;
        const p = r.body.position;
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < rad * rad && p.y > y - 0.2) r.body.wakeUp();
      }
    },
    remove(rec) {
      if (rec.removed) return;
      if (rec.inst) rec.inst(rec);
      rec.removed = true;
      world.removeBody(rec.body);
      if (rec.group.parent) rec.group.parent.remove(rec.group);
    },
    detach(rec) { // held by the player
      if (rec.inst) rec.inst(rec);
      rec.held = true;
      world.removeBody(rec.body);
    },
    reattach(rec, pos, quat) {
      rec.held = false;
      rec.body.position.set(pos.x, pos.y, pos.z);
      if (quat) rec.body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
      rec.body.velocity.set(0, 0, 0); rec.body.angularVelocity.set(0, 0, 0);
      world.addBody(rec.body);
      rec.body.wakeUp();
    },
    setPlayer(x, y, z, vx, vy, vz) {
      playerBody.position.set(x, y, z);
      playerBody.velocity.set(vx, vy, vz);
    },
    // walking obstacles from heavy props (and occupied chairs)
    obstacles(out) {
      out.length = 0;
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.removed || r.held || r.riding || r.fixed || !(r.heavy || r.solid)) continue;
        const b = r.body, q = b.quaternion, B = r.box;
        const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
        if (upY > 0.85) {
          const fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
          const rot = Math.atan2(fx, fz);
          B.x = b.position.x; B.z = b.position.z; B.hx = r.hx; B.hz = r.hz; B.rot = rot; B.c = Math.cos(rot); B.s = Math.sin(rot);
          B.y1 = b.position.y + r.hy;
        } else {
          // axis aligned bounds of the tumbled box
          const xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z, xy = q.x * q.y, xz = q.x * q.z, yz = q.y * q.z, wx = q.w * q.x, wy = q.w * q.y, wz = q.w * q.z;
          const m00 = 1 - 2 * (yy + zz), m01 = 2 * (xy - wz), m02 = 2 * (xz + wy);
          const m10 = 2 * (xy + wz), m11 = 1 - 2 * (xx + zz), m12 = 2 * (yz - wx);
          const m20 = 2 * (xz - wy), m21 = 2 * (yz + wx), m22 = 1 - 2 * (xx + yy);
          B.x = b.position.x; B.z = b.position.z;
          B.hx = Math.abs(m00) * r.hx + Math.abs(m01) * r.hy + Math.abs(m02) * r.hz;
          B.hz = Math.abs(m20) * r.hx + Math.abs(m21) * r.hy + Math.abs(m22) * r.hz;
          const hyw = Math.abs(m10) * r.hx + Math.abs(m11) * r.hy + Math.abs(m12) * r.hz;
          B.hx *= 0.85; B.hz *= 0.85;
          B.rot = 0; B.c = 1; B.s = 0; B.y1 = b.position.y + hyw;
        }
        if (B.y1 < 0.35) continue;
        out.push(B);
      }
      return out;
    },
    counts() {
      let live = 0, awake = 0;
      for (const r of records) { if (r.removed) continue; live++; if (!r.held && !r.fixed && r.body.sleepState !== SLEEPING) awake++; }
      return { bodies: world.bodies.length, records: live, awake };
    },
  };
  for (const sp of F.props) sp.rec = P.addProp(sp.prop, sp.x, sp.y, sp.z, sp.rotY, sp.tag, sp);
  return P;
}

const _q = new THREE.Quaternion();
export function syncRec(r) {
  if (r.inst) r.inst(r); // leave the instanced batch the first time it moves
  const b = r.body, q = b.quaternion, hy = r.hy;
  // body centre → prop origin (bottom centre): subtract R·(0,hy,0)
  const ox = 2 * (q.x * q.y - q.w * q.z) * hy, oy = (1 - 2 * (q.x * q.x + q.z * q.z)) * hy, oz = 2 * (q.y * q.z + q.w * q.x) * hy;
  const g = r.group;
  g.position.set(b.position.x - ox, b.position.y - oy, b.position.z - oz);
  g.quaternion.set(q.x, q.y, q.z, q.w);
  g.updateMatrix();
}
export function recCenter(r, out) { const p = r.body.position; return out.set(p.x, p.y, p.z); }
export function recUpright(r) { const q = r.body.quaternion; return 1 - 2 * (q.x * q.x + q.z * q.z); }
export { _q };
