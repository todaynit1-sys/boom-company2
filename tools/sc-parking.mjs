// B2 주차장 with REAL key input for every action under test (positioning between checks uses __ppg.near/tp):
// boss-car glass → wreck through all stages, forklift lifts a car, drums burst, barrier arm, cones, cart ram,
// then the bot plays a while; challenges + bill.
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const fc = async (k) => ((await ev('__ppg.state().fcounts'))[k] || 0);
  const kick = async (n = 1) => { for (let i = 0; i < n; i++) { await I.tap('KeyK'); await step(34); } };
  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 15000);
  // title picker: B2 button (real click)
  await I.clickSel('#title [data-free="parking"]');
  let s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "free" && !s.busy ? s : null; })()', 30000);
  expect(s.floor === 'parking', '자유 난동 · B2 button starts in the garage');
  s = await step(10);
  const chips = await ev('[...document.querySelectorAll("#tasks li")].map(l => l.textContent)');
  expect(chips.length === 2, 'two challenge chips shown ' + JSON.stringify(chips));
  await shot('pk-0-start');

  // ---- boss car: glass (stage 1) → dents → wheel off → wreck (stage 4)
  await ev('__ppg.near("bossCar", 1.55, [1, 0])');
  s = await step(4);
  const m0 = s.money;
  let car = await ev('__ppg.rec("bossCar")');
  for (let i = 0; i < 6 && car.stage < 1; i++) { await kick(); car = await ev('__ppg.rec("bossCar")'); }
  expect(car.stage >= 1, 'kicks break the boss car glass (stage ' + car.stage + ', hp ' + car.hp + '/' + car.hpMax + ')');
  expect((await fc('carStage#bossCar')) >= 1, 'carStage#bossCar counted');
  await shot('pk-1-glass');
  for (let i = 0; i < 6 && car.stage < 3; i++) { await kick(); car = await ev('__ppg.rec("bossCar")'); }
  await shot('pk-2-dented');
  for (let i = 0; i < 12 && car.stage < 4; i++) { await kick(); car = await ev('__ppg.rec("bossCar")'); }
  s = await step(30);
  expect(car.stage === 4 && car.destroyed, 'boss car wrecked (stage ' + car.stage + ')');
  expect(s.money - m0 > 300000 && s.money - m0 < 900000, `wrecking the boss car is a jackpot, not the whole bill (${m0} → ${s.money})`);
  await shot('pk-3-wreck');
  let ch = await ev('__ppg.chal()');
  expect(ch.find((c) => c.id === 'p1').done && ch.find((c) => c.id === 'p2').done, 'challenges 유리 깨기 + 폐차 done');

  // ---- forklift: E to drive, Z raises the fork under a car, Z lowers, E gets off
  await ev('__ppg.near("forklift", 1.7, [0, -1])');
  s = await step(4);
  expect(s.focus && s.focus.includes('지게차'), 'prompt 지게차 타기 (focus=' + s.focus + ')');
  await I.tap('KeyE'); s = await step(6);
  expect(s.toys.ride && s.toys.ride.kind === 'forklift', 'E mounts the forklift');
  await shot('pk-4-forklift');
  // drive it in front of the silver car in the south row (car centre z≈6.4, front toward −z)
  await ev('__ppg.tp(3.75, 2.55); __ppg.toys.T.ride.yaw = 0; __ppg.P.yaw = 0; __ppg.look(0, 0.35); true');
  s = await step(6);
  await I.tap('KeyZ');
  s = await step(150, 30);
  expect(s.toys.ride && s.toys.ride.carried === 'car', 'fork lifts the car (' + JSON.stringify(s.toys.ride) + ')');
  expect((await fc('lift')) >= 1, 'lift counted');
  await ev('__ppg.look(-0.9, 0.3)');
  await shot('pk-5-lifted');
  await I.tap('KeyZ');
  s = await step(150, 30);
  expect(s.toys.ride && !s.toys.ride.carried, 'lowering the fork drops it');
  await I.tap('KeyE'); s = await step(10);
  expect(!s.toys.ride, 'E gets off');

  // ---- drums ×3
  for (let k = 0; k < 3; k++) {
    const d = await ev('__ppg.near("drum", 0.95)');
    if (!d) break;
    for (let i = 0; i < 6; i++) { await kick(); const r = await ev(`__ppg.G.S.phys.records[${d.id}].destroyed`); if (r) break; }
  }
  s = await step(20);
  expect((await fc('break:drum')) >= 3, 'three drums burst (' + (await fc('break:drum')) + ')');
  await shot('pk-6-drums');
  // ---- barrier arm
  await ev('__ppg.near("gateArm", 1.0, [-1, 0])');
  await kick(3);
  expect((await fc('break:barrierGate')) >= 1, 'barrier arm broken');
  // ---- cones: send 8 flying
  for (let k = 0; k < 9 && (await fc('hit:cone')) < 8; k++) { const c = await ev(`(() => { const r = __ppg.G.S.phys.records.find(r => r.type === 'cone' && !r.removed && !r.hitOnce); return r ? r.id : null; })()`); if (c == null) break; await ev(`__ppg.near(${c}, 0.8)`); await kick(); }
  expect((await fc('hit:cone')) >= 8, 'eight cones sent flying (' + (await fc('hit:cone')) + ')');

  // ---- cart: ride and ram (W held, camera pointed at the tyre stacks / boxes)
  await ev('__ppg.near("dockCart", 1.2, [1, 0])');
  s = await step(4);
  await I.tap('KeyE'); s = await step(6);
  expect(s.toys.ride && s.toys.ride.kind === 'cart', 'E hops on the cart (' + s.focus + ')');
  await ev('__ppg.tp(-5.2, 6.8); __ppg.look(Math.atan2(-7.4 + 5.2, 8.45 - 6.8), 0.3)');
  const r0 = await fc('ram');
  await I.down('KeyW'); s = await step(70, 10); await I.up('KeyW');
  await shot('pk-7-cart');
  s = await step(20);
  expect((await fc('ram')) > r0, 'riding the cart into things counts rams (' + r0 + ' → ' + (await fc('ram')) + ')');
  await I.tap('KeyE'); s = await step(8);

  // ---- the bot plays a while (uses toys too)
  await ev('__ppg.auto(true)');
  s = await step(900, 30);
  await ev('__ppg.auto(false)');
  await shot('pk-8-bot');
  ch = await ev('__ppg.chal()');
  log('challenges', JSON.stringify(ch));
  log('state', JSON.stringify({ money: s.money, toys: s.toys, render: s.render, npcs: s.npcs }));
  expect(ch.filter((c) => c.done).length >= 5, 'at least five B2 challenges done (' + ch.filter((c) => c.done).length + ')');
  // ---- bill lists the bonuses
  await ev('__ppg.quit()');
  s = await step(60, 30);
  await sleep(300);
  const rows = await ev('[...document.querySelectorAll("#r-items tr")].map(r => r.textContent)');
  expect(rows.some((r) => r.includes('목표 보너스')), 'bill lists challenge bonuses');
  expect(rows.some((r) => r.includes('사장님 차')), 'bill lists the boss car');
  await shot('pk-9-bill');
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
