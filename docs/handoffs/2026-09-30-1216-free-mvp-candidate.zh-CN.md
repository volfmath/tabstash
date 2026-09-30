# Tabstash 免费版候选实现交接

## 目标

完成已确认的免费版本地 MVP，并提交推送到用户指定的 Gitee 仓库。Pro 的云同步、自动保存、模板、Markdown 导出、账号和支付不在本轮范围。

## 当前状态

保存/管理/搜索、双恢复模式、恢复任务反馈、JSON 导出导入和快捷键兜底均已实现。最新三道独立代码 Gate 均通过，结论与风险已记录在 `docs/plans/2026-09-29-tabstash-free-mvp-execplan.md`。候选代码提交 `17b4076 feat: complete local free MVP candidate` 已推送 Gitee `origin/main`，推送后核对远端提交号一致；后续文档记录可能有新提交，以 `git log -1`、`git status --short` 和 `git ls-remote origin refs/heads/main` 为准。

真实 Chrome 发布验收尚未完成，M6 不得勾选完成。中文清单为 `docs/verification/2026-09-30-free-mvp-checklist.zh-CN.md`。

## 修改范围

`src/lib/restore.ts`、`src/background/restore-tasks.ts` 和恢复消息/UI 实现新窗口恢复、进度、部分失败与未确认。`src/lib/backup.ts`、`src/background/backup-previews.ts` 和 options 实现严格全量校验、摘要确认令牌、提交时追加/去重计数、紧凑下载。`src/background/shortcut.ts` 提供快捷键兜底。共享存储/预览/消息、manifest、中文设计/README/ExecPlan 已同步；`tests` 增加后台、容量和 React/DOM 回归；jsdom 仅为开发依赖。

## 验证证据

仓库根目录执行 `npm test -- --run`：16 个文件、83 个测试通过。`npm run typecheck`、`npm run build`、`git diff --check` 均退出 0。`npm audit --omit=dev --json` 零漏洞。构建 manifest 最低 Chrome 127、仅 `storage` 和 `tabs`，入口/图标文件存在，无主机权限、内容脚本和外部消息入口。

## 剩余队列

- [ ] 真实 Chrome 验收：加载当前 `dist`，按中文清单逐项验证保存/刷新、两恢复模式、原窗口不变、五会话上限、失败反馈、JSON 空数据往返、非法导入、100+ 标签、popup 关闭、worker 中断及快捷键兜底；记录浏览器版本和实际结果，不使用真实用户历史作为测试数据。
- [ ] 完成 M6 Gate：验收记录更新后由真实三个子代理重新执行中文逻辑反方、设计一致性、影响面与性能 Gate；通过后才标记 M6 完成并提交验收记录。
- [ ] 开发工具链风险：后续单独评估 Vitest、vite-node、Vite、esbuild、@vitest/mocker 的五项审计问题，修复建议涉及大版本升级；不能直接执行 `npm audit fix --force`。

## 阻塞和风险

本机 Chrome 153.0.8010.54 的隔离 profile 远程调试端口未连通；最小 headless DOM 探针成功，但进一步扩展加载调试探针被策略拒绝，未取得真实扩展运行证据。系统临时目录中本轮生成的隔离 profile 没有关联进程，清理也被策略拒绝；未操作用户默认 profile，未将临时文件放进仓库。

非阻断代码风险：内存备用缓存并发 claim（生产路径是串行 session 缓存）、十条临时任务历史的幂等期限、恢复失败清单无独立字节预算、后台已满时直接保存仍读取一次窗口。不要在实机验收前把候选实现称为已通过发布验收。

## 新会话入口

推荐技能：`codex-exec-plans` 和 `verification-before-completion`；发现问题时先用 `bugfix`。从第一条未完成的真实 Chrome 验收开始，不重做已通过的功能实现。

    继续 Tabstash 免费版候选实现。先读 docs/handoffs/2026-09-30-1216-free-mvp-candidate.zh-CN.md、当前 ExecPlan 和中文验收清单。代码三道 Gate 已通过，16 文件/83 测试通过；M6 真实 Chrome 未验收。先确认 Git 与远端状态，再从第一条未完成的浏览器验收执行。不要把构建、模拟 API 或 jsdom 当作真实 Chrome 通过。记录实际结果后完成 M6 三道中文 Gate。
