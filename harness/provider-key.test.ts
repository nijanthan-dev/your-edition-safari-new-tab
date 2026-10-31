import { describe, expect, test } from "bun:test";
import { isWebUrl } from "../apps/extension/lib/history-import";
import { hasProviderKey, providerKeyProblem } from "../apps/extension/lib/provider-key";

describe("providerKeyProblem", () => {
  test("Anthropic needs an sk-ant- key; another provider needs any key", () => {
    expect(providerKeyProblem({ provider: "anthropic", apiKey: "sk-ant-x", chatApiKey: null })).toBeNull();
    expect(providerKeyProblem({ provider: "anthropic", apiKey: "sk-x", chatApiKey: null })).toContain("sk-ant-");
    expect(providerKeyProblem({ provider: "chat", apiKey: null, chatApiKey: "k" })).toBeNull();
    expect(providerKeyProblem({ provider: "chat", apiKey: "sk-ant-x", chatApiKey: null })).not.toBeNull();
  });

  test("the worker starts a build only with a key that the UI accepts", () => {
    expect(hasProviderKey({ provider: "anthropic", apiKey: "not-a-key", chatApiKey: null })).toBe(false);
    expect(hasProviderKey({ provider: "chat", apiKey: null, chatApiKey: "k" })).toBe(true);
  });
});

describe("isWebUrl", () => {
  test("accepts http(s) in any case, and nothing else", () => {
    expect(isWebUrl("https://a.example/")).toBe(true);
    expect(isWebUrl("HTTPS://A.EXAMPLE/")).toBe(true);
    expect(isWebUrl("file:///Users/x")).toBe(false);
    expect(isWebUrl(null)).toBe(false);
  });
});
