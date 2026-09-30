# Tabstash 0.2.0 免费版验收记录

日期：2026-09-30。此记录替代本日早期 0.1.0 的候选验收状态。

## 自动验证

在仓库根目录执行：

    npm test
    npm run typecheck
    npm run build
    node scripts/verify-icons.mjs dist
    node scripts/visual-check.mjs
    node scripts/extension-check.mjs
    npm audit --omit=dev --json
    git diff --check

最新全套测试为 23 个文件、118 个测试通过；类型检查和生产构建通过。入口回归覆盖语言切换时保留输入、保存/导入预览令牌和未确认恢复请求 ID，HTML lang/title 同步，已有反馈、存储监听和恢复轮询晚到错误按当前语言显示。导入回归分别覆盖读取失败、JSON 解析失败、预览通信失败和确认响应丢失。修复前入口 6 条失败、动态语言增量 4 条失败、导入错误增量 5 条失败；最终均通过。

最终工作树与暂存区 `git diff --check` 均通过。源码和安装包的交付提交为 `b324edd`，已推送 origin/main 并通过 `git ls-remote` 核对完整提交号一致。

构建 manifest 版本为 0.2.0、最低 Chrome 127，权限仍仅 storage、tabs。popup、options、service worker、双语 locale 和四个 PNG 均存在；图标逐像素完整解码，尺寸与透明边缘正确。无主机权限、内容脚本和外部消息入口。最新生产依赖审计为零漏洞；历史开发工具链审计风险未做跨大版本强制升级。

## 三道独立 Gate

Gate 1 逻辑反方（Mendel）通过：导入异常分层、消息丢失提示结果未确认并清除可能消费的令牌、未知字段名保留、未确认恢复请求 ID 保留。未见新阻断。

Gate 2 设计一致性（Lovelace）通过：移除语言 key 导致的页面重挂载，HTML lang/title 与同步、异步提示都跟随当前语言，业务状态保留。最新全套构建和浏览器验收由主代理在修复后执行。

Gate 3 影响面与性能（Hilbert）通过：未增加权限、后台写入路径或资源泄漏，语言切换不重建监听/轮询。三项性能残留为 options 静态加载完整 Popup chunk、搜索重建 Fuse 索引、32 MB 导入的多份临时内存。

历史非阻断风险包括内存备用缓存并发 claim、任务历史最多十条的幂等期限、恢复失败清单无独立字节预算、后台直接保存在容量已满时仍读取一次窗口。生产路径采用串行 session 缓存，popup 已满时提前禁用保存。重命名/删除失败后切换语言没有独立交互断言，已核对结构化错误显示路径。

## 浏览器与布局

使用 Playwright Chromium 的隔离临时 profile 加载生产 dist，不访问日常浏览器数据，合成测试网址为 example.test。`scripts/extension-check.mjs` 真实加载 Manifest/service worker、popup、options，并完成：

- 当前窗口和所有普通窗口保存，扩展页等不可恢复标签被排除。
- 管理页按名称/网址搜索、空结果、重命名、标签详情和删除确认。
- 保留窗口结构/合并窗口两种恢复，原窗口保留且原标签没有被导航。
- 实际 JSON 下载、删除后重新导入、备份内容完全往返。
- 五会话 UI 与后台容量限制。
- 中英文跨页同步、重新加载后偏好保持、Gitee 反馈链接。

扩展页面没有 page error，最终 `errors: []`。脚本退出后关闭浏览器并清理自己的临时 profile。

视觉检查依赖临时 Vite 服务，启动方式见 README。24 个场景覆盖中英文 popup 空列表/五会话/展开排除项的保存预览，以及管理页三视图在 1280、390、320 宽度下的布局。全部无横向溢出、无缺失图片，popup 高度不超过 600px；人工查看了实际输出截图。静态页面中的 Chrome API 模拟仅用于布局，上述真实扩展脚本独立验证行为。

## 手工验收边界

仍需在目标用户 Chrome 环境检查 100+ 标签恢复、真实 service worker 被回收后的“结果未确认”行为、默认 Ctrl+Shift+S 快捷键是否被占用或被浏览器接受。代码提供快捷键无法弹出 popup 时打开管理页的兜底，这些环境相关行为未宣称通过。本轮完成的是可安装本地体验包，没有向扩展商店提交。

## 发布包与隐私

`releases/tabstash-free-mvp-0.2.0.zip` 共 17 个文件、90,101 字节，ZIP 根含 manifest。通过 .NET ZipArchive 逐文件读取并对照 dist 的 SHA256，所有文件一致，无开发依赖、测试、日志或临时 profile。包 SHA256：`D594F2FBE704661F00459588C89A906127BAF9647E0F99B2D3E6AAE3CFAF89A9`。旧 0.1.0 ZIP 保留。

备份不含 Cookie 或网页内容，README 说明网址明文风险；无网络后端或 storage.sync。Gitee 反馈链接不自动附带会话或 URL，未设置虚构邮箱。生产扩展不依赖开发服务器，解压后通过 Chrome 开发者模式加载含 manifest 的目录即可。
