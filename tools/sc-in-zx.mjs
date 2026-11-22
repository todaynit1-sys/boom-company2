// Z (punch) / X (kick) with REAL key events in 1분 난동, incl. hold-to-repeat and the HUD hint.
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 15000);
  const help = await ev('document.getElementById("t-help").textContent');
  expect(/Z/.test(help) && /X/.test(help), 'title help mentions Z / X: ' + help);
  await I.clickSel('#title [data-mode="rush"]');
  await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "rampage" && !s.busy; })()', 20000);
  const hud = await ev('document.getElementById("keys").textContent');
  expect(/Z/.test(hud) && /X/.test(hud), 'HUD key hints mention Z / X: ' + hud);
  const seat = await ev(`(() => { const F = __ppg.G.S.F; const occ = new Set(__ppg.G.S.npcs.filter(n => n.spec && n.spec.seat).map(n => n.spec.seat)); const s = F.seats.find(s => !s.player && !occ.has(s) && s.items.length >= 4 && s.x < 0); return { x: s.x, z: s.z, rotY: s.rotY }; })()`);
  await ev(`__ppg.tp(${seat.x}, ${seat.z}); __ppg.yaw(${seat.rotY}); true`);
  let s = await step(10);
  const m0 = s.money;
  await I.tap('KeyZ'); s = await step(30);
  expect(s.money > m0, `Z tap punches (money ${m0} → ${s.money})`);
  // hold Z: repeats
  const anims0 = s.money;
  await I.down('KeyZ');
  let swings = 0, prev = false;
  for (let i = 0; i < 60; i += 2) { await step(2); const a = await ev('__ppg.P.attackT > 0'); if (a && !prev) swings++; prev = a; }
  await I.up('KeyZ'); s = await step(20);
  expect(swings >= 3, `holding Z keeps punching (${swings} swings in 1 s, money ${anims0} → ${s.money})`);
  const after = await step(30); const a2 = await ev('__ppg.P.attackT > 0');
  expect(!a2, 'releasing Z stops the punches');
  const m1 = after.money;
  await I.tap('KeyX'); s = await step(40);
  expect(s.money > m1, `X tap kicks (money ${m1} → ${s.money})`);
  await I.tap('Escape');
  const pk = await ev('document.getElementById("p-keys").textContent');
  expect(/Z/.test(pk) && /X/.test(pk), 'pause menu controls mention Z / X: ' + pk);
  await shot('zx-pause');
  if (fails.length) throw new Error(fails.join(' | '));
};
