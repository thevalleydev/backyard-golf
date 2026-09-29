# Design: rules, tuning, and decisions so far

## The real-life game this models

- Each person grabs one club and plays one-handed. Usually right-handed stance, right arm, beer in the left hand.
- There's no course. Whoever wins a hole calls the next target: a sign, a tree trunk, "between the sign posts", the slide, a piece of trash.
- Played on a paved path that runs behind houses through Crystal Spring Park, past Haverhill Elementary, and through a patch of woods that's rough to play through.

## Rules as implemented

- **Players:** 1–4, pass-and-play on one phone. Every golfer is visible in the world and jogs to their ball.
- **Clubs:** 8-iron, 9-iron, pitching wedge only (Brad: nothing else). Loft is adjustable per shot with ▲/▼ (bump-and-run to flop).
- **Calling:** the caller taps a target on the overhead map (pan, pinch, tap), then picks a rule. 🎲 picks one at random. There is no target list anymore, only the map.
- **Honors:** the hole winner calls the next one. Ties rotate.
- **Tee:** after a hole, everyone restarts from one shared spot a few meters off the last target, on the side the winner approached from.
- **Early finish:** once someone holes out in N strokes, anyone already at N strokes without finishing is out and scores N+1. Players below N keep going and can tie.
- **No out of bounds, no penalty strokes, no stroke cap** (Brad's rules). The scorecard has "end this hole now" as a manual escape.
- **Rule types:**
  - Hit it (any contact, optionally a specific part: trunk, branches, net, post, lid).
  - Through/into a zone: sign-post gaps, under the table, goal mouth, climbing-wall holes, cornhole holes, tire swing, hoops, pools, sand, court.
  - Hit the top surface (tabletop, lid, platform, shed roof). This replaced "stop on top", which was near impossible.
  - Break glass (house, car, school windows).
- **Stats:** 6 points across Power, Accuracy, Consistency (0–4 each).
  - Each shot draws a normal-distributed direction and distance error from those stats, capped at 2.5σ.
  - Mishits (thin/fat/shank) come from Consistency.
  - Stance sets the miss side: one-handed swings leave the face open, so a right stance leans right. That's a mirror image, not an advantage.
- **Swing arm vs stance** are separate settings. The swing arm is cosmetic for now.
- **Hand items:** default are beer, red cup, hot dog, behind back. Unlockable from play stats (per device): pizza, corn dog, coffee, ice cream, phone, turkey leg, stolen gnome, trophy. Players sip/bite periodically; the hot dog visibly shrinks.
- **Courses:** save the exact sequence of holes (target, rule, tee spot) and replay it later.
- **Multiplayer tees:** stage golfers 1.8 m apart around the tee spot on the first hole, later holes, and saved-course replays. New tees must clear every ball and golfer, not just the center.
- **Shot challenges:** after choosing a rule, the caller can select any solid nearby object (within 60 m) to bank off, select one to bounce on top of, or require a path landing before the target on the same shot. The object picker opens on the map with highlighted targets and four quick choices; the complete list is optional. A first-contact notification confirms the requirement was met. Each shot starts with the requirement unmet; saved courses replay the selected object. Legacy saved house-bank calls still work.

## Controls

- **Swipe (default):** thumb down anywhere in the bottom ~45% of the screen.
  - Pull down = backswing. How far you pull sets power; about a quarter screen is 100%. A live gauge and the golfer's club both follow.
  - Flick up = hit. A lazy flick loses up to 40%.
  - Sideways drift = push/pull; a bowed flick = hook/slice (sideways force while airborne). Accuracy damps both.
  - Brad's feedback that shaped this: the earlier version measured flick *speed* for power and used a small pad. It "didn't translate", and the backswing wasn't shown live because of a bug. Distance-based power fixed it.
- **Button:** hold, release on an oscillating meter.
- **Phone:** tap to arm, then take the phone back and swing it through its starting position. Gyroscope rotation on the takeback axis drives the live meter and golfer's club. A short flick cannot fire a shot: the backswing must cover at least 35° over 180 ms, followed by a through-swing past the start. Power comes primarily from backswing distance, with a tempo adjustment for through-swing speed. Requires motion permission and HTTPS.

## Tuning values worth knowing

| Thing | Value |
|---|---|
| Ball radius (physics) | 0.15 m (oversized on purpose) |
| Club speeds at full power | 8i 24, 9i 21, PW 18 m/s; stock launch 20°, 25°, 31° |
| Opening the face | −0.6% speed per degree above stock |
| Rolling decel | grass 2.6, path/road 1.3, woods 4.5, sand 9, water 14 m/s² |
| Leaf drag | `exp(-dt·(1.1 + 0.05·speed))` inside a canopy |
| Glass breaks | impact normal speed > 6 m/s |
| Swipe | full power at 26% of screen height pulled; tempo threshold 0.9 / 1.4 / 2.0 screens/s (Easy/Normal/Hard) |
| Terrain | −0.6 to +1.2 m, max slope ~14° (always below rolling friction, so balls always stop) |

**Known tuning smell:** full-power shots on open grass roll a long way (a 9-iron can total ~55–60 m). Grass friction is probably too low; worth a playtest before changing.

## Look

- Toon shading (3-tone ramp), black inverted-hull outlines, warm late-afternoon light, long real shadows, ball tracer in the player's color.
- Chunky cut-out golfers with a big one-handed follow-through and body twist.
- Blockers between the camera and the golfer fade to 20% (trees swap to a ghost copy).
- The rule is always visible in three places: the top-bar headline, a hole card at the start of each hole, and a label floating above the target arrow.
