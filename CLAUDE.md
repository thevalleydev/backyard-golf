# Backyard Golf: agent handoff

You're picking up an alpha of a game Brad and his friends actually play in real life: one-handed "backyard golf" through their neighborhood (Crystal Spring Park area, Fort Wayne IN). Each player carries one club, swings one-handed (usually with a beer in the other hand), and whoever won the last hole **calls** the next target on the spot: a tree trunk, the gap between sign posts, a window, the slide. This is a 3D browser version of that.

Read this whole file before changing anything. Then read `docs/ROADMAP.md` for what's next and `docs/DESIGN.md` for the rules and tuning.

## How Brad works

- Direct and brief. Corrects errors without friction and expects the same back.
- Wants mechanisms named ("the ribbon only had two vertices across 8 m, so it chorded under the bumps"), not vague framing.
- Pushes back when conclusions are overstated. Don't claim something "works" unless you verified it, and say what you couldn't verify (usually: how it looks and feels on his phone).
- Plays on a phone. Mobile is the primary target; desktop is secondary.

## Current state (0.1 alpha)

The published entry `index.html` loads `src/main.ts`: Vite bundles Three.js **r128** from npm and publishes `dist/index.html` through GitHub Actions on pushes to `main`. All application code in `src/` is strictly checked TypeScript, including world construction (`src/world.ts`) and UI/turns (`src/ui.ts`). The imported-module smoke suite covers gameplay and storage compatibility, not rendered pixels or real phone controls.

It works end to end: setup → call a hole by tapping the map → aim → swipe to swing → physics → scoring → next hole → final scorecard → save/replay courses.

The imported-module smoke test passes (`npm test`), but it can't see pixels. Visual/feel issues have only ever been found by Brad on his phone.

### First job: playtest the modular game on a phone (before any big feature)

The original single file was edited by search-and-replace for weeks. Several real bugs came from that (the golfer was accidentally deleted from the scene; the school walls got shifted off their windows by a botched string slice). The first split is complete in `src/`; the finer-grained layout below remains a longer-term goal:

```
src/
  main.ts            boot, loop
  config.ts          CLUBS, tuning constants, colors
  render/            renderer, toon material + gradient map, lights/shadows, merge + fade, instanced trees/glass
  world/             terrain (rawH/H/meshH/pads), map data (px polylines & polygons), roads, paths, houses, yards, objects, junk
  physics/           collide(), physStep(), simStep(), groundInfo(), spatial grid
  game/              state G, turns, holes, rules, settleHole, courses, unlocks/stats
  golfer/            makeGolfer, props (PROPDEF), poses, walking, eating
  input/             swipe, button meter, phone motion, map pan/pinch/tap
  ui/                HUD, hole card, call sheet, scorecard, setup
  audio/             Web Audio synth (sfx)
```

Keep three at **0.128** until you've checked the breaking changes (`LuminanceFormat` for the toon gradient, `Quaternion.invert`, `instanceColor`, geometry APIs). Upgrading is fine later, just not in the same change as the split.

The modular game preserves gameplay and storage keys; run the smoke test and build, and have Brad play one hole before touching behavior.

## Architecture (modules in `src/`)

