# Floor modules — contract

One file per floor: `js/floors/<id>.js`, default-exporting a **spec**. `index.js` imports all seven
elevator floors (top → bottom: `roof`, `exec`, `office`, `hall`, `lobby`, `pub`, `parking`) plus the outdoor
`street` (no elevator, see "Areas without elevators" below); phase‑2 work only replaces
its own file. A floor never imports game code — everything goes through the `ctx` handed to `build(ctx)`,
the `game` object handed to `hooks`, and plain data (`challenges`, `scene`). Worked example: `parking.js`.

```js
const PI = Math.PI;
export default {
  id: 'hall', label: '3', key: 'Digit3',            // label = elevator button / title badge; key = panel shortcut
  name: '3층 · 대강당', sub: '시무식 준비 중',          // name: HUD + panel title, sub: one-line flavour
  size: { w: 24, d: 16, h: 4.2 },                   // bounds = ±w/2, ±d/2 (nav grid, camera clamp), h = ceiling + physics lid
  light: 'indoor',                                   // see Light below
  music: 'lobby', stepSfx: 'step',                   // music: title|office|lobby|sunset|tense|rage|bill; stepSfx: step|stepCarpet
  build(ctx) {
    ctx.room({ floor: ctx.M.tex('hallFloor', ctx.tex2.hallFloor(), 16, 11), elevators: { wall: 'west', at: [-1.6, 1.6], label: '3F' } });
    ctx.prop('podium', 0, -5, 0, { tag: 'podium' });
    for (let i = 0; i < 8; i++) ctx.prop('foldchair', -4 + i, 2, PI);
    ctx.npc('workerF1', 3, 0, { anim: 'phone', rotY: -PI / 2, lines: ['마이크 테스트…'] });
    ctx.spawn(-9, 0, PI / 2);
  },
  challenges: [
    { id: 'h1', text: '단상 엎기', kind: 'flip', type: 'podium', bonus: 60000 },
    { id: 'h2', text: '접이식 의자 12개 부수기', kind: 'break', type: 'foldchair', n: 12, bonus: 60000 },
    // … six in total
  ],
  scene: null,   // optional story situation (see Scene)
  hooks: null,   // optional escape hatch (see Hooks)
};
```

## ctx (builder helpers) — `js/level.js → makeCtx`
Coordinates: metres, y up, room centred on the origin. `rotY` = `Object3D.rotation.y`; a prop's front faces +Z
at `rotY = 0`.

