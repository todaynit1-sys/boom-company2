// 1층 로비 · 카페 — café queue (story), revolving door, plus the lobby toys: security gates, the company
// name in big letters, cake showcase, a parcel cart to ride, an info desk and an extinguisher to fly with.
const PI = Math.PI;
const COMPANY = '가족같은회사';

export default {
  id: 'lobby', label: '1', key: 'Digit1', name: '1층 · 로비', sub: '카페와 회전문',
  size: { w: 26, d: 18, h: 4.6 },
  light: (time) => (time === 'sunset' ? 'sunset' : 'lobby'),
  skyFor: (time) => (time === 'sunset' ? 'sunset' : 'day'),
  music: 'lobby', stepSfx: 'step',

  build(ctx) {
    const { M, V } = ctx;
    const F = ctx.F, A = ctx.anchors;
    const W = 26, D = 18, H = 4.6;
    ctx.floor(M.terrazzo(), W, D);
    ctx.ceiling(M.ceilLobby(), W, D, H);
    for (let x = -10.5; x <= 12; x += 3) for (let z = -6.5; z <= 8; z += 3) ctx.decorProp('ceilingLight', x, H, z, 0, {}, { rotX: PI, cast: false });

    // walls
    ctx.wall('x', 9, 1, -13.2, 13.2, H, M.marble(11, 2));
    ctx.wall('z', -13, -1, -9, 9, H, M.marble(7.5, 2));
    const evZ = [-2.0, 1.4];
    ctx.wall('z', 13, 1, -9, 9, H, M.marble(7.5, 2), evZ.map((z) => ({ a0: z - 0.5, a1: z + 0.5, top: 2.1 })));
    ctx.wall('x', -9, -1, -13.2, -4, H, M.cafeWall());
    ctx.box(0.3, H, 1.6, M.marble(1, 2), -4.15, 0, -8.2, { collide: true });
    ctx.box(9.0, 0.7, 0.3, M.header(), -8.6, H - 0.7, -6.75);
    // glass front (north, x -4..13) with a revolving door at x=3
    const glassSeg = (x0, x1) => {
      const n = Math.max(1, Math.round((x1 - x0) / 2.9));
      const w = (x1 - x0) / n;
      for (let i = 0; i < n; i++) ctx.decorProp('glassWall', x0 + (i + 0.5) * w, 0, -9, 0, { w, h: H }, { collide: true });
    };
    glassSeg(-4, 1.85); glassSeg(4.15, 13);
    ctx.box(2.3, H - 2.46, 0.04, M.glass(), 3.0, 2.46, -9, { cast: false });
    ctx.box(2.3, 0.06, 0.1, M.alu(), 3.0, 2.44, -9);
    const rd = ctx.liveProp('revolvingDoor', 3.0, 0, -9);
    ctx.rect(3.0, -9, 1.15, 1.15, 0, 2.4);
    ctx.animate((dt, t) => rd.set(t * 0.35));
    A.door = V(3.0, 0, -7.5);
    // outside: sidewalk, road, lawn, trees
    const out = (w, d, m, x, z, y = -0.02) => { const g = new ctx.THREE.PlaneGeometry(w, d); const o = new ctx.THREE.Mesh(g, m); o.rotation.x = -PI / 2; o.position.set(x, y, z); o.receiveShadow = true; ctx.add(o); };
    out(60, 7, M.street(), 4, -12.6);
    out(60, 10, M.road(), 4, -21);
    out(60, 14, M.lawn(), 4, -33, -0.03);
    for (let x = -6; x <= 16; x += 4.4) ctx.decorProp('plantBig', x, 0, -14.6, x, {}, { scale: 2.1 });
    ctx.sky('day', { radius: 44, y0: -1.5, h: 40, center: PI, span: 2.6 });
    ctx.walker({ preset: 'workerM1', x: -4, z: -11.4, speed: 1.25, x0: -6, x1: 14, dir: 1, variantSeed: 31 });
    ctx.walker({ preset: 'workerF1', x: 9, z: -12.3, speed: 1.1, x0: -6, x1: 14, dir: -1, variantSeed: 32 });
    ctx.walker({ preset: 'glasses', x: 2, z: -13.0, speed: 1.35, x0: -6, x1: 14, dir: 1, variantSeed: 33 });

    // ---- café
    ctx.dynProp('cafeCounter', -8.6, 0, -6.4, 0, { w: 4.5 });
    const cy = 1.05;
    ctx.decorProp('cafeSign', -8.6, H - 1.35, -6.58, 0, {}, { cast: false });
    ctx.decorProp('menuBoard', -11.8, 1.25, -8.97, 0, {}, { cast: false });
    ctx.decorProp('menuBoard', -5.2, 1.25, -8.97, 0, {}, { cast: false });
    ctx.box(6.0, 0.9, 0.55, M.darkWood(), -8.6, 0, -8.7, { collide: true });
    ctx.box(6.0, 0.04, 0.6, M.sill(), -8.6, 0.9, -8.7);
    ctx.box(5.0, 0.04, 0.3, M.darkWood(), -8.6, 1.75, -8.85);
    for (let i = 0; i < 6; i++) ctx.decorProp('box', -10.6 + i * 0.75, 1.79, -8.82, 0, {}, { scale: 0.7, cast: false });
    for (let i = 0; i < 3; i++) ctx.dynProp('cupStack', -7.2 + i * 0.35, 0.94, -8.65);
    ctx.dynProp('espresso', -9.65, cy, -6.55, PI);
    ctx.dynProp('grinder', -10.35, cy, -6.5, PI);
    ctx.dynProp('cupStack', -10.75, cy, -6.25);
    ctx.dynProp('pos', -6.75, cy, -6.4, 0.25);
    A.trays = [ctx.dynProp('coffeeTray', -7.95, cy, -6.15, 0, { count: 6 }, 'tray'), ctx.dynProp('coffeeTray', -7.52, cy, -6.15, 0.05, { count: 6 }, 'tray')];
    for (let i = 0; i < 6; i++) ctx.dynProp('icedCoffee', -9.25 + i * 0.12, cy, -6.13 + (i % 2) * 0.05, i);
    for (const x of [-10.2, -8.6, -7.0]) ctx.decorProp('pendantLamp', x, 2.05, -6.35, 0, {}, { cast: false });
    for (const x of [-9.4, -7.6]) ctx.light(x, 1.95, -6.2, { color: '#ffc98c', intensity: 6, distance: 6.5, decay: 1.6 });
    A.counterFront = V(-7.7, 0, -5.55);
    ctx.addNpc({ preset: 'barista', x: -8.1, z: -7.2, rotY: 0, anim: 'idle', face: 'smile', role: 'barista' });
    // cake showcase next to the counter
    ctx.prop('showcase', -5.0, -7.0, 0, { noCast: true });

    // ---- queue with stanchions
    const qx = -6.75;
    A.queue = [-5.45, -4.65, -3.85, -3.05, -2.25].map((z) => V(qx, 0, z));
    const posts = [-5.75, -4.45, -3.15, -1.85].map((z) => ctx.dynProp('stanchion', -6.0, 0, z, 0, {}, 'post'));
    for (let i = 0; i < posts.length - 1; i++) ctx.rope(posts[i], posts[i + 1]);
    const qPeople = [['workerM1', 'phone', 'normal'], ['workerF1', 'armsCrossed', 'normal'], ['chubby', 'lookUp', 'sleepy']];
    qPeople.forEach(([p, a, f], i) => {
      const q = A.queue[i];
      ctx.addNpc({ preset: p, x: q.x + (i === 1 ? 0.05 : 0), z: q.z, rotY: PI, anim: a, face: f, role: 'queue', queueIndex: i, variantSeed: 40 + i });
    });
    A.cutterStart = V(-3.2, 0, -0.6);
    ctx.addNpc({ preset: 'workerM2', x: -3.2, z: -0.6, rotY: -0.6, anim: 'phone', face: 'smug', role: 'cutter', variantSeed: 51 });

    // ---- café tables
    for (const [x, z] of [[-11.2, -2.0], [-11.2, 1.6], [-8.4, 3.6]]) {
      ctx.dynProp('roundTable', x, 0, z);
      ctx.dynProp('cafeChair', x + 0.72, 0, z, -PI / 2, { color: '#d6a23b' });
      ctx.dynProp('cafeChair', x - 0.72, 0, z + 0.1, PI / 2, { color: '#4f86c6' });
      ctx.dynProp((x + z) % 2 ? 'icedCoffee' : 'hotCoffee', x + 0.12, 0.74, z - 0.05);
    }
    ctx.addNpc({ preset: 'glasses', x: -11.92, z: 1.7, rotY: PI / 2, anim: 'sit', face: 'sleepy', role: 'sitter', chairY: true, variantSeed: 60 });

    // ---- elevators (east wall, facing −X)
    evZ.forEach((z, i) => ctx.elevator(13, z, -PI / 2, '1F', i));
    ctx.decorProp('floorSign', 12.985, 1.75, -0.3, -PI / 2, { text: '1', underline: false, h: 0.62 });
    ctx.prop('extinguisher', 12.82, 3.0, -PI / 2);
    ctx.prop('extinguisher', 0.9, -8.5, 0);
    ctx.dynProp('plantBig', 12.35, 0, -3.6);
    ctx.dynProp('plantBig', 12.35, 0, 3.6);
    // security gates in front of the elevators + the floor directory
    for (const z of [-6.6, -5.7, -4.8, -3.9, -3.0]) ctx.prop('gate', 9.8, z, PI / 2);
    ctx.prop('directory', 11.9, -6.6, -PI / 2, { noCast: true });
    // the company name in big letters along the glass front
    [...COMPANY].forEach((ch, i) => ctx.prop('logoLetter', 6.0 + i * 1.05, -7.95, 0, { char: ch, h: 0.95, color: i % 2 ? '#2f6fd6' : '#d8352a' }));
    // ---- lounge
    ctx.dynProp('sofaYellow', 9.6, 0, 8.45, PI);
    ctx.dynProp('sofa', 12.45, 0, 6.0, -PI / 2);
    ctx.dynProp('roundTable', 10.1, 0, 6.4);
    ctx.dynProp('hotCoffee', 10.15, 0.74, 6.35);
    ctx.addNpc({ preset: 'workerF2', x: 9.3, z: 8.45, rotY: PI, anim: 'sit', face: 'sleepy', role: 'sitter', sofa: true, variantSeed: 61 });
    ctx.addNpc({ preset: 'workerM2', x: 7.2, z: 5.0, rotY: 0.9, anim: 'talk', face: 'smile', role: 'worker', variantSeed: 62 });
    ctx.addNpc({ preset: 'workerF1', x: 8.0, z: 5.7, rotY: -2.2, anim: 'armsCrossed', face: 'normal', role: 'worker', variantSeed: 63 });
    // info desk + parcel corner
    ctx.prop('infoDesk', 3.0, 3.4, PI, { noCast: true });
    ctx.prop('cart', 2.3, 6.7, 0.3, { tag: 'parcelCart' });
    for (const [x, z, s, y] of [[0.35, 8.4, 'm', 0], [0.95, 8.45, 'm', 0], [0.4, 8.4, 's', 0.32], [1.45, 8.5, 's', 0]]) ctx.prop('parcel', x, z, x * 2, { s, y });
    // misc
    ctx.decorProp('vending', -2.3, 0, 8.55, PI, {}, { collide: true });
    ctx.decorProp('vending', -1.35, 0, 8.55, PI, {}, { collide: true });
    ctx.dynProp('trashcan', -0.6, 0, 8.7);
    ctx.dynProp('plantBig', -12.35, 0, 8.3);
    ctx.dynProp('plantBig', -3.55, 0, -8.35);
    ctx.dynProp('plantBig', 4.9, 0, 8.3);
    ctx.dynProp('cone', 1.2, 0, -7.4);
    ctx.dynProp('cone', 4.9, 0, -7.2);
    ctx.dynProp('trashcan', 5.1, 0, -8.5);
    for (const [x, z] of [[-1.5, -2.6], [-1.5, 4.2], [6.5, 1.6]]) ctx.decorProp('pillar', x, 0, z, 0, { h: H, color: '#d8cdbf' }, { collide: true });

    ctx.spawn(8.5, 0, -PI / 2);
    A.hide = [V(-1.5, 0, -3.25), V(-1.5, 0, 4.85), V(6.5, 0, 2.25), V(11.5, 0, 8.0)];
    A.exits = [A.door.clone(), ...F.elevators.map((e) => e.front.clone().addScaledVector(e.fwd, 0.6))];
    A.titleCam = { pos: V(-3.5, 2.4, 1.5), look: V(-7.5, 1.0, -5.5) };
  },

  challenges: [
    { id: 'l1', text: '보안 게이트 5개 다 부수기', kind: 'break', type: 'gate', n: 5, bonus: 80000 },
    { id: 'l2', text: '간판 글자 다 부수기', kind: 'break', type: 'logoLetter', n: COMPANY.length, bonus: 80000 },
    { id: 'l3', text: '케이크 진열장 깨기', kind: 'break', type: 'showcase', bonus: 60000 },
    { id: 'l4', text: '소화기 뿜으며 날기', kind: 'fly', bonus: 60000 },
    { id: 'l5', text: '택배 카트로 5번 들이받기', kind: 'ram', type: 'cart', n: 5, bonus: 60000 },
    { id: 'l6', text: '커피 엎기 6잔', kind: 'count', key: 'coffee', n: 6, bonus: 40000 },
  ],
};
