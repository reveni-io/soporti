import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SkillsSection from './SkillsSection.jsx'

describe('SkillsSection', () => {
  it('explains skills and lists the example commands', () => {
    const { container } = render(<SkillsSection />)

    expect(screen.getByText(/Turn your team/)).toBeInTheDocument()
    const commands = [...container.querySelectorAll('.lp-qcard__tag--cmd')].map(node => node.textContent)
    expect(commands).toEqual(['/triage-ticket', '/trace-order', '/code-review', '/explain-like-support'])
  })

  it('lists what a skill can do', () => {
    const { container } = render(<SkillsSection />)

    expect(container.querySelectorAll('.lp-points li')).toHaveLength(4)
  })
})
