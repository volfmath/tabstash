# 免费版首发体验：中英文、图标、弹窗与反馈


本 ExecPlan 是持续更新的执行文档，遵循仓库根目录 `.agent/PLANS.md`。用户已批准“中英文、简洁图标、紧凑弹窗加完整管理页、反馈邮箱加公开问题区”的建议并要求继续实现，不需要再次等待设计批准。

## Purpose / Big Picture


用户安装新版后能在工具栏快速保存、搜索和恢复会话，在完整管理页查看标签、重命名、删除和备份，在设置里选择简体中文、英文或跟随浏览器，并进入公开反馈渠道。新图标必须是实际可解码的 PNG，小尺寸清晰。本次不加入支付、账户、云同步、埋点或新权限；保持五会话上限、保存前预览、恢复时选择窗口结构、只恢复到新窗口及 JSON 追加导入语义。

## Progress


- [x] (2026-09-30) 阅读现有页面、后台接口、测试和构建配置；确认用户授权范围。
- [x] (2026-09-30) 明确中文实现方案、文件归属和验证步骤。
- [x] (2026-09-30 23:24 Asia/Shanghai) 实现语言偏好、双语界面和错误消息、Manifest 本地化。
- [x] (2026-09-30 23:24 Asia/Shanghai) 修复语言切换重挂载导致的输入、保存预览、导入预览和未确认恢复状态丢失；补充入口回归测试。
- [x] (2026-09-30 23:24 Asia/Shanghai) 完成可解码品牌图标和可复现资源生成。
- [x] (2026-09-30 23:24 Asia/Shanghai) 完成紧凑弹窗、完整管理页、分步预览和反馈入口。
- [x] (2026-09-30 23:25 Asia/Shanghai) 执行自动测试、构建、双语浏览器截图和隔离 Chrome 扩展安装验证。
- [x] (2026-09-30 23:43 Asia/Shanghai) 修复导入错误归因、未知字段文案、导入结果未确认及异步提示语言滞后；三位独立代理全部复核通过。
- [x] (2026-09-30 23:43 Asia/Shanghai) 最新工作树 23 文件/118 测试、类型检查、生产构建、四图标、24 视觉场景及真实扩展验收通过。
- [x] (2026-09-30 23:43 Asia/Shanghai) 生成 0.2.0 ZIP，17 文件与 dist 逐一 SHA256 相等，更新中文验收记录。
- [x] (2026-09-30 23:52 Asia/Shanghai) 源码、文档和 ZIP 以 `b324edd` 提交推送 Gitee main，`git ls-remote` 与本地完整提交号一致，工作树干净；关闭本轮 Vite 临时服务。

## Surprises & Discoveries


初始 popup 没有稳定宽度，保存和恢复各阶段向下叠加。实现后固定最大高度 600px 并让内容滚动；320px 窄屏、长名称和双语文案均检查无横向溢出。旧 PNG 无法完整解码，新 PNG 已用 Sharp 逐像素验证四个尺寸。

Gate 2 找到 `key={locale}` 重挂载丢失业务状态、异步回调和提示字符串固化旧语言的问题。入口回归先验证失败再修复：去除语言 key，消息存格式化函数并在渲染时使用当前语言，保持预览令牌、恢复请求 ID 和轮询不变。Gate 1 找到文件读取/JSON/通信异常误归因、未知字段名丢失、导入响应丢失误报确定失败的问题，均分别补测并修复。

真实浏览器搜索验收初次用“Renamed fixture”预期单个结果，但模糊搜索也匹配“Current fixture”；改为有区分度的“Renamed”后通过，没有改变产品已有的模糊搜索语义。

## Decision Log


采用两个界面模式共用会话控制逻辑：popup 只展示精简会话行；options 页面成为完整管理页，含会话、备份、设置视图。避免新增重复的数据写入路径。主代理负责界面、CSS、浏览器验证和集成。

语言基础由独立代理负责，偏好单独存于 `chrome.storage.local`，通过 storage 事件跨页面同步，未支持语言回退英文。用户自己输入的会话名称、标题和 URL 永不翻译。界面词典由主代理负责，后台错误的本地化转换及基础翻译函数由语言代理负责。

品牌采用叠放标签与收纳托盘的简单形状，保留 SVG 源文件并构建为 PNG；这是代码原生标志资产，不依赖生成图片服务。图标代理只拥有 `public/icon*`、品牌源和生成脚本，不改 Manifest 或依赖文件。

用户尚未给出公开反馈邮箱，已异步询问。当前可交付入口使用 `https://gitee.com/moreandmoregames/tabstash/issues`，不编造邮箱或建立外部账号；取得邮箱后补充 mailto。反馈仅由用户点击打开，不自动携带会话或 URL。

2026-09-30：设置保留一个查看仓库提交记录的公开链接，用于查看更新动向；它与 Issue 同样只在用户点击时打开，不建立新服务。尚无邮箱时 Issue 已足以承接报告与建议，不把邮箱视为本次交付阻塞。

