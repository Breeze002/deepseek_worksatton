# 开发与交接说明（DEVELOPMENT）

本文档写给**接手继续开发的人**：架构、数据流、必须遵守的隐性契约（都是踩过的坑）、验证体系、调试手段、发布流程。

> ⚠️ **协作状态**：本插件目前**有两个会话在同时改这份代码**（最后一方是 `0.7.4`，另加了光标高亮与轨迹诊断）。因此：
> 1. 改代码前先看 `git status` / `git diff`，确认没有别人未提交的改动；
> 2. **键位与光标语义以 `src/client/index.js` 的代码为准**（`memberCombo` / `onScrollKey` / `onQuestionKey` / `onApprovalKey` / `onPanelKey`），本文档只描述结构与不变量；
> 3. 一次只允许一个人 `npm run build` / `npm pack` / `install_bundle`（都会写文件、抢版本号）。

---

## 1. 架构

```
┌─ Host 半（profile 进程，改动需重启 dsh web）────────────────────┐
│ index.js           SessionCardsService extends TypertRemoteService
│                    static inject = ['sessionController','storage','storage.backend.json','typert']
│                    _boot() 幂等（constructor 与 [Service.init] 都会调用）
│                    方法：options / snapshot / watch(long-poll) / execute
│ lib/rpc.js         Remote 方法表 + 严格编解码（zod），namespace = sessionCards
│ lib/model.js       schema：group / member / snapshot / command / options
│ lib/store.js       KV(json) 持久化；命令按 commandId 幂等（保留最近 512 条）
└──────────────────────────────────────────────────────────────┘
┌─ Client 半（浏览器，改动只需重建 + 刷新）──────────────────────┐
│ src/client/index.js  →  client.js（npm run build）
│  · ctx.remote.$mount(remoteInfo)   ← 必须先挂载，客户端才拥有该 namespace
│  · slots: main(看板面板) / sidebar.panellist(图标) /
│           contextMenu.content(诊断标记) / sidebar.workspaces(群视图接管)
│  · Controller：attach/detach 引用计数（只有面板可见时才轮询）+ 断线重连
│  · focus store：群视图开关与当前成员
│  · 键盘层：window capture 上的成员键 / 提问卡片 / 滚动 / 审批
│  · @ 成员菜单：ctx.get('inputTriggers').registerSource(…) —— 把群成员作为 shell 自己
│               @ 候选菜单的一个"来源"（见 mention.js），不自绘浮层、不读 DOM
└──────────────────────────────────────────────────────────────┘
```

**数据流（一次"切成员"）**
按键 → `memberCombo()` 判定组合键 → `groupMembersOf(latestBoardState)` 取成员（**不依赖任何界面是否挂载**）→
若群视图未开：`enterFocus({ clearPanel: false })` 接管左栏，并**延后一帧**再打开会话（否则 shell 的重渲染会覆盖这次导航）→
`ctx.get('uiWorkspace').openSession(sessionId)` → 主区域渲染该成员的原生会话。

**会话标题**来自 `title` projection（`row.projections.values.title`）；新建的空白会话还没有标题 → 客户端显示"新会话（未命名）"，**不要把 sessionId 当标题显示**。

**成员校验**：`execute` 里对每个 `sessionId` 校验确实存在于 `sessionController.list()`，并尽量补齐标题/工作目录。

---

## 2. 必须遵守的隐性契约（症状 → 原因 → 做法）

