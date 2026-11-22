// B2 지하 주차장 — the reference floor for the floor-module contract (js/floors/README.md).
// Everything here goes through ctx (no imports from the game core): shell, lighting, props from both art
// modules, NPCs, a story situation (scene) and hooks.
const PI = Math.PI;

// layout constants (metres). Room 28 × 18, ceiling 3.1. Aisle along x at z∈[-4,4].
const W = 28, D = 18, H = 3.1;
const BAYS = [-11.25, -8.75, -6.25, -3.75, -1.25, 1.25, 3.75, 6.25, 8.75, 11.25]; // bay centres (2.5 m wide)
const NZ = -6.45, SZ = 6.45; // north / south row bay centres
const PLATE = { '#eef0f1': '34나 2580', '#c8372b': '78라 3333', '#b9bec4': '12가 1004', '#3f6fb5': '56다 7777' };

export default {
  id: 'parking', label: 'B2', key: 'KeyN', name: 'B2 · 지하 주차장', sub: '사장님 차가 있는 곳',
  size: { w: W, d: D, h: H },
  // underground: one constant look, whatever the story time is ('garage' preset in gfx.js)
  light: 'garage',
  music: 'office', stepSfx: 'step',

  build(ctx) {
    const { M, tex2, V } = ctx;
    const A = ctx.anchors;
    const hw = W / 2, hd = D / 2;

    // ---------------- shell
    ctx.floor(M.tex('parkingFloor', tex2.parkingFloor(), W / 4, D / 4, { roughness: 0.72, metalness: 0.02 }), W, D);
    ctx.ceiling(M.tex('garageCeil', tex2.concrete(), W / 2.4, D / 2.4, { roughness: 1, color: '#e6e3dd' }), W, D, H);
    const conc = M.tex('garageWall', tex2.concrete(), W / 2.4, H / 2.4, { roughness: 0.95, color: '#ebe8e2' });
    const concZ = M.tex('garageWallZ', tex2.concrete(), D / 2.4, H / 2.4, { roughness: 0.95, color: '#ebe8e2' });
    const evZ = [-1.6, 1.6];
    ctx.wall('x', -hd, -1, -hw - 0.2, hw + 0.2, H, conc);
    ctx.wall('x', hd, 1, -hw - 0.2, hw + 0.2, H, conc);
    ctx.wall('z', -hw, -1, -hd, hd, H, concZ, evZ.map((z) => ({ a0: z - 0.5, a1: z + 0.5, top: 2.1 })));
    ctx.wall('z', hw, 1, -hd, hd, H, concZ, [{ a0: -2.6, a1: 2.6, top: 2.5 }]); // exit ramp opening
    // painted wall band (green) + yellow stripe, like every Korean garage
    const band = M.std('garageBand', { color: '#3f8a6e', roughness: 0.8 }), stripe = M.std('garageStripe', { color: '#f2c21b', roughness: 0.6 });
    for (const [x0, x1, z, rot] of [[-hw, hw, -hd + 0.012, 0], [-hw, hw, hd - 0.012, 0]]) {
      ctx.box(x1 - x0, 1.0, 0.02, band, (x0 + x1) / 2, 0, z, { cast: false });
      ctx.box(x1 - x0, 0.12, 0.022, stripe, (x0 + x1) / 2, 1.0, z, { cast: false });
      void rot;
    }
    for (const [z0, z1] of [[-hd, -2.1], [2.1, hd]]) { ctx.box(0.02, 1.0, z1 - z0, band, -hw + 0.012, 0, (z0 + z1) / 2, { cast: false }); ctx.box(0.022, 0.12, z1 - z0, stripe, -hw + 0.012, 1.0, (z0 + z1) / 2, { cast: false }); }
    for (const [z0, z1] of [[-hd, -2.6], [2.6, hd]]) { ctx.box(0.02, 1.0, z1 - z0, band, hw - 0.012, 0, (z0 + z1) / 2, { cast: false }); ctx.box(0.022, 0.12, z1 - z0, stripe, hw - 0.012, 1.0, (z0 + z1) / 2, { cast: false }); }
    // exit ramp seen through the opening (walking / throwing stops at the gate line)
    const ramp = M.std('ramp', { color: '#4a5058', roughness: 0.9 });
    const rampG = new ctx.THREE.PlaneGeometry(5.2, 6); const rm = new ctx.THREE.Mesh(rampG, ramp);
    rm.rotation.set(-PI / 2 + 0.28, 0, PI / 2); rm.position.set(hw + 2.9, 0.8, 0); rm.receiveShadow = true; ctx.add(rm);
    ctx.box(0.1, 2.5, 5.4, M.std('rampDark', { color: '#1c2026', roughness: 1 }), hw + 5.6, 0, 0, { cast: false });
    ctx.collider(hw + 0.25, 0, 0.1, 2.7, 2.5);
    ctx.decal(hw - 1.2, 0, 1.6, 2.2, { map: arrowTex(ctx, '출구'), key: 'exitText', rotY: -PI / 2 });
    // ceiling beams over the bay lines (no shadows: they would darken the whole aisle)
    const beam = M.tex('beam', tex2.concrete(), W / 2.4, 0.4, { roughness: 1, color: '#dedad3' });
    for (const z of [-4.3, 4.3]) ctx.box(W, 0.36, 0.45, beam, 0, H - 0.36, z, { cast: false });
    // fluorescent tubes (emissive → bloom) + a few warm pools so it reads like a lit garage, not a cave
    const tube = M.std('tube', { color: '#f4fbff', emissive: '#e8f4ff', emissiveIntensity: 1.7, roughness: 0.4 });
    for (let x = -12; x <= 12.1; x += 4) for (const z of [-6.6, -1.6, 1.6, 6.6]) ctx.box(1.3, 0.05, 0.13, tube, x, H - 0.06, z, { cast: false });
    ctx.light(-12.0, 2.6, 0.0, { color: '#ffd9a6', intensity: 5.5, distance: 7.5 });
    ctx.light(-6.25, 2.7, -5.2, { color: '#ffe3b8', intensity: 7, distance: 7.5 });
    ctx.light(-9.6, 2.7, 6.4, { color: '#ffcf90', intensity: 5.5, distance: 7 });
    ctx.light(12.4, 2.3, 0.0, { color: '#a6f0c0', intensity: 3.5, distance: 6 });
    // pipes, sprinklers
    ctx.prop('pipeRun', 0, -8.3, 0, { w: 26 });
    ctx.prop('pipeRun', 4, 8.2, 0, { w: 18 });
    for (const x of [-9, -3, 3, 9]) for (const z of [-2.2, 2.2]) ctx.prop('sprinkler', x, z);

    // ---------------- markings: bays, centre line, arrows, painted text
    for (const x of BAYS) ctx.prop('parkingLine', x, NZ, 0, { w: 2.5, d: 4.9 });
    for (const x of BAYS.slice(4)) ctx.prop('parkingLine', x, SZ, PI, { w: 2.5, d: 4.9 });
    for (let x = -12; x < 12; x += 2) ctx.decal(x + 0.55, 0, 1.1, 0.12, { color: '#e8c41c', key: 'centreDash' });
    for (const [x, z] of [[-9.5, 1.9], [-1.5, 1.9], [6.5, 1.9], [-5.5, -1.9], [2.5, -1.9]]) ctx.prop('floorArrow', x, z, -PI / 2);
    ctx.decal(-6.25, -3.55, 2.2, 0.62, { map: textTex(ctx, '사장님 전용', '#e6b23a'), key: 'bossOnly' });
    ctx.decal(-11.5, 0, 2.4, 1.6, { map: textTex(ctx, 'B2', 'rgba(240,240,232,0.9)'), key: 'b2Text', rotY: -PI / 2 });
    // hazard area of the loading dock
    ctx.decal(-9.5, 6.5, 8.6, 4.6, { map: hatchTex(ctx), key: 'dockHatch' });

    // ---------------- pillars with zone letters
    [['A', -7.5], ['B', 0], ['C', 7.5]].forEach(([t, x]) => { for (const z of [-4.3, 4.3]) ctx.prop('parkingPillar', x, z, 0, { h: H, text: t }); });

    // ---------------- cars. North row nose-out (+z), south row nose-out (−z)
    const car = (x, z, rotY, color, o = {}) => ctx.prop('car', x, z, rotY, Object.assign({ color, plate: PLATE[color] || '90마 5678' }, o));
    car(-11.25, NZ + 0.05, 0, '#c8372b');
    car(-8.85, NZ + 0.05, 0, '#eef0f1');
    ctx.prop('car', -6.1, NZ + 0.1, 0, { boss: true, plate: '01가 0001', tag: 'bossCar' });
    car(-1.35, NZ + 0.05, 0, '#b9bec4');
    car(1.35, NZ + 0.05, 0, '#3f6fb5');
    car(6.15, NZ + 0.05, 0, '#eef0f1');
    car(8.85, NZ + 0.05, 0, '#c8372b');
    car(3.75, SZ - 0.05, PI, '#b9bec4');
    car(8.85, SZ - 0.05, PI, '#3f6fb5');
    // the car boxing the boss in (story: push it out of the way)
    car(-6.4, -2.35, PI / 2, '#eef0f1', { tag: 'blocker' });
    for (const x of [-11.25, -8.85, -6.1, -1.35, 1.35, 6.15, 8.85]) ctx.prop('wheelStop', x, -8.35, 0);
    for (const x of [3.75, 8.85]) ctx.prop('wheelStop', x, 8.35, 0);
    ctx.prop('banner', -6.25, -hd, 0, { y: 2.05, text: '사장님 전용', w: 2.2, h: 0.42 });

    // ---------------- loading dock: forklift, drums, tyres, boxes
    ctx.prop('forklift', -9.4, 6.0, PI / 2, { tag: 'forklift' });
    [[-12.9, 8.3, '#c8372b'], [-12.25, 8.45, '#2f6fd6'], [-12.6, 7.7, '#c8372b'], [-11.6, 8.35, '#3f8f4a'], [-13.3, 5.0, '#c8372b'], [-12.7, 4.9, '#2f6fd6']]
      .forEach(([x, z, c]) => ctx.prop('drum', x, z, 0, { color: c }));
    ctx.prop('tireStack', -10.5, 8.45);
    ctx.prop('tireStack', -9.8, 8.5);
    for (const [x, z, y, r] of [[-7.6, 8.45, 0, 0.1], [-7.15, 8.5, 0, -0.1], [-7.4, 8.45, 0.3, 0.3], [-6.7, 8.4, 0, 0.2]]) ctx.prop('box', x, z, r, { y });
    ctx.prop('cart', -5.4, 5.2, 0.4, { load: false, tag: 'dockCart' });
    for (const [x, z] of [[-3.75, -5.4], [-3.75, -6.9], [3.75, -5.8], [3.75, -6.8], [11.25, 5.6], [11.25, 6.9], [5.0, 2.4], [-2.2, 2.9], [10.3, -2.9]]) ctx.prop('cone', x, z);

    // ---------------- exit: booth, barrier, signs; walls: CCTV, alarm, extinguishers
    ctx.prop('ticketBooth', 12.5, -4.4, -PI / 2);
    ctx.prop('barrierGate', 12.35, -2.85, -PI / 2, { tag: 'gateArm' });
    ctx.prop('exitSign', hw, 0, -PI / 2, { y: 2.62 });
    ctx.prop('exitSign', -hw, 0, PI / 2, { y: 2.35 });
    ctx.prop('cctv', -hw, -6.0, PI / 2, { y: 2.45 });
    ctx.prop('cctv', hw, 6.0, -PI / 2, { y: 2.45 });
    ctx.prop('alarmBell', -hw, 4.3, PI / 2, { y: 1.25 });
    ctx.prop('extinguisher', -13.65, 3.4, PI / 2);
    ctx.prop('extinguisher', 5.6, 8.7, PI);

    // ---------------- elevators (west wall, facing +x)
    evZ.forEach((z, i) => ctx.elevator(-hw, z, PI / 2, 'B2', i));
    ctx.decorProp('floorSign', -hw + 0.015, 1.55, 0, PI / 2, { text: 'B2', h: 0.42, color: '#f2f2ea' });

    // ---------------- people
    ctx.npc('workerM1', 11.0, -5.9, { rotY: -2.2, anim: 'armsCrossed', role: 'guard', face: 'normal', variantSeed: 81,
      look: { suit: '#27324a', pants: '#27324a', shirt: '#dfe6f0', tie: '#1b2335' },
      lines: ['여기 주차 금지예요~', '사장님 차는 건드리지 마세요!', '정산은 저쪽이에요'] });
    ctx.npc('workerF2', -2.6, 1.4, { rotY: PI, anim: 'phone', role: 'worker', variantSeed: 82, lines: ['아 차 어디 댔더라…'] });
    ctx.npc('workerM2', 5.2, 1.2, { rotY: 0.4, anim: 'walk', role: 'worker', variantSeed: 83, lines: ['오늘은 칼퇴다…'] });

    // ---------------- anchors
    ctx.spawn(-10.8, 0, PI / 2);
    ctx.anchor('blockerPush', -9.1, -2.35);
    ctx.anchor('bossDoor', -4.6, -5.6);
    ctx.anchor('coworkerCarA', 1.25, -3.6);
    ctx.anchor('coworkerCarB', 3.75, 3.55);
    ctx.hide(-13, -8); ctx.hide(13, 8); ctx.hide(-13, 8.2); ctx.hide(12.4, -7.8);
    A.titleCam = { pos: V(-2, 2.2, 1), look: V(-6.25, 0.8, -5) };
  },

  challenges: [
    { id: 'p1', text: '사장님 차 유리 깨기', kind: 'carStage', tag: 'bossCar', n: 1, bonus: 100000 },
    { id: 'p2', text: '사장님 차 폐차시키기', kind: 'carStage', tag: 'bossCar', n: 4, bonus: 300000 },
    { id: 'p3', text: '지게차로 차 들어 올리기', kind: 'lift', bonus: 150000 },
    { id: 'p4', text: '드럼통 3개 터뜨리기', kind: 'break', type: 'drum', n: 3, bonus: 80000 },
    { id: 'p5', text: '차단봉 부러뜨리기', kind: 'break', type: 'barrierGate', bonus: 60000 },
    { id: 'p6', text: '라바콘 8개 날리기', kind: 'hit', type: 'cone', n: 8, bonus: 50000 },
  ],

  // story: one extra situation in the day, slotted in by its time (after the coffee run, before 퇴근 5분 전)
  scene: {
    id: 'parkingCar', time: '오후 3:00', title: '사장님 차 빼 주기', sub: '“김 대리, 사장님 차 좀 빼 줘”',
    start: { floor: 'office', seat: 'playerSeat', preset: 'day', music: 'office', stress: 52 },
    steps: [
      { mission: { title: '사장님 차 빼 주기', sub: '7층 · 오후 3:00', quote: '김 대리, 사장님 차 좀 빼 줘' } },
      { tasks: ['B2 주차장 가기', '막은 차 밀어 빼기', '사장님 차 빼 드리기'] },
      { wait: 0.6 },
      { sub: ['부장', '김 대리~ 사장님 차가 B2에서 막혔대. 가서 좀 빼 드려!', 3000], sfx: 'mumbleLow' },
      { wait: 2.6 },
      { unseat: true },
      { stress: 4, face: ['endure', 1.2], toast: '엘리베이터를 타고 B2로' },
      { goto: 'parking' },
      { done: 0, mission: { title: '사장님 차 빼 주기', sub: 'B2 · 오후 3:05', quote: '김 대리, 사장님 차 좀 빼 줘' } },
      { say: ['guard', '사장님 차요? 저 흰 차가 딱 막고 있네요~', 2.8] },
      { hold: { tag: 'blocker', at: 'blockerPush', text: '막은 차 밀기', sec: 1.2 } },
      { recMove: { tag: 'blocker', dx: 3.0, dz: 0, sec: 1.4 }, sfx: 'carAlarm' },
      { stress: 4, sub: ['나', '(…남의 차를 왜 내가 밀고 있지)', 2000], done: 1 },
      { hold: { tag: 'bossCar', at: 'bossDoor', text: '사장님 차 빼기', sec: 1.0 } },
      { recMove: { tag: 'bossCar', dx: 0, dz: 1.3, sec: 1.3 }, sfx: 'engine' },
      { npc: { who: 'guard', walk: 'bossDoor', speed: 1.6, anim: 'walk' } },
      { wait: 1.2 },
      { say: ['guard', '어? 여기 뒷문 긁혔네? 아까는 없었는데…', 2.8] },
      { wait: 2.6 },
      { sub: ['부장 (전화)', '김 대리! 사장님 차 긁었다며? 수리비는 자네 월급에서~', 3200], sfx: 'mumbleLow' },
      { stress: 10, face: ['endure', 2.5], done: 2 },
      { wait: 3.4 },
    ],
  },

  hooks: {
    // coworkers walk to their cars when you arrive (story / free play, not during a rampage)
    onEnter(game) {
      if (game.rampage) return;
      const [a, b] = game.npcs('worker');
      if (a && a.state === 'idle') game.walkNpc(a, game.anchor('coworkerCarA'), { speed: 1.0, anim: 'phone' });
      if (b && b.state === 'idle') game.walkNpc(b, game.anchor('coworkerCarB'), { speed: 1.1, anim: 'walk' });
    },
    onDestroy(game, rec) {
      if (rec.tag === 'bossCar') { const g = game.npc('guard'); if (g) game.say(g, '사… 사장님 차가!!', 2.6); }
    },
  },
};

