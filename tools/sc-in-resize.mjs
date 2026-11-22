// Window resize / orientation change / tab hidden mid-game: renderer, camera aspect, composer + OutlinePass sizes.
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step, W, H }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const sizes = () => ev(`(() => { const g = __ppg.gfx, r = g.renderer, c = g.composer; const pr = r.getPixelRatio();
    const out = { iw: innerWidth, ih: innerHeight, pr, canvas: [r.domElement.width, r.domElement.height], aspect: +__ppg.camera.aspect.toFixed(3), fov: __ppg.camera.fov, post: g.usingPost };
    if (c) { out.composer = [c.renderTarget1.width, c.renderTarget1.height]; const o = c.passes.find(p => p.renderTargetMaskBuffer); if (o) out.outline = [o.renderTargetMaskBuffer.width, o.renderTargetMaskBuffer.height]; }
    out.joyR = document.getElementById('joy-base') ? document.getElementById('joy-base').getBoundingClientRect().width : 0;
    return out; })()`);
  const check = (z, tag) => {
    const okCanvas = Math.abs(z.canvas[0] - Math.round(z.iw * z.pr)) <= 1 && Math.abs(z.canvas[1] - Math.round(z.ih * z.pr)) <= 1;
    const okAspect = Math.abs(z.aspect - z.iw / z.ih) < 0.01;
    const okComp = !z.composer || (Math.abs(z.composer[0] - Math.round(z.iw * z.pr)) <= 1 && Math.abs(z.composer[1] - Math.round(z.ih * z.pr)) <= 1);
    const okOut = !z.outline || Math.abs(z.outline[0] - Math.round(z.iw * z.pr)) <= 1;
    expect(okCanvas && okAspect && okComp && okOut, `${tag}: sizes follow the window ${JSON.stringify(z)}`);
  };
  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 15000);
  const rb = await I.rect('#title [data-mode="rush"]');
  if (W < 600 || H < 600) { await I.touch('touchStart', [{ x: rb.x, y: rb.y, id: 1 }]); await I.touch('touchEnd', []); } else await I.click(rb.x, rb.y);
  await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "rampage" && !s.busy; })()', 20000);
  await step(5);
  check(await sizes(), 'start');
  const mobile = Math.min(W, H) < 600;
  // resize / rotate
  const W2 = mobile ? H : Math.round(W * 0.7), H2 = mobile ? W : Math.round(H * 0.8);
  await send('Emulation.setDeviceMetricsOverride', { width: W2, height: H2, deviceScaleFactor: 1, mobile });
  await sleep(400);
  await step(5);
  let z = await sizes();
  check(z, mobile ? 'rotated' : 'resized');
  if (mobile) expect(z.fov === (W2 < H2 ? 70 : 55), 'portrait/landscape FOV switches (' + z.fov + ')');
  await shot('rz-1-after');
  // the HUD / pad still fit
  const off = await ev(`[...document.querySelectorAll('#hud .hud-tl, #hud .hud-tr, #hud .hud-tc, .tbtn, #joy-base')].filter(e => e.getBoundingClientRect().width && !e.closest('[hidden]')).map(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 ? (e.id || e.className) : null; }).filter(Boolean)`);
  expect(!off.length, 'HUD stays inside the new viewport ' + JSON.stringify(off));
  // play a bit after the change: the joystick / keys still move the player
  const p0 = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
  if (mobile) {
    const jb = await I.rect('#joy-base');
    await I.touch('touchStart', [{ x: jb.x, y: jb.y, id: 2 }]); await I.touch('touchMove', [{ x: jb.x, y: jb.y - 60, id: 2 }]);
    await step(20); await I.touch('touchEnd', []);
  } else { await I.down('KeyW'); await step(20); await I.up('KeyW'); }
  const p1 = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
  expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.4, 'still controllable after the change');
  // back to the original size
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
  await sleep(400); await step(3);
  check(await sizes(), 'restored');
  // tab hidden (simulated visibilitychange: CDP headless cannot hide the page) while a key is held
  await ev('__ppg.realtime(); true');
  await sleep(300);
  if (!mobile) await I.down('KeyD');
  await sleep(200);
  await ev(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); true`);
  await sleep(200);
  let s = await ev('__ppg.state()');
  expect(s.paused, 'hiding the tab pauses the game');
  if (!mobile) await I.up('KeyD');
  await ev(`delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); true`);
  const tl = s.timeLeft;
  await sleep(800);
  s = await ev('__ppg.state()');
  expect(s.paused && s.timeLeft === tl, 'stays paused (clock frozen) until the player resumes');
  await I.clickSel('#p-resume').catch(async () => { const r = await I.rect('#p-resume'); await I.touch('touchStart', [{ x: r.x, y: r.y, id: 3 }]); await I.touch('touchEnd', []); });
  await sleep(300);
  s = await ev('__ppg.state()');
  expect(!s.paused, 'resumes');
  const q0 = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]'); await sleep(700); const q1 = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
  expect(Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) < 0.05, 'no key stuck down after the tab came back');
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
