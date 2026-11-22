// 회사 뿌개기 — effects: debris cubes, sparks, fluttering papers, tossed bits, shockwave ring, objective marker.
import * as THREE from 'three';
import { makeProp } from './art/props.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export function createFx(scene) {
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);

  // ---------------- debris
  const DN = 220;
  const dMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.65 }), DN);
  dMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dMesh.castShadow = true; dMesh.receiveShadow = true; dMesh.frustumCulled = false;
  const D = [];
  _m.makeScale(0, 0, 0);
  for (let i = 0; i < DN; i++) {
    D.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: 0.05, life: 0, sx: 1, sy: 1, sz: 1 });
    dMesh.setMatrixAt(i, _m); dMesh.setColorAt(i, _c.set('#ffffff'));
  }
  root.add(dMesh);
  let dIdx = 0, dActive = 0;

  // ---------------- sparks
  const SN = 100;
  const sMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#ffe9a8', toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), SN);
  sMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sMesh.frustumCulled = false;
  const S = [];
  for (let i = 0; i < SN; i++) { S.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 0.3, s: 0.04 }); sMesh.setMatrixAt(i, _m); }
  root.add(sMesh);
  let sIdx = 0;

  // ---------------- papers
  const PN = 46;
  const papers = [];
  for (let i = 0; i < PN; i++) {
    const pr = makeProp('paperSheet');
    pr.group.visible = false; pr.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    root.add(pr.group);
    papers.push({ g: pr.group, on: false, landed: false, p: new THREE.Vector3(), v: new THREE.Vector3(), ph: 0, spin: 0, yaw: 0, t: 0 });
  }
  let pIdx = 0;

  // ---------------- tossed (non-physics) props: paper balls etc.
  const tossed = [];

  // ---------------- shockwave ring
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.visible = false; root.add(ring);
  let ringT = -1;

  // ---------------- objective marker (floor ring + floating chevron)
  const mk = new THREE.Group(); mk.visible = false; root.add(mk);
  const mkMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  const mkRing = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.5, 40), mkMat);
  mkRing.rotation.x = -Math.PI / 2; mkRing.position.y = 0.015; mk.add(mkRing);
  const chev = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: '#ffd23f', toneMapped: false }));
  chev.rotation.x = Math.PI; mk.add(chev);
  let mkH = 2.3;

  const fx = {
    root,
    debris(pos, colors, n = 8, power = 3, size = 0.06) {
      for (let k = 0; k < n; k++) {
        const i = dIdx, d = D[i]; dIdx = (dIdx + 1) % DN;
        d.on = true; d.life = 0;
        d.p.set(pos.x + rnd(-0.15, 0.15), pos.y + rnd(-0.1, 0.15), pos.z + rnd(-0.15, 0.15));
        d.v.set(rnd(-1, 1) * power, rnd(0.6, 1.6) * power, rnd(-1, 1) * power);
        d.q.setFromEuler(_e.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)));
        d.w.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12));
        d.s = size * rnd(0.6, 1.5); d.sx = rnd(0.6, 1.4); d.sy = rnd(0.4, 1.1); d.sz = rnd(0.6, 1.4);
        dMesh.setColorAt(i, _c.set(colors[(Math.random() * colors.length) | 0] || 0xcccccc));
      }
      if (dMesh.instanceColor) dMesh.instanceColor.needsUpdate = true;
    },
    sparks(pos, n = 10, power = 4) {
      for (let k = 0; k < n; k++) {
        const s = S[sIdx]; sIdx = (sIdx + 1) % SN;
        s.on = true; s.life = 0; s.max = rnd(0.18, 0.38); s.s = rnd(0.025, 0.05);
        s.p.copy(pos);
        s.v.set(rnd(-1, 1), rnd(-0.2, 1.2), rnd(-1, 1)).normalize().multiplyScalar(power * rnd(0.6, 1.4));
      }
    },
    papers(pos, n = 4, power = 2) {
      let made = 0;
      for (let k = 0; k < n; k++) {
        const P = papers[pIdx]; pIdx = (pIdx + 1) % PN;
        P.on = true; P.landed = false; P.t = 0;
        P.p.set(pos.x + rnd(-0.2, 0.2), pos.y + rnd(0, 0.3), pos.z + rnd(-0.2, 0.2));
        P.v.set(rnd(-1, 1) * power, rnd(1, 2.4) * power * 0.8, rnd(-1, 1) * power);
        P.ph = rnd(0, 6); P.spin = rnd(-5, 5); P.yaw = rnd(0, 6);
        P.g.visible = true; made++;
      }
      return made;
    },
    toss(group, pos, vel, spin = 6, parent = root) {
      group.position.copy(pos); parent.add(group);
      tossed.push({ g: group, v: vel.clone(), w: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(spin), t: 0, rest: false });
    },
    shockwave(pos, radius = 6) {
      ring.position.set(pos.x, 0.06, pos.z); ring.visible = true; ringT = 0; ring.userData.r = radius;
    },
    marker(pos, h = 2.3) {
      if (!pos) { mk.visible = false; return; }
      mk.visible = true; mk.position.set(pos.x, pos.y || 0, pos.z); mkH = h;
    },
    clear() {
      for (const d of D) d.on = false;
      for (const s of S) s.on = false;
      for (const P of papers) { P.on = false; P.g.visible = false; }
      for (const t of tossed) if (t.g.parent) t.g.parent.remove(t.g);
      tossed.length = 0;
      _m.makeScale(0, 0, 0);
      for (let i = 0; i < DN; i++) dMesh.setMatrixAt(i, _m);
      for (let i = 0; i < SN; i++) sMesh.setMatrixAt(i, _m);
      dMesh.instanceMatrix.needsUpdate = true; sMesh.instanceMatrix.needsUpdate = true;
      ring.visible = false; mk.visible = false;
    },
    papersLanded() { let n = 0; for (const P of papers) if (P.on && P.landed) n++; return n; },
    active() { return dActive; },
    update(dt, t) {
      // debris
      dActive = 0;
      for (let i = 0; i < DN; i++) {
        const d = D[i];
        if (!d.on) continue;
        dActive++;
        d.life += dt;
        d.v.y -= 13 * dt;
        d.p.addScaledVector(d.v, dt);
        const half = d.s * d.sy * 0.5;
        if (d.p.y < half) {
          d.p.y = half;
          if (d.v.y < 0) d.v.y *= -0.3;
          d.v.x *= 0.62; d.v.z *= 0.62; d.w.multiplyScalar(0.55);
        }
        _e.set(d.w.x * dt, d.w.y * dt, d.w.z * dt); _q.setFromEuler(_e); d.q.multiply(_q);
        let k = 1;
        if (d.life > 2.6) k = Math.max(0, 1 - (d.life - 2.6) / 0.6);
        if (k <= 0) { d.on = false; _m.makeScale(0, 0, 0); dMesh.setMatrixAt(i, _m); continue; }
        _s.set(d.s * d.sx * k, d.s * d.sy * k, d.s * d.sz * k);
        _m.compose(d.p, d.q, _s); dMesh.setMatrixAt(i, _m);
      }
      dMesh.instanceMatrix.needsUpdate = true;
      // sparks
      for (let i = 0; i < SN; i++) {
        const s = S[i];
        if (!s.on) continue;
        s.life += dt;
        if (s.life > s.max) { s.on = false; _m.makeScale(0, 0, 0); sMesh.setMatrixAt(i, _m); continue; }
        s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt);
        const k = 1 - s.life / s.max;
        _q.identity(); _s.set(s.s * k, s.s * k * 2.2, s.s * k);
        _m.compose(s.p, _q, _s); sMesh.setMatrixAt(i, _m);
      }
      sMesh.instanceMatrix.needsUpdate = true;
      // papers
      for (const P of papers) {
        if (!P.on || P.landed) continue;
        P.t += dt; P.ph += dt * 6;
        P.v.y -= 9 * dt;
        if (P.v.y < -0.9) P.v.y = -0.9 + (P.v.y + 0.9) * 0.2;
        P.v.x *= 1 - dt * 1.6; P.v.z *= 1 - dt * 1.6;
        P.p.x += (P.v.x + Math.sin(P.ph) * 0.8) * dt; P.p.z += (P.v.z + Math.cos(P.ph * 0.7) * 0.6) * dt; P.p.y += P.v.y * dt;
        P.yaw += P.spin * dt;
        if (P.p.y <= 0.004) {
          P.p.y = 0.004; P.landed = true;
          P.g.position.copy(P.p); P.g.rotation.set(0, P.yaw, 0);
        } else {
          P.g.position.copy(P.p); P.g.rotation.set(Math.sin(P.ph) * 0.9, P.yaw, Math.cos(P.ph * 1.3) * 0.7);
        }
      }
      // tossed
      for (const T of tossed) {
        if (T.rest) continue;
        T.t += dt; T.v.y -= 12 * dt;
        T.g.position.addScaledVector(T.v, dt);
        T.g.rotation.x += T.w.x * dt; T.g.rotation.y += T.w.y * dt; T.g.rotation.z += T.w.z * dt;
        if (T.g.position.y <= 0) {
          T.g.position.y = 0;
          if (Math.abs(T.v.y) < 1.2) { T.rest = true; T.g.rotation.x = 0; T.g.rotation.z = 0; }
          T.v.y *= -0.35; T.v.x *= 0.5; T.v.z *= 0.5; T.w.multiplyScalar(0.5);
        }
      }
      // ring
      if (ringT >= 0) {
        ringT += dt;
        const k = ringT / 0.55;
        if (k >= 1) { ringT = -1; ring.visible = false; }
        else { const r = 0.5 + (ring.userData.r || 6) * (1 - Math.pow(1 - k, 3)); ring.scale.setScalar(r); ringMat.opacity = 0.9 * (1 - k); }
      }
      // marker
      if (mk.visible) {
        chev.position.y = mkH + Math.sin(t * 3.2) * 0.12;
        chev.rotation.y = t * 1.5;
        const s = 1 + Math.sin(t * 4) * 0.08; mkRing.scale.setScalar(s);
        mkMat.opacity = 0.6 + Math.sin(t * 4) * 0.25;
      }
    },
  };
  return fx;
}
