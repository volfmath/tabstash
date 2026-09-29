# 实现 Tabstash 免费版本地会话管理 MVP

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan is maintained according to the repository contract in `.agent/PLANS.md`.

## Purpose / Big Picture

Tabstash 当前只有产品文档，没有可运行的扩展。完成本计划后，Chrome 用户可以从扩展弹窗保存当前窗口或所有普通窗口的标签页，给会话命名，在以后搜索、重命名、删除并恢复它们。恢复始终创建新窗口；多窗口会话恢复时可以保留窗口结构或合并为一个窗口。用户还可以导出 JSON 备份并在本地重新导入。

这个 MVP 的价值不是承诺浏览器崩溃后自动找回所有未保存标签，而是让用户对“主动保存成功的会话”有清楚、可验证的本地持久化结果。成功标准是：从 `F:\tabstash` 构建扩展，把 `dist` 加载到 Chrome，在真实窗口中保存、关闭或切换窗口、搜索会话、恢复到新窗口，并能验证失败网址、存储失败、五个会话上限和 JSON 导入错误都有明确反馈。

免费版只包含本地手动保存、会话管理、搜索、按主机名查看、快捷键和 JSON 备份/导入，最多五个会话。云同步、自动保存、会话模板和 Markdown 导出留给后续 Pro 版本。本计划不创建账号、支付、服务端或长期采集浏览状态。

## Progress

- [x] (2026-09-29 23:39 +08:00) 阅读仓库现状、README 和已确认的免费版设计。
- [x] (2026-09-29 23:39 +08:00) 初始化 Git 仓库，关联 Gitee，并推送文档基线。
- [x] (2026-09-29 23:39 +08:00) 安装 `AGENTS.md` 与 `.agent/PLANS.md` 的 ExecPlan 契约。
- [x] (2026-09-29 23:39 +08:00) 创建本 ExecPlan；实现代码尚未开始。
- [x] (2026-09-30 01:31 +08:00) 完成项目脚手架、Manifest V3 配置和可加载的最小扩展；构建输出包含 `manifest.json`、popup、options 和 service worker。
- [x] (2026-09-30 03:20 +08:00) 完成版本化本地存储、会话采集、保存、预览确认、重命名、删除和五个会话上限；自动验证为 7 个测试文件、36 个测试通过，M2 三道中文评审全部通过。
- [ ] 完成单窗口/多窗口恢复、合并恢复、部分失败反馈和后台任务状态。
- [ ] 完成弹窗 UI、搜索、主机名分组和快捷键。
- [ ] 完成 JSON 导出、导入预览、校验和全量拒绝策略。
- [ ] 更新 README 使其与免费版边界一致，并补充发布前隐私与权限说明。
- [x] (2026-09-30 03:20 +08:00) 已完成并记录 M1、M2 的三道中文评审门；后续 M3-M6 仍需在各自实现边界复审。
- [ ] 运行单元测试、构建检查和真实 Chrome 手工验收；形成最终 Outcomes & Retrospective。

## Surprises & Discoveries

- Observation: 工作区最初不是 Git 仓库，且远端 Gitee 是空仓库。
  Evidence: `git status` 最初返回 `fatal: not a git repository`；初始化后远端 `main` 指向 `e9bcc15`，随后推送了 ExecPlan 相关文件。
- Observation: README 把云同步和 Markdown 导出同时写入总体解决方案、MVP 计划和 Pro 计划，且原数据模型只有一层 `tabs`。
  Evidence: `README.md` 的“解决方案”“核心功能”和“高级功能”对同一能力的阶段归属不一致；已确认设计文档将云同步、自动保存、模板和 Markdown 导出移至 Pro，并把会话改为多窗口结构。
- Observation: Visual Companion 的服务器在第一次启动后因生命周期结束停止，Windows 环境没有 `bash` 命令。
  Evidence: PowerShell 启动 Node 服务器后可以生成本地讨论页；`.superpowers` 已被 `.gitignore` 排除。后续实现不依赖该工具。
