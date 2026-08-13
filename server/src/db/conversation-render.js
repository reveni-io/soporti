export function toRenderMessage({ role, parts }, { includeAttachments = true } = {}) {
  const allParts = parts || []
  if (role !== 'user') return { role, parts: allParts }

  const content = allParts
    .filter(part => part.type === 'text')
    .map(part => part.content)
    .join('')
  const skills = allParts.filter(part => part.type === 'skill').map(part => ({ id: part.skillId, name: part.name }))
  const attachments = includeAttachments
    ? allParts
        .filter(part => part.type === 'attachment')
        .map(part => ({ name: part.name, truncated: Boolean(part.truncated), imageId: part.imageId ?? null }))
    : []

  const message = { role, content }
  if (skills.length > 0) message.skills = skills
  if (attachments.length > 0) message.attachments = attachments

  return message
}
