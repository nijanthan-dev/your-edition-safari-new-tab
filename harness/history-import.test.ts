import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "../apps/extension/node_modules/fflate";
import { EXPORT_FORMAT, parseHistoryJson, readHistoryFile } from "../apps/extension/lib/history-import";
import { PAGE_CACHE_TTL_MS, getFiltered, hashText, putFiltered, splitCached, updateCache } from "../apps/extension/lib/page-cache";

const T = 1_793_000_000_000; // a fixed time in ms
const usec = (ms: number) => ms * 1000;

const safariExport = {
  metadata: { browser_name: "Safari", data_type: "history" },
  history: [
    { url: "https://news.example/a", title: "A", time_usec: usec(T), visit_count: 3 },
    { url: "https://news.example/a", title: "A newer", time_usec: usec(T + 1000), visit_count: 2 },
    { url: "https://blog.example/", time_usec: usec(T - 5000) },
    { url: "file:///Users/x/secret.txt", time_usec: usec(T) },
    { url: "https://bad.example/", time_usec: "yesterday" },
  ],
};

describe("parseHistoryJson", () => {
  test("reads Safari's export, merges repeat URLs and skips non-web or broken entries", () => {
    const visits = parseHistoryJson(JSON.stringify(safariExport));
    expect(visits).toEqual([
      { url: "https://news.example/a", title: "A newer", lastVisitTime: T + 1000, visitCount: 5 },
      { url: "https://blog.example/", title: undefined, lastVisitTime: T - 5000, visitCount: 1 },
    ]);
  });

  test("reads Chrome Takeout and Morning Tab's own export", () => {
    const takeout = { "Browser History": [{ url: "https://x.example/", title: "X", time_usec: usec(T) }] };
    expect(parseHistoryJson(JSON.stringify(takeout))).toEqual([
      { url: "https://x.example/", title: "X", lastVisitTime: T, visitCount: 1 },
    ]);
    const own = { format: EXPORT_FORMAT, version: 1, visits: [{ url: "https://y.example/", lastVisitTime: T, visitCount: 4 }] };
    expect(parseHistoryJson(JSON.stringify(own))).toEqual([
      { url: "https://y.example/", title: undefined, lastVisitTime: T, visitCount: 4 },
    ]);
  });

  test("explains files it cannot read", () => {
    expect(() => parseHistoryJson("not json")).toThrow("not valid JSON");
    expect(() => parseHistoryJson(JSON.stringify({ bookmarks: [] }))).toThrow("No history entries");
  });
});

describe("readHistoryFile", () => {
  test("opens only History.json from a Safari ZIP, never the passwords file", () => {
    const zip = zipSync({
      "Safari Export/History.json": strToU8(JSON.stringify(safariExport)),
      "Safari Export/Passwords.csv": strToU8("site,user,password\nbank.example,me,hunter2"),
      "Safari Export/Bookmarks.html": strToU8("<html></html>"),
    });
    const visits = readHistoryFile("Safari Export.zip", zip);
    expect(visits.map((v) => v.url)).toEqual(["https://news.example/a", "https://blog.example/"]);
  });

  test("says what is missing when the ZIP has no history", () => {
    const zip = zipSync({ "Passwords.csv": strToU8("x") });
    expect(() => readHistoryFile("export.zip", zip)).toThrow("has no History.json");
  });

  test("reads a plain JSON file", () => {
    expect(readHistoryFile("History.json", strToU8(JSON.stringify(safariExport)))).toHaveLength(2);
  });
});

describe("page cache", () => {
  const page = (url: string) => ({ url, title: url, html: "<p>x</p>" });

  test("serves fresh pages and asks for the rest", () => {
    const cache = updateCache({}, [page("https://a.example/"), page("https://b.example/")], T);
    const { hits, misses } = splitCached(cache, ["https://a.example/", "https://c.example/"], T + 60_000);
    expect(hits.map((p) => p.url)).toEqual(["https://a.example/"]);
    expect(misses).toEqual(["https://c.example/"]);
  });

  test("drops pages older than 2 hours and keeps at most 16", () => {
    const old = updateCache({}, [page("https://old.example/")], T);
    expect(splitCached(old, ["https://old.example/"], T + PAGE_CACHE_TTL_MS).misses).toEqual(["https://old.example/"]);
    const many = updateCache(old, Array.from({ length: 20 }, (_, i) => page(`https://p${i}.example/`)), T + PAGE_CACHE_TTL_MS);
    expect(Object.keys(many)).toHaveLength(16);
    expect(many["https://old.example/"]).toBeUndefined();
  });
});

describe("filtered-page cache", () => {
  test("reuses a summary only for the same page content, within 2 hours", () => {
    const cache = putFiltered({}, "https://a.example/", "<p>raw</p>", "<ul>summary</ul>", T);
    expect(getFiltered(cache, "https://a.example/", "<p>raw</p>", T + 60_000)).toBe("<ul>summary</ul>");
    expect(getFiltered(cache, "https://a.example/", "<p>changed</p>", T + 60_000)).toBeUndefined();
    expect(getFiltered(cache, "https://a.example/", "<p>raw</p>", T + PAGE_CACHE_TTL_MS)).toBeUndefined();
    expect(getFiltered(cache, "https://b.example/", "<p>raw</p>", T)).toBeUndefined();
  });

  test("hashes are stable and differ for different text", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});
