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
| 改了代码页面没变化 | 忘了 `npm run build`（页面加载的是 `client.js`） | 改 `src/client/index.js` 后必须重建 |

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

---

## 4. 调试手段（不用开浏览器）

客户端把状态写进一个**惰性占位符的 key**（`contextMenu.content`），用 `cordis_inspect_query`（client / Slots / `listSubTree`，root=`contextMenu.content`）即可读出：

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

---

## 5. 安装与发布

- **开发期**：装**目录**（`Plugins → Add plugin` 选本目录）→ 链接语义 → 改 `src/client/index.js` 后 `npm run build` + 刷新页面即可；
- **交付**：`npm pack` 生成 `.tgz`；安装方用 `install_bundle` 指 tgz 或目录；tarball 安装会**钉版本号**；
- Host 半改动、以及改动 `cordis.patch.yml` / `package.json`，**需要重启 dsh web**；
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
