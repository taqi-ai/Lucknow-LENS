import type { LiveAircraft, LiveProvider } from './types';

/**
 * OpenSkyProvider — live ADS-B aircraft over the Lucknow region.
 *
 * Chosen over ADS-B Exchange and Flightradar24 because it is the only one of the
 * three with a genuinely usable free tier and a public, documented REST endpoint:
 *  - anonymous access works with no signup (low daily quota, ~10s resolution)
 *  - an optional free account raises the quota substantially
 *  - ADS-B Exchange and FR24 both require paid API plans for programmatic access
 *
 * The bounding box is a hard requirement, not an optimisation: fetching global state
 * vectors would burn the entire quota in a handful of requests and return ~10,000
 * aircraft we immediately discard.
 *
 * API: https://openskynetwork.github.io/opensky-api/rest.html
 */

/** Roughly 150 km around Lucknow — enough to see aircraft approach and depart. */
const BBOX = { lamin: 25.55, lamax: 28.15, lomin: 79.55, lomax: 82.35 };

/** Index positions in OpenSky's state-vector array form. */
const S = {
  icao24: 0, callsign: 1, originCountry: 2, timePosition: 3, lastContact: 4,
  longitude: 5, latitude: 6, baroAltitude: 7, onGround: 8, velocity: 9,
  trueTrack: 10, verticalRate: 11, geoAltitude: 13,
} as const;

export class OpenSkyProvider implements LiveProvider<LiveAircraft> {
  public readonly name = 'OpenSky Network';

  /**
   * Anonymous access is supported, so this adapter is always considered configured.
   * Credentials, when present, only raise the rate limit.
   */
  public isConfigured(): boolean {
    return true;
  }

  public unavailableReason(): string {
    return 'OpenSky Network is unreachable';
  }

  public async fetch(): Promise<LiveAircraft[]> {
    const url =
      `https://opensky-network.org/api/states/all` +
      `?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;

    const headers: Record<string, string> = { 'Accept': 'application/json' };
    const user = process.env.OPENSKY_USER;
    const pass = process.env.OPENSKY_PASS;
    if (user && pass) {
      headers.Authorization = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    }

    const resp = await fetch(url, { headers });

    if (resp.status === 429) {
      throw new Error('Rate limited by OpenSky (HTTP 429)');
    }
    if (!resp.ok) {
      throw new Error(`OpenSky returned HTTP ${resp.status}`);
    }

    const body = await resp.json() as { time?: number; states?: unknown[][] | null };
    const states = body.states ?? [];

    const out: LiveAircraft[] = [];
    for (const s of states) {
      const lat = s[S.latitude] as number | null;
      const lon = s[S.longitude] as number | null;
      // Position is the one field we cannot substitute — skip rather than invent.
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;

      const icao = String(s[S.icao24] ?? '').trim();
      if (!icao) continue;

      const rawCallsign = s[S.callsign];
      const callsign = typeof rawCallsign === 'string' && rawCallsign.trim()
        ? rawCallsign.trim()
        : null;

      // Prefer GPS altitude; fall back to barometric.
      const geo = s[S.geoAltitude];
      const baro = s[S.baroAltitude];
      const altitude = typeof geo === 'number' ? geo : (typeof baro === 'number' ? baro : null);

      const timePosition = s[S.timePosition];

      out.push({
        id: icao,
        callsign,
        latitude: lat,
        longitude: lon,
        altitude,
        heading: typeof s[S.trueTrack] === 'number' ? s[S.trueTrack] as number : null,
        velocity: typeof s[S.velocity] === 'number' ? s[S.velocity] as number : null,
        verticalRate: typeof s[S.verticalRate] === 'number' ? s[S.verticalRate] as number : null,
        onGround: s[S.onGround] === true,
        originCountry: typeof s[S.originCountry] === 'string' ? s[S.originCountry] as string : null,
        positionTime: typeof timePosition === 'number' ? timePosition * 1000 : null,
      });
    }

    return out;
  }
}
