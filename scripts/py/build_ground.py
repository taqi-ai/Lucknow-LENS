"""
build_ground.py - continuous ground surface for Lucknow LENS.

Composites, onto one 4096 x 4096 grid in the app's local metre frame
(src/geo/projection.ts: equirectangular about CENTER_LAT/CENTER_LON, x east, z south):

  * ESA WorldCover 10 m v200 (2021)      broad land cover          CC BY 4.0
  * Copernicus DEM GLO-30 (DSM)          heavily smoothed, used ONLY for shading
  * Overture land_use / water (2026-10-21.0)  parks, campuses, plazas, industry, water

Outputs (all local, no runtime network):
  public/ground/ground_albedo.jpg   RGB daylight albedo, 11 m/px, sRGB
  public/ground/ground_class.png    8-bit surface class (see CLASSES) for shader detail
  public/ground/ground_meta.json    grid definition, class table, provenance
  data/derived/ground_class.u8      same classes, raw, for the vegetation pass
  data/derived/ground_stats.json    class histogram

The DEM is a *surface* model (it includes buildings and canopy), so it is never used as
terrain height. It is box-filtered to ~330 m to keep only the landform (the Gomti valley,
the plains' gentle slope) and turned into a soft hillshade + "low ground" moisture term.

Usage: python -I scripts/py/build_ground.py
"""
import json, math, os, sys
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.features import rasterize
from PIL import Image

ROOT = os.getcwd()
RAW = os.path.join(ROOT, 'data', 'raw')
DER = os.path.join(ROOT, 'data', 'derived')
OUT = os.path.join(ROOT, 'public', 'ground')
for d in (DER, OUT):
    os.makedirs(d, exist_ok=True)

# --- grid -----------------------------------------------------------------
CENTER_LAT = 26.84997035
CENTER_LON = 80.95005255000001
M_PER_LAT = 111320.0
M_PER_LON = 111320.0 * math.cos(math.radians(CENTER_LAT))
N = 4096
CELL = 11.0
X0 = -N * CELL / 2  # -22528
Z0 = -N * CELL / 2
LL_BOUNDS = (80.70, 26.60, 81.20, 27.10)  # lon0, lat0, lon1, lat1 read window (with margin)

xs = X0 + (np.arange(N) + 0.5) * CELL
zs = Z0 + (np.arange(N) + 0.5) * CELL
LON = CENTER_LON + xs / M_PER_LON          # per column
LAT = CENTER_LAT - zs / M_PER_LAT          # per row (row 0 = north)

# --- classes ----------------------------------------------------------------
# id: (name, sRGB albedo)
CLASSES = {
    0: ('bare_soil', (176, 160, 132)),
    1: ('built_ground', (124, 115, 102)),
    2: ('tree_canopy', (66, 86, 48)),
    3: ('scrub', (128, 128, 86)),
    4: ('grassland', (128, 140, 82)),
    5: ('cropland', (138, 146, 88)),
    6: ('water', (74, 96, 92)),
    7: ('wetland', (98, 116, 84)),
    8: ('park_lawn', (92, 128, 62)),
    9: ('paved_plaza', (138, 134, 126)),
    10: ('industrial_yard', (124, 121, 114)),
    11: ('campus', (118, 132, 86)),
    12: ('residential', (130, 119, 104)),
    13: ('sand_bank', (196, 182, 150)),
    14: ('farmland', (146, 140, 92)),
    15: ('earthworks', (172, 140, 110)),
}
WC_TO_CLASS = {10: 2, 20: 3, 30: 4, 40: 5, 50: 1, 60: 0, 70: 0, 80: 6, 90: 7, 95: 7, 100: 4}


