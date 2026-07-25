import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SkillBadge from './SkillBadge.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

const SKILL = { id: 5, name: 'bug-triage' }

describe('SkillBadge', () => {
  it('renders a plain chip without a token', () => {
    render(<SkillBadge skill={SKILL} token={null} />)
    expect(screen.getByText('/bug-triage')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens a preview modal with the skill details on click', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        skill: { id: 5, name: 'bug-triage', description: 'Triage bugs', instructions: 'Ask for repro steps.' },
      }),
    })
    const user = userEvent.setup()

    render(<SkillBadge skill={SKILL} token="tok" />)
    await user.click(screen.getByRole('button', { name: '/bug-triage' }))

    expect(await screen.findByText('Ask for repro steps.')).toBeInTheDocument()
    expect(screen.getByText('Triage bugs')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/skills/5')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('shows a message when the skill no longer exists', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    const user = userEvent.setup()

    render(<SkillBadge skill={SKILL} token="tok" />)
    await user.click(screen.getByRole('button', { name: '/bug-triage' }))

    expect(await screen.findByText('This skill no longer exists.')).toBeInTheDocument()
  })

  it('closes the preview from the close button', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ skill: { id: 5, name: 'bug-triage', description: null, instructions: 'x' } }),
    })
    const user = userEvent.setup()

    render(<SkillBadge skill={SKILL} token="tok" />)
    await user.click(screen.getByRole('button', { name: '/bug-triage' }))
    await screen.findByText('x')

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('x')).not.toBeInTheDocument()
  })
})
