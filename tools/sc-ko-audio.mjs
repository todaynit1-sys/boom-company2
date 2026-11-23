// Offline render check of the people sfx (raw builder output, LEVEL trim applied): non-silent, not clipping.
// node tools/drive.mjs tools/sc-ko-audio.mjs <out>
export default async ({ ev, log }) => {
  const res = await ev(`(async () => {
    const { audioLab } = await import('/js/audio.js');
    const out = {};
    for (const [name, x] of [['ko', {}], ['ko', { at: 1.2 }], ['ko', { at: 0.3 }], ['bonk', {}], ['soul', {}], ['soulBack', {}], ['hitSoft', {}], ['punch', {}]]) {
      let worst = null;
      for (const pitch of [0.85, 1, 1.15]) {
        const b = await audioLab.renderSfx(name, Object.assign({ pitch, seconds: 3 }, x));
        const a = audioLab.analyse(b);
        if (!worst || a.peak > worst.peak) worst = Object.assign({ pitch }, a);
      }
      out[name + (x.at ? '@' + x.at : '')] = { peak: +worst.peak.toFixed(3), rms: +worst.rms.toFixed(4), dur: +worst.dur.toFixed(2), nan: worst.nan };
    }
    return out;
  })()`);
  log(JSON.stringify(res, null, 1));
  const bad = Object.entries(res).filter(([, r]) => r.nan || r.peak > 1 || r.peak < 0.05);
  if (bad.length) throw new Error('bad sfx: ' + JSON.stringify(bad));
};
