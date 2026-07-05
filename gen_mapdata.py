"""
Generate src/mapdata.js from the extraction pipeline's output.

Run extract_ant_attack_map.py first (produces ant_attack_map_dense.json),
then:  python3 gen_mapdata.py

Orientation (the ONLY transform between the snapshot and the game, keep it
here and nowhere else): the game grid swaps the raw snapshot's axis names --
game ix = raw z, game iz = raw x. That both puts the gate (raw x=127,
z=46..59) on the game's south edge (+z) and keeps the city unmirrored:
Sandy White's "(C) S W" signature glyphs in the game's north-west corner
must read correctly, not mirror-imaged -- that's the handedness check.
Because the snapshot stores column_byte(x, z) at offset x*128 + z and the
game indexes cols[(iz+64)*128 + (ix+64)], the swap makes the two linear
layouts identical: the emitted string is simply the 16384 city bytes in
original memory order, base64-alphabet encoded.
"""

import json

B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
SIZE = 128

HEADER = """\
// The real Ant Attack (1983) city of Antescher, extracted from the original
// ZX Spectrum snapshot (see ant_attack_original_map_extraction.md). 128x128
// columns; each char is a base64-alphabet digit encoding a 6-bit mask of
// solid unit blocks (bit 0 = ground level .. bit 5 = top). Row-major, index
// = iz*128+ix, cell (ix,iz) spans world [ix-64, ix-63) x [iz-64, iz-63).
// Axes are swapped vs the raw snapshot's naming (game x = raw z, game z =
// raw x) so the gate faces south (+z) and the city is unmirrored -- Sandy
// White's "(C) S W" signature in the north-west must read correctly. That
// swap equals raw memory order, so this string is the city's 16384 bytes
// verbatim (5560 solid voxels). Regenerate with gen_mapdata.py; don't edit.
export const MAP_SIZE = 128;
export const MAP_COLUMNS = (() => {
  const s =
"""

FOOTER = """\
  const lut = {};
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < 64; i++) lut[B64[i]] = i;
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = lut[s[i]];
  return out;
})();
"""


def main():
    dense = json.load(open("ant_attack_map_dense.json"))  # dense[raw_x][raw_z][level]
    lines = []
    for iz in range(SIZE):  # game row iz = raw x
        row = ""
        for ix in range(SIZE):  # game col ix = raw z
            mask = 0
            for level, solid in enumerate(dense[iz][ix]):
                if solid:
                    mask |= 1 << level
            row += B64[mask]
        lines.append(row)
    body = " +\n".join(f"  '{line}'" for line in lines) + ";\n"
    with open("src/mapdata.js", "w") as f:
        f.write(HEADER + body + FOOTER)
    solid = sum(bin(B64.index(c)).count("1") for line in lines for c in line)
    print(f"Wrote src/mapdata.js ({solid} solid voxels; expect 5560)")


if __name__ == "__main__":
    main()
