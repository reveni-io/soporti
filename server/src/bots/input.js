export function parseRequiredText(value, { label, maxLength }) {
  const trimmed = typeof value === 'string' ? value.trim() : ''

  if (trimmed.length === 0) return { error: `${label} is required.` }
  if (trimmed.length > maxLength) return { error: `${label} is too long (max ${maxLength} characters).` }

  return { value: trimmed }
}
