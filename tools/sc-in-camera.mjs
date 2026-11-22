// Mouse camera with REAL mouse events: drag-orbit (no pointer lock under #debug), pitch limits,
// auto-follow when the mouse is idle, pillar / wall occlusion, wheel does not scroll the page.
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step, W, H }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const cam = () => ev(`(() => { const c = __ppg.camera, v = new c.position.constructor(); c.getWorldDirection(v); const l = Math.hypot(v.x, v.z); const P = __ppg.P; const F = __ppg.G.S.F;
    const inRect = __ppg.G.S.staticRects.some(r => { const dx = c.position.x - r.x, dz = c.position.z - r.z; const lx = dx * r.c - dz * r.s, lz = dx * r.s + dz * r.c; return Math.abs(lx) < r.hx && Math.abs(lz) < r.hz && c.position.y < r.y1; });
    return { f: [v.x / l, v.z / l], pos: [c.position.x, c.position.y, c.position.z], pyaw: P.yaw, dist: Math.hypot(c.position.x - P.pos.x, c.position.z - P.pos.z), ceil: F.ceilY, inRect, b: F.bounds }; })()`);
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 15000);
  await I.clickSel('#title [data-mode="rush"]');
  await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "rampage" && !s.busy; })()', 20000);
  await step(5);
  let c0 = await cam();
  // yaw drag (left button)
  await I.drag(W / 2, H * 0.55, W / 2 + 200, H * 0.55, 10);
  await step(2);
  let c1 = await cam();
  expect(ang(c0.f, c1.f) > 0.5, `drag right orbits the camera (${ang(c0.f, c1.f).toFixed(2)} rad)`);
  // pitch: drag down a lot → looking down from above, then up a lot
  await I.drag(W / 2, H * 0.2, W / 2, H * 0.95, 10); await step(2);
  let c2 = await cam();
  expect(c2.pos[1] <= c2.ceil - 0.2 && c2.pos[1] > 0.3 && !c2.inRect, `max pitch keeps the camera under the ceiling (y=${c2.pos[1].toFixed(2)})`);
  await I.drag(W / 2, H * 0.95, W / 2, H * 0.05, 10); await I.drag(W / 2, H * 0.95, W / 2, H * 0.05, 10); await step(2);
  c2 = await cam();
  expect(c2.pos[1] >= 0.34, `min pitch keeps the camera above the floor (y=${c2.pos[1].toFixed(2)})`);
  await I.drag(W / 2, H * 0.4, W / 2, H * 0.55, 6); await step(2);
  // mouse idle → camera eases behind the player while walking
  await I.drag(W / 2, H * 0.55, W / 2 + 260, H * 0.55, 8); await step(2);
  await I.down('KeyD'); await step(30);
  let a0 = await cam();
  const d0 = Math.abs(Math.atan2(Math.sin(a0.pyaw - Math.atan2(a0.f[0], a0.f[1])), Math.cos(a0.pyaw - Math.atan2(a0.f[0], a0.f[1]))));
  await step(150);
  let a1 = await cam();
  await I.up('KeyD'); await step(30);
  const d1 = Math.abs(Math.atan2(Math.sin(a1.pyaw - Math.atan2(a1.f[0], a1.f[1])), Math.cos(a1.pyaw - Math.atan2(a1.f[0], a1.f[1]))));
  log('strafe D: player-vs-camera heading', d0.toFixed(2), '→', d1.toFixed(2), 'rad');
  expect(d1 < d0 && !a1.inRect, 'camera swings behind a strafing player when the mouse is idle');
  // pillar behind the player
  await ev('__ppg.tp(-5.95, -1.95); __ppg.yaw(Math.PI / 2); true');
  await step(20);
  let cp = await cam();
  expect(cp.pos[0] > -7 + 0.3 && cp.dist > 0.6 && !cp.inRect, `camera stays in front of the pillar (cam x=${cp.pos[0].toFixed(2)}, dist ${cp.dist.toFixed(2)})`);
  await shot('ic-1-pillar');
  // back against the south wall, facing north
  await ev('__ppg.tp(-6.2, 8.5); __ppg.yaw(Math.PI); true');
  await step(20);
  cp = await cam();
  expect(cp.pos[2] < cp.b.maxZ && !cp.inRect && cp.pos[1] < cp.ceil, `camera inside the room at the wall (z=${cp.pos[2].toFixed(2)}, y=${cp.pos[1].toFixed(2)}, dist ${cp.dist.toFixed(2)})`);
  await shot('ic-2-wall');
  // wheel: no page scroll / zoom
  await I.wheel(W / 2, H / 2, 600); await I.wheel(W / 2, H / 2, -600); await step(2);
  const sc = await ev('({ x: scrollX, y: scrollY, s: visualViewport.scale })');
  expect(sc.x === 0 && sc.y === 0 && sc.s === 1, 'wheel does not scroll the page ' + JSON.stringify(sc));
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
