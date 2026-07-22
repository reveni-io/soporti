import { JWT } from 'google-auth-library'
import config from '../config.js'
import { redactSecrets } from '../review/output-guard.js'
import { getDriveCredentials } from './settings.js'

// Read-only Google Drive client. Talks to the Drive v3 REST API with raw fetch
// (no googleapis SDK); google-auth-library supplies the service-account JWT. The
// access boundary is Drive sharing. Heavy parsers (unpdf,
// mammoth, exceljs, jszip, fast-xml-parser) are loaded lazily, per file type, so
// they never weigh on boot when the integration is off or the type isn't read.

const BASE_URL = 'https://www.googleapis.com/drive/v3'
const REQUEST_TIMEOUT_MS = 15_000
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

const GOOGLE_MIME = {
  doc: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
  slides: 'application/vnd.google-apps.presentation',
  drawing: 'application/vnd.google-apps.drawing',
  folder: 'application/vnd.google-apps.folder',
}

const OFFICE_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

// --- Auth ---------------------------------------------------------------------

let jwtClient = null
let jwtClientEmail = null

// The credential lives in the database (admin panel) now, so resolve it per
// call and rebuild the JWT client whenever the service account changes (or was
// cleared). google-auth-library caches and refreshes the access token
// internally, so we construct the JWT once per credential and never manage
// token lifetime ourselves.
async function getClient() {
  const creds = await getDriveCredentials()
  if (!creds) throw new Error('Google Drive is not configured.')
  if (!jwtClient || jwtClientEmail !== creds.client_email) {
    jwtClient = new JWT({ email: creds.client_email, key: creds.private_key, scopes: [DRIVE_SCOPE] })
    jwtClientEmail = creds.client_email
  }
  return jwtClient
}

async function authToken() {
  // Deliberately swallow the underlying error: it could echo credential material
  // (key fragments, grant details) and must never reach logs or the agent.
  try {
    const client = await getClient()
    const { token } = await client.getAccessToken()
    if (!token) throw new Error('no token')
    return token
  } catch {
    throw new Error('Google Drive: failed to obtain access token')
  }
}

// --- HTTP ---------------------------------------------------------------------

class DriveApiError extends Error {
  constructor(status, reason, path) {
    super(`Google Drive API GET ${path} failed (${status})${reason ? `: ${reason}` : ''}`)
    this.name = 'DriveApiError'
    this.status = status
    this.reason = reason
  }
}

// Extract only the machine-readable reason/status from an error body — never the
// raw body, which is logged/echoed nowhere.
async function classifyError(res, path) {
  let reason = ''
  try {
    const json = JSON.parse(await res.text())
    reason = json?.error?.errors?.[0]?.reason || json?.error?.status || ''
  } catch {
    // Body absent or not JSON — no machine-readable reason to extract.
  }
  return new DriveApiError(res.status, reason, path)
}

