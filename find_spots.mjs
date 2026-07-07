// Dev tool (not part of the shipped game): derives the fixed set of captive
// locations hardcoded as CAPTIVE_SPOTS in src/city.js. Farthest-point
// sampling over every fully-open ground cell that's BFS-reachable from spawn
// (same walk rules as test/map.mjs), seeded with spawn and the original
// hand-placed NE yard so that yard stays one of the ten. Re-run and re-paste
// into city.js if the map or spawn position ever changes.
import { City, SIZE, HALF } from './src/city.js';

const city = new City();

const standable = (m, L) => {
  if (L > 0 && !((m >> (L - 1)) & 1)) return false;
  if (L < 6 && ((m >> L) & 1)) return false;
  return true;
};
const key = (ix, iz, L) => ((iz + HALF) * SIZE + (ix + HALF)) * 7 + L;

function bfs(startX, startZ, startL = 0) {
  const seen = new Set([key(startX, startZ, startL)]);
  const q = [[startX, startZ, startL]];
  while (q.length) {
    const [x, z, L] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const m = city.mask(nx, nz);
      if (m < 0) continue;
      for (let NL = 0; NL <= Math.min(L + 1, 6); NL++) {
        if (!standable(m, NL)) continue;
        const k = key(nx, nz, NL);
        if (!seen.has(k)) { seen.add(k); q.push([nx, nz, NL]); }
      }
    }
  }
  return seen;
}

const spawnCell = [Math.floor(city.spawnPos.x), Math.floor(city.spawnPos.z)];
const fromSpawn = bfs(...spawnCell);

const candidates = [];
for (let iz = -HALF + 2; iz < HALF - 2; iz++) {
  for (let ix = -HALF + 2; ix < HALF - 2; ix++) {
    if (city.mask(ix, iz) !== 0) continue; // fully open ground cell
    if (!fromSpawn.has(key(ix, iz, 0))) continue;
    const x = ix + 0.5, z = iz + 0.5;
    const dSpawn = Math.hypot(x - city.spawnPos.x, z - city.spawnPos.z);
    if (dSpawn < 15) continue; // must be a real trek
    let solidNeighbours = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (city.mask(ix + dx, iz + dz) !== 0) solidNeighbours++;
    }
    if (solidNeighbours < 1) continue; // skip wide-open desert-y cells, prefer pockets
    candidates.push({ x, z, dSpawn, solidNeighbours });
  }
}
console.log(`candidates: ${candidates.length}`);

// farthest-point sampling for spatial spread, seeded with spawn and the
// existing hand-placed yard (kept as one of the ten)
const chosen = [
  { x: city.spawnPos.x, z: city.spawnPos.z, seed: true },
  { x: city.captivePos.x, z: city.captivePos.z, seed: true },
];
const MIN_SEP = 18;

function minDistToChosen(c) {
  let best = Infinity;
  for (const s of chosen) best = Math.min(best, Math.hypot(c.x - s.x, c.z - s.z));
  return best;
}

while (chosen.length < 11) { // 2 seeds + 9 picks; + kept captivePos seed = 10 total
  let best = null, bestD = -1;
  for (const c of candidates) {
    const d = minDistToChosen(c);
    if (d > bestD) { bestD = d; best = c; }
  }
  if (!best || bestD < MIN_SEP) break;
  chosen.push(best);
}

const picks = chosen.filter((c) => !c.seed || (c.x === city.captivePos.x && c.z === city.captivePos.z));
for (const p of picks) {
  const dSpawn = Math.hypot(p.x - city.spawnPos.x, p.z - city.spawnPos.z);
  console.log(`new THREE.Vector3(${p.x}, 0, ${p.z}),  // dSpawn=${dSpawn.toFixed(1)}`);
}
console.log(`total picks: ${picks.length}`);
