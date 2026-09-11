import { getFigmaToken, isFigmaConfigured } from './settings.js'

const BASE_URL = 'https://api.figma.com/v1'
const FILE_URL = 'https://www.figma.com/design'
const REQUEST_TIMEOUT_MS = 30_000
const FILE_OVERVIEW_DEPTH = 2
const MAX_FRAMES_PER_PAGE = 100
const MAX_SUMMARY_NODES = 300
const MAX_TEXT_CHARS = 500
const MAX_COMMENTS = 100
const FIGMA_URL_RE = /figma\.com\/(?:design|file|proto|board|slides|make|deck|site)\/([A-Za-z0-9]+)/
const FILE_KEY_RE = /^[A-Za-z0-9]{10,128}$/
const DASHED_NODE_ID_RE = /^I?\d+-\d+(?:;\d+-\d+)*$/
const LAYOUT_NAMES = { HORIZONTAL: 'row', VERTICAL: 'column' }

function ensureProtocol(url) {
  return url.includes('://') ? url : `https://${url}`
}

export function normalizeNodeId(nodeId) {
  const trimmed = nodeId.trim()

  return DASHED_NODE_ID_RE.test(trimmed) ? trimmed.replace(/-/g, ':') : trimmed
}

function toUrlNodeId(nodeId) {
  return nodeId.replace(/:/g, '-')
}

export function buildFigmaUrl(fileKey, nodeId = null) {
  const base = `${FILE_URL}/${fileKey}`

  return nodeId ? `${base}?node-id=${encodeURIComponent(toUrlNodeId(nodeId))}` : base
}

export function parseFigmaReference(value) {
  const raw = value.trim()
  if (!raw) throw new Error('A Figma file URL or file key is required.')

  const match = raw.match(FIGMA_URL_RE)
  if (match) {
    const nodeId = new URL(ensureProtocol(raw)).searchParams.get('node-id')

    return { fileKey: match[1], nodeId: nodeId ? normalizeNodeId(nodeId) : null }
  }

  if (FILE_KEY_RE.test(raw)) return { fileKey: raw, nodeId: null }

  throw new Error(`"${raw}" is neither a Figma file URL nor a Figma file key.`)
}

function resolveNode(reference, nodeId) {
  const parsed = parseFigmaReference(reference)
  const id = nodeId ? normalizeNodeId(nodeId) : parsed.nodeId
  if (!id) throw new Error('A node id is required: pass nodeId, or a Figma URL that carries a node-id parameter.')

  return { fileKey: parsed.fileKey, id }
}

async function request(method, path, body) {
  const token = await getFigmaToken()
  if (!token) {
    throw new Error('Figma is not configured. Set the personal access token in the admin panel (Figma section).')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const options = { method, signal: controller.signal, headers: { 'X-Figma-Token': token } }
  if (body) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, options)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Figma API ${method} ${path} failed (${res.status}): ${text}`)
    }

    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

function toHex(channel) {
  return Math.round(channel * 255)
    .toString(16)
    .padStart(2, '0')
}

function colorToHex(color) {
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

function describeFill(fill) {
  if (fill.type !== 'SOLID' || !fill.color) return fill.type.toLowerCase()
  if (typeof fill.opacity === 'number' && fill.opacity < 1) {
    return `${colorToHex(fill.color)} @ ${Math.round(fill.opacity * 100)}%`
  }

  return colorToHex(fill.color)
}

function summarizeFills(fills) {
  if (!Array.isArray(fills)) return undefined

  const visible = fills.filter(fill => fill.visible !== false && fill.type).map(describeFill)

  return visible.length > 0 ? visible : undefined
}

function summarizeSize(box) {
  if (!box) return undefined

  return { width: Math.round(box.width), height: Math.round(box.height) }
}

function summarizeText(node) {
  const text = typeof node.characters === 'string' ? node.characters : ''
  const style = node.style || {}
  const summary = { text: text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}…` : text }
  const font = [style.fontFamily, style.fontWeight, style.fontSize ? `${style.fontSize}px` : null]
    .filter(Boolean)
    .join(' ')

  if (font) summary.font = font
  if (style.textAlignHorizontal) summary.align = style.textAlignHorizontal.toLowerCase()

  return summary
}

