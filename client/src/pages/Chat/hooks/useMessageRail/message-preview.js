const MARKDOWN_NOISE_RE = /[#*_`>~[\]()|]/g
const WHITESPACE_RE = /\s+/g
const PREVIEW_MAX_CHARS = 120
const USER_LABEL = 'Question'
const ASSISTANT_LABEL = 'Answer'

export function messagePreview(message) {
  const raw = message.role === 'user' ? message.content : assistantText(message.parts)
  const text = String(raw ?? '')
    .replace(MARKDOWN_NOISE_RE, ' ')
    .replace(WHITESPACE_RE, ' ')
    .trim()

  if (text.length <= PREVIEW_MAX_CHARS) return text

  return `${text.slice(0, PREVIEW_MAX_CHARS).trimEnd()}…`
}

export function messageLabel(message, index) {
  const role = message.role === 'user' ? USER_LABEL : ASSISTANT_LABEL
  const preview = messagePreview(message)

  if (!preview) return `${role} ${index + 1}`

  return `${role} ${index + 1}: ${preview}`
}

function assistantText(parts) {
  if (!parts) return ''

  return parts
    .filter(part => part.type === 'text')
    .map(part => part.content)
    .join(' ')
}
