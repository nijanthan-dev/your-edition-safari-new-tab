import { describe, expect, test } from "bun:test";
import { HOMEPAGE_SYSTEM_PROMPT, HOUSE_STYLE, buildKickoffMessage } from "../packages/agent-core/prompt";

describe("buildKickoffMessage", () => {
  const now = new Date(2026, 9, 31, 15, 0);

  test("asks for the broadsheet house style with Mac fonts and no web fonts", () => {
    const message = buildKickoffMessage({ now });
    expect(message).toContain(HOUSE_STYLE);
    expect(message).toContain("Day of year: 304");
    expect(HOUSE_STYLE).toContain('"Bodoni 72", Didot');
    expect(HOUSE_STYLE).toContain('"Iowan Old Style"');
    expect(HOUSE_STYLE).toContain("Do not load web fonts");
  });

  test("puts the user's instructions first, and lets them replace the look", () => {
    const message = buildKickoffMessage({ now, userSystemPrompt: "Green-on-black terminal." });
    expect(message.indexOf("Green-on-black terminal.")).toBeLessThan(message.indexOf("## House style"));
    expect(HOUSE_STYLE).toContain("unless the user's standing instructions describe a different one");
  });

  test("keeps text readable in dark mode: one set of color variables, switched together", () => {
    expect(HOUSE_STYLE).toContain("@media (prefers-color-scheme: dark)");
    expect(HOUSE_STYLE).toContain("Text on a panel must use var(--ink)");
    expect(HOUSE_STYLE).toContain("never set a color in only one");
    // Every variable set in light mode is set again in dark mode.
    const [light, dark] = HOUSE_STYLE.split("@media (prefers-color-scheme: dark) {");
    const vars = (css: string) => [...css.matchAll(/(--[a-z]+):/g)].map((m) => m[1]).sort();
    expect(vars(dark)).toEqual(vars(light));
  });

  test("never lets a column push the page wider than the window", () => {
    expect(HOUSE_STYLE).toContain("minmax(0, 1.35fr)");
    expect(HOUSE_STYLE).toContain("min-width: 0");
  });

  test("leaves the Managed Agents system prompt unchanged", () => {
    expect(HOMEPAGE_SYSTEM_PROMPT).not.toContain("House style");
  });
});
