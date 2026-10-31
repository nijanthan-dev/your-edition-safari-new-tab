# Your Edition: a private AI front page for every Safari new tab

**Start here:** run the 3 commands in [Build the app](#1-build-the-app-about-10-minutes), then do [the Safari steps](#2-turn-it-on-in-safari-about-5-minutes). Setup takes about 15 minutes.

Your Edition replaces the Safari new tab page. An AI agent reads the sites you visit and writes a front page for you each morning. You read it in every new tab, all day.

**Private by design.** There is no Your Edition server. Your visit log stays on your Mac. Your own API key goes only to the AI provider that you choose. An optional on-device filter lets Apple Intelligence read each page on your Mac, so only short summaries leave it.

![An example front page in a broadsheet-newspaper style](docs/preview.png)
<sub>Illustration of the default look. The agent builds your page from your own browsing, so your stories will be different.</sub>

> **Credit.** Your Edition is a Safari port of [**AI Homepage (ThariqS/ai-newtab)**](https://github.com/ThariqS/ai-newtab) by [Thariq Shihipar](https://github.com/ThariqS).
> The agent, the new tab interface and the design are his work. This fork adds Safari support and the privacy features.
> This fork is not affiliated with the original author, Apple, Anthropic or BharatCode. The license is MIT, the same as the original.

---

## Privacy at a glance

| Stays on your Mac | Leaves your Mac only during a build | Never leaves your Mac |
| --- | --- | --- |
| Your visit log (up to 30 days) | A summary of the sites you visit: top domains, visit counts and some page titles | Your Safari history from before the install, unless you import it |
| Your API keys and settings | Up to 8 pages: the cleaned HTML, or only short summaries when the privacy filter is on | Pages in private windows |
| Pages read in the last 2 hours (a cache) | Both go only to the provider that you choose, with your own key | Sites on your **Sites the agent never reads** list |
| The finished front page | | Passwords and cards, even inside a Safari export file |

- **No server.** The extension talks to the provider directly. Nothing goes to the author of this fork.
- **No keys in the code.** Each person enters their own Anthropic or BharatCode key. The key stays in the extension's local storage on that Mac.
- **No third-party code.** The edition is a plain HTML page in a frame that runs no scripts. A new tab loads only the images that the edition shows, from the sites they came from.
- **No web fonts.** The default look uses fonts that every Mac has, so opening a tab sends no request to a font service.
- **No sync.** Safari does not sync the visit log, the keys or the settings to iCloud.

The [on-device privacy filter](#the-on-device-privacy-filter-optional) is optional and off by default. It is a strong extra protection, not a guarantee. For more detail, read [What leaves your Mac](#what-leaves-your-mac).

## Install

You need:

- A Mac with macOS 27 or later
- An API key from [Anthropic](https://console.anthropic.com) or [BharatCode](https://bharatcode.ai)

> [!NOTE]
> **There is no ready-to-download Mac app yet.** For now, you build the app on your Mac with the commands below. A notarized download needs a paid Apple signing setup, so I will add it when people ask for it. If you want one, [star the repo](https://github.com/nijanthan-dev/your-edition-safari-new-tab) or [open an issue](https://github.com/nijanthan-dev/your-edition-safari-new-tab/issues).

### 1. Build the app (about 10 minutes)

You also need Xcode 27 or later and [Node.js](https://nodejs.org) 20 or later. Run these 3 commands:

```bash
git clone https://github.com/nijanthan-dev/your-edition-safari-new-tab.git
cd your-edition-safari-new-tab
npx pnpm@10.11.1 install && npx pnpm@10.11.1 install:safari
```

- The last command builds the app, installs it in `~/Applications/Your Edition.app` and opens it. You do not need to open Xcode.
- If Safari is open, the command asks you to quit Safari first. Safari 27 can crash if the command replaces the app while Safari is open.
- The script keeps exactly one copy of the app. macOS registers every app that Xcode builds, and Safari shows one **Your Edition** for each copy that it finds. So the script builds in a temporary folder, copies the app to `~/Applications`, then deletes the build copy. It also deletes an old `Morning Tab.app`, the name of this project before version 0.2.

### 2. Turn it on in Safari (about 5 minutes)

1. Open **Safari → Settings → Advanced**. Select **Show features for web developers**.
2. Open **Develop → Developer Settings…**. Select **Allow unsigned extensions**. Your build is not notarized, so Safari needs this setting.
3. Open **Settings → Extensions**. Select **Your Edition**.
4. Click **Always Allow on Every Website…**. Your Edition needs this access to reach your AI provider and to read the pages that it summarizes.
5. Open **Settings → General**. Set **New tabs open with** to **Your Edition**.
6. Open a new tab.

> [!WARNING]
> Safari clears **Allow unsigned extensions** each time Safari quits. After each restart, do step 2 again, or **Your Edition** disappears from the extension list.

To sign and notarize your own builds with your own Apple Developer ID, see [Sign your own builds](#sign-your-own-builds-optional). Then Safari does not need **Allow unsigned extensions**.

### Update to version 0.3

From version 0.3, the edition is a plain HTML page that runs no code. Your last edition from an older version is React code, so the new tab asks you to build once. Click **Build a new edition**.

### Upgrade from Morning Tab

Morning Tab is the name of this project before version 0.2. After the upgrade, Safari treats Your Edition as a new extension, with empty storage.

1. Before you upgrade, open **⚙️ Settings → Improve this tab** in Morning Tab and click **Export my visit log**. If you already upgraded, skip this step.
2. Install Your Edition. The install script deletes the old `Morning Tab.app`.
3. In **Safari → Settings → Extensions**, turn on **Your Edition**.
4. Open a new tab. Enter your API key again, and turn on the privacy filter again if you used it.
5. Optional: click **Import history…** and choose the file from step 1, or a Safari history export.

### If something goes wrong

| Problem | Cause | Fix |
| --- | --- | --- |
| **Your Edition** is not in the extension list | **Allow unsigned extensions** is off. Safari turns it off each time Safari quits. | Open **Develop → Developer Settings…** and select **Allow unsigned extensions** again. Then open **Your Edition.app** one time. |
| **Your Edition** shows 2 or more times | macOS has more than one copy of the app, for example from **Run** in Xcode | Delete every copy except the one in Applications. To find them, run the command below. |
| "Connection error." or "has no website access" | Safari has not given Your Edition website access | Click **Build today's edition** and allow access in the prompt. Or open **Settings → Extensions → Your Edition** and click **Always Allow on Every Website…**. |
| The build stays on **Preparing agent**, or says "Waiting for website access" | Safari has not given Your Edition website access, and its prompt did not show. A reinstall can reset this access. | Open **Settings → Extensions → Your Edition** and click **Always Allow on Every Website…**. Then click **↻ Rebuild**. |
| The privacy filter status says "not available" | Apple Intelligence is off or still downloading | See [The on-device privacy filter](#the-on-device-privacy-filter-optional). |
| Safari crashes during an install | Safari 27 crashes when it loads a replaced extension while it runs. This is a bug in Safari. | Quit Safari before you run `install:safari`. The command asks you to do this. |

To find every copy that macOS knows about, run this command:

```bash
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -dump | grep "^path:.*Your Edition"
```

## Build your first edition

1. Open a new tab.
2. Choose **Anthropic (Claude)** or **BharatCode**, and paste that provider's API key. For BharatCode, also choose the model: **qwen-3.8-27b** or **deepseek-v4.1-flash**. Click **Save key**.
3. Optional: select **On-device privacy filter**. Do this before the first build if you want no page content to leave your Mac. The status line shows if Apple Intelligence is ready.
4. Click **Build today's edition**.

The first build takes 3 to 5 minutes, or longer with the privacy filter. The progress view shows each step as the agent works.

**Keep a Your Edition tab open until the build finishes.** Safari can stop the extension's background work when no Your Edition tab is open. If Safari stops it, the build continues when the extension wakes, at most 3 times. It reuses the pages, and the privacy-filter summaries, from the last 2 hours.

> **Your first edition is thin.** Safari has no history for the agent to read (see below). To fix this now, [import your Safari history](#improve-this-tab-import-your-safari-history). Otherwise, the page gets better over the first few days.

## What leaves your Mac

Data leaves your Mac only during a build. It goes only to the model provider that you choose, with your own API key: Anthropic (the default) or BharatCode. See [Model providers](#model-providers).

A build sends:

- A summary of the sites you visit: top domains, visit counts and some page titles
- Up to 8 pages: the cleaned HTML, or only short summaries if the privacy filter is on

Safari loads those pages with your sign-ins, so they can contain private content. With Anthropic, Your Edition deletes the agent session and all uploaded pages when each build ends. BharatCode has its own retention rules (see below).

### The on-device privacy filter (optional)

The privacy filter is the main difference from the original extension. It is off by default. Turn it on before your first build, on the **Build your first edition** screen. After that, open **⚙️ Settings** and select **On-device privacy filter**.

| | Filter off (default) | Filter on |
| --- | --- | --- |
| What goes to the provider for each page | The cleaned HTML of the page | A list of items: a title, one sentence and the page's own link for each |
| Who reads the full page | The provider's model | Apple Intelligence, on your Mac |
| Personal details | The agent has an instruction to skip them | The on-device model leaves them out. Then a pattern check replaces emails, phone numbers and long numbers, such as card numbers, with a placeholder. |
| Page titles in the site summary | Sent as they are | Sent after the same pattern check |
| If Apple Intelligence is not ready | Not needed | The page is not sent. The build continues with the other data. |
| Needs | Nothing extra | A Mac with Apple silicon and Apple Intelligence turned on |

How it works:

1. The extension turns each page into plain text, with a number such as `[3]` for each link.
2. The Your Edition app gives the text to Apple's on-device model (the Foundation Models framework). The code is in [`PrivacyFilter.swift`](apps/safari/Your%20Edition/Your%20Edition%20Extension/PrivacyFilter.swift).
3. The model returns items with link numbers only. It never writes a URL.
4. The extension keeps only items whose number is a real link on the page. It builds the list from those links. The code is in [`privacy-digest.ts`](apps/extension/lib/privacy-digest.ts).

To turn on Apple Intelligence:

1. Open **System Settings → Apple Intelligence & Siri**.
2. Turn on **Apple Intelligence**. Make sure that the Siri language is the same as your Mac language.
3. Wait for the download to finish. Keep the Mac on Wi-Fi and power. The download can take 15 to 60 minutes.

**The filter is slow.** Apple's on-device model reads each page in up to 3 parts, one part at a time. One part takes 10 to 30 seconds, so the filter adds up to 1.5 minutes for each page. The activity log shows each part, for example "Privacy filter: page 2 of 3, part 1 of 3". If the on-device model does not answer within 2 minutes, Your Edition does not send that page and continues with the others.

The filter can miss a personal detail, and the pattern check catches only fixed formats. Use **Sites the agent never reads** for sites that you never want opened.

## Model providers

Your Edition can use 2 kinds of provider. Select one in **⚙️ Settings → Model provider**, then click **Save provider**.

| | Anthropic (Claude), the default | BharatCode |
| --- | --- | --- |
| Models | Claude Sonnet 5.5. There is no model choice. | Qwen 3.8 27B or DeepSeek V4.1 Flash (open models). You choose one. |
| Cost | Pay for each build, by tokens | A flat monthly fee: ₹399 (Qwen only) or ₹999 (both models) |
| How the agent runs | Claude Managed Agents: a session with a sandbox for the pages | A chat loop in the extension. The extension holds the pages in memory and answers the agent's file tools itself. |
| What happens to your data | Your Edition deletes the session and the uploaded pages after each build | BharatCode sends prompts to inference partners, some outside India. The Free and Lite plans may keep logs. See its [privacy policy](https://bharatcode.ai/privacy). |
| Page quality | Usually higher, because the model is larger | Can be weaker |
| Interrupted build | Resumes from the saved session. The new tab shows **Resume interrupted build**. | Starts again, with the pages from the cache |

**Your choice sticks.** Your Edition uses only the provider that you select. It never switches to the other one by itself. If an Anthropic build was interrupted and you then select BharatCode, Your Edition deletes that session and the pages uploaded to it.

**If you choose BharatCode, turn on the on-device privacy filter.** Then only short summaries of each page leave your Mac.

**Other providers.** The BharatCode option works with any API that follows the OpenAI chat-completions format and supports tool calls. In Settings, change **Base URL** and type the **Model** name. Your Edition sends requests to `<Base URL>/chat/completions`.

## How Safari is different from Chrome

**Short version:** Chrome lets an extension read your browsing history. Safari does not. So Your Edition on Safari keeps its own log of the pages you load, starting from the day you install it.

### Chrome and Safari side by side

| | Chrome | Safari |
| --- | --- | --- |
| Extension can read your past history | Yes, with the `history` permission | No. The `history` API does not exist in Safari. |
| What the agent ranks | Your real Chrome history (14 days by default) | Your Edition's own visit log (up to 30 days) |
| First edition | Full, from day one | Thin. It gets better over the first few days. |
| Notification when a background build fails | Yes | No. The error shows in your next new tab. |
| Install | Load the folder in `chrome://extensions` | Build a Mac app with Xcode. The app contains the extension. |
| On-device privacy filter | Not available | Optional. Uses Apple Intelligence on your Mac. |

### Why Your Edition cannot read your Safari history

1. **Safari has no history API for extensions.** Chrome and Firefox give extensions `browser.history`. Safari does not. Apple's [browser compatibility guide](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility) tells you to check each API, and Safari ignores APIs that it does not support. We checked the WebKit engine in Safari 27 on macOS 27. It has code for tabs, windows, scripting, storage and other APIs. It has no code for history.
2. **The permission does nothing.** If an extension asks for `history` in Safari, Safari ignores the request. The Safari build of Your Edition does not ask for it.
3. **Your Edition does not read Safari's history file.** Safari keeps your history in a file in your Library folder. macOS protects that folder. To read the file, an app needs **Full Disk Access**. That access lets an app read almost all of your files. Your Edition does not ask for it, because that is too much access for a new tab page.

Apple has not said publicly why Safari has no history API. Apple puts a strong focus on privacy, and that can be a reason. This is our guess, not a statement from Apple.

### Improve this tab: import your Safari history

You can give Your Edition your Safari history from before the install. The **Improve this tab** panel is on the first-build screen and in **⚙️ Settings**. It takes about 2 minutes:

1. In Safari, choose **File → Export Browsing Data to File…**.
2. Select only **History**, then save the file.
3. In Your Edition, click **Import history…** and choose that file (`.zip` or `.json`).

- Your Edition reads only `History.json` from the file. It never opens passwords or the other files in a Safari export.
- It keeps visits from the last 30 days, in the visit log on your Mac.
- Apple does not document this file format. Your Edition reads the fields that Chromium's Safari importer also reads: `url`, `title`, `time_usec` and `visit_count`.
- It also reads a Chrome history file from Google Takeout, and visit logs that Morning Tab (the old name) exported.

**Export my visit log** saves the visit log as a JSON file. You can import that file again later, for example on another Mac.

### What Your Edition does instead

Your Edition records the pages you load in Safari from the day you install it. The code is in [`visit-log.ts`](apps/extension/lib/visit-log.ts).

| The log does this | The log does not do this |
| --- | --- |
| Starts from the tabs that are open at install | Read the history Safari had before the install |
| Counts each page you load | Count pages in private windows |
| Deletes entries older than 30 days | Count the pages that Your Edition opens for a build |
| Stays in the extension's storage on your Mac | Sync to iCloud or to other devices |

For the first 3 days, the agent counts every site in the log, even sites with only one visit. After that, the agent ignores sites with fewer than 2 visits, the same as on Chrome.

To read pages, Your Edition opens a separate window. Chrome keeps that window behind your work. Safari can show it in front.

## Make it yours

**The default look** is a broadsheet front page, like the image at the top of this page. It has a "Your Edition" masthead, cream paper, thin rules, a lead story with a drop cap, and boxed side columns. The dateline names the edition that you read: morning, afternoon, evening or night. Headlines use Bodoni 72 and Didot. Text uses Iowan Old Style. It follows your Mac's light or dark appearance. To get a different look, describe it in **Instructions** (below).

Click **⚙️ Settings** on the new tab. It is also on the first-build screen. There are 5 settings.

**1. Instructions.** The agent uses your instructions in every build. Your instructions have priority over the agent's defaults. They control the content and the look.

| You write | You get |
| --- | --- |
| *"A dark magazine look. Huge headlines, short captions, one wide column."* | A magazine look |
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

**3. Model provider.** Select **Anthropic (Claude)** or **BharatCode or another OpenAI-compatible API**. Enter the key, then click **Save provider**. See [Model providers](#model-providers).

- If no build is running, the new choice applies from your next build.
- If a build is running, **Save provider** restarts it with the new provider or key. Pages read in the last 2 hours come from the cache, so only the model's work starts over.

**4. Rebuild automatically each morning.** This setting is on by default.

- The extension builds one edition each day, in the background.
- It builds the first time Safari is open between 5 AM and noon. If Safari is not open that morning, it skips that day.
- It starts only after your first manual build. It tries one time each morning at most.

**5. On-device privacy filter.** This setting is off by default. See [The on-device privacy filter](#the-on-device-privacy-filter-optional).

To rebuild now, click **↻ Rebuild** at the top right.

## Good to know

- **Cost.** With Anthropic, your key pays for each build. The cost depends on the quantity of text that the agent reads. BharatCode charges a flat monthly fee instead. To build only when you ask, turn off automatic rebuilds.
- **What the agent reads.** The agent ranks the sites you visit and opens up to 8 of them in each build. It skips search engines, webmail, banking and logged-out marketing pages.
- **Links are real.** Each link on your page comes from a page that the agent read. The agent has an instruction to never invent a URL. A click opens the site in the same tab. ⌘-click opens it in a new tab.
- **Updates.** Pull the new code with `git pull`, then run `npx pnpm@10.11.1 install:safari`.

## How it works

1. **`getHistory`**: the agent gets a ranked summary of the domains you visit most.
2. **`getPageHtml`**: the agent selects up to 8 pages. The extension opens them in a background window and cleans them. If the privacy filter is on, the extension replaces each page with its on-device summary.
3. **`grep` / `read`**: the agent finds headlines, posts and links in those pages.
4. **`write`**: the agent writes one static HTML page. The new tab shows it in a frame that runs no scripts.

The 2 browser tools (`getHistory` and `getPageHtml`) always run in the extension, because they need the visit log and Safari's tabs.

- **Anthropic:** the file tools run in the [Claude Managed Agents](https://docs.claude.com) sandbox. The sandbox has no shell access, because scraped pages are untrusted input.
- **BharatCode:** the extension keeps the pages in memory and answers the file tools itself. After the model reads a long result, later requests send a short note in its place, so each request stays small.

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
pnpm extension:test      # the built extension in headless Chrome

cp .env.example .env     # add ANTHROPIC_API_KEY, then:
pnpm agent:run           # a full build with the real API and test history
pnpm agent:verify        # check that the output renders
```

**Chrome.** The Chrome build still works and reads Chrome's real history. Run `npx pnpm@10.11.1 build`. In `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select `apps/extension/.output/chrome-mv3`.

### Sign your own builds (optional)

With a **Developer ID Application** certificate, `install:safari` can sign the app and have Apple notarize it. Then Safari does not need **Allow unsigned extensions**.

1. Copy `signing.local.env.example` to `signing.local.env`.
2. Run `security find-identity -v -p codesigning`. Copy the SHA-1 hash of your **Developer ID Application** certificate into `SIGN_IDENTITY`. Copy the team ID (the code in brackets) into `TEAM_ID`.
3. Make an app-specific password at [account.apple.com](https://account.apple.com) (**Sign-In and Security → App-Specific Passwords**).
4. Store it in your keychain with the command below. Then set `NOTARY_PROFILE=your-edition-notary` in `signing.local.env`.
   `xcrun notarytool store-credentials your-edition-notary --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID`
5. Quit Safari. Run `npx pnpm@10.11.1 install:safari` again. Notarization adds 2 to 5 minutes.

Git ignores `signing.local.env`, so your certificate details stay on your Mac. The password stays in your keychain. The script uses only the profile name.

## Releases

Each push to `main` makes a new release automatically. The workflow is [`release.yml`](.github/workflows/release.yml).

1. It tags the next patch version, for example `v0.2.0`, then `v0.2.1`.
2. It builds the Safari and Chrome bundles.
3. It publishes a [GitHub release](https://github.com/nijanthan-dev/your-edition-safari-new-tab/releases) with the 2 bundles and a `SHA256SUMS.txt` file.

GitHub gives public repositories free minutes on its runners, so a release costs nothing.

| To do this | Do this |
| --- | --- |
| Release a new minor or major version | Set `version` in `apps/extension/package.json` above the latest tag, for example `0.3.0`. Then push. |
| Push without a release | Change only Markdown files or `docs/`. These pushes do not release. |
| Release again without a change | Run the **Release** workflow by hand on the **Actions** tab. |

> [!NOTE]
> The workflow can also build, sign and notarize the Mac app on a GitHub macOS runner. That step runs only when the maintainer adds signing secrets, which is not done yet (see [the note in Install](#install)). The secrets would be GitHub encrypted secrets. Nobody else could read them from the repository, the logs or the release, and workflows from fork pull requests never get them.

## Status

Your Edition is early and experimental. It is a tool that you run with your own key.

Do not publish it to a store in its current form. Any person with access to your browser profile can read the stored API key.

## Credits and license

Your Edition uses the code of [AI Homepage](https://github.com/ThariqS/ai-newtab) by [Thariq Shihipar](https://github.com/ThariqS). Thank you, Thariq, for building it and for releasing it under MIT.

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
