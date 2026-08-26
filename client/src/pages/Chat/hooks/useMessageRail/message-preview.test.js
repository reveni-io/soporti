import { describe, it, expect } from 'vitest'
import { messageLabel, messagePreview } from './message-preview.js'

describe('messagePreview', () => {
  it('returns the content of a user message', () => {
    expect(messagePreview({ role: 'user', content: 'How do refunds work?' })).toBe('How do refunds work?')
  })

  it('joins the text parts of an assistant message and ignores the rest', () => {
    const message = {
      role: 'assistant',
      parts: [
        { type: 'text', content: 'Refunds are issued' },
        { type: 'tool', content: 'search_docs' },
        { type: 'text', content: 'within 14 days.' },
      ],
    }

    expect(messagePreview(message)).toBe('Refunds are issued within 14 days.')
  })

  it('strips markdown syntax and collapses whitespace', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '## Refunds\n\nSee the **[policy](https://docs.dev)** page.' }],
    }

    expect(messagePreview(message)).toBe('Refunds See the policy https://docs.dev page.')
  })

  it('truncates a long message with an ellipsis', () => {
    const preview = messagePreview({ role: 'user', content: 'a'.repeat(200) })

    expect(preview).toHaveLength(121)
    expect(preview.endsWith('…')).toBe(true)
  })

  it('returns an empty preview for an assistant message that has not streamed yet', () => {
    expect(messagePreview({ role: 'assistant', parts: [] })).toBe('')
  })

  it('returns an empty preview when the message has no content at all', () => {
    expect(messagePreview({ role: 'assistant' })).toBe('')
  })
})

describe('messageLabel', () => {
  it('labels a user message as a numbered question', () => {
    expect(messageLabel({ role: 'user', content: 'Why?' }, 0)).toBe('Question 1: Why?')
  })

  it('labels an assistant message as a numbered answer', () => {
    const message = { role: 'assistant', parts: [{ type: 'text', content: 'Because.' }] }

    expect(messageLabel(message, 3)).toBe('Answer 4: Because.')
  })

  it('falls back to the bare role and position when there is no preview yet', () => {
    expect(messageLabel({ role: 'assistant', parts: [] }, 1)).toBe('Answer 2')
  })
})
