# 打包上传 CLI（sa-mp）

CLI 已发布为全局命令 `sa-mp`（仓库 [superapp-mp-dev](https://github.com/HGthecode/superapp-mp-dev)，Node.js 18+，无额外依赖）。

## 安装

```bash
npm install -g sa-mp
sa-mp skill install all --target cursor --target codex
# 或: sa-mp skill install super-app-mp-dev --target cursor
# 或: sa-mp skill install（交互选择）
sa-mp config set --base-url https://你的开放平台域名/api/open --api-key sa_你的密钥
```

本地联调示例：`--base-url http://localhost:8900/api/open` 或 `http://localhost:9174/api/open`。

配置写入 `~/.superapp/mp.json`。也可用环境变量：

```bash
SUPER_APP_OPEN_BASE_URL=https://你的开放平台域名/api/open
SUPER_APP_API_KEY=sa_...
```

## 项目配置

应用根目录（与 `index.html` 同级）放置 `config.json`、`README.md`（均进 git，打包时排除）。开发前确认见 [project-brief.md](project-brief.md)。`config.json` 示例：

```json
{ "appid": "mpxxxxxxxx" }
```

```bash
sa-mp init --appid mpxxxxxxxx
```

## 命令

在应用目录执行（可省略目录与 `--appid`）：

```bash
sa-mp create ./my-h5-app
sa-mp preview
sa-mp console
sa-mp pack
sa-mp next-version
sa-mp submit --changelog "修复滚动" --yes
```

| 命令 | 作用 |
| --- | --- |
| `create [目录]` | 生成无构建起步目录（C 端 Vue/Vant + `admin/` 控制台起步） |
| `init [--appid]` | 写 `config.json` |
| `config set / show` | 本机 base-url、api-key、skill-source |
| `pack [-o out.zip]` | 打 zip（排除 `config.json`） |
| `preview` | 本地 serve + 打开 `/mp/debug` |
| `console` | 本地 serve `admin/`（默认 5180）+ 打开已登录的控制台页 |
| `next-version` | 建议下一版本号 |
| `submit [--version] [--changelog] [--yes]` | 打包并上传检测 |
| `skill install [all\|name...]` / `list` / `update` / `status` | 安装 / 列出 / 更新 AI Skill |
| `doctor` | 环境自检 |
| `upgrade` | 更新全局 npm 包（不含 Skill） |

## 本地预览（不上传）

```bash
sa-mp preview
# 可选
sa-mp config set --static-base http://localhost:8900/static --open-web-base http://localhost:9174
```

调试壳：`{openWebBase}/mp/debug?appid=...&url=http://127.0.0.1:{port}/`

控制台调试见 [console.md](console.md)：`sa-mp console` 打开 `{openWebBase}/microApps/console?appid=...&debug=http://127.0.0.1:{port}/admin/`。

## AI 提交流程（强制）

用户说「提交 / 上传 / 发布版本」时：

1. **禁止**直接带 `--yes` 执行 submit
2. 若未给版本号：先 `sa-mp next-version` 取建议版本
3. 若未给更新描述：changelog 视为空字符串
4. 向用户输出确认块并等待明确回复「确认」：

```
即将提交微应用：
- appid: xxx
- 目录: ...
- 版本号: x.y.z
- 更新描述: （空）或用户原文
请回复「确认」后执行上传。
```

5. 用户确认后才执行：

```bash
sa-mp submit --version ... --changelog "..." --yes
```

（须在应用目录，或加 `--dir`）

6. 根据返回的 `passed` / `scanReport` 告知结果；失败则改包后再走确认流

## Skill 更新

```bash
sa-mp skill update    # 拉最新 skills/*/ 与 create 模板
sa-mp skill list
sa-mp skill status
```

与 `sa-mp upgrade`（只更新 CLI npm 包）分开。

## 鉴权说明

- Header：`X-SuperApp-Api-Key: sa_...`（也支持 `Authorization: Bearer sa_...`）
- Key 绑定创建时的组织；吊销后立即失效
- 上传支持表单字段 `appid`（字符串）或 `app_id`（数字主键）
