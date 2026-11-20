"""
sample_gob25d.py - per-building height statistics from Google Open Buildings 2.5D Temporal.

Reads the clipped 2 m rasters written by fetch_gob25d.py and the Overture building
footprints, and writes data/derived/gob_heights.csv:

  id, h_med, h_p75, h_p90, n_px, n_valid, pres

  n_px     pixels owned by the footprint (label raster - every pixel has ONE owner,
           so adjacent/overlapping footprints never share a sample)
  n_valid  owned pixels that are (a) interior - all 4 neighbours share the owner,
           when the footprint has enough of them - and (b) presence >= PRES_MIN and
           height > 0.  Edge pixels are dropped because the 2 m overview blends roof
           with ground/street.
  pres     mean model presence score over owned pixels (uncalibrated; used only as a
           relative quality signal, never as a probability)

Overlapping raster tiles (different S2 cells) are handled by keeping, per building,
the tile in which it owns the most pixels.

Usage: python -I scripts/py/sample_gob25d.py
"""
import glob, json, math, os, sys, time
import numpy as np
import rasterio
from rasterio.features import rasterize

ROOT = os.getcwd()
SRC = os.path.join(ROOT, 'data', 'raw', 'overture_building.geojsonseq')
PARTS = os.path.join(ROOT, 'data', 'raw', 'overture_building_part.geojsonseq')
CLIPS = sorted(glob.glob(os.path.join(ROOT, 'data', 'raw', 'gob25d', 'clip_*.tif')))
OUT = os.path.join(ROOT, 'data', 'derived', 'gob_heights.csv')
PRES_MIN = 0.35 * 250

A = 6378137.0; F = 1 / 298.257223563; K0 = 0.9996; E2 = F * (2 - F); EP2 = E2 / (1 - E2)


def ll_to_utm_np(lat, lon, zone=44):
    lon0 = math.radians((zone - 1) * 6 - 180 + 3)
    phi = np.radians(lat); lam = np.radians(lon)
    s = np.sin(phi); c_ = np.cos(phi); tn = np.tan(phi)
    n = A / np.sqrt(1 - E2 * s * s); t = tn * tn; c = EP2 * c_ * c_; a = c_ * (lam - lon0)
    m = A * ((1 - E2 / 4 - 3 * E2**2 / 64 - 5 * E2**3 / 256) * phi
             - (3 * E2 / 8 + 3 * E2**2 / 32 + 45 * E2**3 / 1024) * np.sin(2 * phi)
             + (15 * E2**2 / 256 + 45 * E2**3 / 1024) * np.sin(4 * phi)
             - (35 * E2**3 / 3072) * np.sin(6 * phi))
    x = K0 * n * (a + (1 - t + c) * a**3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * EP2) * a**5 / 120) + 500000
    y = K0 * (m + n * tn * (a * a / 2 + (5 - t + 9 * c + 4 * c * c) * a**4 / 24
                            + (61 - 58 * t + t * t + 600 * c - 330 * EP2) * a**6 / 720))
    return x, y


def load_buildings():
    ids, geoms, bbox = [], [], []
    for path in (SRC, PARTS):
        if not os.path.exists(path):
            continue
        for line in open(path, encoding='utf8'):
            f = json.loads(line); g = f['geometry']
            if g['type'] == 'Polygon':
                polys = [g['coordinates']]
            elif g['type'] == 'MultiPolygon':
                polys = g['coordinates']
            else:
                continue
            allc = np.array([c[:2] for p in polys for r in p for c in r], np.float64)
            x, y = ll_to_utm_np(allc[:, 1], allc[:, 0])
            k = 0; out = []
            for p in polys:
                rings = []
                for r in p:
                    n = len(r); rings.append(list(zip(x[k:k + n], y[k:k + n]))); k += n
                out.append(rings)
            ids.append(f['id']); geoms.append({'type': 'MultiPolygon', 'coordinates': out})
            bbox.append((x.min(), y.min(), x.max(), y.max()))
    return ids, geoms, np.array(bbox)


