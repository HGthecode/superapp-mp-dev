#!/usr/bin/env node
/**
 * sa-mp — SuperApp 托管 H5 本地开发 CLI（Node 18+，无额外依赖）
 * Source: github.com/HGthecode/superapp-mp-dev
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  lstatSync,
  unlinkSync,
  rmSync,
  cpSync,
  watch,
  readlinkSync,
  symlinkSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { deflateRawSync } from 'node:zlib'
import { exec, execFileSync, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { homedir, tmpdir, platform } from 'node:os'
import { join, basename, relative, resolve, dirname, sep, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const PKG = (() => {
  try {
    return require('../package.json')
  } catch {
    return { name: 'sa-mp', version: '0.0.0' }
  }
})()

const SKIP_NAMES = new Set(['.git', '.DS_Store', 'node_modules', 'Thumbs.db'])
const PACK_SKIP_REL = new Set(['config.json'])
const SKILL_DIR_NAME = 'super-app-mp-dev'
const DEFAULT_SKILL_SOURCE = 'https://github.com/HGthecode/superapp-mp-dev.git'
const DEFAULT_STATIC_BASE = 'http://localhost:8900/static'
const DEFAULT_OPEN_WEB_BASE = 'http://localhost:9174'
const DEFAULT_API_ORIGIN = 'http://localhost:8900'
const LOCAL_STATIC_PREFIX = '/__sa_static__'
const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const BUNDLED_SKILL = join(PKG_ROOT, 'bundled', 'skill')
const BUNDLED_TEMPLATES = join(PKG_ROOT, 'bundled', 'templates', 'vanilla')
const REPO_SKILL = join(PKG_ROOT, 'skill')
const REPO_TEMPLATES = join(PKG_ROOT, 'templates', 'vanilla')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

function printUsage() {
  console.error(`sa-mp ${PKG.version} — SuperApp 托管 H5 本地开发 CLI

用法:
  sa-mp create [目录] [--force] [--appid xxx]
  sa-mp init [--appid xxx]
  sa-mp preview [--port 5179] [--appid xxx] [--dir 目录] [--no-open]
  sa-mp pack [-o out.zip] [--dir 目录]
  sa-mp next-version [--appid xxx]
  sa-mp submit [--version x.y.z] [--changelog 描述] [--yes] [--appid xxx] [--dir 目录]
  sa-mp config set --base-url URL --api-key KEY [--static-base URL] [--open-web-base URL] [--skill-source URL]
  sa-mp config show
  sa-mp skill install [--target cursor|codex|dsh|cwd]... [--path 目录]... [--force]
  sa-mp skill update
  sa-mp skill status
  sa-mp doctor
  sa-mp upgrade
  sa-mp --help | --version

在含 index.html 的应用目录执行时，可省略 --dir；appid 默认读 config.json。
`)
}

function userDir() {
  return join(homedir(), '.superapp')
}

function configPath() {
  return join(userDir(), 'mp.json')
}

function contentRoot() {
  return join(userDir(), 'mp', 'content')
}

function contentMetaPath() {
  return join(contentRoot(), 'meta.json')
}

function contentSkillPath() {
  return join(contentRoot(), 'skill')
}

function contentTemplatesPath() {
  return join(contentRoot(), 'templates', 'vanilla')
}

function legacyConfigPath() {
  return join(homedir(), '.halos', 'mp.json')
}

function loadConfig() {
  const p = configPath()
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
  const legacy = legacyConfigPath()
  if (existsSync(legacy)) return JSON.parse(readFileSync(legacy, 'utf8'))
  return { baseUrl: '', apiKey: '', skillTargets: [] }
}

function saveConfig(cfg) {
  const p = configPath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 })
}

function requireAuthConfig() {
  const cfg = loadConfig()
  if (process.env.SUPER_APP_OPEN_BASE_URL) cfg.baseUrl = process.env.SUPER_APP_OPEN_BASE_URL.replace(/\/$/, '')
  if (process.env.SUPER_APP_API_KEY) cfg.apiKey = process.env.SUPER_APP_API_KEY
  if (!cfg.baseUrl && process.env.HALOS_OPEN_BASE_URL) {
    cfg.baseUrl = process.env.HALOS_OPEN_BASE_URL.replace(/\/$/, '')
  }
  if (!cfg.apiKey && process.env.HALOS_API_KEY) cfg.apiKey = process.env.HALOS_API_KEY
  cfg.baseUrl = (cfg.baseUrl || '').replace(/\/$/, '')
  if (!cfg.baseUrl) {
    throw new Error('未配置 base-url：sa-mp config set --base-url https://你的开放平台/api/open')
  }
  if (!cfg.apiKey) {
    throw new Error('未配置 api-key：sa-mp config set --api-key sa_...')
  }
  return cfg
}

function skillSource(cfg) {
  return (
    process.env.SUPER_APP_SKILL_SOURCE ||
    (cfg && cfg.skillSource) ||
    DEFAULT_SKILL_SOURCE
  ).replace(/\/$/, '')
}

function parseArgs(argv) {
  const out = { _: [], path: [], target: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--yes') out.yes = true
    else if (a === '--force') out.force = true
    else if (a === '--no-open') out['no-open'] = true
    else if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true
      if (key === 'path' || key === 'target') {
        if (!Array.isArray(out[key])) out[key] = []
        if (val !== true) out[key].push(String(val))
      } else {
        out[key] = val
      }
    } else if (a === '-o') {
      out.o = argv[++i]
    } else {
      out._.push(a)
    }
  }
  return out
}

/** 向上查找含 index.html 的项目根 */
function findProjectRoot(start = process.cwd()) {
  let cur = resolve(start)
  for (;;) {
    if (existsSync(join(cur, 'index.html'))) return cur
    const parent = dirname(cur)
    if (parent === cur) return null
    cur = parent
  }
}

