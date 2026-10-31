import type { BrowserBridge } from "@homepage/agent-core";
import { getHistorySites } from "./history";
import { filterPages, PRIVACY_FILTER_SUPPORTED, redactSites } from "./privacy-filter";
import { scrapeUrls } from "./scraper";
import { loadSettings } from "./storage";

const filterOn = async () => PRIVACY_FILTER_SUPPORTED && (await loadSettings()).privacyFilter;

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
    const report = await scrapeUrls(urls, { loadDelay: loadDelayMs });
    return (await filterOn()) ? filterPages(report) : report;
  },
};
