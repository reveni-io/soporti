import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import UserMessage from './UserMessage.jsx'

vi.mock('../../SkillBadge/SkillBadge.jsx', () => ({
  default: ({ skill }) => <span data-testid="skill-badge">{skill.name}</span>,
}))

describe('UserMessage', () => {
  it('renders the question', () => {
    const { container } = render(<UserMessage message={{ role: 'user', content: 'How do refunds work?' }} />)

    expect(screen.getByText('How do refunds work?')).toBeInTheDocument()
    expect(container.querySelector('.message--user')).toBeInTheDocument()
  })

  it('renders a badge per invoked skill', () => {
    render(
      <UserMessage
        message={{ role: 'user', content: 'go', skills: [{ id: 1, name: 'triage' }, { name: 'trace' }] }}
        token="tok"
      />
    )

    expect(screen.getAllByTestId('skill-badge').map(node => node.textContent)).toEqual(['triage', 'trace'])
  })

  it('renders no badges when no skill was invoked', () => {
    render(<UserMessage message={{ role: 'user', content: 'go' }} />)

    expect(screen.queryByTestId('skill-badge')).not.toBeInTheDocument()
  })

  it('loads the image of an attached screenshot with the user token', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ image: 'data:image/png;base64,AQID' }) })
    const imageId = '22222222-2222-4222-8222-222222222222'

    render(
      <UserMessage
        message={{ role: 'user', content: 'what is this?', attachments: [{ name: 'error.png', imageId }] }}
        token="tok"
      />
    )

    expect(await screen.findByAltText('error.png')).toHaveAttribute('src', 'data:image/png;base64,AQID')
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/attachments/images/${imageId}`,
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } })
    )
  })
})