function resolveProjectDir(args) {
  if (args.dir && args.dir !== true) return resolve(String(args.dir))
  if (args._[0]) return resolve(args._[0])
  const root = findProjectRoot()
  if (!root) {
    throw new Error('当前目录及上级未找到 index.html，请在应用目录执行或传 --dir')
  }
  return root
}

function readProjectConfig(dir) {
  const p = join(dir, 'config.json')
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return {}
  }
}

function writeProjectConfig(dir, data) {
  const p = join(dir, 'config.json')
  const prev = readProjectConfig(dir)
  const next = { ...prev, ...data }
  writeFileSync(p, JSON.stringify(next, null, 2) + '\n')
  return next
}

function resolveAppid(args, projectDir) {
  if (args.appid && args.appid !== true) return String(args.appid)
  const pc = readProjectConfig(projectDir)
  return pc.appid ? String(pc.appid) : ''
}

function unwrapData(json) {
  if (json && typeof json === 'object' && 'data' in json && json.data != null) return json.data
  return json
}

async function postJSON(cfg, path, body) {
  const res = await fetch(cfg.baseUrl + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SuperApp-Api-Key': cfg.apiKey,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  try {
    return unwrapData(JSON.parse(text))
  } catch {
    return text
  }
}

async function uploadPackage(cfg, appid, version, changelog, zipPath) {
  const buf = readFileSync(zipPath)
  const blob = new Blob([buf], { type: 'application/zip' })
  const fd = new FormData()
  fd.append('appid', appid)
  fd.append('version', version)
  if (changelog) fd.append('changelog', changelog)
  fd.append('file', blob, basename(zipPath))
  const res = await fetch(cfg.baseUrl + '/microApps/versions/uploadPackageMultipart', {
    method: 'POST',
    headers: { 'X-SuperApp-Api-Key': cfg.apiKey },
    body: fd,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return unwrapData(JSON.parse(text))
}

function walkFiles(dir, base = dir, list = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_NAMES.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkFiles(full, base, list)
    else {
      const rel = relative(base, full).split(sep).join('/')
      if (rel.toLowerCase().endsWith('.zip') || rel.toLowerCase().endsWith('.map')) continue
      if (PACK_SKIP_REL.has(rel)) continue
      list.push({ rel, full })
    }
  }
  return list
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

function deflate(buf) {
  return deflateRawSync(buf, { level: 9 })
}

function u16(n) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n, 0)
  return b
}
function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n >>> 0, 0)
  return b
}

async function packDir(dir, zipPath) {
  const abs = resolve(dir)
  if (!existsSync(join(abs, 'index.html'))) {
    throw new Error(`目录根缺少 index.html: ${abs}`)
  }
  const files = walkFiles(abs)
  mkdirSync(dirname(resolve(zipPath)), { recursive: true })
  const parts = []
  const central = []
  let offset = 0

  for (const f of files) {
    const data = readFileSync(f.full)
    const nameBuf = Buffer.from(f.rel, 'utf8')
    const compressed = deflate(data)
    const useStore = compressed.length >= data.length
    const payload = useStore ? data : compressed
    const method = useStore ? 0 : 8
    const crc = crc32(data)
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(payload.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      payload,
    ])
    parts.push(local)
    const cen = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(payload.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ])
    central.push(cen)
    offset += local.length
  }

  const centralBuf = Buffer.concat(central)
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBuf.length),
    u32(offset),
    u16(0),
  ])
  writeFileSync(zipPath, Buffer.concat([...parts, centralBuf, end]))
}

