import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScreenFrame from './ScreenFrame.jsx'

describe('ScreenFrame', () => {
  it.each([
    ['16:9', 'screen-frame--wide'],
    ['1:1', 'screen-frame--square'],
    ['9:16', 'screen-frame--tall'],
  ])('shapes the screen after the %s format', (format, modifier) => {
    render(
      <ScreenFrame format={format}>
        <p>Playing</p>
      </ScreenFrame>
    )

    expect(screen.getByText('Playing').parentElement).toHaveClass('screen-frame', modifier)
  })
})
