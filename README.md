# Backyard Golf (alpha)

One-handed, call-your-own-hole golf through the Crystal Spring neighborhood. One club each, a beer in the other hand, and whoever wins the hole picks the next target: a tree trunk, a window, the slide, a soda can on the path.

- Play online: https://thevalleydev.github.io/backyard-golf/ (HTTPS enables phone motion controls).
- Phone swing: choose Phone, allow motion access, tap Swing, take the phone back while watching the meter, then swing it through its starting position. A quick flick alone will not hit the ball. Keep a firm grip or use a wrist strap.
- On mobile, starting a game unlocks sound; if your browser interrupts audio, tap the sound button to retry and hear a short test tone. Check the device's media volume if it remains silent.
- Play: open `index.html` through any web server (`npm run serve`), ideally on a phone.
- Call a hole by tapping a target on the map and choosing a rule. Optionally bank off or bounce on top of another target within 60 m (tap a highlighted map target or quick choice; "All nearby" opens the full list), or land on a path first. The chosen contact must happen before the called target **on the same shot**; a new swing resets the challenge. Saved courses retain the first target.
- Yards include playable play sets, kiddie pools, and vegetable gardens alongside the existing cars, grills, sheds, and hoops.
- The school playground has a climbable open dome, slide, swings, seesaw, monkey bars, and a sand landing zone.
- Test: `npm install && npm test`
- For Claude Code: start with `CLAUDE.md`, then `docs/ROADMAP.md` and `docs/DESIGN.md`.
- Map reference: `docs/satellite-crystal-spring.png` (map data is traced from it in image pixels, 1 px = 0.2 m).