def read_mosaic(urls, cache, dtype, res_deg, resampling_nodata=0):
    if os.path.exists(cache):
        with rasterio.open(cache) as d:
            return d.read(1), d.transform
    lon0, lat0, lon1, lat1 = LL_BOUNDS
    w = int(round((lon1 - lon0) / res_deg)); h = int(round((lat1 - lat0) / res_deg))
    out = np.full((h, w), resampling_nodata, dtype=dtype)
    tr = rasterio.Affine(res_deg, 0, lon0, 0, -res_deg, lat1)
    for u in urls:
        with rasterio.open('/vsicurl/' + u) as src:
            b = src.bounds
            il0, ib0, il1, ib1 = max(lon0, b.left), max(lat0, b.bottom), min(lon1, b.right), min(lat1, b.top)
            if il1 <= il0 or ib1 <= ib0:
                continue
            win = from_bounds(il0, ib0, il1, ib1, src.transform).round_offsets().round_lengths()
            r0 = int(round((lat1 - ib1) / res_deg)); c0 = int(round((il0 - lon0) / res_deg))
            hh = min(int(win.height), h - r0); ww = min(int(win.width), w - c0)
            data = src.read(1, window=win, out_shape=(int(win.height), int(win.width)))[:hh, :ww]
            out[r0:r0 + hh, c0:c0 + ww] = data
            print('  read', os.path.basename(u), data.shape, flush=True)
    with rasterio.open(cache, 'w', driver='GTiff', width=w, height=h, count=1, dtype=dtype,
                       crs='EPSG:4326', transform=tr, compress='deflate') as d:
        d.write(out, 1)
    return out, tr


def sample_nearest(arr, tr):
    cols = np.clip(((LON - tr.c) / tr.a).astype(int), 0, arr.shape[1] - 1)
    rows = np.clip(((LAT - tr.f) / tr.e).astype(int), 0, arr.shape[0] - 1)
    return arr[rows[:, None], cols[None, :]]


def box_blur(a, r):
    """Separable box filter with edge clamping, radius r pixels."""
    if r <= 0:
        return a
    a = a.astype(np.float32)
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]; pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
        if axis == 0:
            a = (c[2 * r + 1:, :] - c[:-2 * r - 1, :]) / (2 * r + 1)
        else:
            a = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return a


def value_noise(scale_px, seed):
    rng = np.random.default_rng(seed)
    g = int(math.ceil(N / scale_px)) + 2
    grid = rng.random((g, g)).astype(np.float32)
    img = Image.fromarray((grid * 255).astype(np.uint8)).resize((g * scale_px, g * scale_px), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32)[:N, :N] / 255.0


def proj(lon, lat):
    return ((lon - CENTER_LON) * M_PER_LON, -(lat - CENTER_LAT) * M_PER_LAT)


def proj_geom(g):
    t = g['type']
    if t == 'Polygon':
        return {'type': t, 'coordinates': [[proj(*c[:2]) for c in ring] for ring in g['coordinates']]}
    if t == 'MultiPolygon':
        return {'type': t, 'coordinates': [[[proj(*c[:2]) for c in ring] for ring in poly] for poly in g['coordinates']]}
    if t == 'LineString':
        return {'type': t, 'coordinates': [proj(*c[:2]) for c in g['coordinates']]}
    if t == 'MultiLineString':
        return {'type': t, 'coordinates': [[proj(*c[:2]) for c in line] for line in g['coordinates']]}
    return None


LANDUSE_CLASS = {
    'park': 8, 'recreation': 8, 'golf': 8, 'horticulture': 8, 'managed': 8,
    'residential': 12, 'education': 11, 'medical': 11, 'military': 11, 'religious': 11, 'cemetery': 11,
    'agriculture': 14, 'construction': 15, 'pedestrian': 9, 'transportation': 10, 'protected': 2,
    'entertainment': 8, 'aquaculture': 6,
}
DEVELOPED_CLASS = {'commercial': 9, 'retail': 9, 'industrial': 10, 'brownfield': 15, 'institutional': 11}


