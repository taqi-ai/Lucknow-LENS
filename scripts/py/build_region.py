"""
build_region.py: low-detail regional ground around Lucknow (map refinement).

A 2048 x 2048 albedo covering 264 km x 264 km centred on the city (129 m cells), from ESA WorldCover
2021 (CC BY 4.0) read through the COG overviews (only a few MB are downloaded). It sits under the
45 km detailed ground so full zoom-out shows real farmland, towns, forest and rivers to the horizon
instead of a square on a flat colour. Same projection as the app: x east, z south, metres from the
city centre. Writes public/ground/region_albedo.jpg + region_meta.json. Cached in data/raw.

Usage: python -I scripts/py/build_region.py
"""
import json, math, os
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from PIL import Image, ImageFilter

ROOT = os.getcwd()
CLAT, CLON = 26.84997035, 80.95005255
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(CLAT))
N, CELL = 2048, 129.0
HALF = N * CELL / 2
CACHE = os.path.join(ROOT, 'data', 'raw', 'worldcover_region.npy')
TILES = ['N24E078', 'N24E081', 'N27E078', 'N27E081']
URL = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{}_Map.tif'

# WorldCover class -> sRGB albedo, matched to the detailed ground palette (build_ground.py).
PAL = {10: (70, 84, 52), 20: (128, 128, 86), 30: (138, 138, 92), 40: (140, 136, 88), 50: (128, 118, 104),
       60: (176, 160, 132), 70: (200, 200, 200), 80: (52, 66, 66), 90: (98, 116, 84), 95: (80, 100, 70), 100: (138, 138, 92), 0: (138, 132, 100)}


def main():
    lat0, lat1 = CLAT - HALF / MLAT, CLAT + HALF / MLAT
    lon0, lon1 = CLON - HALF / MLON, CLON + HALF / MLON
    if os.path.exists(CACHE):
        cls = np.load(CACHE)
    else:
        cls = np.zeros((N, N), np.uint8)
        for k in TILES:
            with rasterio.open('/vsicurl/' + URL.format(k)) as src:
                b = src.bounds
                il0, ib0, il1, ib1 = max(lon0, b.left), max(lat0, b.bottom), min(lon1, b.right), min(lat1, b.top)
                if il1 <= il0 or ib1 <= ib0:
                    continue
                c0 = int(round((il0 - lon0) / (lon1 - lon0) * N)); c1 = int(round((il1 - lon0) / (lon1 - lon0) * N))
                r0 = int(round((lat1 - ib1) / (lat1 - lat0) * N)); r1 = int(round((lat1 - ib0) / (lat1 - lat0) * N))
                win = from_bounds(il0, ib0, il1, ib1, src.transform)
                data = src.read(1, window=win, out_shape=(r1 - r0, c1 - c0), resampling=rasterio.enums.Resampling.mode)
                cls[r0:r1, c0:c1] = data
                print('  read', k, data.shape, flush=True)
        np.save(CACHE, cls)
    alb = np.zeros((N, N, 3), np.float32)
    for k, rgb in PAL.items():
        alb[cls == k] = rgb
    rng = np.random.default_rng(3)
    # Field mosaic tint on cropland so the countryside is not a flat sheet.
    g = rng.random((N // 6 + 2, N // 6 + 2)).astype(np.float32)
    parcel = np.kron(g, np.ones((6, 6), np.float32))[:N, :N]
    crop = cls == 40
    stages = np.array([[0.82, 1.05, 0.78], [1.12, 1.04, 0.84], [1.18, 1.1, 0.95], [0.98, 0.9, 0.8]], np.float32)
    alb[crop] *= stages[np.clip((parcel[crop] * 4).astype(int), 0, 3)]
    n = np.asarray(Image.fromarray((rng.random((N // 32 + 2, N // 32 + 2)) * 255).astype(np.uint8)).resize((N + 64, N + 64), Image.BICUBIC), np.float32)[:N, :N] / 255
    alb *= (0.92 + 0.14 * n)[..., None]
    img = Image.fromarray(np.clip(alb, 0, 255).astype(np.uint8), 'RGB').filter(ImageFilter.GaussianBlur(0.6))
    out = os.path.join(ROOT, 'public', 'ground')
    img.save(os.path.join(out, 'region_albedo.jpg'), quality=80, optimize=True, progressive=True)
    json.dump({'size': N, 'cell': CELL, 'originX': -HALF, 'originZ': -HALF,
               'source': 'ESA WorldCover 10m 2021 v200 (CC BY 4.0), mode-resampled to 129 m'}, open(os.path.join(out, 'region_meta.json'), 'w'), indent=1)
    print('region', round(os.path.getsize(os.path.join(out, 'region_albedo.jpg')) / 1048576, 2), 'MB')


if __name__ == '__main__':
    main()