2026-09-30：所有动态反馈使用 `useLocalizedMessage` 保留消息含义，在每次显示时翻译。重命名/删除失败通过 `LocalizedFailure` 保留后台结构化错误；导入结果未知时清除可能已消费的令牌，提示先查会话列表，不自动重试。

继续在现有干净工作区开发，避免用户已安装的目录失效；保留 0.1.0 ZIP，新增 0.2.0 ZIP。用户已授权源码与产物提交推送，最终按该授权推送，未授权商店发布。

## Outcomes & Retrospective


本交付里程碑已完成：实现、三道独立复核、本地自动验证、安装包和 Git 交付均已完成。源码与 ZIP 已随 `b324edd` 推送 Gitee main 并核对远端提交号；本文件后续交付记录由文档提交补充。免费版 0.2.0 提供中英文、可解码品牌图标、紧凑 popup、完整会话/备份/设置管理页和公开 Gitee Issue 反馈入口，不包含账号、支付、云同步或额外权限。100+ 标签、service worker 被回收后的人工行为和快捷键是否被 Chrome 接受仍属于环境相关的后续手工验收，没有将它们宣称为自动通过；没有配置虚构邮箱或发布商店。

## Context and Orientation


项目使用 React 18、TypeScript、Vite 和 Manifest V3。`src/background/handler.ts` 集中接收保存、恢复、备份命令；`src/lib/storage.ts` 管理会话，已有持久数据格式不变。`src/popup/Popup.tsx` 共用 popup/manager 控制逻辑与列表显示，`src/options/Options.tsx` 管理三视图，`src/options/Backup.tsx` 负责备份。`src/styles.css` 共享样式，`src/i18n/` 管理语言偏好与文案。`manifest.json` 指定两个 HTML 页面，由 CRXJS 打包到 `dist`。原实现与历史检查参考已入库的 `docs/plans/2026-09-29-tabstash-free-mvp-execplan.md`，本计划独立说明本次行为。

## Plan of Work


本次为一个交付里程碑，结束时得到可安装的双语体验包。在同一里程碑内先用回归测试约束语言切换、管理入口和分步保存，再完成语言基础、品牌资源与 UI 集成。紧凑弹窗宽约 400px，高度不超过浏览器 popup 的 600px 常见限制；标题工具栏、保存区域和会话列表清晰分离，列表滚动，避免整个页面无限增长。完整管理页提供充足宽度并在窄屏堆叠。图标命令使用 Lucide 并提供双语名称和悬停提示。语言切换现在更新文案、`html[lang]` 和管理页标题，但不重挂载业务页面，因此进行中的用户状态保留。

保存预览取代表单和列表区域，用户确认或返回后继续；恢复多窗口时显示选择步骤。恢复任务使用现有后台任务标识和轮询机制，完成信息可收起，错误与未确认状态不能丢失。完整管理页仍复用相同后台命令，跨页修改通过本地存储变化刷新列表，语言偏好不能触碰会话数据。

完成后运行下述检查，三个真实子代理分别只读评审不同风险面。主代理读取结论、修复发现并请求复核后，才勾选里程碑完成。打包保留根目录 manifest，加入双语资源及实际图标，更新说明和手工验收边界。最新证据为 23 个测试文件、118 个测试通过，类型检查和生产构建成功，图标逐像素解码成功，24 个视觉场景成功，隔离 Chrome 扩展流程成功且 `errors: []`。管理页搜索、重命名、标签详情、删除确认均由真实扩展脚本操作验证。

## Concrete Steps


所有命令在仓库根目录运行；环境要求 Node.js 20.9+、npm、可运行的 Playwright Chromium。首次安装依赖运行 `npm ci`，首次安装浏览器运行 `npx playwright install chromium --no-shell`。可通过环境变量 `CHROME_PATH` 指定 Chrome for Testing。

    node scripts/generate-icons.mjs
    npm test
    npm run typecheck
    npm run build
    node scripts/verify-icons.mjs dist
    node scripts/extension-check.mjs
    git diff --check

视觉检查在另一个终端先启动 `npm run dev -- --host 127.0.0.1 --port 4173`，然后运行 `node scripts/visual-check.mjs`。如端口被占用，选择空闲端口并设置 `TABSTASH_PREVIEW_URL`。预期打印 24 个场景且全部 `overflowX:false`、`missingImages:0`；检查后关闭该临时服务。真实扩展脚本不依赖 Vite，生产加载只需 `dist`。

PowerShell 打包命令为 `Compress-Archive -Path dist/* -DestinationPath releases/tabstash-free-mvp-0.2.0.zip -Force`。ZIP 根必须包含 manifest，条目集合和每条目 SHA256 必须与 dist 完全相同。本轮使用 .NET ZipArchive 逐条读取并与 `Get-FileHash` 比较，17 条全部相等，无开发依赖、测试、日志或临时 profile。

前端使用 `lucide-react`；开发工具使用 Sharp 验证与生成 PNG，Playwright 自动打开隔离 Chromium 并截图。依赖由主代理统一安装，禁止并行修改 package-lock。浏览器脚本启动独立临时配置，不访问用户的日常浏览器数据。实际结果、命令与截图位置在执行后写入验收记录。

