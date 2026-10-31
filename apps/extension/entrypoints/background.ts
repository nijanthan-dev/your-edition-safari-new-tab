import { BuildManager } from "@/lib/build-manager";
import { AGENT_PORT } from "@/lib/protocol";
import { KEYS } from "@/lib/storage";
import type { VisitLogRequest } from "@/lib/protocol";
import { exportVisits, importVisits, startVisitLog } from "@/lib/visit-log";

/**
 * The service worker is the build host. It owns the agent loop (BuildManager),
 * holds the Anthropic session stream, runs the browser tools in-process, and
 * drives the scheduled rebuild from an alarm.
 *
 * New-tab pages are thin views that connect on AGENT_PORT. Closing every tab
 * doesn't stop a build: the worker keeps itself warm during an active turn, and
 * the alarm heartbeat reattaches to an interrupted session after an unexpected
 * kill.
 */
const HEARTBEAT_ALARM = "homepage-heartbeat";

export default defineBackground(() => {
  const manager = new BuildManager();

  // Safari has no history API: log page loads locally instead (see lib/visit-log.ts).
  startVisitLog();

  // The worker owns the log (it caches and saves it), so pages import and export through it.
  browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    const msg = raw as VisitLogRequest;
    const work =
      msg?.kind === "importVisits" ? importVisits(msg.visits)
      : msg?.kind === "exportVisits" ? exportVisits()
      : null;
    if (!work) return false;
    work.then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({ ok: false, error: String(error) }),
    );
    return true; // the response is sent asynchronously
  });

  // A new provider, key, base URL or model mid-build: restart with it. Debounced,
  // because one change in Settings can write several keys.
  const PROVIDER_KEYS: string[] = [KEYS.provider, KEYS.apiKey, KEYS.chatApiKey, KEYS.chatBaseUrl, KEYS.chatModel];
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !PROVIDER_KEYS.some((key) => key in changes)) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => manager.restartIfRunning(), 1500);
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === AGENT_PORT) manager.attach(port);
  });

  // ~1 min is the chrome.alarms floor — fine for a recovery net and the
  // scheduled rebuild check.
  browser.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HEARTBEAT_ALARM) void manager.tick();
  });

  browser.runtime.onStartup.addListener(() => void manager.tick());
  browser.runtime.onInstalled.addListener(() => void manager.tick());

  // On every wake, reattach to an interrupted build (or consider a scheduled
  // rebuild) immediately rather than waiting for the first alarm.
  void manager.tick();
});
