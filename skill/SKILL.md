---
name: super-app-mp-dev
description: >-
  SuperApp 托管 H5 微应用构建指南：把页面打包成符合平台规范的 zip，
  供开放平台上传检测、预览与审核发布。新建或改写托管 H5（C 端 Vue/Vant）与
  开放平台控制台 admin/（Element Plus + vue-ui-plus + SuperAppAdmin）、
  打包 zip、用全局 CLI sa-mp（Node 18+）本地 preview/console/提交版本、
  处理路径/CSP/平台共享库/JSBridge/业务域名/虚拟表与 auth:open 云函数时使用。
metadata:
  version: "2.2.0"
---

# SuperApp 托管 H5 ZIP 构建指南

托管 H5 是平台托管的静态包应用：你写一套**无构建**网页（以 `index.html` 为入口），打包成 `.zip`，上传到开放平台。检测通过后可预览、提交审核；审核通过后以路径 `https://micro-app.{域名}/a/{appid}/` 打开。

多页面时**每个页面一个 html**。C 端页面跳转只用 `SuperApp.navigateTo` / `redirectTo` / `reLaunch` / `navigateBack`，禁止 hash 或单文件整页切换。

- **C 端**：业务脚本与图片打进 zip；布局用平台 Tailwind；组件用平台 **Vue 3 + Vant 4 + superapp-ui**；壳通讯用 `tmuiJssdk` + `SuperApp`；开放平台接口用 `SuperAppOpen`；业务数据用 `SuperAppFn`（默认环境 `preview`）。
- **控制台**：同包内的 `admin/`（桌面管理页），组件用平台 **Element Plus + VXE + vue-ui-plus**，经 `SuperAppAdmin.call` 调 `auth: open` 云函数。本地用 `sa-mp console`（默认 5180），不要用 `/mp/debug`。

网络请求只能访问表单声明并过审的业务域名（平台 API origin 除外）。

目标产物：可直接上传的 **`.zip` 静态包**，或经 CLI 直接提交（提交时直接打包目录，不跑 Vite）。

开发者须已全局安装 CLI：`npm install -g sa-mp`，并用 `sa-mp skill install` 把本 Skill 挂到 AI 工具。

## 强制：开发前先确认并写入 README

**新建、从零改写、或新增一整块业务之前**，禁止直接写代码 / `create` / 改 schema / `push`。必须先读 [project-brief.md](references/project-brief.md)，按其中**必问清单**与开发者确认（应用名、简介、主题三色、C 端功能、是否要控制台、登录与数据等），汇总请其回复「确认」后，写入应用根目录 **`README.md`**，再进入后续步骤。

仅改文案、修 bug、调已有样式且不扩大功能范围时，可跳过；但若改主题色或增删功能模块，须先更新 `README.md` 并经确认。

## 强制：复杂需求先出计划再动手

以下场景**禁止直接改代码 / 改 schema / 执行 `sa-mp data push`**，必须先给出开发计划，**等开发者明确确认后再实现**：

- 稍复杂的业务需求（多页面、多流程、预约/下单/库存等）
- **新建或修改**虚拟表（含增字段、改权限、改类型意图）
- 会同时动到页面结构 + 数据模型的需求
- **新建或改造**开放平台控制台（`admin/` 菜单、发货/审核等 `auth: open` 动作）

计划须至少包含：

1. **功能与页面**：C 端页面 / 控制台菜单；主流程步骤
2. **数据表设计**：每张表的逻辑名、标题、字段列表（`name` / `fieldType` / 必填 / 索引 / 说明）、权限（list/get/create/update/delete → subject）
3. **云函数与 auth**：`public` / `member` / `open` 分别给谁用
4. **环境与发布**：开发默认 `preview`；是否 `push --publish`；正式环境何时切 `prod`
5. **风险**：已发布字段不可改类型等约束；破坏性变更如何处理

确认话术示例：「以上表结构与开发计划是否按此执行？确认后我再改 `data/schema.json` 并写页面。」

