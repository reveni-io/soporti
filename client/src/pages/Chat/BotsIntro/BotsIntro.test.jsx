import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BotsIntro from './BotsIntro.jsx'

function makeBot(id) {
  return {
    id,
    name: `Bot ${id}`,
    description: `Does job ${id}.`,
    profile: 'support',
    avatarSeed: `seed-${id}`,
    unreadCount: 0,
  }
}

describe('BotsIntro', () => {
  it('stays empty while the bots load', () => {
    render(<BotsIntro bots={[]} loading error={null} onCreate={vi.fn()} />)

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('explains what a bot is when there are none and offers to create one', async () => {
    const onCreate = vi.fn()
    const user = userEvent.setup()
    render(<BotsIntro bots={[]} loading={false} error={null} onCreate={onCreate} />)

    expect(screen.getByRole('heading', { name: 'Your own assistants' })).toBeInTheDocument()
    expect(screen.getByText(/private assistant with a job you describe/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create a bot' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('does not offer to create a bot when the bots could not be loaded', () => {
    render(<BotsIntro bots={[]} loading={false} error="Failed to load your bots" onCreate={vi.fn()} />)

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create a bot' })).not.toBeInTheDocument()
  })

  it('asks to pick a bot and shows the first few of them', () => {
    const bots = [1, 2, 3, 4, 5].map(makeBot)
    const { container } = render(<BotsIntro bots={bots} loading={false} error={null} onCreate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Pick a bot' })).toBeInTheDocument()
    expect(screen.getByText(/Choose one from the list to open its chat/)).toBeInTheDocument()
    expect(container.querySelectorAll('svg.bot-avatar')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Create a bot' })).not.toBeInTheDocument()
  })
})
