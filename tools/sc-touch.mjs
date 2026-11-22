// Phone layouts: title, story scene and rampage HUD with the touch pad (?touch=1).
export default async ({ ev, shot, log, step, W, H }) => {
  const tag = W > H ? 'land' : 'port';
  await step(5);
  await shot(`t-${tag}-0-title`);
  await ev('__ppg.start("story")');
  let s = await step(220, 30);
  await shot(`t-${tag}-1-story`);
  await ev('__ppg.goto("rampage")');
  await ev('__ppg.auto(true)');
  s = await step(500, 50);
  await shot(`t-${tag}-2-rampage`);
  log(tag, JSON.stringify({ scene: s.scene, money: s.money, quality: s.quality, post: s.post, render: s.render, touch: await ev('document.documentElement.classList.contains("touch")'), scrollW: await ev('document.documentElement.scrollWidth') }));
};
