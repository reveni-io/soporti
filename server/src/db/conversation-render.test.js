import { describe, it, expect } from 'vitest'
import { toRenderMessage } from './conversation-render.js'

describe('toRenderMessage', () => {
  it('keeps the assistant parts as they are', () => {
    const parts = [{ type: 'text', content: 'here it is' }]

    expect(toRenderMessage({ role: 'assistant', parts })).toEqual({ role: 'assistant', parts })
  })

  it('joins the user text parts into a single content string', () => {
    const message = toRenderMessage({
      role: 'user',
      parts: [
        { type: 'text', content: 'why does it ' },
        { type: 'text', content: '500?' },
      ],
    })

    expect(message).toEqual({ role: 'user', content: 'why does it 500?' })
  })

  it('exposes the invoked skills', () => {
    const message = toRenderMessage({
      role: 'user',
      parts: [
        { type: 'skill', skillId: 5, name: 'bug-triage' },
        { type: 'text', content: 'hi' },
      ],
    })

    expect(message).toEqual({ role: 'user', content: 'hi', skills: [{ id: 5, name: 'bug-triage' }] })
  })

  it('exposes the attachments with their truncation flag', () => {
    const message = toRenderMessage({
      role: 'user',
      parts: [
        { type: 'attachment', name: 'spec.pdf', truncated: true },
        { type: 'text', content: 'summarize it' },
      ],
    })

    expect(message).toEqual({
      role: 'user',
      content: 'summarize it',
      attachments: [{ name: 'spec.pdf', truncated: true, imageId: null }],
    })
  })

  it('exposes the image id of an attached image so the client can load it', () => {
    const message = toRenderMessage({
      role: 'user',
      parts: [
        { type: 'attachment', name: 'error.png', imageId: '22222222-2222-4222-8222-222222222222' },
        { type: 'text', content: 'what is this?' },
      ],
    })

    expect(message.attachments).toEqual([
      { name: 'error.png', truncated: false, imageId: '22222222-2222-4222-8222-222222222222' },
    ])
  })

  it('drops the image id when the caller asks for a shareable message', () => {
    const message = toRenderMessage(
      {
        role: 'user',
        parts: [
          { type: 'attachment', name: 'error.png', imageId: '22222222-2222-4222-8222-222222222222' },
          { type: 'text', content: 'what is this?' },
        ],
      },
      { includeAttachments: false }
    )

    expect(message).toEqual({ role: 'user', content: 'what is this?' })
  })

  it('drops the attachments when the caller asks for a shareable message', () => {
    const message = toRenderMessage(
      {
        role: 'user',
        parts: [
          { type: 'attachment', name: 'Q3-layoffs.xlsx', truncated: false },
          { type: 'text', content: 'summarize it' },
        ],
      },
      { includeAttachments: false }
    )

    expect(message).toEqual({ role: 'user', content: 'summarize it' })
  })

  it('omits the skills and attachments keys when there are none', () => {
    const message = toRenderMessage({ role: 'user', parts: [{ type: 'text', content: 'hi' }] })

    expect(message).not.toHaveProperty('skills')
    expect(message).not.toHaveProperty('attachments')
  })

  it('tolerates a message with no parts', () => {
    expect(toRenderMessage({ role: 'user', parts: null })).toEqual({ role: 'user', content: '' })
  })
})
