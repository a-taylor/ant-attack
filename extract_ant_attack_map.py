"""
Extract the original Ant Attack (ZX Spectrum, 1983, Sandy White) city map
from an official preservation snapshot, and decode it into the exact
voxel/column data the game engine used.

STATUS: first-draft implementation, written from the documented .z80 format
spec and cross-checked against an independent Unity loader's offset formula
(see ant_attack_original_map_extraction.md). It has NOT been executed against
the real file yet in the environment that wrote it (no route to archive.org
for binary downloads there). Run it here, sanity check the output (see
`sanity_check()` at the bottom), and fix the header/page parsing against
http://rk.nvg.ntnu.no/sinclair/formats/z80-format.html if anything looks off
-- most likely failure mode is picking the wrong branch (v1 vs v2/v3) or an
off-by-one in the RLE decompressor.

Usage:
    python extract_ant_attack_map.py
Produces:
    ant_attack.z80          - downloaded snapshot (cached)
    ant_attack_map.json      - sparse list of solid voxels: [x, z, level]
    ant_attack_map_dense.json - full 128x128x6 boolean array (bigger, easier to eyeball)
    map_preview.png          - top-down height-shaded preview for visual validation
"""

import json
import os
import struct
import urllib.request

SNAPSHOT_URL = "https://archive.org/download/zx_Ant_Attack_1983_Quicksilva/Ant_Attack_1983_Quicksilva.z80"
EXPECTED_MD5 = "927787d422b9b7b72f051bed3715a006"
SNAPSHOT_PATH = "ant_attack.z80"

CITY_GRID_SIZE = 128
CITY_HEIGHT_LEVELS = 6
CITY_OFFSET_IN_RAM = 0x8000  # 0xC000 (city data start) - 0x4000 (RAM base)


def download_snapshot(path=SNAPSHOT_PATH, url=SNAPSHOT_URL):
    if not os.path.exists(path):
        print(f"Downloading {url} ...")
        urllib.request.urlretrieve(url, path)
    import hashlib
    with open(path, "rb") as f:
        data = f.read()
    md5 = hashlib.md5(data).hexdigest()
    if md5 != EXPECTED_MD5:
        print(f"WARNING: md5 mismatch. Got {md5}, expected {EXPECTED_MD5}. "
              f"File may differ from the one this pipeline was written against.")
    return data


def _rle_decompress(buf, start, end, stop_at_end_marker):
    """Decode ED ED xx yy -> yy repeated xx times, starting at buf[start:end)."""
    out = bytearray()
    i = start
    n = end
    while i < n:
        if stop_at_end_marker and i + 3 < n and buf[i] == 0x00 and buf[i + 1] == 0xED \
                and buf[i + 2] == 0xED and buf[i + 3] == 0x00:
            break
        if i + 1 < n and buf[i] == 0xED and buf[i + 1] == 0xED and i + 3 < n:
            count = buf[i + 2]
            value = buf[i + 3]
            out.extend([value] * count)
            i += 4
        else:
            out.append(buf[i])
            i += 1
    return bytes(out)


def load_ram_from_z80(data):
    """Return a 49152-byte buffer representing Spectrum RAM 0x4000-0xFFFF."""
    a, f, bc, hl, pc, sp, i_reg, r_reg = struct.unpack_from("<BBHHHHBB", data, 0)
    flags1 = data[12]
    if flags1 == 255:
        flags1 = 1
    compressed = bool(flags1 & 0x20)

    if pc != 0:
        # Version 1: single block, whole 48K RAM, optionally compressed & end-marker terminated.
        if compressed:
            ram = _rle_decompress(data, 30, len(data), stop_at_end_marker=True)
        else:
            ram = data[30:30 + 49152]
        if len(ram) != 49152:
            raise ValueError(f"v1 snapshot: decompressed to {len(ram)} bytes, expected 49152")
        return ram

    # Version 2/3: extra header, then per-page compressed blocks.
    add_len = struct.unpack_from("<H", data, 30)[0]
    pos = 32 + add_len
    pages = {}
    n = len(data)
    while pos + 3 <= n:
        block_len, page = struct.unpack_from("<HB", data, pos)
        pos += 3
        if block_len == 0xFFFF:
            block_data = data[pos:pos + 16384]
            pos += 16384
        else:
            block_data = _rle_decompress(data, pos, pos + block_len, stop_at_end_marker=False)
            pos += block_len
        pages[page] = block_data

    # 48K mode page layout: 4 -> 0x8000-0xBFFF, 5 -> 0xC000-0xFFFF, 8 -> 0x4000-0x7FFF
    required = {4: 0x4000, 5: 0x8000, 8: 0x0000}  # offset within the 49152-byte RAM buffer
    ram = bytearray(49152)
    for page, offset in required.items():
        if page not in pages:
            raise ValueError(f"Expected page {page} not found in v2/v3 snapshot (hardware mode "
                              f"may not be plain 48K -- check byte 34 of the header)")
        chunk = pages[page]
        if len(chunk) != 16384:
            raise ValueError(f"Page {page} decompressed to {len(chunk)} bytes, expected 16384")
        ram[offset:offset + 16384] = chunk
    return bytes(ram)


