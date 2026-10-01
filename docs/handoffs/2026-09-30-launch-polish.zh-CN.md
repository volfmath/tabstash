# Tabstash 0.2.0 交付交接

> 最终发布复核修订（2026-10-01）：当前版本为 23 个测试文件/124 项测试通过，0.2.0 ZIP
> 为 90,380 字节，SHA256 为
> `B8D3BEC15556BC324661D34CDCF1134EF3F4DF76184B65449C2B0A6D02AA344D`。本文件
> 下方早期交接数字保留作历史上下文；商店上传以 `docs/release/` 和上述哈希为准。

## 目标与当前状态

用户决定先交付免费版，要求中英文、图标、紧凑弹窗、反馈渠道，并已授权源码和产物提交推送 Gitee。实现阶段曾以 `b324edd` 推送，随后完成留空命名修复和发布材料整理；当前提交以本文件最终记录及远端 `main` 为准。三道独立审查和本地自动验收通过，临时 Vite 服务已关闭。Gitee 仓库现为公开项目，Support URL 使用仓库主页，Issues 仍是直接反馈入口；没有发布商店，没有新增支付、账号、云同步或权限。

## 修改范围

`src/i18n/` 提供语言偏好、本地化错误及动态反馈。`src/popup/`、`src/options/`、`src/styles.css` 提供紧凑 popup 和完整会话/备份/设置管理页。`public/` 提供品牌图标与双语 Manifest 资源。`scripts/` 提供可复现图标生成、视觉和真实扩展验收。`tests/` 覆盖入口语言切换、状态保留与错误归因。后台和备份类型仅增加兼容错误详情，原持久数据格式不变。

## 验证证据

最终收尾复跑：`npm exec vitest -- run --dir tests` 为 23 个文件/124 项通过；常规 `npm test -- --run` 还扫描被忽略镜像目录，合计 46 个文件/248 项通过。`npm run typecheck`、`npm run build`、图标解码、`node scripts/extension-check.mjs`（`errors: []`）及 `git diff --check` 均通过；匿名 HTTP 检查仓库、隐私政策、Issues 和 ZIP 均返回 200。三个公开仓库收尾 Gate 均通过。此前 24 个双语视觉场景和生产依赖审计结果见既有验收记录；本轮没有重跑视觉场景。完整 Gate 结论及手工边界见 `docs/verification/2026-09-30-free-mvp-checklist.zh-CN.md`，实施决策见 `docs/plans/2026-09-30-launch-polish-execplan.zh-CN.md`。

发布 ZIP 为 `releases/tabstash-free-mvp-0.2.0.zip`，17 个文件/90,380 字节，所有条目与当前 dist 逐一 SHA256 相同，并使用标准正斜杠 ZIP 路径。SHA256 为 `B8D3BEC15556BC324661D34CDCF1134EF3F4DF76184B65449C2B0A6D02AA344D`。旧包保留，浏览器截图、临时 profile 和依赖不入库。

## 剩余工作与子任务队列

- [ ] 本轮 Git 交付：提交并推送本交接、ExecPlan、公开反馈修正、隐私与商店文档及 0.2.0 ZIP；随后核对 `git ls-remote origin refs/heads/main`、远端 raw ZIP SHA256 和干净工作树，并将最终提交号写回本节。
- [ ] 后续首发检查：目标用户 Chrome 的 100+ 标签、worker 回收和默认快捷键；范围与方法见验收记录。该项是环境相关的后续手工工作。
- [ ] 商店首发检查：账号持有人分别完成 Chrome Web Store 和 Edge Add-ons 的登录、表单、上传与审核提交；Edge 必须按 `docs/release/2026-10-01-store-submission.zh-CN.md` 的独立清单执行。

## 风险与阻塞

无实现阻塞。非阻断性能残留为 options 静态 Popup chunk、每次搜索重建 Fuse、导入接近 32 MB 时内存峰值。公开反馈当前使用 Gitee Issues，邮箱尚未提供；公开 Issue 不应粘贴备份、Cookie、登录链接或敏感网址。不得把本地体验包称为已上架商店。

## 新会话入口

推荐技能：`verification-before-completion`、`codex-exec-plans`；发现问题先用 `bugfix`。

    继续 Tabstash，先读 docs/handoffs/2026-09-30-launch-polish.zh-CN.md 和本轮 ExecPlan。本地验收、三个公开仓库收尾 Gate 与 0.2.0 ZIP 均已完成。首先完成 handoff 中未勾选的提交推送和远端 ZIP 哈希核验，再结合用户新要求处理后续手工首发检查；不要重做已交付功能，不提交 node_modules、profile、秘密，不自动发布商店。
