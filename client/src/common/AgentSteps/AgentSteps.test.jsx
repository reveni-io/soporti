import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AgentSteps from './AgentSteps.jsx'

describe('AgentSteps', () => {
  it('renders a row per step with its detail and duration', () => {
    const steps = [
      { label: 'Searching code', detail: '"refund" in org/app', duration: '1.2s', done: true },
      { label: 'Reading file', detail: 'org/app/src/index.js', duration: '', done: false },
    ]
    render(<AgentSteps steps={steps} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Searching code')).toBeInTheDocument()
    expect(screen.getByText('"refund" in org/app')).toBeInTheDocument()
    expect(screen.getByText('1.2s')).toBeInTheDocument()
    expect(screen.getByText('Reading file')).toBeInTheDocument()
  })

  it('renders no detail or duration when the step has neither', () => {
    render(<AgentSteps steps={[{ label: 'Listing repositories', detail: '', duration: '', done: true }]} />)

    expect(screen.getByRole('listitem').textContent).toBe('Listing repositories')
  })

  it('counts the completed steps while the agent works', () => {
    const steps = [
      { label: 'Searching code', detail: '', duration: '0.4s', done: true },
      { label: 'Reading file', detail: '', duration: '', done: false },
    ]
    render(<AgentSteps steps={steps} />)

    expect(screen.getByText('1/2 steps')).toBeInTheDocument()
    expect(screen.getByText('Working')).toBeInTheDocument()
  })

  it('marks the header as done once every step finished', () => {
    render(<AgentSteps steps={[{ label: 'Searching code', detail: '', duration: '0.4s', done: true }]} />)

    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('1/1 steps')).toBeInTheDocument()
  })

  it('labels each step marker with its status', () => {
    const steps = [
      { label: 'Searching code', detail: '', duration: '0.4s', done: true },
      { label: 'Reading file', detail: '', duration: '', done: false },
    ]
    render(<AgentSteps steps={steps} />)

    expect(screen.getByRole('img', { name: 'Completed' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'In progress' })).toBeInTheDocument()
  })

  it('stays expanded while a step is still running', () => {
    render(<AgentSteps steps={[{ label: 'Reading file', detail: '', duration: '', done: false }]} />)

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps working while the agent runs, even with every started step finished', () => {
    render(<AgentSteps steps={[{ label: 'Reading file', detail: '', duration: '0.4s', done: true }]} active />)

    expect(screen.getByText('Working')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapses on its own once every step finished', () => {
    render(<AgentSteps steps={[{ label: 'Reading file', detail: '', duration: '0.4s', done: true }]} />)

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands the finished steps when the header is clicked', async () => {
    render(<AgentSteps steps={[{ label: 'Reading file', detail: '', duration: '0.4s', done: true }]} />)

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapses the running steps when the header is clicked', async () => {
    render(<AgentSteps steps={[{ label: 'Reading file', detail: '', duration: '', done: false }]} />)

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('points the header at the panel it controls', () => {
    const { container } = render(
      <AgentSteps steps={[{ label: 'Reading file', detail: '', duration: '', done: false }]} />
    )

    const panelId = screen.getByRole('button').getAttribute('aria-controls')

    expect(container.querySelector(`#${CSS.escape(panelId)}`)).toContainElement(screen.getByRole('list'))
  })
})

describe('AgentSteps nesting', () => {
  it('indents a step a specialist ran and leaves the others flat', () => {
    const steps = [
      { label: 'Ask code reviewer', done: false, nested: false },
      { label: 'Searching code', done: true, nested: true },
    ]

    const { container } = render(<AgentSteps steps={steps} active />)

    const rendered = container.querySelectorAll('.agent-steps__step')
    expect(rendered[0].classList.contains('agent-steps__step--nested')).toBe(false)
    expect(rendered[1].classList.contains('agent-steps__step--nested')).toBe(true)
  })
})
