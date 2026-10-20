# 托管 H5 ZIP 静态包规范

> 页面运行在路径前缀 `/a/{appid}/`（预览为 `/p/{token}/`）下，**包内资源必须用相对路径**。平台共享库走开放平台静态 origin，见 [platform-libs.md](platform-libs.md)。

## 1. 目录结构与打包

**唯一硬性要求：`index.html` 位于 zip 根目录作为入口。**

```
app.zip
├── index.html          # 必需 — C 端入口，必须在根目录
├── assets/             # C 端样式/脚本/图片
│   ├── style.css
│   ├── main.js
│   └── images/
└── admin/              # 可选 — 开放平台「控制台」页签（打进 zip）
    ├── manifest.json
    ├── index.html
    ├── orders.html
    └── assets/
        └── orders.js
```

| 路径 | 要求 |
| --- | --- |
| `index.html` | 必须在 zip 根目录（C 端） |
| `admin/` | 可选；有则须含 `admin/index.html`；细则见 [console.md](console.md) |
| 其余文件 | 自由组织，相对路径引用 |

### 禁止出现在 zip 内

- `node_modules`、`.git`、`.DS_Store`
- `*.map`、构建配置（`vite.config.*`、`webpack.config.*` 等）
- `config.json`、`README.md`、`data/`、`functions/`（由 CLI 排除；简介与主题写在 README；虚拟表与云函数走 `sa-mp data/fn push`）
- 多套一层目录导致 `index.html` 不在根（错误：`app/index.html`）
- 把 Element Plus / VXE / vue-ui-plus 源码打进 zip（须用 `__SUPER_APP_STATIC__/mp/...`）

### 打包方式

压缩的是「与 `index.html` 同级的那批文件」本身：

```bash
# ✅ 正确
cd dist && zip -r ../app.zip . -x '*.DS_Store'

# ❌ 错误：多一层 dist/
zip -r app.zip dist
```

## 2. 支持的文件类型

`.html` / `.css` / `.js` / `.json` / `.png` / `.jpg` / `.jpeg` / `.gif` / `.webp` / `.svg` / `.woff` / `.woff2`

## 3. 路径与引用规则（关键）

| 规则 | 正确 | 错误 |
| --- | --- | --- |
| 包内资源 | `./assets/main.js` | `/assets/main.js`（根路径会离开本应用） |
| 入口 | 根目录 `index.html` | `src/index.html` |
| base | 不使用 | `<base href="...">` |
| 平台共享库 | `__SUPER_APP_STATIC__/mp/...`、`__SUPER_APP_STATIC__/tmuijssdk/...` | 写死 `http://...` 域名（换环境会挂） |
| 其它静态外链 | 下载后打进 zip | `https://cdn...` |
| 多页面 | 每个页面独立 `.html`，`SuperApp` 跳转 | 一个 html 里用 hash / `v-if` 切换整页 |

### 多页面

`index.html` 只是入口。有多个业务页面时，每个页面一个 html（根目录或 `pages/`），样式和脚本放 `./assets/` 共用。

禁止单文件 hash 路由、禁止用 `v-if` 切换整页。那种做法没有独立历史记录，返回键没法回到上一页，也做不到「关掉当前页再跳」和「清空页面栈再跳」。

页面间只走 `SuperApp` 跳转（见 [device-capabilities.md](device-capabilities.md)）。禁止 `location.href`、`location.hash` 当路由、`window.open`。

脚本必须外置：容器 CSP 的 `script-src` 不含 `unsafe-inline`（含 `unsafe-eval` 仅供壳通道 tmuiJssdk，业务代码仍禁止自用）。禁止内联 `<script>...</script>`、行内事件 `onclick=`、`javascript:` URI。

样式可内联：`<style>` 与 `style="..."` 可用；优先用平台 Tailwind 类。

## 4. index.html 模板

新项目用 CLI 生成（推荐）：

```bash
sa-mp create ./my-h5-app
```

模板要点（无构建，平台托管 Vue + Vant）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>应用标题</title>
  <link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/tailwind.1.0.0.css" />
  <link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/vant.4.9.21.css" />
  <link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/superapp-ui.1.0.0.css" />
  <link rel="stylesheet" href="./assets/style.css" />
</head>
<body>
  <div id="app">
    <!-- 在此写 van-*；须成对闭合（禁止 van-xxx /&gt;）；事件用 @click，禁止 onclick -->
  </div>
  <script src="__SUPER_APP_STATIC__/tmuijssdk/tmuiJssdk1.0.0.min.js" crossorigin></script>
  <script src="__SUPER_APP_STATIC__/mp/super-app-jssdk.1.0.0.js" crossorigin></script>
  <script src="__SUPER_APP_STATIC__/mp/super-app-open.1.0.0.js" crossorigin></script>
  <script src="__SUPER_APP_STATIC__/mp/vue.3.5.13.global.prod.js" crossorigin></script>
  <script src="__SUPER_APP_STATIC__/mp/vant.4.9.21.min.js" crossorigin></script>
  <script src="./assets/main.js"></script>
</body>
</html>
```

托管时 `__SUPER_APP_STATIC__` 替换为配置 `platform_static_base_url`（换环境只改服务端配置）。完整示例见 skill 内 `templates/vanilla/`（含 `admin/` 起步）。

控制台页面模板与依赖顺序见 [console.md](console.md)，不要把 Admin 库打进 zip。

## 5. 打包前自检

- [ ] `index.html` 在 zip 根目录，未多套一层目录
- [ ] 多页面是多个 html；无 hash 路由、无单文件整页 `v-if`
- [ ] 仅含支持的文件类型，无开发垃圾文件
- [ ] 包内资源为相对路径 `./`，无以 `/` 开头的路径，无自写 `<base href>`
- [ ] 平台库用 `__SUPER_APP_STATIC__/mp|tmuijssdk/...`，无写死域名、无公网 CDN
- [ ] C 端已引用 Vue + Vant + `superapp-ui`，未把框架打进 zip
- [ ] 若有 `admin/`：含 `index.html`；依赖顺序正确；未打进 Element Plus/VXE；菜单 `entry` 为相对 `.html`
- [ ] 无 `data/`、`functions/`、`config.json`、`README.md` 进 zip
- [ ] 脚本全部外置：无内联 script、无行内事件、无 eval / new Function
- [ ] 无 iframe / object、无自建 CSP meta
- [ ] 推荐总包 < 20MB；单图 < 500KB
