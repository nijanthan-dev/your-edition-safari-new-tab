import { useState } from "react";
import { BHARATCODE } from "@homepage/agent-core";
import { isAnthropicKey, type Provider } from "@/lib/storage";
import { ChatModelSelect, ChatProviderNote } from "./ProviderOption";
import { btn } from "./ui";

export function ApiKeySetup({ onSave }: { onSave: (provider: Provider, key: string, chatModel?: string) => void }) {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [chatModel, setChatModel] = useState<string>(BHARATCODE.models[0]);
  const [value, setValue] = useState("");
  const key = value.trim();
  const valid = provider === "anthropic" ? isAnthropicKey(key) : key.length > 0;

  return (
    <div style={{ maxWidth: 520, margin: "12vh auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24 }}>Connect a model provider</h1>
      <p style={{ color: "#555", lineHeight: 1.6 }}>
        The agent runs inside this extension and talks to the provider directly. Your key is
        stored in the extension's local storage on this machine and is sent only to that provider.
      </p>
      <div style={{ display: "flex", gap: 16, margin: "12px 0", fontSize: 14 }}>
        <label style={{ cursor: "pointer" }}>
          <input type="radio" checked={provider === "anthropic"} onChange={() => setProvider("anthropic")} /> Anthropic (Claude)
        </label>
        <label style={{ cursor: "pointer" }}>
          <input type="radio" checked={provider === "chat"} onChange={() => setProvider("chat")} /> BharatCode
        </label>
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={provider === "anthropic" ? "Anthropic API key (sk-ant-...)" : "Your BharatCode API key"}
        style={{
          width: "100%",
          padding: 12,
          fontSize: 14,
          borderRadius: 4,
          border: "1px solid #ddd",
          fontFamily: "ui-monospace, monospace",
          boxSizing: "border-box",
        }}
      />
      {provider === "chat" && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14 }}>
            Model
            <ChatModelSelect value={chatModel} onChange={setChatModel} />
          </label>
          <ChatProviderNote />
        </>
      )}
      <button
        style={{ ...btn, marginTop: 16, opacity: valid ? 1 : 0.5 }}
        disabled={!valid}
        onClick={() => onSave(provider, key, provider === "chat" ? chatModel : undefined)}
      >
        Save key
      </button>
    </div>
  );
}
