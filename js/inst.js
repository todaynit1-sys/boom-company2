// 회사 뿌개기 — draw-call batching for props nobody has touched yet.
// Every sleeping prop part that appears 2+ times on a floor (same geometry + material + shadow flags)
// is drawn through one InstancedMesh. The prop's own mesh stays in the scene graph but hidden; the first
// time the prop moves, is picked up, removed or highlighted, its instance slot is collapsed and the
// individual mesh is shown again (one-way: a disturbed prop never goes back into the batch).
import * as THREE from 'three';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();

export function instanceFloor(F, phys, { skip = new Set() } = {}) {
  F.group.updateMatrixWorld(true);
  _inv.copy(F.group.matrixWorld).invert();
  const buckets = new Map();
  for (const rec of phys.records) {
    if (rec.removed || rec.held || rec.prop.set || skip.has(rec.type)) continue;
    rec.group.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || !m.visible) return;
      const mt = m.material;
      if (!mt || Array.isArray(mt) || mt.transparent) return;
      const k = m.geometry.uuid + '|' + mt.uuid + '|' + (m.castShadow ? 1 : 0) + (m.receiveShadow ? 1 : 0) + '|' + (m.renderOrder | 0);
      let b = buckets.get(k);
      if (!b) { b = { geo: m.geometry, mat: mt, cast: m.castShadow, recv: m.receiveShadow, ro: m.renderOrder | 0, list: [] }; buckets.set(k, b); }
      b.list.push([rec, m]);
    });
  }
  const meshes = [];
  const release = (rec) => {
    const slots = rec.instSlots;
    rec.inst = null; rec.instSlots = null;
    if (!slots) return;
    for (const [im, i, m] of slots) { im.setMatrixAt(i, ZERO); im.instanceMatrix.needsUpdate = true; m.visible = true; }
  };
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const im = new THREE.InstancedMesh(b.geo, b.mat, b.list.length);
    im.name = 'inst:' + (b.list[0][0].type);
    im.castShadow = b.cast; im.receiveShadow = b.recv; im.renderOrder = b.ro;
    im.matrixAutoUpdate = false; im.updateMatrix();
    b.list.forEach(([rec, m], i) => {
      _m.multiplyMatrices(_inv, m.matrixWorld);
      im.setMatrixAt(i, _m);
      m.visible = false;
      if (!rec.instSlots) { rec.instSlots = []; rec.inst = release; rec.group.userData.unbatch = () => { if (rec.inst) rec.inst(rec); }; }
      rec.instSlots.push([im, i, m]);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere(); im.computeBoundingBox();
    F.group.add(im);
    meshes.push(im);
    F.disposables.push(im);
  }
  return { meshes: meshes.length, release };
}
