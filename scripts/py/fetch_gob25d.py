"""
fetch_gob25d.py - Google Open Buildings 2.5D Temporal (v1) importer for Lucknow.

Source: gs://open-buildings-temporal-data/v1 (public, anonymous read; CC BY 4.0).
The layout follows Google's own notebook (open_buildings_temporal_download_region_geotiffs.ipynb):
  v1/manifests/<s2token>_EPSG_<zone>_<year>_06_30.json  -> tilesets[0].sources[] with
  affineTransform + uris;  object = uriPrefix + uri  (no slash between them).
Bands: 1 building_fractional_count, 2 building_height (m), 3 building_presence (0..1,
uncalibrated model score - NOT a probability). nodata = -99.

The rasters are 0.5 m pixel spacing but ~4 m effective resolution, and 1.2 GB per
12.5 km tile. We read the internal 2 m overview (decimation x4), clipped to the
Lucknow bbox, and store compact local GeoTIFFs:
  height_dm  uint16  building height in decimetres (0 = no building / nodata)
  presence   uint8   presence * 250 (255 = nodata)
Output: data/raw/gob25d/clip_<tile>.tif   (2 bands, deflate)

Usage: python -I scripts/py/fetch_gob25d.py [year]   (default 2023, the latest)
"""
import json, os, sys, urllib.request, concurrent.futures as cf
import numpy as np
import rasterio
from rasterio.windows import from_bounds
sys.path.insert(0, os.path.dirname(__file__))
from utm import ll_to_utm

YEAR = sys.argv[1] if len(sys.argv) > 1 else '2023'
ROOT = os.path.join(os.getcwd(), 'data', 'raw', 'gob25d')
BBOX = (80.7501301, 26.6500106, 81.149975, 27.0499301)  # lon/lat, same as tile generator
ZONE = 44
DECIM = 4  # 0.5 m -> 2 m
BUCKET = 'https://storage.googleapis.com/open-buildings-temporal-data/'

os.makedirs(ROOT, exist_ok=True)


def manifests():
    names, tok = [], None
    while True:
        u = BUCKET.replace('storage.googleapis.com/', 'storage.googleapis.com/storage/v1/b/').rstrip('/') \
            + '/o?prefix=v1/manifests/&maxResults=1000&fields=items(name),nextPageToken'
        if tok:
            u += '&pageToken=' + urllib.parse.quote(tok)
        d = json.load(urllib.request.urlopen(u))
        names += [i['name'] for i in d.get('items', [])]
        tok = d.get('nextPageToken')
        if not tok:
            return [n for n in names if f'EPSG_326{ZONE}_{YEAR}_' in n]


def utm_bbox():
    lo0, la0, lo1, la1 = BBOX
    pts = [ll_to_utm(la, lo, ZONE) for la in (la0, la1) for lo in (lo0, lo1)]
    xs, ys = zip(*pts)
    return min(xs) - 50, min(ys) - 50, max(xs) + 50, max(ys) + 50


def tiles():
    import urllib.parse  # noqa
    x0, y0, x1, y1 = utm_bbox()
    out = []
    for name in manifests():
        local = os.path.join(ROOT, os.path.basename(name))
        if not os.path.exists(local):
            urllib.request.urlretrieve(BUCKET + name, local)
        m = json.load(open(local))
        prefix = m['uriPrefix'].replace('gs://open-buildings-temporal-data/', BUCKET)
        for s in m['tilesets'][0]['sources']:
            a = s['affineTransform']; w = s['dimensions']['width'] * a['scaleX']
            tx0, ty1 = a['translateX'], a['translateY']
            if tx0 + w > x0 and tx0 < x1 and ty1 > y0 and ty1 - w < y1:
                out.append(prefix + s['uris'][0])
    return out


def fetch(url):
    key = url.rsplit('/', 2)[-2] + '_' + os.path.basename(url)
    dst = os.path.join(ROOT, 'clip_' + key)
    if os.path.exists(dst):
        return dst, 'cached'
    x0, y0, x1, y1 = utm_bbox()
    with rasterio.open('/vsicurl/' + url) as src:
        b = src.bounds
        win = from_bounds(max(x0, b.left), max(y0, b.bottom), min(x1, b.right), min(y1, b.top), src.transform)
        win = win.round_offsets().round_lengths()
        h, w = int(win.height // DECIM), int(win.width // DECIM)
        if h < 2 or w < 2:
            return dst, 'empty'
        arr = src.read([2, 3], window=win, out_shape=(2, h, w))  # height, presence (overview, nearest)
        tr = src.window_transform(win) * rasterio.Affine.scale(win.width / w, win.height / h)
        hgt, pres = arr[0], arr[1]
        nod = (hgt <= -98) | (pres <= -98)
        hdm = np.clip(np.round(hgt * 10), 0, 65000).astype(np.uint16); hdm[nod] = 0
        pr = np.clip(np.round(pres * 250), 0, 250).astype(np.uint8); pr[nod] = 255
        prof = dict(driver='GTiff', width=w, height=h, count=2, dtype='uint16', crs=src.crs,
                    transform=tr, compress='deflate', predictor=2, tiled=True)
        tmp = dst + '.part'
        with rasterio.open(tmp, 'w', **prof) as d:
            d.write(hdm, 1); d.write(pr.astype(np.uint16), 2)
        os.replace(tmp, dst)
    return dst, f'{w}x{h}'


if __name__ == '__main__':
    import urllib.parse  # noqa: F401
    urls = tiles()
    print(f'{len(urls)} tiles for {YEAR}', flush=True)
    with cf.ThreadPoolExecutor(4) as ex:
        for dst, msg in ex.map(fetch, urls):
            print(os.path.basename(dst), msg, flush=True)
    json.dump({'year': YEAR, 'tiles': urls, 'decimation': DECIM, 'pixel_m': 0.5 * DECIM},
              open(os.path.join(ROOT, 'fetch_meta.json'), 'w'), indent=1)