// ---------------- painted floor textures (cached through ctx.canvasTex)
function textTex(ctx, text, color) {
  return ctx.canvasTex('b2:' + text, 512, 144, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold 112px ${ctx.KFONT}`; x.fillText(text, w / 2, h / 2 + 6);
  });
}
function arrowTex(ctx, text) {
  return ctx.canvasTex('b2arrow:' + text, 256, 352, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(240,240,232,0.92)';
    x.beginPath(); x.moveTo(128, 8); x.lineTo(232, 120); x.lineTo(168, 120); x.lineTo(168, 230); x.lineTo(88, 230); x.lineTo(88, 120); x.lineTo(24, 120); x.closePath(); x.fill();
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 84px ${ctx.KFONT}`; x.fillText(text, 128, 300);
  });
}
function hatchTex(ctx) {
  return ctx.canvasTex('b2hatch', 512, 280, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = 'rgba(232,196,28,0.85)'; x.lineWidth = 10; x.strokeRect(6, 6, w - 12, h - 12);
    x.save(); x.beginPath(); x.rect(6, 6, w - 12, h - 12); x.clip();
    x.fillStyle = 'rgba(232,196,28,0.5)';
    for (let i = -h; i < w; i += 46) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 18, h); x.lineTo(i + 18 + h, 0); x.lineTo(i + h, 0); x.fill(); }
    x.restore();
  });
}