/** 把仓库或包内兜底灌进本机缓存（不访问网络） */
function seedContentFromLocal(sourceLabel) {
  let skillSrc = ''
  let tplSrc = ''
  if (existsSync(join(REPO_SKILL, 'SKILL.md'))) {
    skillSrc = REPO_SKILL
    tplSrc = REPO_TEMPLATES
  } else if (existsSync(join(BUNDLED_SKILL, 'SKILL.md'))) {
    skillSrc = BUNDLED_SKILL
    tplSrc = BUNDLED_TEMPLATES
  } else {
    throw new Error('找不到 Skill / 模板，请检查包安装是否完整')
  }
  const skillDst = contentSkillPath()
  const tplDst = contentTemplatesPath()
  if (existsSync(skillDst)) rmSync(skillDst, { recursive: true, force: true })
  if (existsSync(tplDst)) rmSync(tplDst, { recursive: true, force: true })
  mkdirSync(dirname(skillDst), { recursive: true })
  mkdirSync(dirname(tplDst), { recursive: true })
  cpSync(skillSrc, skillDst, { recursive: true })
  if (existsSync(join(tplSrc, 'index.html'))) {
    cpSync(tplSrc, tplDst, { recursive: true })
  }
  saveContentMeta({
    source: sourceLabel,
    revision: sourceLabel,
    updatedAt: new Date().toISOString(),
    seeded: true,
  })
  return { skill: skillDst, templates: tplDst, source: sourceLabel }
}

/** 确保本机缓存有 Skill；优先网络拉取，失败则本地灌入 */
function ensureContentCache() {
  const cachedSkill = contentSkillPath()
  if (existsSync(join(cachedSkill, 'SKILL.md'))) {
    return { dir: cachedSkill, source: 'cache' }
  }
  try {
    fetchContent()
    return { dir: contentSkillPath(), source: 'cache' }
  } catch (e) {
    console.warn(`拉取失败，灌入本地兜底: ${e.message}`)
    const seeded = seedContentFromLocal(
      existsSync(join(REPO_SKILL, 'SKILL.md')) ? 'repo-seed' : 'bundled-seed',
    )
    return { dir: seeded.skill, source: seeded.source }
  }
}

/** create 用的模板：始终读缓存（必要时先 ensure） */
function resolveTemplateDir() {
  ensureContentCache()
  const cached = contentTemplatesPath()
  if (existsSync(join(cached, 'index.html'))) {
    const meta = loadContentMeta()
    return { dir: cached, source: meta?.seeded ? meta.source : 'cache' }
  }
  throw new Error('找不到 create 模板，请执行 sa-mp skill update')
}

function resolveSkillBodyDir() {
  return ensureContentCache()
}

function loadContentMeta() {
  const p = contentMetaPath()
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function saveContentMeta(meta) {
  mkdirSync(contentRoot(), { recursive: true })
  writeFileSync(contentMetaPath(), JSON.stringify(meta, null, 2) + '\n')
}

function runGit(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  })
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim()
    throw new Error(err || `git ${args.join(' ')} 失败`)
  }
  return (r.stdout || '').trim()
}

/** 拉取 Skill + 模板到本机缓存 */
function fetchContent(force = false) {
  const cfg = loadConfig()
  const source = skillSource(cfg)
  const root = contentRoot()
  const staging = join(userDir(), 'mp', 'content-staging')
  mkdirSync(dirname(root), { recursive: true })
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  console.log(`拉取内容: ${source}`)
  runGit(['clone', '--depth', '1', '--single-branch', source, staging])
  const rev = runGit(['rev-parse', 'HEAD'], { cwd: staging })

  const skillSrc = join(staging, 'skill')
  const tplSrc = join(staging, 'templates', 'vanilla')
  if (!existsSync(join(skillSrc, 'SKILL.md'))) {
    throw new Error('远端仓库缺少 skill/SKILL.md')
  }
  if (!existsSync(join(tplSrc, 'index.html'))) {
    throw new Error('远端仓库缺少 templates/vanilla/index.html')
  }

  const skillDst = contentSkillPath()
  const tplDst = contentTemplatesPath()
  if (existsSync(skillDst)) rmSync(skillDst, { recursive: true, force: true })
  if (existsSync(tplDst)) rmSync(tplDst, { recursive: true, force: true })
  mkdirSync(dirname(skillDst), { recursive: true })
  mkdirSync(dirname(tplDst), { recursive: true })
  cpSync(skillSrc, skillDst, { recursive: true })
  cpSync(tplSrc, tplDst, { recursive: true })
  rmSync(staging, { recursive: true, force: true })

  saveContentMeta({
    source,
    revision: rev,
    updatedAt: new Date().toISOString(),
    force: !!force,
  })
  console.log(`内容已更新: ${rev.slice(0, 8)}`)
  return rev
}

function ensureContent() {
  return ensureContentCache()
}

function skillTargetPath(name, cwd = process.cwd()) {
  const home = homedir()
  if (name === 'cursor') return join(home, '.cursor', 'skills', SKILL_DIR_NAME)
  if (name === 'codex') {
    const codexHome = process.env.CODEX_HOME || join(home, '.codex')
    return join(codexHome, 'skills', SKILL_DIR_NAME)
  }
  if (name === 'dsh') return join(home, '.dsh', 'skills', SKILL_DIR_NAME)
  if (name === 'cwd') {
    return [
      join(cwd, '.cursor', 'skills', SKILL_DIR_NAME),
      join(cwd, '.dsh', 'skills', SKILL_DIR_NAME),
      join(cwd, '.agents', 'skills', SKILL_DIR_NAME),
    ]
  }
  return null
}

