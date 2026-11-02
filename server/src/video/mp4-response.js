const RANGE_RE = /^bytes=(\d*)-(\d*)$/
const MP4_TYPE = 'video/mp4'

function suffixRange(length, size) {
  if (length === 0) return { unsatisfiable: true }

  return { start: Math.max(0, size - length), end: size - 1 }
}

function parseByteRange(header, size) {
  const match = RANGE_RE.exec(header ?? '')
  if (!match) return null

  const [, from, to] = match
  if (!from && !to) return null
  if (!from) return suffixRange(Number(to), size)

  const start = Number(from)
  const end = to ? Math.min(Number(to), size - 1) : size - 1
  if (start >= size || start > end) return { unsatisfiable: true }

  return { start, end }
}

export function sendMp4(req, res, data) {
  const range = parseByteRange(req.headers.range, data.length)
  res.set({ 'Content-Type': MP4_TYPE, 'Accept-Ranges': 'bytes' })

  if (!range) return res.set('Content-Length', String(data.length)).send(data)
  if (range.unsatisfiable) return res.status(416).set('Content-Range', `bytes */${data.length}`).end()

  const chunk = data.subarray(range.start, range.end + 1)
  return res
    .status(206)
    .set({
      'Content-Range': `bytes ${range.start}-${range.end}/${data.length}`,
      'Content-Length': String(chunk.length),
    })
    .send(chunk)
}