| helper | what it does |
|---|---|
| `ctx.room({ w, d, h, floor, ceiling, wall, elevators: { wall: 'west'|'east'|'north'|'south', at: [z or x…], label }, lights: spacing|false, skip: ['north'] })` | floor + ceiling + 4 walls with elevator holes, elevator pair, floor sign, ceiling light grid |
| `ctx.floor(mat, w, d, x, z)` / `ctx.ceiling(mat, w, d, h, x, z)` | planes |
| `ctx.wall(axis, fixed, out, a0, a1, h, mat, holes, th)` | wall line (`axis 'x'`: runs along x at z = fixed; `'z'`: along z at x = fixed; `out` ±1 = outward side; `holes: [{a0,a1,top}]`) — collides |
| `ctx.box(w, h, d, mat, x, y, z, { collide, cast, rotY })` | decor box (y = bottom) |
| `ctx.elevator(fx, fz, rotY, label, index)` | elevator in a wall hole; (fx,fz) = frame centre on the wall plane, rotY faces the room |
| **`ctx.prop(type, x, z, rotY, o)`** | any type from `art/props.js` **or** `art/props2.js` (props2 prices ×0.1 automatically). Placement is decided from the prop: `mass>0` → dynamic body · `mass 0` with price/`set()` → **fixed** breakable fixture (static body, walking rect) · `mass 0, price 0` → merged decor (+collider if taller than 0.25 m) · `mount:'wall'` → hung on the wall, (x,z) = point **on the wall surface**, default y 1.4, falls when hit if `mass>0` · `mount:'ceiling'` → hangs from the ceiling · `sprinkler` → decor + registered for the alarm. `o`: placement keys `y, tag, as ('dyn'|'fixed'|'hang'|'decor'), scale, noCast, hp, name, price, solid, flip`; **every other key goes to the art builder** (`text`, `color`, `boss`, `w`, …). Returns the spec (`spec.rec` = physics record after build). |
| `ctx.decorProp / ctx.dynProp / ctx.liveProp(type, x, y, z, rotY, artOpts, …)` | the old low-level placers (office/lobby use them) |
| `ctx.desk(x, z, rotY, { occupied, items, chair })` | office desk + random desk-top clutter + chair; returns a seat |
| `ctx.npc(preset, x, z, { rotY, anim, face, role, seat, look, lines, variantSeed })` | person. presets: boss, barista, workerM1/M2, workerF1/F2, chubby, glasses. `look`: colour overrides `{ suit, pants, shirt, tie, hair }`. `lines`: idle chatter when the player walks by (not in a rampage). anims: idle walk run sit type carry phone armsCrossed lookUp stretch talk offer scared … |
| `ctx.walker({ preset, x, z, speed, x0, x1, dir })` | passer-by strolling along x (outside windows) |
| `ctx.collider(x, z, hx, hz, h, rot, y0)` / `ctx.rect(...)` | invisible solid (walk + physics) / walk-only rect |
| `ctx.light(x, y, z, { color, intensity, distance, decay })` | point light — keep ≤ 4 per floor |
| `ctx.decal(x, z, w, d, { map, material, color, rotY, key })` | flat floor sticker (polygonOffset, no z-fighting). `key` = cache key for the material |
| `ctx.window({ axis, at, side, from, to, bays, y0, y1, label })` | **breakable window row** + out-zone: panes block until hit/thrown through; anything past the plane falls out (money + `out`) |
| `ctx.outZone({ axis, at, side, from, to, label })` | out-zone without glass (roof edge behind a low railing) |
| `ctx.spawn(x, z, yaw)` / `ctx.anchor(name, x, z)` / `ctx.hide(x, z)` | free-mode start, named points (scene steps), cower spots |
| `ctx.sky(time, opts)` | skyline cylinder outside windows (`time` follows `skyFor(t)`) |
| `ctx.add(obj, { decor })`, `ctx.dispose(geo)`, `ctx.animate((dt, t) => …)`, `ctx.rope(specA, specB)` | raw meshes (decor = merged), cleanup, per-frame animation, stanchion ropes |
| `ctx.M` | cached materials: `carpet() wall() terrazzo() marble(rx,ry) glass() …`, `M.std(key, params)`, **`M.tex(key, texture, rx, ry, params)`** (repeat a texture) |
| `ctx.tex`, `ctx.tex2`, `ctx.canvasTex(key, w, h, draw)`, `ctx.KFONT`, `ctx.THREE`, `ctx.V`, `ctx.makeProp(type, opts)`, `ctx.low` (phone) | raw access |

**Tags**: `o.tag` on `ctx.prop` (or `ctx.tag(spec, 'x')`). Tags are what `challenges` (`tag:`), `scene` steps
(`hold: { tag }`, `recMove`) and `game.rec(tag)` find. One tag per object.

## Light
`light: null` follows the time of day (`day / noon / sunset / title`) — windowed floors. A string is a fixed
preset from `gfx.js PRESETS` (`garage`, `indoor`, `lobby`, `day`, `sunset` …). An object overrides fields of a
preset: `{ preset: 'indoor', hemiI: 1.3, fog: '#30283a', fogNear: 15 }` (fields: sun, sunI, sunDir, hemiSky,
hemiGround, hemiI, top, topI, amb, exposure, fog, fogNear, fogFar, env). A function `(time) => preset|object`
picks per time (`lobby.js`). Windowless floors: no sky; `scene.background` = fog colour. Use emissive strips
(`M.std(key, { emissive, emissiveIntensity: 1.5 })`) for light fixtures — bloom picks them up.

## Challenges
Six per floor, two shown at a time, completed ones pay `bonus` (listed on the bill as `목표 보너스 · text`) and
rotate. Progress is **per floor** and persists for the run. `n` defaults to 1; counts appear as `(3/8)`.

| kind | counts when | filters |
|---|---|---|
| `break` | a thing is destroyed | `type` or `tag` |
| `hit` | a thing is hit for the first time ("날리기") | `type` / `tag` |
| `flip` | something is flipped with E-hold: `desk, deskL, meetingTable, roundTable, grilltable, podium, ceoDesk` or any dynamic prop placed with `{ flip: true }` | `type` / `tag` |
| `out` | a body leaves through a window / out-zone | `type` / `tag` |
| `ram` | something rammed while riding | `type` = ride (`chair`, `cart`, `forklift`) |
| `knock` | a person sent flying | — |
| `weapon` | a hit with a held weapon | `type` (`tambourine`, `trophy`, `bottle`…) |
| `shout` | megaphone shout | — |
| `alarm` | fire alarm triggered | — |
| `fly` | extinguisher flight | — |
| `lift` | forklift lifted something | `type` / `tag` |
| `carStage` | car damage stage reached (n = 1 glass … 4 wreck) | `tag` (e.g. `bossCar`) |
| `topple` | street lamp knocked flat (`street.js` hook emits it) | `type` |
| `count` | legacy counters: `key` = `paper`, `coffee`, `special`, `plantKick`, `chairHit`, `<type>` | — |

