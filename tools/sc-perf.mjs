// Render cost of the untouched office / lobby: renderer.info + where the draw calls come from.
// node tools/drive.mjs tools/sc-perf.mjs <out> 1280x720 [touch=1]
export default async ({ ev, shot, log, step }) => {
  const breakdown = `(() => {
    const { scene, G, camera } = __ppg;
    const S = G.S; const out = { props: 0, propsCast: 0, chars: 0, charsCast: 0, other: 0, otherCast: 0, inst: 0, instCast: 0 };
    const recGroups = new Set(S.phys.records.filter(r => !r.removed).map(r => r.group));
    const npcGroups = new Set([...S.npcs, ...S.walkers].map(n => n.group)); npcGroups.add(__ppg.P.char.group);
    scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      let k = 'other';
      for (let p = o; p; p = p.parent) { if (recGroups.has(p)) { k = 'props'; break; } if (npcGroups.has(p)) { k = 'chars'; break; } }
      if (o.isInstancedMesh) k = 'inst';
      out[k]++; if (o.castShadow) out[k + 'Cast']++;
    });
    return out;
  })()`;
  const measure = async (tag) => {
    await step(3);
    const r1 = await ev('__ppg.render()');
    const r2 = await ev('__ppg.render()');
    const b = await ev(breakdown);
    log(tag, JSON.stringify({ withShadow: r1, noShadowFrame: r2, breakdown: b, quality: await ev('__ppg.gfx.level'), post: await ev('__ppg.gfx.usingPost') }));
  };
  await step(5);
  await measure('title');
  await shot('p0-title');
  await ev('__ppg.start("rush")');
  await step(20);
  await measure('rush-office-start');
  await shot('p1-rush-office');
  await ev('__ppg.look(Math.PI/2, 0.35)');
  await measure('rush-office-look-east');
  await shot('p2-rush-office-east');
  await ev('__ppg.start("free", { floor: "lobby" })');
  await step(20);
  await measure('free-lobby-start');
  await shot('p3-lobby');
};