简单改文案、调样式、单字段展示且**不改表**时，可直接做，不必走本流程。表结构设计细则见 [app-data.md](references/app-data.md)。

## 何时使用

- 从零新建托管 H5——**先**走 [project-brief.md](references/project-brief.md)，再 `sa-mp create`（含 C 端 + `admin/` 起步）并打包成 `.zip`
- 将已有 H5 改写为平台规范并打包
- 用户说「本地预览 / H5 调试」——`sa-mp preview`（`/mp/debug`，默认 5179）
- 用户说「控制台 / admin / 后台 / 发货管理」——先读 [console.md](references/console.md)，用 `sa-mp console`（默认 5180）
- 用户说「存业务数据 / 虚拟表 / 商品订单预约」——先读 [app-data.md](references/app-data.md)
- 用户说「提交 / 上传版本 / 发布到开放平台」——走 CLI 提交流程

## 工作流程

每一步动手前必须先读对应 reference 并严格遵守：

0. **开发前确认** — 先读 [project-brief.md](references/project-brief.md)；必问齐全 → 开发者确认 → 写入根目录 `README.md`（未完成禁止继续）
1. **平台共享库** — 先读 [platform-libs.md](references/platform-libs.md)（C 端 Vue/Vant；控制台见 Admin 依赖）
2. **新建目录** — `sa-mp create <目录>` 或空目录 `sa-mp create`；再读 [zip-artifact-spec.md](references/zip-artifact-spec.md)；用已确认内容覆盖模板里的 `README.md`
3. **项目配置** — `sa-mp init --appid mp...`
4. **本地预览（C 端）** — `sa-mp preview`（`/mp/debug` + 本地 iframe，默认 `preview` 数据环境）
5. **控制台（按需）** — 先读 [console.md](references/console.md)；维护 `admin/` + `auth: open` 云函数；本地 `sa-mp console`（与 preview 可同时开）
6. **能力与 Bridge** — 先读 [device-capabilities.md](references/device-capabilities.md)
7. **业务域名** — 先读 [business-domains.md](references/business-domains.md)
8. **跨端适配** — 先读 [cross-platform-h5.md](references/cross-platform-h5.md)
9. **虚拟表 / 云函数（按需）** — 先读 [app-data.md](references/app-data.md)；**先计划并经确认**，再维护 `data/schema.json`、`functions/*.js` 与 `functions/meta.json`，执行 `sa-mp data push --publish` / `sa-mp fn push --publish`。C 端只用 `SuperAppFn`；控制台只用 `SuperAppAdmin.call`
10. **打包** — 逐条核对各 reference 末尾自检清单后再打包
11. **提交上传** — 先读 [submit-cli.md](references/submit-cli.md)；**必须先向用户确认版本号与更新描述，用户回复确认后才执行 `sa-mp submit --yes`**

## Reference

| 文档 | 何时读 |
| --- | --- |
| [project-brief.md](references/project-brief.md) | **最先**：必问清单、确认话术、`README.md` 模板 |
| [platform-libs.md](references/platform-libs.md) | Tailwind、Vue、Vant、Admin 依赖、`SuperApp*` |
| [zip-artifact-spec.md](references/zip-artifact-spec.md) | 目录结构（含 `admin/`）、相对路径、模板、打包自检 |
| [device-capabilities.md](references/device-capabilities.md) | 壳业务方法、相册/相机/麦克风、禁止能力 |
| [business-domains.md](references/business-domains.md) | 业务域名白名单与 `fetch` 规则 |
| [cross-platform-h5.md](references/cross-platform-h5.md) | 触摸、滚动、安全区 |
| [app-data.md](references/app-data.md) | 虚拟表、云函数、`preview`/`prod`、`SuperAppFn` |
| [console.md](references/console.md) | `admin/`、`SuperAppAdmin`、`sa-mp console`、`auth: open` |
| [submit-cli.md](references/submit-cli.md) | API Key、`create` / `preview` / `console` / `submit` |
