export function markdownToSlack(md) {
  if (!md) return ''

  let text = md

  text = text.replace(/```mermaid[\s\S]*?```/g, '_[diagram omitted]_')

  text = text.replace(/```\w*\n([\s\S]*?)```/g, '```$1```')

  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*')

  text = text.replace(/~~(.+?)~~/g, '~$1~')

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')

  text = text.replace(/^#{1,6}\s+(.+)$/gm, '*$1*')

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<$2|$1>')

  return text.trim()
}

export function splitMessage(text, maxLength = 3000) {
  if (text.length <= maxLength) return [text]

  const chunks = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }

    let splitIndex = remaining.lastIndexOf('\n\n', maxLength)

    if (splitIndex === -1 || splitIndex < maxLength * 0.3) {
      splitIndex = remaining.lastIndexOf('\n', maxLength)
    }

    if (splitIndex === -1 || splitIndex < maxLength * 0.3) {
      splitIndex = remaining.lastIndexOf(' ', maxLength)
    }

    if (splitIndex === -1 || splitIndex < maxLength * 0.3) {
      splitIndex = maxLength
    }

    chunks.push(remaining.slice(0, splitIndex))
    remaining = remaining.slice(splitIndex).trimStart()
  }

  return chunks
}
