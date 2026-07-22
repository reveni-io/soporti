// Downloads image attachments referenced by a list item so they can be passed
// to the vision-capable agent. Confirmed against the live List: an attachment
// cell carries Slack file IDs (e.g. { attachment: ["F0…"] }), NOT URLs — so we
// resolve each id with files.info to get its url_private + mimetype, then
// download with the bot token. We ingest only image/* content under maxBytes;
// anything else is skipped (the prompt tells the agent to ask for the text when
// a screenshot is missing).

const FILE_ID_RE = /^F[A-Z0-9]{6,}$/

// Collects Slack file IDs from an item's attachment cells. An attachment cell
// exposes an `attachment` array of file ids (strings) or {id} objects.
export function extractFileIds(item) {
  const ids = new Set()
  for (const cell of item?.fields ?? []) {
    for (const ref of cell?.attachment ?? []) {
      if (typeof ref === 'string' && FILE_ID_RE.test(ref)) ids.add(ref)
      else if (ref?.id) ids.add(ref.id)
    }
  }
  return [...ids]
}

export async function downloadImageAsDataUri(url, { botToken, maxBytes, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${botToken}` } })
  if (!res.ok) throw new Error(`download failed (${res.status})`)
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim()
  if (!contentType.startsWith('image/')) throw new Error(`not an image (${contentType || 'unknown'})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > maxBytes) throw new Error(`image too large (${buf.length} > ${maxBytes} bytes)`)
  return `data:${contentType};base64,${buf.toString('base64')}`
}

// Returns data URIs for the item's image attachments. Each file id is resolved
// via files.info (for its url_private + mimetype) and downloaded with the bot
// token. Non-images, oversized files, and any failure are skipped silently — a
// missing screenshot degrades to a text-only diagnosis, never an error.
export async function collectTicketImages(item, { client, botToken, maxBytes, fetchImpl = fetch } = {}) {
  if (!client || !botToken) return []
  const images = []
  for (const fileId of extractFileIds(item)) {
    try {
      const info = await client.apiCall('files.info', { file: fileId })
      const file = info?.file
      const mimetype = file?.mimetype || ''
      if (!file?.url_private || !mimetype.startsWith('image/')) continue
      if (file?.size && file.size > maxBytes) continue
      images.push(await downloadImageAsDataUri(file.url_private, { botToken, maxBytes, fetchImpl }))
    } catch {
      // skip unreadable/oversized attachments
    }
  }
  return images
}
