import { describe, it, expect } from 'vitest'
import { pageKey } from './page-key.js'

describe('pageKey', () => {
  it('keeps the chat, the bots list and a bot on the same page, so the sidebar stays put', () => {
    expect(pageKey('/chat')).toBe('chat')
    expect(pageKey('/bots')).toBe('chat')
    expect(pageKey('/bots/7')).toBe('chat')
  })

  it('keeps every analytics dashboard on the same page', () => {
    expect(pageKey('/analytics')).toBe('analytics')
    expect(pageKey('/analytics/0b9c7f5e-6a1d-4c2b-9e8f-3a4b5c6d7e8f')).toBe('analytics')
  })

  it('keeps every admin section on the same page', () => {
    expect(pageKey('/admin')).toBe('admin')
    expect(pageKey('/admin/llm')).toBe('admin')
  })

  it('gives every other screen its own page', () => {
    expect(pageKey('/videos')).toBe('/videos')
    expect(pageKey('/videos/0b9c7f5e-6a1d-4c2b-9e8f-3a4b5c6d7e8f')).toBe('/videos/0b9c7f5e-6a1d-4c2b-9e8f-3a4b5c6d7e8f')
    expect(pageKey('/')).toBe('/')
  })
})
