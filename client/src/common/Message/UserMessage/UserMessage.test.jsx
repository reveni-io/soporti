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
})
