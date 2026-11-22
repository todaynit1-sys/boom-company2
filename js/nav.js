// 회사 뿌개기 — walking collision (circle vs oriented rects) and a grid A* for NPCs and the auto bot.

// Resolve a circle (pos.x, pos.z, radius r) out of every obstacle. Obstacles: {x,z,hx,hz,c,s,y1,active?}
// rot convention = Object3D.rotation.y: world = (lx*c + lz*s, -lx*s + lz*c)
export function collideCircle(pos, r, lists, feetY = 0) {
  let hit = false;
  for (let it = 0; it < 2; it++) {
    for (const list of lists) {
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.off || (o.active && !o.active())) continue;
        if (feetY > o.y1 - 0.05) continue;
        const dx = pos.x - o.x, dz = pos.z - o.z;
        const ex0 = o.hx + r, ez0 = o.hz + r;
        const R = o.hx + o.hz + r;
        if (dx > R || dx < -R || dz > R || dz < -R) continue;
        let lx = dx * o.c - dz * o.s;
        let lz = dx * o.s + dz * o.c;
        if (lx > ex0 || lx < -ex0 || lz > ez0 || lz < -ez0) continue;
        const qx = lx < -o.hx ? -o.hx : lx > o.hx ? o.hx : lx;
        const qz = lz < -o.hz ? -o.hz : lz > o.hz ? o.hz : lz;
        const ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), push = (r - d) / d;
          lx += ex * push; lz += ez * push;
        } else {
          const px = o.hx - Math.abs(lx), pz = o.hz - Math.abs(lz);
          if (px < pz) lx = (lx < 0 ? -1 : 1) * (o.hx + r); else lz = (lz < 0 ? -1 : 1) * (o.hz + r);
        }
        pos.x = o.x + lx * o.c + lz * o.s;
        pos.z = o.z - lx * o.s + lz * o.c;
        hit = true;
      }
    }
  }
  return hit;
}

export function pointInRect(o, x, z, pad = 0) {
  const dx = x - o.x, dz = z - o.z;
  const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
  return Math.abs(lx) <= o.hx + pad && Math.abs(lz) <= o.hz + pad;
}
function distToRect(o, x, z) {
  const dx = x - o.x, dz = z - o.z;
  const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
  const ex = Math.max(0, Math.abs(lx) - o.hx), ez = Math.max(0, Math.abs(lz) - o.hz);
  return Math.hypot(ex, ez);
}

