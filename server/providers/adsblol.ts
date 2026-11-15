import type { LiveAircraft, LiveProvider } from './types';

/**
 * AdsbLolProvider — community ADS-B receiver network, used as the fallback when OpenSky
 * is rate limited or unreachable (cloud IPs are often throttled by OpenSky).
 *
 * Keyless, open data (ODbL). Radius query is centred on Lucknow, 150 nautical miles,
 * which matches the footprint the OpenSky box covers.
 * API: https://api.adsb.lol/docs
 */
interface Raw {
  hex?: string; flight?: string; lat?: number; lon?: number;
  alt_baro?: number | 'ground'; gs?: number; track?: number; baro_rate?: number; seen_pos?: number;
}

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const FPM_TO_MS = 0.00508;

export class AdsbLolProvider implements LiveProvider<LiveAircraft> {
  public readonly name = 'adsb.lol';
  public isConfigured(): boolean { return true; }
  public unavailableReason(): string { return 'adsb.lol is unreachable'; }

  public async fetch(): Promise<LiveAircraft[]> {
    const resp = await fetch('https://api.adsb.lol/v2/point/26.85/80.95/150', { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error(`adsb.lol returned HTTP ${resp.status}`);
    const body = (await resp.json()) as { ac?: Raw[]; now?: number };
    const now = Date.now();
    const out: LiveAircraft[] = [];
    for (const a of body.ac ?? []) {
      if (typeof a.lat !== 'number' || typeof a.lon !== 'number' || !a.hex) continue;
      const onGround = a.alt_baro === 'ground';
      out.push({
        id: a.hex,
        callsign: a.flight?.trim() || null,
        latitude: a.lat,
        longitude: a.lon,
        altitude: typeof a.alt_baro === 'number' ? a.alt_baro * FT_TO_M : onGround ? 0 : null,
        heading: typeof a.track === 'number' ? a.track : null,
        velocity: typeof a.gs === 'number' ? a.gs * KT_TO_MS : null,
        verticalRate: typeof a.baro_rate === 'number' ? a.baro_rate * FPM_TO_MS : null,
        onGround,
        originCountry: null,
        positionTime: typeof a.seen_pos === 'number' ? now - a.seen_pos * 1000 : now,
      });
    }
    return out;
  }
}