function normalizeCustomPath(p) {
  const abs = resolve(p)
  if (basename(abs) === SKILL_DIR_NAME) return abs
  return join(abs, SKILL_DIR_NAME)
}

function linkKind(path) {
  if (!existsSync(path) && !existsSync(path)) {
    try {
      lstatSync(path)
    } catch {
      return { kind: 'missing' }
    }
  }
  try {
    const st = lstatSync(path)
    if (st.isSymbolicLink()) {
      let target = ''
      try {
        target = readlinkSync(path)
      } catch {
        /* ignore */
      }
      return { kind: 'symlink', target }
    }
    if (platform() === 'win32' && st.isDirectory()) {
      // junction 在 Node 里常表现为 directory；用 fsutil / 探测
      try {
        const out = execFileSync('cmd', ['/c', `fsutil reparsepoint query "${path}"`], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        if (/Junction|Mount Point|Symbolic Link/i.test(out)) {
          return { kind: 'junction' }
        }
      } catch {
        /* not a reparse point */
      }
    }
    if (st.isDirectory()) return { kind: 'copy' }
    return { kind: 'other' }
  } catch {
    return { kind: 'missing' }
  }
}

function pointsToCache(path, cacheDir) {
  const kind = linkKind(path)
  if (kind.kind === 'missing') return false
  try {
    const real = resolve(path)
    const cache = resolve(cacheDir)
    if (real === cache) return true
    if (kind.kind === 'symlink' && kind.target) {
      const t = resolve(dirname(path), kind.target)
      return t === cache || resolve(kind.target) === cache
    }
  } catch {
    /* ignore */
  }
  // 比较 SKILL.md 是否同源（软链/联接后存在即可）
  try {
    const a = readFileSync(join(path, 'SKILL.md'), 'utf8')
    const b = readFileSync(join(cacheDir, 'SKILL.md'), 'utf8')
    return a === b && (kind.kind === 'symlink' || kind.kind === 'junction')
  } catch {
    return false
  }
}

function removePath(path) {
  try {
    const st = lstatSync(path)
    if (st.isSymbolicLink() || (platform() === 'win32' && st.isDirectory() && linkKind(path).kind === 'junction')) {
      // Windows junction / symlink dir
      if (platform() === 'win32') {
        spawnSync('cmd', ['/c', `rmdir "${path}"`], { stdio: 'ignore' })
        if (existsSync(path)) rmSync(path, { recursive: true, force: true })
      } else {
        unlinkSync(path)
      }
      return
    }
  } catch {
    /* fall through */
  }
  if (existsSync(path)) rmSync(path, { recursive: true, force: true })
}

function linkSkill(dest, source, force) {
  mkdirSync(dirname(dest), { recursive: true })
  if (existsSync(dest) || (() => { try { lstatSync(dest); return true } catch { return false } })()) {
    if (pointsToCache(dest, source)) {
      console.log(`已链接，跳过: ${dest}`)
      return { dest, kind: linkKind(dest).kind }
    }
    if (!force) {
      throw new Error(`目标已存在且不是本缓存链接: ${dest}（覆盖请加 --force）`)
    }
    removePath(dest)
  }

  const linkType = platform() === 'win32' ? 'junction' : 'dir'
  try {
    symlinkSync(source, dest, linkType)
    console.log(`${linkType}: ${dest} -> ${source}`)
    return { dest, kind: linkType === 'junction' ? 'junction' : 'symlink' }
  } catch (e) {
    console.warn(`链接失败，改为复制: ${e.message}`)
    cpSync(source, dest, { recursive: true })
    console.log(`copy: ${dest}`)
    return { dest, kind: 'copy' }
  }
}

function refreshCopyTargets(targets, source) {
  for (const t of targets) {
    const kind = linkKind(t.path)
    if (kind.kind === 'copy') {
      removePath(t.path)
      cpSync(source, t.path, { recursive: true })
      console.log(`已覆盖 copy 目标: ${t.path}`)
    }
  }
}

async function askInteractiveTargets() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q) => new Promise((res) => rl.question(q, res))
  console.log(`可选目标:
  1) cursor  ${join(homedir(), '.cursor', 'skills', SKILL_DIR_NAME)}
  2) codex   ${join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'skills', SKILL_DIR_NAME)}
  3) dsh     ${join(homedir(), '.dsh', 'skills', SKILL_DIR_NAME)}
  4) cwd     当前项目 .cursor / .dsh / .agents skills
  5) 自定义路径`)
  const ans = await ask('输入编号（逗号分隔，如 1,2,4）: ')
  const selected = { target: [], path: [] }
  for (const part of String(ans).split(/[,，\s]+/).filter(Boolean)) {
    if (part === '1') selected.target.push('cursor')
    else if (part === '2') selected.target.push('codex')
    else if (part === '3') selected.target.push('dsh')
    else if (part === '4') selected.target.push('cwd')
    else if (part === '5') {
      const p = await ask('Skill 存放目录: ')
      if (p.trim()) selected.path.push(p.trim())
    }
  }
  rl.close()
  return selected
}

