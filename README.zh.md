# omdsh-chatmode

[English](README.md) | 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面加一个聊天模式：不用选项目目录就能开始对话，这些对话统一放在侧栏的 **Chat** 下面。

Harness 是编码 Agent，新建会话时要先选工作区——这很合理，编码 Agent 总得在某个目录里干活。但不是每个问题都是活。这个插件在它旁边补上另一种姿态：会话上方的 **Chat / Work** 切换，以及一个专门存放聊天记录的托管工作区。在 Chat 里，那枚工作区 chip 会从那一行拿掉，输入框上方只留下 harness 自己的预设选择。

「对话住在哪」就是它的全部。聊天跑的 Agent 和工作会话完全一样：部署的默认预设——除非部署另有设置，也就是 **Standard mode**。想换成别的，就在新建会话页上用 harness 自带的 chip 选。见[聊天跑的是什么](#聊天跑的是什么)。

## 它提供什么

| 界面 | 从哪来 |
|---|---|
| 模式开关里的 **Chat** 与 **Work** 两个分段 | 在 [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) 发布的分段注册表 `sessionModes` 里注册两次 |
| 侧栏里的 **Chat** 分组 | 一个真实目录（`<dshHome>/sessions/chat`）：本插件注册它，并把标题一直保持为 `Chat`；侧栏把它当普通工作区渲染 |
| 不管后来又打开了多少个项目，这个分组始终是**第一个** | 宿主侧在启动时把它放到最前，浏览器侧负责把它按在那儿——见 [Chat 始终在最上面](#chat-始终在最上面) |
| 侧边栏里这些对话前面的绿点与蓝点 | 这两个分段携带的 `tone` 与 `owns`；圆点本身由 [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) 为所有已注册的模式统一绘制 |
| Chat 新建会话那一行上被拿掉的工作区 chip | 打在出厂按钮上的一个标记，按钮就在 `conversation.hero.workspace` 旁边——见[新建会话那一行没有项目可挑](#新建会话那一行没有项目可挑) |

**不改 harness 的任何一行。** 这个包本身是一个 profile *bundle*：`dsh plugin` 把它装进 profile，追加到该 profile 的层栈，它那一行 loader 记录就叠在出厂的树之上。卸载插件，这一行、两个分段和它用到的所有接缝会一起消失。它在会话视图里不占座位：工作区 chip 是被标记而不是被替换的，出厂那枚预设 chip 仍坐在自己的座位上。

## 模式是推导出来的，不是存下来的

一个会话「是聊天」，当且仅当它记在托管的 Chat 工作区名下。切换按钮读的就是这件事——所以从侧栏点开一个会话，按钮会跟着动：它是在描述当前会话在哪，而不是在决定它在哪。存一个标志位，迟早会和屏幕上显示的对不上。

所以按下某个分段是一次导航，而不是写状态：

- **Chat** —— 回到你上次离开的那个聊天，没有就在 Chat 工作区里新开一个。
- **Work** —— 回到你在**当前这个项目里**上次离开的那段工作对话，没有就是这个项目最近的那一段，再没有就在这个项目里新开一段。见[切换不会离开你所在的项目](#切换不会离开你所在的项目)。

正因为模式是推导出来的，**每一次导航都会重新断言一遍**——包括落在同一个模式里的那些。从"work → work"的角度看，打开第二个工作对话像是什么都没发生；但那是用户在说他想看哪一段对话，而此时可能正有一个贡献进来的姿态占着会话列。在导航上重新推导，就是把那一列还回去。

只有一个例外：**属于另一个模式的对话，由那个模式来报告**。在它的导航上把列抢过来，片刻之后只会又被抢回去——因为它的主人也在回应同一个事件——中间那一帧是错的列，那个模式正在显示的东西也会被拆掉重建一次，白费。**按下**分段从来不是这种情况：对着一段 Code 对话按 Work，是在要求用网页视图读它——换列不换对话，而唯一能说明这一点的，就是这次按下本身。

## 切换不会离开你所在的项目

按下一个分段，是在同一个项目的几种视角之间移动，而不是在项目之间移动。所以 Work 第一个问的是*屏幕上是哪个项目*——而答案不是"被选中的那段对话所属的项目"。

也不可能是选中项：有一种姿态的会话列不是网页对话，它**显示一个项目却不在里面选中任何东西**。Code 模式的终端正是如此，而且是刻意的——一段 Code 对话是被显示、而不是被选中的，因为选中它就是让这个 host 去恢复一份别的进程正在写的日志。于是当你看着项目 B 的终端时，运行时的选中项还停在项目 A 里你之前打开的那一段；Work 要是去读选中项，就把你带回了 A。

屏幕上是哪个项目，答案是 `sessionModes.column`——[omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) 正是为这一类问题发布它的。有了它，后面每一个答案都留在这个项目里：在这里上次离开的那一段，没有就是这里最近的一段，再没有就在这里新开一段——绝不会是另一个项目的，无论它多"新"。

"这里最近的一段"要排除两种：

- **被别的姿态认领的对话。** 打开一段 Code 对话会显示终端，等于把会话列又推回这次按下正想离开的那个模式。这个问题由注册表回答（`modeOf`），所以以后加了新模式它依然是对的。
- **空白对话，除非只剩它。** 一段空白对话"新"，是因为它刚被**创建**，而不是因为里面说过什么；而一个项目会攒下不少——每按一次 New Session 又走开，都会留下一段。当这个项目再没有别的了，那一段就是它的「New Session」行，打开它好过在旁边再起一段。

一段聊天就是「会话列不在任何项目里」，而这句话是本包说的：它的 Chat 分段声明了 `inProject: false`——注册表用这个字段问「你这个模式的对话是不是归档在有人干活的地方」。只有管着那个目录的插件能回答；而它一回答，其它每个插件就都不用再管「这几个里哪个是 Chat」了：[omdsh-codemode](https://github.com/omdsh-plugins/omdsh-codemode) 正是读它才知道，在一段聊天旁边按 Code 意味着回到 Code 上次待的地方，而不是在聊天归档的文件夹里开个终端。

只有当会话列本身不在任何项目里时，才会落回那份跨项目的记忆：一段聊天，或者根本没装模式系统的页面。"我在哪个项目"在那里没有答案，而"带我回去干活"有。

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

接下这个请求的模式会保住会话列——这样 New Session 才会留在用户所在的模式里，而不是把人丢回 Work。拒绝它的、或者压根没有答案的（Chat 与 Work 就是），走框架自己的 New Session，把会话列也一起交出去。这个请求**永远不会在按下分段的过程中**被提出：进入一个没有旧对话可回的模式同样会新建会话，而那发生在正要离开的那个模式还挂着 active 标志的时候。

把这个请求路由出去是 [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) 的活，不是本包的。本包的活是**听到**那种没有东西可推导的情况：**New Session** 会复用该工作区已有的空白对话，所以当你正停在那段对话上时按它，打开的就是已经打开的那个 id——选择没动、列表没变、store 也不发布。注册表会把这条"落到框架"的路广播出来（`onNewSession`），本包据此重新推导。没有这一层，处在贡献姿态里的人按下 New Session，屏幕不会有任何变化。

## 这个开关不是本包的

Chat 和 Work 只是 profile 组出来的若干姿态中的两个。它们所在的控件、注册它们用的注册表、它们的对话在侧边栏里得到的彩色圆点，全都属于 [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode)——包括"同一时刻只有一个分段激活"这条规则，正是它让按下 **Code** 能把这两个清掉。

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

Chat 与 Work 依然是从"当前会话住在哪"推导出来的，所以从侧边栏打开一段对话仍然会让开关跟着动，按下任意一个都会把会话列从占着它的那一方手里拿回来。`owns` 是各自为自己作答的部分：Chat 认领记在托管工作区名下的那些对话，而 Work 标了 `fallback`——当没有更具体的说法成立时，一段对话就是"某个项目里的一段对话"。

**两个搭档插件都不是必需的，也都没有出现在顶层 `inject` 里。** 没有 [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) 就没有开关可供分段出现，那两枚 pill 干脆不存在——Chat 工作区、它的置顶、推导出来的模式、以及新建会话那一行上被拿掉的工作区 chip 都照常工作，因为它们读的是"当前会话住在哪"，而不是开关。没有 [omdsh-shortcuts](https://github.com/omdsh-plugins/omdsh-shortcuts)，分段的 tooltip 只是不写按键：本包不绑定任何键、也不注册任何命令，只是在那个插件报出 `mode.chat` 与 `mode.work` 的快捷键时，把它接在提示后面。两个服务都是在 `apply` 内部启动的受限 fiber 里够到的——正是这一点，让缺一个搭档插件不至于把某条 loader 条目留在 `pending` 上、进而让整页的启动扫描失败：那会是一个死掉的界面，而不是少一个分段。

## 新建会话那一行没有项目可挑

Harness 会在空白会话页上画一枚工作区 chip，因为编码 Agent 总得在某处干活。Chat 正是不必如此的那种姿态：对话已经住在托管工作区里，而在那一页上让人另选一个目录，等于让人离开这个模式。所以 Chat 显示时，那枚 chip 会从那一行拿掉，留下的是 harness 自己的 **Standard mode** 控件。

这枚 chip 不是公开的座位。ConversationRoot 把它画在 `conversation.hero.workspace` 的旁边——那个槽位是菜单，不是按钮——替换那个槽位只会藏起 picker，藏不起 chip。所以本包在按钮上写一个标记，做法和 [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode) 给侧栏上色一样：`[data-slot="conversation.hero.workspace"]` 是可寻址的接缝，chip 是它前面那颗菜单按钮，本包注入的样式表把它从那一行拿掉。卸载插件，样式表一起走，属性也不再写。

Work 仍然显示这枚 chip，因为 Work 就是某个项目里的一段对话，而这正是用来点名那个项目的控件。

## 聊天跑的是什么

部署的默认预设——除非部署另有出厂设置，也就是 **Standard mode**——以及读者在新建会话页上用 harness 自带的 chip 挑的任何一个。本包不碰组装，也不去占那枚 chip 的座位。它旁边那枚工作区 chip 是另一回事——见[新建会话那一行没有项目可挑](#新建会话那一行没有项目可挑)。

它以前两件都做，让它停手的正是当时那件事的做法。早先的版本会装一套无工具的 `chat` 组装，通过 agent-preset RPC 把每个空白聊天会话切过去，并遮住出厂那枚 chip，好按模式过滤名单：Work 里是除 `chat` 以外的全部，Chat 里是一行纯文本——模式已经替人定死了。这等于让**对话住在哪**去决定**它能做什么**，一个工作区要扛的事多了一件。「在项目之外问一句」和「要一个没有手的助手」并不是同一个诉求，而当时这两件被焊死在一起——除了离开这个模式，没有别的办法只要前者。

所以现在，模式就是 pill 上写的那件事，harness 那枚 chip 在两个模式里都重新成了真正的选择。

### 退役的预设会被收回

预设住在 `<dshHome>/.agent-presets/` 里，而这个目录是**部署组合出的每一个界面共用的**。留在那儿的 `chat` 目录会继续出现在设置页、以及终端界面的 `/mode` 里——这个产品已经没有的模式，还由一个早不是这个意思的插件摆着。所以 host 侧每次启动都会把它删掉，这就是全部的迁移：没有东西要跑，也没有东西要读。

那个根目录同时也是人写自己组装的地方，而这个包当初不请自来，往里面放了一个目录。所以这次删除按**内容**判断，不是按标记文件：只有当目录里每个文件都和本包装进去的某一份逐字节相同时才收回——那一套出厂组装，以及写在它旁边的 picker 元数据（两种语言都有，本插件前后用过的两个名字也都有；`omdsh-justchat` 就把自己的名字写进过那个文件的头部注释）。别的一律原样留下：改过的组装、重写过的 `preset.yml`、旁边多放的文件都算——想留住它，改一下组装就够了。认得的那几份副本作为 fixture 存在 [tests/fixtures](tests/fixtures) 里，这是让哈希和历史发布对得上的办法。

`<dshHome>/sessions/chat` 和它的会话日志一个都不动。跑在旧组装下的聊天保留自己的历史；变的只是**下一个**会话组装成什么。

## Chat 始终在最上面

侧栏里 **Chat** 分组是第一个，而且只要插件还装着就一直是第一个。它是唯一一个背后没有项目的分组——问题跟某个仓库无关时，人找的就是它——所以让它随着项目越攒越多往下沉，等于把最不具体的那个排到了最具体的那些后面。

这件事要两半一起做，因为这个事实有两种不同的弄丢方式。

宿主侧在启动时确立它：`workspaceRegistry.create` 对同一个目录是幂等的，所以这个「置顶」是一次独立的 `insertBefore`，与重新确立标题那一步并排。这是第一次渲染该拿到的东西——在任何浏览器接上来之前。

另一种弄丢方式是打开项目，而且它发生在启动**之后**：`create` 会把新工作区**前置**，于是每加一个目录，Chat 就往下掉一格，而且是在应用正跑着的时候掉。注册表不发任何事件可挂，所以浏览器侧改用「对账」：侧栏画的每一个工作区它本来就知道，因为侧栏就是照着那份列表画的，而侧栏的分组顺序**就是**注册表顺序。一旦 Chat 不在第一行，它就请宿主把它移回去——走的是拖拽排序那个手势最后调的同一个 `insertBefore`。所以这次纠正是持久且共享的：它写进注册表，而不是在某一个标签页上刷了层漆。见 [pin.ts](src/client/pin.ts)。

由此有两个结果，都是有意的：

- **它压过拖拽。** 把 Chat 分组往下拖，它会回到顶上。这跟标题那笔交易是同一笔——宿主侧会盖掉你给它的重命名——理由也一样：这两件都是本插件管的事实，而不是用户对自己项目的排布。
- **[omdsh-sidechat](https://github.com/omdsh-plugins/omdsh-sidechat) 被同一个动作一起置顶了。** 独立的侧边对话记在同一个托管工作区名下（它和这里所有地方一样，靠标题认出这个工作区），所以它的那些对话就落在这个被按在顶上的分组里。那个包对这一切不需要知道任何事。

## 安装

```sh
npx @omdsh-plugins/omdsh-plughub add omdsh-chatmode
```

这就是[插件中心](https://github.com/omdsh-plugins/omdsh-plughub)的安装器，只是入口从按钮换成了 argv。它从这套集合的
[registry](https://github.com/omdsh-plugins/registry) 里解析出这个插件、从它的
GitHub 仓库装上，并把那条 pnpm 构建白名单写好——裸的 `dsh plugin add github:…`
会把这一步留给你，而那条记录里带着 pnpm 解析出来的 commit，只能从报错里抄，事先
写不出来。

`dsh plugin --profile web add @omdsh-plugins/omdsh-chatmode` 现在**还不是**那条命令：这个
包不在 npm 上，pnpm 会回 `ERR_PNPM_FETCH_404`。这次安装也可以点按钮——只要 profile 里
已经有插件中心，按钮就在**设置 → 插件 → 插件中心**里这个插件的卡片上。

[omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode)——它的分段要出现在那个
开关里——已经发布，所以那一个按名字装：

```sh
dsh plugin --profile web add @omdsh-plugins/omdsh-basemode
```

第二次安装不是可有可无的装饰：没有 [omdsh-basemode](https://github.com/omdsh-plugins/omdsh-basemode)，**Chat** 与 **Work** 两枚 pill 根本不存在。本包其余的一切照常工作——[「这个开关不是本包的」](#这个开关不是本包的)写清楚了那个状态下什么在、什么不在，以及它为什么无害而不致命。

`dsh plugin` 会在 `$DSH_HOME/profiles/web` 里转发给 pnpm，然后按已安装状态对账该 profile 的 `dsh.profile.bundles`：本包声明了 `dsh.bundle`，所以会自动加入层栈。下次启动时，host 侧会创建 `<dshHome>/sessions/chat`、把它注册成 `Chat` 工作区，并把早先版本装下的 `chat` 预设收回。

**无论哪种装法，`dsh web` 启动前 `lib/` 必须存在。** loader 直接 import `lib/index.js`，缺了不是界面降级，而是整棵插件树加载失败：

```
dsh: plugin tree failed to load: ... failed to import loader entry chatmode
(@omdsh-plugins/omdsh-chatmode): Cannot find module '.../lib/index.js'
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
dsh plugin --profile web add github:omdsh-plugins/omdsh-chatmode#<commit>
```

第一次会**失败**：pnpm ≥10 默认拒绝跑 git 依赖的 `prepare`，要先放行。pnpm 和 `dsh` 都会把该加的那一条打印出来，而它是**完整的 specifier**——pnpm 把那个 commit 解析成的 tarball URL——不是包名。把它写进该 profile 自己的 `pnpm-workspace.yaml`（即 `$DSH_HOME/profiles/web/pnpm-workspace.yaml`，`dsh` 初始化时写的是 `packages: - .`、`nodeLinker: hoisted`、`autoInstallPeers: false`）：

```yaml
allowBuilds:
  '@omdsh-plugins/omdsh-chatmode@https://codeload.github.com/omdsh-plugins/omdsh-chatmode/tar.gz/<sha>': true
```

然后重跑 `add`，再 `dsh web`。**一旦有过一次被拒绝的尝试，光写包名就不够了。**`'@omdsh-plugins/omdsh-chatmode': true` 只有在第一次 `add` *之前*就已经在文件里才算数；失败之后再补上去，会以同样的 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 再失败一次，看上去就像这个补救办法没用。请直接把报错里的 key 抄下来，不要缩短它。

从插件中心装可以完全绕开这一来一回：它在第一次尝试之前就把这条写好，pnpm 要完整 key 时也会带着那个 key 重试。

两种 key 都等于授权该包在你机器上执行安装期代码——这里是 `tsc` 和 `tsdown`——所以建议锁到具体 commit，而不是跟着分支走，换 pin 之前先看 diff。URL 那种写法等于锁了两道：它锁的是某一个 revision，而不是一张长期通行证。

卸载同理：

```sh
dsh plugin --profile web remove @omdsh-plugins/omdsh-chatmode
```

聊天目录和会话日志都会留在磁盘上——卸插件不等于要删对话。那个工作区的标题不会再被重置，也不会再被置顶，就以一个普通工作区的身份留在侧栏里。

## 命令

```sh
pnpm install
pnpm run build       # tsc 产出 lib/types，tsdown 打包两个面
pnpm run typecheck   # 先包源码，再测试
pnpm run test        # vitest —— 必须在 local 模式下跑，见下节
```

这个包对着哪个 harness 编译，由一个开关决定：

```sh
pnpm run harness:npm                             # 提交状态：锁定的已发布版本
pnpm run harness:local ../../deepseek-harness    # 同级检出，用于开发
pnpm run check:harness-pin                       # 只要还有 link: 就失败
```

一次开发往返就是这两组命令交替：

```sh
pnpm run harness:local ../../deepseek-harness && pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run harness:npm && pnpm install   # 提交前
```

## 两种 harness 来源

上面那个开关的形状照搬 [`omdsh-desktop`](https://github.com/omdsh-plugins/omdsh-desktop) 解决同一问题的做法，而它之所以存在，是因为这两种来源并不能互换。

**只有 registry 状态可以提交。** `link:` 是相对声明它的那个 manifest 解析的，提交一条就等于把某台机器的目录布局写死进包里——而且 pnpm 不会大声报错：它建出悬空符号链接、报告安装成功，然后构建阶段每个 harness import 都是 `TS2307`。它还会让所有用 git URL 安装的人 `prepare` 失败。`check:harness-pin` 就是用来在提交前拦住这件事的。

local 模式要求那份检出自己已经装好并构建过（在那边 `pnpm run build`）——pnpm 不会替被 link 的包安装它自己的依赖。

`pnpm run test` 必须在 local 模式下跑。已发布的 harness 包只带 `lib/` 和 `.d.ts`、不带源码，而它的浏览器半边是要 `window.__ModuleLoader__` 的 loader 产物——测试运行器没法 import。**编译**只需要类型，所以 registry 状态照样能构建；测试则把这些 specifier 指到真实源码，找不到时会明确说出来。

浏览器半边按 harness 自家 client 包的同一形状打成 loader 产物（`lib/client.js`）：平台模块保持 external、由 shell 的冻结模块表提供，其余全部内联，跨插件的值导入会被纯度门直接判为构建错误。连到 `dsh web` 上验证前记得重新构建——注册表提供的是 `lib/client.js`，不是源码。

## 已知限制

- **项目记忆只活在这个标签页、这一次运行里。** 你在每个项目里上次离开的是哪一段，记在页面里而没有写下来——刷新之后就从各个项目最近的那一段重新开始。这跟模式靠推导是同一个取舍：不存下来的东西，就不会和屏幕上的事实闹矛盾。
- **搜索结果不带圆点。** 它是两行的堆叠，前置圆点会独占一行，而不是待在标题前面；何况第二行已经写着所属工作区。
- **空白聊天页的标题和占位符仍是出厂那一版。** 工作区 chip 已经从那一行拿掉，但鱼标标题和输入框占位符（「描述你想要构建的内容」）是给干活写的，harness 也没有为这两处开放接缝。
- **切换按钮的水平居中靠测量。** 它挂在整个框架的浮层上，通过公开的 `data-conversation-scroll` 属性找到会话列；如果某个部署的中列换成了别的插件，它就退化为相对整个框架居中。还没量出位置的开关也永远不会收起：既然没有唤出区可以把它请回来，收起就等于永久收起。
- **已经停在唤出区里、但没动过的指针不算数。** 唤出区是在指针移动时判定的，而页面加载后一直没动过的指针什么都没报过——所以开关会照常收起，之后随便动一小下就立刻回来。另一条路是轮询光标位置，代价比这个场景本身还贵。
- **Chat 工作区靠标题识别。** host 侧每次启动都会把标题重置回 `Chat`，所以在侧栏改名不会跨重启保留。这个标题正是产品展示给用户的分组名，所以按它匹配是产品事实而非隐藏耦合——但用户如果自己再建一个标题为 `Chat` 的工作区，会把它遮住；[置顶](#chat-始终在最上面)这时读到的就是那一个，于是认为顺序已经是对的。
- **置顶是事后纠正，不是事前拦截。** 应用开着的时候新建的工作区会被宿主前置，Chat 在报告这件事的那一帧回到它上面——所以确实存在一个瞬间（实测采样根本抓不到）新项目是第一个分组。要拦在前面，就得让宿主拒绝它自己刚写下的顺序，而注册表并没有开放任何可以挂在「创建」上的接缝。
- **被人改成自己的 `chat` 预设永远不会被删。** 这正是那道保护在起作用——但也意味着这样的部署会继续在设置页和终端 `/mode` 里列着 **Chat Mode**，而切到它的会话依然没有工具。要收尾就自己删掉 `<dshHome>/.agent-presets/chat`，这件事刻意留给人，而不是让插件替人做。
- **已经组装成聊天的会话保持原样。** 会话跑过一轮之后 host 就拒绝换预设，本包现在也不再开口，哪个方向都不问。升级之后再打开的旧聊天仍然没有工具；新开的那个有。
