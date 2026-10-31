import { APIConnectionError } from "@anthropic-ai/sdk";
import { ChatConnectionError } from "@homepage/agent-core";
import { WEBSITE_ACCESS_HELP } from "./platform";

/**
 * Website access. The worker needs it to reach api.anthropic.com and to read
 * pages. Chrome grants host_permissions at install; Safari grants none until
 * the user allows it, and then a blocked request shows only as a bare
 * "Connection error." from the SDK.
 */
const ALL_SITES = { origins: ["<all_urls>"] };

/** Whether the extension already has website access. */
export async function hasHostAccess(): Promise<boolean> {
  return browser.permissions.contains(ALL_SITES).catch(() => false);
}

/** How long a build waits for Safari's website-access prompt before it starts anyway. */
export const HOST_ACCESS_WAIT_MS = 15_000;

/**
 * Ask for website access. Call it straight from a click: Safari shows its
 * prompt only for a user gesture. Safari can leave the prompt hidden, so this
 * gives up after HOST_ACCESS_WAIT_MS: the build then starts, and without access
 * it ends with a message that says what to do, never a silent wait.
 */
export async function requestHostAccess(): Promise<boolean> {
  const request = browser.permissions.request(ALL_SITES).catch(() => false);
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), HOST_ACCESS_WAIT_MS));
  return Promise.race([request, timeout]);
}

/** Turn a failed request into a message that says what to do. */
export async function explainBuildError(error: unknown): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof APIConnectionError) && !(error instanceof ChatConnectionError)) return message;
  const host = error instanceof ChatConnectionError ? "the model provider" : "api.anthropic.com";
  const granted = await browser.permissions.contains(ALL_SITES).catch(() => true);
  return granted
    ? `Your Edition can't reach ${host}. Check your internet connection, then try again.`
    : `Your Edition can't reach ${host}, because it has no website access. ` +
        `${WEBSITE_ACCESS_HELP} Then try again.`;
}
