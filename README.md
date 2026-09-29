# Tab Session Manager - Chrome 扩展

> **项目类型**：Chrome 浏览器扩展  
> **目标用户**：程序员、研究员、重度浏览器用户  
> **开发周期**：6周 MVP  
> **技术难度**：⭐⭐ 简单  
> **收入潜力**：$5K/月（12个月目标）

---

## 📋 项目概述

### 问题陈述
- 程序员和研究员经常打开几十个标签页
- 现有产品（Session Buddy）体验差，经常丢数据
- 需要在不同工作场景间快速切换（工作项目、个人项目、学习资料）
- 浏览器崩溃或误关闭会丢失所有标签页

### 解决方案
一个轻量级、可靠的标签页会话管理器，支持：
- ✅ 一键保存当前所有标签页为会话
- ✅ 快速恢复任意会话到新窗口
- ✅ 智能分组（按域名自动分类）
- ✅ 云同步（跨设备使用）
- ✅ Markdown 导出（分享研究资料）

### 竞品对比
| 功能 | Tab Session Manager | Session Buddy | OneTab |
|------|---------------------|---------------|--------|
| 保存/恢复会话 | ✅ | ✅ | ✅ |
| 智能分组 | ✅ | ❌ | ❌ |
| 云同步 | ✅ | ❌ | ❌ |
| 数据可靠性 | ✅ 高 | ⚠️ 经常丢数据 | ✅ 高 |
| Markdown 导出 | ✅ | ❌ | ❌ |
| 快捷键 | ✅ | ✅ | ✅ |
| 定价 | $4.99/月 | 免费 | 免费 |

---

## 🎯 核心功能（MVP - Week 1-4）

### 1. 会话保存
- **功能**：保存当前窗口所有标签页为一个会话
- **快捷键**：`Ctrl+Shift+S`（Windows）/ `Cmd+Shift+S`（Mac）
- **存储信息**：
  ```typescript
  interface Session {
    id: string              // 时间戳
    name: string            // 用户输入的会话名称
    created: string         // ISO 时间字符串
    tabs: Tab[]             // 标签页数组
  }
  
  interface Tab {
    url: string
    title: string
    favIconUrl?: string     // 网站图标
  }
  ```

### 2. 会话恢复
- 在新窗口中恢复选中的会话
- 按顺序打开所有标签页
- 自动关闭初始空白标签页

### 3. 会话管理
- 列表显示所有会话
- 删除/重命名会话
- 按创建时间排序

### 4. 智能分组（差异化功能）
```
📂 GitHub (15个标签)
  - github.com/user/repo1
  - github.com/user/repo2

📂 Stack Overflow (8个标签)
  - stackoverflow.com/questions/...

📂 Documentation (5个标签)
  - docs.react.dev
```

### 5. 搜索功能
- 模糊搜索会话名称、标签页标题、URL
- 使用 `fuse.js` 实现

### 6. Markdown 导出
```markdown
# 会话名称

创建时间：2026-09-29 10:30

## GitHub (15个标签)
- [仓库名称](https://github.com/user/repo1)
```

---

## 🚀 高级功能（Pro版 - Week 7-10）

### 7. 云同步
- 跨设备同步会话
- 端到端加密（客户端加密，服务器存密文）
- 使用 Cloudflare Workers + KV 存储

### 8. 自动保存
- 每30分钟自动保存当前会话
- 浏览器关闭前自动保存
- 最多保留 10 个自动保存

### 9. 会话模板
- 为常用场景创建模板
- 快速启动工作环境

---

## 🛠️ 技术架构

### 技术栈
```json
{
  "核心框架": {
    "react": "^18.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "@crxjs/vite-plugin": "^2.0.0"
  },
  "状态管理": {
    "zustand": "^4.5.0"
  },
  "UI组件": {
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "tailwindcss": "^3.4.0"
  },
  "搜索": {
    "fuse.js": "^7.0.0"
  },
  "工具库": {
    "date-fns": "^3.0.0",
    "crypto-js": "^4.2.0"
  }
}
```

