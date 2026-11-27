// 자동 화질이 실제 속도를 보고 내려가는지 · 흔들리지 않는지. 지난번 단계를 0 으로 저장해 두고 다시 열어
// (가장 예쁜 단계로 시작), 첫 화면 → 1분 난동(봇) 동안 단계 변화를 1초마다 적는다.
// PPG_BASE=http://localhost:4262 node tools/drive.mjs tools/sc-auto-gfx.mjs <out> 1280x720 gfx=auto
export default async ({ ev, log, sleep, send, shot }) => {
  const st = () => ev('__ppg.gfxMode()');
  let s = await st();
  log('boot (기기 짐작)', JSON.stringify({ level: s.level, guess: s.guess, saved: s.saved, gpu: s.dev.gpu.slice(0, 60), soft: s.dev.soft, aa: s.antialias }));
  if (s.mode !== 'auto') throw new Error('?gfx=auto 로 열어야 합니다');
  await ev(`localStorage.setItem('ppg.gfxAuto', JSON.stringify({ level: 0, gpu: ${JSON.stringify(s.dev.gpu)} }))`);
  await send('Page.reload');
  await sleep(1500);
  for (let i = 0; i < 200; i++) { if (await ev('!!window.__ppg').catch(() => false)) break; await sleep(300); }
  s = await st();
  log('reload (저장된 0)', JSON.stringify({ level: s.level, aa: s.antialias }));
  const trace = [];
  const watch = async (tag, sec) => {
    for (let t = 0; t < sec; t++) {
      await sleep(1000);
      const a = await st();
      const last = trace[trace.length - 1];
      if (!last || last.level !== a.level) trace.push({ tag, t, level: a.level, med: a.lastMed });
    }
  };
  await watch('title', 12);
  await ev('__ppg.start("rush"); __ppg.realtime(); __ppg.auto(true)');
  await watch('rush', 25);
  s = await st();
  log('trace', JSON.stringify(trace));
  log('end', JSON.stringify({ level: s.level, failed: s.failed, bottom: s.bottom, lastMed: s.lastMed, html: await ev('document.documentElement.className') }));
  const changes = trace.length - 1;
  if (s.level < 3) throw new Error('소프트웨어 렌더러인데 낮은 단계로 안 내려감');
  if (changes > 4) throw new Error('단계가 너무 자주 바뀜: ' + changes);
  await shot('auto-end');

  // ---- 판단 규칙만 따로 (가짜 프레임 간격을 넣는다: 화면 속도와 무관)
  await ev('__ppg.auto(false); __ppg.G.manual = true');
  const feed = (ms, sec) => ev(`(() => { const g = __ppg.gfx, out = []; for (let i = 0; i < ${Math.round(sec * 1000 / ms)}; i++) { const l = g.level; g.adapt(${ms / 1000}, true); if (g.level !== l) out.push(l + '>' + g.level); } return out; })()`);
  const fresh = (lv) => ev(`(() => { __ppg.gfx.setMode('auto'); __ppg.gfx.setQuality(${lv}); return __ppg.gfx.level; })()`);
  await fresh(3);
  const up = await feed(16.7, 30);
  log('빠른 기계 (60fps 넉넉) 3에서', JSON.stringify(up));
  if (!up.length || up[0] !== '3>2') throw new Error('넉넉한데 안 올라감');
  const dn = await feed(30, 4);
  const back = await feed(16.7, 40);
  log('버거우면 내려가고, 실패한 단계로는 다시 안 감', JSON.stringify({ dn, back, st: await st() }));
  if (!dn.length) throw new Error('느린데 안 내려감');
  const fail = +dn[0].split('>')[0];
  if (back.some((c) => +c.split('>')[1] <= fail)) throw new Error('실패한 단계로 다시 올라감 (흔들림)');
  await fresh(0);
  const cap = await feed(33.4, 20);
  const cs = await st();
  log('절전 모드처럼 30fps 고정 (0에서)', JSON.stringify({ cap, level: cs.level, bottom: cs.bottom }));
  if (cs.level !== 0) throw new Error('안 빨라지는데 계속 내려감');
};
