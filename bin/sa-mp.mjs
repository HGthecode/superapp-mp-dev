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
const PACK_SKIP_REL = new Set(['config.json', 'README.md'])
const PACK_SKIP_PREFIX = ['data/', 'functions/']
const LEGACY_SKILL_NAME = 'super-app-mp-dev'
const DEFAULT_SKILL_SOURCE = 'https://github.com/HGthecode/superapp-mp-dev.git'
const DEFAULT_STATIC_BASE = 'http://localhost:8900/static'
const DEFAULT_OPEN_WEB_BASE = 'http://localhost:9174'
const DEFAULT_API_ORIGIN = 'http://localhost:8900'
const LOCAL_STATIC_PREFIX = '/__sa_static__'
const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const BUNDLED_SKILLS = join(PKG_ROOT, 'bundled', 'skills')
const BUNDLED_SKILL_LEGACY = join(PKG_ROOT, 'bundled', 'skill')
const BUNDLED_TEMPLATES = join(PKG_ROOT, 'bundled', 'templates', 'vanilla')
const REPO_SKILLS = join(PKG_ROOT, 'skills')
const REPO_SKILL_LEGACY = join(PKG_ROOT, 'skill')
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
  sa-mp console [--port 5180] [--appid xxx] [--dir 目录] [--no-open]
  sa-mp pack [-o out.zip] [--dir 目录]
  sa-mp next-version [--appid xxx]
  sa-mp submit [--version x.y.z] [--changelog 描述] [--yes] [--appid xxx] [--dir 目录]
  sa-mp config set --base-url URL --api-key KEY [--static-base URL] [--open-web-base URL] [--skill-source URL]
  sa-mp config show
  sa-mp skill install [all|<name>...] [--target cursor|codex|dsh|cwd]... [--path 目录]... [--force]
  sa-mp skill update
  sa-mp skill status
  sa-mp skill list
  sa-mp data pull [--appid xxx] [--dir 目录]
  sa-mp data push [--appid xxx] [--dir 目录] [--publish]
  sa-mp data diff [--appid xxx] [--dir 目录]
  sa-mp fn pull [--appid xxx] [--dir 目录]
  sa-mp fn push [--appid xxx] [--dir 目录] [--publish]
  sa-mp fn list [--appid xxx] [--dir 目录]
  sa-mp doctor
  sa-mp upgrade
  sa-mp --help | --version

在含 index.html 的应用目录执行时，可省略 --dir；appid 默认读 config.json。
data/schema.json、functions/*.js 不打进 zip，需 API Key 含 data:schema。
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

function contentSkillsRoot() {
  return join(contentRoot(), 'skills')
}

/** 单个 skill 缓存目录 */
function contentSkillPath(name) {
  return join(contentSkillsRoot(), name)
}

function contentSkillPathLegacy() {
  return join(contentRoot(), 'skill')
}

function contentTemplatesPath() {
  return join(contentRoot(), 'templates', 'vanilla')
}

/** 扫描目录下含 SKILL.md 的子目录名 */
function listSkillNamesInDir(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => {
      try {
        return statSync(join(dir, n)).isDirectory() && existsSync(join(dir, n, 'SKILL.md'))
      } catch {
        return false
      }
    })
    .sort()
}

/** 本机缓存中可用的 skill 名（含旧版单 skill 兼容） */
function listCachedSkillNames() {
  const names = listSkillNamesInDir(contentSkillsRoot())
  const legacy = contentSkillPathLegacy()
  if (existsSync(join(legacy, 'SKILL.md')) && !names.includes(LEGACY_SKILL_NAME)) {
    names.push(LEGACY_SKILL_NAME)
    names.sort()
  }
  return names
}

/** 解析 skill 缓存目录（兼容旧 content/skill） */
function resolveCachedSkillDir(name) {
  const multi = contentSkillPath(name)
  if (existsSync(join(multi, 'SKILL.md'))) return multi
  if (name === LEGACY_SKILL_NAME) {
    const legacy = contentSkillPathLegacy()
    if (existsSync(join(legacy, 'SKILL.md'))) return legacy
  }
  return null
}

