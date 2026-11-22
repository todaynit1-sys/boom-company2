// 회사 뿌개기 — effects: debris cubes, sparks, fluttering papers, tossed bits, shockwave ring, objective marker.
import * as THREE from 'three';
import { makeProp } from './art/props.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export function createFx(scene) {
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);

  // ---------------- debris (ring buffer: the pool size is the cap on live chunks)
  const DN = 300;
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
  const SN = 160;
  const sMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#ffe9a8', toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), SN);
  sMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sMesh.frustumCulled = false;
  const S = [];
  for (let i = 0; i < SN; i++) { S.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 0.3, s: 0.04 }); sMesh.setMatrixAt(i, _m); }
  root.add(sMesh);
  let sIdx = 0;

  // ---------------- glass shards: thin spinning plates whose brightness flickers with their spin (glints; >1 → bloom)
  const HN = 140;
  const hGeo = new THREE.TetrahedronGeometry(1, 0); hGeo.scale(1, 0.12, 0.7);
  const hMesh = new THREE.InstancedMesh(hGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }), HN);
  hMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); hMesh.frustumCulled = false; hMesh.castShadow = false;
  const H = [];
  for (let i = 0; i < HN; i++) { H.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: 0.05, life: 0, ph: 0, rest: false }); hMesh.setMatrixAt(i, _m); hMesh.setColorAt(i, _c.set('#cfeefa')); }
  root.add(hMesh);
  let hIdx = 0;

  // ---------------- impact sprites: a white-hot star for ~2 frames + radial "hit lines" that burst outward
  function burstTex(lines) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'); g.translate(64, 64);
    if (lines) {
      // comic speed lines: 14 thin wedges with a hole in the middle
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.12, r0 = 26 + (i % 3) * 6, r1 = 60 - (i % 2) * 8, w = 0.05 + (i % 3) * 0.015;
        g.fillStyle = i % 3 ? '#ffffff' : '#fff1a0';
        g.beginPath(); g.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0); g.closePath(); g.fill();
      }
    } else {
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 60);
      rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.22, 'rgba(255,250,210,1)'); rg.addColorStop(0.5, 'rgba(255,214,90,0.55)'); rg.addColorStop(1, 'rgba(255,190,60,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.fill();
      // 4-point star
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(-7, 0); g.lineTo(0, -62); g.lineTo(7, 0); g.closePath(); g.fill(); }
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const IMP = [];
  const flashTex = burstTex(false), linesTex = burstTex(true);
  for (let i = 0; i < 10; i++) {
    const lines = i >= 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lines ? linesTex : flashTex, transparent: true, depthTest: false, depthWrite: false, blending: lines ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false }));
    sp.visible = false; sp.renderOrder = 50; sp.frustumCulled = false;
    root.add(sp);
    IMP.push({ sp, lines, life: 0, max: 0.1, s: 1, on: false });
  }
  let iFlash = 0, iLines = 4;

  // ---------------- papers
  // one sheet prop is taken apart into instanced parts (sheet + printed side): 2 draw calls for all 72 sheets
  const PN = 72;
  const papers = [];
  const sheet = makeProp('paperSheet').group;
  sheet.updateMatrixWorld(true);
  const pParts = [];
  sheet.traverse((o) => {
    if (!o.isMesh) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, PN);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true;
    for (let i = 0; i < PN; i++) im.setMatrixAt(i, _m);
    im.visible = false; root.add(im);
    pParts.push({ im, local: o.matrixWorld.clone() });
  });
  for (let i = 0; i < PN; i++) papers.push({ on: false, landed: false, p: new THREE.Vector3(), v: new THREE.Vector3(), ph: 0, spin: 0, yaw: 0, t: 0, rx: 0, rz: 0 });
  let pIdx = 0, pDirty = false;
  const _pm = new THREE.Matrix4(), _pm2 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
  function paperMatrix(i, P) {
    _q.setFromEuler(_e.set(P.rx, P.yaw, P.rz));
    _pm.compose(P.p, _q, _one);
    for (const pp of pParts) { _pm2.multiplyMatrices(_pm, pp.local); pp.im.setMatrixAt(i, _pm2); }
    pDirty = true;
  }

  // ---------------- puffs (extinguisher smoke, dust): round white blobs that grow then shrink away
  const FN = 120;
  const fMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.12 }), FN);
  fMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fMesh.frustumCulled = false; fMesh.castShadow = false; fMesh.receiveShadow = false;
  const PF = [];
  for (let i = 0; i < FN; i++) { PF.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s: 0.2 }); fMesh.setMatrixAt(i, _m); }
  root.add(fMesh);
  let fIdx = 0;

  // ---------------- water drops (sprinklers, burst tanks)
  const WN = 320;
  const wMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.15, 0.014), new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.7, depthWrite: false }), WN);
  wMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); wMesh.frustumCulled = false; wMesh.castShadow = false;
  const WD = [];
  for (let i = 0; i < WN; i++) { WD.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }); wMesh.setMatrixAt(i, _m); }
  root.add(wMesh);
  let wIdx = 0;

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
    // chunks: dir (unit, xz) = the way the hit pushed → most chunks fly away from the hit and up
    debris(pos, colors, n = 8, power = 3, size = 0.06, dir = null) {
      for (let k = 0; k < n; k++) {
        const i = dIdx, d = D[i]; dIdx = (dIdx + 1) % DN;
        d.on = true; d.life = 0;
        d.p.set(pos.x + rnd(-0.15, 0.15), pos.y + rnd(-0.1, 0.15), pos.z + rnd(-0.15, 0.15));
        if (dir) {
          const f = power * rnd(0.55, 1.35);
          d.v.set(dir.x * f + rnd(-0.75, 0.75) * power, rnd(0.8, 1.7) * power, dir.z * f + rnd(-0.75, 0.75) * power);
        } else d.v.set(rnd(-1, 1) * power, rnd(0.7, 1.6) * power, rnd(-1, 1) * power);
        d.q.setFromEuler(_e.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)));
        d.w.set(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14));
        d.s = size * rnd(0.7, 1.6); d.sx = rnd(0.6, 1.4); d.sy = rnd(0.45, 1.1); d.sz = rnd(0.6, 1.4);
        dMesh.setColorAt(i, _c.set(colors[(Math.random() * colors.length) | 0] || 0xcccccc));
      }
      if (dMesh.instanceColor) dMesh.instanceColor.needsUpdate = true;
    },
    sparks(pos, n = 10, power = 4, dir = null, life = 1) {
      for (let k = 0; k < n; k++) {
        const s = S[sIdx]; sIdx = (sIdx + 1) % SN;
        s.on = true; s.life = 0; s.max = rnd(0.18, 0.38) * life; s.s = rnd(0.025, 0.05) * (life > 1 ? 1.25 : 1);
        s.p.copy(pos);
        s.v.set(rnd(-1, 1), rnd(-0.2, 1.2), rnd(-1, 1)).normalize();
        if (dir) { s.v.x += dir.x * 1.2; s.v.z += dir.z * 1.2; s.v.normalize(); }
        s.v.multiplyScalar(power * rnd(0.6, 1.4));
      }
    },
    // glass: glinting shards
    shards(pos, n = 12, power = 2.6, dir = null, size = 0.05) {
      for (let k = 0; k < n; k++) {
        const h = H[hIdx]; hIdx = (hIdx + 1) % HN;
        h.on = true; h.rest = false; h.life = 0; h.ph = rnd(0, 6);
        h.p.set(pos.x + rnd(-0.12, 0.12), pos.y + rnd(-0.1, 0.2), pos.z + rnd(-0.12, 0.12));
        h.v.set(rnd(-1, 1) * power, rnd(0.6, 1.5) * power, rnd(-1, 1) * power);
        if (dir) { h.v.x += dir.x * power * 0.8; h.v.z += dir.z * power * 0.8; }
        h.q.setFromEuler(_e.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)));
        h.w.set(rnd(-16, 16), rnd(-16, 16), rnd(-16, 16));
        h.s = size * rnd(0.6, 1.5);
      }
    },
    // contact point pop: a white-hot star (skipped when flash = false, e.g. calm mode) + burst lines
    impact(pos, size = 1, flash = true) {
      if (flash) {
        const f = IMP[iFlash]; iFlash = (iFlash + 1) % 4;
        f.on = true; f.life = 0; f.max = 0.05; f.s = 0.55 * size; f.sp.visible = true; f.sp.position.copy(pos);
        f.sp.material.rotation = rnd(0, Math.PI); f.sp.scale.setScalar(f.s); f.sp.material.opacity = 1;
      }
      const l = IMP[iLines]; iLines = iLines + 1 >= IMP.length ? 4 : iLines + 1;
      l.on = true; l.life = 0; l.max = 0.17; l.s = 0.75 * size; l.sp.visible = true; l.sp.position.copy(pos);
      l.sp.material.rotation = rnd(0, Math.PI * 2); l.sp.scale.setScalar(l.s * 0.5); l.sp.material.opacity = 1;
    },
    // a heavy thing hits the floor: a ring of dust rolling outward along the floor
    dustRing(pos, radius = 0.6, n = 10) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd(-0.2, 0.2);
        const c = Math.cos(a), s = Math.sin(a);
        fx.puff(_p.set(pos.x + c * radius * 0.6, 0.08, pos.z + s * radius * 0.6), _v.set(c * rnd(1.6, 2.6), rnd(0.05, 0.35), s * rnd(1.6, 2.6)), 0.12 + Math.min(1, radius) * 0.06, rnd(0.5, 0.75));
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
        made++;
      }
      return made;
    },
    toss(group, pos, vel, spin = 6, parent = root) {
      group.position.copy(pos); parent.add(group);
      tossed.push({ g: group, v: vel.clone(), w: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(spin), t: 0, rest: false });
    },
    puff(pos, vel, size = 0.18, life = 0.9) {
      const P = PF[fIdx]; fIdx = (fIdx + 1) % FN;
      P.on = true; P.life = 0; P.max = life * rnd(0.8, 1.2); P.s = size * rnd(0.7, 1.3);
      P.p.copy(pos); P.v.copy(vel);
    },
    // live counts (perf checks): pools are fixed size, so these are also the caps
    stats() {
      let d = 0, s = 0, h = 0, f = 0, p = 0, i = 0;
      for (const x of D) if (x.on) d++;
      for (const x of S) if (x.on) s++;
      for (const x of H) if (x.on) h++;
      for (const x of PF) if (x.on) f++;
      for (const x of papers) if (x.on && !x.landed) p++;
      for (const x of IMP) if (x.on) i++;
      return { debris: d, sparks: s, shards: h, puffs: f, papers: p, impacts: i, caps: { debris: DN, sparks: SN, shards: HN, puffs: FN, papers: PN } };
    },
    drop(pos, vel) {
      const d = WD[wIdx]; wIdx = (wIdx + 1) % WN;
      d.on = true; d.life = 0; d.p.copy(pos); d.v.copy(vel);
    },
    water(pos, n = 30, power = 2.5) {
      for (let k = 0; k < n; k++) fx.drop(_p.set(pos.x + rnd(-0.3, 0.3), pos.y + rnd(0, 0.3), pos.z + rnd(-0.3, 0.3)), new THREE.Vector3(rnd(-1, 1) * power, rnd(0.4, 1.4) * power, rnd(-1, 1) * power));
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
      for (const P of papers) P.on = false;
      for (const pp of pParts) { for (let i = 0; i < PN; i++) pp.im.setMatrixAt(i, _m); pp.im.instanceMatrix.needsUpdate = true; pp.im.visible = false; }
      for (const t of tossed) if (t.g.parent) t.g.parent.remove(t.g);
      tossed.length = 0;
      _m.makeScale(0, 0, 0);
      for (let i = 0; i < DN; i++) dMesh.setMatrixAt(i, _m);
      for (let i = 0; i < SN; i++) sMesh.setMatrixAt(i, _m);
      for (const P of PF) P.on = false;
      for (const d of WD) d.on = false;
      for (const h of H) h.on = false;
      for (let i = 0; i < HN; i++) hMesh.setMatrixAt(i, _m);
      hMesh.instanceMatrix.needsUpdate = true; hMesh.visible = false;
      for (const I of IMP) { I.on = false; I.sp.visible = false; }
      for (let i = 0; i < FN; i++) fMesh.setMatrixAt(i, _m);
      for (let i = 0; i < WN; i++) wMesh.setMatrixAt(i, _m);
      dMesh.instanceMatrix.needsUpdate = true; sMesh.instanceMatrix.needsUpdate = true; fMesh.instanceMatrix.needsUpdate = true; wMesh.instanceMatrix.needsUpdate = true;
      ring.visible = false; mk.visible = false;
    },
    papersLanded() { let n = 0; for (const P of papers) if (P.on && P.landed) n++; return n; },
    active() { return dActive; },
    // dt = game time (slowed by hit-stop / slow-mo), rdt = real tick (impact sprites stay readable in a freeze)
    update(dt, t, rdt = dt) {
      // impact sprites
      for (const I of IMP) {
        if (!I.on) continue;
        I.life += rdt;
        const k = I.life / I.max;
        if (k >= 1) { I.on = false; I.sp.visible = false; continue; }
        if (I.lines) { I.sp.scale.setScalar(I.s * (0.5 + 0.9 * (1 - Math.pow(1 - k, 2)))); I.sp.material.opacity = k < 0.5 ? 1 : 1 - (k - 0.5) * 2; }
        else { I.sp.scale.setScalar(I.s * (1 + k * 0.4)); I.sp.material.opacity = 1 - k * k; }
      }
      // glass shards
      let anyH = false, colH = false;
      for (let i = 0; i < HN; i++) {
        const h = H[i];
        if (!h.on) continue;
        anyH = true;
        h.life += dt;
        if (h.life > 2.4) { h.on = false; _m.makeScale(0, 0, 0); hMesh.setMatrixAt(i, _m); continue; }
        if (!h.rest) {
          h.v.y -= 13 * dt; h.p.addScaledVector(h.v, dt);
          if (h.p.y < 0.01) { h.p.y = 0.01; if (h.v.y < 0) h.v.y *= -0.25; h.v.x *= 0.5; h.v.z *= 0.5; h.w.multiplyScalar(0.4); if (Math.abs(h.v.y) < 0.4 && h.v.x * h.v.x + h.v.z * h.v.z < 0.05) h.rest = true; }
          _e.set(h.w.x * dt, h.w.y * dt, h.w.z * dt); _q.setFromEuler(_e); h.q.multiply(_q);
          h.ph += dt * (6 + Math.abs(h.w.x));
        }
        // glint: brightness flickers with the spin; resting shards twinkle slowly
        const g = h.rest ? 0.75 + 0.5 * Math.max(0, Math.sin(t * 3 + i)) : 0.6 + 1.9 * Math.pow(Math.max(0, Math.sin(h.ph)), 6);
        hMesh.setColorAt(i, _c.setRGB(0.78 * g, 0.92 * g, 1.0 * g)); colH = true;
        const k = h.life > 1.9 ? 1 - (h.life - 1.9) / 0.5 : 1;
        _s.set(h.s * k, h.s * k, h.s * k);
        _m.compose(h.p, h.q, _s); hMesh.setMatrixAt(i, _m);
      }
      if (anyH || hMesh.userData.was) hMesh.instanceMatrix.needsUpdate = true;
      if (colH && hMesh.instanceColor) hMesh.instanceColor.needsUpdate = true;
      hMesh.userData.was = anyH; hMesh.visible = anyH;
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
      dMesh.visible = dActive > 0;
      // sparks
      let anyS = false;
      for (let i = 0; i < SN; i++) {
        const s = S[i];
        if (!s.on) continue;
        anyS = true;
        s.life += dt;
        if (s.life > s.max) { s.on = false; _m.makeScale(0, 0, 0); sMesh.setMatrixAt(i, _m); continue; }
        s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt);
        const k = 1 - s.life / s.max;
        _q.identity(); _s.set(s.s * k, s.s * k * 2.2, s.s * k);
        _m.compose(s.p, _q, _s); sMesh.setMatrixAt(i, _m);
      }
      sMesh.instanceMatrix.needsUpdate = true;
      sMesh.visible = anyS;
      // puffs
      let anyF = false;
      for (let i = 0; i < FN; i++) {
        const P = PF[i];
        if (!P.on) continue;
        anyF = true;
        P.life += dt;
        if (P.life > P.max) { P.on = false; _m.makeScale(0, 0, 0); fMesh.setMatrixAt(i, _m); continue; }
        P.v.multiplyScalar(1 - Math.min(1, dt * 2.2)); P.v.y += 0.5 * dt;
        P.p.addScaledVector(P.v, dt);
        if (P.p.y < P.s * 0.6) P.p.y = P.s * 0.6;
        const k = P.life / P.max, sc = P.s * (0.5 + k * 1.6) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
        _q.identity(); _s.set(sc, sc * 0.9, sc);
        _m.compose(P.p, _q, _s); fMesh.setMatrixAt(i, _m);
      }
      if (anyF || fMesh.userData.was) fMesh.instanceMatrix.needsUpdate = true;
      fMesh.userData.was = anyF;
      // water drops
      let anyW = false;
      for (let i = 0; i < WN; i++) {
        const d = WD[i];
        if (!d.on) continue;
        anyW = true;
        d.life += dt; d.v.y -= 11 * dt; d.p.addScaledVector(d.v, dt);
        if (d.p.y < 0.02 || d.life > 2.5) { d.on = false; _m.makeScale(0, 0, 0); wMesh.setMatrixAt(i, _m); continue; }
        _q.identity(); _s.set(1, 1, 1);
        _m.compose(d.p, _q, _s); wMesh.setMatrixAt(i, _m);
      }
      if (anyW || wMesh.userData.was) wMesh.instanceMatrix.needsUpdate = true;
      wMesh.userData.was = anyW;
      fMesh.visible = anyF; wMesh.visible = anyW; // no draw calls while idle
      // papers
      let anyP = false;
      for (let i = 0; i < PN; i++) {
        const P = papers[i];
        if (!P.on) continue;
        anyP = true;
        if (P.landed) continue;
        P.t += dt; P.ph += dt * 6;
        P.v.y -= 9 * dt;
        if (P.v.y < -0.9) P.v.y = -0.9 + (P.v.y + 0.9) * 0.2;
        P.v.x *= 1 - dt * 1.6; P.v.z *= 1 - dt * 1.6;
        P.p.x += (P.v.x + Math.sin(P.ph) * 0.8) * dt; P.p.z += (P.v.z + Math.cos(P.ph * 0.7) * 0.6) * dt; P.p.y += P.v.y * dt;
        P.yaw += P.spin * dt;
        if (P.p.y <= 0.004) { P.p.y = 0.004; P.landed = true; P.rx = 0; P.rz = 0; }
        else { P.rx = Math.sin(P.ph) * 0.9; P.rz = Math.cos(P.ph * 1.3) * 0.7; }
        paperMatrix(i, P);
      }
      if (pDirty) { for (const pp of pParts) pp.im.instanceMatrix.needsUpdate = true; pDirty = false; }
      for (const pp of pParts) pp.im.visible = anyP;
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
