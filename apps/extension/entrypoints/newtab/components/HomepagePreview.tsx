import { memo, useEffect, useMemo } from "react";
import { SandpackLayout, SandpackPreview, SandpackProvider } from "@codesandbox/sandpack-react";

/** The message the frame sends when the user clicks a link in the edition. */
const LINK_MESSAGE = "your-edition:open-link";

const INDEX_JS = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

// Sites refuse to load inside this frame, so a link would show a blank page.
// Send each web link to the new tab instead, which opens it.
const openLink = (event) => {
  const link = event.target.closest && event.target.closest("a[href]");
  if (!link || !/^https?:/i.test(link.href)) return;
  event.preventDefault();
  const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
  window.parent.postMessage({ type: "${LINK_MESSAGE}", url: link.href, newTab }, "*");
};
document.addEventListener("click", openLink);
document.addEventListener("auxclick", openLink);`;

const INDEX_HTML = `<!DOCTYPE html>
<html><head><title>My Personalized Homepage</title></head>
<body><div id="root"></div></body></html>`;

/**
 * Renders the agent's component in a Sandpack iframe. The code is
 * model-generated, so it runs sandboxed rather than in the extension's own page.
 */
export const HomepagePreview = memo(function HomepagePreview({ code }: { code: string }) {
  // The page re-renders on every build message; give Sandpack new files only for new code.
  const files = useMemo(
    () => ({
      "/App.js": { code },
      "/index.js": { code: INDEX_JS },
      "/index.html": { code: INDEX_HTML },
    }),
    [code],
  );

  // Open links that the frame sends up. Only http(s) URLs, and only from the
  // Sandpack frame's own origin.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: unknown; newTab?: unknown } | null;
      if (data?.type !== LINK_MESSAGE || typeof data.url !== "string") return;
      if (!/^https:\/\/[a-z0-9-]+\.codesandbox\.io$/.test(event.origin)) return;
      if (!/^https?:\/\//i.test(data.url)) return;
      if (data.newTab) void browser.tabs.create({ url: data.url, active: false });
      else window.location.assign(data.url);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <SandpackProvider files={files} template="react" options={{ autorun: true }}>
      <SandpackLayout style={{ height: "100vh", width: "100vw" }}>
        <SandpackPreview style={{ height: "100%" }} />
      </SandpackLayout>
    </SandpackProvider>
  );
});