| 症状 | 原因 | 做法 |
| --- | --- | --- |
| `Receiver must be an instance of class …` / 远端调用全挂 | 宿主类里用了 ECMAScript `#private` 字段，方法经 cordis 的 receiver Proxy 调用时取不到私有槽 | 宿主类一律用普通属性（`_x`） |
| **面板整块空白**（连标题按钮都没有） | 组件里 hook 出现在**提前 `return` 之后**，两次渲染 hook 数量不一致 | hook 全部放在任何提前 return 之前（`scripts/audit-hooks.mjs` 会拦住） |
| 某个按键一按就报 `X is not defined`，但构建与渲染都正常 | 组件引用了 **`apply` 作用域**里的绑定 | 组件只用模块作用域的 helper（`audit-hooks.mjs` 会拦住） |
| 宿主卡片/下拉/列表**收不到方向键** | 键盘层在 window **capture** 阶段 `preventDefault/stopPropagation` 了**自己并不处理**的按键 | 先判定"我要不要处理"，**只在真正处理时**才消费按键 |
| 审批卡片按 Enter 无效 | 在事件派发**过程中**把焦点抢回输入框 → 宿主卡片随后判断"焦点不在我这儿"而忽略 | 焦点要等事件走完再还（`restoreFocus(..., { defer: true })`），过期的还焦点定时器不得抢新卡片 |
| 操作到了**上一轮**已答过的卡片 | 用 `document.querySelector('[data-…-key]')` 取到第一张 | 取**最后一个可见**的待答卡片 |
| 升级 DSH 后键盘增强失效 | 依赖宿主内部 DOM 标记（`data-question-key` / `data-approval-key` / `data-option-row`）与角色 | 只用 `data-*` 与 `role`，不认类名；失效时看板仍应可用 |
| 全局输入/预览变卡 | 面板不可见时仍在轮询 | `attach/detach` 引用计数，只在可见时轮询 |
| 在会话里按 **Alt+G**（或从面板外发起别的调用）**毫无反应**：无报错、无提示 | 面板级轮询信号 `life` 在最后一个面板卸载时就被 `abort()`，而"用户从会话发起的一次性调用"也复用了它 → 调用一发出便已是中止状态，被 `catch` 吞掉 | 一次性调用（`chatSession` / `execute` / `options` / `prime`）走 `disposal` 信号，只有 `dispose()` 才中止；`life` 只留给轮询循环（`src/client/state.js`）。回归用例：`dom-test.mjs` 末节"shortcut works after the board was left" |
| 失败被静默吞掉，界面上什么都看不到 | 错误只写进 `publish()`，而它注册的 `contextMenu.content` 槽位在当前 DSH 里可能根本不存在（注册被 try/catch 吞掉） | 不能只靠 `sessionCards*` 标记判断"按键有没有触发"；用户可见的失败要有界面反馈 |
| 群聊里按 `@` 出的是**普通文件/会话候选**，群成员一个都不出现 | 作曲框是 Lexical **`contentEditable`**，不是 `<textarea>`/`<input>`；自绘浮层按 `HTMLTextAreaElement` 识别输入框 → 永远认不到。同时 shell 自己的 `@` 菜单照常弹出，于是看到的全是它的候选 | 成员**不做浮层**，而是注册为 shell 的 `@` 触发器来源：`ctx.get('inputTriggers').registerSource(source)`（`src/client/mention.js`）；候选、过滤、插入、光标全归 shell |
| 想往作曲框里写文本（回填别名等） | 直接改 `.value` 再手工派发 `input` 事件对 Lexical 无效 | 用官方原语 `inputActions.captureInsertion()` / `insertText(text, span)`；本插件的做法是让来源返回 `{ text: '@别名 ' }`，由 shell 自己插入 |
| `@` 候选里的成员没过期数据、来源要能感知成员变动 | 来源若缓存一份成员表，看板改了它不会知道 | 来源只读 `latestBoardState` 实时快照（不拷贝），并用 `subscribeLexicon` 接 `Controller.subscribe` 触发重取 |
| 改了代码页面没变化 | 忘了 `npm run build`（页面加载的是 `client.js`） | 改 `src/client/index.js` 后必须重建 |
| **重建了、也刷新了，现象与没改一模一样**（连报错都没有） | DSH 的客户端模块图按 `mtime/ctime/size` 派生的 `rev` **钉住**每个 bundle，且"immutable + mismatched revisions rejected"；新字节进图的唯一入口是 HMR watch 调用的 `ClientModules.rebuilt(id)`，而该 watch 属 DSH 自己的 dev 链（需 `pnpm run dev:web`） | **Client 半改动也要重启 dsh web**；自查办法：读 `conversation.input.overlay` 的标记，连 `sessionCardsReady` 都没有就是页面还在跑旧 bundle |
| 群里 `@成员` **消息发得出去，但成员的回复不显示** | `watch()` 里 `if (watched.has(sessionId)) return` 让**懒加载的占位 handler 永久占用**该会话。成员若是在上次 `follow` 之后才加入/换上，首次接触它的是 `prompt()` 的懒加载（空 handler）→ 随后 `follow()` 想装镜像 handler 被这行挡掉 → 成员的每条 `assistant/message` 都被空 handler 吞掉 | handler 按**名字占位**（同名覆盖，不同名并存）；并且**转发路径在把消息交给成员之前，先为该成员装上镜像 handler**（`src/client/chat.js`）。回归用例：dom-test "a member that joined after the last follow still mirrors its answer" |
| 事后装配 handler 时，成员**历史回复被当成新流量刷进群聊** | `watch()` 新建条目的 `seen` 是空的，而事件窗口里已经带着该会话的历史；首个通知会把 `slice(-MAX_READ)` 的旧事件全部派发 | 订阅前用窗口现有的 `seq` 给 `seen` **播种**，只处理之后到达的事件（`src/client/chat.js`）。回归用例：dom-test "arming a mirror does not replay the answers that already happened" |