- Observation: Chrome Manifest V3 service worker 可能在恢复长会话过程中被浏览器中断。
  Evidence: 设计决定不自动续传或重试；需要保存任务状态并在下次打开弹窗时显示“结果未确认”，避免重复打开标签。
- Observation: `@types/chrome` 要求 `windows.getAll` 的 `windowTypes` 使用字面量枚举，而采集模块为了测试使用更宽的字符串数组。
  Evidence: 首次类型检查拒绝 `string[]` 传给 Chrome API；后台适配层现在只在 API 边界做窄化转换，采集与测试接口保持浏览器无关。
- Observation: service worker 的消息监听需要返回 `true` 才能在异步处理完成后调用 `sendResponse`。
  Evidence: `src/background/background.ts` 在识别业务消息后返回 `true`，同步 ping 仍立即响应。
- Observation: `chrome.storage.session` 可用于保存短期预览确认数据，不需要新增 Manifest 权限；仅使用内存缓存会在 service worker 重启后丢失确认上下文。
  Evidence: `SessionPreviewCache` 使用带 TTL 的 session storage 记录，并有重启实例、并发 claim 和失败释放测试。
- Observation: 预览确认必须防止重放，而不能只依靠 popup 内存保存快照。
  Evidence: 客户端消息不再接受 `capture` 字段；后台只接受绑定保存范围的 token，成功保存后消费，明确存储失败才 release。

## Decision Log

- Decision: 免费版先做本地手动保存，不做自动保存、云同步、账号、支付和 Markdown 导出。
  Rationale: 先验证可靠的核心工作流，保持六周 MVP 范围可控；Pro 能力通过后续更新加入。
  Date/Author: 2026-09-29 / 用户与 Codex。
- Decision: 会话保存范围支持“当前窗口”和“所有普通窗口”，保存表单使用范围下拉菜单，默认当前窗口。
  Rationale: 同时覆盖单项目快速保存和完整浏览器工作区，且保持高频保存入口紧凑。
  Date/Author: 2026-09-29 / 用户与 Codex。
- Decision: 多窗口会话在恢复时选择“保留窗口结构”或“合并为一个窗口”，两种方式都只创建新窗口。
  Rationale: 保存时保留完整结构，恢复时给用户灵活性，同时不修改当前工作区。
  Date/Author: 2026-09-29 / 用户与 Codex。
- Decision: 只持久化主动保存成功的会话；免费版不承诺未保存标签的崩溃恢复。
  Rationale: 自动保存属于 Pro，产品文案必须与真实保证一致。
  Date/Author: 2026-09-29 / 用户与 Codex。
- Decision: 使用一个带 `schemaVersion` 的状态对象存入 `chrome.storage.local`，并由后台统一串行处理写操作。
  Rationale: 五个会话的规模下最容易校验和迁移，避免索引与会话记录分开导致不一致；后台是 Chrome API 与持久状态的唯一边界。
  Date/Author: 2026-09-29 / 用户确认方向，Codex 设计建议。
- Decision: 免费版提供 JSON 备份/导入；导入只追加，不覆盖，文件内部重复 ID 拒绝，与现有 ID 相同的记录跳过，新增后超过五个则整次拒绝。
  Rationale: 为本地数据提供用户可控的离线副本，同时避免导入半成功或意外覆盖。
  Date/Author: 2026-09-29 / 用户接受建议，Codex 设计。
- Decision: 首版只纳入 `http:` 和 `https:` 标签，排除隐身窗口、扩展页面、开发者工具和其他不可稳定恢复的页面。
  Rationale: 避免 UI 显示成功但 Chrome 无法重新打开的误导；未来按协议逐类定义权限后再扩展。
  Date/Author: 2026-09-29 / Codex 设计，待实现时用真实 Chrome API 验证。
- Decision: 不使用 `chrome.storage.sync`，不申请主机权限和内容脚本权限。
  Rationale: 免费版不做跨设备同步，减少权限、隐私和商店审核范围。
  Date/Author: 2026-09-29 / Codex 设计。
