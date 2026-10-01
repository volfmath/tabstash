# Tabstash 0.2.0 商店提交材料

## 结论

当前扩展可以同时提交 Chrome Web Store 和 Microsoft Edge Add-ons。两个商店
都支持本项目使用的 Chromium Manifest V3、模块化 service worker、`storage`
和 `tabs` 权限。两边使用同一个文件：

`releases/tabstash-free-mvp-0.2.0.zip`

包 SHA256：

`9BA98BC673CCBB4F40A6CDD4F57871760E4F08F0ED94198D094E42337589F701`

建议先提交 Chrome Web Store，审核结果稳定后再将同一个 ZIP 提交 Edge
Add-ons。当前已用本机 Edge Chromium 可执行文件加载该包完成隔离验收；这
证明运行时兼容，但不代表 Edge Add-ons 商店已经接受。不要为两个商店维护
不同代码或不同版本号。

## Chrome Web Store

入口：<https://chrome.google.com/webstore/devconsole>

### 基本信息

- 展示名称：`Tabstash`
- 版本：`0.2.0`
- 类别：`Productivity`
- 默认语言：`English`
- 可提供语言：`English`、`Chinese (Simplified)`
- 单一用途：Save and restore the user's browser tab sessions locally.
- 支持链接：<https://gitee.com/moreandmoregames/tabstash/issues>
- 隐私政策：<https://gitee.com/moreandmoregames/tabstash/blob/main/docs/privacy-policy.md>

### English listing

**Short description**

Save your browser work session locally and restore it later with your chosen window layout.

**Detailed description**

Tabstash saves a browser work session so you can return to it later.

- Save the current window or all ordinary windows.
- Preview included and excluded tabs before saving.
- Restore to new windows while preserving the saved window structure, or merge into one window.
- Search, rename, inspect, and delete saved sessions.
- Export and import JSON backups locally.
- Supports English and Simplified Chinese.

Tabstash is local-first. It does not upload sessions, use an account, or collect analytics. It stores persistent sessions and preferences in local extension storage, and uses session storage for short-lived previews and restore task status. It does not persist cookies, page contents, browsing history, or login state. Private-window tabs and unsupported pages are not saved to a session, but their URLs and titles may be read briefly during the save preview. URLs can contain sensitive query parameters; handle exported backups carefully.

The free version stores up to five sessions. It supports `http:` and `https:` tabs and skips browser-internal or otherwise unsupported pages during the save preview.

### Chinese listing

**简短描述**

在本地保存浏览器工作会话，之后按选择的窗口布局恢复标签页。

**详细描述**

Tabstash 用于保存浏览器工作现场，之后继续处理同一组标签页。

- 保存当前窗口或所有普通窗口。
- 保存前预览将保存和排除的标签页。
- 恢复到新窗口，可保留原窗口结构，也可合并为一个窗口。
- 搜索、重命名、查看和删除会话。
- 在本机导出和导入 JSON 备份。
- 支持简体中文和英文。

Tabstash 以本地保存为主：不会上传会话，不需要账号，也不使用分析服务。持久会话和偏好保存在本地扩展存储中，短期预览和恢复任务状态使用会话存储。不持久保存 Cookie、网页内容、浏览历史或登录状态。隐身窗口和不支持的页面不会保存到会话中，但其网址和标题可能会在保存预览期间被短暂读取。网址可能包含敏感查询参数，请谨慎保管导出的备份文件。

免费版最多保存 5 个会话，支持 `http:` 和 `https:` 标签页；浏览器内部页面或其他不支持的页面会在保存预览中列为排除项。

### Permissions justification

- `tabs`: Tabstash reads the URLs and titles of tabs only after the user chooses
  a save scope. It also uses the permission to create tabs during a user-started
  restore.
- `storage`: Tabstash stores sessions and language preference in
  `storage.local`, and short-lived previews and restore task state in
  `storage.session`.

### Data use answers

- Does the extension handle user data? `Yes`: browsing activity (tab URLs and
  titles) and user-provided session names or backup files are handled locally
  to provide the save, restore, and backup features.
- Does the extension collect user data outside the browser? `No`: this data is
  never transmitted to the developer or a third party.
- Does the extension sell or transfer user data to third parties? `No`.
- Does the extension use remote code? `No`.
- Does the extension use data for advertising, creditworthiness, or unrelated
  purposes? `No`.
- Does the extension have a privacy policy? `Yes`, use the URL above.

### Assets to upload

Use the 1280x800 PNG files in `docs/release/assets/`:

- `tabstash-sessions-en.png`
- `tabstash-backup-en.png`
- `tabstash-settings-en.png`

Use `public/icon128.png` as the store icon if the dashboard requests a
separate listing icon. The extension package already contains the 16, 48, and
128 pixel icons required by the manifest.

### Runtime evidence

On 2026-10-01, the isolated extension check was run with the installed Edge
Chromium executable through `CHROME_PATH`. It loaded the production `dist`,
exercised save, restore, backup, language, capacity, and feedback flows, and
reported `errors: []`. This is a local browser compatibility check; the store
review decision remains external and must not be claimed in advance.

## Microsoft Edge Add-ons

入口：<https://partner.microsoft.com/dashboard/microsoftedge/overview>

复用 Chrome 的名称、描述、隐私政策、支持链接、权限说明和三个英文截图，
上传同一个 `tabstash-free-mvp-0.2.0.zip`。Edge 的商店表单字段名称可能略有
不同，按以下映射填写：

- Product category：`Productivity`
- Support URL：Gitee Issues
- Privacy policy URL：Gitee `docs/privacy-policy.md`
- Package：`releases/tabstash-free-mvp-0.2.0.zip`

## 提交前检查

- [x] 构建 manifest 为 Manifest V3，版本 `0.2.0`。
- [x] 仅申请 `storage` 和 `tabs` 权限。
- [x] 包根目录包含 `manifest.json`。
- [x] ZIP 与当前 `dist` 已逐文件 SHA256 核对。
- [x] 当前工作树使用 Edge Chromium 可执行文件实际加载验收，`errors: []`；这不是商店审核结果。
- [ ] 以开发者账号登录 Chrome Web Store 并完成开发者协议/一次性注册费用。
- [ ] 上传 ZIP、图标和截图，填写隐私实践声明。
- [ ] 由账号持有人完成最终提交审核。
