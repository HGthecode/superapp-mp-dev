---
name: super-app-mp-dev
description: >-
  SuperApp 托管 H5 微应用构建指南：把页面打包成符合平台规范的 zip，
  供开放平台上传检测、预览与审核发布。新建或改写托管 H5、打包 zip、
  用全局 CLI sa-mp（Node 18+）提交版本、处理路径/CSP/平台共享库（Vue/Vant）/JSBridge/业务域名约束时使用。
metadata:
  version: "2.0.0"
---

# SuperApp 托管 H5 ZIP 构建指南

托管 H5 是平台托管的静态包应用：你写一套**无构建**网页（以 `index.html` 为入口），打包成 `.zip`，上传到开放平台。检测通过后可预览、提交审核；审核通过后以路径 `https://micro-app.{域名}/a/{appid}/` 打开。

业务脚本与图片打进 zip；布局用平台 Tailwind；组件用平台 **Vue 3 + Vant 4 + superapp-ui**；壳通讯用 `tmuiJssdk` + `SuperApp`；开放平台接口用 `SuperAppOpen`。网络请求只能访问表单声明并过审的业务域名（平台 API origin 除外）。

目标产物：可直接上传的 **`.zip` 静态包**，或经 CLI 直接提交（提交时直接打包目录，不跑 Vite）。

开发者须已全局安装 CLI：`npm install -g sa-mp`，并用 `sa-mp skill install` 把本 Skill 挂到 AI 工具。

## 何时使用

- 从零新建托管 H5（优先 `sa-mp create`）并打包成 `.zip`
- 将已有 H5 改写为平台规范并打包
- 用户说「提交 / 上传版本 / 发布到开放平台」——走 CLI 提交流程
- 用户说「本地预览」——在应用目录执行 `sa-mp preview`

## 工作流程

每一步动手前必须先读对应 reference 并严格遵守：

1. **平台共享库** — 先读 [platform-libs.md](references/platform-libs.md)（含 Vue / Vant）
2. **新建目录** — 在目标父目录执行 `sa-mp create <目录>`，或在空目录 `sa-mp create`；再读 [zip-artifact-spec.md](references/zip-artifact-spec.md)
3. **项目配置** — 应用根目录 `config.json` 写入 `appid`（`sa-mp init --appid mp...`）
4. **本地预览** — 在应用目录执行 `sa-mp preview`（开放平台 `/mp/debug` 壳 + 本地 iframe，无需上传）
5. **能力与 Bridge** — 先读 [device-capabilities.md](references/device-capabilities.md)
6. **业务域名** — 先读 [business-domains.md](references/business-domains.md)
7. **跨端适配** — 先读 [cross-platform-h5.md](references/cross-platform-h5.md)
8. **打包** — 逐条核对各 reference 末尾自检清单后再打包
9. **提交上传** — 先读 [submit-cli.md](references/submit-cli.md)；**必须先向用户确认版本号与更新描述，用户回复确认后才执行 `sa-mp submit --yes`**

## Reference

| 文档 | 何时读 |
| --- | --- |
| [platform-libs.md](references/platform-libs.md) | Tailwind、Vue、Vant、`tmuiJssdk`、`SuperApp`、`SuperAppOpen` |
| [zip-artifact-spec.md](references/zip-artifact-spec.md) | 目录结构、相对路径、`index.html` 模板、打包自检 |
| [device-capabilities.md](references/device-capabilities.md) | 壳业务方法、相册/相机/麦克风、禁止能力 |
| [business-domains.md](references/business-domains.md) | 业务域名白名单与 `fetch` 规则 |
| [cross-platform-h5.md](references/cross-platform-h5.md) | 触摸、滚动、安全区 |
| [submit-cli.md](references/submit-cli.md) | API Key、`create` / `preview` / `submit`、AI 确认后提交 |
