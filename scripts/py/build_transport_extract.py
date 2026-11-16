"""
build_transport_extract.py - exact grade separation from Overture segments (round 2).

The previous extract (data/lucknow_transportation_extracted.json) flattened Overture's
linear-referenced attributes: a 27 km railway with one 200 m bridge became wholly
"level 1", so build_transportation.ts had to guess with length caps. That guessing is
what produced flyovers floating over plain ground and missing real ones.

This reads the raw Overture 2026-10-21.0 segments and SPLITS every segment at the
`between` ranges of `level_rules`, `road_flags` / `rail_flags` (is_bridge, is_tunnel,
is_under_construction) so each output piece carries exact flags:

  { id, subtype, class, name, level, isElevated, isTunnel, isLink, construction,
    width?, exact: true, coords }

  isElevated  = mapped bridge range or level > 0           (real structures only)
  isTunnel    = mapped tunnel range or level < 0           (never drawn on the surface)
  width       = Overture width_rules where present (56 segments), else class estimate
Road/water/rail crossings never create structures by themselves.

Output: data/derived/transport_v2.json   (read by scripts/build_transportation.ts)
Usage:  python -I scripts/py/build_transport_extract.py
"""
import json, math, os

ROOT = os.getcwd()
SRC = os.path.join(ROOT, 'data', 'raw', 'overture_segment.geojsonseq')
OUT = os.path.join(ROOT, 'data', 'derived', 'transport_v2.json')
LAT0 = 26.85
KX = 111320 * math.cos(math.radians(LAT0)); KY = 111320


def seglen(a, b):
    return math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY)


def slice_line(coords, t0, t1):
    """Sub-polyline between fractions t0..t1 of total length."""
    lens = [seglen(coords[i], coords[i + 1]) for i in range(len(coords) - 1)]
    total = sum(lens) or 1e-9
    d0, d1 = t0 * total, t1 * total
    out, acc = [], 0.0
    for i, L in enumerate(lens):
        a, b = coords[i], coords[i + 1]
        s, e = acc, acc + L
        if e >= d0 and s <= d1 and L > 0:
            u0 = max(0.0, (d0 - s) / L); u1 = min(1.0, (d1 - s) / L)
            p0 = [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0]
            p1 = [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1]
            if not out: out.append(p0)
            out.append(p1)
        acc = e
    return out


def ranges(props):
    """Breakpoints and per-interval state from level rules and flags."""
    events = []  # (t0, t1, key, value)
    for r in props.get('level_rules') or []:
        b = r.get('between') or [0, 1]
        events.append((b[0], b[1], 'level', r.get('value', 0)))
    for key in ('road_flags', 'rail_flags'):
        for r in props.get(key) or []:
            b = r.get('between') or [0, 1]
            for v in r.get('values') or []:
                events.append((b[0], b[1], v, True))
    cuts = sorted({0.0, 1.0, *[e[0] for e in events], *[e[1] for e in events]})
    out = []
    for i in range(len(cuts) - 1):
        t0, t1 = cuts[i], cuts[i + 1]
        if t1 - t0 < 1e-6:
            continue
        mid = (t0 + t1) / 2
        st = {'level': 0}
        for a, b, k, v in events:
            if a <= mid <= b:
                st[k] = v
        out.append((t0, t1, st))
    # merge neighbours with identical state
    merged = []
    for t0, t1, st in out:
        if merged and merged[-1][2] == st:
            merged[-1] = (merged[-1][0], t1, st)
        else:
            merged.append((t0, t1, st))
    return merged


def main():
    feats, stats = [], {'segments': 0, 'pieces': 0, 'bridge_m': 0.0, 'tunnel_m': 0.0, 'with_width': 0}
    for line in open(SRC, encoding='utf8'):
        f = json.loads(line)
        g = f['geometry']
        if g['type'] != 'LineString' or len(g['coordinates']) < 2:
            continue
        p = f['properties']
        sub = p.get('subtype')
        if sub not in ('road', 'rail'):
            continue
        stats['segments'] += 1
        name = (p.get('names') or {}).get('primary')
        width = None
        for w in p.get('width_rules') or []:
            if not w.get('between'):
                width = w.get('value')
        if width: stats['with_width'] += 1
        link = (p.get('subclass') == 'link') or any(
            'is_link' in (r.get('values') or []) for r in p.get('road_flags') or [])
        pieces = ranges(p)
        for k, (t0, t1, st) in enumerate(pieces):
            coords = g['coordinates'] if len(pieces) == 1 else slice_line(g['coordinates'], t0, t1)
            if len(coords) < 2:
                continue
            L = sum(seglen(coords[i], coords[i + 1]) for i in range(len(coords) - 1))
            if L < 0.5:
                continue
            lvl = int(st.get('level', 0) or 0)
            bridge = bool(st.get('is_bridge'))
            tunnel = bool(st.get('is_tunnel')) or lvl < 0
            elevated = (bridge or lvl > 0) and not tunnel
            if elevated: stats['bridge_m'] += L
            if tunnel: stats['tunnel_m'] += L
            o = {
                'id': f['id'] if len(pieces) == 1 else f"{f['id']}~{k}",
                'subtype': sub, 'class': p.get('class'),
                'level': max(1, lvl) if elevated else (min(-1, lvl) if tunnel else 0),
                'isElevated': elevated, 'isTunnel': tunnel, 'exact': True,
                'coords': [[round(c[0], 7), round(c[1], 7)] for c in coords],
            }
            if name: o['name'] = name
            if link: o['isLink'] = True
            if st.get('is_under_construction'): o['construction'] = True
            if width: o['width'] = width
            feats.append(o)
            stats['pieces'] += 1
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(feats, open(OUT, 'w'), separators=(',', ':'))
    print({k: (round(v / 1000, 1) if k.endswith('_m') else v) for k, v in stats.items()}, '(km for *_m)')


if __name__ == '__main__':
    main()
