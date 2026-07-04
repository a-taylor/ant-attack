# CLAUDE.md

Browser-based 3D recreation of **Ant Attack** (ZX Spectrum, 1983, Sandy White) in Three.js.
Vanilla JS + Vite, no framework, no assets — all geometry, sound, and UI are generated in code.

## Commands

```sh
npm run dev      # Vite dev server
npm run build    # production build to dist/
npm run preview  # serve the build
npm test         # headless smoke tests (no browser needed)
```

## Tests

`npm test` runs two plain-Node scripts (no test framework):

- `test/smoke.mjs` — 19 checks on a fixed seed: city structure (gate open, prison doorway,
  OOB solid), BFS reachability spawn → prison → gate, and physics via `moveActor` simulation
  (walking stays on terrain, wall containment, 1-block step-up, ants blocked by 1-block
  steps, jump apex ≈ 1.4).
- `test/seeds.mjs` — 60 seeds: BFS reachability spawn → prison → gate, plus ≥85% of building
  roof cells walkable from spawn (guards the rooftop-refuge mechanic — carving used to delete
  staircases and drop the worst seed to ~79%). Generation bugs are seed-dependent
  (historically ~10% of seeds broke), so this is the one that catches them.

They import `src/city.js` directly into Node — City only touches Three.js math/geometry, never
the DOM or WebGL. Keep it that way or the tests stop working. Run `npm test` after any change
to `src/city.js`.

Full-gameplay verification (rescue, follow, win/lose, grenades) has been done ad hoc with
puppeteer-core driving headless Chrome against the dev server; `window.__game` (set at the
bottom of `src/main.js`) exposes game state for that purpose — keep it working. No linter is
configured.

## Architecture

The world is a **2.5D block heightmap**: `city.heights` is a `Uint8Array(SIZE*SIZE)` (SIZE=72)
where each cell is a column of unit cubes of that height. There are no overhangs or interiors.
Everything flows from this:

- **Rendering**: all exposed blocks go into one `InstancedMesh` (~6k instances) built once in
  `City.buildMeshes()`. Per-building color via `setColorAt`. Flat-shaded Lambert, no textures,
  no shadow maps (actors use blob shadows from `figures.js`).
- **Collision/physics**: `City.moveActor(actor, dt)` in `src/city.js` is the single shared
  kinematics routine for player, ants, and captive. Actors are `{pos, vel, radius, onGround}`
  with `pos.y` = feet height. Grounded actors auto-step up ≤1 block; taller columns block
  horizontally. Out-of-bounds cells report height 9, which is what keeps everyone inside the map.
- **Cells vs world**: cell `(ix, iz)` spans world `[ix, ix+1) × [iz, iz+1)`; centers are at `+0.5`.
  North = −z, the gate is in the south wall (+z), the prison in the north.

### Module map

| File | Role |
| --- | --- |
| `src/main.js` | Bootstrap, game state machine (`title/playing/won/lost`), win-lose rules, timer, wiring between modules. Owns the `game` object (lives, grenades, timeLeft). |
| `src/city.js` | City generation + `moveActor` physics + instanced mesh. Exports `SIZE`. |
| `src/player.js` | Camera-relative movement, jump, knockback/invuln. `facing` = last move dir, used to aim grenades. |
| `src/ants.js` | `AntManager` + `Ant`: wander → chase (range 12), sidestep-when-stuck, death anim, respawn after 15s via `city.randomStreetPos`. Ants are **ground-only** (they pass `maxStep: 0.06` to `moveActor`, so even 1-block steps stop them) and their bite has vertical tolerance < 1 block — rooftops are the player's refuge, faithful to the original. |
| `src/grenades.js` | Lob + bounce + fuse (1.1s) + blast (r=3.5). Damage is applied via the `onExplode` callback wired in main.js — grenades know nothing about ants. Explosion lights come from a fixed pool of 3 kept in the scene at intensity 0 — never add/remove lights at runtime, it changes the light count and recompiles every material (visible hitch). |
| `src/captive.js` | Waves until freed, then follow-the-leader with catch-up teleport past 24 units. |
| `src/camera.js` | `FollowCamera`: yaw/pitch/dist orbit, Q/E snaps `targetYaw` to 90° stops, smooth lerp. Its `forward`/`right` getters define movement axes for the player. |
| `src/figures.js` | Shared blocky-humanoid builder (player + captive), walk animation, blob shadows. |
| `src/hud.js` | DOM HUD (markup lives in `index.html`). `showEnd` replaces the overlay's innerHTML, destroying the title-screen markup — restart therefore goes straight to `playing`, never back to `title`. |
| `src/input.js` | Key state + edge-triggered `consumePressed` + pointer-drag accumulation. Uses `e.code` (`KeyW`, `Digit1`…). |
| `src/sfx.js` | WebAudio square-wave synth, lazily creates AudioContext on first use. |

## Generation invariants (don't break these)

`City.generate()` must always produce a city where spawn → prison interior → gate are mutually
reachable by walking (+1 step up allowed, any drop). This is guaranteed by construction:

1. A **ring road** (rows/cols 2, 3, SIZE−4, SIZE−3) is carved inside the wall *after* plots are
   placed — every street terminates at map edge, so the ring connects them all.
2. The prison clearing zeroes a 9×9 area **unconditionally** before placing its 3-high ring
   walls (a previous `!== WALL_H` guard let 5-tall building remnants block the door — bug, fixed).
3. The gate approach pocket is carved after plots.
4. External **staircases are placed last**, after all carving (ring road, gate pocket, prison) —
   carving placed-stairs used to leave flat roofs unreachable. Stairs may land on the ring road;
   an ascending 1-block-per-cell strip is still walkable both ways, so connectivity holds. The
   stair-side `R()` call stays inside the plot loop to keep the RNG stream (and thus every
   seed's layout) stable.

If you touch generation, run `npm test` — `test/seeds.mjs` verifies reachability across 60
seeds. Single-seed testing is not enough (~10% of seeds broke when invariant 2 was violated).

## Tuning constants that interact

- Jump velocity 8.6 with gravity 25 → apex ≈ 1.4 blocks: clears 1-block ledges mid-air, never 2.
- Prison walls are 3 high, perimeter wall 5 — both deliberately unclimbable (step ≤1, jump <2).
- Grenade fuse 1.1s / throw speed 7.5 / blast 3.5 are tuned together so a lob intercepts an ant
  charging at CHASE_SPEED 2.7 from ~6–9 units. Lengthening the fuse makes grenades whiff.
- Camera pitch 0.95 rad at dist 15 is the minimum-ish elevation that still sees over the 5-high
  south wall when the player stands at spawn; lowering it hides the player behind the wall.

## Conventions

- Actor meshes have origin at the feet; `visualY` lerps toward `pos.y` so 1-block step-ups read
  as hops instead of teleports (`vel.y < -2` snaps it for falls).
- Retro aesthetic is deliberate: near-monochrome palette, `antialias: false`, fog, scanline
  overlay div, DOM-based HUD in `index.html`'s `<style>`. Don't add textures or PBR materials.
- All UI text is uppercase, in-fiction ("ANTESCHER"), styled monospace.
