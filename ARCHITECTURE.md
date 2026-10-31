# Architecture

There is no server. The extension talks to one model provider that you choose: Anthropic
(Claude Managed Agents, described first) or an OpenAI-compatible chat API such as BharatCode
(see [Model providers](#privacy) under Privacy).

| | Runs where | Does what |
|---|---|---|
| **Extension** (service worker) | Your browser | Hosts the build: holds the SSE stream, executes `getHistory` / `getPageHtml`, uploads page HTML, persists the homepage |
| **Extension** (new-tab page(s)) | Your browser | Thin view: subscribes to the worker over a port, renders live progress and the finished homepage |
| **Orchestration layer** | Anthropic | Runs the agent loop, persists the session event log, emits `agent.custom_tool_use` |
| **Session sandbox** | Anthropic | Runs `read` / `grep` / `glob` / `write` over the mounted pages |
| **Chat API** (BharatCode path) | The provider | Only the model. The worker runs the loop and answers every tool, file tools included, from memory |
| **Morning Tab app** (Safari) | Your Mac | Carries the extension. Runs the on-device privacy filter over native messaging |

The agent loop runs **in the service worker** (`apps/extension/lib/build-manager.ts`), so a build
survives closing the tab, shows up in every open tab, and can run headless on a
`chrome.alarms` schedule. The two custom tools execute in the extension too, because they
need history (`chrome.history` on Chrome, the visit log on Safari) and `chrome.tabs`. Anthropic never executes them — it emits an event
and waits for a `user.custom_tool_result` on the same authenticated stream. There is no
inbound connection and no public endpoint.

```
service worker        Anthropic loop        sandbox
    │                       │                  │
    ├─ sessions.create ────▶│                  │
    ├─ events.stream ──────▶│  (open first)    │
    ├─ user.message ───────▶│                  │
    │◀─ custom_tool_use ────┤  getHistory      │
    ├─ chrome.history ──────┤                  │
    ├─ custom_tool_result ─▶│                  │
    │◀─ custom_tool_use ────┤  getPageHtml     │
    ├─ tabs + scripting     │                  │
    ├─ files.upload ───────────────────────────▶
    ├─ resources.add ──────────────────────────▶  mounts /mnt/session/uploads/pages/*.html
    ├─ custom_tool_result ─▶│                  │
    │                       ├─ grep / read ───▶│
    │◀─ agent.message ──────┤                  │
    │◀─ status_idle ────────┤  end_turn        │
    ├─ files.list(scope_id) ───────────────────▶  /mnt/session/outputs/homepage.tsx
    └─ sessions.delete ────▶│                  │
```

### Keeping the worker alive

An MV3 service worker is torn down after ~30s idle, and a build spends most of its
wall clock waiting on the model. Three things keep it alive or bring it back:

- **During a turn**, the in-flight session fetch plus a 20s self-ping
  (`runtime.getPlatformInfo`) reset the idle timer.
- **A 1-minute alarm heartbeat** calls `BuildManager.tick()`. If an
  `activeSessionId` is in storage, the worker reattaches: the orchestrator replays
  the session's event log, re-answers any tool call left hanging, and finishes.
- **The same heartbeat** drives scheduled rebuilds (`lib/auto-rebuild.ts`), so the
  first new tab of the day already shows a fresh homepage.
- **In Safari**, open tabs also ping the worker every 10s during a build, and a
  stopped BharatCode build restarts (see [Privacy](#privacy), "Keeping the worker
  alive in Safari").

### Tabs are views

Each new tab connects on a port (`lib/protocol.ts`), receives a snapshot of the
build state, then streams phase/text/log deltas. Every open tab shows the same live
run. A throttled snapshot is also mirrored to storage so a tab opened while the
worker is asleep paints instantly.

The finished component renders inside a Sandpack iframe
(`entrypoints/newtab/components/HomepagePreview.tsx`): it is model-written code, so
it runs sandboxed, not in the extension's own page.

## Layout

```
packages/agent-core/      host-agnostic agent loop — imports no chrome.*, browser.*, or node:*
  orchestrator.ts         runHomepageBuild: session lifecycle, event loop, tool dispatch, cleanup;
                          getHistoryDigest / loadAllowedPages: the tool logic both providers share
  chat-loop.ts            runHomepageBuildChat: the same agent over an OpenAI-compatible API (BharatCode),
                          with listFiles / grep / read / write answered from memory
  setup.ts                ensureAgent / ensureEnvironment (created once, cached by ID)
  prompt.ts               system prompt + per-build kickoff message (with HOUSE_STYLE, the default look)
  schemas.ts              custom tool input schemas and defaults
  site-filter.ts          blocked-sites list and the private-address check
  history-digest.ts       narrows raw history to fit a tool result
  types.ts                BrowserBridge, KVStore, RunPhase, …

apps/extension/           MV3 extension (WXT + React)
  entrypoints/
    background.ts         service worker: hosts BuildManager, alarm heartbeat
    scraper.content.ts    injected into scraped tabs: scroll, return HTML
    newtab/               the new-tab UI (thin client onto the worker): setup, Settings,
                          provider choice, privacy filter, Improve this tab
  lib/
    build-manager.ts      single-flight build host, broadcast, keepalive, reattach
    browser-bridge.ts     BrowserBridge over chrome.history / chrome.tabs (+ the privacy filter when on)
    history.ts            getHistory: group and rank history by domain
    visit-log.ts          Safari: the extension's own log of page loads (no history API); import/export
    history-import.ts     parse Safari / Chrome Takeout / own history files (ZIP: History.json only)
    page-cache.ts         pages read in the last 2 h, reused when a build restarts
    scraper.ts            getPageHtml: load URLs in a background window, sanitize HTML
    privacy-filter.ts     Safari: send pages to the app's on-device model via native messaging
    privacy-digest.ts     pure half: page → [n]-numbered text, model items → HTML, redaction
    protocol.ts           page ↔ worker messages, the five UI build steps, the Safari ping
    host-access.ts        ask for website access on Build; readable connection errors
    auto-rebuild.ts       when to rebuild on a schedule
    storage.ts            every chrome.storage key, settings, saved homepage
    transpile.ts          TSX → JS for the preview

scripts/install-safari.sh build the app in a temp folder, install one copy in ~/Applications
                          (signs with signing.local.env when present; git ignores that file)

apps/safari/Morning Tab/  Xcode project: the Mac app that carries the extension
  Morning Tab Extension/
    SafariWebExtensionHandler.swift  answers sendNativeMessage ("status", "summarize")
    PrivacyFilter.swift              Foundation Models session: one chunk in, items out

harness/                  Bun scripts: drive agent-core with a fixture/fetch bridge, test the extension
```

## Verification

| Command | Proves |
|---|---|
| `pnpm test` | 56 unit tests: history digest, blocked sites, auto-rebuild, stream reconnect, the chat loop, the privacy digest, history import, the page caches, the prompt and the house style, session discard |
| `pnpm agent:run` | Full build against the real API: tools, mounting, sandbox grep/read, deliverable, cleanup |
| `pnpm agent:verify` | The deliverable transforms, evaluates and server-renders |
| `pnpm agent:resume-test` | A build killed with a tool call pending can be reattached and finished |
| `pnpm agent:retention <sessionId>` | The session and every uploaded page body are actually deleted |
| `pnpm extension:test` | In headless Chrome: worker registers, new tab renders, port protocol answers, `chrome.history` reads |

The `agent:*` commands need `ANTHROPIC_API_KEY` in `.env` and spend API credits. The
harness's bridge uses fixture history and a plain `fetch`, so it can't see
logged-in pages — that's the whole reason `getPageHtml` runs in your browser.

## Gotchas worth knowing

**`mount_path` is always re-rooted under `/mnt/session/uploads/`.** A leading `/` is
stripped, not honored — both at session-create time and via `resources.add()`:

| requested | resolved |
|---|---|
| `/workspace/pages/x.html` | `/mnt/session/uploads/workspace/pages/x.html` |
| `/mnt/session/uploads/x.html` | `/mnt/session/uploads/x.html` |
| *(omitted)* | `/mnt/session/uploads/<file_id>` |

Always report `resource.mount_path` from the response back to the model, never the
path you asked for, or it greps a file that isn't there.

**The result event field is `custom_tool_use_id`**, not `tool_use_id`. (`tool_use_id`
belongs to `user.tool_confirmation` and `user.tool_result`.)

**Never leave an `agent.custom_tool_use` unanswered.** Every path out of the handler
must send a result — a thrown error becomes a result with `is_error: true`, never a
reason to skip the send. An unanswered tool call idles the session forever.

**Don't break on `session.status_idle` alone.** The session idles every time it waits
for a tool result. Break only on `status_terminated`, or on `status_idle` where
`stop_reason.type !== "requires_action"`. And run the terminal check for *every* event,
including deduped ones — `continue`-ing on a duplicate can skip the terminal event that
arrived in the history fetch.

**`event_start` / `event_delta` stream events carry no `id`.** Skip them before dedupe.

**`files.upload()` takes no `purpose`.** Just `{ file }`.

## The default look

`HOUSE_STYLE` (`packages/agent-core/prompt.ts`) describes a broadsheet front page, the
look of `docs/preview.png`: Mac system fonts only (Bodoni 72 / Didot headlines, Iowan
Old Style text), cream paper, a masthead, a dateline and three columns. It goes in the
kickoff message, after the user's standing instructions, not in the system prompt. So
both providers get it, the user's instructions can replace it, and the Managed Agents
agent is not re-versioned. No web fonts are loaded, so a new tab makes no font request.

## Privacy

The editable blocked-sites list is enforced in agent-core's tool handlers, not
just the prompt: blocked domains are excluded from history digests and their
counts, and blocked or non-HTTP(S) page requests never reach the browser bridge.
Each scraped page's final URL is checked again before upload, so a redirect onto
a blocked host is dropped: the browser still loads it, but nothing it read is
sent. Loopback, private-IP and local-network hosts are always blocked, whatever
the list says. A name can still resolve to a private address (`fritz.box`, an
intranet name), so the scraper also records the address each page was served
from (`webRequest`, observe only) and the page is dropped before upload when it is
private. That address is only reported when the extension's own API requests
connect to a public address; behind a proxy at a private address, or when Chrome
reports no address, the name check is all there is. History digests still list
such a domain. Subresource loads are not intercepted.

**The chosen provider always wins.** `tick()` resumes an interrupted Anthropic
session only while `provider` is "anthropic". After a switch to "chat", the
worker calls `discardSession` (agent-core) instead: it deletes the session's
uploads and the session, then clears `activeSessionId`, so the old Anthropic
build can never run again. The new tab offers "Resume interrupted build" only
for Anthropic.

**Restarting on a provider change.** The worker watches `storage.onChanged`
for the provider, a key, the base URL or the model. During a build it cancels
quietly (no error is shown) and starts again with the new settings. The bridge
keeps sanitized pages for 2 hours (`pageCache`), so the restart reuses them and
only the model calls repeat. Cached pages still pass the blocked-site and
private-address checks, and the privacy filter, because those run after the
bridge.

**Keeping the worker alive in Safari.** Safari stops a service worker that
looks idle, and a native-message wait for the on-device model looks idle, so a
build could stop mid-filter with the tab showing its last progress line. While
a build runs, each open tab sends `{ kind: "ping" }` every 10 s
(`PING_INTERVAL_MS`). If the worker is stopped anyway, a restart continues: the
filter's summaries are cached for 2 h (`filteredCache`, keyed by URL and a hash
of the page), Anthropic sessions resume as before, and a BharatCode build left
`chatBuildActive` set, which `tick()` uses to start it again (at most 3 times).

**Imported history (Safari).** The Improve this tab panel reads the file in the
page and sends only the parsed visits to the worker (`runtime.sendMessage`),
because the worker owns the in-memory visit log and its delayed save. From a
ZIP, fflate decompresses only `History.json`, so passwords and cards in a
Safari export are never read. Visits older than 30 days are dropped, and the
log's start moves back to the oldest imported visit.

**Model providers.** `provider` in storage picks the path. "anthropic" runs
Managed Agents as described above. "chat" runs `runHomepageBuildChat` against
`<chatBaseUrl>/chat/completions` (BharatCode by default): a non-streaming tool
loop that resends the whole conversation each turn, keeps scraped pages in a
`Map`, and answers listFiles / grep / read / write itself. Both paths call
`getHistoryDigest` and `loadAllowedPages`, so the blocked-sites list, the
redirect recheck and the private-address check are identical. The chat path
has no server-side session, so nothing needs deleting, but the provider's own
retention applies (BharatCode's Free and Lite plans may log prompts). The
system prompt comes from `buildSystemPrompt("local")`; the Managed Agents
prompt is `buildSystemPrompt("sandbox")` and is byte-identical to before, so
existing agents are not re-versioned.

**On-device privacy filter (Safari, opt-in).** With the setting on, the bridge
passes every scraped page through `filterPages` before agent-core sees it. The
page becomes plain text with links replaced by `[n]` markers, split into chunks
of at most 6,000 characters (3 per page, run one at a time; each native request
times out after 2 minutes) to fit the on-device model's 4,096-token
context. Each chunk goes over `runtime.sendNativeMessage` to
`SafariWebExtensionHandler`, which runs a Foundation Models session with guided
generation (`@Generable`) and returns `{ link, title, summary }` items. The model
never writes a URL: items whose `link` is not a marker on the page are dropped,
and hrefs are taken from the page. Titles, summaries and history titles then pass
a regex redaction (emails, phone numbers, long digit runs). The filter fails
closed: if the model is unavailable or a request fails, the page is reported in
`failed` and nothing from it is uploaded. The native handler logs only error
types, never page text. Progress ("Privacy filter: page 2 of 3, part 1 of 3") reaches the
activity log through the bridge's `onProgress` callback, which agent-core
forwards as a `scraping` phase detail and a log line. Redaction is best effort; the blocked-sites list is still
the hard control.

The session event log persists every domain, title and scraped page body server-side
until deleted, and uploaded files persist independently. `runHomepageBuild` deletes
both in a `finally`. Confirm retention/ZDR eligibility against current docs before
distributing this.

The API keys live in `chrome.storage.local`, readable by anyone with access to the
browser profile. Fine for a tool you run yourself; **do not ship this to the Chrome Web
Store or the Mac App Store** without moving the key behind a proxy.
