"""
build_landmark_sites.py - resolves every modelled landmark to real geography (round 2).

Inputs: data/overrides/landmarks.json (tracked; one entry per landmark with its anchor:
an Overture building id, an Overture place name, the NMA coordinates, or a land-use
polygon name), plus the raw Overture building / place / land_use / infrastructure files.

Output: src/city/landmarkSites.ts (generated; shared by the tile worker, the HLOD baker
and the landmark builder):
  LANDMARK_SITES  key, centre, orientation (longest edge of the anchoring footprint or the
                  override angle), extents, the footprint ring (model outline), and the
                  EXCLUSION ring - every Overture footprint whose centroid falls inside it
                  is replaced by the model.
  AIRPORT         runway / taxiway centrelines, aprons, boundary (Overture infrastructure)
  PRECINCTS       real outlines used for site layout (Ambedkar Memorial, Janeshwar Mishra)

Usage: python -I scripts/py/build_landmark_sites.py
"""
import json, math, os
from shapely.geometry import shape, Point, Polygon
from shapely import affinity

ROOT = os.getcwd()
RAW = os.path.join(ROOT, 'data', 'raw')
C_LAT = 26.84997035; C_LON = 80.95005255000001
ML = 111320 * math.cos(math.radians(C_LAT))
P = lambda lo, la: (round((lo - C_LON) * ML, 1), round(-(la - C_LAT) * 111320, 1))


def proj_ring(coords):
    return [P(c[0], c[1]) for c in coords]


def longest_angle(ring):
    best, ang = -1, 0.0
    for i in range(len(ring) - 1):
        dx = ring[i + 1][0] - ring[i][0]; dz = ring[i + 1][1] - ring[i][1]
        if dx * dx + dz * dz > best:
            best = dx * dx + dz * dz; ang = math.atan2(dz, dx)
    return ang


def rect(cx, cz, a, u0, u1, v0, v1):
    ca, sa = math.cos(a), math.sin(a)
    pts = [(u0, v0), (u1, v0), (u1, v1), (u0, v1), (u0, v0)]
    return [(round(cx + u * ca - v * sa, 1), round(cz + u * sa + v * ca, 1)) for u, v in pts]


