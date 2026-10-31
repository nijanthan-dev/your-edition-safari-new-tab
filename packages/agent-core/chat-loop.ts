/**
 * The homepage agent over any OpenAI-compatible chat-completions API
 * (BharatCode, or another provider the user points it at).
 *
 * Managed Agents gives the Anthropic path a session, a sandbox and mounted
 * files. A chat-completions API has none of that, so this loop holds the
 * conversation and the scraped pages itself, and answers the file tools
 * (listFiles / grep / read / write) from memory. The two browser tools and every
 * safety check are the same functions the Anthropic path uses.
 */
import { slugifyUrl } from "./history-digest";
import { getHistoryDigest, loadAllowedPages, type Emit } from "./orchestrator";
import { OUTPUT_PATH, buildKickoffMessage, buildSystemPrompt } from "./prompt";
import { GET_HISTORY_SCHEMA, GET_PAGE_HTML_SCHEMA } from "./schemas";
import { DEFAULT_BLOCKED_SITES, normalizeBlockList } from "./site-filter";
import type { BrowserBridge, HomepageBuildResult, RunCallbacks } from "./types";

/** Providers offered in Settings. The user can also enter any other base URL. */
export const CHAT_PROVIDER_PRESETS = [
  {
    id: "bharatcode",
    label: "BharatCode",
    baseUrl: "https://bharatcode.ai/api/model/v1",
    models: ["qwen-3.8-27b", "deepseek-v4.1-flash"],
  },
] as const;

export interface ChatRunOptions {
  /** e.g. https://bharatcode.ai/api/model/v1 — `/chat/completions` is appended. */
  baseUrl: string;
  apiKey: string;
  model: string;
  bridge: BrowserBridge;
  userSystemPrompt?: string;
  /** Re-read before every tool call, so a list saved mid-build applies to the rest of it. */
  blockedSites?: string[] | (() => Promise<string[]>);
  callbacks?: RunCallbacks;
  signal?: AbortSignal;
  now?: Date;
  /** For tests. */
  fetch?: typeof fetch;
  maxTurns?: number;
}

/** The provider could not be reached at all (no response), as opposed to an HTTP error. */
export class ChatConnectionError extends Error {}

const PAGE_ROOT = "/pages";
const MAX_TURNS = 40;
/** Times the model is reminded to call write before the build gives up. */
const MAX_NUDGES = 2;
const READ_LINES = 300;
const READ_MAX_CHARS = 30_000;
const GREP_MAX_MATCHES = 80;
const GREP_LINE_CHARS = 300;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

const fn = (name: string, description: string, parameters: object) => ({
  type: "function" as const,
  function: { name, description, parameters },
});

const TOOLS = [
  fn("getHistory", "A ranked digest of the user's most-visited domains.", GET_HISTORY_SCHEMA),
  fn(
    "getPageHtml",
    "Load URLs in the user's real browser and store each page's sanitized HTML as a file. Returns a path per page.",
    GET_PAGE_HTML_SCHEMA,
  ),
  fn("listFiles", "List the stored files with their sizes.", { type: "object", properties: {}, required: [] }),
  fn("grep", "Search stored files for a case-insensitive regular expression. Returns path:line: text.", {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string", description: "One file to search. Omit to search all files." },
    },
    required: ["pattern"],
  }),
  fn("read", `Read a stored file by line number, at most ${READ_LINES} lines at a time.`, {
    type: "object",
    properties: {
      path: { type: "string" },
      offset: { type: "integer", minimum: 1, description: "First line to read (1-based). Default 1." },
      limit: { type: "integer", minimum: 1, maximum: READ_LINES },
    },
    required: ["path"],
  }),
  fn("write", `Write a file. Write the finished homepage to ${OUTPUT_PATH}.`, {
    type: "object",
    properties: { path: { type: "string" }, content: { type: "string" } },
    required: ["path", "content"],
  }),
];

/** Sanitized HTML is often one long line; break it after block elements so grep and read work by line. */
export function toLines(html: string): string {
  return html.replace(/(<\/(?:p|div|li|h[1-6]|tr|blockquote|pre|figure|table|ul|ol)>)/gi, "$1\n");
}

const CODE_FENCE = /```(?:tsx|jsx|ts|js|typescript|javascript)?\s*\n([\s\S]*?)```/;
const stripFence = (text: string) => (text.match(CODE_FENCE)?.[1] ?? text).trim();

