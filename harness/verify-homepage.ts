/**
 * Proves the agent's deliverable is a page the new tab can show safely: one
 * static HTML document with real links, no scripts and no external files.
 *
 * The new tab shows it in a frame that runs no scripts (EditionFrame.tsx), so a
 * script would do nothing, but its presence means the model broke the contract.
 *
 * Run: pnpm agent:verify [path]   (default: the last pnpm agent:run output)
 */
import { readFileSync } from "node:fs";
import { OUT_PATH } from "./node-bridge";

const path = process.argv[2] ?? OUT_PATH;
const html = readFileSync(path, "utf-8");

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

// ---- 1. a whole document ---------------------------------------------------
if (!/^\s*<!doctype html>/i.test(html)) fail("does not start with <!doctype html>");
if (!/<style[\s>]/i.test(html)) fail("has no <style> element");
if (html.trim().length < 2000) fail(`page suspiciously small (${html.length}b)`);
console.log(`✅ a complete HTML document (${html.length} bytes)`);

// ---- 2. no code and no external files ---------------------------------------
if (/<script[\s>]/i.test(html)) fail("contains a <script> element");
if (/\son[a-z]+\s*=/i.test(html)) fail("contains an on…= event attribute");
if (/javascript:/i.test(html)) fail("contains a javascript: URL");
if (/<link[^>]+rel=["']?stylesheet/i.test(html) || /@import|@font-face/i.test(html)) {
  fail("loads an external stylesheet or font");
}
console.log("✅ no scripts, event handlers, external stylesheets or fonts");

// ---- 3. real, linkable content ----------------------------------------------
const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
const unique = new Set(hrefs);
if (unique.size < 5) fail(`only ${unique.size} distinct external links — expected real scraped URLs`);
console.log(`✅ ${unique.size} distinct external links`);

const placeholders = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).filter((h) => /example\.com|placeholder|^#$/.test(h));
if (placeholders.length) fail(`placeholder links present: ${placeholders.slice(0, 3).join(", ")}`);
console.log(`✅ no placeholder links`);

const domains = new Set([...unique].map((u) => new URL(u).hostname.replace(/^www\./, "")));
console.log(`\nLinked domains (${domains.size}):`);
for (const d of [...domains].sort().slice(0, 12)) console.log(`   ${d}`);

console.log(`\n\x1b[32mVERIFIED\x1b[0m — ${path} is a safe, static edition.`);
