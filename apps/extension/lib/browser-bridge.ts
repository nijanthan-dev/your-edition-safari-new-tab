import type { BrowserBridge } from "@homepage/agent-core";
import { getHistorySites } from "./history";
import { splitCached, updateCache, type PageCache } from "./page-cache";
import { filterPages, PRIVACY_FILTER_SUPPORTED, redactSites } from "./privacy-filter";
import { scrapeUrls } from "./scraper";
import { extensionStore, KEYS, loadSettings } from "./storage";

const filterOn = async () => PRIVACY_FILTER_SUPPORTED && (await loadSettings()).privacyFilter;

/** Reuse pages read in the last 2 hours; open tabs only for the rest. */
async function readPages(urls: string[], loadDelayMs?: number, onProgress?: (detail: string) => void) {
  const now = Date.now();
  const cache = (await extensionStore.get<PageCache>(KEYS.pageCache)) ?? {};
  const { hits, misses } = splitCached(cache, urls, now);
  if (hits.length) onProgress?.(`Reused ${hits.length} page(s) read in the last 2 hours`);
  if (misses.length) onProgress?.(`Opening ${misses.length} page(s) in a background window`);
  const fresh = misses.length
    ? await scrapeUrls(misses, { loadDelay: loadDelayMs, onProgress })
    : { pages: [], failed: [] };
  // The cache holds whole pages, so write it only when there is something new.
  if (fresh.pages.length) await extensionStore.set(KEYS.pageCache, updateCache(cache, fresh.pages, now));
  return { pages: [...hits, ...fresh.pages], failed: fresh.failed };
}

/**
 * The two capabilities only a real browser has, implemented over chrome.history
 * and chrome.tabs. Runs in the service worker, in-process with the agent loop.
 * With the on-device privacy filter on (Safari), both pass through it first.
 */
export const browserBridge: BrowserBridge = {
  getHistory: async ({ daysToAnalyze }) => {
    const history = await getHistorySites(daysToAnalyze);
    return (await filterOn()) ? { ...history, sites: redactSites(history.sites) } : history;
  },
  getPageHtml: async ({ urls, loadDelayMs, onProgress }) => {
    const report = await readPages(urls, loadDelayMs, onProgress);
    if (!(await filterOn())) return report;
    onProgress?.(`Privacy filter: summarizing ${report.pages.length} page(s) on this Mac. This takes up to 1.5 minutes a page.`);
    return filterPages(report, onProgress);
  },
};
