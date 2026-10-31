import { extensionStore } from "./storage";

/**
 * Safari has no `history` API, so on Safari the extension keeps its own log of
 * the pages you load, from install onward. Same shape as a chrome.history item,
 * so history.ts ranks both the same way.
 */
export interface VisitItem {
  url: string;
  title?: string;
  lastVisitTime: number;
  visitCount: number;
}

interface VisitLog {
  /** When logging began, so a young log can be told apart from a quiet one. */
  startedAt: number;
  visits: Record<string, Omit<VisitItem, "url">>;
}

const LOG_KEY = "visitLog";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Kept for longer than the widest history window the agent asks for. */
const RETENTION_MS = 30 * DAY_MS;
const MAX_URLS = 5000;

/** Whether this browser has a real history API to read instead. */
export const hasHistoryApi = () => typeof browser.history?.search === "function";

async function load(): Promise<VisitLog> {
  return (await extensionStore.get<VisitLog>(LOG_KEY)) ?? { startedAt: Date.now(), visits: {} };
}

// Page loads arrive in bursts; serialize the read-modify-write so none is lost.
let queue: Promise<void> = Promise.resolve();
function update(fn: (log: VisitLog) => void): Promise<void> {
  queue = queue
    .then(async () => {
      const log = await load();
      fn(log);
      prune(log);
      await extensionStore.set(LOG_KEY, log);
    })
    .catch((error) => console.error("Visit log update failed:", error));
  return queue;
}

function prune(log: VisitLog) {
  const cutoff = Date.now() - RETENTION_MS;
  let entries = Object.entries(log.visits).filter(([, v]) => v.lastVisitTime >= cutoff);
  if (entries.length > MAX_URLS) {
    entries = entries.sort((a, b) => b[1].lastVisitTime - a[1].lastVisitTime).slice(0, MAX_URLS);
  }
  log.visits = Object.fromEntries(entries);
}

const isWebUrl = (url?: string): url is string => !!url && /^https?:\/\//.test(url);

/** Count one visit to `url`. */
export function recordVisit(url: string | undefined, title?: string) {
  if (!isWebUrl(url)) return;
  return update((log) => {
    const v = log.visits[url];
    log.visits[url] = {
      title: title || v?.title,
      lastVisitTime: Date.now(),
      visitCount: (v?.visitCount ?? 0) + 1,
    };
  });
}

/** A page's title often arrives after it finishes loading; fill it in without counting a visit. */
export function recordTitle(url: string | undefined, title: string) {
  if (!isWebUrl(url) || !title) return;
  return update((log) => {
    const v = log.visits[url];
    if (v) v.title = title;
  });
}

/** Visits since `startTime`, plus how many days the log actually covers. */
export async function searchVisits(startTime: number): Promise<{ items: VisitItem[]; daysCovered: number }> {
  const log = await load();
  const items = Object.entries(log.visits)
    .filter(([, v]) => v.lastVisitTime >= startTime)
    .map(([url, v]) => ({ url, ...v }));
  return { items, daysCovered: Math.max(1, (Date.now() - log.startedAt) / DAY_MS) };
}

/**
 * Listen for page loads. `ignoreTab` skips tabs the extension itself opened,
 * so scraping a page doesn't count as you visiting it.
 */
export function startVisitLog(ignoreTab: (tab: { id?: number; windowId?: number }) => boolean) {
  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.incognito || ignoreTab(tab)) return;
    if (changeInfo.status === "complete") void recordVisit(tab.url, tab.title);
    else if (changeInfo.title) void recordTitle(tab.url, changeInfo.title);
  });

  // A fresh install has an empty log. Start it from whatever is open now.
  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason !== "install") return;
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) if (!tab.incognito) void recordVisit(tab.url, tab.title);
  });
}
