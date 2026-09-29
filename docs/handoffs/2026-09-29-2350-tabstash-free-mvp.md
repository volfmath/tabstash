# Handoff: Tabstash 免费版 MVP 设计

## Goal
完成 Tabstash Chrome 扩展免费版的产品设计基线，并将项目提交推送到 Gitee。

## Current State
已确认免费版优先做本地可靠会话管理：支持保存当前窗口或所有普通窗口、恢复到新窗口、恢复时选择保留多窗口或合并窗口、会话管理与搜索、按域名查看、快捷键、最多 5 个会话、JSON 备份与导入。云同步、自动保存、会话模板和 Markdown 导出归入后续 Pro。

设计细节已写入中文设计文档，ExecPlan 已写入 `docs/plans/2026-09-29-tabstash-free-mvp-execplan.md`，尚未开始实现代码。原始仓库之前没有 Git 元数据，已初始化 `main` 分支并关联 Gitee。仓库级 ExecPlan 契约已安装在 `AGENTS.md` 和 `.agent/PLANS.md`。

## Changed Files
- `README.md`: 原始产品规格文档。
- `docs/design/2026-09-29-free-mvp.zh-CN.md`: 免费版 MVP 设计、数据模型、模块职责、失败处理与验证标准。
- `.gitignore`: 忽略本地 `.superpowers`、依赖、构建产物和日志。
- `AGENTS.md`: 仓库工作规则与 ExecPlan 触发条件。
- `.agent/PLANS.md`: 仓库 ExecPlan 完整契约。
- `docs/plans/2026-09-29-tabstash-free-mvp-execplan.md`: 六个实现里程碑、验收和中文三道评审门。

## Verification
- `git push -u origin main`: 成功，远端 `main` 已创建。
- `git ls-remote origin refs/heads/main`: 返回 `e9bcc152a57172ce28433be2f90bb0a52f074fe7`。
- `git status --short --branch`: `main...origin/main`，无未提交修改。
- `git check-ignore -v .superpowers/brainstorm/20260929-213502/state/server-info`: 已被 `.gitignore` 忽略。
- `git diff --check`: 计划相关工作区无空白错误。
- `Get-FileHash .agent/PLANS.md` 与技能参考文件一致：仓库契约按原文安装。
- `py -3 C:\Users\Administrator\.codex\skills\codex-exec-plans\scripts\verify_execplans_skill.py --check`: 未通过；已安装技能自身的 `references/execplans-overview.md` 与校验器期望文本不一致（当前内容含 `gpt-5.4`，校验器仍要求 `gpt-5.2-codex`）。这属于技能安装环境问题，未修改用户目录技能文件。

## Remaining Work
- 用户审阅 `docs/plans/2026-09-29-tabstash-free-mvp-execplan.md`，确认六个里程碑和验收范围。
- 计划确认后，按 ExecPlan 从脚手架里程碑开始实现，并在每个里程碑执行三道中文评审门。
- 实现前同步 README 中与免费版边界冲突的内容。

## Subtask Queue
- [x] 设计与 ExecPlan：完成 `docs/design/2026-09-29-free-mvp.zh-CN.md` 和 `docs/plans/2026-09-29-tabstash-free-mvp-execplan.md`。
- [ ] ExecPlan 审阅：审阅六个里程碑、接口和验收命令。
- [ ] 首版实现：在设计和计划批准后创建 Chrome 扩展项目并运行针对性测试。

## Clean Session Start
Continue from `docs/handoffs/2026-09-29-2350-tabstash-free-mvp.md`. Read it first, then ask the user to review `docs/plans/2026-09-29-tabstash-free-mvp-execplan.md`. After approval, execute the first unchecked milestone from that plan; do not implement before approval or reread unrelated history.

## Blockers / Risks
- 当前没有代码脚手架；远端会包含文档、ExecPlan 契约和实现计划提交。
- Chrome service worker 可能被中断；设计明确不自动重试恢复，避免重复打开标签。
- 本地存储和 JSON 备份包含用户 URL，隐私政策需要在发布前补齐。

## Next Agent
Recommended skill: `codex-exec-plans`, then `executing-plans` after the user approves the plan.
Start here: `docs/plans/2026-09-29-tabstash-free-mvp-execplan.md`.