- Decision: 将消息处理拆为纯 `handleMessage` 与 service worker 适配两层，并让 `SessionStore` 继续承担写队列。
  Rationale: 纯处理器可以在不启动 Chrome 的情况下验证保存、列表、重命名、删除和错误响应；单一存储队列覆盖所有写命令，避免后台事件监听器各自实现并发控制。
  Date/Author: 2026-09-30 / Codex。
- Decision: 保存混合标签时采用后台预览令牌确认；令牌存入 `chrome.storage.session`，5 分钟过期，最多保留 20 条，成功保存后消费。
  Rationale: 先展示排除项再写入，避免客户端伪造 URL 或统计；session storage 跨 service worker 重启保留短期确认上下文；claim 后不自动重放，避免一次确认产生重复会话。
  Date/Author: 2026-09-30 / Codex。
- Decision: 存储状态严格要求 UUID v4、规范化 UTC ISO 时间戳和至少一个可恢复标签；列表读取等待已排队写操作。
  Rationale: 让状态不变量在写入前和读取时都成立，避免损坏数据进入后续列表、重命名或删除路径；读写顺序对 popup 提供可预测结果。
  Date/Author: 2026-09-30 / Codex。

## Outcomes & Retrospective

M1/M2 的代码结果已经形成：Manifest V3 工程可构建，版本化本地状态、窗口采集和后台保存/预览确认/列表/重命名/删除消息处理已实现。`npm test -- --run` 当前为 7 个测试文件、36 个测试通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 通过。真实 Chrome 加载和完整用户流程仍属于后续 M3/M6 验收，不能由本地构建替代；此前 Chrome 自动化产生的两个隔离 profile 目录已清理，未进入 Git。

## Context and Orientation

仓库根目录是 `F:\tabstash`。当前已有 `README.md`、中文设计文档 `docs/design/2026-09-29-free-mvp.zh-CN.md`、交接记录、Manifest V3 工程、`src`、`tests` 和 Git 忽略规则。M1 已创建可构建骨架，M2 已完成后台存储与会话命令；后续工作从 `src/popup` 的真实交互、恢复、备份和发布验收继续。

Manifest V3 是 Chrome 扩展当前使用的配置格式；它用一个后台 service worker 处理扩展事件，但这个后台脚本会被浏览器按需启动和停止。弹窗是用户点击扩展图标后打开的 React 页面，适合展示表单和列表，但关闭后不应承担长任务。Chrome API 是扩展访问窗口、标签页、命令和存储的接口集合，必须由后台模块集中调用，避免 UI 和后台各自修改数据。

实现建议使用 README 已选技术栈：React 18、TypeScript 5、Vite、`@crxjs/vite-plugin`、Zustand、Radix UI、Tailwind CSS 和 Fuse.js。实现时先检查当前稳定版本与插件兼容性；如果 `@crxjs/vite-plugin` 在当前工具链上无法稳定构建，记录证据后采用等价的 Vite 多入口配置，但仍保持 Manifest V3 的 popup、options 和 service worker 边界。

最终代码按以下边界组织：`src/types` 放纯数据类型；`src/lib` 放 URL 校验、主机名分组、存储、会话采集、备份导入导出和消息协议；`src/background` 只处理 Chrome API、命令和任务状态；`src/popup` 放保存表单、列表、搜索、详情和恢复结果；`src/options` 放 JSON 备份/导入与权限/隐私说明；`tests` 放不依赖真实 Chrome 的纯逻辑测试，真实浏览器检查作为手工验收。

会话数据采用以下语义。`StoredState` 是存储根对象，必须包含 `schemaVersion: 1` 和 `sessions`。每个 `SavedSession` 有 UUID `id`、用户可编辑的 `name`、ISO 8601 的 `createdAt` 和 `windows` 数组。每个 `SavedWindow` 有 `tabs` 数组；窗口数组顺序和标签数组顺序就是恢复顺序。每个 `SavedTab` 只保存 `url` 和 `title`，不保存 Cookie、网页内容、favicon data URL、浏览历史或登录状态。

## Plan of Work

### Milestone 1: 建立可加载的扩展骨架和验证工具

