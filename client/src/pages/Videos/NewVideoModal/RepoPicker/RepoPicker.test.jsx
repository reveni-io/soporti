import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RepoPicker from './RepoPicker.jsx'

const REPOS = [
  { fullName: 'reveni/app', description: 'Merchant dashboard', language: 'TypeScript' },
  { fullName: 'reveni/api', description: 'Backend', language: 'Python' },
  { fullName: 'reveni/docs', description: null, language: null },
]

describe('RepoPicker', () => {
  it('filters the repos by name, description or language', async () => {
    const user = userEvent.setup()
    render(<RepoPicker repos={REPOS} loading={false} error={null} selected={[]} onToggle={vi.fn()} />)

    await user.type(screen.getByRole('searchbox', { name: 'Search repos' }), 'python')

    expect(screen.getByRole('checkbox', { name: /reveni\/api/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /reveni\/app/ })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /reveni\/docs/ })).toBeNull()
  })

  it('says when nothing matches the search', async () => {
    const user = userEvent.setup()
    render(<RepoPicker repos={REPOS} loading={false} error={null} selected={[]} onToggle={vi.fn()} />)

    await user.type(screen.getByRole('searchbox', { name: 'Search repos' }), 'nothing')

    expect(screen.getByText('No repos match.')).toBeInTheDocument()
  })

  it('toggles a repo by its full name', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<RepoPicker repos={REPOS} loading={false} error={null} selected={[]} onToggle={onToggle} />)

    await user.click(screen.getByRole('checkbox', { name: /reveni\/docs/ }))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('reveni/docs')
  })

  it('shows the selection as removable chips with the count', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<RepoPicker repos={REPOS} loading={false} error={null} selected={['reveni/api']} onToggle={onToggle} />)

    expect(screen.getByText('1/5')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /reveni\/api/ })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Remove reveni/api' }))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('reveni/api')
  })

  it('locks the other repos once five are picked', () => {
    const selected = ['a/1', 'a/2', 'a/3', 'a/4', 'reveni/app']

    render(<RepoPicker repos={REPOS} loading={false} error={null} selected={selected} onToggle={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: /reveni\/app/ })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: /reveni\/api/ })).toBeDisabled()
  })

  it('shows the loading state', () => {
    render(<RepoPicker repos={[]} loading={true} error={null} selected={[]} onToggle={vi.fn()} />)

    expect(screen.getByText('Loading repos...')).toBeInTheDocument()
  })

  it('shows the error when the repos cannot be loaded', () => {
    render(<RepoPicker repos={[]} loading={false} error="Failed to fetch repos" selected={[]} onToggle={vi.fn()} />)

    expect(screen.getByText('Failed to fetch repos')).toBeInTheDocument()
  })
})
