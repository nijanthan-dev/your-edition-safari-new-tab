import type { BrowserBridge } from "@homepage/agent-core";
import { getHistorySites } from "./history";
import { splitCached, updateCache, type PageCache } from "./page-cache";
import { filterPages, PRIVACY_FILTER_SUPPORTED, redactSites } from "./privacy-filter";
import { scrapeUrls } from "./scraper";
import { extensionStore, KEYS, loadSettings } from "./storage";

const filterOn = async () => PRIVACY_FILTER_SUPPORTED && (await loadSettings()).privacyFilter;

/** Reuse pages read in the last 2 hours; open tabs only for the rest. */
async function readPages(urls: string[], loadDelayMs?: number) {
  const now = Date.now();
  const cache = (await extensionStore.get<PageCache>(KEYS.pageCache)) ?? {};
  const { hits, misses } = splitCached(cache, urls, now);
  if (hits.length) console.log(`[bridge] reused ${hits.length} page(s) from the page cache`);
  const fresh = misses.length ? await scrapeUrls(misses, { loadDelay: loadDelayMs }) : { pages: [], failed: [] };
  await extensionStore.set(KEYS.pageCache, updateCache(cache, fresh.pages, now));
  return { pages: [...hits, ...fresh.pages], failed: fresh.failed };
}

/**
 * The two capabilities only a real browser has, implemented over chrome.history
 * and chrome.tabs. Runs in the service worker, in-process with the agent loop.
 * With the on-device privacy filter on (Safari), both pass through it first.
 */
export const browserBridge: BrowserBridge = {
  getHistory: async ({ daysToAnalyze, maxResults }) => {
    const history = await getHistorySites(daysToAnalyze, maxResults);
    return (await filterOn()) ? { ...history, sites: redactSites(history.sites) } : history;
  },
  getPageHtml: async ({ urls, loadDelayMs }) => {
    const report = await readPages(urls, loadDelayMs);
    return (await filterOn()) ? filterPages(report) : report;
  },
};
