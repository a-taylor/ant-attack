# CLAUDE.md

Browser-based 3D recreation of **Ant Attack** (ZX Spectrum, 1983, Sandy White) in Three.js.
Vanilla JS + Vite, no framework, no assets — all geometry, sound, and UI are generated in code.
The city is the **real Antescher**, byte-extracted from the original ZX Spectrum snapshot
(see `ant_attack_original_map_extraction.md` and `extract_ant_attack_map.py`; regenerate
`src/mapdata.js` from their JSON output with `gen_mapdata.py` — the axis mapping lives there
and nowhere else).

## Commands

```sh
npm run dev      # Vite dev server
npm run build    # production build to dist/
npm run preview  # serve the build
npm test         # headless smoke tests (no browser needed)
```

## Tests

`npm test` runs three plain-Node scripts (no test framework):

- `test/smoke.mjs` — 20 checks: map-data landmarks (gatehouse low wall, the captive yard's
  ant-sized ground arch, canopy roof, OOB solid, exact 5560 voxel count), and physics via
  `moveActor` simulation on real map features (walking stays on terrain, wall containment,
  step over the 1-high gate wall, ants blocked by that same step but crawling through the
  1-block arch — and the player crawling through it too, walking under a canopy, head-bump
  on an arch underside, jump apex ≈ 1.4).
- `test/map.mjs` — voxel-aware BFS (stand levels + 1-level headroom, step ≤ 1, drop any):
  spawn → captive yard → gate mutually reachable, all 10 fixed `captiveSpots` reachable
  both from spawn and back to the gate, ≥99% of ground cells connected, and enough
  elevated ant-proof stands reachable (rooftop-refuge mechanic).