Floor hooks can count anything with `game.emit(kind, rec)` (bumps `kind`, `kind:type`, `kind#tag`).

## Shared toys (no floor code needed — just place the props)
* ride: `chair` (props.js), `cart`, `forklift` → **E 타기 / E 내리기**, WASD rolls, ramming = damage + `ram`;
  forklift: attack raises/lowers the fork and lifts the car in front (`lift`).
* hold: `megaphone` (attack/Q shout), `tambourine` (jingle hits), `trophy`, `bottle`, `beerMug`, `extinguisher`
  (hold attack: spray, recoil, fly) → **E 들기**, E again throws.
* `alarmBell` (E hold or break it) → all `sprinkler`s rain, puddles, everyone flees.
* staged: `car` (hp → `set(1..4)`), `ceoSafe` (door swings, gold bars + money), `aquarium` / `sojuFridge` / `watertank`
  (break states + water), `balloon` (pop), `drum` (burst pushes neighbours), `gate`, `barrierGate`,
  wall/ceiling mounted things with mass (cctv, banner, portrait, mirrorball) drop when hit.

## Scene (optional story situation)
Slotted into the day by `time` (`오전/낮/오후 h:mm`); existing: 10:30 copier, 12:10 coffee, 17:50 퇴근 5분 전.
```js
scene: { id: 'hallSetup', time: '오후 2:00', title: '시무식 의자 깔기', sub: '“의자 200개, 오늘 안에”',
  start: { floor: 'office', seat: 'playerSeat', preset: 'day', music: 'office', stress: 50 },   // or at: [x,z] | 'anchor'
  steps: [ { mission: { title, sub, quote } }, { tasks: ['3층 가기', '의자 깔기'] }, { sub: ['부장', '…', 2800], sfx: 'mumbleLow' },
           { wait: 2.5 }, { unseat: true }, { goto: 'hall' }, { done: 0 }, { say: ['role', '…', 2.6] },
           { walk: { to: 'anchorName' | [x,z], r: 0.8 } }, { hold: { tag | who, at: 'anchor', text: '의자 펴기', sec: 1 } },
           { recMove: { tag, dx, dz, sec } }, { npc: { who, walk, speed, anim, face, say, look: 'player' } },
           { stress: 8, face: ['endure', 2] }, { music: 'tense' }, { toast: '…' }, { call: (game) => {} } ] }
```
Several instant keys may share one step; the blocking key (`wait`, `goto`, `walk`, `hold`, `recMove`) ends it.
If the player wanders to another floor during `walk`/`hold`, the marker points back to the elevator. Keep it
40–60 s, end on a stress bump; the next scene card follows automatically.

