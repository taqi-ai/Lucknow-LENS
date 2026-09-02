/**
 * resourceCache — one fetch and one parse per URL, for the whole app.
 *
 * The startup profile showed places_labels.json (2 MB, 47,963 records) being
 * fetched FOUR times and overlay.bin twice. Two independent consumers wanted the
 * labels — LabelManager and SearchIndex — and React StrictMode double-invokes
 * the effect that starts them, so the work was duplicated on both axes. Four
 * copies of a 2 MB download is bad; four synchronous JSON.parse calls of it on
 * the main thread during startup is what made the tab stop responding.
 *
 * Callers get the SAME promise and therefore the SAME parsed object, so this is
 * a parse cache as much as a request cache. That means the parsed results are
 * shared, not copied: treat what you get back as read-only.
 *
 * Entries are keyed by URL and never evicted, which is deliberate — the cached
 * set is a fixed handful of startup manifests, not unbounded tile traffic. Tiles
 * stream through the worker pool and are bounded by the streamer's own cache.
 */

const jsonCache = new Map<string, Promise<unknown>>();
const bufferCache = new Map<string, Promise<ArrayBuffer>>();

/** Fetch and parse JSON once. Repeat callers share the parsed object. */
export function loadJSON<T>(url: string): Promise<T> {
  let p = jsonCache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url} -> ${r.status}`);
      return r.json() as Promise<T>;
    });
    // A failed load must not be cached, or one flaky startup poisons the app
    // for its whole lifetime.
    p.catch(() => jsonCache.delete(url));
    jsonCache.set(url, p as Promise<unknown>);
  }
  return p;
}

/** Fetch binary once. Used for the baked overlay buffers. */
export function loadBuffer(url: string): Promise<ArrayBuffer> {
  let p = bufferCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url} -> ${r.status}`);
      return r.arrayBuffer();
    });
    p.catch(() => bufferCache.delete(url));
    bufferCache.set(url, p);
  }
  return p;
}

/** Number of distinct resources held. Exposed for the dev probe. */
export function cacheSize(): { json: number; buffers: number } {
  return { json: jsonCache.size, buffers: bufferCache.size };
}
