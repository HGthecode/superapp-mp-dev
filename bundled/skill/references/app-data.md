# 微应用数据（虚拟表）

平台为每个微应用提供托管数据能力：用 `data/schema.json` 定义表结构，运行时用 `SuperAppData` 做行级增删改查。**不要**把数据库地址或连接串写进页面，也**不必**为此申报业务域名（走平台 API origin）。

## 强制：建表 / 改表先计划、确认后再动手

涉及**新建表、改字段、改权限**，或「稍微复杂」且会落到数据模型的需求时：

1. **先写计划**（可直接贴表结构草案），不要立刻改 `data/schema.json`、不要 `sa-mp data push`
2. 计划至少写清：页面/流程、每张表字段、每张表权限、publish 与否
3. **等开发者确认**（明确说「确认 / 可以 / 按这个做」等）后再改文件并 push
4. 已发布字段：**不可改名、不可改类型**；只能加可选字段或改标题/权限；破坏性变更须在计划里单独说明

字段草案示例（确认后再写入 schema）：

| 表 | 字段 | 类型 | 必填 | 索引 | 说明 |
| --- | --- | --- | --- | --- | --- |
| products | title | string | 是 | 是 | 商品名 |
| products | price | decimal | 是 | 否 | 价格 |

| 动作 | 主体 |
| --- | --- |
| list / get | public |
| create | auth |
| update / delete | owner |

## schema 即代码

应用根目录（不进 zip）：

```json
{
  "appid": "mp...",
  "backend": "managed",
  "tables": [
    {
      "name": "products",
      "title": "商品",
      "description": "",
      "fields": [
        {
          "name": "title",
          "title": "标题",
          "fieldType": "string",
          "required": true,
          "unique": false,
          "indexed": true,
          "defaultValue": "",
          "clientReadable": true,
          "clientWritable": true,
          "sortOrder": 1
        }
      ],
      "permissions": [
        { "action": "list", "subject": "public" },
        { "action": "get", "subject": "public" },
        { "action": "create", "subject": "auth" },
        { "action": "update", "subject": "owner" },
        { "action": "delete", "subject": "owner" }
      ]
    }
  ]
}
```

字段类型：`string` / `text` / `int` / `decimal` / `bool` / `datetime` / `json` / `ref`（一期只存 id）。

权限主体：`deny`（默认）/ `public` / `auth`（需登录会话）/ `owner`（仅创建者）。

## CLI

API Key 需含 `data:schema`（新建 Key 默认已含）。

```bash
sa-mp data pull
sa-mp data diff
sa-mp data push
sa-mp data push --publish
```

`push --publish` 会把草稿同步到物理表（preview + prod）。

## 运行时 SDK

在 `index.html` 引用（`super-app-jssdk` 之后）：

```html
<script src="__SUPER_APP_STATIC__/mp/super-app-fn.1.0.0.js" crossorigin></script>
```

```js
// Source: skills/super-app-mp-dev
// 开发/调试默认 preview；上线前再显式传 env: 'prod'
const listed = await SuperAppFn.call('listProducts', { page: 1, pageSize: 20 }, { env: 'preview' })
```

页面不要直接调虚拟表增删改查。列表、下单、改状态都写成 `functions/*.js`，用 `SuperAppFn.call`。`SuperAppData` 仅保留给旧页面；新页面不要引用。

`SuperAppFn` / `SuperApp.getDataSession` **默认环境为 `preview`**（物理表 `ad_*_preview`）。正式环境必须显式 `{ env: 'prod' }`。`preview` 与 `prod` 数据互不相通；开放平台「数据」页默认看 `prod`，本地调试请切到「预览」。

`SuperAppFn` 通过 `SuperApp.getDataSession` 向宿主换调用凭证（宿主调 `/data/session/issue`）。未登录时凭证的 `userId` 为 0，只能调 `auth: public` 的函数。宿主已登录时，凭证带上会员 `userId`，`ctx.user.id` 由服务端写入，不要在入参里传用户 id。本地 `sa-mp preview` 调试壳走同一套。控制台 `sa-mp console` 调 `auth: open` 时环境固定为 `preview`（见 [console.md](console.md)）。

## 云函数（业务动作）

跨表、扣库存、状态机以及页面上的查列表，都放 `functions/*.js`（不进 zip），用 `sa-mp fn push [--publish]`。是否要登录写在 `functions/meta.json` 的 `auth`，不由换票接口决定。

| auth | 谁能调用 |
| --- | --- |
| `public` | 匿名 app 凭证（未登录） |
| `member` | 凭证里有会员。旧值 `auth` 等同 `member`。缺省也是 `member` |
| `open` | 仅开放平台开发者 JWT，且组织与该应用一致。控制台发货等按钮用这个，不走 `getDataSession` |

```json
{
  "functions": {
    "listProducts": { "auth": "public", "title": "商品列表" },
    "placeOrder": { "auth": "member", "title": "下单" },
    "shipOrder": { "auth": "open", "title": "发货" }
  }
}
```

```js
// Source: skills/super-app-mp-dev
exports.main = function (event, ctx) {
  return ctx.db.transaction(function (tx) {
    var ok = tx.adjust('products', event.productId, 'stock', -1, { gte: 1 })
    if (!ok) throw new Error('OUT_OF_STOCK')
    return tx.create('orders', { /* ... */ })
  })
}
```

页面：`SuperAppFn.call('placeOrder', { productId, qty }, { env, idempotencyKey })`（需引用 `super-app-fn.1.0.0.js`）。

`auth: member` 的函数在未登录时返回「需要登录」。页面先 `SuperApp.getUserInfo()`（宿主未登录会引导登录；该用户对该应用首次会弹出资料授权），成功后 `SuperAppFn.resetSession()`，再重新 `call`。授权后的昵称、头像、手机号由页面自己用云函数存表。

preview 跑草稿，prod 跑已发布快照。`ctx.user.id` 只来自凭证，未登录时为 `"0"`。`tx.*` 为管理员通道（忽略 `clientWritable`）。`ctx.open.notify.enqueue` 写入出箱，提交后异步处理。

## 自检

- [ ] `data/schema.json` 存在且未打进 zip
- [ ] 已 `sa-mp data push --publish`
- [ ] 页面引用 `super-app-fn.1.0.0.js`，数据访问走云函数，不直连虚拟表 CRUD
- [ ] `functions/meta.json` 为每个函数写了 `public` / `member` / `open`
- [ ] 未在页面写数据库连接串 / AppSecret
- [ ] 表权限已按业务设置（默认 deny）
