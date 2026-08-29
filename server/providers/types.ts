/**
 * Normalized live-data contract for Lucknow LENS.
 *
 * The renderer must never know which upstream service produced a datum. Every
 * provider adapts its own API into these shapes, and every response is wrapped in a
 * LiveEnvelope carrying explicit provenance and freshness.
 *
 * The `status` field is load-bearing and must be honest:
 *   ok          fresh data straight from the provider
 *   stale       cached data served because the provider is failing or rate-limited;
 *               `ageSeconds` says how old, and the UI must show it as stale
 *   unavailable no usable data (missing credentials, provider down, region empty);
 *               `items` is empty and the UI must say so
 *
 * There is no fourth state where we invent plausible-looking values.
 */

export type LiveStatus = 'ok' | 'stale' | 'unavailable';

export interface LiveEnvelope<T> {
  status: LiveStatus;
  /** Human-readable provider name, e.g. "OpenSky Network". */
  provider: string;
  /** Epoch ms when the underlying data was actually fetched from the provider. */
  fetchedAt: number | null;
  /** Seconds since `fetchedAt`. */
  ageSeconds: number | null;
  /** Present when status is 'unavailable' or 'stale' — why. */
  reason?: string;
  /** Attribution/licence string the UI should surface. */
  attribution?: string;
  items: T[];
}

/** One aircraft, normalized. Fields absent upstream stay null rather than guessed. */
export interface LiveAircraft {
  /** Stable identity across polls — ICAO 24-bit address where available. */
  id: string;
  callsign: string | null;
  latitude: number;
  longitude: number;
  /** Metres above mean sea level. */
  altitude: number | null;
  /** Degrees true. */
  heading: number | null;
  /** Metres per second over ground. */
  velocity: number | null;
  /** Metres per second, positive up. */
  verticalRate: number | null;
  onGround: boolean;
  originCountry: string | null;
  /** Epoch ms of the position fix itself, which lags `fetchedAt`. */
  positionTime: number | null;
}

/** One train, normalized. */
export interface LiveTrain {
  id: string;
  number: string | null;
  name: string | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  /** km/h. */
  speed: number | null;
  /** Minutes late; negative means early. */
  delayMinutes: number | null;
  status: string | null;
  nextStation: string | null;
  positionTime: number | null;
}

export interface LiveProvider<T> {
  readonly name: string;
  /** False when the adapter cannot run at all — e.g. no API key configured. */
  isConfigured(): boolean;
  /** Why it is not configured, surfaced to the UI verbatim. */
  unavailableReason(): string;
  fetch(): Promise<T[]>;
}
