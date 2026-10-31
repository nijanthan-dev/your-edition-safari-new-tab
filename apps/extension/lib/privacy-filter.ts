import type { BrowserBridge, RawSiteMetadata, ScrapedPage } from "@homepage/agent-core";
import { getFiltered, putFiltered, type FilteredCache } from "./page-cache";
import { chunk, cleanItems, MAX_CHUNKS, redact, renderFiltered, toDigest, type FilteredItem } from "./privacy-digest";
import { extensionStore, KEYS } from "./storage";
import { HAS_ON_DEVICE_MODEL } from "./platform";
import { withTimeout } from "./timeout";

type ScrapeReport = Awaited<ReturnType<BrowserBridge["getPageHtml"]>>;

/**
 * The on-device privacy filter (Safari only, off unless the user turns it on).
 * Each scraped page goes to the Mac's own model through the app's native
 * handler (PrivacyFilter.swift), and only the short list it returns is
 * uploaded. Once on, it fails closed: when the model can't run, a page is
 * reported as failed and none of its content is sent.
 */
export const PRIVACY_FILTER_SUPPORTED = HAS_ON_DEVICE_MODEL;

type NativeReply = { ok: true; items?: FilteredItem[] } | { ok: false; reason: string };

/** A status check is instant; one summarize call is 10 to 30 seconds on device. */
const STATUS_TIMEOUT_MS = 10_000;
const SUMMARIZE_TIMEOUT_MS = 120_000;

// Safari routes native messages to the extension's own app; the id is ignored.
// A request that never answers would hang the build, so each one has a limit.
const ask = (message: { kind: string; [field: string]: unknown }, timeoutMs: number) =>
  withTimeout(
    browser.runtime.sendNativeMessage("application.id", message) as Promise<NativeReply>,
    timeoutMs,
    `the on-device model did not answer within ${timeoutMs / 1000} seconds`,
  );

/** Why the filter can't run here, or null when it can. */
export async function filterUnavailableReason(): Promise<string | null> {
  try {
    const reply = await ask({ kind: "status" }, STATUS_TIMEOUT_MS);
    return reply.ok ? null : reply.reason;
  } catch (error) {
    return `the Your Edition app did not answer (${String(error)})`;
  }
}

async function filterPage(page: ScrapedPage, progress: (part: number, parts: number) => void): Promise<string> {
  const { text, links } = toDigest(page.html, page.finalUrl ?? page.url);
  const chunks = chunk(text);
  const parts = chunks.slice(0, MAX_CHUNKS);
  const items: FilteredItem[] = [];
  // One chunk at a time: the on-device model serves one request at a time anyway.
  for (const [i, part] of parts.entries()) {
    progress(i + 1, parts.length);
    const reply = await ask(
      { kind: "summarize", title: page.title, url: page.finalUrl ?? page.url, text: part },
      SUMMARIZE_TIMEOUT_MS,
    );
    if (!reply.ok) throw new Error(reply.reason);
    items.push(...(reply.items ?? []));
  }
  return renderFiltered(page.title, cleanItems(items, links), links, Math.max(0, chunks.length - MAX_CHUNKS));
}

/** Replace each page's HTML with its filtered list; pages that can't be filtered become failures. */
export async function filterPages(report: ScrapeReport, onProgress?: (detail: string) => void): Promise<ScrapeReport> {
  const unavailable = report.pages.length ? await filterUnavailableReason() : null;
  const pages: ScrapedPage[] = [];
  const failed = [...report.failed];
  let cache = (await extensionStore.get<FilteredCache>(KEYS.filteredCache)) ?? {};
  for (const [n, page] of report.pages.entries()) {
    if (unavailable) {
      failed.push({ url: page.url, reason: `not sent: the on-device privacy filter can't run (${unavailable})` });
      continue;
    }
    try {
      let html = getFiltered(cache, page.url, page.html, Date.now());
      if (html) {
        onProgress?.(`Privacy filter: page ${n + 1} of ${report.pages.length}, already summarized`);
      } else {
        html = await filterPage(page, (part, parts) =>
          onProgress?.(`Privacy filter: page ${n + 1} of ${report.pages.length}, part ${part} of ${parts}`),
        );
        // Saved after each page, so a stopped worker continues at the next one.
        cache = putFiltered(cache, page.url, page.html, html, Date.now());
        await extensionStore.set(KEYS.filteredCache, cache);
      }
      pages.push({ ...page, title: redact(page.title), html });
    } catch (error) {
      failed.push({ url: page.url, reason: `not sent: the on-device privacy filter failed (${String(error)})` });
    }
  }
  return { pages, failed };
}

/** Page titles in the history summary also leave the Mac; strip what a pattern can catch. */
export function redactSites(sites: RawSiteMetadata[]): RawSiteMetadata[] {
  return sites.map((site) => ({ ...site, titles: site.titles.map(redact), urls: site.urls.map(redact) }));
}
