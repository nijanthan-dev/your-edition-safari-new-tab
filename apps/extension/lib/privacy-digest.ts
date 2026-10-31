import { Parser } from "htmlparser2";

/**
 * The pure half of the on-device privacy filter (privacy-filter.ts sends the
 * chunks to the Mac's own model). A scraped page becomes plain text with each
 * link replaced by a [n] marker, so the model can point at links without ever
 * writing a URL. Its answer becomes a short HTML list whose hrefs come only
 * from the page itself.
 */

/** Plain text of a page, with `[n]` before the text of link n (1-based into `links`). */
export interface PageDigest {
  text: string;
  links: string[];
}

/** What the model returns for each item. `link` is a [n] marker. */
export interface FilteredItem {
  link: number;
  title: string;
  summary: string;
}

/**
 * Keeps each request inside the on-device model's context window (4,096
 * tokens, shared with the instructions and the answer).
 */
export const CHUNK_CHARS = 6000;
/**
 * Later chunks of a very long page are dropped; the agent learns only that they
 * were. Each chunk is one on-device model call of 10 to 30 seconds, run one at
 * a time, so this bounds the filter to about 1.5 minutes a page.
 */
export const MAX_CHUNKS = 3;
export const MAX_ITEMS = 25;

const BLOCK_TAGS = new Set(["p", "div", "li", "br", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "hr", "figure", "table"]);

export function toDigest(html: string, baseUrl: string): PageDigest {
  const links: string[] = [];
  const index = new Map<string, number>();
  let text = "";

  const parser = new Parser({
    onopentag(name, attribs) {
      if (BLOCK_TAGS.has(name)) text += "\n";
      if (name !== "a" || !attribs.href) return;
      let href: string;
      try {
        href = new URL(attribs.href, baseUrl).href;
      } catch {
        return;
      }
      if (!/^https?:$/.test(new URL(href).protocol)) return;
      let n = index.get(href);
      if (n === undefined) {
        n = links.push(href);
        index.set(href, n);
      }
      text += ` [${n}] `;
    },
    ontext(data) {
      text += data;
    },
    onclosetag(name) {
      if (BLOCK_TAGS.has(name)) text += "\n";
    },
  }, { decodeEntities: true });
  parser.write(html);
  parser.end();

  text = text
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
  return { text, links };
}

/** Split at line breaks into chunks of at most `size` characters. */
export function chunk(text: string, size = CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    for (let i = 0; i < line.length || i === 0; i += size) {
      const piece = line.slice(i, i + size);
      if (current && current.length + piece.length + 1 > size) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Remove personal details that a pattern can catch, as a second line of
 * defence after the model: email addresses, phone numbers and long digit runs
 * (card, account and order numbers).
 */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\+?\d[\d ().-]{7,}\d/g, (m) => (m.replace(/\D/g, "").length >= 8 ? "[number]" : m));
}

/** Keep items that point at a real link, once per link, with their text redacted. */
export function cleanItems(items: FilteredItem[], links: string[]): FilteredItem[] {
  const seen = new Set<number>();
  const kept: FilteredItem[] = [];
  for (const item of items) {
    if (!Number.isInteger(item.link) || item.link < 1 || item.link > links.length) continue;
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    kept.push({ link: item.link, title: redact(item.title.trim()), summary: redact(item.summary.trim()) });
    if (kept.length === MAX_ITEMS) break;
  }
  return kept;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The HTML the agent receives in place of the page: a title, a note, and the list. */
export function renderFiltered(title: string, items: FilteredItem[], links: string[], droppedChunks: number): string {
  const list = items
    .map((i) => `<li><a href="${escape(links[i.link - 1])}">${escape(i.title)}</a> ${escape(i.summary)}</li>`)
    .join("\n");
  const note =
    "This page was summarized on the user's Mac by an on-device privacy filter. " +
    "Only these items were sent. The links are from the page itself." +
    (droppedChunks ? ` The end of the page was too long and was left out.` : "");
  return `<h1>${escape(redact(title))}</h1>\n<p>${note}</p>\n<ul>\n${list}\n</ul>`;
}
