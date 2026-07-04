# Reference pack: recreating the real Ant Attack (1983) city map

This is a technical brief for rebuilding the *exact* original ZX Spectrum city
(Antescher) inside the Three.js recreation, instead of a generic invented city.
It gives you a real, byte-level ground-truth data source — not a guess from
screenshots — which is the only way to correctly capture the holes, gaps and
tunnels in the walls that don't show up in a top-down photo.

## Why this works: the original map is literal voxel data, not a picture

The 1983 game stores its city as a **128 x 128 grid of vertical columns**, one
byte per column, in the top 16K of the Spectrum's 48K memory. Each byte's
**low 6 bits are a bitmask of 6 height levels** (bit 0 = ground level, bit 5 =
the highest possible block) — not a single "height" number. That means a
column can have a solid block, then a gap, then another solid block above it:
exactly the kind of mid-wall hole/void that's impossible to infer from a 2D
map image. Bit 7 flags "a sprite (ant/human) is currently in this column" and
should be ignored/masked off — it's runtime state, not architecture.

This has been independently confirmed by two separate sources, decades apart,
using two different snapshot formats:

- Ian (icemark.com), from disassembling the game's machine code: "The city...
  is mapped in the upper 16k of memory. Each vertical column is represented
  by one byte - there are 128x128 columns... the lower 6 bits indicate the
  presence of blocks at various heights - Bit 0 (LSB) is a block resting on
  the ground, Bit 5 is the highest block possible... Bit 7 (MSB) is a flag
  indicating there is a sprite somewhere in this column."
  http://www.icemark.com/dataformats/mirrors/3D%20Ant%20Attack.htm
- A working Unity C# loader (howardjones, gist) that reads a `.sna` snapshot
  and reconstructs the city verbatim:
  ```csharp
  int n = 32795 + x * 128 + z;         // offset into the .sna file
  if (map[n] > 0) {
      for (int m = 0; m < 6; m++) {
          if (IsBitSet(map[n], m)) {
              // place a 1x1x1 block at (x-64, m, z-64)
          }
      }
  }
  ```
  https://gist.github.com/howardjones/b4e4139c8f154797c1c58358138e9d34

  (32795 = 27-byte `.sna` header + 32768, and 32768 = the city data's start
  address 0xC000 minus the Spectrum RAM base address 0x4000. Both sources
  agree exactly on the bit-level format.)

The city layout itself is fixed/hand-authored — only the ants' and captive's
starting positions change between rounds — so a single decoded snapshot *is*
"the map," no matter which point in the game it was captured at.

## Step 1: Get an original snapshot file

Direct download (Internet Archive, public domain preservation copy):
```
https://archive.org/download/zx_Ant_Attack_1983_Quicksilva/Ant_Attack_1983_Quicksilva.z80
```
- Format: `.z80` snapshot, 27,339 bytes, md5 `927787d422b9b7b72f051bed3715a006`
- Item page: https://archive.org/details/zx_Ant_Attack_1983_Quicksilva

This is a compressed CPU+memory snapshot, not the map data itself — it needs
to be decompressed to get at the raw 48K memory image first (see Step 2).

Use this for a personal, non-commercial fan-recreation of the level geometry
only. Don't bundle/redistribute the original snapshot file itself in the
finished game — treat it purely as a one-time source for deriving the
(factual, non-copyrightable) column-height data.

## Step 2: Decompress the `.z80` snapshot to raw memory

`.z80` is a well-documented, stable format (unchanged since the 90s). Full
spec: http://rk.nvg.ntnu.no/sinclair/formats/z80-format.html

Summary:
- First 30 bytes: register header. Bytes 6-7 = PC.
  - If PC != 0: this is a **v1** file. Byte 12 bit 5 = 1 means the data
    after the header is RLE-compressed; the entire 48K RAM image follows as
    one compressed (or raw) block, terminated by the 4-byte marker
    `00 ED ED 00` if compressed.
  - If PC == 0: this is a **v2/v3** file. Bytes 30-31 give the length of an
    extra header (23 = v2.01, 54 = v3.0); after that extra header, memory
    comes as a sequence of independently-compressed 16K pages, each prefixed
    by `[2-byte length][1-byte page number]`. A length of `0xFFFF` means that
    page is stored uncompressed (16384 raw bytes, no end marker needed).
    In 48K mode: **page 4 = 0x8000-0xBFFF, page 5 = 0xC000-0xFFFF (this is
    the city data!), page 8 = 0x4000-0x7FFF**.
