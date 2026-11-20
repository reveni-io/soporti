import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IntegrationsOrbit from './IntegrationsOrbit.jsx'
import { INTEGRATIONS } from '../IntegrationsSection/integrations.js'

const DEFAULT_CAPTION = 'Hover a logo to see what Soporti does with it.'

describe('IntegrationsOrbit', () => {
  it('puts every integration on one of the two rings and counts them in the core', () => {
    const { container } = render(<IntegrationsOrbit />)

    INTEGRATIONS.forEach(integration => {
      expect(screen.getByRole('button', { name: integration.name })).toBeInTheDocument()
    })
    expect(container.querySelectorAll('.lp-orbit__ring--inner .lp-orbit__logo')).toHaveLength(
      INTEGRATIONS.filter(integration => integration.ring === 'inner').length
    )
    expect(screen.getByText(String(INTEGRATIONS.length))).toBeInTheDocument()
    expect(screen.getByText(DEFAULT_CAPTION)).toBeInTheDocument()
  })

  it('explains an integration while the pointer is on its logo and goes back when it leaves the orbit', async () => {
    const user = userEvent.setup()
    const { container } = render(<IntegrationsOrbit />)

    await user.hover(screen.getByRole('button', { name: 'GitHub' }))

    expect(screen.getByText('Reads files, searches code and runs git log and blame.')).toBeInTheDocument()
    expect(container.querySelector('.lp-orbit__name')).toHaveTextContent('GitHub')
    expect(screen.getByRole('button', { name: 'GitHub' })).toHaveClass('lp-orbit__logo--active')

    await user.unhover(container.querySelector('.lp-orbit__stage'))

    expect(screen.getByText(DEFAULT_CAPTION)).toBeInTheDocument()
  })

  it('explains the integration that has keyboard focus and clears it when focus moves away', async () => {
    const user = userEvent.setup()
    render(<IntegrationsOrbit />)

    await user.tab()
    expect(screen.getByRole('button', { name: 'GitHub' })).toHaveFocus()
    expect(screen.getByText('Reads files, searches code and runs git log and blame.')).toBeInTheDocument()

    await user.tab()
    expect(screen.getByText('Writes and runs read-only SQL on every database you connect.')).toBeInTheDocument()

    screen.getByRole('button', { name: 'PostgreSQL' }).blur()
    expect(await screen.findByText(DEFAULT_CAPTION)).toBeInTheDocument()
  })

  it('draws a stroke icon for the integrations that have no brand mark', async () => {
    const user = userEvent.setup()
    const { container } = render(<IntegrationsOrbit />)

    expect(screen.getByRole('button', { name: 'Help Center' }).querySelector('[data-icon="help-center"]')).toBeTruthy()

    await user.hover(screen.getByRole('button', { name: 'Granola' }))

    expect(container.querySelector('.lp-orbit__active [data-icon="meeting-notes"]')).toBeInTheDocument()
  })
})
