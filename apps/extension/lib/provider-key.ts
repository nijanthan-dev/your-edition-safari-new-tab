/**
 * The key rule for both providers, in one place. The setup screen, Settings and
 * the worker all use it, so the worker never starts a build with a key the UI
 * rejects. No browser APIs here, so the harness tests it directly.
 */
interface KeyedProvider {
  provider: "anthropic" | "chat";
  apiKey: string | null;
  chatApiKey: string | null;
}

/** Anthropic keys start with this. */
const isAnthropicKey = (key: string) => key.startsWith("sk-ant-");

/** What is wrong with the chosen provider's key, or null when a build can start. */
export function providerKeyProblem(s: KeyedProvider): string | null {
  if (s.provider === "chat") return s.chatApiKey ? null : "Enter an API key for this provider.";
  return s.apiKey && isAnthropicKey(s.apiKey) ? null : "Enter an Anthropic API key (sk-ant-...).";
}

/** Whether the chosen provider has a usable key, so a build can start. */
export const hasProviderKey = (s: KeyedProvider) => providerKeyProblem(s) === null;
