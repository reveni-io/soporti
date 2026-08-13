import { describe, it, expect } from 'vitest'
import { buildAgentInput } from './agent-input.js'

describe('buildAgentInput', () => {
  it('returns the plain prompt string when there are no images', () => {
    expect(buildAgentInput('hello', [])).toBe('hello')
    expect(buildAgentInput('hello')).toBe('hello')
  })

  it('returns the plain prompt string when images is not an array', () => {
    expect(buildAgentInput('hello', null)).toBe('hello')
  })

  it('returns a multimodal user message when images are present', () => {
    const input = buildAgentInput('hello', ['data:image/png;base64,AQID'])

    expect(input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'hello' },
          { type: 'input_image', image: 'data:image/png;base64,AQID' },
        ],
      },
    ])
  })

  it('keeps one content part per image, in order', () => {
    const [message] = buildAgentInput('two shots', ['data:image/png;base64,AAA', 'data:image/jpeg;base64,BBB'])

    expect(message.content).toHaveLength(3)
    expect(message.content[1].image).toBe('data:image/png;base64,AAA')
    expect(message.content[2].image).toBe('data:image/jpeg;base64,BBB')
  })
})
