"""
build_hydrology.py - classified water layer for Lucknow LENS (round 2).

WHY. The old generator copied all 527 Overture water features into overview.json with a
fixed `width: 35`, and the overlay ribboned every line at >= 28 m. 219 drains, 30 streams
and dozens of minor canals therefore became broad blue "canals" between buildings, and
every road crossing one of them spawned a bridge.

WHAT. Every feature gets an explicit class and a render rule:
  river_poly / canal_poly / lake / pond / reservoir / basin / wastewater / water
                         -> rendered as their real surface polygons (all parts)
  river_line             -> rendered ONLY where no river polygon already covers it, at the
                            width measured from the city's own river polygons (area/length)
  canal_line (major)     -> named, or > 1.5 km long: 8 m channel
  canal_line (minor)     -> 4 m channel
  stream                 -> 3 m channel
  drain / ditch          -> NOT a water surface (render = false). Kept for reference only.
  swimming_pool          -> dropped (sub-pixel, and not geography)
Bridges are only generated over `bridgeable` classes (rivers and major canals).

OVERRIDES. data/overrides/water_overrides.geojson (tracked in git, survives rebuilds):
  {"action": "remove",  "id": "<overture id>"}                         drop a feature
  {"action": "remove"}  + Polygon geometry                             drop every feature inside
  {"action": "reclass", "id": "...", "class": "drain", "width": 3}      change class / width
  {"action": "add", "class": "pond", "name": "..."} + geometry          add a verified feature
Every override carries a "note" saying what evidence it is based on.

OUTPUT
  data/derived/hydrology.geojson      lon/lat, for build_ground.py and audits
  public/overture_tiles_full/overview.json  `waterways` replaced (projected), `hydrologyVersion: 2`
  tile files: lod2/lod1 `waterways` emptied (the city-wide overlay owns all water)

Usage: python -I scripts/py/build_hydrology.py
"""
import glob, json, math, os, statistics
from shapely.geometry import shape, mapping, Polygon, MultiPolygon, LineString, MultiLineString
from shapely.ops import unary_union

ROOT = os.getcwd()
RAW = os.path.join(ROOT, 'data', 'raw', 'overture_water.geojsonseq')
OVR = os.path.join(ROOT, 'data', 'overrides', 'water_overrides.geojson')
OUT = os.path.join(ROOT, 'data', 'derived', 'hydrology.geojson')
TILES = os.path.join(ROOT, 'public', 'overture_tiles_full')

CENTER_LAT = 26.84997035
CENTER_LON = 80.95005255000001
M_LAT = 111320.0
M_LON = 111320.0 * math.cos(math.radians(CENTER_LAT))
proj = lambda lon, lat: {'x': round((lon - CENTER_LON) * M_LON, 2), 'z': round(-(lat - CENTER_LAT) * M_LAT, 2)}
deg = 1.0 / M_LON  # metres -> degrees (lon), close enough for buffering at this latitude

SURFACE = {'river_poly', 'canal_poly', 'lake', 'pond', 'reservoir', 'basin', 'wastewater', 'water', 'stream_poly'}
BRIDGEABLE = {'river_line', 'river_poly', 'canal_poly', 'canal_major'}


def classify(p, gtype):
    sub, cls = p.get('subtype'), p.get('class')
    poly = gtype in ('Polygon', 'MultiPolygon')
    if cls == 'swimming_pool':
        return None
    if sub == 'river':
        return 'river_poly' if poly else 'river_line'
    if sub == 'canal':
        if poly:
            return 'canal_poly'
        if cls in ('drain', 'ditch'):
            return cls
        return 'canal_line'
    if sub == 'stream':
        return 'stream_poly' if poly else 'stream'
    if poly:
        return cls if cls in ('lake', 'pond', 'reservoir', 'basin', 'wastewater') else 'water'
    return 'drain'


