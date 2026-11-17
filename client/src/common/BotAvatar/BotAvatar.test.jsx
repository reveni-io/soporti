import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import BotAvatar from './BotAvatar.jsx'

describe('BotAvatar', () => {
  it('renders a decorative avatar with the default size', () => {
    const { container } = render(<BotAvatar seed="seed-1" />)

    const avatar = container.querySelector('img')
    expect(avatar).toHaveAttribute('width', '32')
    expect(avatar).toHaveAttribute('height', '32')
    expect(avatar).toHaveAttribute('alt', '')
    expect(avatar).toHaveClass('bot-avatar')
  })

  it('applies the size and class name it is given', () => {
    const { container } = render(<BotAvatar seed="seed-1" size={64} className="bots-panel__avatar" />)

    const avatar = container.querySelector('img')
    expect(avatar).toHaveAttribute('width', '64')
    expect(avatar).toHaveClass('bot-avatar', 'bots-panel__avatar')
  })

  it('renders the same picture for the same seed and a different one for another seed', () => {
    const { container: first } = render(<BotAvatar seed="seed-1" />)
    const { container: same } = render(<BotAvatar seed="seed-1" />)
    const { container: other } = render(<BotAvatar seed="seed-2" />)

    const source = first.querySelector('img').getAttribute('src')
    expect(source).toMatch(/^data:image\/svg\+xml/)
    expect(same.querySelector('img').getAttribute('src')).toBe(source)
    expect(other.querySelector('img').getAttribute('src')).not.toBe(source)
  })
})
