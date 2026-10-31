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
import { pageFromMessage, getHistoryDigest, loadAllowedPages, resolveBlockedSites, stripFence, toEmit } from "./orchestrator";
import { OUTPUT_PATH, buildKickoffMessage, buildSystemPrompt } from "./prompt";
import { GET_HISTORY_SCHEMA, GET_PAGE_HTML_SCHEMA } from "./schemas";
import type { BrowserBridge, HomepageBuildResult, RunCallbacks } from "./types";

/** The OpenAI-compatible provider offered in Settings. The user can also enter any other base URL. */
export const BHARATCODE = {
  baseUrl: "https://bharatcode.ai/api/model/v1",
  models: ["qwen-3.8-27b", "deepseek-v4.1-flash"],
} as const;

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
/**
 * The API is stateless, so each turn resends the whole conversation. Once the
 * model has replied to a tool result, a result longer than this is replaced by a
 * short note: the pages stay in memory, and the model can read them again.
 */
const SEEN_RESULT_CHARS = 2_000;

export interface ChatMessage {
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

export async function runHomepageBuildChat(opts: ChatRunOptions): Promise<HomepageBuildResult> {
  const { callbacks, signal } = opts;
  const doFetch = opts.fetch ?? fetch;
  const emit = toEmit(callbacks);
  const endpoint = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const host = new URL(endpoint).host;
  // Split each file into lines once, when it is stored: grep and read run many times.
  const files = new Map<string, { text: string; lines: string[] }>();
  const store = (path: string, text: string) => files.set(path, { text, lines: text.split("\n") });
  const blockedSites = () => resolveBlockedSites(opts.blockedSites);

  const tools: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    getHistory: async (args) =>
      JSON.stringify(await getHistoryDigest(args, opts.bridge, emit, await blockedSites())),

    getPageHtml: async (args) => {
      const urls = Array.isArray(args.urls) ? args.urls.map(String).slice(0, 8) : [];
      const loadDelayMs = typeof args.loadDelayMs === "number" ? args.loadDelayMs : undefined;
      const { pages, blocked, failed } = await loadAllowedPages({ urls, loadDelayMs }, opts.bridge, emit, await blockedSites());
      const stored = pages.map((page, i) => {
        const path = `${PAGE_ROOT}/${slugifyUrl(page.url)}_${i}.html`;
        store(path, toLines(page.html));
        emit.log(`stored ${page.url} -> ${path} (${page.html.length}b)`);
        return { url: page.url, title: page.title, path, bytes: page.html.length };
      });
      return JSON.stringify({ pages: stored, failed: [...blocked, ...failed] });
    },

    listFiles: async () =>
      JSON.stringify([...files].map(([path, file]) => ({ path, bytes: file.text.length }))),

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
        const file = files.get(path);
        if (file === undefined) return `Error: no file at ${path}. Call listFiles.`;
        for (let i = 0; i < file.lines.length && out.length < GREP_MAX_MATCHES; i++) {
          if (re.test(file.lines[i])) out.push(`${path}:${i + 1}: ${file.lines[i].slice(0, GREP_LINE_CHARS)}`);
        }
        if (out.length >= GREP_MAX_MATCHES) break;
      }
      return out.length ? out.join("\n") : "No matches.";
    },

    read: async (args) => {
      emit.phase("analyzing");
      const path = String(args.path ?? "");
      const lines = files.get(path)?.lines;
      if (lines === undefined) return `Error: no file at ${path}. Call listFiles.`;
      const offset = Math.max(1, Number(args.offset) || 1);
      const limit = Math.min(READ_LINES, Math.max(1, Number(args.limit) || READ_LINES));
      const slice = lines.slice(offset - 1, offset - 1 + limit).join("\n").slice(0, READ_MAX_CHARS);
      const end = Math.min(lines.length, offset - 1 + limit);
      return `${path} lines ${offset}-${end} of ${lines.length}:\n${slice}`;
    },

    write: async (args) => {
      emit.phase("writing");
      const path = String(args.path ?? "");
      store(path, String(args.content ?? ""));
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
    (files.get(OUTPUT_PATH) ?? [...files].find(([path]) => /\.html?$/.test(path))?.[1])?.text;

  let lastText = "";
  let nudges = 0;
  for (let turn = 0; turn < (opts.maxTurns ?? MAX_TURNS); turn++) {
    if (signal?.aborted) throw new Error("Build cancelled");
    emit.phase("thinking");
    const reply = await post(messages);
    shrinkSeen(messages);
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
      content: `You have not written the homepage yet. Call the write tool with path ${OUTPUT_PATH} and the full HTML page.`,
    });
  }

  emit.phase("cleanup");
  const written = deliverable();
  if (written?.trim()) {
    emit.phase("done");
    return { code: stripFence(written), sessionId: "", source: "session-output" };
  }
  const inline = pageFromMessage(lastText);
  if (inline) {
    emit.log("deliverable recovered from message fence");
    return { code: inline, sessionId: "", source: "message-fence" };
  }
  throw new Error(`The model produced no homepage. Expected a write to ${OUTPUT_PATH}. Last reply: ${lastText.slice(0, 300)}`);
}

/**
 * Shorten what the model has already answered: long tool results, and the full
 * page in an earlier write call. Short notes say where the text still is.
 */
export function shrinkSeen(messages: ChatMessage[]): void {
  const toolNames = new Map<string, string>();
  for (const message of messages) {
    for (const call of message.tool_calls ?? []) {
      toolNames.set(call.id, call.function.name);
      if (call.function.name !== "write" || call.function.arguments.length <= SEEN_RESULT_CHARS) continue;
      let path = OUTPUT_PATH;
      try {
        path = String(JSON.parse(call.function.arguments).path ?? OUTPUT_PATH);
      } catch {}
      const note = `[Shortened: ${call.function.arguments.length} characters, saved at ${path}. Call read to see it.]`;
      call.function.arguments = JSON.stringify({ path, content: note });
    }
    if (message.role === "tool" && message.content && message.content.length > SEEN_RESULT_CHARS) {
      const name = toolNames.get(message.tool_call_id ?? "") ?? "the tool";
      message.content = `[Shortened: this ${name} result (${message.content.length} characters) was already read. The pages are still stored. Call ${name} again if you need it.]`;
    }
  }
}
