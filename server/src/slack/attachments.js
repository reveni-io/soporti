const FILE_ID_RE = /^F[A-Z0-9]{6,}$/

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
    }
  }
  return images
}