先创建 `package.json`、`tsconfig.json`、`vite.config.ts`、`manifest.json`、Tailwind 配置和最小的 `src` 入口。Manifest 必须声明 popup、options、后台 service worker、`storage` 与 `tabs` 权限，并配置一个可用的扩展图标占位资源。popup 初始页面显示当前版本和“尚未保存会话”，options 页面显示设置标题，service worker 可以响应一个最小消息。创建 `tests` 的纯逻辑测试入口和统一 npm scripts。

在 `F:\tabstash` 运行 `npm install`、`npm run typecheck`、`npm test` 和 `npm run build`。验收是四条命令都成功，`dist` 含 `manifest.json`、popup、options 和后台脚本；把 `dist` 加载到 `chrome://extensions` 后没有 Manifest 错误，点击扩展图标能打开弹窗，扩展详情页能打开 options。此里程碑结束时，仓库从“只有文档”变成“可安装但没有业务功能”的扩展。

里程碑完成后必须暂停并记录三道中文评审门：逻辑反方/辩论要检查当前权限、构建入口和扩展生命周期是否过度设计；设计一致性 review 要对照免费版设计检查是否提前引入账号、网络或 Pro 能力；影响面与性能 review 要检查权限最小化、首屏体积、service worker 启动成本和无业务路径的稳定性。三道门的结论写入本计划的里程碑记录；在没有可用子代理工具时，不能用单人自评冒充三道门。

### Milestone 2: 实现版本化本地存储与会话命令

在 `src/types/session.ts` 定义 `StoredState`、`SavedSession`、`SavedWindow`、`SavedTab` 和保存范围、恢复模式、任务状态等联合类型。在 `src/lib/storage.ts` 实现默认空状态、读取校验、schema 版本检查、UUID/ISO/非空标签不变量、单键写入、五个会话上限和存储错误映射。写入必须从最新状态生成候选对象，只有 `chrome.storage.local.set` 成功后才向调用方返回成功；失败时旧状态保持可读。

在 `src/lib/url.ts` 实现可恢复网址判断和安全主机名提取。在 `src/lib/session-capture.ts` 实现从当前窗口或所有普通窗口读取标签并转成 `SavedSession`，过滤隐身窗口、扩展页面、开发者工具和非 `http/https` URL，同时返回被过滤标签及原因。在 `src/background/messages.ts` 定义 popup 与后台之间的消息类型；在 `src/background/background.ts` 和 `src/background/listener.ts` 处理读取、保存、预览确认、重命名、删除和列表查询。混合标签保存先返回后台生成的预览令牌，确认消息不能携带客户端快照；预览令牌放入 `chrome.storage.session`，并由 claim/release/complete 维护重放和失败恢复。所有写命令通过后台队列串行化，列表读取等待已排队写入完成，避免并发保存和重命名互相覆盖。

为 `src/lib/storage.test.ts`、`src/lib/url.test.ts`、`src/lib/session-capture.test.ts` 和消息处理测试提供 Chrome API 的最小 mock。测试空状态、五个会话边界、重复 ID、无效数据、配额失败、并发写入、当前窗口/所有窗口采集、过滤协议和标题/URL 保留。运行 `npm test -- --run` 和 `npm run typecheck`；预期纯逻辑测试全部通过，且不会需要真实浏览器。

里程碑验收是：后台测试能证明空状态、严格状态校验、窗口和 URL 过滤、预览确认、令牌跨 service worker 实例、并发 claim、写入失败释放、五个会话上限、重命名和删除均符合契约；popup 的真实列表展示和写入失败 UI 反馈留在 M3。完成后执行三道中文评审门，分别攻击并核对存储一致性、设计边界和权限/性能影响，并把结论写入本计划。

