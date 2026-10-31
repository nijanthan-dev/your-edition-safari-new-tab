import { useCallback, useEffect, useState } from "react";
import { BHARATCODE, DEFAULT_BLOCKED_SITES } from "@homepage/agent-core";
import { BUILD_STEPS } from "@/lib/protocol";
import { KEYS, extensionStore, hasProviderKey, loadHomepage, loadSettings, saveProviderConfig, saveSetting, type Provider, type Settings } from "@/lib/storage";
import { isEditionHtml } from "@/lib/edition";
import { ApiKeySetup } from "./components/ApiKeySetup";
import { BuildProgress } from "./components/BuildProgress";
import { EditionFrame } from "./components/EditionFrame";
import { ImproveTabPanel } from "./components/ImproveTabPanel";
import { PrivacyFilterOption } from "./components/PrivacyFilterOption";
import { SettingsModal } from "./components/SettingsModal";
import { btn, btnSecondary, errorBox } from "./components/ui";
import { useHomepageBuild } from "./useHomepageBuild";

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const describeProvider = (s: Settings) =>
  s.provider === "chat"
    ? `${s.chatBaseUrl === BHARATCODE.baseUrl ? "BharatCode" : hostOf(s.chatBaseUrl)}, ${s.chatModel}`
    : "Anthropic (Claude)";