## Validation and Acceptance


英文浏览器默认显示英文；中文浏览器默认简中；设置改为手动语言后重新打开仍保持，另一个打开的扩展页面同步变化。检查按钮、日期、状态、错误、备份校验和 aria 名称。长英文文案、长会话名、零个和五个会话时不横向溢出。

用户从弹窗进入管理页后可搜索、重命名、查看窗口标签、删除、导出并导入。保存预览必须仍显示排除数量和细节；确认后回列表，达到上限不写入第六个会话。恢复保留窗口及合并窗口两种方式不回归。恢复轮询、重复请求幂等及大备份已有测试持续通过。

每个 manifest 引用的 PNG 能完整解码并尺寸正确；ZIP 与 `dist` 文件逐一一致，没有开发依赖或敏感文件。浏览器安装无 Manifest 错误，截图检查实际排版。静态页面模拟只用于布局，不冒充真实扩展端到端测试。反馈跳转只包含公开项目地址、用户主动输入的内容或邮箱，不附带浏览记录。

## Idempotence and Recovery


语言配置使用独立键，无存储版本迁移。备份格式不变，升级可直接在扩展页面重新加载相同目录；升级前可自行导出备份。生成图标、构建与 ZIP 可重复运行；旧版本 ZIP 保留。遇到安装问题保留日志摘要，不能改用户日常 Chrome 配置或用强制 Git 重置回退。

## Artifacts and Notes


产物为 `releases/tabstash-free-mvp-0.2.0.zip`，中文验收记录位于 `docs/verification/`，交接位于 `docs/handoffs/`。截图与临时浏览器数据保存在被忽略的本地目录，只提交必要演示图片和可复现脚本。

0.2.0 ZIP 为 90,101 字节，SHA256 为 `D594F2FBE704661F00459588C89A906127BAF9647E0F99B2D3E6AAE3CFAF89A9`。旧 0.1.0 ZIP 原样保留。

Gate 1（Mendel）最终通过：语言切换保持状态与未知恢复 ID，导入异常分层，导入未确认不自动重试，字段名保留；未见新阻断。Gate 2（Lovelace）最终通过：入口不重挂载，HTML 语言/标题和同步、异步反馈一致，业务状态保留；最新全套与浏览器检查由主代理完成。Gate 3（Hilbert）最终通过：未增加权限、后台写入路径或资源泄漏，语言切换不重建监听与轮询。非阻断性能残留为 options 静态加载 Popup、每次搜索重建 Fuse、32 MB 导入的多份临时内存。三道 Gate 均为真实独立子代理只读复核。

## Interfaces and Dependencies


语言模块 `src/i18n/core.ts` 暴露 `Locale = 'en' | 'zh-CN'`、`LanguagePreference = 'system' | Locale`、解析偏好函数和 `createTranslator(locale, catalog)`。catalog 为键到 `{ en: string, 'zh-CN': string }` 的结构，翻译参数用命名占位符。`src/i18n/react.tsx` 提供 `I18nProvider` 与 `useI18n()`，返回 locale、preference、setPreference、ready、preferenceError。`src/i18n/errors.ts` 提供 `localizeFailure(failure, locale)`、`localizeRestoreFailure(failure, locale)`，不能把结构化校验错误降级为不相关的通用描述。主代理拥有 `src/i18n/ui.ts` 的界面词典及调用层。

`useLocalizedMessage()` 返回当前语言字符串与 setter，setter 接受空字符串或 `(locale: Locale) => string`，React 状态保存格式化函数而不是已翻译字符串。该函数仅存在于页面内存，不写入 storage 或 JSON 备份。`LocalizedFailure` 在行内操作失败时保留 `MessageFailure`，由调用页面在显示时本地化。

后台命令、会话和备份格式沿用现有类型；如校验消息需要可选稳定代码，仅增加兼容字段并保留旧字段。完整管理页在现有 options HTML 内，通过 `#sessions`、`#backup`、`#settings` 导航。没有反馈后台、分析服务或额外 host 权限。

修订记录：2026-09-30 初版，依据用户已批准方案明确执行范围、公开邮箱缺口和可验证交付要求。

修订记录：2026-09-30 23:25，依据 Gate 2 复审修复语言切换重挂载和 HTML 语言元数据问题；依据当前工作树重新记录 22/110 测试、构建、图标、视觉和真实隔离扩展证据，并将剩余步骤收束为生成并核对 0.2.0 ZIP、提交和推送。

修订记录：2026-09-30 23:43，补齐三道独立最终结论、导入异常与动态翻译决策，更新最新 23/118 测试和真实管理操作证据，记录 ZIP 文件数、大小与 SHA256，明确只剩 Git 交付。

修订记录：2026-09-30 23:52，记录 b324edd 已推送及远端一致证据，完成交付里程碑；剩余首发环境检查独立列入交接，不影响本次本地体验包交付状态。
