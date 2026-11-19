import { describe, it, expect } from 'vitest'
import { botAvatarTransitionName, botNameTransitionName } from './bot-transition-names.js'

describe('bot transition names', () => {
  it('names the avatar and the name of each bot apart, so only the opened bot travels', () => {
    expect(botAvatarTransitionName(7)).toBe('bot-avatar-7')
    expect(botNameTransitionName(7)).toBe('bot-name-7')
    expect(botAvatarTransitionName(8)).not.toBe(botAvatarTransitionName(7))
  })
})