M1 评审记录（最终以修正后的骨架为准）：

    评审时间：2026-09-30 03:20 +08:00
    Gate 1 逻辑反方/辩论：通过。早期快捷键命令曾绕过名称和范围确认，已移除并保留最小 ping；当前 service worker 仅处理明确消息，构建和测试入口可复现。
    Gate 2 设计一致性 review：通过。Manifest V3、popup、options、service worker 边界与免费版方向一致，没有账号、网络、云同步或提前实现 Pro 的代码；真实 Chrome 加载证据仍留到发布验收。
    Gate 3 影响面与性能 review：通过。权限仅 `storage`、`tabs`，后台 bundle 不引入 React，不读取窗口或启动轮询；初始构建警告仅为 Tailwind 未发现 utility class，不影响构建。
    评审证据：`npm run typecheck`、`npm test -- --run`、`npm run build` 通过；`dist/manifest.json` 生成且权限最小化；命令行加载扩展在当前 Chrome 环境被忽略，未将其误记为真实 Chrome 通过。

M2 评审记录：

    评审时间：2026-09-30 03:20 +08:00
    Gate 1 逻辑反方/辩论：通过。后台 token 缓存跨实例串行 claim；客户端不能注入 capture；claim 成功后不重放，明确存储失败才 release；空预览、名称错误、重复 ID、写入失败和 listener 异步响应均有测试。service worker 在 claim 后中断时要求用户重新预览，刻意避免自动重复保存。
    Gate 2 设计一致性 review：通过。状态严格校验 UUID v4、规范 UTC ISO 时间戳、至少一个 HTTP(S) 标签和五会话上限；当前/全部普通窗口与隐身、非普通窗口过滤符合设计；仅使用 `storage`、`tabs`，没有 Pro 范围漂移。popup UI、README 和真实 Chrome E2E 按 M3/M6 处理，不冒充本里程碑完成。
    Gate 3 影响面与性能 review：通过（存在非阻断风险）。后台 bundle 约 10.25 KB，gzip 约 3.60 KB；采集 120 标签为单次 Chrome API 读取和线性遍历；预览最多 20 条、TTL 5 分钟；5 个会话的完整状态重写属于已知免费版规模约束，极端长 URL/title 和旧 Chrome 不支持 `storage.session` 属后续发布检查。
    评审证据：`npm test -- --run` 输出 7 个测试文件、36/36 通过；`npm run typecheck`、`npm run build`、`git diff --check` 通过；`dist/manifest.json` 仅含 `storage,tabs`。

### Milestone 3: 实现保存表单、会话列表和管理体验

在 `src/popup/Popup.tsx` 组装页面状态和后台消息调用；在 `src/popup/SaveForm.tsx` 实现名称输入与“当前窗口 / 所有窗口”下拉菜单，当前窗口默认选中；在 `src/popup/SessionList.tsx`、`src/popup/SessionItem.tsx` 实现按创建时间倒序显示、重命名、删除确认、上限提示、空状态、加载状态和错误状态。显示保存预览中的窗口数、有效标签数和排除项数量，保存成功必须来自后台写入结果。

在 `src/lib/search.ts` 用 Fuse.js 对会话名称、标签标题和 URL 做模糊搜索。搜索结果仍保留会话完整结构；在会话详情组件中按保存窗口顺序展示，并在每个窗口内用主机名作为视觉分组标题，不能为了分组重排恢复顺序。所有图标按钮提供可理解的 aria-label 和 tooltip，弹窗窄尺寸下文字不能溢出。

此里程碑的浏览器验收是：从 popup 保存单窗口和所有窗口，会话列表即时刷新；输入会话名或标签标题的部分文字能找到会话；重命名后搜索立即按新名称工作；删除有确认且取消不改变数据；包含不可恢复 URL 时用户能看到排除原因；刷新 popup 不丢列表状态。运行单元测试、typecheck 和 build，随后加载最新 `dist` 做手工验收。完成后执行三道中文评审门，关注交互逻辑漏洞、设计一致性和弹窗性能/权限范围。

### Milestone 4: 实现安全的恢复流程与任务反馈

在 `src/lib/restore.ts` 定义恢复计划和单标签结果。恢复单窗口会话时创建一个新窗口；恢复多窗口会话时由 popup 先让用户选择“保留窗口结构”或“合并为一个窗口”。保留结构时为每个保存窗口创建新窗口；合并时创建一个新窗口并按原窗口顺序追加标签。恢复过程中不得关闭、导航或修改用户现有窗口。

