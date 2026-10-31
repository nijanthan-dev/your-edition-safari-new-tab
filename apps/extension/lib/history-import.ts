import { strFromU8, unzipSync } from "fflate";

/**
 * Reads browsing-history files so Safari users can give the agent more than
 * the pages they loaded since install. Pure: no browser APIs, so it is tested
 * directly (harness/history-import.test.ts).
 *
 * Accepted:
 * - Safari: File > Export Browsing Data to File… writes a ZIP with History.json,
 *   `{ "history": [{ url, title, time_usec, visit_count }] }`. Apple does not
 *   document it; the fields match Chromium's Safari importer.
 * - Chrome (Google Takeout): `{ "Browser History": [{ url, title, time_usec }] }`.
 * - Your Edition's own export (EXPORT_FORMAT).
 */

export interface ImportedVisit {
  url: string;
  title?: string;
  lastVisitTime: number;
  visitCount: number;
}

export const EXPORT_FORMAT = "your-edition-visit-log";

/** Only this file is ever decompressed from a ZIP. A Safari export can also hold passwords and cards. */
const HISTORY_FILE = /(^|\/)History\.json$/i;

export function readHistoryFile(name: string, bytes: Uint8Array): ImportedVisit[] {
  if (/\.zip$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const files = unzipSync(bytes, { filter: (file) => HISTORY_FILE.test(file.name) });
    const texts = Object.values(files).map((data) => strFromU8(data));
    if (!texts.length) throw new Error("The ZIP file has no History.json. In the Safari export, include History.");
    return mergeImported(texts.flatMap(parseHistoryJson));
  }
  return parseHistoryJson(strFromU8(bytes));
}

export function parseHistoryJson(text: string): ImportedVisit[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  const entries = findEntries(data);
  if (!entries) throw new Error("No history entries found in the file.");
  return mergeImported(entries.map(toVisit).filter((v): v is ImportedVisit => v !== null));
}

/** The array of history entries, wherever the format keeps it. */
function findEntries(data: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  for (const key of ["history", "Browser History", "visits"]) {
    if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
  }
  return null;
}

function toVisit(entry: Record<string, unknown>): ImportedVisit | null {
  const url = typeof entry.url === "string" ? entry.url : null;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const time =
    typeof entry.time_usec === "number" ? entry.time_usec / 1000
    : typeof entry.lastVisitTime === "number" ? entry.lastVisitTime
    : NaN;
  if (!Number.isFinite(time) || time <= 0) return null;
  const count = Number(entry.visit_count ?? entry.visitCount ?? 1);
  return {
    url,
    title: typeof entry.title === "string" && entry.title ? entry.title : undefined,
    lastVisitTime: Math.round(time),
    visitCount: Number.isFinite(count) && count > 0 ? Math.round(count) : 1,
  };
}

/** One entry per URL: visits summed, the latest time and title kept. */
function mergeImported(visits: ImportedVisit[]): ImportedVisit[] {
  const byUrl = new Map<string, ImportedVisit>();
  for (const v of visits) {
    const seen = byUrl.get(v.url);
    if (!seen) {
      byUrl.set(v.url, { ...v });
      continue;
    }
    seen.visitCount += v.visitCount;
    if (v.lastVisitTime > seen.lastVisitTime) {
      seen.lastVisitTime = v.lastVisitTime;
      seen.title = v.title ?? seen.title;
    }
  }
  return [...byUrl.values()];
}
