import {
  CHAT_PROVIDER_PRESETS,
  DEFAULT_BLOCKED_SITES,
  STORAGE_KEYS as AGENT_KEYS,
  type KVStore,
} from "@homepage/agent-core";

/**
 * Everything the extension persists, in one place. All of it lives in
 * chrome.storage.local — including the API key, which anyone with access to the
 * browser profile can read. Fine for a tool you run yourself; not for one you
 * distribute (see ARCHITECTURE.md → Privacy).
 */
export const KEYS = {
  ...AGENT_KEYS,
  homepage: "homepageData",
  systemPrompt: "systemPrompt",
  blockedSites: "blockedSites",
  autoRebuild: "autoRebuild",
  /** Safari only: send pages through the on-device privacy filter first. */
  privacyFilter: "privacyFilter",
  /** "anthropic" (Managed Agents) or "chat" (an OpenAI-compatible API such as BharatCode). */
  provider: "provider",
  chatApiKey: "chatApiKey",
  chatBaseUrl: "chatBaseUrl",
  chatModel: "chatModel",
  /** ISO timestamp of the last auto-build *attempted* (success or not). */
  lastAutoBuildAttempt: "lastAutoBuildAttempt",
  /** Throttled mirror of the live build state, for tabs that open while the worker sleeps. */
  buildSnapshot: "buildSnapshot",
  /** Pages read in the last 2 hours, reused when a build restarts (lib/page-cache.ts). */
  pageCache: "pageCache",
  /** Safari only: the extension's own log of page loads (lib/visit-log.ts). */
  visitLog: "visitLog",
} as const;

export interface Homepage {
  /** The agent's raw TSX source. */
  code: string;
  /** ISO timestamp of when it was built. */
  timestamp: string;
}

export interface Settings {
  apiKey: string | null;
  systemPrompt: string;
  blockedSites: string[];
  /** Unset means on — auto-rebuild is opt-out. */
  autoRebuild: boolean;
  /** Unset means off — the filter needs Apple Intelligence, which not every Mac has. */
  privacyFilter: boolean;
  provider: Provider;
  chatApiKey: string | null;
  chatBaseUrl: string;
  chatModel: string;
}

export type Provider = "anthropic" | "chat";

const BHARATCODE = CHAT_PROVIDER_PRESETS[0];

/** Whether the chosen provider has a key, so a build can start. */
export const hasProviderKey = (s: Pick<Settings, "provider" | "apiKey" | "chatApiKey">) =>
  Boolean(s.provider === "chat" ? s.chatApiKey : s.apiKey);

/** The `KVStore` agent-core persists its agent/environment/session IDs through. */
export const extensionStore: KVStore = {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await browser.storage.local.get(key);
    return result[key] as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
  async remove(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  },
};

export async function loadSettings(): Promise<Settings> {
  const s = await browser.storage.local.get([
    KEYS.apiKey,
    KEYS.systemPrompt,
    KEYS.blockedSites,
    KEYS.autoRebuild,
    KEYS.privacyFilter,
    KEYS.provider,
    KEYS.chatApiKey,
    KEYS.chatBaseUrl,
    KEYS.chatModel,
  ]);
  return {
    apiKey: (s[KEYS.apiKey] as string | undefined) ?? null,
    systemPrompt: (s[KEYS.systemPrompt] as string | undefined) ?? "",
    blockedSites: (s[KEYS.blockedSites] as string[] | undefined) ?? [...DEFAULT_BLOCKED_SITES],
    autoRebuild: s[KEYS.autoRebuild] !== false,
    privacyFilter: s[KEYS.privacyFilter] === true,
    provider: s[KEYS.provider] === "chat" ? "chat" : "anthropic",
    chatApiKey: (s[KEYS.chatApiKey] as string | undefined) ?? null,
    chatBaseUrl: (s[KEYS.chatBaseUrl] as string | undefined) ?? BHARATCODE.baseUrl,
    chatModel: (s[KEYS.chatModel] as string | undefined) ?? BHARATCODE.models[0],
  };
}

export async function saveSetting<K extends "apiKey" | "systemPrompt" | "blockedSites" | "autoRebuild" | "privacyFilter" | "provider" | "chatApiKey" | "chatBaseUrl" | "chatModel">(
  key: K,
  value: Settings[K],
): Promise<void> {
  await browser.storage.local.set({ [KEYS[key]]: value });
}

export async function loadHomepage(): Promise<Homepage | undefined> {
  return extensionStore.get<Homepage>(KEYS.homepage);
}

export async function saveHomepage(code: string): Promise<void> {
  const homepage: Homepage = { code, timestamp: new Date().toISOString() };
  await extensionStore.set(KEYS.homepage, homepage);
}