def extract_columns(ram):
    """Return a 128x128 list of raw city bytes (bit 7 = sprite flag, still set)."""
    city = ram[CITY_OFFSET_IN_RAM:CITY_OFFSET_IN_RAM + 16384]
    return [[city[x * CITY_GRID_SIZE + z] for z in range(CITY_GRID_SIZE)]
            for x in range(CITY_GRID_SIZE)]


def decode_dense(columns):
    """128x128x6 nested booleans, static geometry only (sprite-presence bit masked off)."""
    dense = []
    for x in range(CITY_GRID_SIZE):
        row = []
        for z in range(CITY_GRID_SIZE):
            byte = columns[x][z] & 0x3F  # drop bit 7 (sprite flag)
            row.append([bool(byte & (1 << level)) for level in range(CITY_HEIGHT_LEVELS)])
        dense.append(row)
    return dense


def to_sparse(dense):
    sparse = []
    for x in range(CITY_GRID_SIZE):
        for z in range(CITY_GRID_SIZE):
            for level, solid in enumerate(dense[x][z]):
                if solid:
                    sparse.append([x - 64, z - 64, level])  # world-centered coords
    return sparse


def render_preview(dense, out_path="map_preview.png"):
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        print("PIL/numpy not available, skipping preview image (pip install pillow numpy).")
        return
    img = np.zeros((CITY_GRID_SIZE, CITY_GRID_SIZE), dtype=np.uint8)
    for x in range(CITY_GRID_SIZE):
        for z in range(CITY_GRID_SIZE):
            levels = dense[x][z]
            solid_levels = [i for i, v in enumerate(levels) if v]
            top = max(solid_levels) if solid_levels else -1
            img[x][z] = 0 if top < 0 else 40 + top * 35
    Image.fromarray(img, mode="L").resize(
        (512, 512), Image.NEAREST
    ).save(out_path)
    print(f"Wrote {out_path} -- eyeball this against the icemark.com map.gif reference.")


def sanity_check(dense):
    total_solid = sum(1 for x in range(CITY_GRID_SIZE) for z in range(CITY_GRID_SIZE)
                       for v in dense[x][z] if v)
    print(f"Total solid voxels: {total_solid} (out of {CITY_GRID_SIZE*CITY_GRID_SIZE*CITY_HEIGHT_LEVELS})")
    if total_solid == 0:
        print("WARNING: nothing decoded as solid -- the RAM extraction is almost certainly wrong.")
    if total_solid > 60000:
        print("WARNING: nearly everything is solid -- check you're not reading the wrong memory region.")


def main():
    data = download_snapshot()
    ram = load_ram_from_z80(data)
    columns = extract_columns(ram)
    dense = decode_dense(columns)
    sanity_check(dense)

    with open("ant_attack_map_dense.json", "w") as f:
        json.dump(dense, f)
    with open("ant_attack_map.json", "w") as f:
        json.dump(to_sparse(dense), f)

    render_preview(dense)
    print("Done. Compare map_preview.png against the reference map image at "
          "http://www.icemark.com/dataformats/mirrors/3D%20Ant%20Attack.htm before trusting this data.")


if __name__ == "__main__":
    main()
