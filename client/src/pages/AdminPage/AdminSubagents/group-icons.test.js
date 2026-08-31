import { describe, it, expect } from 'vitest'
import { groupIconId } from './group-icons.js'

describe('groupIconId', () => {
  it('maps the repositories group to the github logo', () => {
    expect(groupIconId('repo')).toBe('github')
  })

  it('uses the group id itself for an integration', () => {
    expect(groupIconId('sentry')).toBe('sentry')
  })
})
