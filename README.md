# Tabstash

Tabstash 是一个适用于 Chrome 和 Edge Chromium 的扩展，用于把当前浏览器工作现场保存为本地会话，并在之后恢复到新窗口。免费版优先保证主动保存、可见结果和本地数据可控。

## 免费版功能

- 弹窗提供快速保存和最近会话；管理页提供完整的会话、备份和设置视图
- 保存当前窗口，或保存所有普通窗口
- 保存前预览窗口数、可恢复标签数和被排除的标签
- 最多保存 5 个本地会话
- 界面支持简体中文、英文和跟随浏览器语言，偏好保存在本机
- 提供 Tabstash 品牌图标和 Lucide 操作图标，图标源文件位于 `public/brand.svg`
- 搜索会话名称、标签标题和网址
- 重命名、删除和按主机名查看标签
- 恢复到新窗口；多窗口会话可选择保留窗口结构或合并为一个窗口
- 恢复失败清单、进度和“结果未确认”状态
- JSON 备份、导入预览和全量校验
- 备份导入先检查文件大小（32 MB 读取上限）；保存预览使用最多 5 MB 的短期缓存
- `Ctrl+Shift+S` / `Cmd+Shift+S` 尝试打开保存入口；如果当前 Chrome 不允许快捷键打开弹窗，会打开设置页，页面提供进入保存页面的按钮。快捷键可在 Chrome 扩展快捷键设置中调整

## 明确边界

会话只保存网址和标签标题，不保存 Cookie、网页内容、浏览历史或登录状态。首版只保存和恢复 `http:`、`https:` 标签；扩展页面、开发者工具、隐身窗口和其他协议会在预览中列为排除项。

恢复始终创建新窗口，不关闭或导航已有窗口。恢复任务可能受 Chrome Manifest V3 service worker 生命周期影响；如果后台中断，扩展显示“结果未确认”，不会自动重试，以免重复打开标签。重复点击恢复也会再次打开这些标签。

云同步、自动保存、会话模板、Markdown 导出、账号和支付属于后续 Pro 方向，当前版本没有这些能力，也不会上传会话数据。

## 反馈和交流

在管理页的“设置”中可以打开公开 Gitee Issue，用于报告问题或提出功能建议：
`https://gitee.com/moreandmoregames/tabstash/issues/`

当前没有配置反馈邮箱，也不会虚构或自动添加邮箱入口。Issue 链接不会附带会话、标签或网址数据。

## 安装和开发

直接测试可下载 [0.2.0 安装包](releases/tabstash-free-mvp-0.2.0.zip)，解压后在 `chrome://extensions/` 或 `edge://extensions/` 启用“开发者模式”，选择“加载已解压的扩展程序”并选中含 `manifest.json` 的目录。升级已有安装时先导出备份，再将新包覆盖到原加载目录并点击扩展的“重新加载”；加载新目录可能产生不同扩展 ID，从而无法看到原本地会话。

环境要求：Node.js 20.9 或更高版本、npm，以及 Chrome 127 或更高版本或当前稳定版 Edge（发布验收仍以目标商店要求为准）。

```powershell
npm install
npm run typecheck
npm test -- --run
npm run build
node scripts/verify-icons.mjs
```

构建后打开 `chrome://extensions/` 或 `edge://extensions/`，启用“开发者模式”，选择“加载已解压的扩展程序”，并选择仓库中的 `dist` 目录。

## 使用流程

点击扩展图标，输入会话名称并选择保存范围。确认预览后，会话会写入本机。会话列表中的“恢复”会创建新窗口；多窗口会话会先让你选择保留结构或合并。

在管理页的“备份”视图可以导出 JSON。导入会先解析和校验完整文件，再显示新增和跳过数量；导入只追加，不覆盖现有会话。文件内部重复 ID、无效网址、字段错误或超过 5 个会话都会整次拒绝。

JSON 备份包含网址明文和可能敏感的查询参数，请像保存密码恢复文件一样妥善保管。扩展不上传备份。

## 权限和隐私

扩展只申请 `storage` 和 `tabs` 权限：`tabs` 用于读取用户明确保存的窗口和标签信息，`storage` 用于保存本地会话和短期任务/预览状态。没有主机权限、内容脚本、网络后端或 `storage.sync`。

公开隐私政策见 [`docs/privacy-policy.md`](docs/privacy-policy.md)；仓库现为公开项目，商店使用的隐私政策链接为 <https://gitee.com/moreandmoregames/tabstash/blob/main/docs/privacy-policy.md>。用户反馈入口为 <https://gitee.com/moreandmoregames/tabstash/issues/>。

## 测试

首次浏览器检查前运行 `npx playwright install chromium --no-shell`。视觉脚本需要另一个终端先运行 `npm run dev -- --host 127.0.0.1 --port 4173`；端口占用时选择其他端口，并通过 `TABSTASH_PREVIEW_URL` 指定对应地址。完成视觉检查后可关闭此临时服务；安装生产扩展不需要它。

```powershell
npm test -- --run
npm run typecheck
npm run build
node scripts/verify-icons.mjs
node scripts/visual-check.mjs
node scripts/extension-check.mjs
git diff --check
```

纯逻辑与 DOM 测试覆盖状态校验、五个会话上限、窗口采集、URL 过滤、搜索、恢复计划、恢复失败、任务并发、JSON 导入导出、备份确认、双语错误和页面导航。入口回归还检查切换语言时保留输入、保存/导入预览和未确认恢复请求 ID。`node scripts/verify-icons.mjs` 会逐像素解码并检查四个 PNG；`node scripts/visual-check.mjs` 检查中英文 popup、桌面管理页和窄屏管理页的实际视口与横向溢出。`node scripts/extension-check.mjs` 使用隔离临时 profile 加载 `dist`，检查保存范围、窗口恢复、备份下载与导入、容量和语言持久化；如本机没有可用 Playwright Chromium，可设置 `CHROME_PATH` 指向 Chrome for Testing 可执行文件。100+ 标签、真实 service worker 中断和快捷键行为仍需按 `docs/verification/` 中的清单手工验收。