---

## 3. 验证体系

| 脚本 | 覆盖 | 抓得到什么 |
| --- | --- | --- |
| `scripts/audit-hooks.mjs` | 静态 | hook 顺序错误、组件引用 `apply` 作用域绑定 |
| `scripts/smoke-client.mjs` | 冒烟 | bundle 是否可加载、`apply` 接线是否注册（main / sidebar.panellist / 诊断标记）、组件是否可渲染（TDZ）、`Alt+2` 是否打开目标会话 |
| `scripts/dom-test.mjs` | 交互 | 真 DOM 上的按键行为：看板焦点遍历、提问卡片的分题光标/数字/左右切题、审批 Enter/Esc 与还焦点、面板滚动与"不消费无用按键" |
| `scripts/visual-test.mjs` | 视觉（**单独跑**） | 真 Chrome 里渲染宿主形状的卡片，验证我们的光标高亮能否压过宿主样式；依赖本机 Chrome 与已安装的 DSH，故**不在 `verify` 链路里** |

**便携规则**：`npm run verify` 只允许包含"裸 Node 22 可复现"的检查（`build` / `audit-hooks` / `smoke-client` / `dom-test`）；任何依赖本机安装路径、浏览器或屏幕的检查都放到单独脚本（如 `npm run verify:visual`），并在 CI 里跳过。`visual-test.mjs` 通过 `DSH_PACKAGES_DIR` / `CHROME_PATH` 环境变量或 PATH 上的 `dsh` 自动探测，缺依赖时给出明确报错。

```bash
npm run verify   # build + audit + smoke + dom
```

**写新测试时注意**：jsdom **没有布局引擎**——`offsetParent` / `clientHeight` / `scrollHeight` / `getBoundingClientRect` / `overflowY` 都需要在测试里用虚拟值补上（见 `scripts/dom-test.mjs` 里的 `makeScrollable` / `placeIn` / `scrollBoxes`）。派发按键要打在**当前聚焦元素**上（真实浏览器就是这样），否则卡片自身的处理器不会收到。

**jsdom 还差两样会影响按键判定**（都踩过）：
1. **不实现 `isContentEditable`**（取到 `undefined`）。键盘层用它区分富文本作曲框与普通盒子 —— 缺了它，contentEditable 分支被整段跳过，用例会"假通过"。测这类路径必须 `Object.defineProperty(el, 'isContentEditable', { value: true })`。
2. `div` **不加 `tabindex` 就无法 `focus()`**，`document.activeElement` 不会变成它。用例里应补一条 `document.activeElement === el` 的自检，否则焦点悄悄不成立时后续断言全是假通过。
3. 断言**别只看"有没有 preventDefault"**，要看插件自己发布的 `sessionCardsScroll=<键>:<原因>`：原因不对说明代码走的是另一条分支，"没被消费"可能只是因为压根没走到那一步。

---

## 4. 调试手段（不用开浏览器）

客户端把状态写进一组**惰性占位符**：**每种标记各占一个 cell**，cell 的 id 就是标记原文（`diagnostics.js` 的 `MARKER_SLOT`）。用 `cordis_inspect_query`（client / Slots / `listSubTree`，root=`conversation.input.overlay`）读出 occupants 即可，等价于一块实时状态板：

| 标记 | 含义 |
| --- | --- |
| `sessionCardsReady` | 模块已加载并完成接线 |
| `sessionCardsWiringError=<msg>` | 可选接线抛错（被 try/catch 兜住，不影响主功能） |
| `sessionCardsPanic=<msg>` | 面板渲染崩溃（错误边界会把消息显示在面板上） |
| `sessionCardsKey=<combo>:members=N:focus=…:to=<alias>` | 成员键的判定结果 |
| `sessionCardsOpened=<alias>` / `sessionCardsNoWorkspace=<alias>` | 打开会话的结果 |
| `sessionCardsScroll=<code>:<held-by-field｜held-by-caret｜held-by-selection｜no-scrollable-pane｜scrolling>` | 滚动决策 |
| `sessionCardsQ=<code>:blocks/opts/targets/active` | 提问卡片**每次按键看到的 DOM 形状**（判断"宿主结构变了"最有用） |
| `sessionCardsQ=…:q?/?i?/?:scroll±N` | 光标落点与滚动量 |
| `sessionCardsTrace=…` | 最近的按键-动作轨迹（滚动窗口） |
| `sessionCardsMentionService=<present｜absent-at-apply｜ready｜no-registerSource>` | `@` 来源注册链路走到哪一步（`ready` = 服务已就绪并注册） |
| `sessionCardsMentionSourceError=<msg>` | 注册被拒（如来源重名） |
| `sessionCardsMentionAsked=members:N` | **shell 真的来问我们要候选了**，N=该会话认到的成员数（`N=0` 说明当前会话不是群聊会话） |
| `sessionCardsMentionPick=<alias>` | 用户选中了某个成员 |