def main():
    t = GRID_T = rasterio.Affine(CELL, 0, X0, 0, CELL, Z0)  # row -> +z (south)
    print('WorldCover...', flush=True)
    wc_urls = [f'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{k}_Map.tif'
               for k in ('N24E078', 'N24E081', 'N27E078', 'N27E081')]
    wc, wct = read_mosaic(wc_urls, os.path.join(RAW, 'worldcover_clip.tif'), 'uint8', 1 / 12000)
    print('Copernicus DEM GLO-30...', flush=True)
    dem_urls = [f'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{k}_DEM/Copernicus_DSM_COG_10_{k}_DEM.tif'
                for k in ('N26_00_E080_00', 'N26_00_E081_00', 'N27_00_E080_00', 'N27_00_E081_00')]
    dem, demt = read_mosaic(dem_urls, os.path.join(RAW, 'cop_dem30_clip.tif'), 'float32', 1 / 3600, 0)

    wc_l = sample_nearest(wc, wct)
    cls = np.zeros((N, N), np.uint8)
    lut = np.zeros(256, np.uint8)
    for k, v in WC_TO_CLASS.items():
        lut[k] = v
    cls[:] = lut[wc_l]

    # Overture land use - painted in order of increasing priority.
    print('Overture land use / water...', flush=True)
    shapes = {}
    for line in open(os.path.join(RAW, 'overture_land_use.geojsonseq'), encoding='utf8'):
        f = json.loads(line); p = f['properties']
        if f['geometry']['type'] not in ('Polygon', 'MultiPolygon'):
            continue
        sub, c = p.get('subtype'), p.get('class')
        k = DEVELOPED_CLASS.get(c) if sub == 'developed' else LANDUSE_CLASS.get(sub)
        if sub == 'agriculture' and c == 'meadow':
            k = 4
        if k is None:
            continue
        shapes.setdefault(k, []).append(proj_geom(f['geometry']))
    order = [12, 14, 15, 10, 9, 11, 8]  # residential first, parks last
    for k in order:
        if shapes.get(k):
            m = rasterize([(g, 1) for g in shapes[k]], out_shape=(N, N), transform=t, fill=0, dtype='uint8')
            cls[m > 0] = k

    water_polys, water_lines = [], []
    width = {'river': 45, 'canal': 14, 'stream': 8, 'drain': 5, 'ditch': 3}
    from shapely.geometry import shape, mapping
    for line in open(os.path.join(RAW, 'overture_water.geojsonseq'), encoding='utf8'):
        f = json.loads(line); p = f['properties']; g = f['geometry']
        if p.get('class') == 'swimming_pool':
            continue
        pg = proj_geom(g)
        if pg is None:
            continue
        if g['type'] in ('Polygon', 'MultiPolygon'):
            water_polys.append(pg)
        else:
            w = width.get(p.get('subtype'), width.get(p.get('class'), 6))
            water_lines.append(mapping(shape(pg).buffer(w / 2, cap_style=2)))
    water = rasterize([(g, 1) for g in water_polys + water_lines], out_shape=(N, N), transform=t, fill=0, dtype='uint8') > 0
    cls[water] = 6
    # WorldCover water stays water too (seasonal channel); bare/sand next to water = sand bank.
    near_water = box_blur(water.astype(np.float32), 18) > 0.02  # ~200 m
    cls[(cls == 0) & near_water] = 13

    # --- landform from the smoothed DSM --------------------------------------
    dem_l = np.zeros((N, N), np.float32)
    cols = ((LON - demt.c) / demt.a); rows = ((LAT - demt.f) / demt.e)
    c0 = np.clip(cols.astype(int), 0, dem.shape[1] - 2); r0 = np.clip(rows.astype(int), 0, dem.shape[0] - 2)
    fc = (cols - c0)[None, :]; fr = (rows - r0)[:, None]
    d00 = dem[r0[:, None], c0[None, :]]; d01 = dem[r0[:, None], c0[None, :] + 1]
    d10 = dem[r0[:, None] + 1, c0[None, :]]; d11 = dem[r0[:, None] + 1, c0[None, :] + 1]
    dem_l = (d00 * (1 - fc) * (1 - fr) + d01 * fc * (1 - fr) + d10 * (1 - fc) * fr + d11 * fc * fr).astype(np.float32)
    # Remove buildings / canopy: low percentile-ish via min-filter proxy (blur of a clipped field).
    base = box_blur(dem_l, 15)
    dem_s = box_blur(np.minimum(dem_l, base + 2.0), 15)
    gz, gx = np.gradient(dem_s, CELL)
    # Sun from the south-west (matches the renderer's default azimuth), 45 deg.
    sx, sz, sy = -0.55, 0.45, 0.70
    nrm = np.sqrt(gx * gx + gz * gz + 1)
    shade = (-gx * sx - gz * sz + sy) / nrm / sy  # 1 on flat ground
    shade = np.clip(1 + (shade - 1) * 4.0, 0.80, 1.15)
    regional = box_blur(dem_s, 120)  # ~1.3 km
    low = np.clip((regional - dem_s - 0.5) / 4.0, 0, 1)  # floodplain / low ground -> moister, greener

    # --- albedo ----------------------------------------------------------------
    pal = np.zeros((16, 3), np.float32)
    for k, (_, rgb) in CLASSES.items():
        pal[k] = rgb
    alb = pal[cls]
    # Soften class edges (11 m cells read as blocks otherwise) but keep water crisp.
    for _ in range(2):
        alb = np.stack([box_blur(alb[..., i], 1) for i in range(3)], -1)
    n1 = value_noise(48, 1)[..., None]; n2 = value_noise(9, 2)[..., None]; n3 = value_noise(220, 3)[..., None]
    alb *= 0.90 + 0.12 * n1 + 0.07 * (n2 - 0.5)
    # Regional tint: dry dusty ochre <-> greener floodplain.
    dry = np.array([1.04, 1.00, 0.93], np.float32); moist = np.array([0.93, 1.02, 0.95], np.float32)
    tint = dry + (moist - dry) * np.clip(low * 0.8 + (n3[..., 0] - 0.5) * 0.4, 0, 1)[..., None]
    alb *= tint
    alb *= shade[..., None]
    alb[water] = pal[6] * (0.92 + 0.08 * n2[water])
    alb = np.clip(alb, 0, 255).astype(np.uint8)

    Image.fromarray(alb, 'RGB').save(os.path.join(OUT, 'ground_albedo.jpg'), quality=84, optimize=True, progressive=True)
    Image.fromarray(cls, 'L').save(os.path.join(OUT, 'ground_class.png'), optimize=True)
    cls.tofile(os.path.join(DER, 'ground_class.u8'))

    hist = {CLASSES[k][0]: int((cls == k).sum()) for k in CLASSES}
    meta = {
        'version': 1, 'size': N, 'cell': CELL, 'originX': X0, 'originZ': Z0,
        'note': 'row 0 = north (min z). u = (x - originX)/(size*cell), v = (z - originZ)/(size*cell).',
        'classes': {str(k): v[0] for k, v in CLASSES.items()},
        'sources': {
            'worldcover': 'ESA WorldCover 10m 2021 v200 (CC BY 4.0) ' + ', '.join(os.path.basename(u) for u in wc_urls),
            'dem': 'Copernicus DEM GLO-30 (DSM, smoothed ~330 m, shading only) ' + ', '.join(os.path.basename(u) for u in dem_urls),
            'overture': 'Overture Maps 2026-10-21.0 land_use + water (ODbL/CDLA per theme)',
        },
        'demRange': [float(np.percentile(dem_s, 1)), float(np.percentile(dem_s, 99))],
    }
    json.dump(meta, open(os.path.join(OUT, 'ground_meta.json'), 'w'), indent=1)
    json.dump(hist, open(os.path.join(DER, 'ground_stats.json'), 'w'), indent=1)
    print(json.dumps(hist), meta['demRange'])
    for f in ('ground_albedo.jpg', 'ground_class.png'):
        print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1048576, 2), 'MB')


if __name__ == '__main__':
    main()