后台恢复先验证 URL，再使用第一个有效 URL 创建目标窗口，避免留下初始空白标签；随后按保存顺序创建剩余标签。无法创建的标签记录 URL、标题和 Chrome 错误原因。任务状态写入 `chrome.storage.session`，包括任务 ID、session ID、状态、已处理数量和失败项；popup 关闭不主动取消任务。后台 service worker 中断后，重新打开 popup 时把长时间没有终态的任务显示为“结果未确认”，不自动续传或重试，避免重复标签。原会话绝不删除。

测试必须覆盖：空会话不创建窗口；单窗口恢复创建一个新窗口；多窗口保留模式创建正确数量的新窗口；合并模式只创建一个新窗口；用户原有窗口数量不变；一个无效 URL 不阻止其余 URL 尝试；Chrome API 部分失败显示失败清单；恢复中断不产生自动重试。真实 Chrome 手工验收需记录恢复前后窗口数量、标签数量和失败反馈。完成后执行三道中文评审门，重点挑战重复恢复、service worker 中断、初始空白标签和大量标签的时间/资源成本。

### Milestone 5: 加入快捷键、JSON 备份/导入和设置页

在 `manifest.json` 配置保存命令，并在后台命令处理器中调用与 popup 相同的保存流程；快捷键不能绕过名称和范围确认。由于 Chrome 命令事件没有可靠的交互式输入框，快捷键触发时应打开或聚焦扩展 popup/保存入口，让用户完成名称与范围选择；如果浏览器不允许自动打开 popup，就通过通知或设置页提供明确入口，并记录实际兼容性。

在 `src/lib/backup.ts` 实现 JSON 导出和导入校验。导出格式包含 `schemaVersion`、`exportedAt` 和 `sessions`。导入先解析完整文件并生成预览，再一次性验证版本、字段类型、URL 协议、文件内部重复 ID、现有 ID 和五个会话上限；文件内部重复 ID 直接拒绝，与现有 ID 相同的记录跳过，新增后超过五个则整次拒绝，任何失败都不修改现有数据。导入成功后一次性写入并显示新增/跳过数量。

在 `src/options/Options.tsx` 提供导出、选择 JSON 文件、预览、确认导入和隐私说明。popup 提供打开 options 的入口。导入测试要覆盖空文件、错误 JSON、未来 schema、字段缺失、非 HTTP(S) URL、内部重复、现有重复、超额和成功 round-trip。手工验收要在全新扩展数据中导出，再清空数据并导入，确认会话、顺序和名称一致。完成后执行三道中文评审门，重点检查导入是否可能覆盖/半成功、快捷键是否误导用户、备份是否把 URL 明文风险说清楚。

### Milestone 6: 同步文档、发布检查和完整验收

更新 `README.md`，把云同步、自动保存、会话模板和 Markdown 导出明确移到 Pro；把原单层 `tabs` 示例改成多窗口数据模型；把“崩溃恢复”改成“已主动保存会话的可靠恢复”；加入 JSON 备份/导入、权限和隐私边界。保留商业收入预测为待验证假设，不把它当作技术验收条件。补充 `docs` 中的中文发布检查，说明只使用 `tabs` 与 `storage` 权限，不使用主机权限、内容脚本、网络后端或 `storage.sync`。

在 `F:\tabstash` 运行 `npm test -- --run`、`npm run typecheck`、`npm run build`，并执行一次干净安装检查：删除或移动旧 `dist` 后重新构建，确认生成的 `dist/manifest.json` 可被 Chrome 加载。用 Chrome 当前稳定版手工验证 0 标签、100+ 标签、当前窗口、所有普通窗口、不可恢复 URL、五个会话、重命名/删除/搜索、两种恢复模式、恢复部分失败、JSON round-trip、非法导入、配额错误和 popup 关闭后的恢复任务状态。记录浏览器版本、测试结果和已知限制。

