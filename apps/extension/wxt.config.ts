import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => {
    // Safari lacks the history and notifications APIs. lib/visit-log.ts stands in for history.
    const safari = browser === "safari";
    return {
      name: "Morning Tab",
      description: "An AI new tab page that writes your homepage from what you've actually been browsing.",
      permissions: [
        ...(safari ? [] : ["history"]), // getHistory tool
        "tabs", //          getPageHtml: open pages and watch them load
        "scripting", //     getPageHtml: inject the scraper into loaded pages
        "webRequest", //    getPageHtml: the address each scraped page was served from (observe only)
        "storage", //       API key, settings, the built homepage
        "alarms", //        heartbeat: scheduled rebuilds + reattach after a worker kill
        ...(safari ? [] : ["notifications"]), // surface a failed headless rebuild when no tab is open
      ...(safari ? ["nativeMessaging"] : []), // the on-device privacy filter in the Safari app
      ],
      // Needed to scrape arbitrary pages; also exempts api.anthropic.com from CORS.
      host_permissions: ["<all_urls>"],
    };
  },
});