### 项目结构
```
tab-session-manager/
├── public/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon512.png
├── src/
│   ├── popup/                  # 弹出窗口
│   │   ├── Popup.tsx
│   │   ├── SessionList.tsx
│   │   ├── SessionItem.tsx
│   │   └── SaveForm.tsx
│   ├── options/                # 设置页面
│   │   └── Options.tsx
│   ├── background/             # 后台脚本
│   │   └── background.ts
│   ├── lib/                    # 核心逻辑
│   │   ├── storage.ts
│   │   ├── session.ts
│   │   └── utils.ts
│   ├── components/ui/          # UI组件（shadcn/ui）
│   ├── hooks/                  # React Hooks
│   └── types/                  # TypeScript 类型
├── manifest.json
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

---

## 💰 商业模式

### 免费版
- ✅ 最多保存 5 个会话
- ✅ 本地存储
- ✅ 基础功能（保存/恢复/搜索）
- ✅ 智能分组

### Pro 版 ($4.99/月 或 $39/年)
- ✅ 无限会话数量
- ✅ 云同步（跨设备）
- ✅ 自动保存
- ✅ Markdown 导出
- ✅ 优先支持

### 收入预测
| 时间 | 用户数 | 付费转化率 | 月收入 |
|------|--------|-----------|--------|
| 3个月 | 5,000 | 3% | $750 |
| 6个月 | 10,000 | 3% | $1,500 |
| 12个月 | 20,000 | 5% | $5,000 |

---

## 📊 开发计划

### Week 1-2: 核心功能
- [ ] 项目脚手架（Vite + React + TypeScript）
- [ ] manifest.json 配置
- [ ] UI 布局（shadcn/ui）
- [ ] 保存会话功能
- [ ] 恢复会话功能
- [ ] 本地存储封装

### Week 3-4: 管理功能
- [ ] 会话列表展示
- [ ] 删除/重命名会话
- [ ] 快捷键支持
- [ ] 搜索功能

### Week 5: 差异化功能
- [ ] 智能分组（按域名）
- [ ] Markdown 导出
- [ ] 模糊搜索（fuse.js）

### Week 6: 打磨和发布
- [ ] UI 优化（深色模式、动画）
- [ ] 错误处理
- [ ] 用户反馈提示
- [ ] Chrome Web Store 上架

### Week 7-10: Pro 功能（可选）
- [ ] 云同步后端（Cloudflare Workers）
- [ ] 端到端加密
- [ ] 自动保存
- [ ] Stripe 支付集成

---

## 🚀 快速开始

```bash
# 1. 克隆仓库（创建后）
git clone https://github.com/your-username/tab-session-manager.git
cd tab-session-manager

# 2. 安装依赖
npm install

# 3. 开发模式
npm run dev

# 4. 构建生产版本
npm run build

# 5. 加载到 Chrome
# 打开 chrome://extensions/
# 启用"开发者模式"
# 点击"加载已解压的扩展程序"
# 选择 dist 目录
```

---

## 🧪 测试清单

### 功能测试
- [ ] 保存空窗口（0个标签）
- [ ] 保存大量标签（100+）
- [ ] 恢复会话时浏览器崩溃
- [ ] 无效 URL 处理
- [ ] 存储空间不足

### 兼容性测试
- [ ] Chrome 最新版本
- [ ] Chrome 旧版本（最近2个主版本）
- [ ] Edge（Chromium）
- [ ] Brave

---

## 📝 发布清单

### Chrome Web Store 准备
- [ ] 扩展图标（16x16, 48x48, 128x128, 512x512）
- [ ] 截图（至少3张，1280x800）
- [ ] 简短描述（132字符以内）
- [ ] 详细描述
- [ ] 隐私政策页面
- [ ] 支持邮箱

---

## 📞 下一步行动

1. **阅读文档**：了解完整功能规划
2. **初始化项目**：等待代码脚手架生成
3. **开始开发**：从 Week 1 任务开始
4. **内部测试**：自己使用2周
5. **上架审核**：提交 Chrome Web Store

---

**状态**：📝 规格文档已完成，等待代码实现
