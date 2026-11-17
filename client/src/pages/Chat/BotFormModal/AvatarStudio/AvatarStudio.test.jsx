import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { palette } from 'blobatar'
import AvatarStudio from './AvatarStudio.jsx'

const STYLE = { shape: 'cloud', hue: 195, tone: 'deep', mood: 'happy' }

function group(name) {
  return within(screen.getByRole('group', { name }))
}

function dotColor(radio) {
  return radio.parentElement.querySelector('.avatar-studio__dot').style.backgroundColor
}

function rgb(hex) {
  const value = parseInt(hex.slice(1), 16)

  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
}

describe('AvatarStudio', () => {
  it('marks the picked shape, color, tone and mood', () => {
    render(<AvatarStudio seed="seed-1" avatarStyle={STYLE} onPick={vi.fn()} onShuffle={vi.fn()} />)

    expect(group('Shape').getAllByRole('radio')).toHaveLength(10)
    expect(group('Color').getAllByRole('radio')).toHaveLength(10)
    expect(group('Tone').getAllByRole('radio')).toHaveLength(6)
    expect(group('Mood').getAllByRole('radio')).toHaveLength(6)
    expect(group('Shape').getByRole('radio', { name: 'Cloud' })).toBeChecked()
    expect(group('Color').getByRole('radio', { name: 'Teal' })).toBeChecked()
    expect(group('Tone').getByRole('radio', { name: 'Deep' })).toBeChecked()
    expect(group('Mood').getByRole('radio', { name: 'Happy' })).toBeChecked()
  })

  it('hands each pick back as the trait and its value', async () => {
    const onPick = vi.fn()
    const user = userEvent.setup()
    render(<AvatarStudio seed="seed-1" avatarStyle={STYLE} onPick={onPick} onShuffle={vi.fn()} />)

    await user.click(group('Shape').getByRole('radio', { name: 'Triangle' }))
    await user.click(group('Color').getByRole('radio', { name: 'Pink' }))
    await user.click(group('Tone').getByRole('radio', { name: 'Ink' }))
    await user.click(group('Mood').getByRole('radio', { name: 'Wink' }))

    expect(onPick).toHaveBeenCalledTimes(4)
    expect(onPick.mock.calls).toEqual([
      ['shape', 'triangle'],
      ['hue', 345],
      ['tone', 'ink'],
      ['mood', 'wink'],
    ])
  })

  it('shuffles on demand', async () => {
    const onShuffle = vi.fn()
    const user = userEvent.setup()
    render(<AvatarStudio seed="seed-1" avatarStyle={STYLE} onPick={vi.fn()} onShuffle={onShuffle} />)

    await user.click(screen.getByRole('button', { name: 'Shuffle avatar' }))

    expect(onShuffle).toHaveBeenCalledTimes(1)
  })

  it('previews every color in a mid tone and every tone in the picked color', () => {
    render(<AvatarStudio seed="seed-1" avatarStyle={STYLE} onPick={vi.fn()} onShuffle={vi.fn()} />)

    expect(dotColor(group('Color').getByRole('radio', { name: 'Pink' }))).toBe(rgb(palette(345, true, 0.49).head))
    expect(dotColor(group('Tone').getByRole('radio', { name: 'Ink' }))).toBe(rgb(palette(195, true, 0.965).head))
  })

  it('previews the tones in the color the seed already has while the color is unpicked', () => {
    const { container } = render(<AvatarStudio seed="legacy-5" avatarStyle={{}} onPick={vi.fn()} onShuffle={vi.fn()} />)

    const bodyColor = rgb(container.querySelector('.avatar-studio__stage svg').style.getPropertyValue('--mo-head'))
    const toneColors = group('Tone').getAllByRole('radio').map(dotColor)
    expect(toneColors).toContain(bodyColor)
    expect(dotColor(group('Color').getByRole('radio', { name: 'Red' }))).toBe(rgb(palette(25, true, 0.49).head))
    expect(
      group('Shape')
        .getAllByRole('radio')
        .some(radio => radio.checked)
    ).toBe(false)
  })

  it('previews each shape and mood on the bot face, and thinks while the bot is being created', () => {
    const { container } = render(
      <AvatarStudio
        seed="seed-1"
        avatarStyle={{ ...STYLE, mood: 'neutral' }}
        isThinking
        onPick={vi.fn()}
        onShuffle={vi.fn()}
      />
    )

    const sun = group('Shape').getByRole('radio', { name: 'Sun' }).parentElement.querySelector('svg')
    expect(sun.querySelectorAll('circle').length).toBeGreaterThanOrEqual(6)
    expect(container.querySelector('.avatar-studio__stage svg > g')).toHaveClass('mo-expr')
  })
})
