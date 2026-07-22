// Pure helpers around the per-file patches returned by GitHub's
// "list pull request files" API. A PR review comment can only anchor to a line
// that appears on the RIGHT side of the diff (added or context lines); GitHub
// rejects the whole review otherwise, so findings are validated here first.

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/

// Returns Map<path, Set<rightSideLineNumber>> of commentable lines.
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

      // '' covers blank context lines some diffs emit without the leading space.
      if (raw.startsWith('+') || raw.startsWith(' ') || raw === '') {
        lines.add(rightLine)
        rightLine++
      }
      // '-' lines exist only on the LEFT side; '\ No newline at end of file'
      // markers advance neither side.
    }

    if (lines.size > 0) result.set(file.filename, lines)
  }

  return result
}

// Splits findings into those that anchor to a commentable line and those that
// must be folded into the review body instead. Never mutates the input.
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

// Selects files until the changed-line budget is exhausted so huge PRs still
// get a partial review instead of a failure. Files without a patch (binary or
// too large for the API) are always reported as omitted — except files the
// caller has verified to be empty (`emptyFilenames`): there is nothing inside
// to review, so they must not demote the review to partial; they go in a
// separate bucket so the agent can still judge whether their existence makes
// sense. GitHub reports empty and binary files identically (no patch, 0
// changed lines), so the verification has to come from outside — the caller
// checks the checkout on disk.
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
