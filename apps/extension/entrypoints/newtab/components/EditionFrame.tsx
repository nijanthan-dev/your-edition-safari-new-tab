import { memo, useMemo } from "react";
import { frameDocument } from "@/lib/edition";

/**
 * Shows the edition in a frame with no scripts. The page is model-written, so
 * the sandbox gives it no script, no same-origin access and no forms. It may only
 * navigate the tab when the user clicks a link, or open a tab for a cmd-click.
 */
export const EditionFrame = memo(function EditionFrame({ html }: { html: string }) {
  const doc = useMemo(() => frameDocument(html), [html]);
  return (
    <iframe
      title="Your Edition"
      srcDoc={doc}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      referrerPolicy="no-referrer"
      style={{ border: 0, width: "100vw", height: "100vh", display: "block" }}
    />
  );
});
