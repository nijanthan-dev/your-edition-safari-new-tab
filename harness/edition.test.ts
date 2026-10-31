import { describe, expect, test } from "bun:test";
import { EDITION_CSP, frameDocument, isEditionHtml } from "../apps/extension/lib/edition";
import { buildSystemPrompt } from "../packages/agent-core/prompt";

describe("frameDocument", () => {
  test("puts the policy, the link target and no-referrer right after the doctype", () => {
    const doc = frameDocument("<!DOCTYPE html><html><head><style>a{}</style></head><body></body></html>");
    expect(doc.startsWith("<!DOCTYPE html><meta http-equiv=\"Content-Security-Policy\"")).toBe(true);
    expect(doc).toContain('<base target="_top">');
    expect(doc).toContain('<meta name="referrer" content="no-referrer">');
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<style>"));
  });

  test("adds a doctype when the page has none, so the browser stays in standards mode", () => {
    expect(frameDocument("<html><body>x</body></html>").startsWith("<!doctype html><meta")).toBe(true);
  });

  test("the policy blocks scripts, fonts, frames and other requests, and allows only https images", () => {
    expect(EDITION_CSP).toContain("default-src 'none'");
    expect(EDITION_CSP).not.toContain("script-src");
    expect(EDITION_CSP).toContain("img-src https: data:");
    expect(EDITION_CSP).not.toMatch(/font-src|connect-src/);
  });
});

describe("isEditionHtml", () => {
  test("tells an HTML edition from an old React one", () => {
    expect(isEditionHtml("<!doctype html><html></html>")).toBe(true);
    expect(isEditionHtml("import React from 'react';\nexport default function PersonalizedHomepage() {}")).toBe(false);
  });
});

describe("the page contract", () => {
  test("asks for one static HTML page with no JavaScript, for both providers", () => {
    for (const env of ["sandbox", "local"] as const) {
      const prompt = buildSystemPrompt(env);
      expect(prompt).toContain("/mnt/session/outputs/homepage.html");
      expect(prompt).toContain("No JavaScript at all");
      expect(prompt).not.toContain("PersonalizedHomepage");
    }
  });
});
