import { describe, it, expect } from 'vitest'
import { buildStoryboardPrompt, buildStoryboardTurnLimitMessage } from './storyboard-prompt.js'

const IMAGE_ID = '11111111-1111-4111-8111-111111111111'
const GONE_ID = '22222222-2222-4222-8222-222222222222'

function video(overrides = {}) {
  return {
    brief: {
      idea: 'Refunds in one click',
      repos: ['reveni/dashboard', 'reveni/api'],
      path: null,
      audience: 'merchants',
      language: 'es',
      format: '9:16',
      durationSeconds: 30,
      pace: 'relaxed',
      attachments: [],
    },
    storyboard: null,
    messages: [],
    ...overrides,
  }
}

describe('buildStoryboardPrompt', () => {
  it('describes the brief and asks for a first draft', () => {
    const prompt = buildStoryboardPrompt(video(), new Set())

    expect(prompt).toContain('- Idea: Refunds in one click')
    expect(prompt).toContain('- Repositories: reveni/dashboard, reveni/api')
    expect(prompt).toContain('- Folder: none, the whole repositories')
    expect(prompt).toContain('- Language: Spanish (es)')
    expect(prompt).toContain('- Format: 9:16 (1080×1920, vertical)')
    expect(prompt).toContain('- Duration: 30 seconds')
    expect(prompt).toContain('- Pace: relaxed:')
    expect(prompt).toContain('## Current storyboard\n\nNone yet.')
    expect(prompt).not.toContain('## Conversation')
    expect(prompt).toMatch(/## Your task\n\nDraft the storyboard for this brief\.$/)
  })

  it('inlines the documents and lists the images with their availability', () => {
    const attachments = [
      { name: 'spec.pdf', text: 'Refund flow spec' },
      { name: 'screen.png', imageId: IMAGE_ID },
      { name: 'old.png', imageId: GONE_ID },
    ]

    const prompt = buildStoryboardPrompt(video({ brief: { ...video().brief, attachments } }), new Set([IMAGE_ID]))

    expect(prompt).toContain('### spec.pdf\n\nRefund flow spec')
    expect(prompt).toContain('- screen.png (attached below)')
    expect(prompt).toContain('- old.png (no longer available)')
  })

  it('includes the current storyboard and the conversation, and asks to revise on a new message', () => {
    const storyboard = { title: 'Reembolsos', scenes: [] }
    const messages = [
      { role: 'assistant', content: 'Aquí está.' },
      { role: 'user', content: 'Más corto el inicio' },
    ]

    const prompt = buildStoryboardPrompt(video({ storyboard, messages }), new Set())

    expect(prompt).toContain('"title": "Reembolsos"')
    expect(prompt).toContain('**You:** Aquí está.\n\n**User:** Más corto el inicio')
    expect(prompt).toContain("Revise the current storyboard to answer the user's last message.")
  })

  it('asks for a draft that takes the messages into account when there is no storyboard yet', () => {
    const prompt = buildStoryboardPrompt(
      video({ messages: [{ role: 'user', content: 'Focus on Shopify' }] }),
      new Set()
    )

    expect(prompt).toContain("Draft the storyboard for this brief, taking the user's messages into account.")
  })

  it('asks to draft again when the last message is the assistant reply', () => {
    const prompt = buildStoryboardPrompt(
      video({ storyboard: { title: 'Reembolsos' }, messages: [{ role: 'assistant', content: 'Listo.' }] }),
      new Set()
    )

    expect(prompt).toContain('Draft the storyboard again from the brief and the conversation.')
  })
})

describe('buildStoryboardTurnLimitMessage', () => {
  it('names the turn limit', () => {
    expect(buildStoryboardTurnLimitMessage(80)).toContain('all 80 turns')
  })
})
