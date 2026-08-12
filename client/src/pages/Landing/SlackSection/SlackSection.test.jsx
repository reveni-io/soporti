import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SlackSection from './SlackSection.jsx'

describe('SlackSection', () => {
  it('explains that the thread shows the agent working', () => {
    render(<SlackSection />)

    expect(screen.getByText(/Watch it work, right in the thread/)).toBeInTheDocument()
    expect(screen.getByText(/the answer streams in underneath/)).toBeInTheDocument()
  })

  it('previews the steps with the source each one looked at', () => {
    render(<SlackSection />)

    expect(screen.getByText('Searching Notion')).toBeInTheDocument()
    expect(screen.getByText('src/refunds/service.js')).toBeInTheDocument()
  })

  it('marks the step still running apart from the finished ones', () => {
    const { container } = render(<SlackSection />)

    expect(container.querySelectorAll('.lp-steps__item--done')).toHaveLength(2)
    expect(container.querySelectorAll('.lp-steps__item--running')).toHaveLength(1)
  })
})