def main():
    spec = json.load(open(os.path.join(ROOT, 'data', 'overrides', 'landmarks.json'), encoding='utf8'))
    want_ids = {s['building'] for s in spec['sites'] if s.get('building')}
    want_places = {s['place'] for s in spec['sites'] if s.get('place')}
    want_lu = {s['landuse'] for s in spec['sites'] if s.get('landuse')} | set(spec.get('precincts', {}).values())

    # Buildings: index all footprints (centroid + ring) for anchoring to points.
    bld = []
    for line in open(os.path.join(RAW, 'overture_building.geojsonseq'), encoding='utf8'):
        f = json.loads(line); g = f['geometry']
        ring = g['coordinates'][0] if g['type'] == 'Polygon' else g['coordinates'][0][0]
        pr = proj_ring(ring)
        bld.append((f['id'], Polygon(pr), pr))
    by_prefix = {b[0][:8]: b for b in bld}

    places = {}
    for line in open(os.path.join(RAW, 'overture_place.geojsonseq'), encoding='utf8'):
        f = json.loads(line)
        n = (f['properties'].get('names') or {}).get('primary')
        if n in want_places:
            c = f.get('properties', {}).get('confidence') or 0
            if n not in places or c > places[n][1]:
                places[n] = (P(*f['geometry']['coordinates'][:2]), c)

    landuse = {}
    for line in open(os.path.join(RAW, 'overture_land_use.geojsonseq'), encoding='utf8'):
        f = json.loads(line)
        n = (f['properties'].get('names') or {}).get('primary')
        if n in want_lu and f['geometry']['type'] in ('Polygon', 'MultiPolygon'):
            g = shape(f['geometry'])
            g = max(g.geoms, key=lambda q: q.area) if g.geom_type == 'MultiPolygon' else g
            if n not in landuse or g.area > landuse[n][1]:
                landuse[n] = (proj_ring(list(g.exterior.coords)), g.area)

    sites = []
    for s in spec['sites']:
        ring = None
        if s.get('building'):
            b = by_prefix.get(s['building'][:8]); ring = b[2]
            c = Polygon(ring).centroid; cx, cz = c.x, c.y
        elif s.get('landuse'):
            ring = landuse[s['landuse']][0]; c = Polygon(ring).centroid; cx, cz = c.x, c.y
        else:
            if s.get('xz'):
                cx, cz = s['xz']
            elif s.get('lonlat'):
                cx, cz = P(*s['lonlat'])
            else:
                cx, cz = places[s['place']][0]
            # snap to the footprint containing / nearest the point (within 35 m)
            pt = Point(cx, cz); best = None
            for bid, poly, pr in bld:
                if abs(poly.centroid.x - cx) > 200 or abs(poly.centroid.y - cz) > 200:
                    continue
                d = poly.distance(pt)
                if d < 35 and (best is None or (d, -poly.area) < (best[0], -best[1].area)):
                    best = (d, poly, pr)
            if best and s.get('snap', True):
                ring = best[2]; c = best[1].centroid; cx, cz = c.x, c.y
        ang = s.get('angle')
        if ang is None:
            ang = longest_angle(ring) if ring else 0.0
        if ring:
            xs = [p[0] for p in ring]; zs = [p[1] for p in ring]
            ext = [round(max(xs) - min(xs), 1), round(max(zs) - min(zs), 1)]
        else:
            ext = [s.get('size', 20), s.get('size', 20)]
        if s.get('precinct'):  # [u0, u1, v0, v1] in the site frame
            excl = rect(cx, cz, ang, *s['precinct'])
        elif ring and s.get('exclude', True):
            excl = [tuple(p) for p in Polygon(ring).buffer(2).exterior.coords]
            excl = [(round(x, 1), round(z, 1)) for x, z in excl]
        else:
            excl = rect(cx, cz, ang, -s.get('size', 20) / 2, s.get('size', 20) / 2, -s.get('size', 20) / 2, s.get('size', 20) / 2) if s.get('exclude', True) else []
        sites.append({'key': s['key'], 'name': s['name'], 'c': [round(cx, 1), round(cz, 1)], 'a': round(ang, 4), 'ext': ext,
                      'ring': [list(p) for p in (ring or [])], 'excl': [list(p) for p in excl], 'h': s.get('height')})

    # Airport from Overture infrastructure.
    air = {'runways': [], 'taxiways': [], 'aprons': [], 'boundary': []}
    for line in open(os.path.join(RAW, 'overture_infrastructure.geojsonseq'), encoding='utf8'):
        f = json.loads(line); p = f['properties']; g = f['geometry']
        if p.get('subtype') != 'airport':
            continue
        c = shape(g).centroid; cx, cz = P(c.x, c.y)
        if not (-9500 < cx < -3500 and 8500 < cz < 11500):
            continue  # CCS International only (not the Air Force station)
        k = p.get('class')
        if k == 'runway' and g['type'] == 'LineString': air['runways'].append(proj_ring(g['coordinates']))
        elif k == 'taxiway' and g['type'] == 'LineString': air['taxiways'].append(proj_ring(g['coordinates']))
        elif k == 'apron': air['aprons'].append(proj_ring(g['coordinates'][0]))
        elif k == 'international_airport': air['boundary'] = proj_ring(g['coordinates'][0])

    precincts = {k: landuse[v][0] for k, v in spec.get('precincts', {}).items() if v in landuse}

    ts = ['/**', ' * landmarkSites - GENERATED by scripts/py/build_landmark_sites.py from',
          ' * data/overrides/landmarks.json and Overture 2026-10-21.0. Do not edit by hand.',
          ' * Shared by the tile worker and the HLOD baker (exclusion) and landmarks.ts (models).', ' */', '',
          'export interface LandmarkSite { key: string; name: string; c: [number, number]; a: number; ext: [number, number];',
          '  ring: Array<[number, number]>; excl: Array<[number, number]>; h?: number | null }', '',
          'export const LANDMARK_SITES: LandmarkSite[] = ' + json.dumps(sites, separators=(',', ':')) + ';', '',
          'export const AIRPORT: { runways: number[][][]; taxiways: number[][][]; aprons: number[][][]; boundary: number[][] } = '
          + json.dumps(air, separators=(',', ':')) + ';', '',
          'export const PRECINCTS: Record<string, number[][]> = ' + json.dumps(precincts, separators=(',', ':')) + ';', '',
          'function inRing(x: number, z: number, ring: Array<[number, number]>): boolean {',
          '  let inside = false;',
          '  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {',
          '    const a = ring[i], b = ring[j];',
          '    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;',
          '  }', '  return inside;', '}', '',
          'const BOXES = LANDMARK_SITES.filter((s) => s.excl.length > 2).map((s) => {',
          '  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;',
          '  for (const [x, z] of s.excl) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }',
          '  return { s, x0, x1, z0, z1 };', '});', '',
          '/** True if a footprint centred at (x, z) is replaced by a landmark model. */',
          'export function isLandmarkSite(x: number, z: number): boolean {',
          '  for (const b of BOXES) {',
          '    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;',
          '    if (inRing(x, z, b.s.excl)) return true;', '  }', '  return false;', '}', '']
    open(os.path.join(ROOT, 'src', 'city', 'landmarkSites.ts'), 'w', encoding='utf8').write('\n'.join(ts))
    for s in sites:
        print(f"{s['key']:20s} c={s['c']} a={s['a']:.2f} ext={s['ext']} ring={len(s['ring'])} excl={len(s['excl'])}")
    print('airport', {k: len(v) for k, v in air.items()}, 'precincts', list(precincts))


if __name__ == '__main__':
    main()
