# 控制台（开放平台页签）

控制台是微应用包里的桌面管理页，嵌在开放平台应用详情的「控制台」页签里。用来做订单、发货这类 `auth: open` 操作。它不是 C 端页面，也不要把脚本注入开放平台本身。

## 目录

与 `index.html` 同级，打进 zip：

```
admin/
├── manifest.json
├── index.html
├── orders.html
└── assets/
    └── orders.js
```

`manifest.json` 只写菜单标题和入口文件，不写表格、表单或接口：

```json
{
  "title": "商城后台",
  "menus": [
    { "title": "订单", "entry": "orders.html" }
  ]
}
```

`entry` 只能是 `admin/` 内的相对 `.html`。没有 manifest 时只打开 `admin/index.html`。

## 页面

引用平台托管的 Admin 依赖与薄封装 `admin-ui`，不要把 Vue、Element Plus 打进 zip，不要请求开放平台枚举。顺序不可乱。

```html
<link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/element-plus.2.13.6.css" />
<link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/vxe-pc-ui.4.13.3.css" />
<link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/vxe-table.4.17.46.css" />
<link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/vxe-plugin-render-element.4.1.1.css" />
<link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/vue-ui-plus.0.0.5.css" />
<link rel="stylesheet" href="__SUPER_APP_STATIC__/mp/admin-ui.1.0.0.css" />

<script src="__SUPER_APP_STATIC__/mp/vue.3.5.13.global.prod.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/xe-utils.3.7.0.umd.min.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/dayjs.1.11.20.min.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/element-plus.2.13.6.full.min.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/element-plus.2.13.6.zh-cn.min.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/vxe-pc-ui.4.13.3.umd.min.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/vxe-table.4.17.46.umd.min.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/vue-ui-plus.0.0.5.min.js" crossorigin></script>
<script src="__SUPER_APP_STATIC__/mp/admin-ui.1.0.0.js" crossorigin></script>
<script src="./assets/orders.js"></script>
```

`admin-ui.1.0.0.js` / `.css` 是平台手写薄封装（`SuperAppAdmin.createApp` / `call`），直接改 `platform-static/mp/` 下这两个文件即可，无需再从 open 工程打包。

```js
SuperAppAdmin.createApp({
  mounted() {
    SuperAppAdmin.call('listAdminOrders', { page: 1, pageSize: 20 }).then((res) => {
      this.rows = res.list || []
    })
  },
}).mount('#app')
```

`call` 只经父页面转发。父页面带开发者登录态调用云函数，并锁定当前 `appid` 与环境。页面里不要写 JWT、AppSecret，也不要自己 `fetch` 开放平台接口。

云函数在 `functions/meta.json` 里把控制台动作标成 `auth: open`，用 `sa-mp fn push` 推送，不要打进 zip。

## 地址

`admin/` 会进版本包，但 `/a/{appid}/admin/` 和 `/p/{token}/admin/` 返回 404。页签通过短时票据打开 `/c/{ticket}/`，票据不能当接口凭证。

## 本地调试

不要用 `/mp/debug`（那是 C 端会员壳）。先登录开放平台，再在应用目录执行：

```bash
sa-mp console
```

默认监听 `127.0.0.1:5180`，与 `sa-mp preview` 的 `5179` 分开，两个进程可以同时开。命令只在本机提供文件，并打开已登录的控制台页。此模式云函数环境固定为 `preview`。改页面不用上传；改云函数仍要 `sa-mp fn push`。

详情页「控制台」不带本地地址时，看的是已上传包：预览或正式。

## 自检

- [ ] 存在 `admin/index.html`（及可选 `manifest.json`）
- [ ] 依赖全部 `__SUPER_APP_STATIC__/mp/...`，顺序与上文一致，无 jsDelivr / 无把 EP 打进 zip
- [ ] 业务只用 `SuperAppAdmin.createApp` / `call` / `ElMessage`，无 JWT、无直连开放平台 API
- [ ] 相关云函数 `auth: open`，已 `sa-mp fn push`（按需 `--publish`）
- [ ] 本地用 `sa-mp console` 调试，未误用 `/mp/debug`
- [ ] 清楚 `preview` / `prod` 数据隔离；本地 console 固定 `preview`
