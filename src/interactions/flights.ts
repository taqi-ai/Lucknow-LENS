import { useEffect, useRef, useState } from 'react';
import type { LiveFeedStatus, SimulatedFlight } from '../types';
import { project } from '../search/SearchIndex';

/**
 * Live flight feed.
 *
 * Replaces the previous hard-coded four-aircraft simulation. Positions now come
 * from real ADS-B via the server's /api/live/flights proxy (OpenSky Network); the
 * browser never contacts an upstream API and never holds a credential.
 *
 * Two things this deliberately does NOT do:
 *  - it never synthesises aircraft when the provider is unavailable
 *  - it never presents stale data as live; `status` is passed through untouched
 *
 * What it does do is interpolate. The server polls every ~12 s, so between polls
 * each aircraft is dead-reckoned from its last known heading and ground speed.
 * That keeps motion smooth without inventing anything: the moment a real fix
 * arrives the aircraft is re-anchored to it.
 */

interface LiveAircraftDTO {
  id: string;
  callsign: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  heading: number | null;
  velocity: number | null;
  verticalRate: number | null;
  onGround: boolean;
  originCountry: string | null;
  positionTime: number | null;
}

interface LiveEnvelopeDTO {
  status: LiveFeedStatus;
  provider: string;
  fetchedAt: number | null;
  ageSeconds: number | null;
  reason?: string;
  attribution?: string;
  items: LiveAircraftDTO[];
}

/** Server poll cadence. Matches the server-side TTL; the cache absorbs the rest. */
const POLL_MS = 12_000;

/** Aircraft with no fix newer than this are dropped rather than dead-reckoned on. */
const MAX_DEAD_RECKON_MS = 90_000;

interface Anchor {
  dto: LiveAircraftDTO;
  /** Client clock time when this fix was adopted. */
  anchoredAt: number;
  x: number;
  z: number;
}

export interface FlightFeedState {
  flights: SimulatedFlight[];
  status: LiveFeedStatus;
  provider: string;
  ageSeconds: number | null;
  reason?: string;
  attribution?: string;
}

const EMPTY: FlightFeedState = {
  flights: [],
  status: 'unavailable',
  provider: 'OpenSky Network',
  ageSeconds: null,
  reason: 'Connecting…',
};

export function useLiveFlights(enabled: boolean): FlightFeedState {
  const [state, setState] = useState<FlightFeedState>(EMPTY);
  const anchorsRef = useRef(new Map<string, Anchor>());
  const metaRef = useRef<Omit<FlightFeedState, 'flights'>>(EMPTY);

  // ── Poll the server ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      anchorsRef.current.clear();
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const resp = await fetch('/api/live/flights');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const env = await resp.json() as LiveEnvelopeDTO;
        if (cancelled) return;

        metaRef.current = {
          status: env.status,
          provider: env.provider,
          ageSeconds: env.ageSeconds,
          reason: env.reason,
          attribution: env.attribution,
        };

        const now = Date.now();
        const anchors = anchorsRef.current;
        const seen = new Set<string>();

        for (const dto of env.items) {
          seen.add(dto.id);
          const p = project(dto.latitude, dto.longitude);
          anchors.set(dto.id, { dto, anchoredAt: now, x: p.x, z: p.z });
        }
        // Drop aircraft that left the region or stopped reporting.
        for (const id of [...anchors.keys()]) {
          if (!seen.has(id)) anchors.delete(id);
        }
      } catch (err) {
        if (cancelled) return;
        metaRef.current = {
          ...metaRef.current,
          status: 'unavailable',
          reason: err instanceof Error ? err.message : String(err),
        };
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, POLL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled]);

  // ── Interpolate between polls ────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = 0;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      // 10 Hz is ample for smooth motion and keeps React re-renders cheap.
      if (t - last < 100) return;
      last = t;

      const now = Date.now();
      const out: SimulatedFlight[] = [];

      for (const [id, a] of anchorsRef.current) {
        const elapsed = now - a.anchoredAt;
        if (elapsed > MAX_DEAD_RECKON_MS) continue;

        const dt = elapsed / 1000;
        const speed = a.dto.velocity ?? 0;      // m/s
        const heading = a.dto.heading ?? 0;     // degrees true, 0 = north

        // World axes: +x east, -z north (matches the tile projection).
        const rad = (heading * Math.PI) / 180;
        const x = a.x + Math.sin(rad) * speed * dt;
        const z = a.z - Math.cos(rad) * speed * dt;

        const baseAlt = a.dto.altitude ?? 0;
        const altitude = Math.max(0, baseAlt + (a.dto.verticalRate ?? 0) * dt);

        out.push({
          id,
          airline: a.dto.callsign ?? id.toUpperCase(),
          altitude,
          speed,
          heading,
          origin: a.dto.originCountry ?? '',
          destination: '',
          x,
          z,
          progress: 0,
          onGround: a.dto.onGround,
          verticalRate: a.dto.verticalRate,
          positionTime: a.dto.positionTime,
        });
      }

      setState({ flights: out, ...metaRef.current });
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return state;
}
