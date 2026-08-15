# omdsh-justchat

[English](README.md) | 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面加一个聊天模式：不用选项目目录就能开始对话，这些对话统一放在侧栏的 **Chat** 下面。

Harness 是编码 Agent，新建会话时要先选工作区——这本身是合理的，编码 Agent 总得在某个目录里干活。但不是每个问题都是活。这个插件在它旁边补上另一种姿态：会话上方的 **Chat / Work** 切换、一个专门存放聊天记录的托管工作区，以及背后一个完全不挂工具的 Agent 组合。

## 它加了什么

| 界面 | 挂在哪 |
|---|---|
| 模式开关里的 **Chat** 与 **Work** 两个分段 | 向 [omdsh-base](https://github.com/omdsh-plugins/omdsh-base) 发布的分段注册表 `sessionModes` 的两次注册 |
| 输入框上方一行说明「这个会话不会做什么」 | `conversation.input.dock` |
| 新建会话页上、只给出当前模式用得上的预设的那枚 chip | `conversation.hero.agentPreset`，遮住出厂的那枚 |
| 侧栏里的 **Chat** 分组 | 一个真实目录（`<dshHome>/chat`），由本插件注册并始终保持标题为 `Chat`，侧栏把它当普通工作区渲染 |
| **Chat Mode** Agent 预设 | `agent-presets/chat/`，首次启动时装到 `<dshHome>/.agent-presets/` |
| 侧边栏里这些对话前面的绿点与蓝点 | 这两个分段携带的 `tone` 与 `owns`；圆点本身由 [omdsh-base](https://github.com/omdsh-plugins/omdsh-base) 为所有已注册的模式统一绘制 |

**不改 harness 的任何一行。** 这个包本身是一个 profile *bundle*：`dsh plugin` 把它装进 profile 并追加到该 profile 的层栈，它那一行 loader 记录就叠在出厂的树之上。卸载插件，这一行、两个界面、两个分段、以及它用到的所有接缝一起消失。

## 模式是推导出来的，不是存下来的

一个会话「是聊天」当且仅当它记在托管的 Chat 工作区名下。切换按钮读的就是这件事——所以从侧栏点开一个会话，按钮会跟着动：它是在描述当前会话在哪，而不是在决定它在哪。存一个标志位，迟早会和屏幕上显示的对不上。

因此按下某一段是一次导航，而不是写状态：

- **Chat** —— 回到你上次离开的那个聊天，没有就在 Chat 工作区里新开一个。
- **Work** —— 回到你上次离开的工作会话，没有就在第一个项目工作区新开一个，再没有就退回出厂的「选择工作区」界面。

空白的聊天会话会通过 agent-preset RPC 切到 `chat` 预设——每个会话只做一次，且只在它还空白时做：会话跑过一轮之后 host 会拒绝切换，而用户如果自己给这个聊天挑了别的预设，那就该留着。

正因为模式是推导出来的，**每一次导航都会重新断言一遍**——包括那些落在同一个模式里的导航。从"work → work"的角度看，打开第二个工作对话像是什么都没发生，但那是用户在说他想看哪一段对话，而此时可能正有一个贡献进来的姿态占着会话列。在导航上重新推导，就是把那一列还回去的动作。

只有一个例外：**属于另一个模式的对话，由那个模式来报告**。在它的导航上把列抢过来，只会在片刻之后又被抢回去——因为它的主人也在回应同一个事件——中间那一帧是错的列，而那个模式正显示的东西会被拆掉重建一次，白费。**按下**分段从来不是这种情况：在一段 Code 对话上按 Work，是在要求用网页视图读它，这是换列而不换对话，而唯一能说明这一点的就是这次按下本身。

## New Session 属于它被按下时所处的那个模式

**New Session** 的意思是「再来一段和这个一样的对话」，而这个「一样」在不同姿态下并不相同。所以在框架处理之前，这个请求会先交给占着会话列的那个分段：

```ts
modes.register({
  id: 'code',
  // …
  // 返回 true 表示「我自己开了」，会话列就留在原处。
  newSession: (workspaceId) => startAnotherTerminal(workspaceId),
})
```

接下这个请求的模式会保住会话列——这正是「新建会话仍停留在当前模式」而不是被丢回 Work 的原因。拒绝的、或者压根没有这个答案的（Chat 与 Work 就是），走框架自己的 New Session，并连同会话列一起交出去。这个请求**永远不会在按下分段的过程中**被提出：进入一个没有旧对话可回的模式同样会新建会话，而那发生在被离开的那个模式还挂着 active 标志的时候。

把这个请求路由出去是 [omdsh-base](https://github.com/omdsh-plugins/omdsh-base) 的活，不是本包的。本包的活是**听到**那种没有东西可推导的情况：**New Session** 会复用该工作区已有的空白对话，所以当你已经在那段对话上时按它，打开的就是已经打开的那个 id——选择没动、列表没变、store 也不发布。注册表会把这条"落到框架"的路广播出来（`onNewSession`），本包据此重新推导。没有这一层，处在贡献姿态里的人按下 New Session，屏幕不会有任何变化。

## 这个开关不是本包的

Chat 和 Work 只是 profile 组出来的若干姿态中的两个。它们所在的那个控件、它们
注册进去的那个注册表、以及它们的对话在侧边栏里得到的彩色圆点，全都属于
[omdsh-base](https://github.com/omdsh-plugins/omdsh-base)——包括"同一时刻只有一个分段激活"这条规则，正是它
让按下 **Code** 能把这两个清掉。

本包够到那个开关的方式，和任何别的模式插件一模一样：

```ts
// 绝不写进顶层 inject —— 见约定第 9 条。没有模式系统时就没有开关可供分段出现，
// 而本页其余的一切照常工作。
ctx.inject(['sessionModes'], (mctx) => {
  const modes = mctx.get('sessionModes') as SessionModes | undefined
  if (modes === undefined) return
  mctx.effect(() => modes.register({ id: 'chat', order: 0, tone: CHAT_TONE, /* … */ }))
})
```

Chat 与 Work 依然是从"当前会话住在哪"推导出来的，所以从侧边栏打开一段对话仍然
会让开关跟着动，按下任意一个都会把会话列从占着它的那一方手里拿回来。`owns` 是
各自为自己作答的部分：Chat 认领记在托管工作区名下的那些对话，而 Work 标了
`fallback`——当没有更具体的说法成立时，一段对话就是"某个项目里的一段对话"。

**两个搭档插件都不是必需的，也都没有出现在顶层 `inject` 里。** 没有
[omdsh-base](https://github.com/omdsh-plugins/omdsh-base) 时就没有开关可供分段
出现，那两枚 pill 干脆不存在——输入框上方那行说明、预设 chip、以及推导出来的模式
本身照常工作，因为它们读的是"当前会话住在哪"，而不是开关。没有
[omdsh-shortcuts](https://github.com/omdsh-plugins/omdsh-shortcuts) 时，分段的
tooltip 只是不写按键：本包不绑定任何键、也不注册任何命令，只是在那个插件报出
`mode.chat` 与 `mode.work` 的快捷键时，把它接在提示后面。两个服务都是在 `apply`
内部启动的受限 fiber 里够到的——正是这一点，让缺一个搭档插件不至于把某条 loader
条目留在 `pending` 上、进而让整页的启动扫描失败：那会是一个死掉的界面，而不是少
一个分段。


## 预设 chip 归模式管

部署的预设名单只有一份，每个工作区看到的都一样。直接照着它做选择器，结果就是：人在项目里，选单里摆着 **Chat Mode**；人在 Chat 工作区，选单里摆着四套写代码的组装。两边都不是真的可选项 —— Chat 模式的定义本身就是那套无工具组装，而一个项目会话切到它就再也碰不到这个项目。

所以本插件把这枚 chip 接管过来，按模式过滤名单：

- **Work** —— 除 `chat` 以外的全部预设，仍是一个选单，也就是出厂那枚减掉项目会话用不上的那一行。
- **Chat** —— 一行纯文本，写着预设的名字。模式已经定死了组装，只有一行的选单是个什么也不做的控件。

它还会在当前会话变化时重新推导所显示的内容，所以在工作区之间切换时，读到的是**这个**会话的组装，而不是你刚离开的那个。

接管用的是插槽系统自己的规则，不是绕开它。`conversation.hero.agentPreset` 是 `single` 格，而 single 格归 **priority 最低**的那个，所以本包注册在 `priority: -1`，压过 `ui-agent-preset` 默认的 `0`。全程没有注销任何东西：撤掉本插件这一行，座位原样还给出厂的 chip。（[hero-seat-shadow.client.spec.ts](tests/hero-seat-shadow.client.spec.ts) 直接拿真实注册表跑了这套规则，包括同优先级注册会抛的那个冲突。）

预设的**名字**仍然由 harness 说了算。它出厂的四个预设在磁盘上写的是中文，再在浏览器侧按 `ui-agent-preset` 注册的 `settings.agentPreset` 词典本地化 —— 所以这枚 chip 是在调用时去读那本词典，而不是抄一份。用户自己写的预设永远不翻译：文件里写的就是它的文案。词典不在场时（组装里没有 `ui-agent-preset`），查询会把 key 原样回显，chip 于是回落到文件里的元数据，而不是把一个 locale key 显示给人看。

## 这个聊天 Agent

`agent-presets/chat/agent.cordis.yml` 的定义在于它**没挂**什么：没有 `bash`/`pwsh`，没有文件读写与检索，没有编辑器，没有 skills，没有子代理，没有 workflow，没有 plan 模式，没有 todo。Web 侧在自己的 host 组合里已经禁用了全部 agent-plane 行，所以这里的「没有」是真的没有——聊天会话根本不组装工具目录，碰不到 host。保留的是 persona、上下文压缩和 `ask_user`。

正因如此，让它跑在一个用户从没选过的目录里才是安全的：会话里没有任何东西够得着那个目录。

## 安装

`dsh plugin` 会在 `$DSH_HOME/profiles/web` 里转发给 pnpm，然后按已安装状态对账该 profile 的 `dsh.profile.bundles`：本包声明了 `dsh.bundle`，所以会自动加入层栈。下次启动时 host 侧会创建 `<dshHome>/chat`、把它注册成 `Chat` 工作区、并装好 `chat` 预设。

**无论哪种装法，`dsh web` 启动前 `lib/` 必须存在。** loader 直接 import `lib/index.js`，缺了不是界面降级，而是整棵插件树加载失败：

```
dsh: plugin tree failed to load: ... failed to import loader entry justchat
(@omdsh-plugins/omdsh-justchat): Cannot find module '.../lib/index.js'
```

### 本地路径 / `link:` 安装

pnpm **不会**为 link 或本地路径安装的包跑 `prepare`，没有任何环节替你构建。必须先自己构建：

```sh
pnpm install
pnpm run build                              # 必须——没有别的东西会跑它

dsh plugin --profile web add <本目录路径>
dsh web
```

同理，改完源码要重新构建。

### 从 GitHub 安装

git 依赖靠 `prepare` 自建，本包支持这条路：提交状态下 `@deepseek-ai/*` devDependencies 指向已发布的 harness 版本，裸克隆可以自己安装并编译。

```sh
dsh plugin --profile web add github:omdsh-plugins/omdsh-justchat#<commit>
```

第一次会**失败**：pnpm ≥10 默认拒绝跑 git 依赖的 `prepare`，要先按包名放行。写进该 profile 自己的 `pnpm-workspace.yaml`（即 `$DSH_HOME/profiles/web/pnpm-workspace.yaml`，`dsh` 初始化时写的是 `packages: - .`、`nodeLinker: hoisted`、`autoInstallPeers: false`）：

```yaml
allowBuilds:
  '@omdsh-plugins/omdsh-justchat': true
```

然后重跑 `add`，再 `dsh web`。这一条等于授权该包在你机器上执行安装期代码——这里是 `tsc` 和 `tsdown`——所以建议锁到具体 commit 而不是跟分支，换 pin 之前先看 diff。

### 卸载

```sh
dsh plugin --profile web remove @omdsh-plugins/omdsh-justchat
```

聊天目录、会话日志和预设都会留在磁盘上——卸插件不等于要删对话。

## 两种 harness 来源

对着哪个 harness 编译是一个开关，形状照搬 [`omdsh-desktop`](https://github.com/omdsh-plugins/omdsh-desktop) 解决同一问题的做法：

```sh
pnpm run harness:npm                             # 提交状态：锁定的已发布版本
pnpm run harness:local ../../deepseek-harness    # 同级检出，用于开发
pnpm run check:harness-pin                       # 只要还有 link: 就失败
```

**只有 registry 状态可以提交。** `link:` 是相对声明它的 manifest 解析的，提交一条就等于把某台机器的目录布局写死进包里——而且 pnpm 不会大声报错：它建出悬空符号链接、报告安装成功，然后构建阶段每个 harness import 都是 `TS2307`。它同时会让所有用 git URL 安装的人 `prepare` 失败。`check:harness-pin` 就是用来在提交前拦住这件事的。

local 模式要求那份检出自己已经装好并构建过（在那边 `pnpm run build`）——pnpm 不会替被 link 的包安装它自己的依赖。

```sh
pnpm run harness:local ../../deepseek-harness && pnpm install
pnpm run typecheck   # 先包源码，再测试
pnpm run test        # vitest
pnpm run build       # tsc 产出 lib/types，tsdown 打包两个面
pnpm run harness:npm && pnpm install   # 提交前
```

`pnpm run test` 必须在 local 模式下跑。已发布的 harness 包只带 `lib/` 和 `.d.ts`、不带源码，而它的浏览器半边是要 `window.__ModuleLoader__` 的 loader 产物——测试运行器没法 import。**编译**只需要类型，所以 registry 状态照样能构建；测试则把这些 specifier 指到真实源码，找不到时会明确说出来。

浏览器半边按 harness 自家 client 包的同一形状打成 loader 产物（`lib/client.js`）：平台模块保持 external、由 shell 的冻结模块表提供，其余全部内联，跨插件的值导入会被纯度门直接判为构建错误。连到 `dsh web` 上验证前记得重新构建——注册表提供的是 `lib/client.js`，不是源码。

## Model Experience

`chat` 预设的 persona 就是完整的 system prompt：没有工具说明、不注入运行时上下文快照，并明确要求「需要动仓库时就直说」而不是假装做过。本包其余部分不参与任何模型请求。

#### KV Cache effect

无。插件本身不组装 provider 请求；它装的预设反而让请求更短——没有工具的 Agent 不发工具目录。

## 已知限制与待办

- **搜索结果不带圆点。** 它是两行的堆叠，前置圆点会独占一行而不是待在标题前面；何况它第二行已经写着所属工作区。
- **空白聊天页仍是出厂那一版。** 它还是会显示工作区 chip（写着 `Chat`）、出厂标题和输入框占位符（「描述你想要构建的内容」——那是给干活写的）。harness 没有为这两处开放接缝，而本包刻意不去扒别的插件的 DOM 假造一个。要真正解决，上游加两处小东西即可：hero 的意图区包一层 chain，以及让画出该区域的插件能拥有输入框的号召语。
- **切换按钮的水平居中靠测量。** 它挂在整个框架的浮层上，通过公开的 `data-conversation-scroll` 属性找到会话列；如果某个部署的中列换成了别的插件，它就退化为相对整个框架居中。还没量出位置的开关也永远不会收起：既然没有唤出区可以把它请回来，收起就等于永久收起。
- **已经停在唤出区里、但没动过的指针不算数。** 唤出区是在指针移动时判定的，而页面加载后一直没动过的指针什么都没报过——所以开关会照常收起，之后随便动一小下就立刻回来。另一条路是轮询光标位置，代价大过这个场景本身。
- **Chat 工作区靠标题识别。** host 侧每次启动都会把标题重置回 `Chat`，所以在侧栏改名不会跨重启保留。这个标题正是产品展示给用户的分组名，所以按它匹配是产品事实而非隐藏耦合——但用户如果自己再建一个标题为 `Chat` 的工作区，会把它遮住。
- **预设切换被拒时是静默的。** 如果 `chat` 预设不见了（`<dshHome>/.agent-presets/` 下的目录被删），会话会落到部署默认预设——一个带工具的聊天——只有控制台诊断会提一句。
- **预设的 picker 文案跟随 UI 语言，但有延迟。** harness 不会替它本地化：`ui-agent-preset` 只为随发行版内置、且 id 在硬编码表里的预设查字典（`presetDisplayText`，条件是 `trust === 'system'`），注释明写「不让用户自制的元数据可翻译」，而装在可写根目录下的预设是 `trust: user`。所以 host 半边只写**一种语言**的 `preset.yml` —— 从 `locale` 设置命名空间读当前 UI 语言，并在 `settings/updated` 时重写 —— 凡是显示这个名字的地方，都要**下次加载页面**才显示新文案，而不是立刻：名单是在挂载时读的，而那次重写落到 host 上的时刻晚于浏览器已经切好语言，所以在 `locale/change` 里重读只是一次赛跑，不是修复。UI 没有显式语言偏好时，host 退回读自己的 `$LANG`。被人手改过的 `preset.yml` 永远不会被重写。
- **设置页里仍然列着 `Chat Mode`。** 模式过滤的是那枚 **chip**；Agent 预设设置区是另一个插件的界面，它列出部署提供的全部预设，包括这一个。这大概也是对的——那里正是查看、复制、删除预设的地方——但确实意味着这个名字在 Chat 工作区之外还会出现一处。
- **接管了 chip，就接不到它后续的改进。** 被遮住那枚 chip 的「介绍」动画（设置区的「用创造模式创作预设」入口会预置一个选择，并在它落到的那个会话上做一段自我介绍）这里没有复刻；选择照样生效，只是少了那点花活。将来 harness 给那枚 chip 加的东西，在本包跟进之前都到不了这个部署。
