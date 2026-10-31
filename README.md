# Morning Tab: an AI new tab page for Safari

**A Safari new tab that reads the internet for you.**

Morning Tab replaces Safari's new-tab page with one that's written for you. An
agent looks at what you've been browsing, opens the pages you follow (signed in
as you), and writes a fresh homepage from what it finds there. It rebuilds itself
each morning, so each new tab is up to date.

> **Credit.** Morning Tab is a Safari port of
> [**AI Homepage (ThariqS/ai-newtab)**](https://github.com/ThariqS/ai-newtab) by
> [Thariq Shihipar](https://github.com/ThariqS). The agent, the new-tab UI and the
> design are his work. This fork adds Safari support. It is not affiliated with or
> endorsed by the original author, Apple or Anthropic. Licensed MIT, like the original.

![An example homepage in a morning-newspaper style](docs/preview.png)
<sub>Illustration. Your homepage is built from your own browsing, so its stories will be different.</sub>

A morning newspaper is just one look. You can describe any look and the next build
follows it: a quiet one-column digest, a dense dashboard, a green-on-black
terminal, a zine.

> **Privacy, up front.** Nothing leaves your Mac except during a build, and then
> only to the Anthropic API, using your own API key. A build sends a summary of
> the sites you visit (top domains, visit counts, a few page titles) and the
> cleaned-up HTML of up to 8 pages. Those pages are loaded in your signed-in
> browser, so they can include private content. The agent session and every
> uploaded page are deleted when each build ends. Your API key and the visit log
> stay in the extension's local storage on your Mac. They are never synced. More
> detail in [ARCHITECTURE.md](./ARCHITECTURE.md#privacy).

---

## How Safari is different

Safari gives extensions **no access to your browsing history**. So on Safari,
Morning Tab keeps its own small log of the pages you load, starting the moment
you install it ([`lib/visit-log.ts`](apps/extension/lib/visit-log.ts)):

- On install, it starts the log from the tabs you have open.
- After that, it counts each page you load. Private windows are never logged.
- Pages that Morning Tab opens itself, to read for a build, are not counted.
- Entries older than 30 days are deleted. The log never leaves your Mac except
  as the summary sent during a build.

Your first homepage is thin. It improves over the first few days as the log fills.

Other differences: Safari has no extension notifications, so a failed background
build shows only in the next new tab. Safari can bring the window that Morning
Tab opens to read pages to the front.

The Chrome build still works and still reads Chrome's history.

## Install (Safari on macOS)

You need macOS with Xcode, [Node.js](https://nodejs.org) 20+, and an
[Anthropic API key](https://console.anthropic.com).

```bash
git clone https://github.com/nijanthan-dev/morning-tab-safari.git
cd morning-tab-safari
npx pnpm@10.11.1 install
npx pnpm@10.11.1 build:safari
```

Then build and run the app that carries the extension:

1. Open `apps/safari/Morning Tab/Morning Tab.xcodeproj` in Xcode.
2. Choose the **Morning Tab** scheme and **My Mac**, then press **Run** (⌘R).
3. In Safari, open **Settings → Advanced** and turn on **Show features for web developers**.
4. Open **Develop → Developer Settings…** and turn on **Allow unsigned extensions**.
   Safari turns this off each time it quits, so do it again after a restart.
5. Open **Settings → Extensions**, turn on **Morning Tab**, and allow it on **All Websites**.
6. Open **Settings → General** and set **New tabs open with** to **Morning Tab**.

## Install (Chrome)

```bash
npx pnpm@10.11.1 build
```

Go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**
and choose `apps/extension/.output/chrome-mv3`.

## Your first homepage

1. Open a new tab and paste your Anthropic API key.
2. Click **Build today's homepage**.
3. Watch it work. The progress view walks through each step: preparing the
   agent, reading your history, opening pages in your browser, analyzing them,
   and writing your homepage.

The first build takes a few minutes. You can close the tab while it runs, since
the build lives in the extension's background worker and appears in any new tab
you open.

## Make it yours

Click **⚙️ Settings** on the new tab.

**Instructions.** Anything you write here goes into every build and takes priority
over the agent's own defaults. This box sets both the content and the look:

| You write | You get |
| --- | --- |
| *"A morning newspaper. Serif type, a big masthead, a lead story, a column of briefs."* | A broadsheet front page |
| *"One calm column. No images. Five things worth reading, with one line on why."* | A quiet reading list |
| *"Dense dashboard: GitHub PRs and issues first, then Hacker News, then everything else."* | A work cockpit |
| *"Green-on-black terminal, monospace, like a 1980s BBS."* | Exactly that |
| *"Skip sports and politics. Always show the weather and my next three calendar events."* | Your rules, every day |

Click **Save & rebuild** to apply them right away.

**Sites the agent never reads.** Enter one host per line; subdomains are included,
and `*.example.com` is supported. The editable defaults include common webmail,
sign-in and document hosts. **Save & rebuild** saves the list and applies it to
history summaries and URLs requested through `getPageHtml`. A page that redirects
onto a blocked host is dropped before its content is uploaded. Local-network
addresses (localhost, private IPs, `.local` and `.internal` hosts) are always blocked.

**Model.** Choose which Claude model writes your page:

- **Claude Sonnet 5.5** (default): the best balance of quality and cost.
- **Claude Haiku 5.5**: the fastest and cheapest.
- **Claude Opus 5.5**: the most careful editor, and the most expensive.

The new model takes effect from your next build.

**Rebuild automatically each morning.** On by default. The extension builds one
morning edition a day, quietly in the background, the first time your browser is
open between 5am and noon. If it isn't open that morning, the day is skipped. It
only starts after you've built once by hand, and it tries at most once per
morning, so it never loops.

**↻ Rebuild** in the top-right corner rebuilds right away.

## Good to know

- **Cost.** Each build is a single agent session billed to your API key. What it
  costs depends on the model and on how much it reads. Haiku is the cheapest
  choice, and you can turn off automatic rebuilds to build only when you ask.
- **What it can see.** It ranks the sites in your history and opens up to 8 of
  them per build. It skips search engines, webmail, banking and logged-out
  marketing pages. Anything it can't open is reported, not hidden.
- **Links are real.** Every link on the page comes from a page the agent actually
  read. It's told never to invent a URL.
- **Interrupted builds.** If the browser closes mid-build, the new tab offers
  **Resume interrupted build** next time.
- **Updating.** After pulling new code, run `npx pnpm@10.11.1 build:safari` again,
  then press **Run** in Xcode. For Chrome, run `npx pnpm@10.11.1 build` and click
  the reload icon on the extension in `chrome://extensions`.

## How it works

1. **`getHistory`**: the agent gets a ranked summary of your most-visited domains.
2. **`getPageHtml`**: it picks up to 8 pages, which the extension opens in a
   background window, cleans up, and mounts into the agent's sandbox as files.
3. **`grep` / `read`**: the agent pulls headlines, posts and links out of those
   files inside its sandbox.
4. **`write`**: it writes one React component, which the new tab renders.

The extension's background worker drives a
[Claude Managed Agents](https://docs.claude.com) session directly, with no server
in between. The two custom tools run in the extension because they need
the browser's history (or, on Safari, the local visit log) and tabs. Everything else happens in the agent's
sandbox, where shell access is off: scraped pages are untrusted input.

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the event flow, the layout, and
the gotchas worth knowing.

## Development

```
packages/agent-core   the agent loop: host-agnostic, no chrome.* or node:*
apps/extension        the MV3 extension (WXT + React)
apps/safari           the Xcode project that packages the extension for Safari
harness               Bun scripts that run agent-core outside Chrome, and test the built extension
```

```bash
pnpm dev                 # WXT with hot reload
pnpm typecheck           # all packages
pnpm test                # unit tests (no API calls; needs Bun)
pnpm extension:test      # loads the built extension into headless Chrome (no API calls)

cp .env.example .env     # add ANTHROPIC_API_KEY, then:
pnpm agent:run           # a full build against the real API, with fixture history
pnpm agent:verify        # check the output actually renders
```

## Status

Early and experimental. It's a tool you run yourself with your own key. Don't
publish it to a store as-is: anyone with access to the browser profile can read
the stored API key.

## Credits and license

Morning Tab is built on [AI Homepage](https://github.com/ThariqS/ai-newtab) by
[Thariq Shihipar](https://github.com/ThariqS). Thank you, Thariq, for building it
and releasing it under MIT.

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
