# Architecture

There is no server. The extension talks to one model provider that you choose.
The first is Anthropic (Claude Managed Agents, described first). The second is an
OpenAI-compatible chat API such as BharatCode (see [Model providers](#privacy) under Privacy).

| | Runs where | Does what |
|---|---|---|
| **Extension** (service worker) | Your browser | Hosts the build: holds the SSE stream, executes `getHistory` / `getPageHtml`, uploads page HTML, persists the homepage |
| **Extension** (new-tab page(s)) | Your browser | Thin view: subscribes to the worker over a port, renders live progress and the finished homepage |
| **Orchestration layer** | Anthropic | Runs the agent loop, persists the session event log, emits `agent.custom_tool_use` |
| **Session sandbox** | Anthropic | Runs `read` / `grep` / `glob` / `write` over the mounted pages |
| **Chat API** (BharatCode path) | The provider | Only the model. The worker runs the loop and answers every tool, file tools included, from memory |
| **Your Edition app** (Safari) | Your Mac | Carries the extension. Runs the on-device privacy filter over native messaging |

The agent loop runs **in the service worker** (`apps/extension/lib/build-manager.ts`).
So a build survives closing the tab, shows up in every open tab, and can run headless on a
`chrome.alarms` schedule. The two custom tools execute in the extension too, because they
need history (`chrome.history` on Chrome, the visit log on Safari) and `chrome.tabs`.
Anthropic never executes them. It emits an event and waits for a `user.custom_tool_result`
on the same authenticated stream. There is no inbound connection and no public endpoint.

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
    ├─ files.list(scope_id) ───────────────────▶  /mnt/session/outputs/homepage.html
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
- **In Safari**, open tabs also ping the worker every 10s during a build. A
  stopped build resumes or starts again (see [Privacy](#privacy), "Keeping the
  worker alive in Safari").

### Tabs are views

The worker and every tab apply each progress message with the same `reduce()`
(`lib/protocol.ts`), so a late tab's snapshot and the live deltas always agree.
A Cancel is not a failure. The worker sends an empty snapshot, and the tabs go
back to the homepage or the first-build screen.

Each new tab connects on a port (`lib/protocol.ts`), receives a snapshot of the
build state, then streams phase/text/log deltas. Every open tab shows the same live
run. A throttled snapshot is also mirrored to storage so a tab opened while the
worker is asleep paints instantly.

### The edition runs no code

The agent writes one static HTML page, not code. The new tab shows it in an
`<iframe srcdoc>` (`entrypoints/newtab/components/EditionFrame.tsx`) with
`sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"`.
There is no `allow-scripts` and no `allow-same-origin`, so nothing that the
model writes can run, read storage or reach the extension.

`lib/edition.ts` adds 3 lines right after the page's doctype:

- A Content-Security-Policy: `default-src 'none'`, inline styles, and images over
  https or data URLs only. It can only narrow the page. A policy that the model
  writes cannot widen it.
- `<base target="_top">`, so a click opens the site in the tab. Sites refuse to
  load inside a frame. A ⌘-click opens a new tab.
- `<meta name="referrer" content="no-referrer">`.

A new tab therefore contacts no third party. It loads only the images that the
edition shows, from the sites they came from.

Why not run a React component, as the original project does? The original
renders it in Sandpack, which loads its frame from codesandbox.io. Running code
locally needs a manifest `sandbox` page, and Safari's WebKit does not support that
manifest key (checked in the WebKit build in macOS 27). Editions from before
version 0.3 are React code, so the new tab asks for one rebuild.

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
    protocol.ts           page ↔ worker messages, the five UI build steps, the Safari ping, and
                          reduce(): the one state reducer that the worker and the tabs share
    host-access.ts        ask for website access on Build; readable connection errors
    auto-rebuild.ts       when to rebuild on a schedule
    storage.ts            every chrome.storage key, settings (providerConfig), saved homepage
    platform.ts           what this browser can do (history API, visit log, on-device model,
                          webRequest), and its name and website-access help for messages
    provider-key.ts       the key rule for both providers (no browser APIs, so the harness tests it)
    timeout.ts            withTimeout: one time limit helper for the scraper and native messages
    edition.ts            the frame's policy and link rules, added to the edition's HTML

scripts/install-safari.sh build the app in a temp folder, install one copy in ~/Applications
                          (signs with signing.local.env when present; git ignores that file).
                          With YOUR_EDITION_OUTPUT=<dir> it only builds, signs and notarizes:
                          the release workflow's mac-app job runs it that way.

.github/workflows/release.yml  version → signing (are there secrets?) → mac-app (macOS runner,
                          only with secrets) and bundles (Ubuntu), at the same time → release

apps/safari/Your Edition/  Xcode project: the Mac app that carries the extension
  Your Edition Extension/
    SafariWebExtensionHandler.swift  answers sendNativeMessage ("status", "summarize")
    PrivacyFilter.swift              Foundation Models session: one chunk in, items out

harness/                  Bun scripts: drive agent-core with a fixture/fetch bridge, test the extension
```

## Verification

| Command | Proves |
|---|---|
| `pnpm test` | 59 unit tests. They cover the history digest, blocked sites, auto-rebuild and stream reconnect. They also cover the chat loop, the privacy digest, history import and the page caches. The rest cover the prompt, the house style (fonts, dark mode, columns), session discard and shortening seen chat results. |
| `pnpm agent:run` | Full build against the real API: tools, mounting, sandbox grep/read, deliverable, cleanup |
| `pnpm agent:verify` | The deliverable is one static HTML page: no scripts, no external files, real links |
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
including deduped ones. A `continue` on a duplicate can skip the terminal event that
arrived in the history fetch.

**`event_start` / `event_delta` stream events carry no `id`.** Skip them before dedupe.

**`files.upload()` takes no `purpose`.** Just `{ file }`.

## Platform differences

`lib/platform.ts` answers every Chrome-versus-Safari question once. No other file
checks the browser itself.

- `HAS_HISTORY_API`: a feature test.
- `USES_VISIT_LOG`: its opposite. The visit log, the import panel and the worker's
  import/export messages turn on together.
- `HAS_ON_DEVICE_MODEL`: the Safari build, which ships inside the Mac app.
- `HAS_WEB_REQUEST`: whether the `webRequest` API exists, for the private-address check.

## The name and the bundle ID

The project was called Morning Tab before version 0.2. The app, the extension
and the repo now use Your Edition. The bundle ID stays
`io.github.nijanthan-dev.morning-tab`.

The plan was that the same bundle ID keeps the extension's storage. It did not.
After the upgrade, Safari treated Your Edition as a new extension. Its storage
was empty: no API keys, no visit log, no settings. Apple does not
document what Safari uses to key that storage. So an upgrade from Morning Tab
needs the key again, and the visit log starts again unless the user exported
it first.

The bundle ID still stays as it is. A new ID would reset the storage one more
time for everyone who already upgraded. `install:safari` deletes an old
`~/Applications/Morning Tab.app`, because two apps with one bundle ID show as
two extensions.

## The default look

`HOUSE_STYLE` (`packages/agent-core/prompt.ts`) describes a broadsheet front page, the
look of `docs/preview.png`. It uses Mac system fonts only (Bodoni 72 / Didot headlines,
Iowan Old Style text). It has cream paper, a "Your Edition" masthead, a dateline that
names the edition (morning, afternoon, evening or night) and three columns.

It goes in the kickoff message, after the user's standing instructions, not in the
system prompt. So both providers receive it, the user's instructions can replace it, and
the Managed Agents agent is not re-versioned. No web fonts are loaded, so a new tab
makes no font request.

It asks for every color as one set of CSS variables. One `prefers-color-scheme: dark`
block switches them all together, so text can never be dark on a dark panel. The
columns use `minmax(0, …)`, so a long word cannot make the page scroll sideways.

## Privacy

Agent-core's tool handlers enforce the editable blocked-sites list, not only the
prompt. Blocked domains are excluded from history digests and their counts.
Blocked or non-HTTP(S) page requests never reach the browser bridge. Each scraped
page's final URL is checked again before upload, so a redirect onto a blocked host
is dropped. The browser still loads it, but nothing it read is sent. Loopback,
private-IP and local-network hosts are always blocked, whatever the list says.

A name can still resolve to a private address (`fritz.box`, an intranet name). So
the scraper also records the address each page was served from (`webRequest`,
observe only), and drops the page before upload when that address is private.
That address is only reported when the extension's own requests to the model API
(Anthropic or the chat provider) connect to a public address. Behind a proxy at a private address, or when the browser reports
no address, the name check is all there is. History digests still list such a
domain. Subresource loads are not intercepted.

**The chosen provider always wins.** `BuildManager.dropStaleSession` is the one
place that decides. It keeps a leftover Anthropic session only while `provider`
is "anthropic". Otherwise the worker calls `discardSession` (agent-core). It
deletes the session's uploads and the session, then clears `activeSessionId`.
So the old Anthropic build can never run again. `tick()` and `startBuild` both
call it. The new tab offers "Resume interrupted build" only for Anthropic.

**Restarting on a provider change.** The provider, both keys, the base URL and
the model are one storage object (`providerConfig`), written once by **Save
provider**. The worker watches `storage.onChanged` for that one key, so one
Save is one restart, with no debounce. During a build it cancels quietly (no
error is shown) and starts again with the new settings. `loadSettings` still
reads the old separate keys when `providerConfig` is missing. The first Save
deletes them, so an update keeps the user's keys. The bridge keeps sanitized
pages for 2 hours (`pageCache`). So the restart reuses them, and only the model
calls repeat. Cached pages still pass the blocked-site and
private-address checks, and the privacy filter, because those run after the
bridge.

**Keeping the worker alive in Safari.** Safari stops a service worker that
looks idle, and a native-message wait for the on-device model looks idle. So a
build could stop mid-filter, with the tab showing its last progress line. While
a build runs, each open tab sends `{ kind: "ping" }` every 10 s
(`PING_INTERVAL_MS`). If the worker is stopped anyway, a restart continues. The
filter's summaries are cached for 2 h (`filteredCache`, keyed by URL and a hash
of the page). Every build writes an `activeBuild` record (`{ provider, attempts }`)
when it starts, and deletes it when this worker sees it end. If `tick()` finds
the record, Safari stopped the worker mid-build. An Anthropic session resumes
from its event log. Any other build starts again from the caches. Both stop
after 3 attempts with a clear error.

**Imported history (Safari).** The Improve this tab panel reads the file in the
page. It sends only the parsed visits to the worker (`runtime.sendMessage`),
because the worker owns the in-memory visit log and its delayed save. From a
ZIP, fflate decompresses only `History.json`, so passwords and cards in a
Safari export are never read. Visits older than 30 days are dropped, and the
log's start moves back to the oldest imported visit.

**Model providers.** `provider` in storage picks the path. "anthropic" runs
Managed Agents as described above. "chat" runs `runHomepageBuildChat` against
`<chatBaseUrl>/chat/completions` (BharatCode by default). It is a non-streaming
tool loop. It resends the whole conversation each turn, keeps scraped pages in a
`Map`, and answers listFiles / grep / read / write itself.

Because each turn resends everything, `shrinkSeen` shortens what the model has
already answered. It replaces tool results over 2,000 characters, and earlier
`write` calls, with a short note. The pages stay in the `Map`, so the model can
read them again.

Both paths call `getHistoryDigest` and `loadAllowedPages`. So the blocked-sites
list, the redirect recheck and the private-address check are identical. The chat
path has no server-side session, so nothing needs deleting. The provider's own
retention applies (BharatCode's Free and Lite plans may log prompts). The chat
system prompt comes from `buildSystemPrompt("local")`. The Managed Agents prompt
is `buildSystemPrompt("sandbox")`. When it changes, `ensureAgent` sees a new
fingerprint and updates the agent in place.

**On-device privacy filter (Safari, opt-in).** With the setting on, the bridge
passes every scraped page through `filterPages` before agent-core sees it. The
page becomes plain text, with links replaced by `[n]` markers. The text is split
into chunks of at most 6,000 characters, to fit the on-device model's 4,096-token
context. There are at most 3 chunks per page, run one at a time. Each native
request times out after 2 minutes. Each chunk goes over `runtime.sendNativeMessage` to
`SafariWebExtensionHandler`, which runs a Foundation Models session with guided
generation (`@Generable`) and returns `{ link, title, summary }` items. The model
never writes a URL: items whose `link` is not a marker on the page are dropped,
and hrefs are taken from the page. Titles, summaries and history titles then pass
a regex redaction (emails, phone numbers, long digit runs). The filter fails
closed: if the model is unavailable or a request fails, the page is reported in
`failed` and nothing from it is uploaded. The native handler logs only error
types, never page text. Progress ("Privacy filter: page 2 of 3, part 1 of 3")
reaches the activity log through the bridge's `onProgress` callback. Agent-core
forwards it as a `scraping` phase detail and a log line. Redaction is best
effort. The blocked-sites list is still the hard control.

The session event log persists every domain, title and scraped page body server-side
until deleted, and uploaded files persist independently. `runHomepageBuild` deletes
both in a `finally`. Check retention/ZDR eligibility against current docs before
distributing this.

The API keys live in `chrome.storage.local`. Anyone with access to the browser
profile can read them. That is fine for a tool you run yourself. **Do not ship
this to the Chrome Web Store or the Mac App Store** without moving the key behind
a proxy.