def main():
    t0 = time.time()
    ids, geoms, bb = load_buildings()
    print(f'{len(ids)} footprints loaded in {time.time() - t0:.0f}s, {len(CLIPS)} raster clips', flush=True)
    best = {}  # idx -> (n_px, row)
    for ci, clip in enumerate(CLIPS):
        with rasterio.open(clip) as d:
            hdm = d.read(1); pres = d.read(2); tr = d.transform; H, W = hdm.shape
            b = d.bounds
        sel = np.nonzero((bb[:, 2] > b.left) & (bb[:, 0] < b.right) & (bb[:, 3] > b.bottom) & (bb[:, 1] < b.top))[0]
        if len(sel) == 0:
            continue
        lab = rasterize(((geoms[i], int(j + 1)) for j, i in enumerate(sel)), out_shape=(H, W), transform=tr,
                        fill=0, dtype='int32')
        # interior = all 4 neighbours share the label
        inter = np.zeros_like(lab, bool)
        inter[1:-1, 1:-1] = ((lab[1:-1, 1:-1] == lab[:-2, 1:-1]) & (lab[1:-1, 1:-1] == lab[2:, 1:-1]) &
                             (lab[1:-1, 1:-1] == lab[1:-1, :-2]) & (lab[1:-1, 1:-1] == lab[1:-1, 2:]))
        m = lab > 0
        L = lab[m]; HV = hdm[m].astype(np.float32) / 10.0; PV = pres[m]; IN = inter[m]
        nodata = PV == 255
        nlab = len(sel) + 1
        n_px = np.bincount(L, minlength=nlab)
        n_int = np.bincount(L[IN], minlength=nlab)
        pres_sum = np.bincount(L[~nodata], weights=PV[~nodata].astype(np.float64), minlength=nlab)
        n_pd = np.bincount(L[~nodata], minlength=nlab)
        # Use interior pixels when a footprint has >= 4 of them, else all owned pixels.
        use_int = n_int[L] >= 4
        good = (~nodata) & (PV >= PRES_MIN) & (HV > 0.5) & (IN | ~use_int)
        Lg = L[good]; Hg = HV[good]
        order = np.lexsort((Hg, Lg)); Lg = Lg[order]; Hg = Hg[order]
        starts = np.searchsorted(Lg, np.arange(nlab)); ends = np.searchsorted(Lg, np.arange(nlab), 'right')
        for j in range(1, nlab):
            npx = int(n_px[j])
            if npx == 0:
                continue
            i = int(sel[j - 1])
            prev = best.get(i)
            if prev and prev[0] >= npx:
                continue
            s, e = starts[j], ends[j]; nv = e - s
            if nv > 0:
                hs = Hg[s:e]
                row = (float(np.median(hs)), float(hs[int(0.75 * (nv - 1))]), float(hs[int(0.9 * (nv - 1))]), npx, int(nv),
                       float(pres_sum[j] / max(1, n_pd[j]) / 250.0))
            else:
                row = (0.0, 0.0, 0.0, npx, 0, float(pres_sum[j] / max(1, n_pd[j]) / 250.0))
            best[i] = (npx, row)
        print(f'  [{ci + 1}/{len(CLIPS)}] {os.path.basename(clip)}: {len(sel)} footprints, {len(best)} sampled, '
              f'{time.time() - t0:.0f}s', flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf8') as f:
        f.write('id,h_med,h_p75,h_p90,n_px,n_valid,pres\n')
        for i, (_, r) in best.items():
            f.write(f'{ids[i]},{r[0]:.1f},{r[1]:.1f},{r[2]:.1f},{r[3]},{r[4]},{r[5]:.3f}\n')
    hv = np.array([r[0] for _, r in best.values() if r[4] > 0])
    print('sampled', len(best), 'with valid height', len(hv))
    print('height percentiles 5/25/50/75/95/99:', [round(float(np.percentile(hv, q)), 1) for q in (5, 25, 50, 75, 95, 99)])


if __name__ == '__main__':
    main()
