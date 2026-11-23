// 밖 · 회사 앞 거리 — the street in front of the tower. Not an elevator stop: you walk out through the lobby's
// revolving door (spec.portals, handled in main.js) and back in through the same door. Our tower's glass ground
// floor + entrance canopy (company name letters on top, knocked down by shaking a canopy post or by throwing
// things) on the north edge, a paved plaza with a fountain, then the kerb, a two-lane road with a zebra crossing,
// parked cars (사장님 차 out front), a city bus at its stop, the far pavement with a 포장마차 and a coffee kiosk,
// and a row of shop fronts as the backdrop. Open sky (tex2 panorama), sun shadows, soft invisible bounds.
// Contract: js/floors/README.md (reference floor: parking.js).
const PI = Math.PI;

// layout (metres): x east, z south. Bounds ±20 × ±13.
const W = 40, D = 26, H = 7;           // H = physics lid / camera ceiling (open air)
const HW = W / 2, HD = D / 2;
const FACADE = -12.4;                  // our tower's glass front (north)
const SHOPS = 10.6;                    // shop fronts across the road (south)
const KERB_N = -2.3, KERB_S = 6.3;     // road between the two kerbs
const CROSS = [8.4, 11.6];             // zebra crossing (x range)
const COMPANY = '가족같은회사';

// module state shared by the hooks (one street per session; rebuilt when the floors are disposed)
let skyMesh = null, MK = null, THREE_ = null;
const SKYMAT = {};
const WRECK_MAT = new Map();
const SMALL = { noCast: true }; // small street furniture: no shadow pass (draw-call budget)
let windT = 3, burst = [];

