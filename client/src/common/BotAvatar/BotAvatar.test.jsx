import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { palette } from 'blobatar'
import BotAvatar from './BotAvatar.jsx'

function bodyColor(container) {
  return container.querySelector('svg').style.getPropertyValue('--mo-head')
}

function figure(container) {
  return container.querySelector('svg > g')
}

describe('BotAvatar', () => {
  it('renders a decorative animated avatar with the default size', () => {
    const { container } = render(<BotAvatar seed="seed-1" />)

    const avatar = container.querySelector('svg')
    expect(avatar).toHaveAttribute('width', '32')
    expect(avatar).toHaveAttribute('height', '32')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar).toHaveClass('bot-avatar')
    expect(figure(container)).toHaveClass('mo-root', 'mo-always')
  })

  it('applies the size and class name it is given', () => {
    const { container } = render(<BotAvatar seed="seed-1" size={64} className="bots-panel__avatar" />)

    const avatar = container.querySelector('svg')
    expect(avatar).toHaveAttribute('width', '64')
    expect(avatar).toHaveClass('bot-avatar', 'bots-panel__avatar')
  })

  it('only moves on hover when asked to', () => {
    const { container } = render(<BotAvatar seed="seed-1" animate="hover" />)

    expect(figure(container)).toHaveClass('mo-root')
    expect(figure(container)).not.toHaveClass('mo-always')
  })

  it('renders the same face for the same seed and a different one for another seed', () => {
    const { container: first } = render(<BotAvatar seed="seed-1" />)
    const { container: same } = render(<BotAvatar seed="seed-1" />)
    const { container: other } = render(<BotAvatar seed="seed-2" />)

    const markup = first.innerHTML
    expect(same.innerHTML).toBe(markup)
    expect(other.innerHTML).not.toBe(markup)
  })

  it('paints the body in the picked color and tone, whatever the seed', () => {
    const avatarStyle = { hue: 195, tone: 'deep' }

    const { container: first } = render(<BotAvatar seed="seed-1" avatarStyle={avatarStyle} />)
    const { container: other } = render(<BotAvatar seed="seed-2" avatarStyle={avatarStyle} />)
    const { container: ink } = render(<BotAvatar seed="seed-1" avatarStyle={{ hue: 195, tone: 'ink' }} />)

    expect(bodyColor(first)).toBe(palette(195, true, 0.71).head)
    expect(bodyColor(other)).toBe(bodyColor(first))
    expect(bodyColor(ink)).toBe(palette(195, true, 0.965).head)
  })

  it('draws the picked shape, whatever the seed', () => {
    const { container: sun } = render(<BotAvatar seed="seed-1" avatarStyle={{ shape: 'sun' }} />)
    const { container: otherSun } = render(<BotAvatar seed="seed-2" avatarStyle={{ shape: 'sun' }} />)
    const { container: round } = render(<BotAvatar seed="seed-1" avatarStyle={{ shape: 'round' }} />)

    expect(sun.querySelectorAll('circle').length).toBeGreaterThanOrEqual(6)
    expect(otherSun.querySelectorAll('circle').length).toBeGreaterThanOrEqual(6)
    expect(round.querySelectorAll('circle')).toHaveLength(0)
  })

  it('wears the picked mood, and a thinking face while it works', () => {
    const { container: neutral } = render(<BotAvatar seed="seed-1" avatarStyle={{ mood: 'neutral' }} />)
    const { container: happy } = render(<BotAvatar seed="seed-1" avatarStyle={{ mood: 'happy' }} />)
    const { container: busy } = render(<BotAvatar seed="seed-1" avatarStyle={{ mood: 'happy' }} isThinking />)

    expect(figure(neutral)).not.toHaveClass('mo-expr')
    expect(figure(happy)).toHaveClass('mo-expr')
    expect(figure(busy)).toHaveClass('mo-expr')
    expect(busy.innerHTML).not.toBe(happy.innerHTML)
  })

  it('keeps the eyes still unless it follows the pointer', () => {
    const { container: still } = render(<BotAvatar seed="seed-1" />)
    const { container: following } = render(<BotAvatar seed="seed-1" isFollowingPointer />)

    expect(still.querySelector('svg').style.getPropertyValue('--mo-track-travel')).toBe('')
    expect(following.querySelector('svg').style.getPropertyValue('--mo-track-travel')).toBe('3px')
  })
})
