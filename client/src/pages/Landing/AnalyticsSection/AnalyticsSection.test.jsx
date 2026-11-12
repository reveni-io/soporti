import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import AnalyticsSection from './AnalyticsSection.jsx'

describe('AnalyticsSection', () => {
  it('explains that a described chart lands on a dashboard to keep or share', () => {
    render(<AnalyticsSection />)

    expect(
      screen.getByRole('heading', { name: 'Ask for a chart. Get a live dashboard you arrange by hand.' })
    ).toBeInTheDocument()
    expect(screen.getByText(/lands as a card on a dashboard you can keep to yourself or share/i)).toBeInTheDocument()
    expect(screen.getByText('/admin')).toBeInTheDocument()
  })

  it('lists the agent, the background generation, the grid, the live data, the visible sql, sharing and the safety model', () => {
    const { container } = render(<AnalyticsSection />)

    expect(container.querySelectorAll('.lp-points li')).toHaveLength(7)
    expect(screen.getByText(/explores the schema, writes the SQL, runs it to check it/i)).toBeInTheDocument()
    expect(screen.getByText(/keep asking for more charts meanwhile/i)).toBeInTheDocument()
    expect(screen.getByText(/drag a card by its header, resize it from the corner/i)).toBeInTheDocument()
    expect(screen.getByText(/results are cached for five minutes .* nothing is saved but the SQL/i)).toBeInTheDocument()
    expect(screen.getByText(/the agent rewrites the query/i)).toBeInTheDocument()
    expect(screen.getByText(/read-only transactions, SELECT and WITH only/i)).toBeInTheDocument()
    expect(screen.getByText(/private until you share it with the team/i)).toBeInTheDocument()
  })

  it('shows the prompt turning into a card the agent is still working on', () => {
    render(<AnalyticsSection />)

    const cards = within(screen.getByRole('list', { name: 'Dashboard cards' })).getAllByRole('listitem')
    const generating = cards[1]

    expect(screen.getByText('Create chart')).toBeInTheDocument()
    expect(screen.getAllByText('Returns per week, by status')).toHaveLength(2)
    expect(within(generating).getByText('Returns per week, by status')).toBeInTheDocument()
    expect(within(generating).getByRole('img', { name: 'Chart being generated' })).toBeInTheDocument()
    expect(within(generating).getByText('Reading the columns of returns…')).toBeInTheDocument()
  })

  it('lays out a dashboard of four cards, each drawn its own way', () => {
    const { container } = render(<AnalyticsSection />)

    const cards = within(screen.getByRole('list', { name: 'Dashboard cards' })).getAllByRole('listitem')
    const columns = screen.getByRole('img', { name: 'Column chart of orders per week' })

    expect(cards).toHaveLength(4)
    expect(columns.querySelectorAll('.lp-analytics__column')).toHaveLength(8)
    expect(screen.getByRole('img', { name: 'Line chart of days to refund in the EU and the UK' })).toBeInTheDocument()
    expect(within(cards[3]).getByText('EU')).toBeInTheDocument()
    expect(within(cards[3]).getByText('UK')).toBeInTheDocument()
    expect(within(cards[2]).getByText('1,284')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-icon="grip"]')).toHaveLength(4)
  })

  it('keeps the sql of a card in sight', () => {
    render(<AnalyticsSection />)

    const cards = within(screen.getByRole('list', { name: 'Dashboard cards' })).getAllByRole('listitem')

    expect(within(cards[0]).getByText(/^SELECT date_trunc\('week', created_at\) AS week/)).toBeInTheDocument()
  })

  it('lifts a single card off its drop slot to show the grid is rearrangeable', () => {
    const { container } = render(<AnalyticsSection />)

    const dragging = container.querySelectorAll('.lp-analytics__slot--dragging')

    expect(dragging).toHaveLength(1)
    expect(dragging[0]).toHaveTextContent('Returns this month')
  })
})