> ⚠️ **`MARKER_SLOT` 必须是当前 DSH 真正声明了的槽位，而且注册字段名要对。**
> 一、槽位：曾经用的 `contextMenu.content` 在 DSH 0.2.1-rc.2 里**不存在**，注册抛错又被 try/catch 吞掉 → 所有标记（包括所有失败报告）全部无声消失。这正是当初"按了没反应又查不到原因"的根源。
> 二、字段名：**列表槽位用 `id`，键控槽位才用 `key`**。`main` 是键控槽位（`key: PANEL_ID`），而 `sidebar.panellist` / `conversation.*` 都是列表槽位、一律用 `id`（看 `catalog.registration`：required 的就是 `id`）。用错字段同样被 try/catch 吞掉、同样毫无痕迹 —— 这一条又白花了一次重启才定位到。
> 改槽位时同步检查 `scripts/smoke-client.mjs` 的 `required` 列表与标记读取字段，以及 `dom-test.mjs`（它从 bundle 导出的 `MARKER_SLOT` 取值，不再硬编码第二份）。
> 其余可用真实槽位：`conversation.input.overlay`（作曲卡片内浮动条目，shell 自己的 `@`/`/` 菜单 occupant `slash-menu` 也在这里）、`conversation.composer.dock`、`conversation.session.header.utilities`（`session-cards-reading-anchor`）。

---

## 5. 安装与发布

- **开发期**：装**目录**（`Plugins → Add plugin` 选本目录）→ 链接语义 → 改 `src/client/index.js` 后 `npm run build`，**然后重启 dsh web**（见下）；
- **交付**：`npm pack` 生成 `.tgz`；安装方用 `install_bundle` 指 tgz 或目录；tarball 安装会**钉版本号**；
- Host 半改动、以及改动 `cordis.patch.yml` / `package.json`，**需要重启 dsh web**；
- ⚠️ **Client 半改动在本机 DSH（0.2.1-rc.2）下同样需要重启 dsh web，刷新页面无效。**
  原因在 `@deepseek-ai/dsh-client-modules`：客户端模块图把每个 bundle 钉在由**文件 `mtime/ctime/size`** 派生的 `rev` 上，且按 "versioned code is immutable；mismatched revisions are rejected instead of serving newer bytes" 服务；
  而**唯一**能让新字节进入该图的入口是 `ClientModules.rebuilt(id)`，其注释写明它是 *"the HMR watch's registration hook — the only entry point through which build changes reach the graph"*。
  那个 watch 属于 DSH 自己的 dev 构建链（需要 `pnpm run dev:web`），开发本插件时并不在跑。
  所以 `npm run build` 之后：磁盘变了、图的 `rev` 没变 → 页面请求旧 `rev`、拿回旧字节，**现象与没改一模一样，且没有任何报错**。
  判断依据（可自查）：改完后用 `cordis_inspect_query`（client / Slots / `listSubTree`，root=`conversation.input.overlay`）读标记 —— 若连 `sessionCardsReady` 都不出现，就说明页面跑的还是旧 bundle，不是你的代码有问题。
- Plugins 详情页：有 `meta.detail`（如 `docs/DETAIL.md`）就显示它，否则回退显示**本包 README**。

---

## 6. 交接检查清单

- [x] `git` 仓库 + `.gitignore`（忽略 `node_modules/`、`client.js`、`.npm-cache/`、`*.tgz`）
- [x] `README.md`（是什么 / 键位 / 安装 / 目录结构 / 已知限制）
- [x] `DEVELOPMENT.md`（本文件）
- [ ] `license` + `author`（`package.json` 尚未声明）
- [ ] `engines.dsh` 与实测 DSH 版本范围（现为 `peerDependencies` 隐式约束，版本不符会被插件管理器拦住）
- [ ] 可选：`docs/DETAIL.md` + 预览图（Plugins 详情页）
- [ ] 确认 `icon.svg` 为自绘或可再分发
