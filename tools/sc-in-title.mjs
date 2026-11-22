// Title screen by REAL mouse clicks: modes, gender toggle (model swap), setting toggles persisting across reload.
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send }) => {
  const I = makeInput({ send, ev, sleep });
  const st = () => ev('__ppg.state()');
  const expect = (c, msg) => { if (!c) throw new Error('FAIL ' + msg); log('ok', msg); };
  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 15000);
  await ev('localStorage.removeItem("ppg.settings"); true');
  await shot('ti-0-title');

  // gender
  await I.clickSel('#t-gender [data-g="f"]');
  await sleep(200);
  let g = await ev('({ name: __ppg.P.char.group.name, pressed: document.querySelector(\'#t-gender [data-g="f"]\').getAttribute("aria-pressed"), saved: JSON.parse(localStorage.getItem("ppg.settings")||"{}").gender })');
  expect(g.name === 'char:playerF' && g.pressed === 'true' && g.saved === 'f', '여 click swaps the model ' + JSON.stringify(g));
  await shot('ti-1-female');
  await I.clickSel('#t-gender [data-g="m"]');
  await sleep(200);
  g = await ev('__ppg.P.char.group.name');
  expect(g === 'char:player', '남 click swaps back ' + g);
  await I.clickSel('#t-gender [data-g="f"]');

  // toggles
  const tg = () => ev('Object.fromEntries([...document.querySelectorAll("#title .tg")].map(b => [b.dataset.set, b.getAttribute("aria-pressed")]))');
  const before = await tg();
  await I.clickSel('#title .tg[data-set="sfx"]');
  await I.clickSel('#title .tg[data-set="calm"]');
  const after = await tg();
  expect(before.sfx === 'true' && after.sfx === 'false' && after.calm === 'true', 'toggles flip ' + JSON.stringify(after));
  await send('Page.reload', {});
  await sleep(500);
  await I.waitFor('!!window.__ppg && !document.getElementById("title").hidden', 20000);
  const re = await tg();
  const reG = await ev('({ name: __ppg.P.char.group.name, calmClass: document.documentElement.classList.contains("calm") })');
  expect(re.sfx === 'false' && re.calm === 'true' && reG.name === 'char:playerF' && reG.calmClass, 'settings persist across reload ' + JSON.stringify({ re, reG }));
  await I.clickSel('#title .tg[data-set="sfx"]');
  await I.clickSel('#title .tg[data-set="calm"]');

  // 1분 난동
  await I.clickSel('#title [data-mode="rush"]');
  let s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "rampage" && !s.busy && document.getElementById("fade").hidden ? s : null; })()', 20000);
  expect(s.mode === 'rush' && s.timeLeft > 50 && s.player.anim, '1분 난동 starts ' + JSON.stringify({ mode: s.mode, floor: s.floor, t: s.timeLeft }));
  g = await ev('__ppg.P.char.group.name');
  expect(g === 'char:playerF', 'female model used in game');
  await shot('ti-2-rush');
  await I.tap('Escape');
  await sleep(150);
  expect((await st()).paused, 'Esc pauses');
  await I.clickSel('#p-title');
  await I.waitFor('!document.getElementById("title").hidden', 8000);
  // 출근하기
  await I.clickSel('#title [data-mode="story"]');
  s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "copier" && !s.busy ? s : null; })()', 20000);
  expect(s.mode === 'story', '출근하기 starts the story ' + s.phase);
  await sleep(600);
  await shot('ti-3-story');
  await I.tap('KeyP');
  await sleep(150);
  expect((await st()).paused, 'P pauses');
  await shot('ti-4-pause');
  await I.clickSel('#p-title');
  await I.waitFor('!document.getElementById("title").hidden', 8000);
  // 자유 난동 · 7층
  await I.clickSel('#title [data-free="office"]');
  s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "free" && !s.busy ? s : null; })()', 20000);
  expect(s.mode === 'free' && s.floor === 'office', '자유 난동 7층 ' + s.floor);
  await I.tap('Escape'); await sleep(100); await I.clickSel('#p-title');
  await I.waitFor('!document.getElementById("title").hidden', 8000);
  // 자유 난동 · 1층
  await I.clickSel('#title [data-free="lobby"]');
  s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "free" && !s.busy ? s : null; })()', 20000);
  expect(s.mode === 'free' && s.floor === 'lobby', '자유 난동 1층 ' + s.floor);
  await sleep(500);
  await shot('ti-5-free-lobby');
  await I.tap('Escape'); await sleep(100); await I.clickSel('#p-title');
  await I.waitFor('!document.getElementById("title").hidden', 8000);
  await I.clickSel('#t-gender [data-g="m"]');
  log('errors', JSON.stringify(await ev('__ppg.errors')));
};
