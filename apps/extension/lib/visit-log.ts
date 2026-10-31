import { EXPORT_FORMAT, isWebUrl, type ImportedVisit } from "./history-import";
import { isScraperTab } from "./scraper";
import { extensionStore, KEYS } from "./storage";
import { HAS_HISTORY_API, USES_VISIT_LOG } from "./platform";

/**
 * Safari has no `history` API, so on Safari the extension keeps its own log of
 * the pages you load, from install onward. Same shape as a chrome.history item,
 * so history.ts ranks both the same way.
 */
export interface VisitItem {
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
}

interface VisitLog {
  /** When logging began, so a young log can be told apart from a quiet one. */
  startedAt: number;
  visits: Record<string, { title?: string; lastVisitTime: number; visitCount: number }>;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Kept for longer than the widest history window the agent asks for. */
/** How long the visit log keeps a page. The import panel names this number too. */
export const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * DAY_MS;
const MAX_URLS = 5000;
/** Page loads arrive in bursts; write the log once they settle. */
const SAVE_DELAY_MS = 1000;


// Read once per worker lifetime, then kept in memory and written back after changes.
let cached: Promise<VisitLog> | undefined;
const load = () =>
  (cached ??= extensionStore
    .get<VisitLog>(KEYS.visitLog)
    .then((log) => log ?? { startedAt: Date.now(), visits: {} }));

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(log: VisitLog) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    prune(log);
    extensionStore.set(KEYS.visitLog, log).catch((error) => console.error("Visit log save failed:", error));
  }, SAVE_DELAY_MS);
}

function prune(log: VisitLog) {
  const cutoff = Date.now() - RETENTION_MS;
  let entries = Object.entries(log.visits).filter(([, v]) => v.lastVisitTime >= cutoff);
  if (entries.length > MAX_URLS) {
    entries = entries.sort((a, b) => b[1].lastVisitTime - a[1].lastVisitTime).slice(0, MAX_URLS);
  }
  log.visits = Object.fromEntries(entries);
}


/** Count one visit to `url`. */
async function recordVisit(url: string | undefined, title?: string) {
  if (!isWebUrl(url)) return;
  const log = await load();
  const v = log.visits[url];
  log.visits[url] = {
    title: title || v?.title,
    lastVisitTime: Date.now(),
    visitCount: (v?.visitCount ?? 0) + 1,
  };
  scheduleSave(log);
}

/** A page's title often arrives after it finishes loading; fill it in without counting a visit. */
async function recordTitle(url: string | undefined, title: string) {
  if (!isWebUrl(url) || !title) return;
  const log = await load();
  const v = log.visits[url];
  if (!v || v.title === title) return;
  v.title = title;
  scheduleSave(log);
}

/**
 * Merge visits from an imported history file. Visits older than the retention
 * window are dropped. The log's start moves back to the oldest imported visit,
 * so the young-log rule in history.ts treats it as the history it now covers.
 */
export async function importVisits(visits: ImportedVisit[]): Promise<{ imported: number; total: number }> {
  const log = await load();
  const cutoff = Date.now() - RETENTION_MS;
  let imported = 0;
  for (const visit of visits) {
    if (!isWebUrl(visit.url) || visit.lastVisitTime < cutoff) continue;
    const v = log.visits[visit.url];
    log.visits[visit.url] = {
      title: v?.title || visit.title,
      lastVisitTime: Math.max(v?.lastVisitTime ?? 0, visit.lastVisitTime),
      visitCount: (v?.visitCount ?? 0) + visit.visitCount,
    };
    log.startedAt = Math.min(log.startedAt, visit.lastVisitTime);
    imported++;
  }
  clearTimeout(saveTimer);
  prune(log);
  await extensionStore.set(KEYS.visitLog, log);
  return { imported, total: Object.keys(log.visits).length };
}

/** The whole log as a file the user can keep or import again. */
export async function exportVisits() {
  const log = await load();
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    visits: Object.entries(log.visits).map(([url, v]) => ({ url, ...v })),
  };
}

/**
 * Visits since `startTime`: from chrome.history where it exists, otherwise from
 * the log. `daysCovered` is how much of the window the source actually spans.
 */
export async function readVisits(
  startTime: number,
): Promise<{ items: VisitItem[]; daysCovered: number }> {
  const windowDays = (Date.now() - startTime) / DAY_MS;
  if (HAS_HISTORY_API) {
    const items = await browser.history.search({ text: "", startTime, maxResults: 10_000 });
    return { items, daysCovered: windowDays };
  }
  const log = await load();
  const items = Object.entries(log.visits)
    .filter(([, v]) => v.lastVisitTime >= startTime)
    .map(([url, v]) => ({ url, ...v }));
  return { items, daysCovered: Math.max(1, Math.min(windowDays, (Date.now() - log.startedAt) / DAY_MS)) };
}

/** On browsers without a history API, log page loads (not the scraper's own tabs). */
export function startVisitLog() {
  if (!USES_VISIT_LOG) return;

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.incognito || isScraperTab(tab)) return;
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
