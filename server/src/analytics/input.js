const MAX_PROMPT_LENGTH = 2000

export function parseText(value, { noun, maxLength }) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return { error: `Write a ${noun}.` }
  if (text.length > maxLength) return { error: `The ${noun} is too long (max ${maxLength} characters).` }

  return { value: text }
}

export function parsePrompt(value, noun) {
  return parseText(value, { noun, maxLength: MAX_PROMPT_LENGTH })
}
