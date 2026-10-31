import { APIConnectionError } from "@anthropic-ai/sdk";

/**
 * Website access. The worker needs it to reach api.anthropic.com and to read
 * pages. Chrome grants host_permissions at install; Safari grants none until
 * the user allows it, and then a blocked request shows only as a bare
 * "Connection error." from the SDK.
 */
const ALL_SITES = { origins: ["<all_urls>"] };

/**
 * Ask for website access. Call it straight from a click: Safari shows its
 * prompt only for a user gesture. Resolves at once when access is already granted.
 */
export async function requestHostAccess(): Promise<boolean> {
  try {
    return await browser.permissions.request(ALL_SITES);
  } catch {
    return false;
  }
}

/** Turn a failed request into a message that says what to do. */
export async function explainBuildError(error: unknown): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof APIConnectionError)) return message;
  const granted = await browser.permissions.contains(ALL_SITES).catch(() => true);
  return granted
    ? "Morning Tab can't reach api.anthropic.com. Check your internet connection, then try again."
    : "Morning Tab can't reach api.anthropic.com, because it has no website access. " +
        "In Safari, open Settings > Extensions > Morning Tab and click Always Allow on Every Website. Then try again.";
}
