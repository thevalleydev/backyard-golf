# Backyard Golf (alpha)

One-handed, call-your-own-hole golf through the Crystal Spring neighborhood. One club each, a beer in the other hand, and whoever wins the hole picks the next target: a tree trunk, a window, the slide, a soda can on the path.

- Play online: https://thevalleydev.github.io/backyard-golf/ (HTTPS enables phone motion controls).
- Phone swing: choose Phone, allow motion access, tap Swing, take the phone back while watching the meter, then swing it through its starting position. A quick flick alone will not hit the ball. Keep a firm grip or use a wrist strap.
- On mobile, starting a game unlocks sound; if your browser interrupts audio, tap the sound button to retry and hear a short test tone. Check the device's media volume if it remains silent.
- Play locally: `npm ci && npm run dev`, then open the Vite URL (use HTTPS for phone motion controls). Opening `index.html` directly as a file is not supported. `npm run preview` serves the production build at `/backyard-golf/`.
- Online rooms (preview): the setup screen can create/join a room, show connected players, reconnect, and demonstrate shared turns. **Golf shots and scores are not networked yet**; use Tee off for the local game. The room button appears locally or when `ROOM_SERVER_URL` is configured for Pages; until then, add `?rooms=1` to the public game URL to try a server URL manually. Room state is in memory and is lost when the server restarts.
- Call a hole by tapping a target on the map and choosing a rule. Optionally bank off or bounce on top of another target within 60 m (tap a highlighted map target or quick choice; "All nearby" opens the full list), or land on a path first. The chosen contact must happen before the called target **on the same shot**; a new swing resets the challenge. Saved courses retain the first target.
- Yards include playable play sets, kiddie pools, and vegetable gardens alongside the existing cars, grills, sheds, and hoops.
- The school playground has a climbable open dome, slide, swings, seesaw, monkey bars, and a sand landing zone.
- Verify: `npm test && npm run typecheck && npm run build`; preview the production bundle with `npm run preview`.
- GitHub Pages: Vite builds `index.html` into `dist/` with base `/backyard-golf/`. Pages uses GitHub Actions; pushes to `main` test, build, and deploy automatically, while pull requests test and build without deploying. The previous single-file game remains available in Git history if a rollback is needed.
- Source: all application modules in `src/` are strictly checked TypeScript. Shared config/map data/terrain/collision/shot models have no browser globals; `world.ts` constructs the world and colliders, while `ui.ts` handles setup, screens, turns and saved courses. The imported-module smoke suite exercises the browser modules in jsdom; it does not replace a real-phone playtest.
- For Claude Code: start with `CLAUDE.md`, then `docs/ROADMAP.md` and `docs/DESIGN.md`.
- Map reference: `docs/satellite-crystal-spring.png` (map data is traced from it in image pixels, 1 px = 0.2 m).

## Room server (preview)

Run `npm ci && npm run build:server && npm run start:server`, then `npm run dev` in a second terminal. The room screen on localhost connects to `ws://localhost:3000` by default; two tabs can create and join a room, reconnect, and advance the demo turn. Run `npm run test:server` for backend integration tests. `PORT` controls the HTTP/WebSocket port, and `GET /healthz` reports server health.

To host rooms on Render, create a **Node Web Service** from this repository (not a Static Site). [render.yaml](./render.yaml) can provision one on the free plan; if you already created a Web Service, set its build command to `npm ci --include=dev && npm run build:server`, start command to `npm run start:server`, health check to `/healthz`, and `CLIENT_ORIGIN=https://thevalleydev.github.io`. Render supplies `PORT`. Once the service responds at its HTTPS URL, set the GitHub Actions repository variable `ROOM_SERVER_URL` to its `wss://` URL and redeploy Pages; alternatively enter that URL directly in the room dialog. Room codes and reconnect credentials live only in server memory; server restarts invalidate them. The room screen does not yet synchronize the playable golf simulation.