async function cmdSkill(argv) {
  const sub = argv[0]
  if (sub === 'update') {
    fetchContent(true)
    const cfg = loadConfig()
    const source = resolveSkillBodyDir().dir
    const targets = Array.isArray(cfg.skillTargets) ? cfg.skillTargets : []
    refreshCopyTargets(targets, source)
    return
  }
  if (sub === 'status') {
    const meta = loadContentMeta()
    const body = (() => {
      try {
        return resolveSkillBodyDir()
      } catch (e) {
        return { dir: '', source: 'missing', error: e.message }
      }
    })()
    const cfg = loadConfig()
    console.log(JSON.stringify({
      skillSource: skillSource(cfg),
      content: meta,
      body,
      targets: (cfg.skillTargets || []).map((t) => ({
        ...t,
        live: linkKind(t.path),
      })),
    }, null, 2))
    return
  }
  if (sub === 'install') {
    let args = parseArgs(argv.slice(1))
    if (!args.target.length && !args.path.length) {
      if (!process.stdin.isTTY) {
        throw new Error('非交互环境请传 --target 或 --path')
      }
      const picked = await askInteractiveTargets()
      args = { ...args, target: picked.target, path: picked.path }
    }
    if (!args.target.length && !args.path.length) {
      throw new Error('未选择任何目标')
    }

    ensureContent()
    const source = resolveSkillBodyDir().dir
    const dests = []
    for (const t of args.target) {
      const p = skillTargetPath(t)
      if (!p) throw new Error(`未知 --target: ${t}`)
      if (Array.isArray(p)) dests.push(...p.map((d) => ({ path: d, via: t })))
      else dests.push({ path: p, via: t })
    }
    for (const p of args.path) {
      dests.push({ path: normalizeCustomPath(p), via: 'path' })
    }

    const results = []
    for (const d of dests) {
      const r = linkSkill(d.path, source, !!args.force)
      results.push({ ...r, via: d.via })
    }

    const cfg = loadConfig()
    const prev = Array.isArray(cfg.skillTargets) ? cfg.skillTargets : []
    const map = new Map(prev.map((x) => [x.path, x]))
    for (const r of results) {
      map.set(r.dest, { path: r.dest, kind: r.kind, via: r.via })
    }
    cfg.skillTargets = [...map.values()]
    saveConfig(cfg)
    console.log(`已写入 skillTargets: ${configPath()}`)
    return
  }
  throw new Error('用法: sa-mp skill install|update|status')
}

async function cmdInit(argv) {
  const args = parseArgs(argv)
  const dir = resolve(process.cwd())
  if (!existsSync(join(dir, 'index.html'))) {
    throw new Error(`当前目录没有 index.html: ${dir}`)
  }
  const data = {}
  if (args.appid && args.appid !== true) data.appid = String(args.appid)
  else if (!readProjectConfig(dir).appid) data.appid = ''
  const next = writeProjectConfig(dir, data)
  console.log(`已写入 ${join(dir, 'config.json')}`)
  console.log(JSON.stringify(next, null, 2))
}

async function cmdCreate(argv) {
  const args = parseArgs(argv)
  const dirArg = args._[0]
  const abs = dirArg ? resolve(dirArg) : resolve(process.cwd())
  if (existsSync(abs)) {
    const names = readdirSync(abs).filter((n) => !SKIP_NAMES.has(n))
    if (names.length && !args.force) {
      throw new Error(`目录非空: ${abs}（覆盖请加 --force）`)
    }
  }
  const tpl = resolveTemplateDir()
  if (String(tpl.source).includes('seed') || tpl.source === 'bundled') {
    console.warn('正在使用本地兜底模板，建议执行: sa-mp skill update')
  }
  mkdirSync(abs, { recursive: true })
  cpSync(tpl.dir, abs, { recursive: true })
  const appid = args.appid && args.appid !== true ? String(args.appid) : ''
  writeProjectConfig(abs, { appid })
  console.log(`已生成无构建微应用: ${abs}`)
  console.log(`模板来源: ${tpl.source}`)
  console.log('入口: index.html（平台 Vue + Vant，无需 npm install）')
}

async function cmdConfig(argv) {
  const sub = argv[0]
  if (sub === 'show') {
    const cfg = loadConfig()
    const show = { ...cfg }
    if (show.apiKey && show.apiKey.length > 11) show.apiKey = show.apiKey.slice(0, 11) + '…'
    console.log(JSON.stringify(show, null, 2))
    return
  }
  if (sub === 'set') {
    const args = parseArgs(argv.slice(1))
    const cfg = loadConfig()
    if (args['base-url']) cfg.baseUrl = String(args['base-url']).replace(/\/$/, '')
    if (args['api-key']) cfg.apiKey = String(args['api-key'])
    if (args['static-base']) cfg.staticBase = String(args['static-base']).replace(/\/$/, '')
    if (args['open-web-base']) cfg.openWebBase = String(args['open-web-base']).replace(/\/$/, '')
    if (args['skill-source']) cfg.skillSource = String(args['skill-source']).replace(/\/$/, '')
    saveConfig(cfg)
    console.log('已写入', configPath())
    return
  }
  throw new Error('用法: sa-mp config set|show')
}