export default {
  id: 'street', label: '밖', key: null, name: '회사 앞 거리', sub: '회전문 밖, 회사 정문 앞',
  outside: true,                        // not an elevator stop (level.js keeps it out of the panel)
  size: { w: W, d: D, h: H },
  // open air: the time of day with a far haze; the sun comes from the south-east so the tower front is lit
  light: (t) => (t === 'sunset'
    ? { preset: 'sunset', sunDir: [0.85, 0.32, 0.6], fog: '#e7a98f', fogNear: 40, fogFar: 140 }
    : { preset: t === 'noon' ? 'noon' : 'day', sunDir: [0.42, 0.78, 0.55], fog: '#d9e8f4', fogNear: 40, fogFar: 150, hemiI: 1.05, env: 0.42 }),
  music: 'lobby', stepSfx: 'step',
  // walk into the revolving door → back to the lobby. box = trigger [x0, z0, x1, z1], enter = the direction you
  // have to be walking, out = where you appear when you come OUT here [x, z, yaw], walk = auto step-out target,
  // cam = [yaw offset from the player, pitch] for the first look (facing the tower, then it swings behind you)
  portals: [{ to: 'lobby', box: [-1.15, -11.2, 1.15, -10.6], enter: [0, -1], out: [0, -10.35, 0], walk: [0, -8.3], cam: [PI - 0.7, -0.04] }],

  build(ctx) {
    const { M, tex2, V, THREE } = ctx;
    const A = ctx.anchors;
    MK = ctx.makeProp; THREE_ = THREE; burst = [];

    // ---------------- ground: plaza + far pavement (paving), road (asphalt), kerbs, markings. The planes run far
    // past the bounds (±60 m) so the street keeps going into the haze.
    const L = 120;
    const pave = M.tex('streetPave', tex2.pavingStone(), L / 2.4, 5, { roughness: 0.85 });
    const pave2 = M.tex('streetPave2', tex2.pavingStone(), L / 2.4, 4.6, { roughness: 0.85, color: '#efe6dc' });
    const road = M.tex('streetRoad', tex2.asphalt(), L / 4, 2.2, { roughness: 0.92 });
    ctx.floor(pave, L, KERB_N - FACADE, 0, (KERB_N + FACADE) / 2);
    ctx.floor(road, L, KERB_S - KERB_N, 0, (KERB_N + KERB_S) / 2);
    ctx.floor(pave2, L, 30 - KERB_S, 0, (KERB_S + 30) / 2);
    const kerbM = M.std('kerb', { color: '#d4d0c8', roughness: 0.8 });
    ctx.box(L, 0.13, 0.28, kerbM, 0, 0, KERB_N - 0.02, { cast: false });
    ctx.box(L, 0.13, 0.28, kerbM, 0, 0, KERB_S + 0.02, { cast: false });
    const white = { color: '#f4f3ee', key: 'roadWhite' }, yellow = { color: '#f2c21b', key: 'roadYellow' };
    for (const z of [1.92, 2.08]) ctx.decal(0, z, L, 0.1, yellow);
    ctx.decal(0, KERB_N + 0.35, L, 0.12, white); ctx.decal(0, KERB_S - 0.35, L, 0.12, white);
    for (let z = KERB_N + 0.6; z < KERB_S - 0.4; z += 0.9) ctx.decal((CROSS[0] + CROSS[1]) / 2, z, CROSS[1] - CROSS[0], 0.45, white);
    ctx.decal(CROSS[1] + 1.0, (KERB_N + 2.0) / 2, 0.4, 2.0 - KERB_N - 0.5, white);
    ctx.decal(CROSS[0] - 1.0, (2.0 + KERB_S) / 2, 0.4, KERB_S - 2.0 - 0.5, white);
    // bus bay box + "버스" on the road
    ctx.decal(-6.5, KERB_S - 1.2, 11.5, 1.9, { map: busBayTex(ctx), key: 'busBay' });
    // tactile paving (yellow) at the crossing landings
    for (const z of [KERB_N - 0.55, KERB_S + 0.55]) ctx.decal((CROSS[0] + CROSS[1]) / 2, z, CROSS[1] - CROSS[0], 0.5, { map: tactileTex(ctx), key: 'tactile' });

    // ---------------- our tower (north): glass ground floor + entrance canopy + facade rising out of view
    buildTower(ctx);
    // the revolving door (same prop as the lobby, spun faster while you go through it — main.js → doorSpin)
    const rd = ctx.liveProp('revolvingDoor', 0, 0, FACADE);
    ctx.rect(0, FACADE, 1.15, 1.15, 0, 2.4);
    const spin = A.doorSpin = { a: 0, k: 0.35 };
    ctx.animate((dt) => { spin.a += dt * spin.k; rd.set(spin.a); });
    A.door = V(0, 0, -10.6); A.doorDir = V(0, 0, 1); // people fleeing inside run −z through the door
    // canopy: slab on two posts; the company name stands on its front edge (hung → drops when hit / shaken)
    const steel = M.std('canopySteel', { color: '#3c4a56', roughness: 0.45, metalness: 0.4 });
    ctx.box(7.4, 0.26, 2.9, steel, 0, 3.08, FACADE + 1.42, { cast: true });
    ctx.box(7.0, 0.04, 2.6, M.std('canopyLight', { color: '#fff6dc', emissive: '#ffe2a6', emissiveIntensity: 1.2 }), 0, 3.04, FACADE + 1.42, { cast: false });
    ctx.F.bodies.push({ x: 0, y: 3.21, z: FACADE + 1.42, hx: 3.7, hy: 0.13, hz: 1.45, rot: 0 });
    for (const sx of [-1, 1]) ctx.box(0.22, 3.08, 0.22, steel, sx * 3.2, 0, FACADE + 2.6, { collide: true });
    A.posts = [V(-3.2, 0, FACADE + 2.6), V(3.2, 0, FACADE + 2.6)];
    [...COMPANY].forEach((ch, i) => ctx.prop('logoLetter', -2.65 + i * 1.06, FACADE + 2.45, 0, { char: ch, h: 0.88, color: i % 2 ? '#2f6fd6' : '#d8352a', y: 3.34, as: 'hang', tag: 'sign' + i, noCast: true }));
    ctx.npc('workerM1', 2.25, FACADE + 1.75, { rotY: 0.25, anim: 'armsCrossed', role: 'guard', face: 'normal', variantSeed: 301,
      look: { suit: '#27324a', pants: '#27324a', shirt: '#dfe6ee', tie: '#1b1f2a', lanyard: false, glasses: false },
      lines: ['출입증 꼭 찍고 들어가세요~', '오늘도 무사고 근무!', '회전문 천천히 미세요'] });

    // ---------------- plaza: pylon, flags, smoking booth, fountain + benches, planters, bins
    ctx.prop('infoPylon', 5.3, FACADE + 2.3, -0.25, { hp: 4, noCast: true });
    [['#d8352a', 8.0], ['#2f74d0', 10.4], ['#efb51f', 12.8]].forEach(([c, x]) => {
      const sp = ctx.prop('flagpole', x, FACADE + 1.0, 0, { color: c, solid: false });
      ctx.collider(x - (sp.prop.size.x / 2 - 0.17), FACADE + 1.0, 0.17, 0.17, 7.3);
    });
    ctx.prop('smokeBooth', 17.3, FACADE + 1.7, 0, { hp: 5 });
    ctx.prop('fountain', -8, -7.4, 0, { hp: 6, noCast: false });
    ctx.prop('bench', -8, -4.75, PI);
    ctx.prop('bench', -11.6, -7.4, PI / 2);
    ctx.prop('bench', -4.4, -7.4, -PI / 2);
    for (const [x, z, r] of [[-16.6, -10.4, 0], [-13.2, -11.4, 0], [5.4, -6.4, 0], [9.8, -6.4, 0], [15.4, -6.4, 0]]) ctx.prop('planterBox', x, z, r, { hp: 3 });
    ctx.prop('streetBin', -4.6, FACADE + 1.25, 0, SMALL);
    ctx.prop('streetBin', 12.6, -3.75, PI, SMALL);
    ctx.prop('scooter', -16.4, -5.0, 0.8);
    ctx.prop('kickboard', 17.2, -3.95, -0.4, SMALL);
    ctx.prop('kickboard', 18.1, -4.15, -0.55, SMALL);
    ctx.prop('cone', -1.6, FACADE + 2.2);

    // ---------------- near kerb: bollards, lamps, trees, hydrant, the boss's car with its chauffeur
    for (const x of [-18.6, -15.2, -11.8, -5.0, 4.6, 7.4, 12.6, 15.6, 18.8]) ctx.prop('bollard', x, -3.0, 0, SMALL);
    for (const x of [-11.2, 2.7, 13.8]) ctx.prop('streetLamp', x, -3.25, 0, { hp: 3 });
    for (const x of [-17.2, -6.2, 6.0, 17.2]) tree(ctx, x, -3.75);
    ctx.prop('fireHydrant', -2.9, -3.15, 0, { tag: 'hydrantN', noCast: true });
    ctx.prop('trafficLight', CROSS[0] - 0.6, -3.15, 0, { hp: 4, noCast: true });
    ctx.prop('car', 0.2, -1.05, -PI / 2, { boss: true, tag: 'bossCar' });
    ctx.npc('glasses', -1.6, -3.05, { rotY: 0.3, anim: 'idle', role: 'chauffeur', face: 'normal', variantSeed: 303,
      look: { suit: '#1e2026', pants: '#1e2026', shirt: '#f4f2ec', tie: '#1b1c20', lanyard: false },
      lines: ['사장님 차에 손대지 마세요!', '방금 세차했습니다…', '사장님 곧 나오십니다'] });
    ctx.prop('car', -9.6, -1.05, -PI / 2, { color: '#ecebe6', plate: '34나 5678' });

    // ---------------- the road: taxi at the crossing, a car behind the bus, road works round a manhole
    ctx.prop('car', 15.4, 0.55, -PI / 2, { taxi: true, plate: '서울32 바 1234' });
    ctx.prop('car', -16.4, 4.35, PI / 2, { color: '#c9453a', plate: '56다 7890' });
    ctx.prop('bus', -6.5, 4.85, PI / 2, { hp: 8 });
    ctx.prop('manhole', 5.0, 4.4, 0);
    ctx.prop('barrier', 3.75, 4.4, PI / 2, SMALL);
    ctx.prop('barrier', 6.25, 4.4, -PI / 2, SMALL);
    for (const [x, z] of [[5.0, 3.15], [4.0, 5.6], [6.0, 5.6], [5.0, 5.75]]) ctx.prop('cone', x, z);

    // ---------------- far pavement: bus stop (+ waiting people), 포장마차, coffee kiosk, post box, rider
    ctx.prop('busStop', -6.5, 7.55, PI, { hp: 6 });
    ctx.npc('workerF2', -7.7, 6.75, { rotY: PI, anim: 'phone', role: 'waiting', variantSeed: 304, lines: ['707번 언제 와…', '오늘 야근 없겠지?'] });
    ctx.npc('chubby', -4.9, 6.8, { rotY: PI + 0.3, anim: 'lookUp', role: 'waiting', face: 'sleepy', variantSeed: 305, lines: ['버스 놓치면 지각인데…'] });
    for (const x of [-17.6, -1.6, 6.3, 17.6]) tree(ctx, x, 7.05);
    for (const x of [-12.8, 1.2, 13.6]) ctx.prop('streetLamp', x, 6.8, PI, { hp: 3 });
    ctx.prop('trafficLight', CROSS[1] + 0.6, 6.9, PI, { hp: 4, noCast: true });
    ctx.prop('foodCart', 3.0, 8.95, PI, { hp: 5 });
    for (const x of [2.1, 3.0, 3.9]) ctx.prop('stool', x, 7.55, 0, { color: '#d8352a', noCast: true });
    ctx.npc('barista', 1.2, 8.55, { rotY: PI + 0.5, anim: 'offer', role: 'vendor', face: 'smile', variantSeed: 306,
      look: { apron: '#d8352a', shirt: '#f4ead8', hair: '#3b2620' },
      lines: ['떡볶이 1인분 삼천 원~', '어묵 국물은 공짜예요!', '퇴근하고 들러요~'] });
    ctx.prop('kiosk', 15.9, 9.05, PI, { hp: 5 });
    ctx.prop('mailbox', -2.6, 7.1, PI, SMALL);
    ctx.prop('flyerStand', -3.45, 7.1, PI, SMALL);
    ctx.prop('fireHydrant', 8.2, 6.95, PI, { tag: 'hydrantS', noCast: true });
    ctx.prop('streetBin', 11.0, 7.05, PI, SMALL);
    ctx.prop('scooter', 9.6, 9.0, -2.5);
    ctx.npc('workerM2', 8.5, 9.2, { rotY: 2.5, anim: 'phone', role: 'rider', variantSeed: 308,
      look: { shirt: '#2f74d0', pants: '#2b2d31', tie: null, lanyard: false },
      lines: ['배달 왔습니다~', '아 콜이 안 잡히네', '여기 주차 잠깐만요!'] });
    ctx.prop('kickboard', -14.6, 8.7, 0.4, SMALL);
    ctx.prop('kickboard', -15.5, 8.8, 0.5, SMALL);
    ctx.prop('planterBox', -10.8, 9.5, 0, { hp: 3 });
    ctx.prop('bench', -13.0, 9.5, PI);

    // ---------------- pedestrians (main.js walks them along their beat via hooks.onTick until they panic)
    ctx.npc('workerF1', -15, -5.6, { rotY: PI / 2, anim: 'walk', role: 'ped', variantSeed: 311, px0: -17, px1: 16, pz: -5.6, lines: ['오늘 점심 뭐 먹지?', '날씨 좋다~'] });
    ctx.npc('workerF2', 4, 9.6, { rotY: PI / 2, anim: 'walk', role: 'ped', variantSeed: 313, px0: -18, px1: 18, pz: 9.6, lines: ['은행잎 진짜 예쁘다', '저기 포장마차 맛있대'] });

    // ---------------- shops across the road + the neighbours on our side
    shopRow(ctx);
    // ---------------- the city around: neighbouring facades along the street, skyline, sky panorama
    city(ctx);
    sky(ctx);

    // ---------------- soft bounds: tall invisible walls at the ends of the street (props bounce back)
    for (const s of [-1, 1]) ctx.collider(s * (HW + 0.3), 0, 0.3, HD, H);
    ctx.collider(0, HD + 0.3, HW, 0.3, H);

    // ---------------- anchors: free-mode start (diagonal: tower on the left, street ahead), hiding spots, exits
    ctx.spawn(-5.2, -8.0, 1.1);
    ctx.hide(-10.9, -9.4); ctx.hide(-13.6, -8.8); ctx.hide(14.6, -8.3); ctx.hide(-9.6, 9.6); ctx.hide(12.6, 9.7);
    A.leaves = [
      { p: V(-HW + 0.6, 0, -6.0), dir: V(1, 0, 0) }, { p: V(HW - 0.6, 0, -6.0), dir: V(-1, 0, 0) },
      { p: V(-HW + 0.6, 0, 9.3), dir: V(1, 0, 0) }, { p: V(HW - 0.6, 0, 9.3), dir: V(-1, 0, 0) },
    ];
    A.titleCam = { pos: V(-9.5, 2.6, -2.5), look: V(1.5, 2.2, -10.5) };
  },

  challenges: [
    { id: 's1', text: '회사 간판 글자 다 떨어뜨리기', kind: 'hit', type: 'logoLetter', n: COMPANY.length, bonus: 80000 },
    { id: 's2', text: '사장님 차 폐차시키기', kind: 'carStage', tag: 'bossCar', n: 4, bonus: 100000 },
    { id: 's3', text: '소화전 터뜨리기', kind: 'break', type: 'fireHydrant', bonus: 60000 },
    { id: 's4', text: '버스 정류장 부수기', kind: 'break', type: 'busStop', bonus: 70000 },
    { id: 's5', text: '배달 스쿠터로 5번 들이받기', kind: 'ram', type: 'scooter', n: 5, bonus: 60000 },
    { id: 's6', text: '가로등 3개 쓰러뜨리기', kind: 'topple', type: 'streetLamp', n: 3, bonus: 50000 },
  ],

  hooks: {
    onEnter(game) { syncSky(game); windT = 2.5; spawnWrecks(game); },
    onTick(game, dt) {
      syncSky(game);
      // a soft gust now and then (quieter than the roof)
      windT -= dt;
      if (windT <= 0) { windT = 6 + Math.random() * 5; game.sfx('wind', { vol: 0.18 + Math.random() * 0.1, pitch: 0.9 + Math.random() * 0.25 }); }
      // pedestrians walk their beat until something scares them
      for (const n of game.npcs('ped')) {
        if (n.gone || n.panicked || n.state !== 'idle') continue;
        if ((n.waitT = (n.waitT || 0) - dt) > 0) continue;
        const s = n.spec, x = n.pos.x < (s.px0 + s.px1) / 2 ? s.px1 : s.px0;
        n.waitT = 0.6 + Math.random() * 1.2;
        game.walkNpc(n, [x, s.pz], { speed: 1.15 + Math.random() * 0.25, anim: 'walk' });
      }
      // street lamps knocked flat count as "쓰러뜨리기"
      for (const r of game.recs((q) => q.type === 'streetLamp' && !q.toppled)) {
        const q = r.body.quaternion;
        if (1 - 2 * (q.x * q.x + q.z * q.z) < 0.5) {
          r.toppled = true; game.emit('topple', r);
          game.sfx('crash', { vol: 0.7, pitch: 0.8 });
          game.fx.dustRing(new THREE_.Vector3(r.body.position.x, 0, r.body.position.z), 1.4, 12);
        }
      }
      // burst hydrants keep spraying for a while
      for (const b of burst) {
        b.t += dt;
        if (b.t > 14) continue;
        b.acc += dt;
        if (b.acc > 0.12) { b.acc = 0; game.fx.water(new THREE_.Vector3(b.x, 3.6, b.z), b.t < 4 ? 7 : 3, 1.6); }
      }
    },
    onDestroy(game, rec) {
      const t = rec.type;
      if (t === 'fireHydrant') {
        game.setState(rec, 'burst'); game.sfx('splash', { vol: 1 }); game.after(0.15, () => game.sfx('splash', { vol: 0.8, pitch: 0.7 }));
        game.fx.water(new THREE_.Vector3(rec.body.position.x, 1.2, rec.body.position.z), 60, 3.4);
        burst.push({ x: rec.body.position.x, z: rec.body.position.z, t: 0, acc: 0 });
        game.alarm(new THREE_.Vector3(rec.body.position.x, 0, rec.body.position.z), 12);
        game.toast('소화전이 터졌다! 물벼락~', 1600);
      } else if (t === 'busStop' || t === 'fountain' || t === 'smokeBooth' || t === 'bus') {
        game.setState(rec, 'broken');
        if (t === 'fountain') { game.sfx('splash', { vol: 1 }); game.fx.water(new THREE_.Vector3(rec.body.position.x, 1.4, rec.body.position.z), 70, 3); }
        if (t === 'busStop') { const n = game.npc('waiting'); if (n) game.say(n, '정류장이…! 버스 어디서 타요?!', 2.4); }
        if (t === 'bus') game.toast('시내버스 운행 중단!', 1600);
      } else if (t === 'streetLamp') {
        // a broken lamp post always comes down (away from you)
        const b = rec.body, P = game.P.pos, dx = b.position.x - P.x, dz = b.position.z - P.z, l = Math.hypot(dx, dz) || 1;
        b.wakeUp(); b.angularVelocity.set(dz / l * 3.2, 0, -dx / l * 3.2); b.velocity.x += dx / l * 1.2; b.velocity.z += dz / l * 1.2;
      } else if (t === 'kiosk' || t === 'foodCart') {
        const n = game.npc('vendor'); if (n) game.say(n, t === 'kiosk' ? '커피집까지…!' : '아이고 내 떡볶이!!', 2.4);
      }
    },
    // the company name on the canopy is out of punching reach: shake a canopy post (hold E) to bring it down
    candidate(game) {
      const A = game.F.anchors, P = game.P;
      const left = game.recs((r) => r.type === 'logoLetter' && r.fixed && /^sign/.test(r.tag || ''));
      if (!left.length || P.held) return null;
      for (let i = 0; i < A.posts.length; i++) {
        const p = A.posts[i];
        if (Math.hypot(P.pos.x - p.x, P.pos.z - p.z) > 1.25) continue;
        return { id: 'canopyPost' + i, pos: p.clone(), h: 1.9, obj: null, text: '기둥 흔들기', hold: 0.5, range: 99, onDone: () => shakeSign(game, i) };
      }
      return null;
    },
  },
};

