# 业务域名白名单

托管 H5 允许 `fetch` / `XMLHttpRequest`，但主机必须落在开放平台表单声明、并经审核通过的业务域名列表内。

## 规则

- 只允许精确 `https` origin，例如 `https://api.example.com`
- 不允许 `*`、不允许仅域名无协议、不允许 `http`（本地调试除外由平台策略决定）
- 未声明任何业务域名时，页面内不得发起联网请求（**平台 API origin 除外**）
- CSP 的 `connect-src` 包含已审业务 origin，以及配置的 `platform_api_origins`
- 通过 `SuperAppOpen.request` 访问开放平台网关时，不必把网关写入业务域名

## 写法示例

```js
// Source: skills/super-app-mp-dev（业务域名须先在开放平台声明）
fetch('https://api.example.com/v1/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 1 }),
})

// 开放平台接口走 SuperAppOpen，无需写入业务域名
SuperAppOpen.request('/microApps/catalog/detail', { appid: 'xxxxxxxx' })
```

上传 zip 时把自有业务 API 的 `https://api.example.com` 填入「业务域名」。检测会扫描包内 URL；未在列表中且不在平台 API 白名单的主机将导致检测失败。

## 自检

- [ ] 所有自有 `fetch` / XHR / WebSocket 主机已在表单业务域名中
- [ ] 开放平台网关仅经 `SuperAppOpen`，未误填成业务域名依赖以外的第三方 API
- [ ] 静态资源仅 `__SUPER_APP_STATIC__/mp|tmuijssdk/` 或包内相对路径