function isRateLimit(err) {
  return (
    err instanceof DriveApiError &&
    (err.status === 429 || err.reason === 'rateLimitExceeded' || err.reason === 'userRateLimitExceeded')
  )
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// JSON GET (metadata, search, listing). The abort timer covers the body read too.
// Retries a couple of times on rate limits with short backoff.
async function getJson(path, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  let attempt = 0
  while (true) {
    const token = await authToken()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) return await res.json()
      const err = await classifyError(res, path)
      if (isRateLimit(err) && attempt < 2) {
        attempt++
        await sleep(250 * attempt)
        continue
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}

// Text GET for Google-native exports (Docs/Sheets/Slides). Server caps exports at
// 10 MB and refuses larger ones with 403 exportSizeLimitExceeded (handled upstream).
async function exportText(fileId, exportMime) {
  const path = `/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`
  const token = await authToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await classifyError(res, path)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// Raw byte download (alt=media) with a hard byte cap enforced WHILE streaming —
// the authoritative OOM guard, since Drive doesn't always send Content-Length.
// Uses the longer download timeout, not the 15s JSON one.
async function downloadCapped(fileId, maxBytes) {
  const path = `/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
  const token = await authToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.google.drive.downloadTimeoutMs)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await classifyError(res, path)
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared && declared > maxBytes) throw new DriveApiError(0, 'fileTooLarge', path)
    if (!res.body) return new Uint8Array(0)

    const chunks = []
    let total = 0
    for await (const chunk of res.body) {
      const c = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
      total += c.length
      if (total > maxBytes) {
        controller.abort()
        throw new DriveApiError(0, 'fileTooLarge', path)
      }
      chunks.push(c)
    }
    const out = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      out.set(c, offset)
      offset += c.length
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

// --- Concurrency --------------------------------------------------------------

// Bound concurrent download+parse operations: web/Slack/PR-review turns run in
// parallel and a few large files in flight could otherwise exhaust the heap.
function createSemaphore(max) {
  let active = 0
  const queue = []
  const next = () => {
    if (active >= max || queue.length === 0) return
    active++
    const resolve = queue.shift()
    resolve(() => {
      active--
      next()
    })
  }
  return {
    acquire() {
      return new Promise(resolve => {
        queue.push(resolve)
        next()
      })
    },
  }
}

const blobSemaphore = createSemaphore(Math.max(1, config.google?.drive?.parseConcurrency || 1))

// --- Parsers (lazy) -----------------------------------------------------------

async function parsePdf(buffer) {
  const { getDocumentProxy, extractText } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  // mergePages:true is required — otherwise extractText returns string[] (one per
  // page) and the "empty => scanned" check below would silently break.
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

async function parseDocx(buffer) {
  const mammoth = (await import('mammoth')).default
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
  return value
}

function formatCell(v) {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text || '').join('')
    if (v.error != null) return String(v.error)
    if (v.result != null) return formatCell(v.result)
    if (v.text != null) return formatCell(v.text)
    if (v.hyperlink) return String(v.hyperlink)
    return JSON.stringify(v)
  }
  return String(v)
}

async function parseXlsx(buffer) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(buffer))
  const parts = []
  wb.eachSheet(ws => {
    parts.push(`# ${ws.name}`)
    ws.eachRow(row => {
      // row.values is 1-indexed (index 0 is empty), so drop the leading hole.
      const cells = (row.values || []).slice(1).map(formatCell)
      parts.push(cells.join('\t'))
    })
  })
  return parts.join('\n')
}

function collectPptxText(node, acc) {
  if (node == null || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    if (key === 'a:t') {
      const runs = Array.isArray(value) ? value : [value]
      for (const r of runs) acc.push(typeof r === 'string' ? r : String(r))
    } else if (Array.isArray(value)) {
      for (const child of value) collectPptxText(child, acc)
    } else if (typeof value === 'object') {
      collectPptxText(value, acc)
    }
  }
}

async function parsePptx(buffer) {
  const JSZip = (await import('jszip')).default
  const { XMLParser } = await import('fast-xml-parser')
  const zip = await JSZip.loadAsync(buffer)
  // parseTagValue:false / trimValues:false keep run text verbatim — otherwise
  // fast-xml-parser coerces "007" -> 7, "true" -> boolean and strips spacing.
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: false })
  const slideNum = p => Number((p.match(/(\d+)\.xml$/) || [])[1] || 0)
  const slidePaths = Object.keys(zip.files)
    .filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNum(a) - slideNum(b))

  const out = []
  for (const path of slidePaths) {
    const n = slideNum(path)
    const runs = []
    collectPptxText(parser.parse(await zip.file(path).async('string')), runs)
    out.push(`# Slide ${n}`)
    if (runs.length) out.push(runs.join('\n'))

    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`)
    if (notesFile) {
      const notesRuns = []
      collectPptxText(parser.parse(await notesFile.async('string')), notesRuns)
      if (notesRuns.length) {
        out.push('## Notes')
        out.push(notesRuns.join('\n'))
      }
    }
  }
  return out.join('\n')
}

function decodeUtf8(buffer) {
  return new TextDecoder('utf-8').decode(buffer)
}

function isTextMime(mime) {
  return Boolean(mime) && (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml')
}

// --- Result shaping -----------------------------------------------------------

function finalizeText(base, full, extraNotice) {
  const max = config.google.drive.maxChars
  // Redact before slicing so a secret straddling the cut can't leak its tail.
  const redacted = redactSecrets(full)
  const truncated = redacted.length > max
  const content = truncated ? redacted.slice(0, max) : redacted
  console.log(
    `[google-drive] getFile(${base.id}) "${base.name}" mime=${base.mimeType} → ${content.length} chars${truncated ? ' (truncated)' : ''}`
  )
  const result = { ...base, content, truncated, totalChars: redacted.length, returnedChars: content.length }
  if (extraNotice) result.notice = extraNotice
  return result
}

function errorToNotice(err, url) {
  if (err && err.name === 'AbortError') {
    return { error: 'timeout', notice: 'Reading the document timed out; it may be very large.' }
  }
  if (err instanceof DriveApiError) {
    if (err.reason === 'fileTooLarge') {
      return {
        error: 'file_too_large',
        notice: `Document exceeds the read size limit. Open it directly: ${url || '(no link available)'}`,
      }
    }
    if (err.reason === 'exportSizeLimitExceeded') {
      return {
        error: 'export_too_large',
        notice: `Document is too large to export as text (10 MB export cap). Open it directly: ${url || '(no link available)'}`,
      }
    }
    if (err.status === 403) {
      return {
        error: 'access_denied',
        notice:
          'This file or folder is not shared with the assistant. Ask an owner to share the folder with the service account (Viewer).',
      }
    }
    if (err.status === 404) {
      return { error: 'not_found', notice: 'File not found; it may have been moved or deleted.' }
    }
    if (err.status === 429) {
      return { error: 'rate_limited', notice: 'Google Drive is rate-limiting requests; try again shortly.' }
    }
    if (err.status >= 500) {
      return {
        error: 'upstream_error',
        notice: `Google Drive returned a server error (${err.status}). Open it directly: ${url || '(no link available)'}`,
      }
    }
  }
  return null
}

// --- Public API ---------------------------------------------------------------

function mapFile(f) {
  // Redact credential-shaped strings in file names too (content already is).
  return {
    id: f.id,
    name: redactSecrets(f.name),
    mimeType: f.mimeType,
    url: f.webViewLink,
    modifiedTime: f.modifiedTime,
  }
}

function escapeQuery(value) {
  // Escape backslashes FIRST, then single quotes, before interpolating into the
  // single-quoted Drive `q` term — apostrophes in NL queries would otherwise
  // break the query, and unescaped quotes could inject query operators.
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

const SEARCH_FIELDS = 'files(id,name,mimeType,modifiedTime,webViewLink),incompleteSearch,nextPageToken'
const SHARED_DRIVE_PARAMS = {
  supportsAllDrives: 'true',
  includeItemsFromAllDrives: 'true',
  corpora: 'allDrives',
}

// Run a files.list query, degrading recoverable failures (403/timeout/429/5xx)
// to an empty result + notice for consistency with getFile, rather than throwing
// a raw exception out of the tool.
async function listQuery(path, label) {
  let data
  try {
    data = await getJson(path)
  } catch (err) {
    const notice = errorToNotice(err, null)
    if (notice) {
      console.log(`[google-drive] ${label} → ${notice.error}`)
      return { files: [], incompleteSearch: false, hasMore: false, ...notice }
    }
    throw err
  }
  const files = (data.files || []).map(mapFile)
  console.log(`[google-drive] ${label} → ${files.length} results${data.incompleteSearch ? ' (incomplete)' : ''}`)
  return { files, incompleteSearch: Boolean(data.incompleteSearch), hasMore: Boolean(data.nextPageToken) }
}

export async function searchFiles(query) {
  const safe = escapeQuery(query)
  const params = new URLSearchParams({
    q: `(fullText contains '${safe}' or name contains '${safe}') and trashed = false`,
    fields: SEARCH_FIELDS,
    pageSize: '20',
    ...SHARED_DRIVE_PARAMS,
    // No orderBy: keep Drive's relevance ranking so the 20-result cap surfaces the
    // most relevant docs first.
  })
  return listQuery(`/files?${params.toString()}`, `searchFiles("${query}")`)
}

// Shared Drives the service account is a member of. A Shared Drive's id doubles
// as its root folder id, so the agent can then list into it with list_drive_files.
async function listDrives() {
  let data
  try {
    data = await getJson('/drives?pageSize=100&fields=drives(id,name)')
  } catch {
    return []
  }
  return (data.drives || []).map(d => ({
    id: d.id,
    name: redactSecrets(d.name),
    mimeType: 'application/vnd.google-apps.folder',
    url: `https://drive.google.com/drive/folders/${d.id}`,
  }))
}

