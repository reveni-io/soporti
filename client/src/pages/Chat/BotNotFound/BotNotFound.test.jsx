import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BotNotFound from './BotNotFound.jsx'

describe('BotNotFound', () => {
  it('shows a loading line while the bots load', () => {
    render(<BotNotFound loading />, { wrapper: MemoryRouter })

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Bot not found.')).not.toBeInTheDocument()
  })

  it('says the bot was not found and links back to the bots', () => {
    render(<BotNotFound loading={false} />, { wrapper: MemoryRouter })

    expect(screen.getByRole('heading', { name: 'Bot not found.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to bots' })).toHaveAttribute('href', '/bots')
  })
})
