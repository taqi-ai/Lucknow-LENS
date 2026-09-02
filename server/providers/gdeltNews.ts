import type { LiveProvider, LiveNewsArticle } from './types';

/**
 * GdeltNewsProvider — recent English-language news mentioning Lucknow.
 *
 * GDELT's Doc 2.0 API (https://api.gdeltproject.org/api/v2/doc/doc) indexes news
 * coverage worldwide and is free and keyless — unlike every other layer here, this
 * one works out of the box with no configuration. Coverage is whatever the open web
 * published, so quality varies; the adapter only keeps articles that resolved a
 * title and URL, and never invents a headline when GDELT returns nothing.
 */

const ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

interface RawArticle {
  url?: string;
  title?: string;
  seendate?: string; // "20240115T120000Z"
  domain?: string;
  sourcecountry?: string;
  socialimage?: string;
}

function parseGdeltDate(s: string | undefined): number | null {
  if (!s || s.length < 15) return null;
  // "YYYYMMDDTHHMMSSZ" -> ISO
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export class GdeltNewsProvider implements LiveProvider<LiveNewsArticle> {
  public readonly name = 'GDELT Project';

  public isConfigured(): boolean {
    return true; // keyless
  }

  public unavailableReason(): string {
    return 'GDELT returned no articles for this query.';
  }

  public async fetch(): Promise<LiveNewsArticle[]> {
    const url =
      `${ENDPOINT}?query=${encodeURIComponent('Lucknow')}` +
      `&mode=artlist&maxrecords=20&sort=datedesc&format=json`;

    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`GDELT returned HTTP ${resp.status}`);

    // GDELT serves text/html content-type even for JSON payloads, and an empty
    // result set comes back as a plain-text sentence rather than `{"articles":[]}`.
    const text = await resp.text();
    let body: { articles?: RawArticle[] };
    try {
      body = JSON.parse(text);
    } catch {
      return []; // no matches — not an error
    }

    const rows = body.articles ?? [];
    const out: LiveNewsArticle[] = [];
    for (const r of rows) {
      if (!r.url || !r.title) continue;
      out.push({
        id: r.url,
        title: r.title.trim(),
        url: r.url,
        source: r.domain ?? null,
        publishedAt: parseGdeltDate(r.seendate),
        imageUrl: r.socialimage ?? null,
      });
    }
    return out;
  }
}