// ---------------- the canopy post shake: the letters topple off the canopy one by one, nearest the post first
function shakeSign(game, i) {
  const p = game.F.anchors.posts[i];
  game.sfx('hitMetal', { vol: 0.9, pitch: 0.75 }); game.sfx('crash', { vol: 0.5, pitch: 1.2 });
  game.G.shake = Math.max(game.G.shake, 0.45);
  const left = game.recs((r) => r.type === 'logoLetter' && r.fixed && /^sign/.test(r.tag || ''))
    .sort((a, b) => Math.abs(a.body.position.x - p.x) - Math.abs(b.body.position.x - p.x));
  left.forEach((r, k) => game.after(0.12 + k * 0.16, () => {
    if (r.removed || !r.fixed) return;
    const d = new THREE_.Vector3((r.body.position.x - p.x) * 0.15, 0, 1).normalize();
    game.hitRec(r, 0, d, 1.4);
  }));
  game.P.char.playOnce('pull');
}

// ---------------- wreckage thrown out of the windows upstairs (main/toys keep G.outWrecks, ≤ 12 per session):
// lands on the plaza as darkened static wrecks the next time you come out here
const WRECK_SPOTS = [[-6.2, -11.0], [7.0, -10.4], [-10.6, -11.6], [13.5, -9.2], [-14.8, -8.0], [4.4, -8.8], [-5.6, -9.6], [10.8, -8.6], [-18.0, -7.2], [17.8, -8.4], [-12.2, -9.6], [15.6, -11.8]];
function spawnWrecks(game) {
  const F = game.F, list = game.G.outWrecks || [];
  F.wreckN = F.wreckN || 0;
  if (!MK || F.wreckN >= list.length) return;
  const startN = F.wreckN;
  for (; F.wreckN < list.length && F.wreckN < WRECK_SPOTS.length; F.wreckN++) {
    const w = list[F.wreckN];
    let p;
    try { p = MK(w.type, w.opts || {}); } catch (e) { continue; }
    const [x, z] = WRECK_SPOTS[F.wreckN];
    const g = p.group, k = F.wreckN * 1.7;
    g.position.set(x, 0, z);
    g.rotation.set(Math.sin(k) * 0.5, k, Math.cos(k * 1.3) * 0.6);
    // tipped over: keep it on the ground
    g.updateMatrixWorld(true);
    const box = new THREE_.Box3().setFromObject(g);
    g.position.y -= box.min.y;
    g.traverse((m) => {
      if (!m.isMesh || !m.material || Array.isArray(m.material)) return;
      let d = WRECK_MAT.get(m.material);
      if (!d) { d = m.material.clone(); if (d.color) d.color.multiplyScalar(0.55); WRECK_MAT.set(m.material, d); }
      m.material = d; m.castShadow = true;
    });
    F.group.add(g);
  }
  if (F.wreckN > startN) game.after(0.8, () => game.toast('위층에서 던진 물건들이 광장에 널브러져 있다', 2200));
}