整个计划的最终验收是一个新用户只看 `README.md` 就能理解免费版边界，加载 `dist` 后能完成保存→搜索→恢复→备份→导入闭环，且所有失败情况都有可行动的反馈。完成第六里程碑后再次执行三道中文评审门，检查是否引入 Pro 能力、是否污染不相关权限/路径、以及 100+ 标签的资源和启动成本；然后填写 Outcomes & Retrospective。

## Concrete Steps

所有命令从 `F:\tabstash` 执行。开始实现前先确认 Node.js 与 npm 可用：

    node --version
    npm --version

第一里程碑创建工程后安装依赖并运行：

    npm install
    npm run typecheck
    npm test -- --run
    npm run build

预期输出是 typecheck 无错误、测试命令返回成功、build 生成 `dist`，并且 `dist/manifest.json` 存在。若仓库没有现成浏览器自动化依赖，不为了模拟 Chrome API 引入大型端到端框架；先用纯逻辑测试和 Chrome 手工验收，只有测试重复且收益明确时再加入 Playwright。

每个里程碑完成后执行：

    git status --short
    git diff --check
    npm run typecheck
    npm test -- --run
    npm run build

输出必须没有空白错误、类型错误或测试失败。每个里程碑通过三道中文评审门后单独提交，提交信息使用清楚的动词，例如 `feat: add local session storage` 或 `docs: align free MVP scope`。不要提交 `.superpowers`、`node_modules`、`dist`（除非仓库明确决定发布构建产物）或包含用户 URL 的测试输出。

## Validation and Acceptance

自动检查必须验证纯逻辑行为：状态读取和 schema 校验、会话上限、URL 过滤、主机名分组、模糊搜索、JSON 导入导出、重复/超额/非法数据拒绝、恢复计划的窗口模式和顺序。每个测试描述输入和可观察输出，不只检查函数被调用。

真实 Chrome 检查必须验证以下用户路径：

1. 在一个普通窗口打开至少三个 HTTP(S) 页面，保存为“工作”；popup 显示保存成功，重新打开 popup 后会话仍存在。
2. 打开第二个普通窗口和两个页面，使用“所有窗口”保存；恢复时选择保留结构，观察新建两个窗口且原有窗口未变；再次恢复选择合并，观察只新建一个窗口。
3. 在会话中加入不可恢复页面，保存预览列出排除原因；确认后只有有效标签进入会话。
4. 建立五个会话后尝试保存第六个，观察已有五个不变，并看到可导出或删除的提示。
5. 搜索会话名、标题和 URL 的片段；重命名和删除分别验证确认、取消和成功路径。
6. 恢复一个包含人为无效 URL 的备份数据，观察有效标签继续打开、失败列表列出无效项、原会话仍存在。
7. 导出 JSON，在全新扩展数据中导入，确认名称、窗口数量、标签顺序和 URL 相同；用错误 JSON、重复 ID 和超额文件确认整次拒绝且旧数据不变。
8. 关闭 popup 后恢复 100+ 标签，重新打开 popup 查看任务结果或“结果未确认”；确认系统没有自动重复恢复。

发布前确认 `manifest.json` 只申请业务需要的 `tabs` 和 `storage` 权限，且 README 与实际行为一致。若当前 Chrome 对快捷键无法直接打开 popup，则文档和 UI 必须明确写出实际可行入口，不能宣称快捷键已经完成完整保存。

## Idempotence and Recovery

安装依赖和构建命令可以重复运行。若 `npm install` 因网络或 lockfile 问题失败，保留错误输出，修复配置后从同一目录重试；不要删除用户目录或全局缓存。若某个里程碑代码未通过测试，先修复或回退该里程碑自己的提交，不使用破坏性 Git reset，也不覆盖用户已有修改。

开发测试数据只使用固定的示例 URL，不使用真实用户浏览数据。JSON 导入测试先复制测试 fixture，再在临时扩展数据环境中执行。任何需要清空 Chrome 扩展数据的手工测试都只针对本地开发扩展，并在步骤开始前导出备份。

