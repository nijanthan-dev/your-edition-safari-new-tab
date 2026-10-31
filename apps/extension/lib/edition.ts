/**
 * The edition is one static HTML page that the model wrote. The new tab shows it
 * in a frame that runs no scripts (EditionFrame.tsx). This pure half adds the
 * frame's own rules to the page's head, so the harness can test it.
 */

/**
 * The policy inside the frame: no scripts, fonts, frames or form posts; only
 * inline styles, and images over https (or data URLs). It can only narrow what
 * the page does. A policy that the model writes into the page cannot widen it.
 */
export const EDITION_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; form-action 'none'; frame-src 'none'";

/** Whether saved code is an HTML page. Editions from before version 0.3 were React code. */
export const isEditionHtml = (code: string): boolean => /<(?:!doctype html|html|head|body)\b/i.test(code);

/**
 * The document for the frame: the page with the policy, `target="_top"` for
 * links (they open in the tab, since sites refuse to load inside a frame) and no
 * referrer. They go right after the doctype, so the browser stays in standards mode.
 */
export function frameDocument(html: string): string {
  const head =
    `<meta http-equiv="Content-Security-Policy" content="${EDITION_CSP}">` +
    `<meta name="referrer" content="no-referrer">` +
    `<base target="_top">`;
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  return doctype ? doctype[0] + head + html.slice(doctype[0].length) : `<!doctype html>${head}${html}`;
}
