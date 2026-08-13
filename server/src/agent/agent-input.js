export function buildAgentInput(promptText, images = []) {
  if (!Array.isArray(images) || images.length === 0) return promptText
  return [
    {
      role: 'user',
      content: [{ type: 'input_text', text: promptText }, ...images.map(image => ({ type: 'input_image', image }))],
    },
  ]
}