function loadPreviewConfig(args) {
  const cfg = loadConfig()
  const staticBase = (
    (args['static-base'] && args['static-base'] !== true ? String(args['static-base']) : '') ||
    process.env.SUPER_APP_STATIC_BASE ||
    cfg.staticBase ||
    DEFAULT_STATIC_BASE
  ).replace(/\/$/, '')
  const openWebBase = (
    (args['open-web-base'] && args['open-web-base'] !== true ? String(args['open-web-base']) : '') ||
    process.env.SUPER_APP_OPEN_WEB_BASE ||
    cfg.openWebBase ||
    DEFAULT_OPEN_WEB_BASE
  ).replace(/\/$/, '')
  let apiOrigin = DEFAULT_API_ORIGIN
  try {
    apiOrigin = new URL(staticBase).origin
  } catch {
    /* keep */
  }
  return { staticBase, openWebBase, apiOrigin }
}

function buildEnvJS(apiOrigin, staticBase) {
  return `window.__SUPER_APP_API_ORIGIN__=${JSON.stringify(apiOrigin)};window.__SUPER_APP_STATIC_BASE__=${JSON.stringify(staticBase)};`
}

const LIVE_RELOAD_JS = `(()=>{try{var es=new EventSource('/__sa_reload');es.onmessage=function(){location.reload()};es.onerror=function(){}}catch(e){}})();`

function transformPreviewHtml(html, localStaticBase) {
  let out = html.split('__SUPER_APP_STATIC__').join(localStaticBase)
  const baseTag = '<base href="/">'
  const envTag = '<script src="./__superapp_env.js"></script>'
  const liveTag = '<script src="./__sa_livereload.js"></script>'
  if (out.includes('<head>')) out = out.replace('<head>', `<head>${baseTag}`)
  else out = baseTag + out
  if (out.includes('</head>')) out = out.replace('</head>', `${envTag}${liveTag}</head>`)
  else if (out.includes('<body>')) out = out.replace('<body>', `<body>${envTag}${liveTag}`)
  else out = envTag + liveTag + out
  return out
}

function previewCSP(apiOrigin) {
  const apiExtra = apiOrigin ? ` ${apiOrigin}` : ''
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-eval'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' http://localhost:8900 http://127.0.0.1:8900${apiExtra}`,
    `frame-ancestors *`,
    `base-uri 'self'`,
    `object-src 'none'`,
  ].join('; ')
}

async function proxyPlatformStatic(req, res, pathname, upstreamStaticBase, csp) {
  const rel = pathname.slice(LOCAL_STATIC_PREFIX.length).replace(/^\/+/, '')
  if (!rel || rel.includes('..')) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  const upstream = `${upstreamStaticBase.replace(/\/$/, '')}/${rel}`
  try {
    const upstreamRes = await fetch(upstream, {
      headers: { Accept: req.headers.accept || '*/*' },
    })
    const buf = Buffer.from(await upstreamRes.arrayBuffer())
    const ctype =
      upstreamRes.headers.get('content-type') ||
      MIME[extname(rel).toLowerCase()] ||
      'application/octet-stream'
    res.writeHead(upstreamRes.status, {
      'Content-Type': ctype,
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-store',
    })
    res.end(buf)
  } catch (e) {
    res.writeHead(502)
    res.end(`静态代理失败: ${upstream} — ${e.message || e}`)
  }
}

function safeJoinWww(root, relUrlPath) {
  const rel = decodeURIComponent(relUrlPath.split('?')[0].split('#')[0]).replace(/^\/+/, '')
  if (rel.includes('..')) return null
  const abs = resolve(root, rel || 'index.html')
  const rootAbs = resolve(root)
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) return null
  return abs
}

function openBrowser(url) {
  const p = platform()
  if (p === 'win32') exec(`cmd /c start "" "${url.replace(/"/g, '')}"`)
  else if (p === 'darwin') exec(`open "${url.replace(/"/g, '')}"`)
  else exec(`xdg-open "${url.replace(/"/g, '')}"`)
}

