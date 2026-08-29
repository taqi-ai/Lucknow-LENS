import type { LiveEnvelope, LiveProvider, LiveStatus } from './types';

/**
 * CachedFeed — server-side polling wrapper shared by every live provider.
 *
 * Responsibilities:
 *  - fetch at most once per `ttlMs` regardless of how many browsers are connected,
 *    so client count never multiplies upstream API usage
 *  - collapse concurrent requests onto a single in-flight promise
 *  - apply a request timeout
 *  - back off exponentially on failure instead of hammering a struggling API
 *  - serve the last good payload as `stale` (never as `ok`) while degraded
 *  - report `unavailable` when there is nothing truthful to serve
 */

export interface CachedFeedOptions {
  /** Minimum seconds between upstream fetches. */
  ttlMs: number;
  /** Abort an upstream call after this long. */
  timeoutMs: number;
  /** Stop serving cached data as 'stale' once it is older than this. */
  maxStaleMs: number;
  attribution?: string;
}

export class CachedFeed<T> {
  private provider: LiveProvider<T>;
  private opts: CachedFeedOptions;

  private data: T[] = [];
  private fetchedAt: number | null = null;
  private inFlight: Promise<void> | null = null;

  private consecutiveFailures = 0;
  private nextAttemptAt = 0;
  private lastError: string | null = null;

  constructor(provider: LiveProvider<T>, opts: CachedFeedOptions) {
    this.provider = provider;
    this.opts = opts;
  }

  public async get(): Promise<LiveEnvelope<T>> {
    if (!this.provider.isConfigured()) {
      return this.envelope('unavailable', this.provider.unavailableReason(), []);
    }

    const now = Date.now();
    const fresh = this.fetchedAt !== null && now - this.fetchedAt < this.opts.ttlMs;

    if (!fresh && now >= this.nextAttemptAt) {
      // Collapse simultaneous callers onto one upstream request.
      if (!this.inFlight) {
        this.inFlight = this.refresh().finally(() => { this.inFlight = null; });
      }
      try {
        await this.inFlight;
      } catch {
        // Failure detail is already recorded in lastError.
      }
    }

    if (this.fetchedAt === null) {
      return this.envelope('unavailable', this.lastError ?? 'No data fetched yet', []);
    }

    const age = Date.now() - this.fetchedAt;
    if (age > this.opts.maxStaleMs) {
      return this.envelope(
        'unavailable',
        `Last successful fetch was ${Math.round(age / 1000)}s ago (${this.lastError ?? 'provider unreachable'})`,
        [],
      );
    }

    // Anything past its TTL is explicitly labelled stale — never presented as live.
    const status: LiveStatus = age < this.opts.ttlMs ? 'ok' : 'stale';
    return this.envelope(status, status === 'stale' ? (this.lastError ?? 'Serving cached data') : undefined, this.data);
  }

  private async refresh(): Promise<void> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${this.opts.timeoutMs}ms`)), this.opts.timeoutMs),
    );

    try {
      const items = await Promise.race([this.provider.fetch(), timeout]);
      this.data = items;
      this.fetchedAt = Date.now();
      this.consecutiveFailures = 0;
      this.nextAttemptAt = 0;
      this.lastError = null;
    } catch (err) {
      this.consecutiveFailures++;
      this.lastError = err instanceof Error ? err.message : String(err);
      // Exponential backoff, capped at 5 minutes.
      const backoff = Math.min(this.opts.ttlMs * 2 ** this.consecutiveFailures, 300_000);
      this.nextAttemptAt = Date.now() + backoff;
      console.warn(
        `[${this.provider.name}] fetch failed (${this.consecutiveFailures}x): ${this.lastError}. ` +
        `Next attempt in ${Math.round(backoff / 1000)}s.`,
      );
      throw err;
    }
  }

  private envelope(status: LiveStatus, reason: string | undefined, items: T[]): LiveEnvelope<T> {
    return {
      status,
      provider: this.provider.name,
      fetchedAt: this.fetchedAt,
      ageSeconds: this.fetchedAt === null ? null : Math.round((Date.now() - this.fetchedAt) / 1000),
      reason,
      attribution: this.opts.attribution,
      items,
    };
  }
}