export async function runHomepageBuildChat(opts: ChatRunOptions): Promise<HomepageBuildResult> {
  const { callbacks, signal } = opts;
  const doFetch = opts.fetch ?? fetch;
  const emit: Emit = {
    phase: (p, d) => callbacks?.onPhase?.(p, d),
    text: (t) => callbacks?.onText?.(t),
    log: (l) => callbacks?.onLog?.(l),
  };
  const endpoint = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const host = new URL(endpoint).host;
  const files = new Map<string, string>();
  const blockedSites = async () =>
    normalizeBlockList(
      (typeof opts.blockedSites === "function" ? await opts.blockedSites() : opts.blockedSites) ??
        DEFAULT_BLOCKED_SITES,
    );

  const tools: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    getHistory: async (args) =>
      JSON.stringify(await getHistoryDigest(args, opts.bridge, emit, await blockedSites())),

    getPageHtml: async (args) => {
      const urls = Array.isArray(args.urls) ? args.urls.map(String).slice(0, 8) : [];
      const loadDelayMs = typeof args.loadDelayMs === "number" ? args.loadDelayMs : undefined;
      const { pages, blocked, failed } = await loadAllowedPages({ urls, loadDelayMs }, opts.bridge, emit, await blockedSites());
      const stored = pages.map((page, i) => {
        const path = `${PAGE_ROOT}/${slugifyUrl(page.url)}_${i}.html`;
        files.set(path, toLines(page.html));
        emit.log(`stored ${page.url} -> ${path} (${page.html.length}b)`);
        return { url: page.url, title: page.title, path, bytes: page.html.length };
      });
      return JSON.stringify({ pages: stored, failed: [...blocked, ...failed] });
    },

    listFiles: async () =>
      JSON.stringify([...files].map(([path, text]) => ({ path, bytes: text.length }))),

    grep: async (args) => {
      emit.phase("analyzing");
      let re: RegExp;
      try {
        re = new RegExp(String(args.pattern ?? ""), "i");
      } catch (err) {
        return `Error: invalid pattern (${String(err)})`;
      }
      const targets = typeof args.path === "string" ? [args.path] : [...files.keys()];
      const out: string[] = [];
      for (const path of targets) {
        const text = files.get(path);
        if (text === undefined) return `Error: no file at ${path}. Call listFiles.`;
        text.split("\n").forEach((line, i) => {
          if (out.length < GREP_MAX_MATCHES && re.test(line)) out.push(`${path}:${i + 1}: ${line.slice(0, GREP_LINE_CHARS)}`);
        });
      }
      return out.length ? out.join("\n") : "No matches.";
    },

    read: async (args) => {
      emit.phase("analyzing");
      const path = String(args.path ?? "");
      const text = files.get(path);
      if (text === undefined) return `Error: no file at ${path}. Call listFiles.`;
      const lines = text.split("\n");
      const offset = Math.max(1, Number(args.offset) || 1);
      const limit = Math.min(READ_LINES, Math.max(1, Number(args.limit) || READ_LINES));
      const slice = lines.slice(offset - 1, offset - 1 + limit).join("\n").slice(0, READ_MAX_CHARS);
      const end = Math.min(lines.length, offset - 1 + limit);
      return `${path} lines ${offset}-${end} of ${lines.length}:\n${slice}`;
    },

    write: async (args) => {
      emit.phase("writing");
      const path = String(args.path ?? "");
      files.set(path, String(args.content ?? ""));
      emit.log(`wrote ${path} (${String(args.content ?? "").length}b)`);
      return `Wrote ${path}.`;
    },
  };

  const post = async (messages: ChatMessage[]): Promise<ChatMessage> => {
    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({ model: opts.model, messages, tools: TOOLS, tool_choice: "auto" }),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new ChatConnectionError(`Could not reach ${host}: ${String(err)}`);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${host} returned ${response.status}: ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as { choices?: { message?: ChatMessage }[] };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error(`${host} returned no message`);
    return { role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls };
  };

  emit.phase("setup");
  emit.log(`provider=${host} model=${opts.model}`);
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt("local") },
    { role: "user", content: buildKickoffMessage({ now: opts.now ?? new Date(), userSystemPrompt: opts.userSystemPrompt }) },
  ];

  const deliverable = () =>
    files.get(OUTPUT_PATH) ?? [...files].find(([path]) => /\.(tsx|jsx)$/.test(path))?.[1];

  let lastText = "";
  let nudges = 0;
  for (let turn = 0; turn < (opts.maxTurns ?? MAX_TURNS); turn++) {
    if (signal?.aborted) throw new Error("Build cancelled");
    emit.phase("thinking");
    const reply = await post(messages);
    messages.push(reply);
    if (reply.content) {
      lastText = reply.content;
      emit.text(reply.content);
    }

    if (reply.tool_calls?.length) {
      for (const call of reply.tool_calls) {
        let result: string;
        try {
          const run = tools[call.function.name];
          if (!run) throw new Error(`Unknown tool: ${call.function.name}`);
          result = await run(JSON.parse(call.function.arguments || "{}"));
        } catch (err) {
          emit.log(`tool ${call.function.name} failed: ${String(err)}`);
          result = `Error: ${String(err)}`;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue;
    }

    if (deliverable() || nudges >= MAX_NUDGES) break;
    nudges++;
    messages.push({
      role: "user",
      content: `You have not written the homepage yet. Call the write tool with path ${OUTPUT_PATH} and the full component.`,
    });
  }

  emit.phase("cleanup");
  const written = deliverable();
  if (written?.trim()) {
    emit.phase("done");
    return { code: stripFence(written), sessionId: "", source: "session-output" };
  }
  const fenced = lastText.match(CODE_FENCE);
  if (fenced && fenced[1].includes("PersonalizedHomepage")) {
    emit.log("deliverable recovered from message fence");
    return { code: fenced[1].trim(), sessionId: "", source: "message-fence" };
  }
  throw new Error(`The model produced no homepage. Expected a write to ${OUTPUT_PATH}. Last reply: ${lastText.slice(0, 300)}`);
}
