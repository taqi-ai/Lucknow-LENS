import type { LiveProvider, LiveTrafficIncident } from './types';

/**
 * TomTomTrafficProvider — live traffic incidents in Lucknow.
 *
 * TomTom's Traffic Incident Details API is the only incident-level feed with
 * usable Lucknow coverage, and it is key-gated. This adapter stays
 * **unconfigured** — reporting `unavailable` to the UI — until a key is present
 * in TOMTOM_API_KEY, matching RailRadarProvider's honesty pattern exactly: no
 * fabricated jams, no sample incidents.
 */

const ENDPOINT = 'https://api.tomtom.com/traffic/services/5/incidentDetails';

/** Bounding box around Lucknow city (minLon,minLat,maxLon,maxLat). */
const BBOX = '80.80,26.70,81.10,27.00';

interface RawIncidentProperties {
  id?: string;
  iconCategory?: number;
  events?: { description?: string; code?: number }[];
  magnitudeOfDelay?: number;
  roadNumbers?: string[];
  from?: string;
  to?: string;
  length?: number;
  delay?: number;
}

interface RawFeature {
  properties?: RawIncidentProperties;
  geometry?: { type?: string; coordinates?: unknown };
}

const ICON_CATEGORY: Record<number, string> = {
  0: 'UNKNOWN', 1: 'ACCIDENT', 2: 'FOG', 3: 'DANGEROUS_CONDITIONS', 4: 'RAIN',
  5: 'ICE', 6: 'JAM', 7: 'LANE_CLOSED', 8: 'ROAD_CLOSED', 9: 'ROAD_WORKS',
  10: 'WIND', 11: 'FLOODING', 14: 'BROKEN_DOWN_VEHICLE',
};

function firstPointOf(geometry: RawFeature['geometry']): [number, number] | null {
  const coords = geometry?.coordinates as unknown;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  // Point: [lon, lat]. LineString: [[lon,lat], ...]. Take the first vertex either way.
  const p = typeof coords[0] === 'number' ? coords : coords[0];
  if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') {
    return [p[1], p[0]]; // -> [lat, lon]
  }
  return null;
}

export class TomTomTrafficProvider implements LiveProvider<LiveTrafficIncident> {
  public readonly name = 'TomTom Traffic';

  public isConfigured(): boolean {
    return Boolean(process.env.TOMTOM_API_KEY);
  }

  public unavailableReason(): string {
    return 'No live traffic provider configured. TomTom\'s incident API requires an ' +
           'API key; set TOMTOM_API_KEY in .env to enable this layer.';
  }

  public async fetch(): Promise<LiveTrafficIncident[]> {
    const key = process.env.TOMTOM_API_KEY;
    if (!key) throw new Error('TOMTOM_API_KEY is not set');

    const url =
      `${ENDPOINT}?bbox=${BBOX}&fields=` +
      encodeURIComponent('{incidents{type,geometry{type,coordinates},properties{id,iconCategory,events{description,code},magnitudeOfDelay,roadNumbers,from,to,length,delay}}}') +
      `&language=en-GB&key=${encodeURIComponent(key)}`;

    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (resp.status === 401 || resp.status === 403) {
      throw new Error('TomTom rejected the API key (HTTP ' + resp.status + ')');
    }
    if (resp.status === 429) {
      throw new Error('Rate limited by TomTom (HTTP 429)');
    }
    if (!resp.ok) {
      throw new Error(`TomTom returned HTTP ${resp.status}`);
    }

    const body = await resp.json() as { incidents?: RawFeature[] };
    const rows = body.incidents ?? [];

    const out: LiveTrafficIncident[] = [];
    for (const r of rows) {
      const point = firstPointOf(r.geometry);
      if (!point) continue; // no position, no marker

      const props = r.properties ?? {};
      const [lat, lon] = point;
      const category = typeof props.iconCategory === 'number' ? ICON_CATEGORY[props.iconCategory] ?? null : null;
      const description = props.events?.[0]?.description ?? null;
      const roadName = props.roadNumbers?.length ? props.roadNumbers.join(', ') : (props.from && props.to ? `${props.from} → ${props.to}` : null);

      out.push({
        id: props.id ?? `${lat.toFixed(5)},${lon.toFixed(5)}`,
        description,
        roadName,
        category,
        severity: typeof props.magnitudeOfDelay === 'number' ? props.magnitudeOfDelay : null,
        latitude: lat,
        longitude: lon,
        currentSpeedKph: null,
        freeFlowSpeedKph: null,
        delaySeconds: typeof props.delay === 'number' ? props.delay : null,
      });
    }

    return out;
  }
}
