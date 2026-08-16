# omdsh-justchat

English | [中文](README.zh.md)

Chat mode for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI: start talking without choosing a project directory, and keep those conversations together under **Chat** in the sidebar.

The harness is a coding agent, and its New Session screen asks for a workspace before it will take a message — reasonably, because a coding agent works somewhere. But not every question is work. This plugin adds the other posture beside it: a **Chat / Work** switch above the conversation, a managed workspace that chat conversations live in, and an agent composition with no tools at all behind them.

## What it adds

| Surface | Where it comes from |
|---|---|
| The **Chat** and **Work** segments in the mode switch | Two registrations in `sessionModes`, the segment registry [omdsh-base](https://github.com/omdsh-plugins/omdsh-base) publishes |
| A line stating what a chat session will not do, above the composer | An entry in `conversation.input.dock` |
| A preset chip on the new-session screen offering what the mode can use | An entry in `conversation.hero.agentPreset`, shadowing the shipped chip |
| The **Chat** workspace group in the sidebar | A real directory (`<dshHome>/sessions/chat`) this plugin registers and keeps titled `Chat` — the sidebar renders it like any other workspace |
| The **Chat Mode** agent preset | `agent-presets/chat/`, installed once into `<dshHome>/.agent-presets/` |
| The green and blue dots on those conversations in the sidebar | The `tone` and `owns` these two segments carry; the dots themselves are painted by [omdsh-base](https://github.com/omdsh-plugins/omdsh-base) for whatever modes are registered |

**Nothing in the harness is modified.** This package is a profile *bundle*: `dsh plugin` installs it into a profile and appends it to that profile's layer stack, so its one loader row is composed over the shipped tree. Removing the plugin removes the row, both surfaces, both segments, and every seam it used.

## The mode is derived, not stored

A session is a chat exactly when it is accounted under the managed Chat workspace. The switch reads that and reports it, which is why opening a conversation from the sidebar moves the switch: it is describing where the current session lives, not deciding it. A stored flag would eventually disagree with the screen.

Pressing a segment is therefore a navigation rather than a state write:

- **Chat** — reopen the chat you left, or start one in the Chat workspace.
- **Work** — reopen the working conversation you left, else start one in the first project workspace, else fall back to the shipped "Choose workspace" screen.

Because the mode is derived, **every navigation re-asserts it** — including one that lands in the same mode. Opening a second working conversation looks like nothing happening from a "work → work" reading, but it is the user saying which conversation they want to see, and a contributed posture may be holding the column over it. Re-deriving on the navigation is what hands that column back.

With one exception: a conversation **another mode owns** is that mode's to report. Taking the column on its navigation would only have it taken back a moment later, once the owner answers the same event — a flicker of the wrong column, and whatever that mode was showing torn down and rebuilt for nothing. A *press* is never that: pressing Work on a Code conversation is asking to read it in the web view, which is a change of column with no change of conversation, and the only thing that could say so is the press itself.

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

Routing that request is [omdsh-base](https://github.com/omdsh-plugins/omdsh-base)'s job, not this package's. What is this package's is hearing about the case with nothing to derive from: **New Session** reuses the workspace's existing blank conversation, so pressing it while already on that conversation opens the id that is already open — no selection moves, no list changes, no store publishes. The registry announces the passthrough (`onNewSession`) and this package re-derives on it. Without that, a person in a contributed posture presses New Session and the screen does not change.

A blank chat session is put on the `chat` preset through the agent-preset RPC — once per session, and only while it is still blank, because the host refuses the swap after a turn has run and because a user who deliberately picks another preset for a chat should keep it.

## The switch is not this package's

Chat and Work are two segments among however many the profile composed. The control they sit in, the registry they register through, and the coloured dots their conversations get in the sidebar all belong to [omdsh-base](https://github.com/omdsh-plugins/omdsh-base) — including the rule that exactly one segment is active, which is what lets pressing **Code** clear these two.

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

**Neither companion plugin is required, and neither appears in a top-level `inject`.** Without [omdsh-base](https://github.com/omdsh-plugins/omdsh-base) there is no switch for a segment to appear in, so the two pills are simply not there — the dock note, the preset chip, and the derived mode itself go on working, because they read where the current session lives rather than the switch. Without [omdsh-shortcuts](https://github.com/omdsh-plugins/omdsh-shortcuts) the segments' tooltips name no key: this package binds nothing and registers no command, it only appends the chord that plugin reports for `mode.chat` and `mode.work` when one reaches this surface. Both services are reached from restricted fibers started inside `apply` — which is what keeps a missing companion from leaving a loader entry `pending` and failing the page's boot sweep, a dead UI rather than a missing segment.

## The preset chip belongs to the mode

The deployment's preset roster is one list, the same in every workspace. A picker built straight on it offers **Chat Mode** while the user is in a project, and offers four coding compositions while the user is in the Chat workspace. Neither is a choice worth making: Chat mode *is* the tool-free composition, and a project session put on it could not touch the project.

So this plugin takes the chip and filters the roster by mode:

- **Work** — every preset except `chat`, as a menu, which is the shipped chip minus the one row a project session cannot use.
- **Chat** — a plain label reading the preset's name. The mode already decided; a menu with one row is a control that does nothing.

It also re-derives what it shows whenever the current session changes, so moving between workspaces reports *that* session's composition rather than the one you left.

Taking the seat is done with the slot system's own rule rather than around it. `conversation.hero.agentPreset` is a `single` cell, and a single cell goes to the **lowest priority**, so this package registers at `priority: -1` over `ui-agent-preset`'s default `0`. Nothing is unregistered: withdrawing this plugin's row hands the seat straight back to the shipped chip. ([hero-seat-shadow.client.spec.ts](https://github.com/omdsh-plugins/omdsh-justchat/blob/HEAD/tests/hero-seat-shadow.client.spec.ts) drives that against the real registry, including the collision a same-priority registration would throw.)

Preset **names** still come from the harness. It ships its four presets with Chinese metadata on disk and localizes them in the browser, out of the `settings.agentPreset` dictionary `ui-agent-preset` registers — so this chip reads that dictionary at call time instead of copying it. A locally authored preset is never translated: its file is its copy. Where the dictionary is absent (a composition without `ui-agent-preset`), the lookup echoes its key back and the chip falls back to file metadata rather than showing a locale key.

The chip is the only part of that screen this package owns. The blank-chat hero around it is still the shipped one, and the harness publishes no seam for the rest of it; upstream it would be two small additions — a chain around the hero's intent surface, and a way for whoever draws it to own the composer's call to action.

## The chat agent

`agent-presets/chat/agent.cordis.yml` is defined by what it does **not** mount: no `bash`/`pwsh`, no filesystem read/write/search, no editor, no skills, no subagents, no workflows, no plan mode, no todo. The web surface disables every agent-plane row in its own host composition, so absence here is real absence — a chat session composes no tool catalog and cannot touch the host. It keeps a persona, context compaction, and `ask_user`.

That is what makes running in a directory the user never chose safe: there is nothing in the session that can reach it.

That persona is the complete system prompt: no tool guidance, no runtime context snapshot, and an explicit instruction to say so rather than pretend when a request needs a repository. Nothing else this package ships reaches a model request — it assembles no provider request of its own, and the preset it installs shortens one, because an agent with no tools sends no tool catalog.

## Install

```sh
dsh plugin --profile web add @omdsh-plugins/omdsh-justchat
dsh plugin --profile web add @omdsh-plugins/omdsh-base       # the switch its segments appear in
```

That second line is not optional decoration: without [omdsh-base](https://github.com/omdsh-plugins/omdsh-base) there are no **Chat** and **Work** pills at all. Everything else this package does goes on working — ["The switch is not this package's"](#the-switch-is-not-this-packages) says exactly what is and is not there in that state, and why it is inert rather than fatal.

`dsh plugin` forwards to pnpm in `$DSH_HOME/profiles/web`, then reconciles that profile's `dsh.profile.bundles` against what is installed: this package declares `dsh.bundle`, so it joins the layer stack automatically. On the next boot the host half creates `<dshHome>/sessions/chat`, registers it as the `Chat` workspace, and installs the `chat` preset.

**Either way, `lib/` must exist before `dsh web` runs.** The loader imports `lib/index.js` directly, and a missing one is not a degraded UI — the whole profile tree fails to load:

```
dsh: plugin tree failed to load: ... failed to import loader entry justchat
(@omdsh-plugins/omdsh-justchat): Cannot find module '.../lib/index.js'
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
dsh plugin --profile web add github:omdsh-plugins/omdsh-justchat#<commit>
```

The first attempt **fails**: pnpm ≥10 refuses to run a git dependency's `prepare` until you allow the package by name. Add it to the profile's own `pnpm-workspace.yaml` (`$DSH_HOME/profiles/web/pnpm-workspace.yaml`, which `dsh` writes with `packages: - .`, `nodeLinker: hoisted`, `autoInstallPeers: false`):

```yaml
allowBuilds:
  '@omdsh-plugins/omdsh-justchat': true
```

then re-run the `add`, and `dsh web`. That entry authorizes this package to run install-time code on your machine — here, `tsc` and `tsdown` — so pin a commit rather than tracking a branch, and read the diff before moving the pin.

Remove it the same way:

```sh
dsh plugin --profile web remove @omdsh-plugins/omdsh-justchat
```

The chat directory, its session logs, and the preset are left on disk — removing a plugin is not a request to delete conversations.

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

- **Search results carry no dot.** They are a two-line stack, so a leading dot would take a line of its own instead of sitting in front of the title; the second line already names the workspace.
- **The blank-chat screen is the shipped one.** It still shows the workspace chip (reading `Chat`) and the shipped headline and composer placeholder ("Describe what you want to build"), which is written for work. The harness publishes no seam for either, and this package deliberately does not reach into another plugin's DOM to fake one.
- **The switch is centred by measurement.** It rides the frame-wide overlay layer and finds the conversation column through the published `data-conversation-scroll` attribute; a deployment whose centre column is some other plugin's gets a frame-centred switch instead. A switch that has not been measured yet is also one that never parks: with no zone to be revealed from, taking it away would be taking it for good.
- **A pointer already sitting in the reveal zone is not seen until it moves.** The zone is tested on pointer movement, and a pointer that has not moved since the page loaded has reported nothing — so the switch parks on schedule, and the first small move brings it straight back. Polling the cursor position is the only alternative, and it costs more than the case is worth.
- **The Chat workspace is found by its title.** The host half re-asserts `Chat` on every boot, so renaming it in the sidebar does not survive a restart. That title is the group heading the product shows, which is what makes matching on it a product fact rather than a hidden coupling — but a second workspace a user titles `Chat` would shadow it.
- **A refused preset swap is silent.** If the `chat` preset is missing (its directory was deleted from `<dshHome>/.agent-presets/`), the session runs on the deployment default — a chat with tools — and only a console diagnostic says so.
- **The preset's picker copy follows the UI language on a delay.** The harness will not localize it: `ui-agent-preset` resolves a locale key only for shipped presets whose id is in its built-in table (`presetDisplayText`, gated on `trust === 'system'`), explicitly "without making user-authored metadata translatable", and a preset in the writable root carries `trust: user`. So the host half writes `preset.yml` in ONE language — the web UI's, read from the `locale` settings namespace and rewritten on `settings/updated` — and every surface naming it shows the new text on its **next page load** rather than immediately: a roster is read on mount, and the rewrite lands on the host after the browser has already applied the language, so re-reading on `locale/change` would be a race rather than a fix. With no explicit UI preference the host falls back to its own `$LANG`. A `preset.yml` a person edited is never rewritten.
- **`Chat Mode` is still listed in Settings.** The mode filters the *chip*; the agent-preset settings section is another plugin's surface and lists every preset the deployment supplies, this one included. That is arguably right — it is where a preset is inspected, copied, and deleted — but it does mean the name appears outside the Chat workspace in one place.
- **Owning the chip means not inheriting its improvements.** The shadowed chip's introduce animation (the settings section's "draft a preset with Creator mode" entry stages a pick and announces it on the next session) is not reproduced here; the pick still lands, it just arrives without the flourish. Anything the harness later adds to that chip stops reaching this deployment until this package follows.
