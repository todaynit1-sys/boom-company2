// Shared toys on 7층 with REAL key input: fire alarm → sprinklers, extinguisher spray + flight, chair ride +
// ram, boss nameplate thrown through the window ('out' counter), plus held weapons (tambourine / megaphone)
// spawned with __ppg.give so the weapon code is covered before their floors exist.
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step, W, H }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const fc = async (k) => ((await ev('__ppg.state().fcounts'))[k] || 0);
  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 15000);
  await I.clickSel('#title [data-free="office"]');
  let s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "free" && !s.busy ? s : null; })()', 30000);
  s = await step(5);

  // ---- fire alarm (hold E) → sprinklers rain, people flee
  await ev('__ppg.near("alarmBell", 0.9, [1, 0])');
  s = await step(4);
  expect(s.focus === '비상벨 누르기', 'prompt 비상벨 누르기 (focus=' + s.focus + ')');
  await I.down('KeyE'); s = await step(30); await I.up('KeyE');
  s = await step(40);
  expect(s.toys.alarm && s.toys.alarm.alarmed && s.toys.alarm.rain, 'alarm on, sprinklers raining ' + JSON.stringify(s.toys.alarm));
  expect((await fc('alarm')) === 1, 'alarm counted once');
  expect(s.npcs.panicked >= 3, 'people panic (' + s.npcs.panicked + ')');
  await ev('__ppg.look(Math.PI / 2 + 0.3, 0.25)');
  await shot('ty-1-sprinklers');

  // ---- extinguisher: E picks it up, hold J sprays → recoil + flight
  await ev('__ppg.near("extinguisher", 0.75)');
  s = await step(4);
  expect(s.focus === '들기', 'prompt 들기 on the extinguisher (focus=' + s.focus + ')');
  await I.tap('KeyE'); s = await step(6);
  expect(s.toys.weapon === 'extinguisher', 'holding the extinguisher');
  await ev('__ppg.tp(-6, 2.6); __ppg.yaw(-Math.PI / 2)');
  const p0 = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
  let maxY = 0;
  await I.down('KeyJ');
  for (let i = 0; i < 12; i++) { s = await step(8); maxY = Math.max(maxY, s.player.y); if (i === 7) await shot('ty-2-spray-fly'); }
  await I.up('KeyJ');
  s = await step(60);
  const p1 = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
  expect(maxY > 0.55, 'spraying lifts the player off the ground (max y ' + maxY.toFixed(2) + ')');
  expect(p1[0] - p0[0] > 0.6, 'recoil pushes backwards (dx ' + (p1[0] - p0[0]).toFixed(2) + ')');
  expect((await fc('fly')) >= 1, 'fly counted');
  await I.tap('KeyE'); s = await step(10); // throw it away

  // ---- chair ride: E 타기, W charges into the desks, E 내리기
  const chair = await ev(`(() => { const r = __ppg.G.S.phys.records.find(r => r.type === 'chair' && !r.solid && !r.removed && r.body.position.x > 9.5 && r.body.position.z < -6); return r ? r.id : null; })()`);
  await ev(`__ppg.near(${chair}, 0.85, [-1, 0])`);
  s = await step(4);
  expect(s.focus && s.focus.includes('바퀴의자'), 'prompt 바퀴의자 타기 (focus=' + s.focus + ')');
  await I.tap('KeyE'); s = await step(6);
  expect(s.toys.ride && s.toys.ride.kind === 'chair', 'E rides the chair');
  await ev('__ppg.tp(7.5, -2.2); __ppg.look(-0.75, 0.3)');
  const r0 = await fc('ram:chair');
  await I.down('KeyW'); s = await step(60, 10); await shot('ty-3-chair'); s = await step(40, 10); await I.up('KeyW');
  expect((await fc('ram:chair')) > r0, 'chair rams counted (' + r0 + ' → ' + (await fc('ram:chair')) + ')');
  await I.tap('KeyE'); s = await step(8);
  expect(!s.toys.ride, 'E gets off the chair');

  // ---- boss nameplate out of the window
  await ev('__ppg.near("bossPlate", 0.75, [-1, 0])');
  s = await step(4);
  expect((s.focus || '').endsWith('집기'), 'prompt 집기 (tap) at the nameplate (focus=' + s.focus + ')');
  await I.tap('KeyE'); s = await step(6);
  expect(s.player.held === 'nameplate', 'holding the nameplate');
  await ev('__ppg.tp(-1.6, -7.7); __ppg.yaw(Math.PI); __ppg.look(Math.PI, 0.2)');
  s = await step(4);
  await I.tap('KeyJ');
  s = await step(10);
  await shot('ty-4-throw');
  s = await step(100, 20);
  expect(s.toys.windows[0] >= 1, 'the throw smashes a window pane (' + s.toys.windows + ')');
  expect((await fc('out#bossPlate')) >= 1, 'nameplate counted as thrown out');
  const ch = await ev('__ppg.chal()');
  expect(ch.find((c) => c.id === 'o4').done && ch.find((c) => c.id === 'o5').done, '명패 창밖으로 + 비상벨 challenges done');
  const items = await ev('[...__ppg.G.items.keys()]');
  expect(items.some((k) => k.includes('창밖 투척')), 'bill item for the out-throw ' + JSON.stringify(items.filter((k) => k.includes('창밖'))));
  await shot('ty-5-window');

  // ---- weapons (spawned): tambourine hits, megaphone shouts (Q)
  await ev('__ppg.near("cabinetTall", 1.0)');
  await ev('__ppg.give("tambourine")'); s = await step(4);
  expect(s.toys.weapon === 'tambourine', 'tambourine in hand');
  for (let i = 0; i < 3; i++) { await I.tap('KeyJ'); s = await step(25); }
  expect((await fc('weapon:tambourine')) >= 2, 'tambourine hits counted (' + (await fc('weapon:tambourine')) + ')');
  await I.tap('KeyE'); s = await step(10);
  await ev('__ppg.give("megaphone")'); s = await step(4);
  await I.tap('KeyQ'); s = await step(70);
  expect((await fc('shout')) >= 1, 'Q shouts through the megaphone');
  await shot('ty-6-megaphone');
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
