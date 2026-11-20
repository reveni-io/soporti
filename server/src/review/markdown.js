const WHITESPACE_RUN = /\s+/g
const LINE_BREAK = /\r?\n/g
const TABLE_SPECIAL_CHARACTER = /[\\|]/g

export function renderDetails(summary, content, { open = false, quoted = false } = {}) {
  const tag = open ? '<details open>' : '<details>'
  if (quoted) return `${tag}\n<summary>${summary}</summary><blockquote>\n\n${content}\n\n</blockquote></details>`

  return `${tag}\n<summary>${summary}</summary>\n\n${content}\n\n</details>`
}

export function singleLine(text) {
  return String(text ?? '')
    .replace(WHITESPACE_RUN, ' ')
    .trim()
}

export function tableCell(text) {
  return String(text ?? '')
    .trim()
    .replace(TABLE_SPECIAL_CHARACTER, '\\$&')
    .replace(LINE_BREAK, '<br>')
}
