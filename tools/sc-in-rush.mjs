// 1분 난동 with REAL keyboard / mouse events (CDP Input.*). Positioning between checks uses __ppg.tp/yaw
// (setup only); every action under test is a real key or mouse event, advanced with __ppg.step.
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step, W, H }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const st = () => ev('__ppg.state()');
  const camFwd = () => ev('(() => { const v = new __ppg.camera.position.constructor(); __ppg.camera.getWorldDirection(v); const l = Math.hypot(v.x, v.z); return [v.x / l, v.z / l]; })()');
  const pos = () => ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
  async function holdMove(code, n = 20) {
    const f = await camFwd(); const p0 = await pos();
    await I.down(code); await step(n, n); await I.up(code); await step(2);
    const p1 = await pos();
    const d = [p1[0] - p0[0], p1[1] - p0[1]], L = Math.hypot(d[0], d[1]) || 1e-9;
    const right = [-f[1], f[0]];
    return { len: +L.toFixed(3), fwd: +((d[0] * f[0] + d[1] * f[1]) / L).toFixed(2), right: +((d[0] * right[0] + d[1] * right[1]) / L).toFixed(2) };
  }
  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 15000);
  await I.clickSel('#title [data-mode="rush"]');
  await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "rampage" && !s.busy; })()', 20000);
  let s = await step(5);
  const spawn = s.player;

  // ---- WASD camera-relative
  const w = await holdMove('KeyW');
  expect(w.fwd > 0.9 && w.len > 0.5, 'W moves away from the camera ' + JSON.stringify(w));
  const sMove = await holdMove('KeyS');
  expect(sMove.fwd < -0.9, 'S moves toward the camera ' + JSON.stringify(sMove));
  const a = await holdMove('KeyA', 12);
  expect(a.right < -0.8, 'A moves screen-left ' + JSON.stringify(a));
  const d = await holdMove('KeyD', 12);
  expect(d.right > 0.8, 'D moves screen-right ' + JSON.stringify(d));
  // ---- jump
  await I.tap('Space');
  s = await step(6);
  expect(s.player.y > 0.15, 'Space jumps (y=' + s.player.y + ')');
  s = await step(40);
  expect(s.player.y === 0, 'lands again');

  // ---- punch J at a desk (setup: stand at a free seat facing its desk)
  const seat = await ev(`(() => { const F = __ppg.G.S.F; const occ = new Set(__ppg.G.S.npcs.filter(n => n.spec && n.spec.seat).map(n => n.spec.seat)); const s = F.seats.find(s => !s.player && !occ.has(s) && s.items.length >= 4 && s.x < 0); return { x: s.x, z: s.z, rotY: s.rotY }; })()`);
  await ev(`__ppg.tp(${seat.x}, ${seat.z}); __ppg.yaw(${seat.rotY}); true`);
  s = await step(10);
  const m0 = s.money;
  await I.tap('KeyJ');
  s = await step(30);
  expect(s.money > m0, `J punch damages (money ${m0} → ${s.money})`);
  await shot('ir-1-punchJ');
  // ---- left mouse
  const m1 = s.money;
  await ev('window.__cm = null; document.addEventListener("contextmenu", (e) => { window.__cm = { prevented: e.defaultPrevented, target: e.target.id || e.target.tagName }; }); true');
  await I.click(W / 2, H / 2);
  s = await step(30);
  expect(s.money > m1, `left click punches (money ${m1} → ${s.money})`);
  // ---- K + right mouse kick
  const m2 = s.money;
  await I.tap('KeyK');
  s = await step(40);
  expect(s.money > m2, `K kicks (money ${m2} → ${s.money})`);
  const m3 = s.money;
  await I.click(W / 2, H / 2, 'right');
  s = await step(40);
  const cm = await ev('window.__cm');
  expect(s.money > m3, `right click kicks (money ${m3} → ${s.money})`);
  expect(!cm || cm.prevented, 'context menu suppressed on the canvas ' + JSON.stringify(cm));

  // ---- hold E on a desk flips it
  const seat2 = await ev(`(() => { const F = __ppg.G.S.F; const occ = new Set(__ppg.G.S.npcs.filter(n => n.spec && n.spec.seat).map(n => n.spec.seat)); const s = F.seats.filter(s => !s.player && !occ.has(s) && s.x > 2 && s.x < 9)[0]; return { x: s.x, z: s.z, rotY: s.rotY }; })()`);
  await ev(`__ppg.tp(${seat2.x}, ${seat2.z}); __ppg.yaw(${seat2.rotY}); true`);
  s = await step(8);
  expect(s.focus === '엎기', 'prompt shows 엎기 at a desk (focus=' + s.focus + ')');
  const pr = await I.rect('#prompt');
  expect(!!pr, 'E prompt visible on screen ' + JSON.stringify(pr));
  await I.down('KeyE');
  s = await step(12);
  const holdMid = await ev('getComputedStyle(document.getElementById("prompt")).getPropertyValue("--h")');
  await shot('ir-2-holdE');
  expect((s.counts.flip || 0) === 0, 'not flipped before the hold completes');
  s = await step(30);
  await I.up('KeyE');
  expect((s.counts.flip || 0) === 1, 'holding E flips the desk (hold bar ' + holdMid + ')');
  s = await step(30);
  await shot('ir-3-flipped');

  // ---- E picks up a small object, click throws it
  await ev('__ppg.tp(0.95, 1.55); __ppg.yaw(0); true');
  s = await step(8);
  expect(s.focus === '집기', 'prompt 집기 at the trash can (focus=' + s.focus + ')');
  await I.tap('KeyE');
  s = await step(10);
  expect(!!s.player.held, 'E picks it up (held=' + s.player.held + ')');
  await shot('ir-4-held');
  await I.tap('KeyE');
  s = await step(20);
  expect(!s.player.held, 'second E throws it (held=' + s.player.held + ')');
  // pick again and throw with a click
  await ev('__ppg.tp(0.9, -7.7); __ppg.yaw(Math.PI); true'); // window-side plant
  s = await step(5);
  log('second pick focus', s.focus);
  const thrownRec = await ev('(() => { const f = __ppg.G.focus; return f && f.rec ? f.rec.id : null; })()');
  if (s.focus === '집기') {
    await I.tap('KeyE'); s = await step(8);
    await I.click(W / 2, H / 2); s = await step(6);
    const v = await ev(`(() => { const r = __ppg.G.S.phys.records[${thrownRec}]; const b = r.body.velocity; return Math.hypot(b.x, b.z); })()`);
    expect(!s.player.held && v > 3, 'left click throws the held object (speed ' + v.toFixed(1) + ')');
  }

  // ---- special
  for (let i = 0; i < 120 && !(await ev('__ppg.G.special >= 1')); i++) s = await step(30, 30);
  s = await step(2);
  expect(s.special >= 1, 'special charges (special=' + s.special + ', t=' + s.timeLeft + ')');
  const c0 = s.counts.special || 0;
  await I.tap('KeyQ');
  s = await step(60);
  expect((s.counts.special || 0) === c0 + 1, 'Q fires the special');
  await shot('ir-5-special');

  // ---- pause / resume
  await I.tap('Escape'); s = await st();
  expect(s.paused && !!(await I.rect('#p-resume')), 'Esc opens the pause menu');
  await shot('ir-6-pause');
  const tl = s.timeLeft;
  await ev('__ppg.realtime(); true'); // the real loop (step() would tick through a pause)
  await sleep(1200);
  s = await st();
  expect(s.timeLeft === tl, `clock frozen while paused (${tl} → ${s.timeLeft})`);
  await step(1);
  await I.tap('Escape'); s = await st();
  expect(!s.paused && !(await I.rect('#p-resume')), 'Esc resumes');
  await I.tap('KeyP'); s = await st();
  expect(s.paused, 'P pauses');
  await I.clickSel('#p-resume'); s = await st();
  expect(!s.paused, '계속하기 resumes');
  // held key across pause does not stay stuck
  const p0 = await pos();
  await I.down('KeyW'); await step(5);
  await I.tap('Escape');
  await I.up('KeyW');
  await I.tap('Escape');
  await step(30); // let momentum die out
  const p1 = await pos(); await step(30); const p2 = await pos();
  expect(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 0.05, 'W released during pause is not stuck after resume');
  // blur clears held keys
  await I.down('KeyD'); await step(3);
  await ev('dispatchEvent(new Event("blur")); true');
  await step(30);
  const b1 = await pos(); await step(30); const b2 = await pos();
  expect(Math.hypot(b2[0] - b1[0], b2[1] - b1[1]) < 0.05, 'window blur clears a held key');
  await I.up('KeyD');

  // ---- quit to the bill
  const firstW = w.len;
  await I.tap('KeyP');
  await I.clickSel('#p-quit');
  s = await step(40);
  await sleep(400);
  expect(s.scene === 'bill' && !!(await I.rect('#b-retry')), '그만두고 청구서 받기 shows the bill');
  await shot('ir-7-bill');
  const firstMoney = s.money;

  // ---- 다시 하기: clean second run
  await I.clickSel('#b-retry');
  await ev('__ppg.realtime(); true');
  await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "rampage" && !s.busy; })()', 20000);
  s = await step(5);
  const clean = await ev(`(() => { const G = __ppg.G; return {
    money: G.money, items: G.items.size, timers: G.timers.filter(t => t.gen !== G.gen).length, timeLeft: +G.timeLeft.toFixed(1), special: +G.special.toFixed(3), combo: G.combo,
    held: !!__ppg.P.held, carry: !!__ppg.P.carry, rage: __ppg.P.rage, paused: G.paused, busy: G.busy,
    bubbles: [...document.querySelectorAll('#world .bubble')].filter(b => !b.hidden).length,
    comboHud: !document.getElementById('combo').hidden, billHidden: document.getElementById('bill').hidden, pauseHidden: document.getElementById('pause').hidden,
    moneyText: document.getElementById('money-val').textContent, timerText: document.getElementById('timer').textContent,
    tasks: [...document.querySelectorAll('#tasks li')].map(l => l.textContent + (l.classList.contains('done') ? '✓' : '')),
    records: G.S.phys.records.filter(r => r.destroyed || r.removed).length, floors: Object.keys(G.floors),
  }; })()`);
  expect(clean.money === 0 && clean.items === 0 && !clean.held && !clean.comboHud && clean.bubbles === 0 && clean.records === 0 && clean.moneyText === '0원' && clean.billHidden && clean.pauseHidden, 'second run starts clean ' + JSON.stringify(clean));
  await ev(`__ppg.tp(${spawn.x}, ${spawn.z}); __ppg.yaw(${spawn.yaw}); true`);
  await step(10);
  const w2 = await holdMove('KeyW');
  expect(Math.abs(w2.len - firstW) < 0.08 * firstW, `same walking speed on the second run (${firstW} vs ${w2.len})`);
  await I.tap('KeyJ'); await step(20);
  await shot('ir-8-second-run');
  // ---- bill 처음으로
  await I.tap('Escape');
  await I.clickSel('#p-quit');
  await step(40); await sleep(300);
  await I.clickSel('#b-title');
  await sleep(300);
  s = await st();
  expect(s.mode === 'title' && !(await ev('document.getElementById("title").hidden')), 'bill 처음으로 returns to the title');
  log('firstMoney', firstMoney);
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
