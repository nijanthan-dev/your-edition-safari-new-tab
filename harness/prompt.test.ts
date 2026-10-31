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

  test("leaves the Managed Agents system prompt unchanged", () => {
    expect(HOMEPAGE_SYSTEM_PROMPT).not.toContain("House style");
  });
});
