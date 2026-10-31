import {
  BHARATCODE,
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
  /**
   * The provider, its keys, base URL and model, as one object (`ProviderConfig`).
   * One Save writes it once, so the worker sees one change and restarts once.
   */
  providerConfig: "providerConfig",
  /** ISO timestamp of the last auto-build *attempted* (success or not). */
  lastAutoBuildAttempt: "lastAutoBuildAttempt",
  /** Throttled mirror of the live build state, for tabs that open while the worker sleeps. */
  buildSnapshot: "buildSnapshot",
  /** Pages read in the last 2 hours, reused when a build restarts (lib/page-cache.ts). */
  pageCache: "pageCache",
  /** On-device summaries of those pages, so a restart continues the privacy filter. */
  filteredCache: "filteredCache",
  /**
   * Set while any build runs, removed when this worker sees it end. If it is still
   * set on wake, Safari stopped the worker mid-build: resume or restart it.
   */
  activeBuild: "activeBuild",
  /** Safari only: the extension's own log of page loads (lib/visit-log.ts). */
  visitLog: "visitLog",
} as const;

export interface Homepage {
  /** The agent's raw TSX source. */
  code: string;
  /** ISO timestamp of when it was built. */
  timestamp: string;
}

/** "anthropic" (Managed Agents) or "chat" (an OpenAI-compatible API such as BharatCode). */
export interface ProviderConfig {
  provider: Provider;
  apiKey: string | null;
  chatApiKey: string | null;
  chatBaseUrl: string;
  chatModel: string;
}

/** A build in flight: which provider started it, and how often it was restarted. */
export interface ActiveBuild {
  provider: Provider;
  attempts: number;
}

export interface Settings extends ProviderConfig {
  systemPrompt: string;
  blockedSites: string[];
  /** Unset means on — auto-rebuild is opt-out. */
  autoRebuild: boolean;
  /** Unset means off — the filter needs Apple Intelligence, which not every Mac has. */
  privacyFilter: boolean;
}

export type Provider = "anthropic" | "chat";

/** Anthropic keys start with this; the setup screen and Settings both check it. */
export const isAnthropicKey = (key: string) => key.startsWith("sk-ant-");

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

/** Keys from before `providerConfig`, read once so an upgrade keeps the user's keys. */
const LEGACY_PROVIDER_KEYS = ["provider", "apiKey", "chatApiKey", "chatBaseUrl", "chatModel"] as const;

function toProviderConfig(raw: Partial<Record<keyof ProviderConfig, unknown>>): ProviderConfig {
  return {
    provider: raw.provider === "chat" ? "chat" : "anthropic",
    apiKey: (raw.apiKey as string | undefined) || null,
    chatApiKey: (raw.chatApiKey as string | undefined) || null,
    chatBaseUrl: (raw.chatBaseUrl as string | undefined) || BHARATCODE.baseUrl,
    chatModel: (raw.chatModel as string | undefined) || BHARATCODE.models[0],
  };
}

export async function loadSettings(): Promise<Settings> {
  const s = await browser.storage.local.get([
    KEYS.systemPrompt,
    KEYS.blockedSites,
    KEYS.autoRebuild,
    KEYS.privacyFilter,
    KEYS.providerConfig,
    ...LEGACY_PROVIDER_KEYS,
  ]);
  const stored = s[KEYS.providerConfig] as Partial<ProviderConfig> | undefined;
  return {
    ...toProviderConfig(stored ?? s),
    systemPrompt: (s[KEYS.systemPrompt] as string | undefined) ?? "",
    blockedSites: (s[KEYS.blockedSites] as string[] | undefined) ?? [...DEFAULT_BLOCKED_SITES],
    autoRebuild: s[KEYS.autoRebuild] !== false,
    privacyFilter: s[KEYS.privacyFilter] === true,
  };
}

export async function saveSetting<K extends "systemPrompt" | "blockedSites" | "autoRebuild" | "privacyFilter">(
  key: K,
  value: Settings[K],
): Promise<void> {
  await browser.storage.local.set({ [KEYS[key]]: value });
}

/** Save the provider settings in one write, and drop the old separate keys. */
export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  await browser.storage.local.set({ [KEYS.providerConfig]: toProviderConfig(config) });
  await browser.storage.local.remove([...LEGACY_PROVIDER_KEYS]);
}

export async function loadHomepage(): Promise<Homepage | undefined> {
  return extensionStore.get<Homepage>(KEYS.homepage);
}

export async function saveHomepage(code: string): Promise<void> {
  const homepage: Homepage = { code, timestamp: new Date().toISOString() };
  await extensionStore.set(KEYS.homepage, homepage);
}
