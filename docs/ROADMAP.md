# Roadmap

In priority order. Each step should end with `npm test` green and Brad playing it on his phone.

## 0. Split into modules (published; phone playtest pending)
Vite + strictly checked TypeScript modules, three pinned at 0.128, and an imported-module smoke test replace the inline IIFE in `index.html`. Shared config, geometry/map data, terrain, collision and shot model have no browser globals; world construction, rendering, audio, game simulation/golfer, sensors/input, UI and loop are TypeScript modules. GitHub Pages publishes the Vite bundle automatically on `main` pushes. Browser gameplay and CI were checked; have Brad play a hole on his phone before changing game behavior.

## 1. Playtest pass
Brad plus friends play a real round. Collect: phone performance (fps, heat), swipe feel, camera annoyances, targets that are impossible or trivial, anything confusing.
Add an optional on-screen fps/draw-call readout (hidden behind a long-press) to make this easy.

## 2. Hole modifiers (biggest fun-per-effort gap)
Holes are still three verbs (hit / through / top) on different nouns. Let the caller stack a modifier:
- Bank shot: "off the house, then the trash can" (implemented for a chosen nearby object then the called target, on the same shot)
- "Must bounce on the path first" (implemented as a path landing before the called target, on the same shot; top bounces off a chosen nearby object are also supported)
- "Over the court fence" (must pass above a height/zone)
- "No wedge this hole" / "off hand only" (temporarily changes club or damps stats)
- Closest-to holes (no target; nearest ball after N shots wins)
- Carry-over ties (skins style)

Store modifiers in the course log so saved courses replay them.

## 3. Consequences and life
- Broken window → the neighbor yells, the breaker loses a stroke or the victim picks the next hole
- Something moving: a dog that runs off with a ball, a sprinkler, a kid biking the path
- Car alarms already exist; make them matter (a stroke for hitting a car?)

## 4. Installable PWA
GitHub Pages already serves the game over HTTPS, enabling browser motion permissions. Add a manifest and service worker if offline play or home-screen installation is needed.

## 5. Online multiplayer
The first milestone is a WebSocket room lobby with create/join, reconnect, and shared demo turns. It does not yet connect the playable golf simulation: the optional server shot/result messages are peer-reported and must not be treated as verified scoring. Next, move browser-dependent physics and rules into headless shared modules, seed gameplay randomness, and make the server own shot outcomes, scoring, and turns. Everyone then plays a real round on their own phone. The Pages client remains static while a separate service (such as Render) hosts live rooms.

## 6. More maps and a map pipeline
The current map was traced by hand from a satellite screenshot (px polylines and polygons in `world/`). Generalize:
- A map is a data file: roads, paths, woods, fields, houses, pools, named objects, start tee
- Optional: pull roads, footprints, and trees from OpenStreetMap for any address, then hand-fix
- Courses record which map they belong to (`map:'crystal-spring'` is already stored)

## 7. Scorekeeper mode (small, possibly high value)
For real-life rounds: log called holes and strokes per player, save the courses they actually play, and show running totals. No 3D. It could live inside the same app as a separate mode.

## Known issues / debt
- Stats, unlocks, and courses are per device (localStorage). A shared server would fix this.
- Golfers can walk through objects (no pathfinding); fine for now.
- Pads can overlap and create small steps between neighboring houses on slopes.
- The school's roof and floors are simple boxes; windows are on the east and south faces only.
- One house on Sea Wind is ~30 m from any road (the image was ambiguous there).
- The south street is assumed (it isn't in the satellite image).
- `safeCam()` is unused since fading replaced camera pull-in; remove it when revisiting camera code.
