# 🧭 毛玻璃导航 / Glassmorphism Navigation

> 一套纯前端、毛玻璃风格的网址导航站，支持 Cloudflare KV 云存储，数据跨设备同步不丢失。
>
> A pure-front-end glassmorphism navigation site with Cloudflare KV cloud storage — your data syncs across devices and never gets lost.

## 🌐 在线体验 / Live Demo

| 入口 / Entry | 地址 / URL |
|------|------|
| 前台首页 / Public page | https://daohang.404code.top |
| 个人导航后台 / Personal dashboard | https://daohang.404code.top/dashboard |

> 首次进入个人后台：注册一个账号即可使用，数据自动存到你的云端。
> On first visit to the dashboard, register an account — your data is stored in the cloud automatically.

## ✨ 特性 / Features

- 🪟 **毛玻璃 UI** — `backdrop-filter` 毛玻璃效果 + 动态渐变/视频背景
- ☁️ **云端存储** — Cloudflare Pages Functions + KV，换电脑、换浏览器登录即恢复（含便签）
- 👥 **公共 + 个人双模式** — 未登录看公共导航；登录后可编辑自己的导航
- 📝 **便签** — 自动保存 + 手动「💾 保存 / 🔄 刷新」，多设备自动同步
- 🔍 **实时搜索** — 按名称/描述筛选，支持一键跳必应
- 📥 **书签导入** — 一键导入 Chrome/Edge/Firefox 导出的 HTML 收藏夹
- 🎨 **自定义背景** — 渐变 / 纯色 / 图片 / 视频（内置 100 个视频背景）
- ⚡ **纯前端 + Functions** — 无需 PHP / MySQL / 数据库服务器
- 📱 **响应式** — PC / 平板 / 手机自适应

## 🚀 部署到 Cloudflare Pages / Deploy

### 1. 创建 KV 命名空间

Cloudflare Dashboard → **Workers & Pages** → **KV** → 创建命名空间，记下 **KV ID**。

### 2. 填写 `wrangler.toml`

本仓库不含现成的 `wrangler.toml`（避免泄露原站账号配置），请新建：

```toml
name = "navdao"
pages_build_output_dir = "."
compatibility_date = "2025-09-01"

[[kv_namespaces]]
binding = "NAV_KV"
id = "你的KV命名空间ID"   # ← 填你的 KV ID
```

> 静态托管与 API 由根目录 `_worker.js`（Pages Functions）统一处理，无需额外构建步骤。

### 3. 部署 / Deploy

```bash
npm i -g wrangler
wrangler login
wrangler pages deploy . --project-name navdao
```

或直接在 Cloudflare Dashboard 用「直接上传」把本目录拖上去（需先绑定 KV）。

### 4. 验证

访问 `/dashboard`，左上角出现 ☁️ 图标即表示云存储已启用。

## 📁 项目结构 / Structure

```
├── index.html          # 前台首页
├── dashboard.html      # 个人导航后台（含便签）
├── admin.html          # 超级管理员后台
├── _worker.js          # Pages Functions 后端（API + 静态托管）
├── _headers            # Cloudflare 安全响应头
├── css/style.css       # 样式
├── js/
│   ├── data.js         # 数据层 + 云存储通信
│   ├── app.js          # 前台渲染
│   └── admin.js        # 管理员后台逻辑
└── videos/bg/          # 100 个视频背景
```

## 🔒 安全说明 / Security Notes

- 个人账号：用户名 + 密码（SHA-256 哈希存 KV）
- 管理员后台：默认需通过 `PUT /api/admin/password` 自行设置/修改密码
- 部署后请立即修改管理员密码

## 📄 许可证 / License

[MIT](./LICENSE)