function readSkillFrontName(skillDir) {
  try {
    const text = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
    const m = text.match(/^name:\s*[`'"]?([^\s`'"]+)/m)
    return m ? m[1] : basename(skillDir)
  } catch {
    return basename(skillDir)
  }
}

function legacyConfigPath() {
  return join(homedir(), '.halos', 'mp.json')
}

function readJsonFile(path, fallback) {
  try {
    const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function loadConfig() {
  const p = configPath()
  if (existsSync(p)) return readJsonFile(p, { baseUrl: '', apiKey: '', skillTargets: [] })
  const legacy = legacyConfigPath()
  if (existsSync(legacy)) return readJsonFile(legacy, { baseUrl: '', apiKey: '', skillTargets: [] })
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
  return readJsonFile(p, {})
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
      if (PACK_SKIP_PREFIX.some((p) => rel === p.slice(0, -1) || rel.startsWith(p))) continue
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

/** 从本地目录树灌入 skills 缓存 */
function copySkillsTree(srcSkillsDir, fallbackSingleDir) {
  const dstRoot = contentSkillsRoot()
  mkdirSync(dstRoot, { recursive: true })
  const names = listSkillNamesInDir(srcSkillsDir)
  if (names.length) {
    for (const name of names) {
      const dst = contentSkillPath(name)
      if (existsSync(dst)) rmSync(dst, { recursive: true, force: true })
      cpSync(join(srcSkillsDir, name), dst, { recursive: true })
    }
    return names
  }
  if (fallbackSingleDir && existsSync(join(fallbackSingleDir, 'SKILL.md'))) {
    const dst = contentSkillPath(LEGACY_SKILL_NAME)
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true })
    cpSync(fallbackSingleDir, dst, { recursive: true })
    return [LEGACY_SKILL_NAME]
  }
  return []
}

/** 把仓库或包内兜底灌进本机缓存（不访问网络） */
function seedContentFromLocal(sourceLabel) {
  let names = []
  if (listSkillNamesInDir(REPO_SKILLS).length || existsSync(join(REPO_SKILL_LEGACY, 'SKILL.md'))) {
    names = copySkillsTree(REPO_SKILLS, REPO_SKILL_LEGACY)
  } else if (listSkillNamesInDir(BUNDLED_SKILLS).length || existsSync(join(BUNDLED_SKILL_LEGACY, 'SKILL.md'))) {
    names = copySkillsTree(BUNDLED_SKILLS, BUNDLED_SKILL_LEGACY)
  } else {
    throw new Error('找不到 Skill / 模板，请检查包安装是否完整')
  }
  if (!names.length) throw new Error('本地兜底中没有可用 Skill')

  const tplSrc = existsSync(join(REPO_TEMPLATES, 'index.html'))
    ? REPO_TEMPLATES
    : BUNDLED_TEMPLATES
  const tplDst = contentTemplatesPath()
  if (existsSync(tplDst)) rmSync(tplDst, { recursive: true, force: true })
  if (existsSync(join(tplSrc, 'index.html'))) {
    mkdirSync(dirname(tplDst), { recursive: true })
    cpSync(tplSrc, tplDst, { recursive: true })
  }
  saveContentMeta({
    source: sourceLabel,
    revision: sourceLabel,
    updatedAt: new Date().toISOString(),
    seeded: true,
    skills: names,
  })
  return {
    skills: names,
    skill: contentSkillPath(names[0]),
    templates: tplDst,
    source: sourceLabel,
  }
}

/** 旧版 content/skill → content/skills/super-app-mp-dev */
function migrateLegacySkillCache() {
  const legacy = contentSkillPathLegacy()
  const dest = contentSkillPath(LEGACY_SKILL_NAME)
  if (existsSync(join(legacy, 'SKILL.md')) && !existsSync(join(dest, 'SKILL.md'))) {
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(legacy, dest, { recursive: true })
  }
}

/**
 * 本仓库检出目录下有 skills/ 时同步进缓存（本地改 skill 立即生效；
 * npm 全局安装不含 skills/，不会走到这里）
 */
function syncRepoSkillsIfPresent() {
  const names = listSkillNamesInDir(REPO_SKILLS)
  if (!names.length) return
  for (const name of names) {
    const dst = contentSkillPath(name)
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true })
    mkdirSync(dirname(dst), { recursive: true })
    cpSync(join(REPO_SKILLS, name), dst, { recursive: true })
  }
}

/** 确保本机缓存有 Skill；优先网络拉取，失败则本地灌入 */
function ensureContentCache() {
  migrateLegacySkillCache()
  syncRepoSkillsIfPresent()
  const names = listCachedSkillNames()
  if (names.length) {
    return { skills: names, dir: resolveCachedSkillDir(names[0]), source: 'cache' }
  }
  try {
    fetchContent()
    syncRepoSkillsIfPresent()
    const after = listCachedSkillNames()
    return { skills: after, dir: resolveCachedSkillDir(after[0]), source: 'cache' }
  } catch (e) {
    console.warn(`拉取失败，灌入本地兜底: ${e.message}`)
    const hasRepo =
      listSkillNamesInDir(REPO_SKILLS).length > 0 ||
      existsSync(join(REPO_SKILL_LEGACY, 'SKILL.md'))
    const seeded = seedContentFromLocal(hasRepo ? 'repo-seed' : 'bundled-seed')
    return { skills: seeded.skills, dir: seeded.skill, source: seeded.source }
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

function resolveSkillBodyDir(name = LEGACY_SKILL_NAME) {
  ensureContentCache()
  const dir = resolveCachedSkillDir(name)
  if (!dir) throw new Error(`缓存中无 Skill: ${name}，请执行 sa-mp skill update`)
  return { dir, source: 'cache', name }
}

function loadContentMeta() {
  const p = contentMetaPath()
  if (!existsSync(p)) return null
  return readJsonFile(p, null)
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

  const skillsSrc = join(staging, 'skills')
  const skillLegacySrc = join(staging, 'skill')
  const tplSrc = join(staging, 'templates', 'vanilla')
  const names = copySkillsTree(skillsSrc, skillLegacySrc)
  if (!names.length) {
    throw new Error('远端仓库缺少 skills/*/SKILL.md 或 skill/SKILL.md')
  }
  if (!existsSync(join(tplSrc, 'index.html'))) {
    throw new Error('远端仓库缺少 templates/vanilla/index.html')
  }

  const tplDst = contentTemplatesPath()
  if (existsSync(tplDst)) rmSync(tplDst, { recursive: true, force: true })
  mkdirSync(dirname(tplDst), { recursive: true })
  cpSync(tplSrc, tplDst, { recursive: true })
  // 清理旧版单 skill 缓存目录
  const legacy = contentSkillPathLegacy()
  if (existsSync(legacy)) rmSync(legacy, { recursive: true, force: true })
  rmSync(staging, { recursive: true, force: true })

  saveContentMeta({
    source,
    revision: rev,
    updatedAt: new Date().toISOString(),
    force: !!force,
    skills: names,
  })
  console.log(`内容已更新: ${rev.slice(0, 8)}（skills: ${names.join(', ')}）`)
  return rev
}

function ensureContent() {
  return ensureContentCache()
}

/** 挂载目标路径（按 skill 名） */
function skillTargetPath(targetName, skillName, cwd = process.cwd()) {
  const home = homedir()
  if (targetName === 'cursor') return join(home, '.cursor', 'skills', skillName)
  if (targetName === 'codex') {
    const codexHome = process.env.CODEX_HOME || join(home, '.codex')
    return join(codexHome, 'skills', skillName)
  }
  if (targetName === 'dsh') return join(home, '.dsh', 'skills', skillName)
  if (targetName === 'cwd') {
    return [
      join(cwd, '.cursor', 'skills', skillName),
      join(cwd, '.dsh', 'skills', skillName),
      join(cwd, '.agents', 'skills', skillName),
    ]
  }
  return null
}

function normalizeCustomPath(p, skillName) {
  const abs = resolve(p)
  if (basename(abs) === skillName) return abs
  return join(abs, skillName)
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

function pathExists(path) {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

function removePath(path) {
  if (!pathExists(path)) return
  const kind = linkKind(path)
  // Windows 目录联接 / 符号链接：必须用 rmdir，不能 rmSync 递归进目标
  if (platform() === 'win32' && (kind.kind === 'junction' || kind.kind === 'symlink')) {
    spawnSync('cmd', ['/c', `rmdir "${path}"`], { stdio: 'ignore' })
    if (pathExists(path)) {
      try {
        unlinkSync(path)
      } catch {
        /* ignore */
      }
    }
    if (pathExists(path)) {
      throw new Error(`无法删除已有链接: ${path}`)
    }
    return
  }
  if (kind.kind === 'symlink') {
    unlinkSync(path)
    return
  }
  rmSync(path, { recursive: true, force: true })
}

function linkSkill(dest, source, force) {
  mkdirSync(dirname(dest), { recursive: true })
  if (pathExists(dest)) {
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
    if (pathExists(dest)) removePath(dest)
    cpSync(source, dest, { recursive: true })
    console.log(`copy: ${dest}`)
    return { dest, kind: 'copy' }
  }
}

function refreshCopyTargets(targets) {
  for (const t of targets) {
    const skillName = t.skill || LEGACY_SKILL_NAME
    const source = resolveCachedSkillDir(skillName)
    if (!source) {
      console.warn(`跳过（缓存无 ${skillName}）: ${t.path}`)
      continue
    }
    const kind = linkKind(t.path)
    if (kind.kind === 'copy') {
      removePath(t.path)
      cpSync(source, t.path, { recursive: true })
      console.log(`已覆盖 copy 目标: ${t.path}`)
    }
  }
}

function printSkillCatalog(names) {
  console.log('可用 Skill:')
  names.forEach((name, i) => {
    const dir = resolveCachedSkillDir(name)
    const title = dir ? readSkillFrontName(dir) : name
    console.log(`  ${i + 1}) ${name}${title !== name ? `  (${title})` : ''}`)
  })
  console.log('  a) all（全部）')
}

async function askInteractiveSkills(names) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q) => new Promise((res) => rl.question(q, res))
  printSkillCatalog(names)
  const ans = await ask('输入编号或名称（逗号分隔，如 1,2 或 all）: ')
  rl.close()
  const picked = []
  for (const part of String(ans).split(/[,，\s]+/).filter(Boolean)) {
    if (part === 'a' || part.toLowerCase() === 'all') return [...names]
    const idx = Number(part)
    if (Number.isInteger(idx) && idx >= 1 && idx <= names.length) {
      picked.push(names[idx - 1])
    } else if (names.includes(part)) {
      picked.push(part)
    } else {
      throw new Error(`未知 Skill: ${part}`)
    }
  }
  return [...new Set(picked)]
}

async function askInteractiveTargets(skillName) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q) => new Promise((res) => rl.question(q, res))
  const sample = skillName || '<skill>'
  console.log(`可选挂载目标（Skill 目录名: ${sample}）:
  1) cursor  ${join(homedir(), '.cursor', 'skills', sample)}
  2) codex   ${join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'skills', sample)}
  3) dsh     ${join(homedir(), '.dsh', 'skills', sample)}
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

/** 解析 install 位置参数：all / skill 名；其余留给 parseArgs */
function splitSkillInstallArgv(argv) {
  const skillNames = []
  const rest = []
  let i = 0
  while (i < argv.length) {
    const a = argv[i]
    if (a.startsWith('-')) {
      rest.push(...argv.slice(i))
      break
    }
    skillNames.push(a)
    i++
  }
  return { skillNames, rest }
}

async function cmdSkill(argv) {
  const sub = argv[0]
  if (sub === 'list') {
    ensureContent()
    const names = listCachedSkillNames()
    if (!names.length) {
      console.log('无可用 Skill，请执行 sa-mp skill update')
      return
    }
    printSkillCatalog(names)
    console.log(`\n安装示例:
  sa-mp skill install ${names[0]} --target cursor
  sa-mp skill install all --target cursor
  sa-mp skill install`)
    return
  }
  if (sub === 'update') {
    fetchContent(true)
    const cfg = loadConfig()
    const targets = Array.isArray(cfg.skillTargets) ? cfg.skillTargets : []
    refreshCopyTargets(targets)
    return
  }
  if (sub === 'status') {
    const meta = loadContentMeta()
    let skills = []
    try {
      ensureContent()
      skills = listCachedSkillNames().map((name) => ({
        name,
        dir: resolveCachedSkillDir(name),
        title: readSkillFrontName(resolveCachedSkillDir(name)),
      }))
    } catch (e) {
      skills = [{ error: e.message }]
    }
    const cfg = loadConfig()
    console.log(JSON.stringify({
      skillSource: skillSource(cfg),
      content: meta,
      skills,
      targets: (cfg.skillTargets || []).map((t) => ({
        ...t,
        live: linkKind(t.path),
      })),
    }, null, 2))
    return
  }
  if (sub === 'install') {
    const { skillNames: rawNames, rest } = splitSkillInstallArgv(argv.slice(1))
    let args = parseArgs(rest)

    ensureContent()
    const available = listCachedSkillNames()
    if (!available.length) throw new Error('无可用 Skill，请执行 sa-mp skill update')

    let selectedSkills = []
    if (rawNames.includes('all')) {
      selectedSkills = [...available]
    } else if (rawNames.length) {
      for (const n of rawNames) {
        if (!available.includes(n)) {
          throw new Error(`未知 Skill: ${n}\n可用: ${available.join(', ')}`)
        }
      }
      selectedSkills = [...new Set(rawNames)]
    } else {
      if (!process.stdin.isTTY) {
        throw new Error('非交互环境请传 skill 名或 all，例如: sa-mp skill install all --target cursor')
      }
      selectedSkills = await askInteractiveSkills(available)
    }
    if (!selectedSkills.length) throw new Error('未选择任何 Skill')

    if (!args.target.length && !args.path.length) {
      if (!process.stdin.isTTY) {
        throw new Error('非交互环境请传 --target 或 --path')
      }
      const picked = await askInteractiveTargets(selectedSkills[0])
      args = { ...args, target: picked.target, path: picked.path }
    }
    if (!args.target.length && !args.path.length) {
      throw new Error('未选择任何挂载目标')
    }

    const results = []
    for (const skillName of selectedSkills) {
      const source = resolveCachedSkillDir(skillName)
      if (!source) throw new Error(`缓存中无 Skill: ${skillName}`)
      const dests = []
      for (const t of args.target) {
        const p = skillTargetPath(t, skillName)
        if (!p) throw new Error(`未知 --target: ${t}`)
        if (Array.isArray(p)) dests.push(...p.map((d) => ({ path: d, via: t })))
        else dests.push({ path: p, via: t })
      }
      for (const p of args.path) {
        dests.push({ path: normalizeCustomPath(p, skillName), via: 'path' })
      }
      for (const d of dests) {
        const r = linkSkill(d.path, source, !!args.force)
        results.push({ ...r, via: d.via, skill: skillName })
      }
    }

    const cfg = loadConfig()
    const prev = Array.isArray(cfg.skillTargets) ? cfg.skillTargets : []
    const map = new Map(prev.map((x) => [x.path, x]))
    for (const r of results) {
      map.set(r.dest, { path: r.dest, kind: r.kind, via: r.via, skill: r.skill })
    }
    cfg.skillTargets = [...map.values()]
    saveConfig(cfg)
    console.log(`已安装: ${selectedSkills.join(', ')}`)
    console.log(`已写入 skillTargets: ${configPath()}`)
    return
  }
  throw new Error('用法: sa-mp skill install|update|status|list')
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
  console.log('入口: index.html（C 端 Vue + Vant）；控制台: admin/（sa-mp console）')
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

function transformPreviewHtml(html, localStaticBase, adminPage) {
  let out = html.split('__SUPER_APP_STATIC__').join(localStaticBase)
  // admin 页面脚本是相对 html 的 ./assets，base 必须停在 /admin/，否则会落到 C 端 /assets
  const baseTag = `<base href="${adminPage ? '/admin/' : '/'}">`
  const envSrc = adminPage ? '/__superapp_env.js' : './__superapp_env.js'
  const liveSrc = adminPage ? '/__sa_livereload.js' : './__sa_livereload.js'
  const envTag = `<script src="${envSrc}"></script>`
  const liveTag = `<script src="${liveSrc}"></script>`
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
    const headers = {
      'Content-Type': ctype,
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-store',
    }
    allowOpaqueOriginCORS(req, headers)
    res.writeHead(upstreamRes.status, headers)
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

function allowConsoleManifestCORS(req, headers, openWebBase) {
  const origin = String(req.headers.origin || '')
  if (!origin) return
  let ok = false
  try {
    const from = new URL(origin)
    const open = new URL(openWebBase)
    const loopback = from.hostname === '127.0.0.1' || from.hostname === 'localhost'
    ok = from.origin === open.origin || (loopback && (from.port === '9174' || from.port === open.port))
  } catch {
    ok = false
  }
  if (!ok) return
  headers['Access-Control-Allow-Origin'] = origin
  headers.Vary = 'Origin'
}

/** 控制台 iframe 带 sandbox 且无 allow-same-origin，文档源为 null，跨域脚本必须回显该源 */
function allowOpaqueOriginCORS(req, headers) {
  if (String(req.headers.origin || '') !== 'null') return
  headers['Access-Control-Allow-Origin'] = 'null'
  headers.Vary = 'Origin'
}

async function cmdPreview(argv, mode) {
  const consoleMode = mode === 'console'
  const args = parseArgs(argv)
  const abs = resolveProjectDir(args)
  if (!existsSync(join(abs, 'index.html'))) {
    throw new Error(`目录根缺少 index.html: ${abs}`)
  }
  if (consoleMode && !existsSync(join(abs, 'admin', 'index.html'))) {
    console.warn('[console] 未找到 admin/index.html，控制台页会是空态')
  }
  const defaultPort = consoleMode ? 5180 : 5179
  const port = Number(args.port && args.port !== true ? args.port : defaultPort) || defaultPort
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
        if (req.method === 'OPTIONS') {
          const headers = { 'Cache-Control': 'no-store' }
          allowOpaqueOriginCORS(req, headers)
          if (pathname === '/admin/manifest.json') allowConsoleManifestCORS(req, headers, openWebBase)
          res.writeHead(204, headers)
          res.end()
          return
        }
        if (pathname === LOCAL_STATIC_PREFIX || pathname.startsWith(LOCAL_STATIC_PREFIX + '/')) {
          await proxyPlatformStatic(req, res, pathname, upstreamStaticBase, csp)
          return
        }
        if (pathname === '/__sa_reload') {
          const headers = {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
          }
          allowOpaqueOriginCORS(req, headers)
          res.writeHead(200, headers)
          res.write(': ok\n\n')
          reloadClients.add(res)
          req.on('close', () => reloadClients.delete(res))
          return
        }
        if (pathname === '/__sa_livereload.js') {
          const headers = {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Security-Policy': csp,
            'Cache-Control': 'no-store',
          }
          allowOpaqueOriginCORS(req, headers)
          res.writeHead(200, headers)
          res.end(LIVE_RELOAD_JS)
          return
        }
        if (pathname === '/__superapp_env.js') {
          const headers = {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Security-Policy': csp,
            'Cache-Control': 'no-store',
          }
          allowOpaqueOriginCORS(req, headers)
          res.writeHead(200, headers)
          res.end(envJs)
          return
        }
        if (pathname.endsWith('/')) pathname += 'index.html'
        const manifestCORS = pathname === '/admin/manifest.json'
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
        allowOpaqueOriginCORS(req, headers)
        if (manifestCORS) allowConsoleManifestCORS(req, headers, openWebBase)
        if (ext === '.html') {
          const adminPage = filePath.includes(`${sep}admin${sep}`)
          const html = transformPreviewHtml(readFileSync(filePath, 'utf8'), localStaticBase, adminPage)
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
  if (appid && consoleMode) {
    const debugUrl =
      `${openWebBase}/microApps/console?appid=${encodeURIComponent(appid)}` +
      `&debug=${encodeURIComponent(localUrl + 'admin/')}`
    console.log(`控制台调试（需已登录开放平台）: ${debugUrl}`)
    if (!args['no-open']) openBrowser(debugUrl)
  } else if (appid) {
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

  let skillNames = []
  try {
    ensureContent()
    skillNames = listCachedSkillNames()
  } catch (e) {
    skillNames = []
  }
  const meta = loadContentMeta()
  checks.push({
    name: 'Skill 内容缓存',
    ok: skillNames.length > 0,
    detail: meta
      ? `${meta.revision?.slice(0, 8) || '?'} [${skillNames.join(', ') || '空'}]`
      : skillNames.length
        ? skillNames.join(', ')
        : 'missing',
  })

  for (const t of cfg.skillTargets || []) {
    const live = linkKind(t.path)
    checks.push({
      name: `Skill 目标 ${t.skill || ''} ${t.via || ''}`.trim(),
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

function schemaPath(projectDir) {
  return join(projectDir, 'data', 'schema.json')
}

function readLocalSchema(projectDir) {
  const p = schemaPath(projectDir)
  if (!existsSync(p)) return { tables: [] }
  return JSON.parse(readFileSync(p, 'utf8'))
}

function writeLocalSchema(projectDir, schema) {
  const dir = join(projectDir, 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(schemaPath(projectDir), JSON.stringify(schema, null, 2) + '\n', 'utf8')
}

async function cmdData(argv) {
  const sub = argv[0]
  const args = parseArgs(argv.slice(1))
  const projectDir = resolveProjectDir(args)
  const cfg = loadConfig()
  if (!cfg.baseUrl || !cfg.apiKey) throw new Error('请先 sa-mp config set --base-url ... --api-key ...')
  const appid = resolveAppid(args, projectDir)
  if (!appid) throw new Error('缺少 appid（config.json 或 --appid）')

  if (sub === 'pull') {
    const remote = await postJSON(cfg, '/data/schema/pull', { appid })
    writeLocalSchema(projectDir, {
      appid: remote.appid || appid,
      backend: remote.backend || 'managed',
      tables: remote.tables || [],
    })
    console.log(`已写入 ${schemaPath(projectDir)}（${(remote.tables || []).length} 张表）`)
    return
  }
  if (sub === 'push') {
    const local = readLocalSchema(projectDir)
    const tables = (local.tables || []).map((t) => ({
      ...t,
      fields: (t.fields || []).map((f) => ({
        ...f,
        clientReadable: f.clientReadable !== false,
        clientWritable: f.clientWritable !== false,
      })),
    }))
    const remote = await postJSON(cfg, '/data/schema/push', {
      appid,
      tables,
      publish: !!args.publish,
    })
    writeLocalSchema(projectDir, {
      appid: remote.appid || appid,
      backend: remote.backend || 'managed',
      tables: remote.tables || tables,
    })
    console.log(`已推送 ${(remote.tables || tables).length} 张表${args.publish ? '并发布' : ''}`)
    return
  }
  if (sub === 'diff') {
    const local = readLocalSchema(projectDir)
    const diff = await postJSON(cfg, '/data/schema/diff', {
      appid,
      tables: local.tables || [],
    })
    console.log(diff.summary || JSON.stringify(diff, null, 2))
    if (diff.addedTables?.length) console.log('added:', diff.addedTables.join(', '))
    if (diff.removedTables?.length) console.log('removed:', diff.removedTables.join(', '))
    if (diff.changedTables?.length) console.log('changed:', diff.changedTables.join(', '))
    return
  }
  throw new Error('用法: sa-mp data pull|push|diff')
}

function functionsDir(projectDir) {
  return join(projectDir, 'functions')
}

function listLocalFunctions(projectDir) {
  const dir = functionsDir(projectDir)
  if (!existsSync(dir)) return []
  const metaPath = join(dir, 'meta.json')
  let meta = {}
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8')) || {}
    } catch {
      meta = {}
    }
  }
  const byName = meta.functions || meta || {}
  return readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => {
      const name = f.replace(/\.js$/, '')
      const source = readFileSync(join(dir, f), 'utf8')
      const m = byName[name] || {}
      return {
        name,
        title: m.title || name,
        description: m.description || '',
        auth: m.auth || 'auth',
        timeoutMs: m.timeoutMs || 3000,
        source,
      }
    })
}

function writeLocalFunctions(projectDir, list) {
  const dir = functionsDir(projectDir)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const meta = { functions: {} }
  for (const fn of list || []) {
    const name = fn.name
    if (!name) continue
    writeFileSync(join(dir, `${name}.js`), fn.source || '', 'utf8')
    meta.functions[name] = {
      title: fn.title || name,
      description: fn.description || '',
      auth: fn.auth || 'auth',
      timeoutMs: fn.timeoutMs || 3000,
    }
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8')
}

async function cmdFn(argv) {
  const sub = argv[0]
  const args = parseArgs(argv.slice(1))
  const projectDir = resolveProjectDir(args)
  const cfg = loadConfig()
  if (!cfg.baseUrl || !cfg.apiKey) throw new Error('请先 sa-mp config set --base-url ... --api-key ...')
  const appid = resolveAppid(args, projectDir)
  if (!appid) throw new Error('缺少 appid（config.json 或 --appid）')

  if (sub === 'pull') {
    const remote = await postJSON(cfg, '/data/fn/pull', { appid })
    writeLocalFunctions(projectDir, remote.list || [])
    console.log(`已写入 ${functionsDir(projectDir)}（${(remote.list || []).length} 个函数）`)
    return
  }
  if (sub === 'push') {
    const functions = listLocalFunctions(projectDir)
    if (!functions.length) throw new Error('functions/ 下没有 .js 文件')
    const remote = await postJSON(cfg, '/data/fn/push', {
      appid,
      functions,
      publish: !!args.publish,
    })
    console.log(`已推送 ${(remote.list || functions).length} 个函数${args.publish ? '并发布' : ''}`)
    return
  }
  if (sub === 'list') {
    const remote = await postJSON(cfg, '/data/fn/list', { appid })
    const list = remote.list || []
    if (!list.length) {
      console.log('(无函数)')
      return
    }
    for (const f of list) {
      console.log(`${f.name}\tstatus=${f.status}\tauth=${f.auth}\ttimeout=${f.timeoutMs}ms`)
    }
    return
  }
  throw new Error('用法: sa-mp fn pull|push|list')
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
    else if (cmd === 'console') await cmdPreview(argv.slice(1), 'console')
    else if (cmd === 'next-version') await cmdNextVersion(argv.slice(1))
    else if (cmd === 'submit') await cmdSubmit(argv.slice(1))
    else if (cmd === 'data') await cmdData(argv.slice(1))
    else if (cmd === 'fn') await cmdFn(argv.slice(1))
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
