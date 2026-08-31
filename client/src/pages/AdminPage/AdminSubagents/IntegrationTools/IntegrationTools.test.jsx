import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IntegrationTools from './IntegrationTools.jsx'

describe('IntegrationTools', () => {
  it('shows the integration logo with how many tools it holds', () => {
    const group = { id: 'sentry', label: 'Sentry', tools: [] }
    const { container } = render(
      <IntegrationTools group={group} toolNames={['get_sentry_issue', 'search_sentry_issues']} />
    )

    expect(container.querySelector('[data-icon="sentry"]')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('keeps the tool list out of the way until the logo is hovered', async () => {
    const group = { id: 'repo', label: 'Repositories', tools: [] }
    render(<IntegrationTools group={group} toolNames={['search_code']} />)

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await userEvent.hover(screen.getByRole('button'))

    const panel = screen.getByRole('tooltip')
    expect(panel).toHaveTextContent('Repositories')
    expect(panel).toHaveTextContent('Searching code')
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', panel.id)
  })

  it('hides the tool list again when the pointer leaves', async () => {
    const group = { id: 'repo', label: 'Repositories', tools: [] }
    render(<IntegrationTools group={group} toolNames={['search_code']} />)

    await userEvent.hover(screen.getByRole('button'))
    await userEvent.unhover(screen.getByRole('button'))

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the tool list on keyboard focus too', async () => {
    const group = { id: 'notion', label: 'Notion', tools: [] }
    render(<IntegrationTools group={group} toolNames={['search_notion_pages']} />)

    await userEvent.tab()

    expect(screen.getByRole('tooltip')).toHaveTextContent('Searching Notion')
  })

  it('anchors the panel inside the viewport', async () => {
    const group = { id: 'repo', label: 'Repositories', tools: [] }
    render(<IntegrationTools group={group} toolNames={['search_code']} />)

    await userEvent.hover(screen.getByRole('button'))

    const { left } = screen.getByRole('tooltip').style
    expect(Number.parseInt(left, 10)).toBeGreaterThanOrEqual(0)
    expect(Number.parseInt(left, 10)).toBeLessThanOrEqual(window.innerWidth - 240)
  })

  it('uses the github logo for the repositories group', () => {
    const group = { id: 'repo', label: 'Repositories', tools: [] }
    const { container } = render(<IntegrationTools group={group} toolNames={['search_code']} />)

    expect(container.querySelector('[data-icon="github"]')).toBeInTheDocument()
  })
})
