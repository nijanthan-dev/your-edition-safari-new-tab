import { useEffect, useState } from "react";
import { BHARATCODE } from "@homepage/agent-core";
import { loadSettings, providerKeyProblem, saveProviderConfig, toProviderConfig, type Provider, type ProviderConfig } from "@/lib/storage";
import { btn, field, helpText as help } from "./ui";

/** BharatCode's models. Used on the setup screen and in Settings. */
export function ChatModelSelect({ value, onChange }: { value: string; onChange: (model: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={field}>
      {BHARATCODE.models.map((m) => (
        <option key={m} value={m}>{m}</option>
      ))}
    </select>
  );
}

/** Where page content goes when this provider is chosen. Shown wherever the choice is made. */
export function ChatProviderNote() {
  return (
    <p style={help}>
      BharatCode runs open models (Qwen and DeepSeek) for a flat monthly fee. It sends your
      prompts to inference partners, some outside India, and its Free and Lite plans may keep
      logs. Turn on the on-device privacy filter to send only summaries. Homepages can be
      weaker than with Claude.
    </p>
  );
}

/**
 * The model provider and its key, base URL and model. Edits stay in a draft until
 * Save, which writes them as one object, so a running build restarts once.
 */
export function ProviderOption() {
  const [saved, setSaved] = useState<ProviderConfig | null>(null);
  const [draft, setDraft] = useState<ProviderConfig | null>(null);

  useEffect(() => {
    void loadSettings().then((s) => {
      const config = toProviderConfig(s);
      setSaved(config);
      setDraft(config);
    });
  }, []);

  if (!draft) return null;
  const set = (patch: Partial<ProviderConfig>) => setDraft({ ...draft, ...patch });
  const isPreset = draft.chatBaseUrl === BHARATCODE.baseUrl;
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const problem = providerKeyProblem(draft);

  const save = async () => {
    const next = { ...draft, chatBaseUrl: draft.chatBaseUrl.trim() || BHARATCODE.baseUrl, chatModel: draft.chatModel.trim() };
    await saveProviderConfig(next);
    setSaved(next);
    setDraft(next);
  };

  return (
    <div style={{ marginTop: 16, color: "#333", fontSize: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Model provider
        <select value={draft.provider} onChange={(e) => set({ provider: e.target.value as Provider })} style={field}>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="chat">BharatCode or another OpenAI-compatible API</option>
        </select>
      </label>
      {draft.provider === "anthropic" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          Anthropic API key
          <input
            type="password"
            value={draft.apiKey ?? ""}
            placeholder="sk-ant-..."
            onChange={(e) => set({ apiKey: e.target.value.trim() || null })}
            style={{ ...field, flex: 1, fontFamily: "ui-monospace, monospace" }}
          />
        </label>
      )}
      {draft.provider === "chat" && (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            API key
            <input
              type="password"
              value={draft.chatApiKey ?? ""}
              placeholder="Your BharatCode API key"
              onChange={(e) => set({ chatApiKey: e.target.value.trim() || null })}
              style={{ ...field, flex: 1, fontFamily: "ui-monospace, monospace" }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Model
            {isPreset ? (
              <ChatModelSelect value={draft.chatModel} onChange={(chatModel) => set({ chatModel })} />
            ) : (
              <input value={draft.chatModel} onChange={(e) => set({ chatModel: e.target.value })} style={{ ...field, flex: 1 }} />
            )}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Base URL
            <input
              value={draft.chatBaseUrl}
              onChange={(e) => set({ chatBaseUrl: e.target.value })}
              style={{ ...field, flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            />
          </label>
          <ChatProviderNote />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button style={{ ...btn, opacity: changed && !problem ? 1 : 0.5 }} disabled={!changed || Boolean(problem)} onClick={() => void save()}>
          Save provider
        </button>
        <span style={{ ...help, margin: 0 }}>{changed ? problem ?? "Not saved yet." : "Saved."}</span>
      </div>
      <p style={help}>
        Saving a new provider or key during a build restarts the build with the new settings.
        Pages read in the last 2 hours are reused, so the restart is quick.
      </p>
    </div>
  );
}
