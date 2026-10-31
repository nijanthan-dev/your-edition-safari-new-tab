import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    build: {
      rolldownOptions: {
        onLog(level, log, handler) {
          // The Anthropic SDK's Node-only credential helpers are never used in the browser.
          if (log.message?.includes("has been externalized for browser compatibility")) return;
          handler(level, log);
        },
      },
    },
  }),
  hooks: {
    // The scraper is injected at runtime, so WXT writes "content_scripts": [].
    // Chrome ignores the empty list; Safari rejects it as an invalid entry.
    "build:manifestGenerated": (_wxt, manifest) => {
      if (!manifest.content_scripts?.length) delete manifest.content_scripts;
    },
  },
  manifest: ({ browser }) => {
    // Safari lacks the history and notifications APIs. lib/visit-log.ts stands in for history.
    const safari = browser === "safari";
    return {
      name: "Your Edition",
      // install:safari sets this so the manifest, the app and the extension share one version.
      ...(process.env.YOUR_EDITION_VERSION ? { version: process.env.YOUR_EDITION_VERSION } : {}),
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
