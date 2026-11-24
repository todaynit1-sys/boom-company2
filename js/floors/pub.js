// B1 회식 — 고깃집 + 노래방 코너. The team dinner floor: seven grill tables under smoke hoods (west), booth seats
// along the north wall, the owner's counter + soju fridge (south-east), and a karaoke corner with three
// machines, a mirror ball and tambourines (north-east). Floor-module contract: js/floors/README.md.
const PI = Math.PI;

// layout (metres). Room 26 × 18, ceiling 3.0. Elevators on the west wall, aisle z∈[-2,2] runs east from them.
const W = 26, D = 18, H = 3.0;
const hw = W / 2, hd = D / 2;
const NORTH = [[-9.0, -7.45], [-5.4, -7.45], [-1.8, -7.45]]; // booth-backed tables (stools E, W, S)
const HEAD = [-5.2, 0.0]; // the boss's table, right in front of the elevators
const SOUTH = [[-9.0, 5.9], [-5.2, 5.9], [-1.4, 5.9]];
const KZ = [-7.4, -5.0, -2.6]; // karaoke machines on the east wall
const STOOL_R = 0.85;
const RED = '#d8352a', TEAL = '#2f8f8a';

export default {
  id: 'pub', label: 'B1', key: 'KeyB', name: 'B1 · 회식 고깃집', sub: '오늘은 부장님이 쏜다',
  size: { w: W, d: D, h: H },
  // windowless, warm and low — but bright enough that tables and people read from the camera
  light: { preset: 'indoor', sun: '#ffe2c0', sunI: 1.05, hemiSky: '#ffe2c4', hemiGround: '#5e4238', hemiI: 1.08, top: '#ffe4c4', topI: 0.5, amb: 0.17, exposure: 1.02, fog: '#2b2026', fogNear: 18, fogFar: 50 },
  music: 'lobby', stepSfx: 'step',

  build(ctx) {
    const { M, tex, tex2, V } = ctx;
    const A = ctx.anchors;

    // ---------------- shell
    ctx.floor(M.tex('pubFloor', tex2.pubFloor(), W / 1.2, D / 1.2, { roughness: 0.62, metalness: 0.02 }), W, D);
    ctx.ceiling(M.std('pubCeil', { color: '#5a4038', roughness: 1 }), W, D, H);
    const wallX = M.tex('pubWallX', tex.wallPaint('#ecc79c'), W / 4, H / 3, { roughness: 0.92 });
    const wallZ = M.tex('pubWallZ', tex.wallPaint('#ecc79c'), D / 4, H / 3, { roughness: 0.92 });
    const evZ = [-1.6, 1.6];
    ctx.wall('x', -hd, -1, -hw - 0.2, hw + 0.2, H, wallX);
    ctx.wall('x', hd, 1, -hw - 0.2, hw + 0.2, H, wallX);
    ctx.wall('z', -hw, -1, -hd, hd, H, wallZ, evZ.map((z) => ({ a0: z - 0.5, a1: z + 0.5, top: 2.1 })));
    ctx.wall('z', hw, 1, -hd, hd, H, wallZ);
    // dark wood wainscot + rail all round (gaps at the elevator doors); karaoke corner gets purple panels
    const wain = M.tex('pubWain', tex2.darkWood(), 6, 1, { roughness: 0.7, color: '#b98a66' });
    const rail = M.std('pubRail', { color: '#6a3f24', roughness: 0.55 });
    const purple = M.std('pubKWall', { color: '#5b3d86', roughness: 0.85 });
    const band = (x0, x1, z0, z1) => {
      const w = Math.max(0.02, x1 - x0), d = Math.max(0.02, z1 - z0);
      ctx.box(w, 1.0, d, wain, (x0 + x1) / 2, 0, (z0 + z1) / 2, { cast: false });
      ctx.box(w + (w > d ? 0 : 0.02), 0.06, d + (d > w ? 0 : 0.02), rail, (x0 + x1) / 2, 1.0, (z0 + z1) / 2, { cast: false });
    };
    band(-hw, hw, -hd + 0.002, -hd + 0.022);
    band(-hw, hw, hd - 0.022, hd - 0.002);
    for (const [z0, z1] of [[-hd, -2.1], [-1.1, 1.1], [2.1, hd]]) band(-hw + 0.002, -hw + 0.022, z0, z1);
    band(hw - 0.022, hw - 0.002, -hd, hd);
    ctx.box(8.6, H - 1.06, 0.02, purple, 8.7, 1.06, -hd + 0.012, { cast: false });
    ctx.box(0.02, H - 1.06, 8.4, purple, hw - 0.012, 1.06, -4.8, { cast: false });
    // ceiling: wooden beams + a warm cove strip along the long walls (emissive → bloom)
    const beam = M.std('pubBeam', { color: '#4a2e20', roughness: 0.8 });
    for (let x = -10.5; x <= 10.6; x += 3.5) ctx.box(0.22, 0.2, D, beam, x, H - 0.2, 0, { cast: false });
    const cove = M.std('pubCove', { color: '#fff0d8', emissive: '#ffc98a', emissiveIntensity: 1.6, roughness: 0.4 });
    for (const z of [-hd + 0.06, hd - 0.06]) ctx.box(W - 0.4, 0.05, 0.06, cove, 0, H - 0.32, z, { cast: false });
    // pendant lamps over the aisles
    for (const x of [-9.0, -5.2, -1.4]) for (const z of [-3.7, 3.1]) ctx.decorProp('pendantLamp', x, 2.16, z, 0, {}, { cast: false });
    // light: three warm pools + the mirror ball's colour spot (≤ 4 point lights)
    ctx.light(-5.2, 2.55, -3.6, { color: '#ffc480', intensity: 7.5, distance: 10 });
    ctx.light(-5.2, 2.55, 3.4, { color: '#ffc480', intensity: 7.5, distance: 10 });
    ctx.light(8.4, 2.5, 4.4, { color: '#ffd59a', intensity: 6.5, distance: 8.5 });
    const ball = ctx.light(10.4, 2.0, -4.3, { color: '#ff5fd0', intensity: 7, distance: 7.5 });
    A.mbLight = ball;
    ctx.animate((dt, t) => { if (!ball.userData.off) ball.color.setHSL((t * 0.07) % 1, 0.8, 0.62); });
    // sprinklers + fire bell (shared toy)
    for (const x of [-9, -3, 3, 9]) for (const z of [-3.2, 3.2]) ctx.prop('sprinkler', x, z);
    ctx.prop('alarmBell', 1.6, -hd, 0, { y: 1.25 });

    // ---------------- grill tables (hold-E flips them), stools, smoke hoods, bottles
    const stool = (x, z, col, k) => ctx.prop('stool', x, z, k * 0.7, col === RED ? {} : { color: col });
    const dressTable = (x, z) => {
      ctx.prop('grilltable', x, z, 0);
      ctx.prop('smokeHood', x, z);
      const at = (a, r) => [x + Math.cos(a) * r, z + Math.sin(a) * r];
      for (const a of [1.6, 3.55]) { const [bx, bz] = at(a, 0.3); ctx.prop('bottle', bx, bz, a, { y: 0.705 }); }
      const [mx, mz] = at(4.55, 0.3); ctx.prop('beerMug', mx, mz, 0.4, { y: 0.705 });
    };
    NORTH.forEach(([x, z], i) => {
      dressTable(x, z);
      ctx.prop('boothSeat', x, -hd + 0.32, 0, { w: 2.4, noCast: true });
      [[STOOL_R, 0], [-STOOL_R, 0], [0, STOOL_R]].forEach(([dx, dz], k) => stool(x + dx, z + dz, RED, i + k));
      for (const dx of [-0.7, 0.05, 0.75]) ctx.prop('bottle', x + dx, -hd + 0.1, 0, { y: 1.14 }); // on the booth's back ledge
    });
    dressTable(HEAD[0], HEAD[1]);
    [[STOOL_R, 0], [0, STOOL_R], [-STOOL_R, 0]].forEach(([dx, dz], k) => stool(HEAD[0] + dx, HEAD[1] + dz, RED, k)); // north side: the boss stands
    SOUTH.forEach(([x, z], i) => {
      dressTable(x, z);
      [[STOOL_R, 0], [-STOOL_R, 0], [0, STOOL_R], [0, -STOOL_R]].forEach(([dx, dz], k) => stool(x + dx, z + dz, TEAL, i + k));
    });
    ctx.prop('neonSign', -7.2, -hd, 0, { text: '회식', color: '#ff4fa0', y: 1.62, h: 0.72 });
    ctx.prop('banner', -5.2, hd, PI, { y: 2.12, text: '오늘은 부장님이 쏜다!', w: 3.4, h: 0.5 });
    ctx.prop('apronRack', -12.3, 7.7, PI / 2);

    // ---------------- counter (owner), soju fridge, back bar, menu board
    ctx.prop('cafeCounter', 8.6, 6.3, PI, { w: 3.4, noCast: true, name: '고깃집 카운터' });
    const cy = 1.05;
    ctx.dynProp('pos', 8.0, cy, 6.25, PI + 0.25);
    ctx.dynProp('cupStack', 9.45, cy, 6.32, 0);
    for (const [x, z] of [[7.05, 6.2], [7.2, 6.36], [10.05, 6.22]]) ctx.prop('bottle', x, z, x, { y: cy });
    ctx.prop('beerMug', 10.3, 6.35, 0.6, { y: cy });
    ctx.prop('beerMug', 6.85, 6.42, 2.1, { y: cy });
    const wood = M.std('pubShelf', { color: '#6a3f24', roughness: 0.6 });
    ctx.box(3.2, 0.04, 0.26, wood, 8.6, 1.42, hd - 0.13, { cast: false });
    ctx.box(3.2, 0.04, 0.26, wood, 8.6, 1.82, hd - 0.13, { cast: false });
    for (let i = 0; i < 7; i++) ctx.decorProp('bottle', 7.25 + i * 0.42, 1.46, hd - 0.14, i, {}, { cast: false });
    for (let i = 0; i < 6; i++) ctx.decorProp('bottle', 7.45 + i * 0.42, 1.86, hd - 0.14, i, {}, { cast: false });
    const menu = new ctx.THREE.Mesh(new ctx.THREE.PlaneGeometry(2.6, 0.72), M.std('pubMenu', { map: menuTex(ctx), roughness: 0.8, emissive: '#ffffff', emissiveMap: menuTex(ctx), emissiveIntensity: 0.35 }));
    menu.position.set(8.6, 2.42, hd - 0.015); menu.rotation.y = PI; ctx.add(menu);
    ctx.prop('sojuFridge', hw - 0.33, 3.3, -PI / 2, { tag: 'sojuFridge', noCast: true });
    ctx.prop('tv', 4.1, hd - 0.45, PI - 0.35);
    ctx.prop('apronRack', 11.9, 8.35, PI);
    ctx.prop('extinguisher', 12.7, 5.3, -PI / 2);

    // ---------------- 노래방 corner: purple floor, booths, three machines, mirror ball, tambourines
    ctx.decal(8.75, -5.0, 8.3, 7.6, { map: danceTex(ctx), key: 'pubDance' });
    KZ.forEach((z, i) => ctx.prop('karaoke', hw - 0.3, z, -PI / 2, { tag: 'karaoke' + (i + 1) }));
    ctx.prop('neonSign', hw, -5.0, -PI / 2, { text: '노래방', color: '#3fe0ff', y: 1.98, h: 0.72 });
    ctx.prop('neonSign', 8.6, -hd, 0, { text: '2차', color: '#ffd23a', y: 1.6, h: 0.72 });
    for (const z of [-6.6, -3.4]) ctx.prop('boothSeat', 7.3, z, PI / 2, { w: 2.0, noCast: true });
    // low glossy noraebang tables (solid decor, not flippable → E on a tambourine always means 들기)
    const kTop = M.std('pubKTable', { color: '#1d1a24', roughness: 0.25, metalness: 0.1 });
    const kEdge = M.std('pubKEdge', { color: '#ff5fb0', emissive: '#ff3fa0', emissiveIntensity: 0.9, roughness: 0.4 });
    for (const z of [-6.6, -3.4]) {
      ctx.box(0.66, 0.4, 1.15, kTop, 8.95, 0, z, { collide: true });
      ctx.box(0.68, 0.04, 1.17, kEdge, 8.95, 0.345, z, { cast: false });
      ctx.prop('tambourine', 8.9, z - 0.27, 0.3, { y: 0.4 });
      ctx.prop('tambourine', 9.0, z + 0.12, 1.9, { y: 0.4 });
      ctx.prop('bottle', 8.82, z + 0.43, 0, { y: 0.4 });
    }
    ctx.prop('mirrorball', 10.4, -4.3, 0, { tag: 'mirrorball' });
    ctx.box(0.012, 0.18, 0.012, M.std('pubWire', { color: '#9aa0a7', metalness: 0.6, roughness: 0.4 }), 10.4, H - 0.18, -4.3, { cast: false });

    // ---------------- elevators (west wall, facing +x), plants, extinguisher
    evZ.forEach((z, i) => ctx.elevator(-hw, z, PI / 2, 'B1', i));
    ctx.decorProp('floorSign', -hw + 0.015, 1.55, 0, PI / 2, { text: 'B1', h: 0.42, color: '#f6ead8' });
    ctx.prop('plantBig', -12.4, -5.7);
    ctx.prop('plantBig', -12.4, 5.6);
    ctx.prop('plantBig', 3.3, -8.4);
    ctx.prop('plantBig', 2.6, 8.4);
    ctx.prop('plant', 6.3, 8.5);
    ctx.prop('extinguisher', -12.8, 3.9, PI / 2);

    // ---------------- people (story pre-dinner: only the owner is here — see hooks.onEnter)
    const face = (dx, dz) => Math.atan2(-dx, -dz);
    ctx.npc('boss', HEAD[0] - 0.1, HEAD[1] - 0.98, { rotY: -0.55, anim: 'talk', face: 'smug', role: 'boss',
      lines: ['자, 다들 한 잔씩 받아!', '내가 신입 때는 말이야~', '오늘은 내가 쏜다! …1/N로.'] });
    ctx.npc('glasses', HEAD[0] + STOOL_R, HEAD[1], { rotY: face(STOOL_R, 0), anim: 'sit', face: 'smile', role: 'worker', rank: 'mid', variantSeed: 92, lines: ['하하… 네, 부장님 최고세요…', '(웃는 얼굴 유지…)'] });
    ctx.npc('workerF1', HEAD[0], HEAD[1] + STOOL_R, { rotY: face(0, STOOL_R), anim: 'sit', face: 'sleepy', role: 'worker', variantSeed: 91, lines: ['내일 아홉 시 출근인데…', '고기 언제 다 익어요…'] });
    ctx.npc('workerM2', SOUTH[0][0] + STOOL_R, SOUTH[0][1], { rotY: face(STOOL_R, 0), anim: 'sit', face: 'endure', role: 'worker', variantSeed: 93, lines: ['부장님 18번 또 나오겠다…'] });
    ctx.npc('chubby', SOUTH[1][0], SOUTH[1][1] - STOOL_R, { rotY: face(0, -STOOL_R), anim: 'sit', face: 'sleepy', role: 'worker', variantSeed: 94, lines: ['고기 한 판 더 시켜도 되나…'] });
    ctx.npc('workerF2', -2.7, 3.4, { rotY: 2.5, anim: 'phone', face: 'normal', role: 'worker', variantSeed: 95, lines: ['1/N이면 얼마지…', '택시 잡아야 하는데…'] });
    ctx.npc('barista', 8.6, 7.45, { rotY: PI, anim: 'idle', face: 'smile', role: 'owner', variantSeed: 96,
      look: { apron: '#c8372b', shirt: '#f4efe6', hair: '#3a2a22' },
      lines: ['고기 더 드려요?', '불판 갈아 드릴게요~', '노래방은 저쪽이에요!'] });

    // ---------------- anchors
    ctx.spawn(-10.6, 0, PI / 2);
    ctx.anchor('karaokeTest', 11.55, -5.0);
    ctx.anchor('ownerKaraoke', 11.2, -3.55);
    ctx.hide(-12.2, -7.6); ctx.hide(12.2, 0.4); ctx.hide(5.2, 7.6); ctx.hide(-12.2, 8.2);
    A.titleCam = { pos: V(-9.6, 2.3, 3.4), look: V(-5.0, 0.9, -0.6) };
  },

  challenges: [
    { id: 'b1', text: '회식 테이블 5번 엎기', kind: 'flip', type: 'grilltable', n: 5, bonus: 80000 },
    { id: 'b2', text: '소주 냉장고 깨기', kind: 'break', tag: 'sojuFridge', bonus: 80000 },
    { id: 'b3', text: '술병 20병 깨기', kind: 'break', type: 'bottle', n: 20, bonus: 60000 },
    { id: 'b4', text: '노래방 기계 3대 부수기', kind: 'break', type: 'karaoke', n: 3, bonus: 80000 },
    { id: 'b5', text: '미러볼 떨어뜨리기', kind: 'hit', type: 'mirrorball', bonus: 50000 },
    { id: 'b6', text: '탬버린으로 20번 때리기', kind: 'weapon', type: 'tambourine', n: 20, bonus: 60000 },
  ],

  // story: after B2's 3:00 car, before 퇴근 5분 전 — the boss springs a team dinner on everyone
  scene: {
    id: 'pubBooking', time: '오후 4:40', title: '회식 장소 예약', sub: '“분위기 좀 봐 둬”',
    start: { floor: 'office', seat: 'playerSeat', preset: 'day', music: 'office', stress: 56 },
    steps: [
      { mission: { title: '회식 장소 예약', sub: '7층 · 오후 4:40', quote: '오늘 저녁 깜짝 회식이다!' } },
      { tasks: ['B1 고깃집 가기', '단체석 예약하기', '노래방 기계 틀어 보기'] },
      { wait: 0.6 },
      { sub: ['부장', '자, 다들 주목! 오늘 저녁 깜짝 회식이다~ 빠지는 사람 없지?', 3000], sfx: 'mumbleLow' },
      { wait: 2.9 },
      { sub: ['부장', '김 대리, B1 고깃집 가서 자리 잡고 분위기 좀 봐 둬!', 3000], sfx: 'mumbleLow' },
      { wait: 2.8 },
      { unseat: true },
      { stress: 3, face: ['endure', 1.2], toast: '엘리베이터를 타고 B1로' },
      { goto: 'pub' },
      { done: 0, mission: { title: '회식 장소 예약', sub: 'B1 · 오후 4:45', quote: '오늘 저녁 깜짝 회식이다!' } },
      { say: ['owner', '어서 와요~ 오늘 저녁 예약이요?', 2.6] },
      { hold: { who: 'owner', text: '단체석 예약하기', sec: 1.0 } },
      { say: ['owner', '열두 명? 안쪽 큰 테이블 붙여 줄게요~', 2.8], sfx: 'register', done: 1 },
      { wait: 2.6 },
      { say: ['owner', '근데 노래방 기계가 좀 이상해. 한번 틀어 봐 줄래요?', 3.0] },
      { npc: { who: 'owner', walk: 'ownerKaraoke', speed: 1.5, anim: 'walk' } },
      { wait: 1.0 },
      { hold: { tag: 'karaoke2', at: 'karaokeTest', text: '노래방 기계 켜기', sec: 1.5 } },
      { sfx: 'fanfare', sub: ['나', '(…아, 아. 마이크 테스트. 하나, 둘.)', 2400], done: 2 },
      { wait: 1.2 },
      { say: ['owner', '오, 100점! 소리 좋네~', 2.4] },
      { wait: 2.8 },
      { sub: ['부장 (전화)', '김 대리~ 자리 잡았지? 노래는 자네가 먼저 하는 걸로!', 3200], sfx: 'mumbleLow', face: ['endure', 2] },
      { wait: 3.3 },
      { sub: ['부장 (전화)', '아, 그리고 오늘은 1/N이야~ 하하!', 2800], sfx: 'mumbleLow' },
      { stress: 8, face: ['endure', 2.5], sfx: 'sigh' },
      { wait: 4.2 },
    ],
  },

  hooks: {
    // before the dinner (story, no rampage) the pub is empty except for the owner; the team shows up later
    onEnter(game) {
      const early = game.mode === 'story' && !game.rampage;
      for (const n of game.npcs()) {
        if (n.role === 'owner' || n.role === 'walker') continue;
        if (early && !n.gone) { n._pubHidden = true; n.gone = true; setVis(n, false); }
        else if (!early && n._pubHidden) { n._pubHidden = false; n.gone = false; setVis(n, true); }
      }
    },
    // the mirror ball's colour spot follows the ball down and dies out once it has been knocked loose
    onTick(game, dt) {
      const F = game.F, l = F && F.anchors.mbLight;
      if (!l || l.intensity <= 0) return;
      const r = game.rec('mirrorball');
      if (r && r.fixed && !r.destroyed) return;
      l.userData.off = true;
      if (r) l.position.set(r.body.position.x, r.body.position.y + 0.4, r.body.position.z);
      l.color.set('#ff8ad8');
      l.intensity = Math.max(0, l.intensity - dt * 10);
    },
    onDestroy(game, rec) {
      if (rec.tag === 'sojuFridge') { const o = game.npc('owner'); if (o && !o.gone) game.say(o, '내 소주!!', 2.4); }
    },
  },
};

