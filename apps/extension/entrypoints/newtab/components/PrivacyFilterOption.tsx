import { useEffect, useState } from "react";
import { filterUnavailableReason, PRIVACY_FILTER_SUPPORTED } from "@/lib/privacy-filter";
import { helpText } from "./ui";

/**
 * The on-device privacy filter switch and its status (Safari only). Shown in
 * Settings and on the first-build screen, so it can be on before any page is sent.
 */
export function PrivacyFilterOption({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  // undefined while checking; null when the on-device model is ready.
  const [problem, setProblem] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (PRIVACY_FILTER_SUPPORTED) void filterUnavailableReason().then(setProblem);
  }, []);

  if (!PRIVACY_FILTER_SUPPORTED) return null;
  return (
    <>
      <label
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, color: "#333", fontSize: 14, cursor: "pointer" }}
      >
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        On-device privacy filter
      </label>
      <p style={helpText}>
        When on, Apple Intelligence on this Mac summarizes each page and removes personal details.
        Only the summaries go to your model provider. If the on-device model can't run, pages are not sent.
        <br />
        {problem === undefined
          ? "Checking the on-device model…"
          : problem === null
            ? "Status: ready."
            : `Status: not available. ${problem}.`}
      </p>
    </>
  );
}
