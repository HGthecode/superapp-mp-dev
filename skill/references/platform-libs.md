# 平台共享库

> **不要在 zip 里写死域名。** 使用占位符 `__SUPER_APP_STATIC__`，托管时由后端按当前环境配置替换。

## 占位符（推荐）

配置项 `platform_static_base_url`（本地默认 `http://localhost:8900/static`，与托管页同域）：

| zip 内写法 | 托管后示例 |
| --- | --- |
| `__SUPER_APP_STATIC__/mp/tailwind.1.0.0.css` | `http://localhost:9174/static/mp/tailwind.1.0.0.css` |
| `__SUPER_APP_STATIC__/mp/vant.4.9.21.css` | … |
| `__SUPER_APP_STATIC__/mp/superapp-ui.1.0.0.css` | … |
| `__SUPER_APP_STATIC__/mp/vue.3.5.13.global.prod.js` | … |
| `__SUPER_APP_STATIC__/mp/vant.4.9.21.min.js` | … |
| `__SUPER_APP_STATIC__/tmuijssdk/tmuiJssdk1.0.0.min.js` | … |
| `__SUPER_APP_STATIC__/mp/super-app-jssdk.1.0.0.js` | … |
| `__SUPER_APP_STATIC__/mp/super-app-open.1.0.0.js` | … |

仅允许 `__SUPER_APP_STATIC__/mp/` 与 `__SUPER_APP_STATIC__/tmuijssdk/`。换测试/正式域名只改服务端配置，不必重打包。

API 网关由托管页自动注入 `./__superapp_env.js`（`window.__SUPER_APP_API_ORIGIN__`），`SuperAppOpen` 会优先读取，无需在业务代码写死。

## 兼容：绝对 URL 白名单

仍可用绝对地址，但 origin 必须在 `platform_static_origins` 内，且 path 以 `/static/mp/` 或 `/static/tmuijssdk/` 开头。**新项目请用占位符。**

## 引用顺序（新项目默认）

```html
<link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/tailwind.1.0.0.css" />
<link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/vant.4.9.21.css" />
<link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/superapp-ui.1.0.0.css" />
<link rel="stylesheet" href="./assets/style.css" />
<!-- 跨域加载平台脚本须带 crossorigin（托管端也会自动补） -->
<script src="__SUPER_APP_STATIC__/tmuijssdk/tmuiJssdk1.0.0.min.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/super-app-jssdk.1.0.0.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/super-app-open.1.0.0.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/vue.3.5.13.global.prod.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/vant.4.9.21.min.js" crossorigin></script>
<script src="./assets/main.js"></script>
```

## 标准 UI（Vue 3 + Vant 4）

新微应用**必须**引用平台 Vue / Vant / `superapp-ui`，**禁止**公网 CDN 与第二套组件库，**禁止**把 Vue/Vant 打进 zip。

- 界面组件用 `<van-*>`（按钮、单元格、表单、导航栏、标签页、列表、弹层、选择器、空态等）
- **HTML 里禁止 `<van-xxx />` 自闭合**：浏览器会把后续节点吞进该标签，页面只剩导航栏等异常。须写成 `<van-xxx></van-xxx>`
- 页面内提示用 `vant.showToast` / `vant.showDialog`（不要自写 toast）
- `#app` 内写模板，事件用 `@click` / `v-on:click`，禁止 `onclick=`
- `main.js`：`Vue.createApp(...).use(vant).mount('#app')`
- 换肤：在 `./assets/style.css` 覆盖 `--sa-*` 或 `--van-*`；用户明确要求特殊样子时，局部可用 Tailwind 手写，主色/底色/字色仍用同一套变量
- 不要改 `van-*` 内部 DOM；业务 JS 禁止 `eval` / `new Function`（模板编译在平台 Vue 文件内完成）

可用 CLI 生成起步目录：`sa-mp create <目录>`。

## Tailwind

用于布局、间距、尺寸。优先平台 `tailwind.1.0.0.css`。变体仅 `hover` / `focus` / `active` / `disabled`。

不支持任意值（如 `p-[12px]`）。缺的样式写在包内 `./assets/style.css`。

## SuperApp（壳业务）

依赖先加载 `tmuiJssdk`。页面只调 `SuperApp`。

| 方法 | 说明 |
| --- | --- |
| `SuperApp.getUserInfo()` | 当前登录用户：`id` / `nickname` / `avatar` / `phone` / `code`（无 token） |
| `SuperApp.close()` | 关闭当前微应用页 |
| `SuperApp.openMicroApp({ appid, query })` | 打开另一个已上架微应用 |
| `SuperApp.setTitle(title)` | 改壳导航栏标题 |
| `SuperApp.getEnterOptions()` | 本次打开的 `{ appid, query }` |

选图、缓存等走 `tmuiJssdk.*`。开放平台预览无完整壳通道，请在 App 内验证。

## SuperAppOpen（开放平台接口）

```js
// Source: skills/super-app-mp-dev
SuperAppOpen.request('/microApps/catalog/pageList', { pageIndex: 0, pageSize: 20 })
```

勿在 zip 内写死 `apiOrigin`。虚拟表等接口后续再扩展。

## 自检

- [ ] 平台库用 `__SUPER_APP_STATIC__/mp|tmuijssdk/...`，无写死域名
- [ ] 已引用 Vue + Vant + `superapp-ui`，无第二套 UI、无公网 CDN
- [ ] 脚本顺序：`tmuiJssdk` → `super-app-jssdk` → `super-app-open` → `vue` → `vant` → 业务 `main.js`
- [ ] 布局用 Tailwind；组件用 Vant；换肤只改 CSS 变量
- [ ] 业务交互走 `SuperApp.*`；页面提示走 `vant.showToast` 等
- [ ] 开放平台请求走 `SuperAppOpen.request`
