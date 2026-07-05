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

`npm test` runs two plain-Node scripts (no test framework):

- `test/smoke.mjs` — 20 checks: map-data landmarks (gatehouse low wall, the captive yard's
  ant-sized ground arch, canopy roof, OOB solid, exact 5560 voxel count), and physics via
  `moveActor` simulation on real map features (walking stays on terrain, wall containment,
  step over the 1-high gate wall, ants blocked by that same step but crawling through the
  1-block arch the player is too tall for, walking under a canopy, head-bump on an arch
  underside, jump apex ≈ 1.4).
- `test/map.mjs` — voxel-aware BFS (stand levels + 2-level headroom, step ≤ 1, drop any):
  spawn → captive yard → gate mutually reachable, ≥99% of ground cells connected, and
  enough elevated ant-proof stands reachable (rooftop-refuge mechanic).

They import `src/city.js` directly into Node — City only touches Three.js math/geometry, never
the DOM or WebGL. Keep it that way or the tests stop working. Run `npm test` after any change
to `src/city.js`.

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
  ceilings: blocks overhead either block or are walked under, so the player/captive (1.5)
  need 2 clear levels while ants (0.9) crawl through 1-block holes. Out-of-bounds is
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
| `src/main.js` | Bootstrap, game state machine (`title/playing/won/lost`), win-lose rules, timer, wiring between modules. Owns the `game` object (lives, grenades, timeLeft). |
| `src/city.js` | Map loader (from `src/mapdata.js`) + `moveActor` physics + voxel queries (`mask`, `floorUnder`, `ceilingAbove`, `solidAt`, `canOccupy`) + instanced mesh. Owns `spawnPos`/`captivePos`/`gatePos` (design choices layered on the real geometry). Exports `SIZE` (128) and `HALF` (64). |
| `src/mapdata.js` | Generated file: the extracted original city as a base64-alphabet string, one char per column mask. Regenerate via the extraction pipeline; don't hand-edit. |
| `src/player.js` | Camera-relative movement, jump, knockback/invuln. `facing` = last move dir, used to aim grenades. |
| `src/ants.js` | `AntManager` + `Ant`: wander → chase (range 12), sidestep-when-stuck, death anim, respawn after 15s via `city.randomStreetPos`. Ants are **ground-only** (they pass `maxStep: 0.06` to `moveActor`, so even 1-block steps stop them) and their bite has vertical tolerance < 1 block — rooftops are the player's refuge, faithful to the original. |
| `src/grenades.js` | Lob + bounce + fuse (1.1s) + blast (r=3.5). Damage is applied via the `onExplode` callback wired in main.js — grenades know nothing about ants. Explosion lights come from a fixed pool of 3 kept in the scene at intensity 0 — never add/remove lights at runtime, it changes the light count and recompiles every material (visible hitch). |
| `src/captive.js` | Waves until freed, then follow-the-leader with catch-up teleport past 24 units. |
| `src/camera.js` | `FollowCamera`: yaw/pitch/dist orbit, Q/E snaps `targetYaw` to 90° stops, smooth lerp. Its `forward`/`right` getters define movement axes for the player. |
| `src/figures.js` | Shared blocky-humanoid builder (player + captive), walk animation, blob shadows. |
| `src/hud.js` | DOM HUD (markup lives in `index.html`). `showEnd` replaces the overlay's innerHTML, destroying the title-screen markup — restart therefore goes straight to `playing`, never back to `title`. |
| `src/input.js` | Key state + edge-triggered `consumePressed` + pointer-drag accumulation. Uses `e.code` (`KeyW`, `Digit1`…). |
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
  sides, open to the west — its south wall has a real 1-block ground arch only ants fit
  through.

If you touch `src/city.js` physics or the key positions, run `npm test`.

## Tuning constants that interact

- Jump velocity 8.6 with gravity 25 → apex ≈ 1.4 blocks: clears 1-block ledges mid-air, never 2.
- Actor body heights: player/captive 1.5 (fits 2-level arches), ants 0.9 (fits 1-level holes).
  Raising the player's past 2.0 seals real doorways; lowering it under 1.0 lets the player
  crawl through ant holes and trivialize the yard.
- The captive yard's walls are 5–6 high, the perimeter wall 2–6 — unclimbable (step ≤1, jump <2).
- Grenade fuse 1.1s / throw speed 7.5 / blast 3.5 are tuned together so a lob intercepts an ant
  charging at CHASE_SPEED 2.7 from ~6–9 units. Lengthening the fuse makes grenades whiff.
- Camera pitch 0.95 rad at dist 15 is the minimum-ish elevation that still sees over the
  gatehouse walls when the player stands at spawn; lowering it hides the player behind them.

## Conventions

- Actor meshes have origin at the feet; `visualY` lerps toward `pos.y` so 1-block step-ups read
  as hops instead of teleports (`vel.y < -2` snaps it for falls).
- Retro aesthetic is deliberate: near-monochrome palette, `antialias: false`, fog, scanline
  overlay div, DOM-based HUD in `index.html`'s `<style>`. Don't add textures or PBR materials.
- All UI text is uppercase, in-fiction ("ANTESCHER"), styled monospace.