function summarizeNode(node, components, counter) {
  counter.count += 1

  const summary = { id: node.id, name: node.name, type: node.type }
  const size = summarizeSize(node.absoluteBoundingBox)
  const fills = summarizeFills(node.fills)
  const component = node.type === 'INSTANCE' ? components?.[node.componentId]?.name : undefined

  if (size) summary.size = size
  if (node.type === 'TEXT') Object.assign(summary, summarizeText(node))
  if (fills) summary.fills = fills
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) summary.cornerRadius = node.cornerRadius
  if (LAYOUT_NAMES[node.layoutMode]) summary.layout = LAYOUT_NAMES[node.layoutMode]
  if (component) summary.component = component
  if (node.visible === false) summary.hidden = true

  const children = Array.isArray(node.children) ? node.children : []
  if (children.length === 0) return summary

  if (counter.count >= MAX_SUMMARY_NODES) {
    counter.truncated = true
    summary.childCount = children.length

    return summary
  }

  summary.children = children.map(child => summarizeNode(child, components, counter))

  return summary
}

function summarizePage(page) {
  const frames = Array.isArray(page.children) ? page.children : []

  return {
    id: page.id,
    name: page.name,
    frameCount: frames.length,
    frames: frames.slice(0, MAX_FRAMES_PER_PAGE).map(frame => ({
      id: frame.id,
      name: frame.name,
      type: frame.type,
      size: summarizeSize(frame.absoluteBoundingBox),
    })),
  }
}

export async function getFile(reference) {
  const { fileKey } = parseFigmaReference(reference)
  const data = await request('GET', `/files/${fileKey}?depth=${FILE_OVERVIEW_DEPTH}`)
  const pages = (data.document?.children || []).filter(page => page.type === 'CANVAS').map(summarizePage)

  return {
    fileKey,
    name: data.name,
    url: buildFigmaUrl(fileKey),
    lastModified: data.lastModified ?? null,
    pages,
  }
}

export async function getNode(reference, nodeId, depth) {
  const { fileKey, id } = resolveNode(reference, nodeId)
  const data = await request('GET', `/files/${fileKey}/nodes?ids=${encodeURIComponent(id)}&depth=${depth}`)
  const entry = data.nodes?.[id]
  if (!entry?.document) throw new Error(`Node "${id}" was not found in Figma file "${fileKey}".`)

  const counter = { count: 0, truncated: false }
  const node = summarizeNode(entry.document, entry.components, counter)

  return {
    fileKey,
    fileName: data.name ?? null,
    nodeId: id,
    url: buildFigmaUrl(fileKey, id),
    node,
    nodeCount: counter.count,
    truncated: counter.truncated,
  }
}

export async function renderNode(reference, nodeId, scale) {
  const { fileKey, id } = resolveNode(reference, nodeId)
  const data = await request('GET', `/images/${fileKey}?ids=${encodeURIComponent(id)}&format=png&scale=${scale}`)
  const imageUrl = data.images?.[id]
  if (!imageUrl) throw new Error(`Figma could not render node "${id}"${data.err ? `: ${data.err}` : '.'}`)

  return { fileKey, nodeId: id, url: buildFigmaUrl(fileKey, id), imageUrl, scale }
}

function summarizeComment(comment) {
  return {
    id: comment.id,
    message: comment.message,
    author: comment.user?.handle ?? null,
    createdAt: comment.created_at ?? null,
    resolvedAt: comment.resolved_at ?? null,
    nodeId: comment.client_meta?.node_id ?? null,
    replyTo: comment.parent_id || null,
  }
}

export async function listComments(reference) {
  const { fileKey } = parseFigmaReference(reference)
  const data = await request('GET', `/files/${fileKey}/comments`)
  const comments = (data.comments || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))

  return {
    fileKey,
    url: buildFigmaUrl(fileKey),
    total: comments.length,
    comments: comments.slice(0, MAX_COMMENTS).map(summarizeComment),
  }
}

export async function postComment(reference, { message, nodeId = null, replyTo = null }) {
  const parsed = parseFigmaReference(reference)
  const text = message.trim()
  if (!text) throw new Error('A comment message is required.')

  const pin = nodeId ? normalizeNodeId(nodeId) : parsed.nodeId
  const body = { message: text }
  if (replyTo) body.comment_id = replyTo
  if (pin && !replyTo) body.client_meta = { node_id: pin, node_offset: { x: 0, y: 0 } }

  const comment = await request('POST', `/files/${parsed.fileKey}/comments`, body)

  return { ...summarizeComment(comment), fileKey: parsed.fileKey, url: buildFigmaUrl(parsed.fileKey, pin) }
}

export async function isConfigured() {
  return isFigmaConfigured()
}
