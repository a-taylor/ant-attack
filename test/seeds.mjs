// Reachability across many seeds: every generated city must let the player walk
// spawn -> prison interior and spawn -> gate (step up <= 1 block, drop any height).
// This is the invariant the ring road + unconditional prison clearing exist to protect;
// when it was violated, ~10% of seeds produced an unwinnable city.
import { City, SIZE } from '../src/city.js';

const SEEDS = 60;
let bad = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
  const city = new City(seed * 7919);
  const key = (x, z) => z * SIZE + x;
  const start = [Math.floor(city.spawnPos.x), Math.floor(city.spawnPos.z)];
  const seen = new Set([key(start[0], start[1])]);
  const q = [start];
  while (q.length) {
    const [x, z] = q.pop();
    const h = city.h(x, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
      if (city.h(nx, nz) - h > 1) continue;
      const k = key(nx, nz);
      if (!seen.has(k)) { seen.add(k); q.push([nx, nz]); }
    }
  }
  const okPrison = seen.has(key(Math.floor(city.prisonPos.x), Math.floor(city.prisonPos.z)));
  const okGate = seen.has(key(Math.floor(city.gatePos.x), Math.floor(city.gatePos.z)));

  // rooftops are the refuge from ants, so most building roofs (palette colors only —
  // perimeter/prison walls are unclimbable by design) must be walkable from spawn.
  // Carving stairs away used to drop the worst seed to ~79%; staircases placed after
  // carving keep every seed >= ~90%.
  let roof = 0, roofOk = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (city.heights[i] >= 2 && city.colorIdx[i] < 6) {
      roof++;
      if (seen.has(i)) roofOk++;
    }
  }
  const okRoofs = roofOk / roof >= 0.85;

  if (!okPrison || !okGate || !okRoofs) {
    bad++;
    console.log(`seed ${seed}: prison=${okPrison} gate=${okGate} roofs=${(roofOk / roof * 100).toFixed(1)}%`);
  }
}

console.log(bad === 0 ? `ALL ${SEEDS} SEEDS CONNECTED` : `${bad} BAD SEEDS`);
process.exit(bad ? 1 : 0);
