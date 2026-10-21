# sa-mp / superapp-mp-dev

SuperApp 托管 H5 本地开发工具：全局 CLI `sa-mp` + AI Skill（Vue 3 / Vant / 平台规范）。

- 仓库：https://github.com/HGthecode/superapp-mp-dev
- 要求：Node.js 18+（无额外 npm 依赖）

## 安装

```bash
npm install -g sa-mp
```

开发者只需装这一次 CLI。Skill 与 create 模板通过命令安装 / 更新，不必再手工拷贝 Skill 目录。

```bash
# 列出可用 Skill
sa-mp skill list

# 交互选择 Skill + 挂载目标
sa-mp skill install

# 安装指定 Skill（可多选名称）
sa-mp skill install super-app-mp-dev --target cursor
sa-mp skill install mobile-design-system --target cursor --target codex

# 安装全部
sa-mp skill install all --target cursor --target dsh

# 挂到当前项目
sa-mp skill install all --target cwd

# 自定义路径（可重复）
sa-mp skill install mobile-design-system --path D:\ai-skills

# 更新 Skill 正文与 create 模板（不升 npm 版本）
sa-mp skill update
sa-mp skill status
```

本机开放平台配置（提交前必做）：

```bash
sa-mp config set --base-url http://localhost:9174/api/open --api-key sa_你的密钥
sa-mp config show
```

## 日常开发

在含 `index.html` 的应用目录（例如 `testDemo`）：

```bash
sa-mp init --appid mpxxxxxxxx   # 写入 config.json
sa-mp preview                   # 本地预览 + Debug 壳
sa-mp pack                      # 打包（排除 config.json）
sa-mp next-version
sa-mp submit --changelog "修复滚动" --yes
```

新建应用：

```bash
sa-mp create ./my-h5-app --appid mpxxxxxxxx
cd my-h5-app
sa-mp preview
```

## 命令一览

| 命令 | 说明 |
| --- | --- |
| `sa-mp create [目录]` | 生成无构建起步目录（Vue + Vant） |
| `sa-mp init [--appid]` | 写项目 `config.json` |
| `sa-mp preview` | 本地 serve + `/mp/debug` |
| `sa-mp pack [-o out.zip]` | 打包 zip |
| `sa-mp next-version` | 建议下一版本号 |
| `sa-mp submit [--version] [--changelog] [--yes]` | 打包并上传检测 |
| `sa-mp config set / show` | 本机 base-url、api-key、skill-source |
| `sa-mp skill install [all\|name...]` | 安装 AI Skill（可指定 / 交互 / 全部） |
| `sa-mp skill list / update / status` | 列出 / 更新 / 查看 AI Skill |
| `sa-mp doctor` | 环境自检 |
| `sa-mp upgrade` | 只更新全局 npm 包 |

`preview` / `pack` / `submit` 默认当前项目根（向上找 `index.html`）。`appid` 默认读项目根 `config.json`。

## 两套更新

| | npm 包 | Skill / 模板 |
| --- | --- | --- |
| 更新命令 | `sa-mp upgrade` 或 `npm i -g sa-mp@latest` | `sa-mp skill update` |
| 频率 | CLI 行为变化时 | 规范与模板常改 |

内容默认从本仓库 `main` 拉取到 `~/.superapp/mp/content/`，可用 `sa-mp config set --skill-source <url>` 覆盖。

## 仓库结构

```
superapp-mp-dev/
├── package.json
├── bin/sa-mp.mjs          # CLI（发到 npm）
├── skills/                # 多个 Skill（skill update 拉这里）
│   ├── super-app-mp-dev/
│   └── mobile-design-system/
├── templates/vanilla/     # create 模板
├── bundled/               # 包内兜底 skills/模板
└── README.md
```

## 发布 npm（维护者）

```bash
npm login
npm version 0.1.0   # 仅 CLI 行为变化时
npm publish --access public
```

只改 `skills/` 或 `templates/`：推 `main` 即可，开发者执行 `sa-mp skill update`，不必 publish。

## 注意

- 包内资源用相对路径 `./`；平台库用 `__SUPER_APP_STATIC__/...`
- 项目 `config.json` 进 git，**不打进 zip**
- 本机密钥在 `~/.superapp/mp.json`，不要写进项目
