import { useState } from "react";
import { readHistoryFile } from "@/lib/history-import";
import type { VisitLogRequest } from "@/lib/protocol";
import { btn, btnSecondary, helpText } from "./ui";
import { USES_VISIT_LOG } from "@/lib/platform";
import { RETENTION_DAYS } from "@/lib/visit-log";

type Reply<T> = { ok: true; result: T } | { ok: false; error: string };

const ask = async <T,>(msg: VisitLogRequest): Promise<T> => {
  const reply = (await browser.runtime.sendMessage(msg)) as Reply<T>;
  if (!reply?.ok) throw new Error(reply ? reply.error : "The extension did not answer.");
  return reply.result;
};

const help = { ...helpText, lineHeight: 1.5 };

/**
 * Safari only: import Safari's own history export so the agent has more than
 * the pages loaded since install, and export the visit log. The file is read
 * here; only the parsed visits go to the worker, which stores them locally.
 */
export function ImproveTabPanel() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!USES_VISIT_LOG) return null;

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus("Reading the file…");
    try {
      const visits = readHistoryFile(file.name, new Uint8Array(await file.arrayBuffer()));
      const { imported, total } = await ask<{ imported: number; total: number }>({ kind: "importVisits", visits });
      setStatus(
        imported
          ? `Imported ${imported} pages from the last ${RETENTION_DAYS} days. The log now has ${total} pages. Rebuild to use them.`
          : `The file has no pages from the last ${RETENTION_DAYS} days, so nothing was imported.`,
      );
    } catch (error) {
      setStatus(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const exportLog = async () => {
    try {
      const data = await ask<object>({ kind: "exportVisits" });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `your-edition-history-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setStatus(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div style={{ marginTop: 20, padding: 12, border: "1px solid #e5e5e5", borderRadius: 6, fontSize: 14, color: "#333" }}>
      <strong>Improve this tab</strong>
      <p style={help}>
        Safari does not share your history with extensions. Import it once, so the agent knows
        the sites you read before you installed Your Edition.
      </p>
      <ol style={{ ...help, paddingLeft: 18 }}>
        <li>In Safari, choose File &gt; Export Browsing Data to File…</li>
        <li>Select only History, then save the file.</li>
        <li>Choose that file here (.zip or .json).</li>
      </ol>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <label style={{ ...btn, opacity: busy ? 0.5 : 1, cursor: busy ? "default" : "pointer" }}>
          Import history…
          <input
            type="file"
            accept=".zip,.json,application/zip,application/json"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button style={btnSecondary} onClick={() => void exportLog()}>
          Export my visit log
        </button>
      </div>
      {status && <p style={{ ...help, color: "#333" }}>{status}</p>}
      <p style={help}>
        Your Edition reads only History.json, never passwords or other files in the export. It
        keeps the last {RETENTION_DAYS} days on this Mac.
      </p>
    </div>
  );
}
