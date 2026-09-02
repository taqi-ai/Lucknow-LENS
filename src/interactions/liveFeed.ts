import { useEffect, useState } from 'react';

/**
 * useLiveFeed — generic poller for any /api/live/* envelope.
 *
 * The flights hook interpolates aircraft between polls and so needs its own
 * machinery; weather and air quality are single scalar observations that change
 * every 15-60 minutes upstream, so they need none of it. What they do need is
 * the envelope's honesty preserved: `status` and `ageSeconds` reach the UI
 * intact, and there is no code path that substitutes a plausible number when
 * the provider is down.
 *
 * Polling stops entirely when the layer is switched off, so a hidden layer
 * never spends upstream quota.
 */

export type LiveStatus = 'ok' | 'stale' | 'unavailable';

export interface LiveEnvelope<T> {
  status: LiveStatus;
  provider: string;
  fetchedAt: number | null;
  ageSeconds: number | null;
  reason?: string;
  attribution?: string;
  items: T[];
}

export interface LiveFeedState<T> {
  status: LiveStatus;
  provider: string;
  ageSeconds: number | null;
  reason?: string;
  attribution?: string;
  /** The single current observation, or null when there is nothing truthful. */
  value: T | null;
}

function empty<T>(): LiveFeedState<T> {
  return { status: 'unavailable', provider: '', ageSeconds: null, value: null };
}

/** Same envelope handling as useLiveFeed, but for feeds that are lists — trains,
 * traffic incidents, news articles — where the UI needs every item, not just one. */
export interface LiveListState<T> {
  status: LiveStatus;
  provider: string;
  ageSeconds: number | null;
  reason?: string;
  attribution?: string;
  items: T[];
}

function emptyList<T>(): LiveListState<T> {
  return { status: 'unavailable', provider: '', ageSeconds: null, items: [] };
}

export function useLiveList<T>(
  url: string,
  enabled: boolean,
  intervalMs: number,
): LiveListState<T> {
  const [state, setState] = useState<LiveListState<T>>(emptyList<T>());

  useEffect(() => {
    if (!enabled) {
      setState(emptyList<T>());
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const env = await resp.json() as LiveEnvelope<T>;
        if (cancelled) return;
        setState({
          status: env.status,
          provider: env.provider,
          ageSeconds: env.ageSeconds,
          reason: env.reason,
          attribution: env.attribution,
          items: env.items,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: 'unavailable',
          provider: '',
          ageSeconds: null,
          reason: e instanceof Error ? e.message : 'request failed',
          items: [],
        });
      }
      if (!cancelled) timer = window.setTimeout(poll, intervalMs);
    };

    poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [url, enabled, intervalMs]);

  return state;
}

export function useLiveFeed<T>(
  url: string,
  enabled: boolean,
  intervalMs: number,
): LiveFeedState<T> {
  const [state, setState] = useState<LiveFeedState<T>>(empty<T>());

  useEffect(() => {
    if (!enabled) {
      setState(empty<T>());
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const env = await resp.json() as LiveEnvelope<T>;
        if (cancelled) return;
        setState({
          status: env.status,
          provider: env.provider,
          ageSeconds: env.ageSeconds,
          reason: env.reason,
          attribution: env.attribution,
          value: env.items.length > 0 ? env.items[0] : null,
        });
      } catch (e) {
        if (cancelled) return;
        // Report the failure rather than keeping the last good number on screen
        // as though it were current.
        setState({
          status: 'unavailable',
          provider: '',
          ageSeconds: null,
          reason: e instanceof Error ? e.message : 'request failed',
          value: null,
        });
      }
      if (!cancelled) timer = window.setTimeout(poll, intervalMs);
    };

    poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [url, enabled, intervalMs]);

  return state;
}

/** Shapes mirrored from server/providers/types.ts. */
export interface LiveWeatherDTO {
  observedAt: number | null;
  temperatureC: number;
  apparentTemperatureC: number | null;
  humidityPct: number | null;
  windSpeedKph: number | null;
  windDirectionDeg: number | null;
  precipitationMm: number | null;
  pressureHpa: number | null;
  isDay: boolean;
  code: number | null;
  description: string;
}

export interface LiveAirQualityDTO {
  observedAt: number | null;
  usAqi: number;
  category: string;
  dominantPollutant: string;
  pm25: number | null;
  pm10: number | null;
  carbonMonoxide: number | null;
  nitrogenDioxide: number | null;
  ozone: number | null;
  sulphurDioxide: number | null;
}

export interface LiveTrainDTO {
  id: string;
  number: string | null;
  name: string | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  delayMinutes: number | null;
  status: string | null;
  nextStation: string | null;
  positionTime: number | null;
}

export interface LiveTrafficDTO {
  id: string;
  description: string | null;
  roadName: string | null;
  category: string | null;
  severity: number | null;
  latitude: number;
  longitude: number;
  currentSpeedKph: number | null;
  freeFlowSpeedKph: number | null;
  delaySeconds: number | null;
}

export interface LiveNewsDTO {
  id: string;
  title: string;
  url: string;
  source: string | null;
  publishedAt: number | null;
  imageUrl: string | null;
}
