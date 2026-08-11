export async function parsePdf(buffer) {
  const { getDocumentProxy, extractText } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

export async function parseDocx(buffer) {
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

export async function parseXlsx(buffer, maxChars = Infinity) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(buffer))
  const parts = []
  let length = 0

  function push(line) {
    parts.push(line)
    length += line.length + 1
  }

  wb.eachSheet(ws => {
    if (length > maxChars) return
    push(`# ${ws.name}`)
    ws.eachRow(row => {
      if (length > maxChars) return
      push((row.values || []).slice(1).map(formatCell).join('\t'))
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

export async function parsePptx(buffer, maxChars = Infinity) {
  const JSZip = (await import('jszip')).default
  const { XMLParser } = await import('fast-xml-parser')
  const zip = await JSZip.loadAsync(buffer)
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: false })
  const slideNum = p => Number((p.match(/(\d+)\.xml$/) || [])[1] || 0)
  const slidePaths = Object.keys(zip.files)
    .filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNum(a) - slideNum(b))

  const out = []
  let length = 0
  for (const path of slidePaths) {
    if (length > maxChars) break

    const n = slideNum(path)
    const runs = []
    collectPptxText(parser.parse(await zip.file(path).async('string')), runs)
    const slideText = runs.join('\n')
    out.push(`# Slide ${n}`)
    if (slideText) out.push(slideText)
    length += slideText.length

    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`)
    if (notesFile) {
      const notesRuns = []
      collectPptxText(parser.parse(await notesFile.async('string')), notesRuns)
      const notesText = notesRuns.join('\n')
      if (notesText) {
        out.push('## Notes')
        out.push(notesText)
        length += notesText.length
      }
    }
  }
  return out.join('\n')
}
