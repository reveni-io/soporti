import { extname } from 'node:path'
import { VideoProjectError } from './project-error.js'

const PROJECT_FILE = 'project.json'
const FILE_PATH_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/
const ASSET_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/
const CSS_ASSET_URL_RE = /url\(\s*(['"]?)assets\/([^'")\s]*)\1\s*\)/g
const SCRIPT_BREAKOUT_RE = /<(?=\/script|!--)/gi
const PROJECT_LINE_RE = /^window\.__PROJECT__ = (.+)$/m
const RESERVED_PREFIXES = ['assets/', 'kit/']
const TEXT_EXTENSIONS = new Set(['.js', '.css', '.json', '.svg'])
export const ASSET_MIME_TYPES = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}
const KB = 1024
const MB = 1024 * KB
export const MAX_FILES = 40
export const MAX_FILE_BYTES = 400 * KB
export const MAX_FILES_BYTES = 2 * MB
export const MAX_ASSET_BYTES = 2 * MB
export const MAX_ASSETS_BYTES = 15 * MB
const MAX_TITLE_LENGTH = 200
export const FORMATS = [
  { width: 1920, height: 1080, label: '16:9' },
  { width: 1080, height: 1080, label: '1:1' },
  { width: 1080, height: 1920, label: '9:16' },
]
const FRAME_RATES = [30, 60]
const FORMAT_LIST = FORMATS.map(({ width, height, label }) => `${width}×${height} (${label})`).join(', ')
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

export function formatSize(bytes) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`
  return `${Math.ceil(bytes / KB)} KB`
}

export function describePathProblem(path) {
  if (!FILE_PATH_RE.test(path)) {
    return `"${path}" is not a valid file path: use lowercase letters, digits, ".", "_" and "-", with "/" between folders.`
  }
  if (RESERVED_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return `"${path}" is reserved: project files cannot live under assets/ or kit/.`
  }
  if (!TEXT_EXTENSIONS.has(extname(path))) {
    return `"${path}" has an unsupported extension: project files are .js, .css, .json or .svg.`
  }
  return null
}

function validateFile(path, content) {
  const problem = describePathProblem(path)
  if (problem) throw new VideoProjectError(problem)
  if (typeof content !== 'string') throw new VideoProjectError(`"${path}" must be text.`)

  const bytes = Buffer.byteLength(content)
  if (bytes > MAX_FILE_BYTES) {
    throw new VideoProjectError(
      `"${path}" is ${formatSize(bytes)}: a file can be at most ${formatSize(MAX_FILE_BYTES)}.`
    )
  }
  return bytes
}

function validateFiles(files) {
  const entries = Object.entries(files)
  if (entries.length > MAX_FILES) {
    throw new VideoProjectError(`The project has ${entries.length} files: the limit is ${MAX_FILES}.`)
  }

  const total = entries.reduce((sum, [path, content]) => sum + validateFile(path, content), 0)
  if (total > MAX_FILES_BYTES) {
    throw new VideoProjectError(
      `The project files add up to ${formatSize(total)}: the limit is ${formatSize(MAX_FILES_BYTES)}.`
    )
  }
}

export function validateAsset(name, asset) {
  if (!ASSET_NAME_RE.test(name)) {
    throw new VideoProjectError(`"${name}" is not a valid asset name: use lowercase letters, digits, ".", "_" and "-".`)
  }
  if (!ASSET_MIME_TYPES[extname(name)]) {
    throw new VideoProjectError(
      `Asset "${name}" is not a font (woff2, woff, ttf, otf) or an image (svg, png, jpg, webp, gif).`
    )
  }
  if (asset.data.length > MAX_ASSET_BYTES) {
    throw new VideoProjectError(
      `Asset "${name}" is ${formatSize(asset.data.length)}: an asset can be at most ${formatSize(MAX_ASSET_BYTES)}.`
    )
  }
  return asset.data.length
}

function validateAssets(assets) {
  const total = Object.entries(assets).reduce((sum, [name, asset]) => sum + validateAsset(name, asset), 0)
  if (total > MAX_ASSETS_BYTES) {
    throw new VideoProjectError(
      `The assets add up to ${formatSize(total)}: the limit is ${formatSize(MAX_ASSETS_BYTES)}.`
    )
  }
}

function parseProjectJson(source) {
  if (typeof source !== 'string') {
    throw new VideoProjectError('project.json is missing: write it with title, width, height, fps, scripts and styles.')
  }

  let project
  try {
    project = JSON.parse(source)
  } catch (error) {
    throw new VideoProjectError(`project.json is not valid JSON: ${error.message}.`)
  }

  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new VideoProjectError('project.json must be a JSON object.')
  }
  return project
}

function validateTitle(title) {
  if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE_LENGTH) {
    throw new VideoProjectError(`project.json needs a "title" of 1 to ${MAX_TITLE_LENGTH} characters.`)
  }
}

function validateFormat({ width, height, fps }) {
  if (!FORMATS.some(format => format.width === width && format.height === height)) {
    throw new VideoProjectError(`project.json width×height must be one of ${FORMAT_LIST}, got ${width}×${height}.`)
  }
  if (!FRAME_RATES.includes(fps)) {
    throw new VideoProjectError(`project.json fps must be 30 or 60, got ${fps}.`)
  }
}

function validateEntry(path, { files, field, extension, seen }) {
  if (typeof path !== 'string' || extname(path) !== extension) {
    throw new VideoProjectError(
      `project.json "${field}" lists ${JSON.stringify(path)}: every entry must be a ${extension} file.`
    )
  }
  if (typeof files[path] !== 'string') {
    throw new VideoProjectError(`project.json "${field}" lists "${path}", but the project has no such file.`)
  }
  if (seen.has(path)) throw new VideoProjectError(`project.json "${field}" lists "${path}" twice.`)
  seen.add(path)
}

function validateEntries(entries, { files, field, extension, required }) {
  if (!Array.isArray(entries) || (required && entries.length === 0)) {
    const expected = required ? 'a non-empty array' : 'an array'
    throw new VideoProjectError(`project.json "${field}" must be ${expected} of ${extension} file paths.`)
  }

  const seen = new Set()
  for (const path of entries) validateEntry(path, { files, field, extension, seen })
}

function parseProject(files) {
  const project = parseProjectJson(files[PROJECT_FILE])
  const styles = project.styles ?? []

  validateTitle(project.title)
  validateFormat(project)
  validateEntries(project.scripts, { files, field: 'scripts', extension: '.js', required: true })
  validateEntries(styles, { files, field: 'styles', extension: '.css', required: false })

  const { title, width, height, fps, scripts } = project
  return { title, width, height, fps, scripts, styles }
}

function buildAssetUrls(assets) {
  return Object.fromEntries(
    Object.entries(assets).map(([name, asset]) => [
      name,
      `data:${ASSET_MIME_TYPES[extname(name)]};base64,${asset.data.toString('base64')}`,
    ])
  )
}

function describeAvailableAssets(assetUrls) {
  const names = Object.keys(assetUrls)
  if (names.length === 0) return 'The video has no assets.'
  return `Available assets: ${names.join(', ')}.`
}

export function inlineAssetUrls(css, { path, assetUrls }) {
  return css.replace(CSS_ASSET_URL_RE, (_match, _quote, name) => {
    if (Object.hasOwn(assetUrls, name)) return `url("${assetUrls[name]}")`
    throw new VideoProjectError(
      `${path} uses assets/${name}, but the video has no asset with that name. ${describeAvailableAssets(assetUrls)}`
    )
  })
}

export function escapeInlineScript(code) {
  return code.replace(SCRIPT_BREAKOUT_RE, '\\x3C')
}

export function escapeInlineStyle(css) {
  return css.replaceAll('<', '\\3c ')
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, character => HTML_ESCAPES[character])
}

function serializeForScript(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function scriptTag(code, sourceUrl) {
  return `<script>${escapeInlineScript(code)}\n//# sourceURL=${sourceUrl}\n</script>`
}

function bootScript({ mode, project, assetUrls }) {
  const { title, width, height, fps } = project
  return [
    `<script>window.__MODE__ = ${serializeForScript(mode)}`,
    `window.__PROJECT__ = ${serializeForScript({ title, width, height, fps })}`,
    `window.__ASSETS__ = ${serializeForScript(assetUrls)}`,
    '</script>',
  ].join('\n')
}

function renderStyles({ project, files, assetUrls }) {
  return project.styles.map(path => escapeInlineStyle(inlineAssetUrls(files[path], { path, assetUrls }))).join('\n')
}

function renderHtml({ project, files, assetUrls, kit, mode }) {
  return [
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(project.title)}</title>`,
    `<style>${renderStyles({ project, files, assetUrls })}</style>`,
    '</head><body><div id="stage"></div>',
    bootScript({ mode, project, assetUrls }),
    ...kit.scripts.map(({ name, content }) => scriptTag(content, `kit/${name}`)),
    ...project.scripts.map(path => scriptTag(files[path], path)),
    scriptTag(kit.runtime, 'kit/runtime.js'),
    '</body></html>',
  ].join('\n')
}

export function bundleProject({ files, assets = {}, kit, mode }) {
  validateFiles(files)
  validateAssets(assets)

  const project = parseProject(files)
  const assetUrls = buildAssetUrls(assets)
  const html = renderHtml({ project, files, assetUrls, kit, mode })

  return { html, project }
}

export function readBundleProject(html) {
  const match = PROJECT_LINE_RE.exec(html)
  if (!match) throw new Error('The HTML is not a video bundle: window.__PROJECT__ is missing.')
  return JSON.parse(match[1])
}