export async function listFiles(folderId) {
  // No folder given: enumerate the entry points the SA can actually see — items
  // shared directly with it (sharedWithMe) plus the Shared Drives it belongs to.
  // This is how the agent discovers what exists without knowing a folder id.
  if (!folderId) {
    const params = new URLSearchParams({
      q: 'sharedWithMe = true and trashed = false',
      fields: SEARCH_FIELDS,
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })
    const shared = await listQuery(`/files?${params.toString()}`, 'listFiles(roots)')
    const drives = await listDrives()
    return { ...shared, files: [...drives, ...shared.files] }
  }

  const safe = escapeQuery(folderId)
  const params = new URLSearchParams({
    q: `'${safe}' in parents and trashed = false`,
    fields: SEARCH_FIELDS,
    pageSize: '100',
    orderBy: 'folder,name',
    ...SHARED_DRIVE_PARAMS,
  })
  // `in parents` is non-recursive: these are the folder's direct children only.
  return listQuery(`/files?${params.toString()}`, `listFiles(${folderId})`)
}

async function readBlobParsed(meta, base, parse, { scanned = false } = {}) {
  const size = Number(meta.size || 0)
  if (size && size > config.google.drive.maxBytes) {
    console.log(`[google-drive] getFile(${meta.id}) "${meta.name}" → file_too_large`)
    return {
      ...base,
      error: 'file_too_large',
      notice: `Document exceeds the read size limit. Open it directly: ${base.url || '(no link available)'}`,
    }
  }

  const release = await blobSemaphore.acquire()
  let text
  try {
    const buffer = await downloadCapped(meta.id, config.google.drive.maxBytes)
    try {
      text = await parse(buffer)
    } catch {
      // Malformed / encrypted / password-protected file — degrade to a notice
      // instead of throwing a raw parser exception out of the tool.
      console.log(`[google-drive] getFile(${meta.id}) "${meta.name}" mime=${meta.mimeType} → parse_failed`)
      return {
        ...base,
        content: '',
        error: 'parse_failed',
        notice: `Could not extract text from this document; it may be corrupt, encrypted, or password-protected. Open it directly: ${base.url || '(no link available)'}`,
      }
    }
  } finally {
    release()
  }

  if (!text || !text.trim()) {
    console.log(
      `[google-drive] getFile(${meta.id}) "${meta.name}" mime=${meta.mimeType} → empty${scanned ? ': scanned' : ''}`
    )
    return {
      ...base,
      content: '',
      notice: scanned ? 'Scanned document, no extractable text.' : 'No extractable text in this document.',
    }
  }
  return finalizeText(base, text)
}

