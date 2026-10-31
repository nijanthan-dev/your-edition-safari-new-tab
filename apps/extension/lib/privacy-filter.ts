import type { BrowserBridge, RawSiteMetadata, ScrapedPage } from "@homepage/agent-core";
import { chunk, cleanItems, MAX_CHUNKS, redact, renderFiltered, toDigest, type FilteredItem } from "./privacy-digest";

type ScrapeReport = Awaited<ReturnType<BrowserBridge["getPageHtml"]>>;

/**
 * The on-device privacy filter (Safari only, off unless the user turns it on).
 * Each scraped page goes to the Mac's own model through the app's native
 * handler (PrivacyFilter.swift), and only the short list it returns is
 * uploaded. Once on, it fails closed: when the model can't run, a page is
 * reported as failed and none of its content is sent.
 */
export const PRIVACY_FILTER_SUPPORTED = import.meta.env.BROWSER === "safari";

type NativeReply = { ok: true; items?: FilteredItem[] } | { ok: false; reason: string };

// Safari routes native messages to the extension's own app; the id is ignored.
const ask = (message: object) =>
  browser.runtime.sendNativeMessage("application.id", message) as Promise<NativeReply>;

/** Why the filter can't run here, or null when it can. */
export async function filterUnavailableReason(): Promise<string | null> {
  try {
    const reply = await ask({ kind: "status" });
    return reply.ok ? null : reply.reason;
  } catch (error) {
    return `the Morning Tab app did not answer (${String(error)})`;
  }
}

async function filterPage(page: ScrapedPage): Promise<string> {
  const { text, links } = toDigest(page.html, page.finalUrl ?? page.url);
  const chunks = chunk(text);
  const items: FilteredItem[] = [];
  // One chunk at a time: the on-device model serves one request at a time anyway.
  for (const part of chunks.slice(0, MAX_CHUNKS)) {
    const reply = await ask({ kind: "summarize", title: page.title, url: page.finalUrl ?? page.url, text: part });
    if (!reply.ok) throw new Error(reply.reason);
    items.push(...(reply.items ?? []));
  }
  return renderFiltered(page.title, cleanItems(items, links), links, Math.max(0, chunks.length - MAX_CHUNKS));
}

/** Replace each page's HTML with its filtered list; pages that can't be filtered become failures. */
export async function filterPages(report: ScrapeReport): Promise<ScrapeReport> {
  const unavailable = report.pages.length ? await filterUnavailableReason() : null;
  const pages: ScrapedPage[] = [];
  const failed = [...report.failed];
  for (const page of report.pages) {
    if (unavailable) {
      failed.push({ url: page.url, reason: `not sent: the on-device privacy filter can't run (${unavailable})` });
      continue;
    }
    try {
      pages.push({ ...page, title: redact(page.title), html: await filterPage(page) });
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
