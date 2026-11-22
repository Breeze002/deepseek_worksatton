# dsh-session-cards（会话卡片）

DeepSeek Harness（DSH）插件：把已有会话组织成"群组"，每个成员一张卡片。左侧栏图标打开**看板**（主区域整页面板）；进入**群视图**后成员列表接管左侧会话浏览区，主区域显示该成员的原生会话（文件预览、正常输入都照旧）。

A DSH plugin that groups existing sessions into a member board, with a keyboard layer for switching members, scrolling panes, and answering the shell's question/approval cards.

- 实测环境：**DSH 0.2.2-rc.3**、**Node 22**（兼容性与版本要求见 `DEVELOPMENT.md`）
- 形态：Host 半 + Client 半的 bundle（Typert Remote + Client Slots）

---

## 安装

### 当用户用
1. DSH → **Plugins → Add plugin**，选择**本目录**（本地目录安装是**链接**语义，改完文件即可生效）；
2. 或让有工具的人用 `plugin_manager` 的 `install_bundle`，`target` 指向本目录（或打包好的 `.tgz`）。

### 开发（先构建再装）
```bash
npm install          # devDeps: esbuild / jsdom / react / react-dom
npm run build        # src/client/index.js → client.js（客户端半的构建产物）
npm run verify       # 构建 + 静态审计 + 冒烟 + DOM 交互测试
```
> `client.js` 是**构建产物**，不要手改；仓库里也不提交（见 `.gitignore`）。

---

## 键位

> 以代码为准：`src/client/index.js` 里的 `memberCombo`、`onScrollKey`、`onQuestionKey`、`onApprovalKey`、`onPanelKey`。

**看板（主区域面板）**

| 键 | 作用 |
| --- | --- |
| ↑ ↓ ← → | 在面板内控件（按钮/输入）间移动焦点 |
| Home / End | 第一个 / 最后一个控件 |
| Enter / 空格 | 激活当前控件（原生行为） |

**群视图（左侧成员列表）**

| 键 | 作用 |
| --- | --- |
| Alt+1…9 | 切到第 N 个成员（一次按键完成：需要时自动进入群视图并打开会话） |
| Alt+↑ / Alt+↓ | 上一个 / 下一个成员 |
| Alt+0 | 退出群视图，返回看板 |
| Alt+` 或 Alt+← | 返回上一个会话（无历史时返回看板） |
| Alt+Shift+数字 / Ctrl+Alt+数字 | 同上（Linux 桌面常占用 Alt+数字 时的替代组合） |

**面板滚动**（滚鼠标所在的面板，按住连续滚）

| 键 | 作用 |
| --- | --- |
| ↑ / ↓（无修饰） | 小步滚动；多行文本里光标到边界才转成滚动 |
| Shift+↑ / Shift+↓ | 等价别名 |
| PageUp / PageDown（可加 Shift / Alt） | 整页翻 |
| — | 焦点在按钮/列表项、或弹窗输入框里时**不抢键** |

**审批卡片**

| 键 | 作用 |
| --- | --- |
| Enter | 批准（焦点在输入框里也生效，之后光标回到原处） |
| Esc | 拒绝 |

**提问卡片**

| 键 | 作用 |
| --- | --- |
| ↑ / ↓ | 当前题内移动（选项 → 该题自由输入框） |
| ← / → | 切换问题（单题时走选项） |
| 1…9 | 选当前题第 N 项（多选则勾选/取消） |
| Enter | 提交（提交后光标回到原处） |
| Esc | 关闭弹窗 |

---

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `index.js` | **Host 半**：Typert Remote 服务（群组/成员/命令） |
| `lib/model.js` | zod schema：快照、命令、选项 |
| `lib/rpc.js` | Remote 方法表（`options`/`snapshot`/`watch`/`execute`）+ 严格编解码 |
| `lib/store.js` | KV 持久化（命令按 `commandId` 幂等） |
| `src/client/index.js` | **Client 半源码**：看板、群视图、键盘层、诊断标记 |
| `client.js` | Client 半构建产物（`npm run build` 生成，勿手改，不入库） |
| `cordis.patch.yml` | profile 补丁：插入 Host 行（`id: session-cards`） |
| `locale/{en,zh}.json` | Plugins 页面用的标题/描述（`meta.title` / `meta.description`） |
| `icon.svg` | 插件图标 |
| `scripts/build-client.mjs` | esbuild 打包成 `window.__ModuleLoader__.load(...)` 形式 |
| `scripts/audit-hooks.mjs` | 静态审计：hook 顺序、跨作用域引用 |
| `scripts/smoke-client.mjs` | 冒烟：bundle 加载 + `apply` 接线 + 组件渲染 + `Alt+2` 打开会话 |
| `scripts/dom-test.mjs` | DOM 交互测试：jsdom + 真 React + 宿主形状卡片，真按键断言 |
| `scripts/visual-test.mjs` | 视觉检查：真 Chrome 渲染卡片，验证光标高亮能否压过宿主样式（机器相关，单独跑） |

---

## 验证

```bash
npm run verify         # 跨机器可复现的四项：构建 + 静态审计 + 冒烟 + DOM 交互测试
npm run verify:visual  # 视觉检查（需要本机 Chrome 与已安装的 DSH，见下）
node scripts/dom-test.mjs   # 只跑交互测试（内存构建，不写文件）
```

`verify:visual` 依赖机器环境，所以**不放在 `verify` 里**（否则同事/CI 一 clone 就红）：

| 需要什么 | 怎么给 |
| --- | --- |
| 已安装的 DSH 包目录 | 自动从 PATH 上的 `dsh` 探测；也可显式指定 `DSH_PACKAGES_DIR=<...>/node_modules/@deepseek-ai` |
| Chrome / Chromium | 自动探测常见路径；也可 `CHROME_PATH=/path/to/chrome` |

它的产物（截图与样式对比）写在 `artifacts/`，不入库。

- 每次改 `src/client/index.js` **必须先 `npm run build`**，否则磁盘上还是旧 bundle；
- Host 半（`index.js` / `lib/*`）改动需要**重启 dsh web** 才生效；
- ⚠️ **Client 半改动也需要重启 dsh web**（本机实测，DSH 0.2.1-rc.2）——**刷新页面不够**，见 `DEVELOPMENT.md` 第 5 节。

---

## 已知限制

- 群视图会**接管 `sidebar.workspaces`**（宿主标注 `shadows-shipped-ui`），退出群视图即恢复原生会话列表；
- 键盘增强依赖宿主**内部 DOM 标记**（`data-question-key` / `data-approval-key` / `data-option-row`），DSH 升级可能让这部分失效（看板本身不受影响）；
- `peerDependencies` 钉住 DSH 内部包（`@deepseek-ai/cordis`、`@deepseek-ai/dsh-typert-protocol`），**换 DSH 版本可能被版本要求拦住装不上**；
- 本包**尚未声明 `license`**（交接前请确定授权与署名）。

更多：架构、隐性契约（踩过的坑）、调试标记、发布流程 → **`DEVELOPMENT.md`**。