- `test/features.mjs` — gameplay mechanics against a stub scene (`{add(){}, remove(){}}`):
  ant paralysis (blast kill-vs-stun radii, stomp then crush, wake-up timer, standing on a
  stunned ant via `moveActor`'s `support` option), charged-throw tiers and their landing
  ranges, and captive health/invuln/respawn.

They import `src/city.js` (and, for features, `src/ants.js`/`src/grenades.js`/`src/captive.js`)
directly into Node — these modules only touch Three.js math/geometry, never the DOM or WebGL
(`sfx()` swallows the missing AudioContext). Keep it that way or the tests stop working. Run
`npm test` after any change to `src/city.js`.

Full-gameplay verification (rescue, follow, win/lose, grenades) has been done ad hoc with
puppeteer-core driving headless Chrome against the dev server; `window.__game` (set at the
bottom of `src/main.js`) exposes game state for that purpose — keep it working. No linter is
configured.

## Architecture

The world is a **voxel column grid**, not a heightmap: `src/mapdata.js` holds the original
game's 128×128 city, one 6-bit mask per column (bit 0 = ground block … bit 5 = top). Masks,
not heights — mid-wall holes, arches, canopies-on-pillars and floating ledges are real
original architecture and must be preserved (836 columns have gaps below solid blocks).
Everything flows from this:

- **Rendering**: every solid voxel (exactly 5560) goes into one `InstancedMesh` built once in
  `City.buildMeshes()`. Per-building color via flood-filled connected components +
  `setColorAt`; border-touching components get the wall color. Flat-shaded Lambert, no
  textures, no shadow maps (actors use blob shadows from `figures.js`).
- **Collision/physics**: `City.moveActor(actor, dt, {gravity, maxStep, height})` in
  `src/city.js` is the single shared kinematics routine for player, ants, and captive.
  Actors are `{pos, vel, radius, onGround}` with `pos.y` = feet height. Grounded actors
  auto-step up ≤1 block. `height` is the body height used for horizontal blocking and
  ceilings: blocks overhead either block or are walked under. Player/captive (0.98) and
  ants (0.9) all fit through 1-block holes, as in the original. Out-of-bounds is
  infinitely solid, which is what keeps everyone inside the map.
- **Cells vs world**: world is centered on the origin — cell `(ix, iz)`, `ix/iz` in
  −64…63, spans world `[ix, ix+1) × [iz, iz+1)`; centers are at `+0.5`. North = −z. The
  map's axes are swapped vs the raw snapshot's naming (game x = raw z, game z = raw x) so
  the city gate faces south (+z) and the city is unmirrored — Sandy White's "© S W"
  signature glyphs in the north-west corner must read correctly, not mirror-imaged.
  The captive yard is in the north-east.

### Module map

| File | Role |
| --- | --- |
| `src/main.js` | Bootstrap, game state machine (`title/playing/won/lost`), win-lose rules, timer, wiring between modules. Owns the `game` object (lives, grenades, timeLeft, `rescued`/`spotQueue`/`currentSpot` for the 10-round rescue cycle) and the scan-indicator facing check. |
| `src/city.js` | Map loader (from `src/mapdata.js`) + `moveActor` physics + voxel queries (`mask`, `floorUnder`, `ceilingAbove`, `solidAt`, `canOccupy`) + instanced mesh. Owns `spawnPos`/`captivePos`/`gatePos` and the 10-entry `captiveSpots` (+ `shuffledCaptiveSpots()`) — design choices layered on the real geometry. Exports `SIZE` (128) and `HALF` (64). |
| `src/mapdata.js` | Generated file: the extracted original city as a base64-alphabet string, one char per column mask. Regenerate via the extraction pipeline; don't hand-edit. |
| `src/player.js` | Grid-axis movement (via the camera's snapped basis), jump, knockback/invuln. `facing` = last move dir, used to aim grenades. |
| `src/ants.js` | `AntManager` + `Ant`: wander → chase (range 12), sidestep-when-stuck, death anim, respawn after 15s via `city.randomStreetPos`. Ants are **ground-only** (they pass `maxStep: 0.06` to `moveActor`, so even 1-block steps stop them) and their bite has vertical tolerance < 1 block — rooftops are the player's refuge, faithful to the original. Stun state (`stunTimer`/`paralyse()`): stomped or blast-ring ants grey out and go inert for `STUN_TIME` 10s, can't bite (`touching` skips them), and their backs are standable (`supportAt` → `moveActor`'s `support`); a second stomp or a kill-radius blast finishes them. Stunned ants never block other ants — that's what keeps the captive threatenable. |
| `src/grenades.js` | Lob + bounce + fuse (1.1s) + two blast radii: kill 3.5 / stun ring 5.5. Damage is applied via the `onExplode(pos, killR, stunR)` callback wired in main.js — grenades know nothing about ants. Throw distance comes from `THROW_TIERS` (hold-G charge, `tierForHold`), a charge take on the original's S/D/F/G four distances. Explosion lights come from a fixed pool of 3 kept in the scene at intensity 0 — never add/remove lights at runtime, it changes the light count and recompiles every material (visible hitch). |
| `src/captive.js` | Waves until freed, then follow-the-leader with catch-up teleport past 24 units. Has 3 health with the player's knockback/invuln pattern (`hit()`); main.js resets them to the yard, un-freed, at 0 health — no player-life penalty, redoing the rescue is the cost. |
| `src/camera.js` | `FollowCamera`: yaw/pitch/dist orbit, Q/E snaps `targetYaw` between the four grid-diagonal stops (45°/135°/…, exported `DIAGONAL`) — corner-on two-face views like the original's, never face-on. Its `forward`/`right` getters are the player's movement axes and are **snapped to the city grid** (`moveYaw` = view yaw rounded down to its quadrant), so single keys walk city axes (screen diagonals) and combos walk city diagonals — not the raw view direction. |
| `src/figures.js` | Shared blocky-humanoid builder (player + captive), walk animation, blob shadows. |
| `src/hud.js` | DOM HUD (markup lives in `index.html`). `showEnd` replaces the overlay's innerHTML, destroying the title-screen markup — restart therefore goes straight to `playing`, never back to `title`. |
| `src/input.js` | Key state + edge-triggered `consumePressed`/`consumeReleased` (release edges drive the hold-to-charge throw) + pointer-drag accumulation. Uses `e.code` (`KeyW`, `Digit1`…). |
| `src/sfx.js` | WebAudio square-wave synth, lazily creates AudioContext on first use. |

## Map invariants (don't break these)

The static geometry is the original game's data — treat `src/mapdata.js` as read-only ground
truth. Never "fix" the city by editing masks; if something seems wrong, suspect the loader,
the axis mapping in `gen_mapdata.py`, or the physics instead. Key positions are design
choices in `City`'s
constructor, chosen so spawn → captive yard → gate are mutually reachable by walking
(step ≤ 1, any drop; `test/map.mjs` proves it):

- **Spawn** (−11.5, 0, 55.5): just inside the gatehouse — a low 1-high wall the player (but
  not ants) can step over, flanked by 3–5 high walls, opening through the south map edge.
- **Gate zone** = the walled gatehouse pocket (z > 59.2, −19 < x < −3, y < 1.5).
- **Captive** (50.5, 0, −48.5): a yard in the far north-east walled 5–6 high on three
  sides, open to the west — its south wall has a real 1-block ground arch that ants and
  the player alike crawl through. Kept as `captivePos` and as one of `captiveSpots`.
- **Captive spots** (`City.captiveSpots`, 10 entries incl. `captivePos`): the original
  had "10 different levels... the hostage located in a different, harder-to-reach part
  of the city" each time — captured here as 10 fixed, hand-picked open-ground cells,
  each ≥15 units from spawn and BFS-reachable both from spawn and to the gate (see
  `find_spots.mjs`, a farthest-point sampling dev tool, not part of the shipped game).
  `main.js` shuffles this list once per playthrough (`City.shuffledCaptiveSpots()`) and
  pops one per round — no repeats until the shuffle is exhausted.

If you touch `src/city.js` physics or the key positions, run `npm test`.

## Tuning constants that interact

- Jump velocity 8.6 with gravity 25 → apex ≈ 1.4 blocks: clears 1-block ledges mid-air, never 2.
- Actor body heights: player/captive 0.98, ants 0.9 — everyone fits 1-block holes, faithful
  to the original. Keep the player's just under 1.0: at exactly 1.0 `canOccupy`'s strict
  less-than sits on a float knife edge, and past it the ant arches seal up again. What keeps
  ants out of the gate pocket is their `maxStep` 0.06, not height. The humanoid visual is
  scaled to 0.96 in `figures.js` (FIG_SCALE) so it fits under arches without clipping, and
  grenades release from y+0.7 (main.js) — below any 1-block arch ceiling.
- The captive yard's walls are 5–6 high, the perimeter wall 2–6 — unclimbable (step ≤1, jump <2).
- Grenade fuse 1.1s / tier-1 throw speed 7.5 / kill radius 3.5 are tuned together so a
  medium lob intercepts an ant charging at CHASE_SPEED 2.7 from ~6–9 units. Lengthening the
  fuse makes grenades whiff. `THROW_TIERS` [4, 7.5, 11, 14.5] land at ≈4/7/11/14 units;
  the stun ring 5.5 must stay well past kill 3.5 or near-misses become free kills.
- Stun mechanics: `ANT_TOP` 0.9 = the ant's physics height, so standing on a stunned ant's
  back clears the bite's <0.8 vertical tolerance — same refuge rule as a 1-block ledge.
  The stomp trigger (fall speed > 5) must stay above the stomp bounce (4), or landing from
  the bounce would instantly crush the ant you just stunned.
- Camera pitch 0.95 rad at dist 15 is the minimum-ish elevation that still sees over the
  gatehouse walls when the player stands at spawn (verified from the diagonal views too);
  lowering it hides the player behind them.
- Scan indicator threshold: `dot(player.facing, toTarget) > 0.5` (±60° cone), matching
  the original's "turn green if facing the direction of a survivor" — generous because
  `facing` is the camera-relative grid movement direction, not raw view yaw, so it only
  has as many distinct values as the move-input combinations allow.

## Conventions

- Actor meshes have origin at the feet; `visualY` lerps toward `pos.y` so 1-block step-ups read
  as hops instead of teleports (`vel.y < -2` snaps it for falls).
- Retro aesthetic is deliberate: near-monochrome palette, `antialias: false`, fog, scanline
  overlay div, DOM-based HUD in `index.html`'s `<style>`. Don't add textures or PBR materials.
- All UI text is uppercase, in-fiction ("ANTESCHER"), styled monospace.
