# Tabstash 0.2.0 交付交接

> 最终发布复核修订（2026-10-01）：当前版本为 124 项测试通过，0.2.0 ZIP
> 为 90,379 字节，SHA256 为
> `9BA98BC673CCBB4F40A6CDD4F57871760E4F08F0ED94198D094E42337589F701`。本文件
> 下方早期交接数字保留作历史上下文；商店上传以 `docs/release/` 和上述哈希为准。

## 目标与当前状态

用户决定先交付免费版，要求中英文、图标、紧凑弹窗、反馈渠道，并已授权源码和产物提交推送 Gitee。实现阶段曾以 `b324edd` 推送，随后完成留空命名修复和发布材料整理；当前提交以本文件最终记录及远端 `main` 为准。三道独立审查和本地自动验收通过，临时 Vite 服务已关闭。没有发布商店，没有新增支付、账号、云同步或权限。

## 修改范围

`src/i18n/` 提供语言偏好、本地化错误及动态反馈。`src/popup/`、`src/options/`、`src/styles.css` 提供紧凑 popup 和完整会话/备份/设置管理页。`public/` 提供品牌图标与双语 Manifest 资源。`scripts/` 提供可复现图标生成、视觉和真实扩展验收。`tests/` 覆盖入口语言切换、状态保留与错误归因。后台和备份类型仅增加兼容错误详情，原持久数据格式不变。

## 验证证据

`npm test`：23 文件、124 测试；`npm run typecheck`、`npm run build` 通过；图标逐像素验证通过；24 个双语视觉场景通过；隔离真实扩展检查保存、搜索、管理、恢复、备份、容量、语言和反馈成功。生产依赖审计零漏洞。完整 Gate 结论及手工边界见 `docs/verification/2026-09-30-free-mvp-checklist.zh-CN.md`，实施决策见 `docs/plans/2026-09-30-launch-polish-execplan.zh-CN.md`。

发布 ZIP 为 `releases/tabstash-free-mvp-0.2.0.zip`，17 个文件/90,379 字节，所有条目与当前 dist 逐一 SHA256 相同，并使用标准正斜杠 ZIP 路径。SHA256 为 `9BA98BC673CCBB4F40A6CDD4F57871760E4F08F0ED94198D094E42337589F701`。旧包保留，浏览器截图、临时 profile 和依赖不入库。

## 剩余工作与子任务队列

- [x] Git 交付：`b324eddf5f390ab9e1f2ca8f5303b85da065ba47` 已推送 origin/main，远端一致，工作树干净；本交接与 ExecPlan 的最终记录由后续文档提交补充。最终 HEAD 以 git log 和远端查询为准。
- [ ] 后续首发检查：目标用户 Chrome 的 100+ 标签、worker 回收和默认快捷键；范围与方法见验收记录。该项是环境相关的后续手工工作。

## 风险与阻塞

无实现阻塞。非阻断性能残留为 options 静态 Popup chunk、每次搜索重建 Fuse、导入接近 32 MB 时内存峰值。公开反馈当前使用 Gitee Issues，邮箱尚未提供。不得把本地体验包称为已上架商店。

## 新会话入口

推荐技能：`verification-before-completion`、`codex-exec-plans`；发现问题先用 `bugfix`。

    继续 Tabstash，先读 docs/handoffs/2026-09-30-launch-polish.zh-CN.md 和本轮 ExecPlan。0.2.0 实现、三个 Gate、124 项测试、真实 Chrome/Edge 扩展验收和源码/ZIP 推送已完成。先核对 git status、git log、远端 origin/main，再结合用户新要求处理后续手工首发检查；不要重做已交付功能，不提交 artifacts、node_modules、profile、秘密，不自动发布商店。