## Areas without elevators — `outside` + `portals` (회사 앞 거리)
`street.js` sets `outside: true` (kept off the elevator panel / `FLOOR_LIST`, still in `FLOOR_INFO` and the title
picker) and is reached through a door. Both sides declare a portal:
```js
portals: [{ to: 'lobby', box: [x0, z0, x1, z1], enter: [0, -1], out: [x, z, yaw], walk: [x, z], cam: [yawOffset, pitch] }]
```
During a rampage, walking (or riding) into `box` while moving along `enter` spins the door (`anchors.doorSpin =
{ a, k }`, the floor's animate reads it), whooshes and fades to `to`; there you appear at that floor's own portal
`out` (the one whose `to` is where you came from), step out to `walk` on your own, and `cam` (optional) first looks
back at the door before the camera swings behind you. The bot (`__ppg.ride(id)`) routes through doors
(office → lobby elevator → door → street). Fleeing people use `anchors.door` + `anchors.doorDir` and
`anchors.leaves: [{ p, dir }]` (run off the ends of the street).

## Hooks (optional) — `game` API
`onEnter(game)`, `onTick(game, dt)`, `onDestroy(game, rec)`, `onInteract(game, cand)`, `candidate(game) → { id, pos, h, obj, text, hold, range, onDone }`.
`game`: `G P S F rampage mode floor time fx sfx ui after npc(who) npcs(role) rec(tag) recs(pred) anchor(name)
say(npc, text, sec) subtitle(sp, text, ms) toast(text) walkNpc(npc, to, { speed, anim, arrive }) money(amt, pos, label)
emit(kind, rec) stress(d) alarm(pos, r) hitRec(rec, dmg, dir, power) setState(rec, s) triggerAlarm(rec)`.

## Budgets & gotchas
* ≤ ~450 draw calls untouched on desktop (shadows included): `node tools/drive.mjs tools/sc-floor-one.mjs out 1280x720 floor=<id>` logs `renderer.info`.
  Repeated props with the same art options are batched automatically (InstancedMesh) — **vary options sparingly**
  (each distinct `text`/`color` is its own material/geometry). Big one-off fixtures: pass `noCast: true`.
* Price scale: props.js ≈ won (desk 24,000); props2 already ×0.1 (a car ≈ 6,000,000). What the bill pays is
  compressed above ₩80,000 (`phys.js → payPrice`: 250k → 135k, 800k → 190k, 3M → 254k, 6M → 287k, 15M → 330k),
  so a floor's jackpots are worth ~2–4 ordinary smashes, not a whole minute. A floor's six challenge bonuses are
  scaled to ≤ ₩420,000 in total. Pricing a prop higher still makes it a bigger jackpot, just not linearly.
* `ctx.prop` merges a prop's parts into a few meshes (and batches repeats), so `geometry.parameters` is gone on
  the result — find parts by material / `material.map`, not by geometry size.
* Targeting heights: punches / kicks (`pickTarget`) ignore bodies whose centre is above y 2.2 (2.8 for hung
  things) unless their bottom edge is below 1.5 m (tall curtains, a stage screen stay punchable); the E prompt
  (pick up / flip / ride) ignores bodies above y 1.6. Put interactive things lower.
* E on a table with something small on it: **tap E** picks the thing up, **hold E** flips the table (one prompt).
* Throws leave the hand at shoulder height (~1.4 m) with a slight arc; facing a window row / out-zone within 8 m,
  the throw aims at the middle of the nearest pane (broken panes preferred) or the zone edge. The player can never
  pass an out-zone plane (broken panes included).
* Seated people on higher chairs: `ctx.npc(…, { seatY: 0.11 })` (offset vs an office chair; sofas −0.045).
* Raised walkable floor: `ctx.ground(x0, z0, x1, z1, h)` — the player steps up ≤ 0.45 m / down ≤ 0.25 m (else
  falls), people walk on it. Only floors that declare grounds use it (3층 still runs its own `heightAt` hook).
* Wall-hung props step 7 cm off the wall when knocked loose and bounce back into the room if punched toward
  the wall; physics substeps when something flies faster than 6 m/s and caps speeds at 16 m/s (no tunnelling
  through 0.2 m partitions).
* Every floor needs an elevator (`ctx.room` adds a pair) and walkable space in front of it; keep 1 m around it clear.
* Dynamic props spawn asleep at y (default 0); stack with `y`. Fixed props get a walking rect from their bounds.
* Don't put things outside `size`: the nav grid and camera clamp use it; walls should sit on the bounds.
* Preview: `http://localhost:4260/#debug` → `__ppg.start('free', { floor: 'hall' })`, `__ppg.look(yaw, pitch)`,
  `__ppg.near('tag'|type|id, dist)`, `__ppg.auto(true)` (bot), `__ppg.state()`, `__ppg.chal()`, `__ppg.floors()`.

## People: 멘탈 and KO (`ko` challenge)
Every hit on a person costs 멘탈 (coworkers 3, `boss` / `ceo` / `exec` / `guard` 5, fighters: 보스 8 / 중간보스 6; `ctx.npc(…, { mental: n })` overrides):
punch 1, kick / ride / heavy swing 2, the special or a flung desk 3. At 0 they go 깨꼬닥 for ~10–14 s (stars, soul puff,
치료비 / 위자료 on the bill), then sit up and stagger out; they never leave the floor bounds or out-zones and are never removed
while knocked out. Challenge kind `ko` counts distinct people knocked out: `{ id, text, kind: 'ko', n: 3, bonus }`, or one
role with `role: 'boss'` (= `type`; key `ko:boss`). Rush adds "<보스 이름> 기절시키기" by itself when a floor has a boss and no `ko` goal.

## People who fight back (반격) — `js/fight.js`
Only in a rampage (rush / free / the story's last minute), never in scripted scenes. Per floor (`fight.designate`):
the **보스** = the `boss` / `ceo` role (멘탈 8), one **중간보스** = the npc with `rank: 'mid'` (`ctx.npc(…, { rank: 'mid' })`),
else the first `exec` / `guard`, else a standing worker (멘탈 6, KO pays 60,000 위자료), and one random hot-headed worker
who snaps after the first hit. They square up (`fightIdle`), wind up ≥ 0.75 s ("!" + `windup` sfx + pose), swing with a
short reach, then pant ~1 s. Two attackers at most; hits during a wind-up cost 멘탈 but don't stop the swing. Names: the player sets 보스 / 중간보스
names on the title (`ui.names`, `fight.nameOf(n)`); tags, bubbles, money pops, bill lines and the rush goal use them.