- RLE scheme (both cases): a run of `ED ED xx yy` decodes to byte `yy`
  repeated `xx` times. Only runs of 5+ identical bytes are ever encoded this
  way; a literal pair of `ED ED` in the source data is itself encoded as
  `ED ED 02 ED` so decoding never has to special-case it.

A first-draft Python implementation of this whole pipeline (download,
decompress, decode bits, dump JSON + a PNG preview) is in
`extract_ant_attack_map.py` alongside this file. **It has not been run
against the real file in this environment** (the sandbox that produced this
document has no route to archive.org for binary downloads) — treat it as a
strong starting point, not a verified tool. Run it, and if the decompressed
buffer isn't exactly 49,152 bytes, or the preview PNG doesn't look like a
walled city, fix the header/page parsing against the spec above before
trusting the output.

## Step 3: Decode the city grid

Once you have the raw 48K memory buffer (indexed so that offset 0 = Spectrum
address 0x4000):

- City data = bytes `0x8000` .. `0xBFFF` inclusive of that buffer (16,384
  bytes = 128 x 128).
- `column_byte(x, z) = buffer[0x8000 + x*128 + z]`, x and z both 0..127.
- For each column, for `level` in 0..5: `solid = bool(column_byte & (1 <<
  level))`. Ignore bit 7 (sprite-present flag — mask with `& 0x3F` first if
  you want to be safe).
- Recommended world-space mapping (matches the Unity reference loader):
  `world_x = x - 64`, `world_z = z - 64`, `world_y = level` (so the city is
  centered on the origin, one grid cell = one game-world unit horizontally,
  one level = one unit vertically). Scale up uniformly to match whatever
  block size the existing Three.js game already uses.

Output this as a plain JSON structure, e.g. a `128 x 128 x 6` nested boolean
array (or a more compact run-length/sparse list of `{x, z, level}` solid
cells — the real city is mostly walls and open streets, so a sparse list will
be far smaller than the dense array).

## Step 4: Validate against reference material

Because this is derived from disassembly notes and a fan re-implementation
rather than something tested against the live file here, cross-check the
decoded result visually before wiring it into gameplay:

- Render a top-down image (max solid level per column, as grayscale/height
  color) and compare its silhouette to the reference "map.gif" shown on the
  icemark.com page above — this image is described there as a direct
  rendering of this exact byte grid.
- Compare against an independent extraction of the same data: carlesoriol's
  "Antchester" OpenSCAD/3D-print model, which was built the same way (Python
  script pulling the map straight out of a `.sna` ROM image):
  https://www.thingiverse.com/thing:747098
- Cross-reference against a full-scale PC/Delphi remake of the game that
  ships its own hand-verified recreation of this exact map (plus a level
  editor and several bonus maps) — useful for eyeballing where the entrance
  gate, central courtyard, and tower shapes should be:
  https://github.com/steven-knock/ant-attack (see `maps/Antescher.map`,
  `doc/*.jpg`)
- Watch a longplay to see the real 3D geometry (gate location, rooftop gaps,
  jumpable ledges) in motion, since a flat image can hide vertical detail:
  - https://www.youtube.com/watch?v=wzhBg32dHCM
  - https://www.youtube.com/watch?v=nkCLit8Hs9A
- Background/history: https://en.wikipedia.org/wiki/Ant_Attack

## Step 5: Wire it into the existing Three.js game

- Treat the decoded grid as ground truth for **static level geometry only**
  (walls/buildings/streets). Keep ant spawn points, the captive's location,
  player start position, and the rescue/escort logic as your own game design
  decisions — the original randomizes/increases these between rounds anyway.
- For rendering performance, don't create one mesh per voxel naively for all
  ~16,384 columns x up to 6 levels — use greedy meshing (merge adjacent solid
  faces into larger rectangles) or `THREE.InstancedMesh` for the unit blocks.
- Preserve the bitmask exactly as decoded rather than collapsing each column
  to "height" — that's what keeps the mid-wall holes, arches and floating
  ledges that make the original city distinctive and that a flattened
  heightmap would silently erase.