| Area | Key names | Notes |
|---|---|---|
| Config | `CLUBS` | 8-iron / 9-iron / PW only (Brad's call). `v` full-power speed, `loft` range, `base` stock launch, `wob` base spread |
| Render | `renderer`, `scene`, `sun` (shadow-casting, follows camera look point), `toon()`, `mat()` cache, `OUT` (black BackSide outline) | Cartoon look: 3-tone toon gradient + inverted-hull outlines |
| `part(geo,col,parent,x,y,z,t)` | | Mesh + outline child. `t` = outline thickness in meters |
| Terrain | `rawH` (rolling sines), `PADS` + `H()` (flattened pads blended in), `meshH()` (height of the *drawn* triangles), `groundN()` | Always place things with `H()`. Pavement uses `max(H, meshH)` so grass can't poke through |
| Map data | `WX/WZ` (px→m, 1 px = 0.2 m, origin at park junction), `WOODS`, `FIELD`, `SANDP`, `PATHS`, `ROADS`, `CULS`, `HOUSES`, `POOLS` | Traced from `docs/satellite-crystal-spring.png`. Coordinates are in **image pixels** |
| Streets | `roadSurf(x,z)` (distance to pavement edge, negative = on road), `roadNearest`, `HL` (house layout: faces nearest road, set back from curb, de-overlapped) | Houses' fronts face their street; driveways run to the curb |
| Objects | `makeObj`, `bx/cy/cone/sp` (visual + collider), `zone()` (trigger volume), `finalize()`, `OBJS` | `bx`/`cy` **merge by default** into one mesh per object key (`MKEY`) for draw calls. Pass `{nomerge:true}` if you need the mesh |
| Grouped targets | `groupObj`, `member`, `endMember`, `o.members`, `o.subRules`, `tgt(o,from)` | Houses, cars, grills, sheds, hoops, pools, trees are groups; each member is individually tappable. `G.targetSub` picks a member |
| Yards | `yards()`: driveways, cars (breakable glass + alarm), bushes, flowers, patios, grills, sheds, hoops, back fences | Merged into the owning house's fade key `h<i>` |
| Path junk | `JUNK`, `pathJunk()` | ~30 small targets every ~24 m along paths |
| Trees | `TREES`, `STATIC` colliders (trunk = solid cyl, canopy = `leaf` soft drag), instanced meshes in `TM` | ~635 trees. Leaves slow the ball instead of stopping it |
| Glass | `glassPane`, `GLASS`, instanced `GI`/`GB`, `breakGlass` | Breaks above ~6 m/s impact; persists until new game |
| Collision | `collide(c,p)` for `obb`, `cyl`, `sph`, `ring`; `GRID`/`near(p)` spatial hash (6 m cells) | Ball radius `R=0.15` (oversized on purpose; real holes would be impossible) |
| Physics | `physStep` (240 Hz fixed step), `simStep`, `groundInfo` (grass/path/road/woods/sand/water friction) | Stop detection: slow + supported, or <12 cm moved in 0.5 s |
| Skill model | `shotModel`, `gauss`, stats `pow/acc/con` (6 points, max 4), mishits thin/fat/shank, stance-based slice bias | See DESIGN.md |
| Golfers | `makeGolfer`, `PROPDEF`, `offPose`, `stepGolfer` (walk + swing anim + eating), `addressOf/placeKid/walkTo` | One golfer per player, all in the world, they jog to their balls |
| Unlocks | `TALLY` (localStorage `byg_stats`), `bump()`, `isUnlocked` | Hand items unlock from play stats (per device) |
| Holes | `openCall` → `startPick` (map) → `pickAt` → `selectObj` → `playRule` → `startHole` → `beginTurn`/`startAim` → `swing` → `endShot` → `settleHole` → `endHole` → `teeUp` | A hole ends early once nobody left can tie (they take best+1) |
| Courses | localStorage `byg_courses`; `G.log` records target id, member, rule index, tee spot per hole; `courseHole()` replays | Per device only |
| Input | Swipe zone (`#swingZone`, `swipeEnd`), hold-button meter, phone gyro (`devicemotion`), map pan/pinch/tap | Swipe is default. Backswing length = power, flick speed only penalizes lazy flicks |
| Camera | `updateCamera`, `updateOcclusion` (anything between camera and golfer fades to 20%; trees swap for a ghost copy) | |
| Audio | `sfx(kind)` synthesized with Web Audio, no files | |

### Conventions and gotchas

- **Coordinates:** world meters, y up. Map data is in satellite-image pixels; convert with `WX/WZ`.
- **Always compute ground height with `H(x,z)`** (includes pads). Anything drawn flat on the ground should use `max(H, meshH)` plus an offset.
- **New objects:** call `makeObj(...)` (sets `MKEY`, flattens a pad, keeps it off houses and roads), build with `bx/cy/...`, then `finalize(o)`. Add a sound material in `MATSND`.
- **New group targets:** `groupObj` + `member(...)` / `endMember(...)` per member, set `o.subRules`. Colliders get `sub` and `fk` (fade key) automatically.
- **Rule types:** `contact` (any touch, optional `part`), `through` (ball enters zone), `top` (touch with normal.y > 0.6), `brk` (break glass on target). Add new types in `physStep` flags + `endShot`.
- **Merging:** merged visuals can't be moved or hidden individually. That's why fading works per key (`FADEG[key]`). If something needs to animate, use `{nomerge:true}` or `part()`.
- **The test harness imports ES modules** through `tests/entry.js`, bundled by esbuild for jsdom. It does not patch the original IIFE.
- **Timers:** gameplay uses `setTimeout` for turn transitions. The smoke test drives physics with `simStep` directly.
- **Phone motion sensors are blocked inside the claude.ai artifact viewer.** Swipe works everywhere. Real HTTPS hosting is needed for gyro.

## Running

```
npm ci
npm run dev       # open the Vite URL; gyro needs HTTPS
npm test          # headless smoke test (jsdom + three@0.128)
npm run build     # strict TS check + Pages production bundle in dist/
```

## Definition of done for any change

1. `npm test` passes (extend it when you fix a class of bug).
2. You state plainly what you verified and what you couldn't (visuals, feel, phone performance).
3. Brad plays it on his phone. Performance budget so far: ~330 draw calls, ~540k triangles, 2048² shadow map. If a phone stutters, cut shadow resolution first, then tree count.
