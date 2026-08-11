import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChannelTable from './ChannelTable.jsx'

const ROW = {
  channel: 'pr_review',
  runs: 60,
  failedRuns: 0,
  inputTokens: 1_400_000,
  outputTokens: 46_000,
  p50DurationMs: 30_000,
  p95DurationMs: 61_500,
}

describe('ChannelTable', () => {
  it('renders one row per channel with a readable label', () => {
    render(
      <ChannelTable
        rows={[
          ROW,
          { ...ROW, channel: 'auto_diagnose', runs: 4, inputTokens: 900 },
          { ...ROW, channel: 'mcp', runs: 2, inputTokens: 500, p50DurationMs: 20_000, p95DurationMs: 45_000 },
        ]}
      />
    )

    expect(screen.getByText('PR reviews')).toBeInTheDocument()
    expect(screen.getByText('Ticket auto-diagnose')).toBeInTheDocument()
    expect(screen.getByText('MCP')).toBeInTheDocument()
    expect(screen.getByText('1.4M')).toBeInTheDocument()
    expect(screen.getByText('900')).toBeInTheDocument()
    expect(screen.getAllByText('61.5s')).toHaveLength(2)
  })

  it('falls back to the raw channel when it has no label', () => {
    render(<ChannelTable rows={[{ ...ROW, channel: 'future_channel' }]} />)

    expect(screen.getByText('future_channel')).toBeInTheDocument()
  })

  it('badges the failures and dashes the channels without any', () => {
    render(<ChannelTable rows={[{ ...ROW, failedRuns: 2 }]} />)

    const badge = screen.getByText('2')
    expect(badge.className).toContain('badge')
  })

  it('says so when the breakdown could not be loaded', () => {
    render(<ChannelTable rows={null} />)

    expect(screen.getByText('The channel breakdown is unavailable right now.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an empty state when no run was recorded', () => {
    render(<ChannelTable rows={[]} />)

    expect(screen.getByText('No agent runs recorded yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
