/**
 * What this browser can do, in one place. Chrome and Safari differ here, so
 * every file asks these flags instead of checking the browser itself.
 */

/** Chrome and Firefox let an extension read history. Safari has no history API. */
export const HAS_HISTORY_API = typeof browser.history?.search === "function";

/**
 * Without a history API, Your Edition logs page loads itself (lib/visit-log.ts),
 * and the Improve this tab panel imports into that log.
 */
export const USES_VISIT_LOG = !HAS_HISTORY_API;

/** Only the Safari build ships inside the Mac app that runs Apple's on-device model. */
export const HAS_ON_DEVICE_MODEL = import.meta.env.BROWSER === "safari";

/** Safari's webRequest can be missing. Then the private-address check uses host names only. */
export const HAS_WEB_REQUEST = typeof browser.webRequest?.onResponseStarted?.addListener === "function";
