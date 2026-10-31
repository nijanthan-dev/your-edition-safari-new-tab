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
    if (entry && now - entry.at < PAGE_CACHE_TTL_MS) hits.push(entry.page);
    else misses.push(url);
  }
  return { hits, misses };
}

/** Add newly read pages, drop expired ones, and keep the newest MAX_PAGES. */
export function updateCache(cache: PageCache, pages: ScrapedPage[], now: number): PageCache {
  const next: PageCache = { ...cache };
  for (const page of pages) next[page.url] = { page, at: now };
  const fresh = Object.entries(next)
    .filter(([, entry]) => now - entry.at < PAGE_CACHE_TTL_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_PAGES);
  return Object.fromEntries(fresh);
}
