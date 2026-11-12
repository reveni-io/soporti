import { describe, it, expect } from 'vitest'
import { conversationTitle } from './conversation-title.js'

describe('conversationTitle', () => {
  it('names an empty conversation a new chat', () => {
    expect(conversationTitle([])).toBe('New chat')
  })

  it('uses the first question the user asked', () => {
    const messages = [
      { role: 'user', content: '  Why did the payout fail?  ' },
      { role: 'assistant', content: 'Because the IBAN was rejected.' },
      { role: 'user', content: 'Which IBAN?' },
    ]

    expect(conversationTitle(messages)).toBe('Why did the payout fail?')
  })

  it('falls back when the first question has no text', () => {
    expect(conversationTitle([{ role: 'user', content: '   ' }])).toBe('Untitled conversation')
  })

  it('falls back when no message comes from the user', () => {
    expect(conversationTitle([{ role: 'assistant', content: 'Hello' }])).toBe('Untitled conversation')
  })
})
