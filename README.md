# omdsh-chatmode

English | [中文](README.zh.md)

Chat mode for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI: start talking without choosing a project directory, and keep those conversations together under **Chat** in the sidebar.

The harness is a coding agent, and its New Session screen asks for a workspace before it will take a message — reasonably, because a coding agent works somewhere. But not every question is work. This plugin adds the other posture beside it: a **Chat / Work** switch above the conversation, and a managed workspace that chat conversations live in.

Where the conversation lives is the whole of it. A chat runs the same agent a working session does — the deployment's default preset, **Standard mode** unless the deployment says otherwise — and the harness's own chip on the new-session screen is where a reader picks a different one. See [What a chat runs](#what-a-chat-runs).

## What it adds

| Surface | Where it comes from |
|---|---|
| The **Chat** and **Work** segments in the mode switch | Two registrations in `sessionModes`, the segment registry [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) publishes |
| The **Chat** workspace group in the sidebar | A real directory (`<dshHome>/sessions/chat`) this plugin registers and keeps titled `Chat` — the sidebar renders it like any other workspace |
| That group staying the **first** one, however many projects you open | The host half puts it first at boot; the browser half holds it there — see [Chat stays on top](#chat-stays-on-top) |
| The green and blue dots on those conversations in the sidebar | The `tone` and `owns` these two segments carry; the dots themselves are painted by [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) for whatever modes are registered |

**Nothing in the harness is modified.** This package is a profile *bundle*: `dsh plugin` installs it into a profile and appends it to that profile's layer stack, so its one loader row is composed over the shipped tree. Removing the plugin removes the row, both segments, and every seam it used. It takes no seat in the conversation view at all.

## The mode is derived, not stored

A session is a chat exactly when it is accounted under the managed Chat workspace. The switch reads that and reports it, which is why opening a conversation from the sidebar moves the switch: it is describing where the current session lives, not deciding it. A stored flag would eventually disagree with the screen.

Pressing a segment is therefore a navigation rather than a state write:

- **Chat** — reopen the chat you left, or start one in the Chat workspace.
- **Work** — reopen the working conversation you left **in the project you are in**, else that project's most recent one, else start one there. See [Switching stays in the project you are in](#switching-stays-in-the-project-you-are-in).

Because the mode is derived, **every navigation re-asserts it** — including one that lands in the same mode. Opening a second working conversation looks like nothing happening from a "work → work" reading, but it is the user saying which conversation they want to see, and a contributed posture may be holding the column over it. Re-deriving on the navigation is what hands that column back.

With one exception: a conversation **another mode owns** is that mode's to report. Taking the column on its navigation would only have it taken back a moment later, once the owner answers the same event — a flicker of the wrong column, and whatever that mode was showing torn down and rebuilt for nothing. A *press* is never that: pressing Work on a Code conversation is asking to read it in the web view, which is a change of column with no change of conversation, and the only thing that could say so is the press itself.

## Switching stays in the project you are in

Pressing a segment moves between ways of looking at one project, not between projects. So the question Work asks first is *which project is on screen* — and the answer is not the selected conversation's.

It cannot be: a posture whose column is not the web conversation shows a project **without selecting anything in it**. Code mode's terminal is exactly that, deliberately — a Code conversation is shown, never selected, because selecting one is what makes this host resume a log another process owns. So while you look at a terminal in project B, the runtime's selection is still whatever you had open in project A, and a Work that read the selection took you back to A.

The project on screen is `sessionModes.column`, which [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) publishes for exactly this class of question. With one in hand, every answer stays inside it: the conversation last left there, else its most recent one, else a new one started there — never another project's, however recently it was open.

Two exclusions decide "its most recent one":

- **Conversations another posture claims.** Opening a Code conversation shows a terminal, which would put the column straight back into the mode the press was leaving. The registry answers this (`modeOf`), so it stays right as modes are added.
- **Blank ones, unless they are all there is.** A blank conversation is recent because it was *created* recently, not because anything was said in it, and a project collects them — one per New Session pressed and walked away from. When the project has nothing else, the blank IS its New Session row and opening it beats starting another beside it.

A chat is a column in no project of its own, and this package says so: its Chat segment declares `inProject: false`, which is the registry's own way of asking "does this mode file its conversations somewhere a person works". Only the plugin that keeps that directory can answer it, and answering keeps "which of these is Chat" out of every other plugin — [omdsh-codemode](https://github.com/omdsh-plugins/omdsh-codemode) reads it to know that pressing Code beside a chat means coming back to where Code was, not opening a terminal inside the folder chats are filed in.

Only a column in no project of its own falls through to the memory that spans projects: a chat, or a page with no mode system at all. "Which project am I in" has no answer there, and "take me back to work" does.

## New Session belongs to the mode it was pressed in

**New Session** means "another conversation like this one", and what that *is* differs by posture. So the request is offered to the segment holding the column before the frame handles it:

```ts
modes.register({
  id: 'code',
  // …
  // Return true to say "I started it"; the column stays where it is.
  newSession: (workspaceId) => startAnotherTerminal(workspaceId),
})
```

A mode that answers keeps the column, which is what makes New Session stay in the mode the user is in rather than dropping them back into Work. A mode that declines — or has no answer, which is Chat and Work — gets the frame's own New Session, and gives the column up with it. The request is never offered *during* a press: entering a mode with nothing to return to starts a session too, and that runs while the mode being left is still the active one.

Routing that request is [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode)'s job, not this package's. What is this package's is hearing about the case with nothing to derive from: **New Session** reuses the workspace's existing blank conversation, so pressing it while already on that conversation opens the id that is already open — no selection moves, no list changes, no store publishes. The registry announces the passthrough (`onNewSession`) and this package re-derives on it. Without that, a person in a contributed posture presses New Session and the screen does not change.

## The switch is not this package's

Chat and Work are two segments among however many the profile composed. The control they sit in, the registry they register through, and the coloured dots their conversations get in the sidebar all belong to [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) — including the rule that exactly one segment is active, which is what lets pressing **Code** clear these two.

This package reaches that switch the same way any other mode plugin does:

```ts
// Never in a top-level `inject` — see rule 9 of the conventions. Without the
// mode system there is no switch for a segment to appear in, and everything
// else on this page keeps working.
ctx.inject(['sessionModes'], (mctx) => {
  const modes = mctx.get('sessionModes') as SessionModes | undefined
  if (modes === undefined) return
  mctx.effect(() => modes.register({ id: 'chat', order: 0, tone: CHAT_TONE, /* … */ }))
})
```

Chat and Work stay derived from where the current session lives, so opening a conversation from the sidebar still moves the switch, and pressing either takes the column back from whatever had it. `owns` is what each answers for itself: Chat claims the conversations accounted under the managed workspace, and Work is marked `fallback` — "a conversation in a project" is what one is when nothing more specific is true.

**Neither companion plugin is required, and neither appears in a top-level `inject`.** Without [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) there is no switch for a segment to appear in, so the two pills are simply not there — the Chat workspace, its pin, and the derived mode itself go on working, because they read where the current session lives rather than the switch. Without [omdsh-shortcuts](https://github.com/omdsh-plugins/omdsh-shortcuts) the segments' tooltips name no key: this package binds nothing and registers no command, it only appends the chord that plugin reports for `mode.chat` and `mode.work` when one reaches this surface. Both services are reached from restricted fibers started inside `apply` — which is what keeps a missing companion from leaving a loader entry `pending` and failing the page's boot sweep, a dead UI rather than a missing segment.

## What a chat runs

The deployment's default preset — **Standard mode**, unless the deployment ships something else — and whatever the reader picks instead, from the harness's own chip on the new-session screen. This package does not touch the composition, and takes no seat on that screen.

It used to do both, and the shape of what it did is why it stopped. Earlier versions installed a tool-free `chat` composition, put every blank chat session on it through the agent-preset RPC, and shadowed the shipped chip so the roster could be filtered by mode: everything except `chat` in Work, and in Chat a plain label, because the mode had already decided. That made **where a conversation lives** decide **what it can do**, which is one fact too many for a workspace to carry. Asking a question outside a project is not the same as asking for an assistant with no hands, and the two were welded together — with no way to have the first without the second short of leaving the mode.

So the mode is now what it says on the pill, and the harness's chip is a real choice again in both of them.

### The retired preset is taken back

A preset lives in `<dshHome>/.agent-presets/`, which is **shared by every surface the deployment composes**. A `chat` directory left there would go on being listed in the settings panel and in the terminal surface's `/mode` — a mode this product no longer has, offered by a plugin that no longer means it. So the host half removes it on every boot, and that is the whole of the migration: nothing to run, nothing to read.

That root is also where a person authors their own compositions, and this package put a directory in it uninvited. So the removal is guarded by **content, not by a marker**: it takes back only a directory whose every file is byte-identical to a copy this package installed — the one composition it shipped, and the picker metadata it wrote beside it, in both languages and under both names this plugin has had (`omdsh-justchat` stamped its own name into that file's header). Anything else — an edited composition, a rewritten `preset.yml`, a file added next to them — is left exactly as it is, and editing the composition is how a person keeps it. The recognized copies are checked in under [tests/fixtures](tests/fixtures), which is what keeps the hashes honest against the releases.

`<dshHome>/sessions/chat` and its session logs are never touched. A chat that ran under the old composition keeps its history; only what the *next* session composes changes.

## Chat stays on top

The **Chat** group is the first one in the sidebar, and stays first for as long as the plugin is installed. It is the group with no project behind it — the one a person reaches for when the question is not about a repository — so having it drift down the list as projects accumulate would put the least specific thing behind the most specific ones.

It takes both halves, because the fact is undone in two different ways.

The host half asserts it at boot: `workspaceRegistry.create` is idempotent per directory, so the pin is a separate `insertBefore` beside the title re-assertion. That is what the first render is owed, before any browser has attached.

Opening a project is the other way, and it happens **after** boot: `create` PREPENDS a new workspace, so each directory added pushes Chat down one place while the app is running. The registry publishes no event to hook, so the browser half reconciles instead — it is already told about every workspace the sidebar draws, because it draws them from that list, and the sidebar's group order *is* the registry order. When Chat is not the first row it asks the host to move it back, through the same `insertBefore` the drag-to-reorder gesture calls. The correction is therefore durable and shared: it is written to the registry, not painted over one tab. See [pin.ts](src/client/pin.ts).

Two things follow from that, and both are deliberate:

- **It outranks a drag.** Dragging the Chat group down the sidebar puts it back. That is the same trade the title makes — the host half re-asserts `Chat` over a rename — and for the same reason: both are facts this plugin manages, not the user's arrangement of their own projects.
- **[omdsh-sidechat](https://github.com/omdsh-plugins/omdsh-sidechat) is pinned by the same act.** A standalone side conversation is accounted under this same managed workspace (it finds it by the title, as everything here does), so its conversations sit in the group this keeps on top. That package needs to know nothing about any of it.

## Install

```sh
npx @omdsh-plugins/omdsh-plughub add omdsh-chatmode
```

That is the [plugin hub](https://github.com/omdsh-plugins/omdsh-plughub)'s
installer with argv where the button was. It resolves this plugin from the
collection's [registry](https://github.com/omdsh-plugins/registry), installs it
from its GitHub repository, and writes the pnpm build-allowlist entry a bare
`dsh plugin add github:…` would leave to you — the entry carries the commit pnpm
resolved, so it can be copied out of a failure and never written down in
advance.

`dsh plugin --profile web add @omdsh-plugins/omdsh-chatmode` is **not** that command yet:
this package is not on npm, and pnpm answers `ERR_PNPM_FETCH_404`. The same
install is also a button, on this plugin's card in **Settings → Plugins → Plugin
hub**, once the hub itself is in the profile.

[omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) — the switch its
segments appear in — is published, so that one installs by name:

```sh
dsh plugin --profile web add @omdsh-plugins/omdsh-basemode
```

That second install is not optional decoration: without [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) there are no **Chat** and **Work** pills at all. Everything else this package does goes on working — ["The switch is not this package's"](#the-switch-is-not-this-packages) says exactly what is and is not there in that state, and why it is inert rather than fatal.

`dsh plugin` forwards to pnpm in `$DSH_HOME/profiles/web`, then reconciles that profile's `dsh.profile.bundles` against what is installed: this package declares `dsh.bundle`, so it joins the layer stack automatically. On the next boot the host half creates `<dshHome>/sessions/chat`, registers it as the `Chat` workspace, and takes back the `chat` preset an earlier version installed.

**Either way, `lib/` must exist before `dsh web` runs.** The loader imports `lib/index.js` directly, and a missing one is not a degraded UI — the whole profile tree fails to load:

```
dsh: plugin tree failed to load: ... failed to import loader entry chatmode
(@omdsh-plugins/omdsh-chatmode): Cannot find module '.../lib/index.js'
```

### From a local path or `link:`

pnpm does **not** run a linked or path-installed package's `prepare`, so nothing builds it for you. Build first:

```sh
pnpm install
pnpm run build                                          # required — nothing else runs it

dsh plugin --profile web add <path-to-this-directory>
dsh web
```

Rebuild after every source change, for the same reason.

### From GitHub

A git dependency builds itself through `prepare`, which this package supports: its committed `@deepseek-ai/*` devDependencies name the published harness release, so a bare clone can install and compile.

```sh
dsh plugin --profile web add github:omdsh-plugins/omdsh-chatmode#<commit>
```

The first attempt **fails**: pnpm ≥10 refuses to run a git dependency's `prepare` until the package is allowed. Both pnpm and `dsh` print the entry to add, and it is the **whole specifier** — the tarball URL pnpm resolved the commit to — rather than the package name. Add it to the profile's own `pnpm-workspace.yaml` (`$DSH_HOME/profiles/web/pnpm-workspace.yaml`, which `dsh` writes with `packages: - .`, `nodeLinker: hoisted`, `autoInstallPeers: false`):

```yaml
allowBuilds:
  '@omdsh-plugins/omdsh-chatmode@https://codeload.github.com/omdsh-plugins/omdsh-chatmode/tar.gz/<sha>': true
```

then re-run the `add`, and `dsh web`. **The bare package name is not enough once an attempt has been refused.** `'@omdsh-plugins/omdsh-chatmode': true` is honoured only if it is in the file *before* the first `add`; added afterwards it fails with the same `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`, which reads as the remedy not working. Copy the key from the error rather than shortening it.

Installing from the hub avoids the whole exchange: it writes the entry before the first attempt and retries with the exact key when pnpm asks for one.

Either key authorizes this package to run install-time code on your machine — here, `tsc` and `tsdown` — so pin a commit rather than tracking a branch, and read the diff before moving the pin. The URL form pins it twice over: it is a decision about one revision, not a standing permission.

Remove it the same way:

```sh
dsh plugin --profile web remove @omdsh-plugins/omdsh-chatmode
```

The chat directory and its session logs are left on disk — removing a plugin is not a request to delete conversations. The workspace stops being re-titled and re-pinned, and stays in the sidebar as an ordinary one.

## Commands

```sh
pnpm install
pnpm run build       # tsc emits lib/types, tsdown bundles both halves
pnpm run typecheck   # package sources, then the specs
pnpm run test        # vitest — requires local mode, see below
```

Which harness this package compiles against is a switch:

```sh
pnpm run harness:npm                             # the committed state: the pinned release
pnpm run harness:local ../../deepseek-harness    # a sibling checkout, for development
pnpm run check:harness-pin                       # fails while any dependency is linked
```

A development round trip is those two sets interleaved:

```sh
pnpm run harness:local ../../deepseek-harness && pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run harness:npm && pnpm install   # before committing
```

## Two harness sources

The switch above is the shape [`omdsh-desktop`](https://github.com/omdsh-plugins/omdsh-desktop) uses for the same problem, and it exists because the two sources are not interchangeable.

**Only the registry state may be committed.** A `link:` specifier is resolved against the manifest that declares it, so a committed one bakes one machine's directory layout into the package — and pnpm does not fail loudly when it is wrong: it creates a dangling symlink, reports a successful install, and the build dies later with `TS2307` on every harness import. It would also break `prepare` for everyone installing by git URL. `check:harness-pin` exists to catch that before a commit.

Local mode needs the checkout installed and built (`pnpm run build` there) — pnpm does not install a linked package's own dependencies.

`pnpm run test` requires local mode. A published harness package ships `lib/` and `.d.ts` but no sources, and its browser half is a loader bundle that expects `window.__ModuleLoader__` — nothing a test runner can import. Types are all the *compiler* needs, which is why the registry state still builds; the specs alias those specifiers to real sources and say so if they cannot find any.

The browser half is bundled as a loader artifact (`lib/client.js`) exactly as the harness's own client packages are: platform modules stay external and resolve through the shell's frozen module table, everything else inlines, and a purity gate fails the build on a cross-plugin value import. Rebuild it before probing a live `dsh web` — the registry serves `lib/client.js`, not sources.

## Known limitations

- **The project memory is per tab, and per run.** Which conversation you left in each project is held in the page, not written down — a reload starts from each project's most recent conversation instead. That is the same trade the derived mode makes: nothing stored is nothing that can disagree with the screen.
- **Search results carry no dot.** They are a two-line stack, so a leading dot would take a line of its own instead of sitting in front of the title; the second line already names the workspace.
- **The blank-chat screen is the shipped one.** It still shows the workspace chip (reading `Chat`) and the shipped headline and composer placeholder ("Describe what you want to build"), which is written for work. The harness publishes no seam for either, and this package deliberately does not reach into another plugin's DOM to fake one.
- **The switch is centred by measurement.** It rides the frame-wide overlay layer and finds the conversation column through the published `data-conversation-scroll` attribute; a deployment whose centre column is some other plugin's gets a frame-centred switch instead. A switch that has not been measured yet is also one that never parks: with no zone to be revealed from, taking it away would be taking it for good.
- **A pointer already sitting in the reveal zone is not seen until it moves.** The zone is tested on pointer movement, and a pointer that has not moved since the page loaded has reported nothing — so the switch parks on schedule, and the first small move brings it straight back. Polling the cursor position is the only alternative, and it costs more than the case is worth.
- **The Chat workspace is found by its title.** The host half re-asserts `Chat` on every boot, so renaming it in the sidebar does not survive a restart. That title is the group heading the product shows, which is what makes matching on it a product fact rather than a hidden coupling — but a second workspace a user titles `Chat` would shadow it, and [the pin](#chat-stays-on-top) then reads that one and considers the order already right.
- **The pin corrects rather than prevents.** A workspace created while the app is open is prepended by the host, and Chat returns above it on the frame that reports it — so there is a moment, too short to sample in practice, where the new project is the first group. Preventing it would mean the host refusing the order it just wrote, and the registry offers no seam to hook a creation on.
- **A `chat` preset a person made their own is never removed.** That is the guard working — but it also means such a deployment goes on listing **Chat Mode** in Settings and in the terminal's `/mode`, and a session put on it still has no tools. Deleting `<dshHome>/.agent-presets/chat` is how that is finished, and it is deliberately a person's call rather than a plugin's.
- **A session already composed as a chat keeps that composition.** The host refuses a preset swap once a turn has run, and this package no longer asks for one either way. An old chat re-opened after the upgrade is still tool-free; the next one is not.
