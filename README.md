# Morning Tab: an AI new tab page for Safari, with an on-device privacy filter

**Start here:** run these 3 commands, then do the Safari steps below. Setup takes about 10 minutes.

```bash
git clone https://github.com/nijanthan-dev/morning-tab-safari.git
cd morning-tab-safari
npx pnpm@10.11.1 install && npx pnpm@10.11.1 install:safari
```

Morning Tab replaces the Safari new tab page. An AI agent reads the sites you visit and writes a new homepage for you each morning.

**Privacy option:** turn on the [on-device privacy filter](#the-on-device-privacy-filter-optional). Apple Intelligence then reads each page on your Mac, and only short summaries go to Anthropic.

![An example homepage in a morning-newspaper style](docs/preview.png)
<sub>Illustration. The agent builds your homepage from your own browsing, so your stories will be different.</sub>

> **Credit.** Morning Tab is a Safari port of [**AI Homepage (ThariqS/ai-newtab)**](https://github.com/ThariqS/ai-newtab) by [Thariq Shihipar](https://github.com/ThariqS).
> The agent, the new tab interface and the design are his work. This fork adds Safari support.
> This fork is not affiliated with the original author, Apple or Anthropic. The license is MIT, the same as the original.

---

## Install

You need:

- A Mac with Xcode 27 or later
- [Node.js](https://nodejs.org) 20 or later
- An [Anthropic API key](https://console.anthropic.com)

### Part 1 of 2: Build and install the app (about 5 minutes)

1. Run the 3 commands at the top of this page.
2. The last command builds the app, installs it in `~/Applications/Morning Tab.app` and opens it. You do not need to open Xcode.
3. If Safari is open, the command asks you to quit Safari first. Safari 27 can crash when the app is replaced while Safari is open.

The install script keeps exactly one copy of the app. macOS registers every app that Xcode builds, and Safari shows one **Morning Tab** for each copy that it finds. So the script builds in a temporary folder, copies the app to `~/Applications`, then deletes the build copy.

### Part 2 of 2: Enable the extension in Safari (about 5 minutes)

1. Open **Safari → Settings → Advanced**. Select **Show features for web developers**.
2. Open **Develop → Developer Settings…**. Select **Allow unsigned extensions**.
3. Open **Settings → Extensions**. Enable **Morning Tab**. Click **Always Allow on Every Website…**. Morning Tab needs this access to reach the Anthropic API and to read your pages.
4. Open **Settings → General**. Set **New tabs open with** to **Morning Tab**.

> Safari clears **Allow unsigned extensions** each time Safari quits. After a restart, do step 2 again.

### If something goes wrong

| Problem | Cause | Fix |
| --- | --- | --- |
| **Morning Tab** is not in the extension list | **Allow unsigned extensions** is off. Safari turns it off each time Safari quits or crashes. | Open **Develop → Developer Settings…** and select **Allow unsigned extensions** again. If it is still missing, quit Safari (⌘Q), open it, and do that step again. |
| Safari crashes during an install | Safari 27 crashes when it loads a replaced extension and adds its toolbar button again. This is a bug in Safari. | Quit Safari before you run `install:safari`. The command now asks you to do this. |
| **Morning Tab** shows 2 or more times | macOS has more than one copy of the app, for example from **Run** in Xcode | Run `npx pnpm@10.11.1 install:safari`. Then delete any other copy of `Morning Tab.app`. |
| "Connection error." or "has no website access" | Safari has not given Morning Tab website access. Morning Tab needs it to reach the Anthropic API and to read pages. | Click **Build today's homepage** and allow access in the prompt. Or open **Settings → Extensions → Morning Tab** and click **Always Allow on Every Website…**. |
| The privacy filter status says "not available" | Apple Intelligence is off or still downloading | See [The on-device privacy filter](#the-on-device-privacy-filter-optional). |

To find every copy that macOS knows about, run this command:

```bash
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -dump | grep "^path:.*Morning Tab"
```

## Build your first homepage

1. Open a new tab.
2. Paste your Anthropic API key. Click **Save**.
3. Optional: select **On-device privacy filter**. Do this before the first build if you want no page content to leave your Mac. The status line shows if Apple Intelligence is ready.
4. Click **Build today's homepage**.

The first build takes a few minutes. The progress view shows each step as the agent works.

You can close the tab during a build. The build runs in the extension's background worker. Any new tab shows the build.

> **Your first homepage is thin.** Safari has no history for the agent to read (see below). The homepage gets better over the first few days.

## What leaves your Mac

Data leaves your Mac only during a build. It goes only to the Anthropic API, with your own API key.

A build sends:

- A summary of the sites you visit: top domains, visit counts and some page titles
- Up to 8 pages: the cleaned HTML, or only short summaries if the privacy filter is on

Safari loads those pages with your sign-ins, so they can contain private content. Anthropic deletes the agent session and all uploaded pages when each build ends.

### The on-device privacy filter (optional)

The privacy filter is the main difference from the original extension. It is off by default. You can turn it on before your first build, on the **Build your homepage** screen. After that, open **⚙️ Settings** and select **On-device privacy filter**.

| | Filter off (default) | Filter on |
| --- | --- | --- |
| What goes to Anthropic for each page | The cleaned HTML of the page | A list of items: a title, one sentence and the page's own link for each |
| Who reads the full page | Anthropic's model | Apple Intelligence, on your Mac |
| Personal details | The agent has an instruction to skip them | The on-device model leaves them out. Then a pattern check replaces emails, phone numbers and long numbers, such as card numbers, with a placeholder. |
| Page titles in the history summary | Sent as they are | Sent after the same pattern check |
| If Apple Intelligence is not ready | Not needed | The page is not sent. The build continues with the other data. |
| Needs | Nothing extra | A Mac with Apple silicon, macOS 26 or later, and Apple Intelligence turned on |

How it works:

1. The extension turns each page into plain text, with a number such as `[3]` for each link.
2. The Morning Tab app gives the text to Apple's on-device model (the Foundation Models framework). The code is in [`PrivacyFilter.swift`](apps/safari/Morning%20Tab/Morning%20Tab%20Extension/PrivacyFilter.swift).
3. The model returns items with link numbers only. It never writes a URL.
4. The extension keeps only items whose number is a real link on the page. It builds the list from those links. The code is in [`privacy-digest.ts`](apps/extension/lib/privacy-digest.ts).

To turn on Apple Intelligence:

1. Open **System Settings → Apple Intelligence & Siri**.
2. Turn on **Apple Intelligence**. Make sure that the Siri language is the same as your Mac language.
3. Wait for the download to finish. Keep the Mac on Wi-Fi and power. The download can take 15 to 60 minutes.

**Settings** shows the status of the on-device model under the filter option.

The filter is a strong extra protection, not a guarantee. The on-device model can miss a personal detail. The pattern check catches only fixed formats. Use **Sites the agent never reads** for sites that you never want opened.

Your API key and the visit log stay in the extension's local storage on your Mac. Safari does not sync them. For more detail, read [ARCHITECTURE.md](./ARCHITECTURE.md#privacy).

## How Safari is different from Chrome

**Short version:** Chrome lets an extension read your browsing history. Safari does not. So Morning Tab on Safari keeps its own log of the pages you load, starting from the day you install it.

### Chrome and Safari side by side

| | Chrome | Safari |
| --- | --- | --- |
| Extension can read your past history | Yes, with the `history` permission | No. The `history` API does not exist in Safari. |
| What the agent ranks | Your real Chrome history (14 days by default) | Morning Tab's own visit log (up to 30 days) |
| First homepage | Full, from day one | Thin. It gets better over the first few days. |
| Notification when a background build fails | Yes | No. The error shows in your next new tab. |
| Install | Load the folder in `chrome://extensions` | Build a Mac app in Xcode. The app contains the extension. |
| Unsigned extension | Works in Developer mode | Needs **Allow unsigned extensions**. Safari clears it each time Safari quits. |
| On-device privacy filter | Not available | Optional. Uses Apple Intelligence on your Mac. |

### Why Morning Tab cannot read your Safari history

1. **Safari has no history API for extensions.** Chrome and Firefox give extensions `browser.history`. Safari does not. Apple's [browser compatibility guide](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility) tells you to check each API, and Safari ignores APIs that it does not support. We checked the WebKit engine in Safari 27 on macOS 27. It has code for tabs, windows, scripting, storage and other APIs. It has no code for history.
2. **The permission does nothing.** If an extension asks for `history` in Safari, Safari ignores the request. The Safari build of Morning Tab does not ask for it.
3. **Morning Tab does not read Safari's history file.** Safari keeps your history in a file in your Library folder. macOS protects that folder. To read the file, an app needs **Full Disk Access**. That access lets an app read almost all of your files. Morning Tab does not ask for it, because that is too much access for a new tab page.

Apple has not said publicly why Safari has no history API. Apple puts a strong focus on privacy, and that can be a reason. This is our guess, not a statement from Apple.

### What Morning Tab does instead

Morning Tab records the pages you load in Safari from the day you install it. The code is in [`visit-log.ts`](apps/extension/lib/visit-log.ts).

| The log does this | The log does not do this |
| --- | --- |
| Starts from the tabs you have open at install | Read the history Safari had before the install |
| Counts each page you load | Count pages in private windows |
| Deletes entries older than 30 days | Count the pages that Morning Tab opens for a build |
| Stays in the extension's storage on your Mac | Sync to iCloud or to other devices |

For the first 3 days, the agent counts every site in the log, even sites with only one visit. After that, the agent ignores sites with fewer than 2 visits, the same as on Chrome.

### One more difference

To read pages, Morning Tab opens a separate window. Chrome keeps that window behind your work. Safari can show it in front.

## Make it yours

Click **⚙️ Settings** on the new tab. There are 5 settings.

**1. Instructions.** The agent uses your instructions in every build. Your instructions have priority over the agent's defaults. They control the content and the look.

| You write | You get |
| --- | --- |
| *"A morning newspaper. Serif type, a big masthead, a lead story, a column of briefs."* | A newspaper front page |
| *"One calm column. No images. Five things worth reading, with one line on why."* | A short reading list |
| *"Dense dashboard: GitHub PRs and issues first, then Hacker News, then everything else."* | A work dashboard |
| *"Green-on-black terminal, monospace, like a 1980s BBS."* | A terminal look |
| *"Skip sports and politics. Always show the weather and my next three calendar events."* | Your rules, every day |

Click **Save & rebuild** to use them now.

**2. Sites the agent never reads.** Type one host on each line.

- The rule also blocks the subdomains of each host. You can use `*.example.com`.
- The defaults include common webmail, sign-in and document hosts. You can edit them.
- If a page redirects to a blocked host, the extension drops the page before upload.
- The extension always blocks local network addresses: localhost, private IPs, and `.local` and `.internal` hosts.

**3. Model.** Select the Claude model that writes your page. The new model applies from your next build.

- **Claude Sonnet 5.5** (default): the best balance of quality and cost
- **Claude Haiku 5.5**: the fastest and the cheapest
- **Claude Opus 5.5**: the most careful, and the most expensive

**4. Rebuild automatically each morning.** This setting is on by default.

- The extension builds one homepage each day, in the background.
- It builds the first time Safari is open between 5 AM and noon. If Safari is not open that morning, it skips that day.
- It starts only after your first manual build. It tries one time each morning at most.

**5. On-device privacy filter.** This setting is off by default. When it is on, Apple Intelligence on your Mac summarizes each page first, and only the summaries go to Anthropic. See [The on-device privacy filter](#the-on-device-privacy-filter-optional).

To rebuild now, click **↻ Rebuild** at the top right.

## Good to know

- **Cost.** Your API key pays for each build. The cost depends on the model and on the quantity of text the agent reads. Haiku costs the least. To build only when you ask, disable automatic rebuilds.
- **What the agent reads.** The agent ranks the sites you visit and opens up to 8 of them in each build. It skips search engines, webmail, banking and logged-out marketing pages. If it cannot open a page, it reports the failure.
- **Links are real.** Each link on your page comes from a page that the agent read. The agent has an instruction to never invent a URL.
- **Interrupted builds.** If Safari closes during a build, the next new tab shows **Resume interrupted build**.
- **Updates.** After you pull new code, run `npx pnpm@10.11.1 install:safari`.

## How it works

1. **`getHistory`**: the agent gets a ranked summary of the domains you visit most.
2. **`getPageHtml`**: the agent selects up to 8 pages. The extension opens them in a background window and cleans them. If the privacy filter is on, the extension replaces each page with its on-device summary. Then it gives the pages to the agent as files.
3. **`grep` / `read`**: the agent finds headlines, posts and links in those files.
4. **`write`**: the agent writes one React component. The new tab shows it.

The extension's background worker controls a [Claude Managed Agents](https://docs.claude.com) session directly. There is no server between them. The two custom tools run in the extension, because they need the visit log and Safari's tabs. All other work runs in the agent's sandbox. The sandbox has no shell access, because scraped pages are untrusted input.

For the event flow, the layout and known issues, read **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Development

```
packages/agent-core   the agent loop. It uses no browser or Node APIs.
apps/extension        the MV3 extension (WXT + React)
apps/safari           the Xcode project that packages the extension for Safari
harness               Bun scripts that run agent-core outside a browser and test the built extension
```

```bash
pnpm build:safari        # Safari bundle for the Xcode project
pnpm install:safari      # build the app and install one copy in ~/Applications
pnpm typecheck           # all packages
pnpm test                # unit tests (no API calls, needs Bun)

cp .env.example .env     # add ANTHROPIC_API_KEY, then:
pnpm agent:run           # a full build with the real API and test history
pnpm agent:verify        # check that the output renders
```

**Chrome.** The Chrome build still works and reads Chrome's real history. Run `npx pnpm@10.11.1 build`. In `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select `apps/extension/.output/chrome-mv3`.

## Releases

Each push to `main` makes a new release automatically. The workflow is [`release.yml`](.github/workflows/release.yml).

1. GitHub tags the next patch version, for example `v0.1.0`, then `v0.1.1`.
2. It builds the Safari and Chrome bundles on a standard Ubuntu runner.
3. It publishes a [GitHub release](https://github.com/nijanthan-dev/morning-tab-safari/releases) with the 2 zip files and a `SHA256SUMS.txt` file.

| To do this | Do this |
| --- | --- |
| Release a new minor or major version | Set `version` in `apps/extension/package.json` above the latest tag, for example `0.2.0`. Then push. |
| Push without a release | Change only Markdown files or `docs/`. These pushes do not release. |
| Release again without a change | Run the **Release** workflow by hand on the **Actions** tab. |

The release does not contain the Mac app. To use the Safari bundle, build the app in Xcode (see [Install](#install)).

## Status

Morning Tab is early and experimental. It is a tool that you run yourself, with your own key.

Do not publish it to a store in its current form. Any person with access to your browser profile can read the stored API key.

## Credits and license

Morning Tab uses the code of [AI Homepage](https://github.com/ThariqS/ai-newtab) by [Thariq Shihipar](https://github.com/ThariqS). Thank you, Thariq, for building it and for releasing it under MIT.

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
