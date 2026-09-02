import type { LiveProvider, LiveTrain } from './types';

/**
 * RailRadarProvider — live train positions around Lucknow.
 *
 * Unlike flights, there is no free anonymous tier for Indian live-train data. Every
 * usable service (RailRadar, RailwayAPI, Indian Rail API and friends) is key-gated,
 * and most are paid. So this adapter is written against RailRadar's documented shape
 * and stays **unconfigured** — reporting `unavailable` to the UI — until a key is
 * present in RAILRADAR_API_KEY.
 *
 * It deliberately has no fallback sample data. A digital twin that invents train
 * positions is worse than one that says it cannot see any.
 *
 * Set RAILRADAR_API_BASE if your plan uses a different host. Because the exact
 * response schema varies by plan, the mapper is defensive and skips any record it
 * cannot resolve a real position for.
 */

const DEFAULT_BASE = 'https://api.railradar.in/v1';

/** Bounding box around Lucknow's rail network. */
const BBOX = { latMin: 26.55, latMax: 27.15, lonMin: 80.6, lonMax: 81.3 };

interface RawTrain {
  train_number?: string | number;
  trainNumber?: string | number;
  number?: string | number;
  train_name?: string;
  trainName?: string;
  name?: string;
  latitude?: number; lat?: number;
  longitude?: number; lon?: number; lng?: number;
  heading?: number; bearing?: number;
  speed?: number; current_speed?: number;
  delay?: number; delay_minutes?: number; delayMin?: number;
  status?: string;
  next_station?: string; nextStation?: string;
  timestamp?: number; updated_at?: number;
}

const num = (...vals: unknown[]): number | null => {
  for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
};

const str = (...vals: unknown[]): string | null => {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
};

export class RailRadarProvider implements LiveProvider<LiveTrain> {
  public readonly name = 'RailRadar';

  public isConfigured(): boolean {
    return Boolean(process.env.RAILRADAR_API_KEY);
  }

  public unavailableReason(): string {
    return 'No live train provider configured. Indian live-train APIs require a paid ' +
           'API key; set RAILRADAR_API_KEY in .env to enable this layer.';
  }

  public async fetch(): Promise<LiveTrain[]> {
    const key = process.env.RAILRADAR_API_KEY;
    if (!key) throw new Error('RAILRADAR_API_KEY is not set');

    const base = process.env.RAILRADAR_API_BASE || DEFAULT_BASE;
    const url =
      `${base}/trains/live?latMin=${BBOX.latMin}&latMax=${BBOX.latMax}` +
      `&lonMin=${BBOX.lonMin}&lonMax=${BBOX.lonMax}`;

    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json', 'x-api-key': key },
    });

    if (resp.status === 401 || resp.status === 403) {
      throw new Error('RailRadar rejected the API key (HTTP ' + resp.status + ')');
    }
    if (resp.status === 429) {
      throw new Error('Rate limited by RailRadar (HTTP 429)');
    }
    if (!resp.ok) {
      throw new Error(`RailRadar returned HTTP ${resp.status}`);
    }

    const body = await resp.json() as { data?: RawTrain[]; trains?: RawTrain[] } | RawTrain[];
    const rows: RawTrain[] = Array.isArray(body)
      ? body
      : (body.data ?? body.trains ?? []);

    const out: LiveTrain[] = [];
    for (const r of rows) {
      const lat = num(r.latitude, r.lat);
      const lon = num(r.longitude, r.lon, r.lng);
      if (lat === null || lon === null) continue; // no position, no marker

      const number = str(
        typeof r.train_number === 'number' ? String(r.train_number) : r.train_number,
        typeof r.trainNumber === 'number' ? String(r.trainNumber) : r.trainNumber,
        typeof r.number === 'number' ? String(r.number) : r.number,
      );

      out.push({
        id: number ?? `${lat.toFixed(4)},${lon.toFixed(4)}`,
        number,
        name: str(r.train_name, r.trainName, r.name),
        latitude: lat,
        longitude: lon,
        heading: num(r.heading, r.bearing),
        speed: num(r.speed, r.current_speed),
        delayMinutes: num(r.delay, r.delay_minutes, r.delayMin),
        status: str(r.status),
        nextStation: str(r.next_station, r.nextStation),
        positionTime: num(r.timestamp, r.updated_at),
      });
    }

    return out;
  }
}
