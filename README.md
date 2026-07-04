# ANT ATTACK

A browser-based 3D recreation of **Ant Attack** (ZX Spectrum, 1983, by Sandy White),
built with Three.js. Giant ants have overrun the walled city of Antescher; someone
is trapped inside. Rescue them and escort them back out through the south gate
before the timer runs out.

## Run it

```sh
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

`npm test` runs headless smoke tests (city generation, physics, and
reachability across 60 random seeds) — no browser required.

## How to play

- Pick **Sandy** (`1`) or **Sandra** (`2`) on the title screen, then press **Enter**.
- The captive is held in a walled prison in the **north** of the city. Walk in
  through its doorway to free them — they'll follow you.
- Bring both of you back to the **south gate** (marked with gold posts) to win.

### Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | Move (relative to the camera) |
| `Space` | Jump — clears gaps and lets you drop between rooftops |
| `G` | Lob a grenade in the direction you're facing |
| `Q` / `E` | Snap the camera 90° left / right |
| Mouse drag | Free-orbit the camera |
| `R` | Restart after game over / victory |

Walking up single-block steps is automatic — use ziggurat tiers and the external
staircases on flat-roofed buildings to reach the rooftops. Ants cannot climb, so
as in the original, height is your refuge: get even one block up and they can
only mill around beneath you.

## Rules

- **5 lives** — an ant bite (or being caught in your own blast) costs one.
- **5:00 timer** — game over when it hits zero.
- **20 grenades** — a blast kills every ant in its radius. Killed ants respawn
  elsewhere in the city after a while, so keep moving.

## Code layout

| Module | Responsibility |
| --- | --- |
| `src/city.js` | Procedural walled city on a block heightmap: streets, ziggurats, staircases, prison, gate. Also owns the shared grid-collision physics (`moveActor`) and renders all blocks as one `InstancedMesh`. |
| `src/player.js` | Player controller: camera-relative movement, jumping, step-up climbing, knockback/invulnerability. |
| `src/ants.js` | Ant AI (wander → chase within range, sidestep when stuck), blocky ant meshes, death/respawn. |
| `src/grenades.js` | Lobbed projectiles with bouncing, fuse, blast damage callback and explosion VFX. |
| `src/captive.js` | The prisoner: waves for help, then follow-the-leader pathing once freed. |
| `src/camera.js` | Third-person follow camera with 90° snap rotation and drag orbit. |
| `src/main.js` | Game state machine (title / playing / won / lost), win-lose rules, timer, wiring. |
| `src/hud.js`, `src/figures.js`, `src/sfx.js`, `src/input.js` | DOM HUD, shared blocky-humanoid builder, WebAudio blips, keyboard/pointer input. |

Every city is freshly generated per page load and verified reachable
(spawn → prison → gate) by construction: a ring road inside the perimeter wall
connects every street.