async function cmdPreview(argv) {
  const args = parseArgs(argv)
  const abs = resolveProjectDir(args)
  if (!existsSync(join(abs, 'index.html'))) {
    throw new Error(`目录根缺少 index.html: ${abs}`)
  }
  const port = Number(args.port && args.port !== true ? args.port : 5179) || 5179
  const appid = resolveAppid(args, abs)
  const { staticBase: upstreamStaticBase, openWebBase, apiOrigin } = loadPreviewConfig(args)
  const localStaticBase = LOCAL_STATIC_PREFIX
  const csp = previewCSP(apiOrigin)
  const envJs = buildEnvJS(apiOrigin, localStaticBase)
  const reloadClients = new Set()
  let reloadTimer = null

  function notifyReload(reason) {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      const payload = `data: ${reason || 'change'}\n\n`
      for (const client of reloadClients) {
        try {
          client.write(payload)
        } catch {
          reloadClients.delete(client)
        }
      }
      if (reloadClients.size) console.log(`[preview] 已通知刷新 (${reloadClients.size})`)
    }, 120)
  }

  const server = createServer((req, res) => {
    ;(async () => {
      try {
        const u = new URL(req.url || '/', `http://127.0.0.1:${port}`)
        let pathname = u.pathname
        if (pathname === LOCAL_STATIC_PREFIX || pathname.startsWith(LOCAL_STATIC_PREFIX + '/')) {
          await proxyPlatformStatic(req, res, pathname, upstreamStaticBase, csp)
          return
        }
        if (pathname === '/__sa_reload') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
          })
          res.write(': ok\n\n')
          reloadClients.add(res)
          req.on('close', () => reloadClients.delete(res))
          return
        }
        if (pathname === '/__sa_livereload.js') {
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Security-Policy': csp,
            'Cache-Control': 'no-store',
          })
          res.end(LIVE_RELOAD_JS)
          return
        }
        if (pathname === '/__superapp_env.js') {
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Security-Policy': csp,
            'Cache-Control': 'no-store',
          })
          res.end(envJs)
          return
        }
        if (pathname.endsWith('/')) pathname += 'index.html'
        let filePath = safeJoinWww(abs, pathname)
        if (!filePath) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }
        if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
          const asIndex = join(filePath, 'index.html')
          if (existsSync(asIndex)) filePath = asIndex
          else {
            res.writeHead(404)
            res.end('Not Found')
            return
          }
        }
        const ext = extname(filePath).toLowerCase()
        const headers = {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Content-Security-Policy': csp,
          'Cache-Control': 'no-store',
        }
        if (ext === '.html') {
          const html = transformPreviewHtml(readFileSync(filePath, 'utf8'), localStaticBase)
          res.writeHead(200, headers)
          res.end(html)
          return
        }
        res.writeHead(200, headers)
        res.end(readFileSync(filePath))
      } catch (e) {
        res.writeHead(500)
        res.end(String(e.message || e))
      }
    })()
  })

  await new Promise((resolveOk, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolveOk)
  })

  try {
    watch(abs, { recursive: true }, (_event, filename) => {
      if (!filename) {
        notifyReload('change')
        return
      }
      const name = String(filename).split(/[/\\]/).pop() || ''
      if (SKIP_NAMES.has(name) || name.toLowerCase().endsWith('.zip')) return
      if (name === 'config.json') return
      notifyReload(name)
    })
  } catch (e) {
    console.warn('[preview] 文件监听不可用，请手动刷新:', e.message || e)
  }

  const localUrl = `http://127.0.0.1:${port}/`
  console.log(`本地预览: ${localUrl}`)
  console.log(`项目目录: ${abs}`)
  console.log(`静态上游: ${upstreamStaticBase} → 同源 ${localStaticBase}/`)
  console.log('文件变更后自动刷新 iframe（无需重启 preview）')
  if (appid) {
    const debugUrl =
      `${openWebBase}/mp/debug?appid=${encodeURIComponent(appid)}` +
      `&url=${encodeURIComponent(localUrl)}`
    console.log(`Debug 壳: ${debugUrl}`)
    if (!args['no-open']) openBrowser(debugUrl)
  } else {
    console.log('未配置 appid：仅本地 serve。请 sa-mp init --appid mp... 或传 --appid')
    if (!args['no-open']) openBrowser(localUrl)
  }
  console.log('按 Ctrl+C 结束')
}

async function cmdPack(argv) {
  const args = parseArgs(argv)
  const dir = resolveProjectDir(args)
  const out = args.o || join(tmpdir(), `sa-mp-${basename(dir)}-${Date.now()}.zip`)
  await packDir(dir, out)
  console.log(resolve(out))
}

async function cmdNextVersion(argv) {
  const args = parseArgs(argv)
  const dir = (() => {
    try {
      return resolveProjectDir(args)
    } catch {
      return process.cwd()
    }
  })()
  const appid = resolveAppid(args, dir)
  if (!appid) throw new Error('缺少 appid：写入 config.json 或传 --appid')
  const cfg = requireAuthConfig()
  const data = await postJSON(cfg, '/microApps/versions/suggestNext', { appid })
  console.log(JSON.stringify(data, null, 2))
}

