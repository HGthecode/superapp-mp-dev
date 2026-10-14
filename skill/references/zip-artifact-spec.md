# 托管 H5 ZIP 静态包规范

> 页面运行在路径前缀 `/a/{appid}/`（预览为 `/p/{token}/`）下，**包内资源必须用相对路径**。平台共享库走开放平台静态 origin，见 [platform-libs.md](platform-libs.md)。

## 1. 目录结构与打包

**唯一硬性要求：`index.html` 位于 zip 根目录作为入口。**

```
app.zip
├── index.html        # 必需 — 入口，必须在根目录
└── assets/
    ├── style.css
    ├── main.js
    └── images/
```

| 路径 | 要求 |
| --- | --- |
| `index.html` | 必须在 zip 根目录 |
| 其余文件 | 自由组织，相对路径引用 |

### 禁止出现在 zip 内

- `node_modules`、`.git`、`.DS_Store`
- `*.map`、构建配置（`vite.config.*`、`webpack.config.*` 等）
- 多套一层目录导致 `index.html` 不在根（错误：`app/index.html`）

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
| 单页 | 一个 `index.html`，视图 JS 切换 | 多 HTML 站点 |

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

托管时 `__SUPER_APP_STATIC__` 替换为配置 `platform_static_base_url`（换环境只改服务端配置）。完整示例见 skill 内 `templates/vanilla/`。

## 5. 打包前自检

- [ ] `index.html` 在 zip 根目录，未多套一层目录
- [ ] 仅含支持的文件类型，无开发垃圾文件
- [ ] 包内资源为相对路径 `./`，无以 `/` 开头的路径，无 `<base href>`
- [ ] 平台库用 `__SUPER_APP_STATIC__/mp|tmuijssdk/...`，无写死域名
- [ ] 已引用 Vue + Vant + `superapp-ui`，未把框架打进 zip
- [ ] 脚本全部外置：无内联 script、无行内事件、无 eval / new Function
- [ ] 无 iframe / object、无自建 CSP meta
- [ ] 推荐总包 < 20MB；单图 < 500KB
