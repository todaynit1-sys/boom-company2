// Phone layouts: title, level select, level card, story scene, rampage HUD with the touch pad, level result (?touch=1).
export default async ({ ev, shot, log, step, sleep, W, H }) => {
  const tag = W > H ? 'land' : 'port';
  await step(5);
  await shot(`t-${tag}-0-title`);
  // 화면 밖으로 넘치는지 (가로 스크롤 없음, 레벨 카드 8장이 창 안에서 스크롤)
  await ev('__ppg.unlock(4); __ppg.levelSelect(true)');
  await sleep(300);
  const lv = await ev(`(() => { const w = document.querySelector('.lv-card-wrap').getBoundingClientRect(); return { cards: document.querySelectorAll('#lv-grid .lv-card').length, fits: w.top >= -1 && w.bottom <= innerHeight + 1 && w.left >= -1 && w.right <= innerWidth + 1, scrollW: document.documentElement.scrollWidth }; })()`);
  log(tag, 'levels', JSON.stringify(lv));
  if (!lv.fits || lv.cards !== 8 || lv.scrollW > W) throw new Error('level select does not fit ' + JSON.stringify(lv));
  await shot(`t-${tag}-0b-levels`);
  await ev('__ppg.levelSelect(false)');
  await ev('__ppg.start("story", { level: 3 })');
  let s = await step(220, 30);
  await shot(`t-${tag}-1-story`);
  await ev('__ppg.skip()');
  for (let i = 0; i < 40 && s.scene !== 'rampage'; i++) s = await step(15, 15);
  await ev('__ppg.auto(true)');
  s = await step(500, 50);
  await shot(`t-${tag}-2-rampage`);
  log(tag, JSON.stringify({ scene: s.scene, money: s.money, quality: s.quality, post: s.post, render: s.render, touch: await ev('document.documentElement.classList.contains("touch")'), scrollW: await ev('document.documentElement.scrollWidth') }));
  await ev('__ppg.G.timeLeft = 0.2; true');
  for (let i = 0; i < 30 && s.scene !== 'bill'; i++) s = await step(20, 20);
  s = await step(60, 30);
  await ev('__ppg.auto(false)');
  await sleep(900);
  await shot(`t-${tag}-3-result`);
  const btns = await ev(`[...document.querySelectorAll('#bill .b-btns .btn')].filter(b => !b.hidden).map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, in: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; })`);
  log(tag, 'result buttons', JSON.stringify(btns));
  if (s.scene !== 'bill' || !btns.every((b) => b.in)) throw new Error('result buttons off screen ' + JSON.stringify(btns));
};
