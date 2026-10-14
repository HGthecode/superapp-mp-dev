# 托管 H5 能力清单

> 包内静态资源必须打进 zip。登录态由 App 壳注入，**页面不要写 Cookie**。平台共享库见 [platform-libs.md](platform-libs.md)。

## 1. 壳业务：SuperApp

App 用 `x-webview-u` 打开微应用。页面先加载 `tmuiJssdk`，再加载 `super-app-jssdk`，通过 `SuperApp` 调用业务方法（内部走 `tmuiJssdk.callMethod`）。

```js
// Source: skills/super-app-mp-dev
SuperApp.getUserInfo().then(user => { /* id nickname avatar phone code */ })
SuperApp.close()
SuperApp.openMicroApp({ appid: 'xxxxxxxx', query: { from: 'demo' } })
SuperApp.setTitle('订单详情')
SuperApp.getEnterOptions().then(opts => { /* { appid, query } */ })
```

| 方法 | 说明 | 是否需表单声明权限 |
| --- | --- | --- |
| `getUserInfo` | 当前登录用户（不含 token） | 否 |
| `close` | 关闭当前微应用页 | 否 |
| `openMicroApp` | 按 appid 打开已上架微应用 | 否 |
| `setTitle` | 改壳导航栏标题 | 否 |
| `getEnterOptions` | 读取打开参数 | 否 |

开放平台预览无完整壳通道，上述方法会失败；请在 App 内验证。

## 2. 通用能力：tmuiJssdk

toast、选图、文件、缓存、定位、扫码等继续直接调用 `tmuiJssdk.*`（与 uni-app API 习惯相近）。

| 示例 | 说明 | 是否需表单声明权限 |
| --- | --- | --- |
| `tmuiJssdk.showToast` | 提示 | 否 |
| `tmuiJssdk.chooseImage` / `chooseMedia` / `chooseFile` | 相册/相机/文件 | 相册等对应档位 |
| 存储 / 设备信息等 | 见 tmui 混合开发文档 | 按能力声明 |

App 端按应用已声明权限拒绝调用为后续工作；上传时仍须声明将要使用的档位。

## 3. 表单权限档位

上传时声明，写入审核契约：

- 不需要权限
- 相册照片与视频
- 设备摄像头
- 设备麦克风

未声明的能力不得调用。

## 4. 可用 Web 能力

标准 HTML / CSS / JS、Canvas 2D / WebGL（纹理须包内）、`localStorage` / `sessionStorage` / `IndexedDB`、`<input type="file">`、用户手势触发的 `getUserMedia`（须已声明权限）。样式优先平台 Tailwind。

## 5. 不可用或须改写

| 分类 | 说明 | 替代 |
| --- | --- | --- |
| 根路径资源 | `/assets/...` | 改为 `./assets/...` |
| 非平台外链 | 其它 CDN 或写死域名 | 打进 zip，或改用 `__SUPER_APP_STATIC__/mp|tmuijssdk/` |
| 内联脚本 | `<script>` 内联、`onclick=`、`eval` | 外置 `.js` + `addEventListener` |
| Cookie 登录 | 页面写 Cookie | 用 `SuperApp.getUserInfo()` |
| iframe | 禁止 | 内容写进页面 |
| 外链跳转 | `window.open`、站外 `location` | 单页内切换；其它微应用用 `SuperApp.openMicroApp`；业务 API 走白名单域名 |

## 6. 改写扫描清单

```
/assets/ 或 src="/ 或 href="/   —— 根路径，必须改为 ./
<script>...</script> 内联、onclick=、eval(、new Function(
<script src="https://  / <link href="https://  —— 改用 __SUPER_APP_STATIC__/mp|tmuijssdk/
<iframe> / <object> / <base href
document.cookie =   —— 登录态勿写 Cookie
其它自定义 Bridge.invoke  —— 改为 SuperApp.*
```