// ---------------------------------------------------------------- grid
export class NavGrid {
  constructor(bounds, cell = 0.25, margin = 1.8) {
    this.cell = cell;
    this.x0 = bounds.minX - margin; this.z0 = bounds.minZ - 0.5;
    this.w = Math.ceil((bounds.maxX - bounds.minX + margin * 2) / cell);
    this.h = Math.ceil((bounds.maxZ - bounds.minZ + 1.0) / cell);
    this.block = new Uint8Array(this.w * this.h);
    this.inside = bounds;
  }
  idx(ix, iz) { return iz * this.w + ix; }
  cellOf(x, z) { return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)]; }
  center(ix, iz) { return [this.x0 + (ix + 0.5) * this.cell, this.z0 + (iz + 0.5) * this.cell]; }
  // walkable area = room interior + listed extra zones (elevator cabins)
  build(lists, zones, r = 0.32) {
    const B = this.block, b = this.inside;
    B.fill(1);
    for (let iz = 0; iz < this.h; iz++) for (let ix = 0; ix < this.w; ix++) {
      const [x, z] = this.center(ix, iz);
      let ok = x > b.minX + r && x < b.maxX - r && z > b.minZ + r && z < b.maxZ - r;
      if (!ok) for (const zn of zones) if (pointInRect(zn, x, z)) { ok = true; break; }
      B[this.idx(ix, iz)] = ok ? 0 : 1;
    }
    for (const list of lists) for (const o of list) this.stamp(o, r);
  }
  stamp(o, r) {
    if (o.off || o.y1 < 0.3) return;
    const ext = Math.abs(o.hx * o.c) + Math.abs(o.hz * o.s) + r, exz = Math.abs(o.hx * o.s) + Math.abs(o.hz * o.c) + r;
    const [a0, b0] = this.cellOf(o.x - ext, o.z - exz), [a1, b1] = this.cellOf(o.x + ext, o.z + exz);
    for (let iz = Math.max(0, b0); iz <= Math.min(this.h - 1, b1); iz++) for (let ix = Math.max(0, a0); ix <= Math.min(this.w - 1, a1); ix++) {
      const [x, z] = this.center(ix, iz);
      if (distToRect(o, x, z) < r) this.block[this.idx(ix, iz)] = 1;
    }
  }
  free(ix, iz) { return ix >= 0 && iz >= 0 && ix < this.w && iz < this.h && !this.block[iz * this.w + ix]; }
  nearestFree(ix, iz, maxR = 10) {
    if (this.free(ix, iz)) return [ix, iz];
    for (let rr = 1; rr <= maxR; rr++) {
      let best = null, bd = 1e9;
      for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
        if (Math.abs(dx) !== rr && Math.abs(dz) !== rr) continue;
        if (this.free(ix + dx, iz + dz)) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = [ix + dx, iz + dz]; } }
      }
      if (best) return best;
    }
    return null;
  }
  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i < n; i++) {
      const t = i / n; const [ix, iz] = this.cellOf(ax + (bx - ax) * t, az + (bz - az) * t);
      if (!this.free(ix, iz)) return false;
    }
    return true;
  }
  // A*; returns [[x,z],...] (excluding start) or null
  path(sx, sz, gx, gz, maxIter = 12000) {
    let [si, sj] = this.cellOf(sx, sz), [gi, gj] = this.cellOf(gx, gz);
    const s = this.nearestFree(si, sj, 6), g = this.nearestFree(gi, gj, 10);
    if (!s || !g) return null;
    [si, sj] = s; [gi, gj] = g;
    const W = this.w, N = W * this.h;
    if (!this._g || this._g.length !== N) { this._g = new Float32Array(N); this._p = new Int32Array(N); this._st = new Uint32Array(N); this._stamp = 1; }
    const G = this._g, Par = this._p, St = this._st;
    const stamp = (this._stamp += 2);
    const start = sj * W + si, goal = gj * W + gi;
    const heap = new Heap();
    const hf = (i) => { const x = i % W, z = (i / W) | 0; const dx = Math.abs(x - gi), dz = Math.abs(z - gj); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    G[start] = 0; Par[start] = -1; St[start] = stamp; heap.push(start, hf(start));
    let it = 0, found = false;
    while (heap.size && it++ < maxIter) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      if (St[cur] === stamp + 1) continue;
      St[cur] = stamp + 1;
      const cx = cur % W, cz = (cur / W) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!this.free(nx, nz)) continue;
        if (dx && dz && (!this.free(cx + dx, cz) || !this.free(cx, cz + dz))) continue;
        const ni = nz * W + nx;
        if (St[ni] === stamp + 1) continue;
        const ng = G[cur] + (dx && dz ? 1.4142 : 1);
        if (St[ni] !== stamp || ng < G[ni]) { St[ni] = stamp; G[ni] = ng; Par[ni] = cur; heap.push(ni, ng + hf(ni)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1 && c !== start; c = Par[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.center(c % W, (c / W) | 0));
    pts.push([gx, gz]);
    // string pulling
    const out = [];
    let ax = sx, az = sz, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let j = pts.length - 1; j > k; j--) if (this.los(ax, az, pts[j][0], pts[j][1])) { far = j; break; }
      out.push(pts[far]); ax = pts[far][0]; az = pts[far][1]; k = far + 1;
    }
    return out;
  }
}

class Heap {
  constructor() { this.v = []; this.p = []; }
  get size() { return this.v.length; }
  push(v, p) {
    const V = this.v, P = this.p; V.push(v); P.push(p);
    let i = V.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (P[j] <= p) break; V[i] = V[j]; P[i] = P[j]; i = j; }
    V[i] = v; P[i] = p;
  }
  pop() {
    const V = this.v, P = this.p; const top = V[0];
    const lv = V.pop(), lp = P.pop();
    if (V.length) {
      let i = 0; const n = V.length;
      for (;;) {
        let l = i * 2 + 1; if (l >= n) break;
        const r = l + 1; if (r < n && P[r] < P[l]) l = r;
        if (P[l] >= lp) break;
        V[i] = V[l]; P[i] = P[l]; i = l;
      }
      V[i] = lv; P[i] = lp;
    }
    return top;
  }
}
