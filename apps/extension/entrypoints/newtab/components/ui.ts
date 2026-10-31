import type { CSSProperties } from "react";

export const btn: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 4,
  border: "none",
  backgroundColor: "#0066cc",
  color: "white",
  cursor: "pointer",
  fontSize: 14,
};

export const errorBox: CSSProperties = {
  background: "#fdeceb",
  border: "1px solid #f5c6cb",
  color: "#a02620",
  fontSize: 13,
};

/** A white button for the second action next to `btn`. */
export const btnSecondary: CSSProperties = { ...btn, backgroundColor: "white", color: "#333", border: "1px solid #ddd" };

/** Small grey text under a setting. */
export const helpText: CSSProperties = { color: "#888", fontSize: 12, margin: "6px 0 0" };

/** A select or text input in a settings row. */
export const field: CSSProperties = { padding: "4px 8px", fontSize: 14, borderRadius: 4, border: "1px solid #ddd" };

/** A label row with a checkbox, in Settings and on the first-build screen. */
export const checkRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginTop: 16, color: "#333", fontSize: 14, cursor: "pointer" };
