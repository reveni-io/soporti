const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export function commentableLines(files) {
  const result = new Map()

  for (const file of files ?? []) {
    if (!file?.filename || typeof file.patch !== 'string') continue

    const lines = new Set()
    let rightLine = null

    for (const raw of file.patch.split('\n')) {
      const hunk = raw.match(HUNK_HEADER)
      if (hunk) {
        rightLine = parseInt(hunk[1], 10)
        continue
      }
      if (rightLine === null) continue

      if (raw.startsWith('+') || raw.startsWith(' ') || raw === '') {
        lines.add(rightLine)
        rightLine++
      }
    }

    if (lines.size > 0) result.set(file.filename, lines)
  }

  return result
}

export function partitionFindings(findings, files) {
  const valid = commentableLines(files)
  const anchored = []
  const unanchored = []

  for (const finding of findings ?? []) {
    const line = Number.isInteger(finding?.line) ? finding.line : null
    if (finding?.path && line !== null && valid.get(finding.path)?.has(line)) {
      anchored.push(finding)
    } else if (finding) {
      unanchored.push(finding)
    }
  }

  return { anchored, unanchored }
}

export function selectFilesWithinBudget(files, maxChangedLines, { emptyFilenames = new Set() } = {}) {
  const included = []
  const omitted = []
  const empty = []
  let usedLines = 0

  for (const file of files ?? []) {
    if (!file?.filename) continue
    const cost = (file.additions ?? 0) + (file.deletions ?? 0)

    if (typeof file.patch !== 'string') {
      if (cost === 0 && emptyFilenames.has(file.filename)) {
        empty.push({ filename: file.filename, status: file.status ?? 'modified' })
      } else {
        omitted.push({ filename: file.filename, reason: 'no-patch' })
      }
    } else if (usedLines + cost > maxChangedLines && included.length > 0) {
      omitted.push({ filename: file.filename, reason: 'budget' })
    } else {
      included.push(file)
      usedLines += cost
    }
  }

  return { included, omitted, empty, usedLines }
}
