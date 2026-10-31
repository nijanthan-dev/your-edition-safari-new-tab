import { describe, expect, test } from "bun:test";
import {
  ChatConnectionError,
  OUTPUT_PATH,
  runHomepageBuildChat,
  toLines,
  type BrowserBridge,
} from "../packages/agent-core";

type Call = { name: string; args: object };

/** A fake chat-completions endpoint that replays one scripted reply per request. */
function scriptedModel(replies: (Call[] | string)[]) {
  const requests: { url: string; headers: Record<string, string>; body: any }[] = [];
  let i = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    requests.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const reply = replies[Math.min(i++, replies.length - 1)];
    const message =
      typeof reply === "string"
        ? { role: "assistant", content: reply }
        : {
            role: "assistant",
            content: null,
            tool_calls: reply.map((c, n) => ({
              id: `call_${i}_${n}`,
              type: "function",
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          };
    return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

function fakeBridge() {
  const requested: string[] = [];
  const bridge: BrowserBridge = {
    getHistory: async () => ({
      sites: [
        { domain: "news.example", totalVisits: 20, uniquePages: 5, lastVisitTime: Date.now(), averageVisitsPerDay: 2, titles: ["News"], urls: [], relevanceScore: 0.9 },
      ],
      totalSitesSeen: 1,
    }),
    getPageHtml: async ({ urls, onProgress }) => {
      requested.push(...urls);
      onProgress?.(`Read page ${urls.length} of ${urls.length}`);
      return {
        pages: urls.map((url) => ({ url, title: "Front page", html: "<h2><a href=\"/a\">Big story</a></h2><p>Details here</p>" })),
        failed: [],
      };
    },
  };
  return { bridge, requested };
}

const COMPONENT = "import React from 'react';\nexport default function PersonalizedHomepage() { return <div>Hi</div>; }";

describe("runHomepageBuildChat", () => {
  test("runs the tools, keeps blocked URLs out of the browser, and returns the written component", async () => {
    const { bridge, requested } = fakeBridge();
    const { fetchFn, requests } = scriptedModel([
      [{ name: "getHistory", args: {} }],
      [{ name: "getPageHtml", args: { urls: ["https://news.example/", "https://mail.google.com/"] } }],
      [{ name: "grep", args: { pattern: "big story" } }],
      [{ name: "read", args: { path: "/pages/news_example_0.html" } }],
      [{ name: "write", args: { path: OUTPUT_PATH, content: "```tsx\n" + COMPONENT + "\n```" } }],
      "Built a front page from your news site.",
    ]);
    const phases: string[] = [];
    const logs: string[] = [];
    const result = await runHomepageBuildChat({
      baseUrl: "https://bharatcode.ai/api/model/v1/",
      apiKey: "test-key",
      model: "qwen-3.8-27b",
      bridge,
      fetch: fetchFn,
      callbacks: { onPhase: (p) => phases.push(p), onLog: (l) => logs.push(l) },
    });

    expect(result.code).toBe(COMPONENT);
    expect(requested).toEqual(["https://news.example/"]);
    expect(requests[0].url).toBe("https://bharatcode.ai/api/model/v1/chat/completions");
    expect(requests[0].headers.Authorization).toBe("Bearer test-key");
    expect(requests[0].body.model).toBe("qwen-3.8-27b");
    expect(requests[0].body.tools.map((t: any) => t.function.name)).toEqual([
      "getHistory", "getPageHtml", "listFiles", "grep", "read", "write",
    ]);

    // Each tool result goes back to the model on the next request.
    const toolResults = requests[5].body.messages.filter((m: any) => m.role === "tool").map((m: any) => m.content);
    expect(JSON.parse(toolResults[1]).failed).toEqual([{ url: "https://mail.google.com/", reason: "blocked by the user's settings" }]);
    expect(toolResults[2]).toContain("/pages/news_example_0.html:1:");
    expect(toolResults[3]).toContain("Big story");
    expect(phases).toContain("history");
    expect(phases).toContain("scraping");
    expect(phases).toContain("writing");
    expect(phases.at(-1)).toBe("done");
    // Progress from the browser shows in the activity log while pages load.
    expect(logs).toContain("Read page 1 of 1");
  });

  test("reminds the model to write, then fails clearly if it never does", async () => {
    const { bridge } = fakeBridge();
    const { fetchFn, requests } = scriptedModel(["I am done."]);
    await expect(
      runHomepageBuildChat({ baseUrl: "https://x.example/v1", apiKey: "k", model: "m", bridge, fetch: fetchFn }),
    ).rejects.toThrow("produced no homepage");
    expect(requests).toHaveLength(3);
    expect(requests[1].body.messages.at(-1).content).toContain("You have not written the homepage yet");
  });

  test("reports a bad tool call to the model instead of crashing", async () => {
    const { bridge } = fakeBridge();
    const { fetchFn, requests } = scriptedModel([
      [{ name: "read", args: { path: "/nope" } }, { name: "launchRocket", args: {} }],
      [{ name: "write", args: { path: OUTPUT_PATH, content: COMPONENT } }],
      "done",
    ]);
    await runHomepageBuildChat({ baseUrl: "https://x.example/v1", apiKey: "k", model: "m", bridge, fetch: fetchFn });
    const results = requests[1].body.messages.filter((m: any) => m.role === "tool").map((m: any) => m.content);
    expect(results[0]).toContain("Error: no file at /nope");
    expect(results[1]).toContain("Unknown tool: launchRocket");
  });

  test("turns HTTP errors and unreachable hosts into errors that name the host", async () => {
    const { bridge } = fakeBridge();
    const http = (async () => new Response("bad key", { status: 401 })) as unknown as typeof fetch;
    await expect(
      runHomepageBuildChat({ baseUrl: "https://bharatcode.ai/api/model/v1", apiKey: "k", model: "m", bridge, fetch: http }),
    ).rejects.toThrow("bharatcode.ai returned 401: bad key");

    const down = (async () => { throw new TypeError("Load failed"); }) as unknown as typeof fetch;
    await expect(
      runHomepageBuildChat({ baseUrl: "https://bharatcode.ai/api/model/v1", apiKey: "k", model: "m", bridge, fetch: down }),
    ).rejects.toBeInstanceOf(ChatConnectionError);
  });
});

describe("shrinkSeen", () => {
  test("shortens long results and earlier writes once the model has replied, and keeps the pages readable", async () => {
    const big = "<p>" + "word ".repeat(2000) + "</p>";
    const bridge: BrowserBridge = {
      getHistory: async () => ({ sites: [], totalSitesSeen: 0 }),
      getPageHtml: async ({ urls }) => ({ pages: urls.map((url) => ({ url, title: "T", html: big })), failed: [] }),
    };
    const longComponent = COMPONENT + "\n// " + "x".repeat(3000);
    const { fetchFn, requests } = scriptedModel([
      [{ name: "getPageHtml", args: { urls: ["https://news.example/"] } }],
      [{ name: "read", args: { path: "/pages/news_example_0.html" } }],
      [{ name: "write", args: { path: OUTPUT_PATH, content: longComponent } }],
      [{ name: "read", args: { path: "/pages/news_example_0.html" } }],
      "done",
    ]);
    const result = await runHomepageBuildChat({ baseUrl: "https://x.example/v1", apiKey: "k", model: "m", bridge, fetch: fetchFn });

    expect(result.code).toBe(longComponent);
    // Request 3 carries the first read in full: the model has not answered it yet.
    const toolText = (n: number) => requests[n].body.messages.filter((m: any) => m.role === "tool").map((m: any) => m.content);
    expect(toolText(2)[1]).toContain("word word");
    // From request 4, that read is a short note, and the earlier write no longer carries the component.
    expect(toolText(3)[1]).toStartWith("[Shortened: this read result");
    const writeCall = requests[4].body.messages.flatMap((m: any) => m.tool_calls ?? []).find((c: any) => c.function.name === "write");
    expect(JSON.parse(writeCall.function.arguments).content).toStartWith("[Shortened:");
    // The page is still in memory, so a second read returns it in full.
    expect(toolText(4)[3]).toContain("word word");
  });
});

describe("toLines", () => {
  test("breaks sanitized HTML after block elements", () => {
    expect(toLines("<p>a</p><div>b</div><span>c</span>")).toBe("<p>a</p>\n<div>b</div>\n<span>c</span>");
  });
});