export default function App() {
  const [loading, setLoading] = useState(true);
  /** Whether the chosen provider has a key; until then the key screen shows. */
  const [connected, setConnected] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [blockedSites, setBlockedSites] = useState<string[]>(DEFAULT_BLOCKED_SITES);
  const [autoRebuild, setAutoRebuild] = useState(true);
  const [privacyFilter, setPrivacyFilter] = useState(false);
  /** Shown on the first-build screen, e.g. "BharatCode, qwen-3.8-27b". Refreshed when Settings closes. */
  const [providerLabel, setProviderLabel] = useState("");
  /** The saved edition's HTML. */
  const [renderedCode, setRenderedCode] = useState<string | null>(null);
  /** The saved edition is React code from before version 0.3, so it needs one rebuild. */
  const [oldFormat, setOldFormat] = useState(false);
  /** A session left mid-flight, offered as "Resume interrupted build". */
  const [resumable, setResumable] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  /** Expand the full progress view over an existing homepage. */
  const [viewProgress, setViewProgress] = useState(false);
  /** The error the user dismissed, so a stale banner doesn't linger. */
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const { state, build, cancel } = useHomepageBuild((code) => setRenderedCode(code));

  /** The provider line, the key gate and the resume offer all follow the saved provider. */
  const applyProvider = useCallback((settings: Settings, activeSession?: string) => {
    setProviderLabel(describeProvider(settings));
    setConnected(hasProviderKey(settings));
    // Only an Anthropic build can be resumed; never offer it after a switch to BharatCode.
    setResumable(settings.provider === "anthropic" ? (activeSession ?? null) : null);
  }, []);

  /** Read the saved provider and any interrupted session again, after a save. */
  const refreshProvider = useCallback(async () => {
    const [settings, activeSession] = await Promise.all([
      loadSettings(),
      extensionStore.get<string>(KEYS.activeSessionId),
    ]);
    applyProvider(settings, activeSession);
  }, [applyProvider]);

  // Once a build finishes, drop back to the homepage view.
  useEffect(() => {
    if (!state.running) setViewProgress(false);
  }, [state.running]);

  // Scheduled rebuilds are driven by the worker's alarm, not by opening a tab;
  // useHomepageBuild surfaces any build already in flight.
  useEffect(() => {
    (async () => {
      try {
        const [settings, homepage, activeSession] = await Promise.all([
          loadSettings(),
          loadHomepage(),
          extensionStore.get<string>(KEYS.activeSessionId),
        ]);
        applyProvider(settings, activeSession);
        setSystemPrompt(settings.systemPrompt);
        setBlockedSites(settings.blockedSites);
        setAutoRebuild(settings.autoRebuild);
        setPrivacyFilter(settings.privacyFilter);
        if (homepage?.code && isEditionHtml(homepage.code)) setRenderedCode(homepage.code);
        else if (homepage?.code) setOldFormat(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [applyProvider]);

  const saveKey = useCallback(async (provider: Provider, key: string, chatModel?: string) => {
    const current = await loadSettings();
    await saveProviderConfig({
      ...current,
      provider,
      ...(provider === "chat" ? { chatApiKey: key, chatModel: chatModel ?? current.chatModel } : { apiKey: key }),
    });
    await refreshProvider();
  }, [refreshProvider]);

  // Settings saves the provider and keys itself; re-read them for the provider line.
  const closeSettings = useCallback(async () => {
    setShowSettings(false);
    await refreshProvider();
  }, [refreshProvider]);

  const savePrompt = useCallback(
    async (prompt: string, sites: string[]) => {
      await Promise.all([saveSetting("systemPrompt", prompt), saveSetting("blockedSites", sites)]);
      setBlockedSites(sites);
      setSystemPrompt(prompt);
      setShowSettings(false);
      setRenderedCode(null);
      build();
    },
    [build],
  );

  // These persist immediately; the worker reads them on its next heartbeat or build.
  const togglePrivacyFilter = useCallback(async (next: boolean) => {
    setPrivacyFilter(next);
    await saveSetting("privacyFilter", next);
  }, []);

  const toggleAutoRebuild = useCallback(async (next: boolean) => {
    setAutoRebuild(next);
    await saveSetting("autoRebuild", next);
  }, []);

  const settingsModal = showSettings && (
        <SettingsModal
          initialPrompt={systemPrompt}
          blockedSites={blockedSites}
          autoRebuild={autoRebuild}
          onToggleAutoRebuild={toggleAutoRebuild}
          privacyFilter={privacyFilter}
          onTogglePrivacyFilter={togglePrivacyFilter}
          onClose={() => void closeSettings()}
          onSave={savePrompt}
        />
  );

  if (loading) return <div style={{ padding: 20, textAlign: "center" }}>Loading…</div>;
  if (!connected) return <ApiKeySetup onSave={saveKey} />;

  // With no homepage to fall back to, a running build takes over the tab.
  if (state.running && (!renderedCode || viewProgress)) {
    return (
      <BuildProgress
        state={state}
        onCancel={cancel}
        onBack={renderedCode ? () => setViewProgress(false) : undefined}
      />
    );
  }

  if (!renderedCode) {
    return (
      <div style={{ maxWidth: 560, margin: "14vh auto", padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 26 }}>{oldFormat ? "Build a new edition" : "Build your first edition"}</h1>
        {oldFormat && (
          <p style={{ color: "#333", lineHeight: 1.6 }}>
            Your Edition now builds plain pages that run no code, so nothing on the page reaches
            another server. Your last edition was made the old way. Build once to see it again.
          </p>
        )}
        <p style={{ color: "#555", lineHeight: 1.6 }}>
          The agent reads the sites you visit, opens the pages you actually follow, and writes a
          front page from what it finds today.
        </p>
        <p style={{ color: "#333", fontSize: 14, margin: "12px 0 0" }}>
          Provider: {providerLabel}.{" "}
          <button
            onClick={() => setShowSettings(true)}
            style={{ background: "none", border: "none", padding: 0, color: "#0066cc", cursor: "pointer", fontSize: 14 }}
          >
            Change
          </button>
        </p>
        <PrivacyFilterOption checked={privacyFilter} onChange={togglePrivacyFilter} />
        <ImproveTabPanel />
        {state.error && (
          <div style={{ ...errorBox, margin: "16px 0", padding: 12, borderRadius: 4 }}>{state.error}</div>
        )}
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button style={btn} onClick={() => build()}>
            Build today&apos;s edition
          </button>
          <button style={btnSecondary} onClick={() => setShowSettings(true)}>
            ⚙️ Settings
          </button>
          {resumable && (
            <button style={{ ...btn, backgroundColor: "#555" }} onClick={() => build({ resume: true })}>
              Resume interrupted build
            </button>
          )}
        </div>
        {settingsModal}
      </div>
    );
  }

  const showError = state.error && dismissedError !== state.error;

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999, display: "flex", gap: 8 }}>
        {state.running ? (
          // A build is running in the background (from here, another tab, or the
          // scheduled rebuild). Let the user watch it without losing this page.
          <button
            style={{ ...btn, backgroundColor: "#0a7", display: "flex", alignItems: "center", gap: 8 }}
            onClick={() => setViewProgress(true)}
            title="View build progress"
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "white",
                animation: "hb-pulse 1.2s ease-in-out infinite",
              }}
            />
            Building… {Math.min(state.stepIndex + 1, BUILD_STEPS.length)}/{BUILD_STEPS.length}
          </button>
        ) : (
          <button style={btn} onClick={() => build()} title="Rebuild now">
            ↻ Rebuild
          </button>
        )}
        <button style={btn} onClick={() => setShowSettings(true)} title="Customize homepage">
          ⚙️ Settings
        </button>
      </div>

      {showError && (
        <div
          style={{
            ...errorBox,
            position: "fixed",
            top: 20,
            left: 20,
            right: 260,
            zIndex: 999,
            padding: "10px 14px",
            borderRadius: 6,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <span style={{ flex: 1 }}>
            <b>Build failed.</b> {state.error}
          </span>
          <button style={{ ...btn, padding: "4px 10px", backgroundColor: "#a02620" }} onClick={() => build()}>
            Retry
          </button>
          <button
            onClick={() => setDismissedError(state.error)}
            style={{
              background: "transparent",
              border: "none",
              color: "#a02620",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <EditionFrame html={renderedCode} />

      {settingsModal}
    </div>
  );
}