async function cmdSubmit(argv) {
  const args = parseArgs(argv)
  const dir = resolveProjectDir(args)
  const appid = resolveAppid(args, dir)
  if (!appid) throw new Error('缺少 appid：写入 config.json 或传 --appid')
  const cfg = requireAuthConfig()
  let version = args.version ? String(args.version).trim() : ''
  const changelog = args.changelog != null && args.changelog !== true ? String(args.changelog) : ''
  if (!version) {
    const sug = await postJSON(cfg, '/microApps/versions/suggestNext', { appid })
    version = sug.version
    if (!version) throw new Error('无法获取建议版本号')
  }
  if (!args.yes) {
    console.log(
      `即将提交:\n  appid: ${appid}\n  dir: ${dir}\n  version: ${version}\n  changelog: ${JSON.stringify(changelog)}\n确认请加 --yes`,
    )
    process.exit(2)
  }
  const tmpZip = join(tmpdir(), `sa-mp-${Date.now()}.zip`)
  try {
    await packDir(dir, tmpZip)
    const data = await uploadPackage(cfg, appid, version, changelog, tmpZip)
    console.log(JSON.stringify(data, null, 2))
    if (!data.passed) process.exit(1)
  } finally {
    try {
      unlinkSync(tmpZip)
    } catch {
      /* ignore */
    }
  }
}

async function cmdDoctor() {
  const checks = []
  const nodeOk = Number(process.versions.node.split('.')[0]) >= 18
  checks.push({ name: 'Node.js >= 18', ok: nodeOk, detail: process.version })

  const cfg = loadConfig()
  checks.push({
    name: '用户配置 api-key',
    ok: !!(cfg.apiKey || process.env.SUPER_APP_API_KEY),
    detail: configPath(),
  })
  checks.push({
    name: '用户配置 base-url',
    ok: !!(cfg.baseUrl || process.env.SUPER_APP_OPEN_BASE_URL),
    detail: cfg.baseUrl || process.env.SUPER_APP_OPEN_BASE_URL || '(空)',
  })

  const { staticBase, openWebBase } = loadPreviewConfig({})
  for (const [name, url] of [
    ['开放平台前端', openWebBase],
    ['静态基址', staticBase],
  ]) {
    let ok = false
    let detail = url
    try {
      const res = await fetch(url, { method: 'GET' })
      ok = res.status < 500
      detail = `${url} → HTTP ${res.status}`
    } catch (e) {
      detail = `${url} → ${e.message}`
    }
    checks.push({ name, ok, detail })
  }

  const root = findProjectRoot()
  checks.push({
    name: '当前为微应用目录',
    ok: !!root,
    detail: root || process.cwd(),
  })
  if (root) {
    const appid = readProjectConfig(root).appid
    checks.push({ name: 'config.json appid', ok: !!appid, detail: appid || '(空)' })
  }

  let body
  try {
    body = resolveSkillBodyDir()
  } catch (e) {
    body = { source: 'missing', error: e.message }
  }
  const meta = loadContentMeta()
  checks.push({
    name: 'Skill 内容缓存',
    ok: body.source !== 'missing',
    detail: meta
      ? `${meta.revision?.slice(0, 8) || '?'} (${body.source})`
      : `${body.source}${body.error ? ': ' + body.error : ''}`,
  })

  for (const t of cfg.skillTargets || []) {
    const live = linkKind(t.path)
    checks.push({
      name: `Skill 目标 ${t.via || ''}`,
      ok: live.kind !== 'missing',
      detail: `${t.path} [${live.kind}]`,
    })
  }

  for (const c of checks) {
    console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}: ${c.detail}`)
  }
  if (checks.some((c) => !c.ok)) process.exit(1)
}

async function cmdUpgrade() {
  const name = PKG.name || 'sa-mp'
  console.log(`正在更新全局包: ${name}@latest`)
  const r = spawnSync('npm', ['install', '-g', `${name}@latest`], {
    encoding: 'utf8',
    stdio: 'inherit',
    shell: platform() === 'win32',
  })
  if (r.status !== 0) {
    console.error(`自动更新失败。请手动执行:\n  npm install -g ${name}@latest`)
    process.exit(1)
  }
  console.log('CLI 已更新。Skill / 模板请执行: sa-mp skill update')
}

async function main() {
  const argv = process.argv.slice(2)
  if (!argv.length || argv[0] === 'help' || argv[0] === '-h' || argv[0] === '--help') {
    printUsage()
    process.exit(argv.length ? 0 : 2)
  }
  if (argv[0] === '--version' || argv[0] === '-v' || argv[0] === 'version') {
    console.log(PKG.version)
    return
  }
  const cmd = argv[0]
  try {
    if (cmd === 'create') await cmdCreate(argv.slice(1))
    else if (cmd === 'init') await cmdInit(argv.slice(1))
    else if (cmd === 'config') await cmdConfig(argv.slice(1))
    else if (cmd === 'pack') await cmdPack(argv.slice(1))
    else if (cmd === 'preview') await cmdPreview(argv.slice(1))
    else if (cmd === 'next-version') await cmdNextVersion(argv.slice(1))
    else if (cmd === 'submit') await cmdSubmit(argv.slice(1))
    else if (cmd === 'skill') await cmdSkill(argv.slice(1))
    else if (cmd === 'doctor') await cmdDoctor()
    else if (cmd === 'upgrade') await cmdUpgrade()
    else {
      printUsage()
      process.exit(2)
    }
  } catch (e) {
    console.error(e.message || e)
    process.exit(1)
  }
}

main()
