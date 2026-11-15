import type { LiveNewsArticle, LiveProvider } from './types';

/**
 * RssNewsProvider — Lucknow city headlines from the publishers' own RSS feeds
 * (Hindustan Times and Times of India, both keyless). Each item links back to the
 * publisher; we show the headline, source and time only, as a feed reader would.
 */
const FEEDS = [
  { source: 'Hindustan Times', url: 'https://www.hindustantimes.com/feeds/rss/cities/lucknow-news/rssfeed.xml' },
  { source: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128819658.cms' },
];

const tag = (xml: string, name: string) => {
  // Note the doubled backslashes: inside a template string a lone \s would lose its backslash.
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return null;
  return m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
};
const attr = (xml: string, name: string, a: string) => xml.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]+)"`, 'i'))?.[1] ?? null;

export class RssNewsProvider implements LiveProvider<LiveNewsArticle> {
  public readonly name = 'Lucknow news (HT, TOI)';
  public isConfigured(): boolean { return true; }
  public unavailableReason(): string { return 'The news feeds could not be reached.'; }

  public async fetch(): Promise<LiveNewsArticle[]> {
    const results = await Promise.allSettled(FEEDS.map(async (f) => {
      const r = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TerralytFeedReader/1.0)', Accept: 'application/rss+xml, application/xml' }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(`${f.source} HTTP ${r.status}`);
      const xml = await r.text();
      return xml.split(/<item[\s>]/i).slice(1).map((chunk) => {
        const title = tag(chunk, 'title');
        const link = tag(chunk, 'link');
        const date = tag(chunk, 'pubDate');
        const img = attr(chunk, 'media:content', 'url') ?? attr(chunk, 'enclosure', 'url');
        if (!title || !link) return null;
        return { id: link, title, url: link, source: f.source, publishedAt: date ? Date.parse(date) || null : null, imageUrl: img } as LiveNewsArticle;
      }).filter(Boolean) as LiveNewsArticle[];
    }));
    const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (items.length === 0) {
      const why = results.map((r) => (r.status === 'rejected' ? String(r.reason) : 'empty')).join('; ');
      throw new Error(why);
    }
    const seen = new Set<string>();
    return items
      .filter((a) => { const k = a.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .slice(0, 30);
  }
}
