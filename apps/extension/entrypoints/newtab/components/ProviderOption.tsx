import { useEffect, useState } from "react";
import { BHARATCODE } from "@homepage/agent-core";
import { isAnthropicKey, loadSettings, saveSetting, type Provider } from "@/lib/storage";
import { field, helpText as help } from "./ui";

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

/** The model provider and its key, base URL and model. Saved on each change. */
export function ProviderOption() {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [baseUrl, setBaseUrl] = useState<string>(BHARATCODE.baseUrl);
  const [model, setModel] = useState<string>(BHARATCODE.models[0]);
  const [key, setKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");

  useEffect(() => {
    void loadSettings().then((s) => {
      setProvider(s.provider);
      setBaseUrl(s.chatBaseUrl);
      setModel(s.chatModel);
      setKey(s.chatApiKey ?? "");
      setAnthropicKey(s.apiKey ?? "");
    });
  }, []);

  const isPreset = baseUrl === BHARATCODE.baseUrl;
  const choose = (next: Provider) => {
    setProvider(next);
    void saveSetting("provider", next);
  };

  return (
    <div style={{ marginTop: 16, color: "#333", fontSize: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Model provider
        <select value={provider} onChange={(e) => choose(e.target.value as Provider)} style={field}>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="chat">BharatCode or another OpenAI-compatible API</option>
        </select>
      </label>
      {provider === "anthropic" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          Anthropic API key
          <input
            type="password"
            value={anthropicKey}
            placeholder="sk-ant-..."
            onChange={(e) => setAnthropicKey(e.target.value)}
            onBlur={() => {
              const next = anthropicKey.trim();
              if (isAnthropicKey(next)) void saveSetting("apiKey", next);
            }}
            style={{ ...field, flex: 1, fontFamily: "ui-monospace, monospace" }}
          />
        </label>
      )}
      <p style={help}>
        Changing the provider or a key during a build restarts the build with the new settings.
        Pages read in the last 2 hours are reused, so the restart is quick.
      </p>
      {provider === "chat" && (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            API key
            <input
              type="password"
              value={key}
              placeholder="Your BharatCode API key"
              onChange={(e) => setKey(e.target.value)}
              onBlur={() => void saveSetting("chatApiKey", key.trim() || null)}
              style={{ ...field, flex: 1, fontFamily: "ui-monospace, monospace" }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Model
            {isPreset ? (
              <ChatModelSelect value={model} onChange={(m) => { setModel(m); void saveSetting("chatModel", m); }} />
            ) : (
              <input value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => void saveSetting("chatModel", model.trim())} style={{ ...field, flex: 1 }} />
            )}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Base URL
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={() => void saveSetting("chatBaseUrl", baseUrl.trim() || BHARATCODE.baseUrl)}
              style={{ ...field, flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            />
          </label>
          <ChatProviderNote />
        </div>
      )}
    </div>
  );
}
