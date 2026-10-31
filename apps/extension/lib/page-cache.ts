import type { ScrapedPage } from "@homepage/agent-core";

/**
 * Pages read in the last 2 hours, so a restarted build (a new provider or key,
 * a retry after a failure) reuses them instead of opening the same tabs again.
 * The pages are already sanitized; they stay in local storage only, and the
 * privacy filter still runs on them when it is on. Pure, so it is tested
 * directly (harness/page-cache.test.ts).
 */
export interface PageCache {
  [url: string]: { page: ScrapedPage; at: number };
}

export const PAGE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PAGES = 16;

/** The requested URLs that are cached and fresh, and the ones still to load. */
export function splitCached(cache: PageCache, urls: string[], now: number) {
  const hits: ScrapedPage[] = [];
  const misses: string[] = [];
  for (const url of urls) {
    const entry = cache[url];
    if (entry && isFresh(entry.at, now)) hits.push(entry.page);
    else misses.push(url);
  }
  return { hits, misses };
}

/**
 * Pages the on-device privacy filter already summarized, keyed by URL with a
 * hash of the page they came from. A restarted build reuses them, so the filter
 * continues at the next page instead of starting again.
 */
export interface FilteredCache {
  [url: string]: { hash: string; html: string; at: number };
}

/** FNV-1a: a cheap fingerprint, so a changed page is filtered again. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function getFiltered(cache: FilteredCache, url: string, rawHtml: string, now: number): string | undefined {
  const entry = cache[url];
  return entry && entry.hash === hashText(rawHtml) && isFresh(entry.at, now) ? entry.html : undefined;
}

export function putFiltered(cache: FilteredCache, url: string, rawHtml: string, html: string, now: number): FilteredCache {
  return keepNewest({ ...cache, [url]: { hash: hashText(rawHtml), html, at: now } }, now);
}

/** Add newly read pages, drop expired ones, and keep the newest MAX_PAGES. */
export function updateCache(cache: PageCache, pages: ScrapedPage[], now: number): PageCache {
  const next: PageCache = { ...cache };
  for (const page of pages) next[page.url] = { page, at: now };
  return keepNewest(next, now);
}

const isFresh = (at: number, now: number) => now - at < PAGE_CACHE_TTL_MS;

/** Drop expired entries and keep the newest MAX_PAGES. */
function keepNewest<T extends { at: number }>(entries: Record<string, T>, now: number): Record<string, T> {
  return Object.fromEntries(
    Object.entries(entries)
      .filter(([, e]) => isFresh(e.at, now))
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_PAGES),
  );
}
