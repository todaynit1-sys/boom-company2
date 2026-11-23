// Touch play with REAL touch events (CDP Input.dispatchTouchEvent). Run with query touch=1 at 844x390 / 390x844.
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step, W, H }) => {
  const I = makeInput({ send, ev, sleep });
  const tag = W > H ? 'land' : 'port';
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const camFwd = () => ev('(() => { const v = new __ppg.camera.position.constructor(); __ppg.camera.getWorldDirection(v); const l = Math.hypot(v.x, v.z); return [v.x / l, v.z / l]; })()');
  const pos = () => ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
  const tapAt = async (x, y, id = 9) => { await I.touch('touchStart', [{ x, y, id }]); await I.touch('touchEnd', []); };
  const center = async (sel) => { const r = await I.rect(sel); if (!r) throw new Error('missing ' + sel); return r; };

  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 15000);
  // title by touch
  const rb = await center('#title [data-mode="rush"]');
  await tapAt(rb.x, rb.y);
  await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "rampage" && !s.busy; })()', 20000);
  let s = await step(5);
  expect(s.mode === 'rush', 'tap on 1분 난동 starts the rush');
  await shot(`it-${tag}-0-start`);

  // overlap: pad vs HUD
  const ov = await ev(`(() => {
    const R = (e) => e.getBoundingClientRect();
    const pads = [...document.querySelectorAll('#tbtns .tbtn'), document.getElementById('joy-base')].map(e => [e.className || e.id, R(e)]);
    const hud = ['#mission', '#tasks', '#stress', '#timer', '#money', '#btn-pause', '#combo'].map(s => document.querySelector(s)).filter(e => e && !e.hidden && e.getBoundingClientRect().width).map(e => [e.id, R(e)]);
    const hits = [];
    for (const [a, p] of pads) for (const [b, h] of hud) if (p.left < h.right && p.right > h.left && p.top < h.bottom && p.bottom > h.top) hits.push(a + '×' + b);
    const off = pads.filter(([a, p]) => p.left < 0 || p.top < 0 || p.right > innerWidth || p.bottom > innerHeight).map(([a]) => a);
    return { hits, off };
  })()`);
  expect(!ov.hits.length && !ov.off.length, 'touch pad does not overlap the HUD / stays on screen ' + JSON.stringify(ov));

  // joystick forward
  const jb = await center('#joy-base');
  let f = await camFwd(); let p0 = await pos();
  await I.touch('touchStart', [{ x: jb.x, y: jb.y, id: 1 }]);
  await I.touch('touchMove', [{ x: jb.x, y: jb.y - 70, id: 1 }]);
  s = await step(25);
  let p1 = await pos();
  let d = [p1[0] - p0[0], p1[1] - p0[1]], L = Math.hypot(d[0], d[1]);
  expect(L > 0.5 && (d[0] * f[0] + d[1] * f[1]) / L > 0.9, `joystick up walks forward (len ${L.toFixed(2)})`);
  // multi-touch: keep the stick held, tap 때리기 with a second finger
  const at = await center('.t-attack');
  const comboBefore = await ev('__ppg.P.char.anim');
  p0 = await pos();
  await I.touch('touchStart', [{ x: jb.x, y: jb.y - 70, id: 1 }, { x: at.x, y: at.y, id: 2 }]);
  s = await step(4);
  const swinging = await ev('__ppg.P.attackT > 0');
  await I.touch('touchEnd', [{ x: jb.x, y: jb.y - 70, id: 1 }]);
  s = await step(15);
  p1 = await pos();
  expect(swinging && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.3, `move + attack at the same time (swing=${swinging}, moved ${Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2)}) ${comboBefore}`);
  await I.touch('touchEnd', []);
  s = await step(30);
  p0 = await pos(); s = await step(20); p1 = await pos();
  expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 0.05, 'releasing the stick stops the player');

  // look drag on the right half
  f = await camFwd();
  const lx = W * 0.62, ly = H * 0.35;
  await I.touch('touchStart', [{ x: lx, y: ly, id: 3 }]);
  for (let i = 1; i <= 6; i++) await I.touch('touchMove', [{ x: lx + i * 25, y: ly, id: 3 }]);
  await I.touch('touchEnd', []);
  s = await step(3);
  const f2 = await camFwd();
  const turn = Math.acos(Math.max(-1, Math.min(1, f[0] * f2[0] + f[1] * f2[1])));
  expect(turn > 0.3, `right-side drag turns the camera (${turn.toFixed(2)} rad)`);

  // buttons at a desk: 때리기, 행동 (hold), 점프
  const seat = await ev(`(() => { const F = __ppg.G.S.F; const occ = new Set(__ppg.G.S.npcs.filter(n => n.spec && n.spec.seat).map(n => n.spec.seat)); const s = F.seats.filter(s => !s.player && !occ.has(s) && s.x > 2 && s.x < 9)[1]; return { x: s.x, z: s.z, rotY: s.rotY }; })()`);
  await ev(`__ppg.tp(${seat.x}, ${seat.z}); __ppg.yaw(${seat.rotY}); true`);
  s = await step(8);
  const m0 = s.money;
  await tapAt(at.x, at.y);
  s = await step(30);
  expect(s.money > m0, `때리기 damages (money ${m0} → ${s.money})`);
  // prompt label on touch
  s = await step(4);
  const pk = await ev('document.querySelector("#prompt .kc b").textContent');
  expect((s.focus || '').startsWith('엎기') && pk === '행동', `prompt shows the 행동 button name (focus=${s.focus}, key=${pk})`);
  const ib = await center('.t-interact');
  await I.touch('touchStart', [{ x: ib.x, y: ib.y, id: 4 }]);
  s = await step(10);
  expect((s.counts.flip || 0) === 0, 'not flipped before the hold completes');
  s = await step(30);
  await I.touch('touchEnd', []);
  expect((s.counts.flip || 0) === 1, 'holding 행동 flips the desk');
  await shot(`it-${tag}-1-flip`);
  s = await step(45); // let the flip's landing slow-mo pass
  const jbtn = await center('.t-jump');
  await tapAt(jbtn.x, jbtn.y);
  s = await step(6);
  expect(s.player.y > 0.15, '점프 jumps');
  // special
  for (let i = 0; i < 120 && !(await ev('__ppg.G.special >= 1')); i++) s = await step(30, 30);
  const sp = await center('.t-special');
  const c0 = (await step(1)).counts.special || 0;
  await tapAt(sp.x, sp.y);
  s = await step(40);
  expect((s.counts.special || 0) === c0 + 1, '필살기 button fires the special');
  // pinch on the look zone must not zoom / scroll the page
  await I.touch('touchStart', [{ x: W * 0.55, y: H * 0.4, id: 5 }, { x: W * 0.65, y: H * 0.4, id: 6 }]);
  for (let i = 1; i <= 6; i++) await I.touch('touchMove', [{ x: W * 0.55 - i * 15, y: H * 0.4 - i * 5, id: 5 }, { x: W * 0.65 + i * 15, y: H * 0.4 + i * 5, id: 6 }]);
  await I.touch('touchEnd', []);
  await sleep(300);
  const vp = await ev('({ scale: visualViewport.scale, sx: scrollX, sy: scrollY, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight })');
  expect(vp.scale === 1 && vp.sx === 0 && vp.sy === 0 && vp.sw <= vp.iw && vp.sh <= vp.ih, 'no page zoom / scroll ' + JSON.stringify(vp));
  // pause button by touch, resume
  const pb = await center('#btn-pause');
  await tapAt(pb.x, pb.y);
  await sleep(200);
  expect((await ev('__ppg.G.paused')), 'pause button works by touch');
  await shot(`it-${tag}-2-pause`);
  const rs = await center('#p-resume');
  await tapAt(rs.x, rs.y);
  await sleep(200);
  expect(!(await ev('__ppg.G.paused')), '계속하기 by touch');
  s = await step(30);
  await shot(`it-${tag}-3-play`);
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