function setVis(n, v) {
  if (n.group) n.group.visible = v;
  if (n.char && n.char.group) n.char.group.visible = v;
}

// ---------------- canvas textures (cached through ctx.canvasTex)
function danceTex(ctx) {
  return ctx.canvasTex('pubDance', 512, 470, (x, w, h) => {
    x.fillStyle = '#3a2350'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,120,210,0.55)'; x.lineWidth = 8; x.strokeRect(10, 10, w - 20, h - 20);
    x.strokeStyle = 'rgba(120,230,255,0.35)'; x.lineWidth = 3; x.strokeRect(26, 26, w - 52, h - 52);
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      x.fillStyle = ['rgba(255,220,120,0.55)', 'rgba(255,140,220,0.45)', 'rgba(140,230,255,0.45)'][i % 3];
      const cx = 30 + r() * (w - 60), cy = 30 + r() * (h - 60), k = 3 + r() * 5;
      x.beginPath(); for (let j = 0; j < 8; j++) { const a = j * PI / 4, q = j % 2 ? k * 0.4 : k; x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } x.closePath(); x.fill();
    }
  });
}
function menuTex(ctx) {
  return ctx.canvasTex('pubMenu', 720, 200, (x, w, h) => {
    x.fillStyle = '#2b1d16'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#d9a93a'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#ffe2a8'; x.textBaseline = 'middle'; x.textAlign = 'center';
    x.font = `bold 44px ${ctx.KFONT}`; x.fillText('오늘의 메뉴', w / 2, 46);
    x.font = `bold 30px ${ctx.KFONT}`;
    [['삼겹살', '15,000'], ['목살', '15,000'], ['된장찌개', '7,000'], ['소주 · 맥주', '5,000']].forEach(([n, p], i) => {
      const cx = 100 + i * 175;
      x.fillStyle = '#fff4e0'; x.fillText(n, cx, 112); x.fillStyle = '#ffb347'; x.fillText(p, cx, 156);
    });
  });
}