async function readByType(meta, base) {
  const mime = meta.mimeType
  if (mime === GOOGLE_MIME.folder) {
    return { ...base, notice: 'This is a folder, not a document. Use list_drive_files to see its contents.' }
  }
  if (mime === GOOGLE_MIME.doc) return finalizeText(base, await exportText(meta.id, 'text/plain'))
  if (mime === GOOGLE_MIME.sheet) {
    return finalizeText(
      base,
      await exportText(meta.id, 'text/csv'),
      'Note: CSV export returns only the first sheet; this spreadsheet may have additional tabs.'
    )
  }
  if (mime === GOOGLE_MIME.slides) return finalizeText(base, await exportText(meta.id, 'text/plain'))
  if (mime === GOOGLE_MIME.drawing) {
    return { ...base, notice: 'Google Drawings cannot be exported as text.' }
  }
  if (mime === 'application/pdf') return readBlobParsed(meta, base, parsePdf, { scanned: true })
  if (mime === OFFICE_MIME.docx) return readBlobParsed(meta, base, parseDocx)
  if (mime === OFFICE_MIME.xlsx) return readBlobParsed(meta, base, parseXlsx)
  if (mime === OFFICE_MIME.pptx) return readBlobParsed(meta, base, parsePptx)
  if (isTextMime(mime)) return readBlobParsed(meta, base, decodeUtf8)
  return { ...base, notice: `Unsupported type for reading (${mime}).` }
}

export async function getFile(fileId) {
  let meta
  try {
    meta = await getJson(
      `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink&supportsAllDrives=true`
    )
  } catch (err) {
    const notice = errorToNotice(err, null)
    if (notice) {
      console.log(`[google-drive] getFile(${fileId}) → ${notice.error}`)
      return { id: fileId, ...notice }
    }
    throw err
  }

  const base = {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    url: meta.webViewLink,
    modifiedTime: meta.modifiedTime,
  }
  try {
    return await readByType(meta, base)
  } catch (err) {
    const notice = errorToNotice(err, meta.webViewLink)
    if (notice) {
      console.log(`[google-drive] getFile(${fileId}) "${meta.name}" → ${notice.error}`)
      return { ...base, ...notice }
    }
    throw err
  }
}

// Async because the credential lives in the database now. Which service account
// is live (and therefore which shared folders are exposed) is logged on save —
// see setDriveCredentials in ./settings.js.
export async function isConfigured() {
  return Boolean(await getDriveCredentials())
}
