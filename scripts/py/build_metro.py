"""
build_metro.py - Lucknow Metro as its own system (round 2).

Source: Overture 2026-10-21.0 segments (class=subway), split at their exact tunnel /
bridge ranges by build_transport_extract.py, and Overture `subway_station` points.
The Red Line (CCS Airport -> Munshipulia, ~22.9 km) has 4 underground stations: CCS
Airport, Hussainganj, Sachivalaya and Hazratganj; the mapped tunnel ranges agree.

Output public/landmarks/metro.json (projected app frame):
  lines    [{kind: 'viaduct'|'tunnel'|'grade', name, pts: [[x, y, z], ...]}]
           viaduct y = rail level (12.5 m) with ramps where it meets a tunnel portal
           or grade section; tunnel/grade y = 0
  stations [{name, x, z, underground, heading}]
Phase 1B (Charbagh -> Vasant Kunj, contracted Nov 2026) is NOT drawn: it is not built.

Usage: python -I scripts/py/build_metro.py
"""
import json, math, os

ROOT = os.getcwd()
C_LAT = 26.84997035; C_LON = 80.95005255000001
ML = 111320 * math.cos(math.radians(C_LAT))
P = lambda lo, la: (round((lo - C_LON) * ML, 2), round(-(la - C_LAT) * 111320, 2))
RAIL_Y = 12.5
RAMP = 330.0  # metres from the portal to full viaduct height
PORTAL_DEPTH = 9.0  # rail level below ground inside the tunnel; the ramp dives below the surface


def main():
    pieces = [f for f in json.load(open(os.path.join(ROOT, 'data/derived/transport_v2.json'))) if f['class'] == 'subway']
    lines = []
    for f in pieces:
        pts = [P(*c) for c in f['coords']]
        if f['isTunnel']:
            lines.append({'kind': 'tunnel', 'name': f.get('name'), 'pts': [[x, 0, z] for x, z in pts]})
        elif f['isElevated']:
            lines.append({'kind': 'viaduct', 'name': f.get('name'), 'pts': pts})
        else:
            lines.append({'kind': 'grade', 'name': f.get('name'), 'pts': [[x, 0, z] for x, z in pts]})
    # Portal / grade endpoints -> viaduct ends ramp down there.
    ground_ends = []   # depot / at-grade ends: the ramp comes down to the surface
    tunnel_ends = []   # bored-tunnel ends: the ramp dives below the surface
    for l in lines:
        if l['kind'] == 'tunnel':
            tunnel_ends += [l['pts'][0], l['pts'][-1]]
        elif l['kind'] != 'viaduct':
            ground_ends += [l['pts'][0], l['pts'][-1]]
    def near_tunnel(p):
        return any(math.hypot(p[0] - q[0], p[1] - q[2]) < 25 for q in tunnel_ends)
    def near_ground(p):
        return near_tunnel(p) or any(math.hypot(p[0] - q[0], p[1] - q[2]) < 25 for q in ground_ends)
    for l in lines:
        if l['kind'] != 'viaduct':
            continue
        pts = l['pts']
        s = [0.0]
        for i in range(1, len(pts)):
            s.append(s[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
        tot = s[-1]
        rh, rt = near_ground(pts[0]), near_ground(pts[-1])
        dh, dt = near_tunnel(pts[0]), near_tunnel(pts[-1])
        out = []
        for i, (x, z) in enumerate(pts):
            f = 1.0; low = 0.0
            if rh: f = min(f, s[i] / RAMP)
            if rt: f = min(f, (tot - s[i]) / RAMP)
            # depth below grade applies only to the end(s) that meet a tunnel
            if dh and s[i] / RAMP < 1.0 and (not rt or s[i] / RAMP <= (tot - s[i]) / RAMP): low = PORTAL_DEPTH
            if dt and (tot - s[i]) / RAMP < 1.0 and (not rh or (tot - s[i]) / RAMP < s[i] / RAMP): low = PORTAL_DEPTH
            f = max(0.0, min(1.0, f)); f = f * f * (3 - 2 * f)
            out.append([x, round(-low * (1 - f) + RAIL_Y * f, 2), z])
        l['pts'] = out
    stations = []
    tunnels = [l for l in lines if l['kind'] == 'tunnel']
    viaducts = [l for l in lines if l['kind'] == 'viaduct']
    def nearest(lines_, x, z):
        best = (1e9, None, 0)
        for l in lines_:
            for i in range(len(l['pts']) - 1):
                a, b = l['pts'][i], l['pts'][i + 1]
                dx, dz = b[0] - a[0], b[2] - a[2]; L2 = dx * dx + dz * dz or 1
                t = max(0, min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / L2))
                px, pz = a[0] + t * dx, a[2] + t * dz
                d = math.hypot(px - x, pz - z)
                if d < best[0]: best = (d, (px, a[1] + (b[1] - a[1]) * t, pz), math.atan2(dz, dx))
        return best
    for l in open(os.path.join(ROOT, 'data/raw/overture_infrastructure.geojsonseq'), encoding='utf8'):
        f = json.loads(l); p = f['properties']
        if p.get('class') != 'subway_station':
            continue
        x, z = P(*f['geometry']['coordinates'][:2])
        dv, pv, hv = nearest(viaducts, x, z)
        dt, pt, ht = nearest(tunnels, x, z)
        under = dt < dv
        d, pp, h = (dt, pt, ht) if under else (dv, pv, hv)
        if d > 250 or pp is None:
            continue
        if not under and pp[1] < RAIL_Y - 0.5:
            under = False
        stations.append({'name': (p.get('names') or {}).get('primary'), 'x': round(pp[0], 1), 'z': round(pp[2], 1),
                         'y': round(pp[1], 2), 'underground': under, 'heading': round(h, 4)})
    out = {'source': 'Overture 2026-10-21.0 segments (subway) + subway_station points; Phase 1B not drawn (under construction)',
           'railLevel': RAIL_Y, 'lines': lines, 'stations': stations}
    json.dump(out, open(os.path.join(ROOT, 'public/landmarks/metro.json'), 'w'), separators=(',', ':'))
    print(len(lines), 'lines', {k: sum(1 for l in lines if l['kind'] == k) for k in ('viaduct', 'tunnel', 'grade')},
          len(stations), 'stations', sum(s['underground'] for s in stations), 'underground:',
          [s['name'] for s in stations if s['underground']])


if __name__ == '__main__':
    main()
