export default async ({ ev, shot, sleep, log, step }) => {
  await sleep(1500);
  log('title', JSON.stringify(await ev('__ppg.step(5)')));
  await shot('00-title');
  await ev('__ppg.start("story")');
  let s = await step(30);
  log('story start', JSON.stringify(s));
  await ev('document.getElementById("title").hidden');
  await shot('01-copier-seated');
  s = await step(200);
  log('after intro', JSON.stringify(s));
  await shot('02-copier-walk');
};
