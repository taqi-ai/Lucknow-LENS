"""Minimal WGS84 <-> UTM (northern hemisphere) conversion, no pyproj needed."""
import math
A = 6378137.0; F = 1 / 298.257223563; K0 = 0.9996
E2 = F * (2 - F); EP2 = E2 / (1 - E2)

def ll_to_utm(lat, lon, zone):
    lon0 = math.radians((zone - 1) * 6 - 180 + 3)
    phi = math.radians(lat); lam = math.radians(lon)
    n = A / math.sqrt(1 - E2 * math.sin(phi) ** 2)
    t = math.tan(phi) ** 2; c = EP2 * math.cos(phi) ** 2
    a = math.cos(phi) * (lam - lon0)
    m = A * ((1 - E2 / 4 - 3 * E2**2 / 64 - 5 * E2**3 / 256) * phi
             - (3 * E2 / 8 + 3 * E2**2 / 32 + 45 * E2**3 / 1024) * math.sin(2 * phi)
             + (15 * E2**2 / 256 + 45 * E2**3 / 1024) * math.sin(4 * phi)
             - (35 * E2**3 / 3072) * math.sin(6 * phi))
    x = K0 * n * (a + (1 - t + c) * a**3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * EP2) * a**5 / 120) + 500000
    y = K0 * (m + n * math.tan(phi) * (a * a / 2 + (5 - t + 9 * c + 4 * c * c) * a**4 / 24
              + (61 - 58 * t + t * t + 600 * c - 330 * EP2) * a**6 / 720))
    return x, y