def main():
    feats = []
    for line in open(RAW, encoding='utf8'):
        f = json.loads(line)
        k = classify(f['properties'], f['geometry']['type'])
        if k:
            feats.append({'id': f['id'], 'cls': k, 'name': (f['properties'].get('names') or {}).get('primary'),
                          'geom': shape(f['geometry'])})

    overrides = json.load(open(OVR, encoding='utf8'))['features'] if os.path.exists(OVR) else []
    applied = 0
    for o in overrides:
        p = o.get('properties', {})
        act = p.get('action')
        if act == 'remove':
            if p.get('id'):
                n0 = len(feats); feats = [f for f in feats if f['id'] != p['id']]; applied += n0 - len(feats)
            elif o.get('geometry'):
                area = shape(o['geometry'])
                n0 = len(feats); feats = [f for f in feats if not area.contains(f['geom'].representative_point())]; applied += n0 - len(feats)
        elif act == 'reclass':
            for f in feats:
                if f['id'] == p.get('id'):
                    f['cls'] = p.get('class', f['cls']); f['width'] = p.get('width'); applied += 1
        elif act == 'add' and o.get('geometry'):
            feats.append({'id': p.get('id') or f"override-{applied}", 'cls': p.get('class', 'pond'), 'name': p.get('name'),
                          'geom': shape(o['geometry']), 'width': p.get('width')}); applied += 1

    # Measured river width: polygon area / centreline-ish length (half perimeter).
    rpolys = [f['geom'] for f in feats if f['cls'] == 'river_poly']
    widths = [g.area / max(1e-12, g.length / 2) / deg for g in rpolys if g.area > 0]
    river_w = max(25.0, min(140.0, statistics.median(widths))) if widths else 60.0
    river_cover = unary_union([g.buffer(15 * deg) for g in rpolys]) if rpolys else None

    for f in feats:
        c = f['cls']
        if f.get('width'):
            continue
        if c == 'river_line':
            f['width'] = river_w if (f['name'] or '').lower().startswith('gom') else min(river_w, 30.0)
        elif c == 'canal_line':
            km = f['geom'].length / deg / 1000
            f['cls'] = 'canal_major' if (f['name'] or km > 1.5) else 'canal_minor'
            f['width'] = 8.0 if f['cls'] == 'canal_major' else 4.0
        elif c == 'stream':
            f['width'] = 3.0
        elif c in ('drain', 'ditch'):
            f['width'] = 2.0

    out_feats, overview = [], []
    stats = {}
    for f in feats:
        c, g = f['cls'], f['geom']
        render = c in SURFACE or c in ('river_line', 'canal_major', 'canal_minor', 'stream')
        if c == 'river_line' and river_cover is not None:
            g = g.difference(river_cover)  # only where no polygon already draws the river
            if g.is_empty:
                render = False; g = f['geom']
        stats[c] = stats.get(c, 0) + 1
        props = {'id': f['id'], 'cls': c, 'name': f['name'], 'width': f.get('width'), 'render': render,
                 'bridgeable': c in BRIDGEABLE}
        out_feats.append({'type': 'Feature', 'properties': props, 'geometry': mapping(g)})
        if not render:
            continue
        parts = []
        if isinstance(g, (Polygon,)): parts = [('poly', g)]
        elif isinstance(g, MultiPolygon): parts = [('poly', q) for q in g.geoms]
        elif isinstance(g, LineString): parts = [('line', g)]
        elif isinstance(g, MultiLineString): parts = [('line', q) for q in g.geoms]
        for i, (kind, q) in enumerate(parts):
            coords = list(q.exterior.coords) if kind == 'poly' else list(q.coords)
            if len(coords) < (3 if kind == 'poly' else 2):
                continue
            overview.append({'id': f['id'] + (f'#{i}' if len(parts) > 1 else ''), 'cls': c, 'name': f['name'],
                             'points': [proj(x, y) for x, y in coords], 'isPolygon': kind == 'poly',
                             'width': f.get('width'), 'bridgeable': c in BRIDGEABLE})

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'type': 'FeatureCollection', 'riverWidthM': river_w, 'features': out_feats}, open(OUT, 'w'))

    ov_path = os.path.join(TILES, 'overview.json')
    ov = json.load(open(ov_path, encoding='utf8'))
    ov['waterways'] = overview
    ov['hydrologyVersion'] = 2
    json.dump(ov, open(ov_path, 'w'))

    cleared = 0
    for path in glob.glob(os.path.join(TILES, 'tile_*.json')):
        t = json.load(open(path, encoding='utf8'))
        changed = False
        for lod in ('lod1', 'lod2'):
            if t.get(lod, {}).get('waterways'):
                t[lod]['waterways'] = []; changed = True
        if changed:
            json.dump(t, open(path, 'w'), separators=(',', ':')); cleared += 1

    print(f'classes {stats}')
    print(f'overrides applied {applied}; measured Gomti width {river_w:.0f} m; overview water features {len(overview)} (was 527); tiles cleared {cleared}')


if __name__ == '__main__':
    main()