如果构建插件无法满足 Manifest V3 多入口需求，先保留当前骨架和测试，记录失败命令与原因，再切换到等价的 Vite 配置；不要为了赶进度删除 service worker 或把所有逻辑塞进 popup。若 service worker 中断导致任务状态不可靠，显示“结果未确认”并保留原会话，禁止自动重试。

## Artifacts and Notes

当前设计与推送证据：

    git log --oneline --decorate -3
    f266602 (HEAD -> main, origin/main) docs: add MVP design handoff
    e9bcc15 docs: add free MVP design baseline

计划完成后的最小构建证据应类似：

    npm run typecheck
    # no TypeScript errors
    npm test -- --run
    # all tests passed
    npm run build
    # dist/manifest.json created

最终手工验收记录放在 `docs/verification/`，使用中文说明 Chrome 版本、测试日期、通过项、已知限制和失败复现步骤。记录中不得包含真实用户 URL、Cookie、令牌或完整浏览历史。

## Interfaces and Dependencies

使用 README 规划的 React、TypeScript、Vite、`@crxjs/vite-plugin`、Zustand、Radix UI、Tailwind CSS 和 Fuse.js。依赖的职责必须保持清晰：React 负责 popup/options 视图，Zustand 只管理界面查询状态，Fuse.js 负责模糊搜索，Chrome API 只在后台边界调用，存储和备份模块保持浏览器 API 可替换以便测试。

实现结束时至少需要这些稳定接口，函数名可按实际代码风格调整但语义不能改变：

    loadState(): Promise<StoredState>
    saveSession(scope: SaveScope, name: string): Promise<SaveResult>
    renameSession(id: string, name: string): Promise<void>
    deleteSession(id: string): Promise<void>
    listSessions(query?: string): Promise<SavedSession[]>
    createRestorePlan(sessionId: string, mode: RestoreMode): Promise<RestorePlan>
    runRestore(planId: string): Promise<RestoreResult>
    exportBackup(): Promise<BackupDocument>
    validateBackup(input: unknown): BackupValidation
    importBackup(document: BackupDocument): Promise<ImportResult>

`SaveResult` 必须能表达成功、达到上限、无可恢复标签、被过滤标签和存储失败。`RestoreResult` 必须能表达新建窗口数量、成功标签数量、失败标签列表和中断/未确认状态。`BackupValidation` 必须在写入前给出完整错误列表。后台消息协议必须让 popup 在关闭后重新打开时通过任务 ID 查询状态，而不是依赖 popup 内存。

### 里程碑评审记录格式

每个里程碑完成后，在本计划对应里程碑末尾追加以下中文记录，并把 `Progress` 中对应复选框更新为实际状态：

    评审时间：YYYY-MM-DD HH:mm +08:00
    Gate 1 逻辑反方/辩论：结论、发现的问题、是否修改。
    Gate 2 设计一致性 review：与设计文档和本计划的符合情况、范围漂移。
    Gate 3 影响面与性能 review：权限、存储、启动、标签数量和无关路径影响。
    评审证据：命令、测试结果、手工步骤或 diff 摘要。

若工具环境没有真实子代理能力，必须在里程碑边界报告无法满足三道独立评审门，并暂停继续该里程碑之后的工作；不能把同一个 agent 的重复阅读记录成三道门。

## Revision Note

2026-09-29 23:39 +08:00：首次创建本 ExecPlan。根据已确认的免费版设计，将空仓库的脚手架、版本化本地存储、多窗口保存/恢复、弹窗管理、JSON 备份/导入、文档同步和 Chrome 真实验收拆为六个可独立验证的里程碑，并加入仓库要求的中文三道评审门。后续每次修改必须同步更新 `Progress`、`Surprises & Discoveries`、`Decision Log` 和本节。
2026-09-30 03:20 +08:00：完成 M1/M2 实现并通过最终三道中文 Gate。根据评审将混合标签保存改为后台预览令牌确认，令牌使用 `chrome.storage.session` 跨 service worker 保留；补充严格 UUID/ISO/非空标签校验、读写顺序、listener 契约、并发 claim、失败释放和容量边界测试。M2 的真实 popup UI、README 同步和 Chrome E2E 仍按后续里程碑执行。
