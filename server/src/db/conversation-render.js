export function toRenderMessage({ role, parts }) {
  const allParts = parts || []
  if (role !== 'user') return { role, parts: allParts }

  const content = allParts
    .filter(part => part.type === 'text')
    .map(part => part.content)
    .join('')
  const skills = allParts.filter(part => part.type === 'skill').map(part => ({ id: part.skillId, name: part.name }))
  return skills.length > 0 ? { role, content, skills } : { role, content }
}