// ---------------- builders
function tree(ctx, x, z) {
  ctx.prop('streetTree', x, z, x * 0.7, { solid: false });
  ctx.collider(x, z, 0.16, 0.16, 2.5);
}
function buildTower(ctx) {
  const { M } = ctx;
  const G0 = 4.6; // glass ground floor height
  // interior seen through the glass (warm lobby glow)
  const inT = ctx.canvasTex('streetLobbyIn', 512, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d9c7aa'); g.addColorStop(0.55, '#b59c7f'); g.addColorStop(1, '#8a7a6a'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,250,235,0.9)'; for (let i = 0; i < 14; i++) x.fillRect(12 + i * 36, 8, 22, 4);
    x.fillStyle = '#d9cdbf'; for (const px of [60, 200, 330, 450]) x.fillRect(px, 14, 14, h - 14);
    x.fillStyle = '#4a3a2e'; x.fillRect(20, 72, 90, 34); x.fillStyle = '#3a3c42'; x.fillRect(20, 66, 90, 8);
    x.fillStyle = '#2b2d31'; x.fillRect(380, 80, 70, 30);
    x.fillStyle = 'rgba(60,60,70,0.55)'; for (const px of [150, 250, 290, 410]) { x.beginPath(); x.arc(px, 70, 6, 0, 7); x.fill(); x.fillRect(px - 7, 77, 14, 30); }
    x.fillStyle = '#e2b43c'; x.fillRect(240, 92, 60, 14);
  });
  const inM = M.std('streetLobbyIn', { map: inT, emissive: '#ffffff', emissiveMap: inT, emissiveIntensity: 0.12, roughness: 0.9 });
  ctx.box(28, G0, 0.05, inM, 0, 0, FACADE - 0.6, { cast: false, receive: false });
  // glass front with mullions (one collider for the whole run, minus the door)
  const glass = M.glass(), alu = M.alu();
  ctx.box(12.7, G0, 0.03, glass, -7.65, 0, FACADE, { cast: false });
  ctx.box(12.7, G0, 0.03, glass, 7.65, 0, FACADE, { cast: false });
  ctx.box(2.6, G0 - 2.46, 0.03, glass, 0, 2.46, FACADE, { cast: false });
  for (let x = -14; x <= 14.01; x += 2) if (Math.abs(x) > 1.1) ctx.box(0.08, G0, 0.12, alu, x, 0, FACADE, { cast: false });
  ctx.box(28, 0.1, 0.14, alu, 0, 0, FACADE, { cast: false });
  ctx.box(2.6, 0.06, 0.12, alu, 0, 2.43, FACADE, { cast: false });
  ctx.collider(-7.65, FACADE - 0.25, 6.35, 0.3, H);
  ctx.collider(7.65, FACADE - 0.25, 6.35, 0.3, H);
  ctx.F.bodies.push({ x: 0, y: (2.4 + H) / 2, z: FACADE - 0.25, hx: 1.3, hy: (H - 2.4) / 2, hz: 0.3, rot: 0 });
  // stone band with the building name, then the curtain wall rising out of view (no shadows: it would dim the plaza)
  const band = M.std('towerBand', { color: '#e6dccb', roughness: 0.75 });
  ctx.box(28.4, 0.75, 0.5, band, 0, G0, FACADE - 0.2, { cast: false });
  const plate = ctx.canvasTex('towerPlate', 512, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = '#3c4a56'; x.font = `900 44px ${ctx.KFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('가족같은회사 타워', w / 2, h / 2 + 2); });
  const pm = M.std('towerPlate', { map: plate, transparent: true, alphaTest: 0.4, roughness: 0.6 });
  const pg = new ctx.THREE.PlaneGeometry(6.4, 0.8); const po = new ctx.THREE.Mesh(pg, pm);
  po.position.set(0, G0 + 0.38, FACADE + 0.06); ctx.add(po);
  const fac = M.tex('towerFacade', towerTex(ctx), 7, 9, { roughness: 0.35, metalness: 0.15 });
  ctx.box(28, 36, 10, fac, 0, G0 + 0.75, FACADE - 5.2, { cast: false, receive: false });
  ctx.box(28.6, 0.3, 0.6, band, 0, G0 + 0.75, FACADE - 0.05, { cast: false });
  // the neighbours inside the bounds: a bank on the left, a convenience store on the right
  placeShop(ctx, -17.1, FACADE, 0, { text: '든든 은행', color: '#2f6f7c', awning: '#2f7f8f', wall: '#e3d6c2', w: 5.8, floors: 3, kind: 'c' });
  placeShop(ctx, 17.1, FACADE, 0, { text: '24시 편의점', color: '#2f74d0', awning: '#d8352a', wall: '#efe4d2', w: 5.8, floors: 3, kind: 'a' });
}
// a shop front with its facade plane exactly on `fz` (rotY 0 faces +z, PI faces −z)
function placeShop(ctx, x, fz, rotY, o) {
  const p = ctx.makeProp('shopFront', o);
  const off = p.size.z / 2 - 0.5; // facade offset from the bounds centre
  const sp = ctx.prop('shopFront', x, rotY === 0 ? fz + off : fz - off, rotY, Object.assign({ noCast: true }, o));
  return sp;
}
function shopRow(ctx) {
  const shops = [
    ['맛나 치킨', '#d8352a', '#efe4d2', 2, 'a'], ['해바라기 빵집', '#e9a62a', '#e3d6c2', 3, 'b'], ['하늘 꽃집', '#3f9a4a', '#efe4d2', 2, 'c'],
    ['튼튼 약국', '#2f9d8f', '#e3d6c2', 2, 'a'], ['행복 분식', '#e8642c', '#e3d6c2', 3, 'b'], ['바른 부동산', '#5a4a9a', '#efe4d2', 2, 'c'],
    ['맑은 안경', '#3a6ea5', '#efe4d2', 3, 'a'], ['깨끗 세탁소', '#4aa0d8', '#e3d6c2', 2, 'b'], ['동네 미용실', '#d85a8a', '#efe4d2', 2, 'c'],
  ];
  const AWN = ['#d8352a', '#2f7f8f', '#e9a62a']; // three striped awnings for the whole row
  const w = W / shops.length;
  shops.forEach(([text, color, wall, floors, kind], i) => placeShop(ctx, -HW + w * (i + 0.5), SHOPS, PI, { text, color, awning: AWN[i % 3], wall, floors, kind, w: +(w - 0.02).toFixed(2) }));
}
function city(ctx) {
  const { M } = ctx;
  const fA = M.tex('stA', facadeTex(ctx, 'a', '#efe6d6', '#8fb0cc', '#d9cdb8'), 3, 5, { roughness: 0.8 });
  const fB = M.tex('stB', facadeTex(ctx, 'b', '#a9c4dc', '#5f88ad', '#8fb0cc'), 3, 8, { roughness: 0.35, metalness: 0.15 });
  const fC = M.tex('stC', facadeTex(ctx, 'c', '#e6c7b4', '#7f97b0', '#d2b29c'), 3, 4, { roughness: 0.85 });
  const topM = M.std('stTop', { color: '#b8bcbf', roughness: 0.95 });
  const o = { cast: false, receive: false };
  // [x, z, w, d, h, mat] — both sides of the street beyond the bounds, then a skyline behind the shops
  const B = [
    [-27, -18, 13, 12, 22, fB], [-41, -18, 14, 12, 14, fA], [-56, -18, 15, 12, 30, fB],
    [27, -18, 13, 12, 16, fA], [41, -18, 14, 12, 26, fB], [56, -18, 15, 12, 12, fC],
    [-26, 16, 12, 10, 10, fC], [-39, 16, 13, 10, 15, fA], [-54, 16, 15, 10, 9, fC],
    [26, 16, 12, 10, 13, fA], [39, 16, 13, 10, 8, fC], [54, 16, 15, 10, 18, fA],
    [-14, 30, 16, 12, 34, fB], [6, 34, 14, 12, 46, fB], [26, 32, 16, 12, 28, fA], [-34, 34, 16, 12, 24, fA], [44, 38, 14, 12, 38, fB],
    [-10, -40, 20, 16, 60, fB], [22, -44, 18, 16, 48, fB],
  ];
  for (const [x, z, w, d, h, m] of B) {
    ctx.box(w, h, d, m, x, 0, z, o);
    ctx.box(w + 0.4, 0.5, d + 0.4, topM, x, h, z, o);
  }
}
function sky(ctx) {
  const { THREE, tex2 } = ctx;
  const R = 82, HS = 90, Y0 = -20;
  const g = new THREE.CylinderGeometry(R, R, HS, 48, 1, true);
  skyMat(THREE, tex2, 'dusk');
  skyMesh = new THREE.Mesh(g, skyMat(THREE, tex2, 'day'));
  skyMesh.position.set(0, Y0 + HS / 2, 0); skyMesh.renderOrder = -1; skyMesh.userData.kind = 'day';
  skyMesh.castShadow = false; skyMesh.receiveShadow = false; skyMesh.frustumCulled = false;
  ctx.add(skyMesh, { decor: false }); ctx.dispose(g);
  // a few cartoon clouds high above the street
  [[-30, -40, 30, 6, 1], [24, -46, 34, 7, 2], [50, 10, 28, 5, 3], [-46, 24, 32, 6, 4], [4, 52, 36, 7, 5]]
    .forEach(([x, z, y, s, seed]) => ctx.prop('cloud', x, z, seed * 0.7, { y, scale: s, seed, solid: false }));
}
function skyMat(THREE, tex2, kind) {
  if (!SKYMAT[kind]) {
    const t = (kind === 'dusk' ? tex2.skyDusk() : tex2.skyDay()).clone();
    t.repeat.set(2, 1); t.needsUpdate = true;
    SKYMAT[kind] = new THREE.MeshBasicMaterial({ map: t, fog: false, side: THREE.BackSide, depthWrite: false });
  }
  return SKYMAT[kind];
}
function syncSky(game) {
  if (!skyMesh || !skyMesh.parent) return;
  const want = game.G && game.G.preset === 'sunset' ? 'dusk' : 'day';
  if (skyMesh.userData.kind === want || !SKYMAT[want]) return;
  skyMesh.material = SKYMAT[want]; skyMesh.userData.kind = want;
}
function towerTex(ctx) {
  return ctx.canvasTex('towerFacade', 256, 256, (x, w, h) => {
    x.fillStyle = '#dfe6ec'; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 2; j++) {
      x.fillStyle = '#c3ced8'; x.fillRect(0, j * 128, w, 22);
      for (let i = 0; i < 4; i++) {
        const g = x.createLinearGradient(0, j * 128 + 22, 0, j * 128 + 128); g.addColorStop(0, '#8fb6d3'); g.addColorStop(1, '#5f8fb4');
        x.fillStyle = g; x.fillRect(i * 64 + 4, j * 128 + 24, 56, 102);
        x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(i * 64 + 8, j * 128 + 28, 10, 94);
      }
    }
  }, { repeat: true });
}
function facadeTex(ctx, key, base, win, band) {
  return ctx.canvasTex('streetFacade:' + key, 256, 256, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 4; j++) {
      x.fillStyle = band; x.fillRect(0, j * 64, w, 8);
      for (let i = 0; i < 4; i++) {
        x.fillStyle = win; x.fillRect(i * 64 + 8, j * 64 + 16, 48, 38);
        x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(i * 64 + 10, j * 64 + 18, 14, 34);
      }
    }
  }, { repeat: true });
}
function busBayTex(ctx) {
  return ctx.canvasTex('busBay', 512, 96, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = 'rgba(242,194,27,0.95)'; x.lineWidth = 6; x.setLineDash([26, 18]); x.strokeRect(4, 4, w - 8, h - 8); x.setLineDash([]);
    x.fillStyle = 'rgba(242,194,27,0.95)'; x.font = `900 54px ${ctx.KFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('버 스 전 용', w / 2, h / 2 + 3);
  });
}
function tactileTex(ctx) {
  return ctx.canvasTex('tactile', 256, 40, (x, w, h) => {
    x.fillStyle = '#efb51f'; x.fillRect(0, 0, w, h); x.fillStyle = '#d99a12';
    for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(4 + i * 8, 5 + j * 10, 2.4, 0, 7); x.fill(); }
  });
}
