import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RepoSearch from './RepoSearch.jsx'

const REPOS = ['reveni-io/backend', 'reveni-io/returns', 'reveni-io/atlas', 'acme/web']

describe('RepoSearch', () => {
  it('suggests the repos whose name contains the text, ignoring case, and fills the field with the one clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<RepoSearch value="S" options={REPOS} onChange={onChange} />)
    await user.click(screen.getByRole('combobox', { name: 'Repository to add' }))

    const options = screen.getAllByRole('option')
    expect(options.map(option => option.textContent)).toEqual(['reveni-io/returns', 'reveni-io/atlas'])

    await user.click(screen.getByRole('option', { name: 'reveni-io/returns' }))

    expect(onChange).toHaveBeenLastCalledWith('reveni-io/returns')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows at most 8 suggestions', async () => {
    const options = Array.from({ length: 12 }, (_, index) => `acme/repo-${index}`)
    const user = userEvent.setup()

    render(<RepoSearch value="repo" options={options} onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox', { name: 'Repository to add' }))

    expect(screen.getAllByRole('option')).toHaveLength(8)
  })

  it('moves through the suggestions with the arrows and picks one with Enter', async () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn(event => event.preventDefault())
    const user = userEvent.setup()

    render(
      <form onSubmit={onSubmit}>
        <RepoSearch value="reveni" options={REPOS} onChange={onChange} />
      </form>
    )
    const input = screen.getByRole('combobox', { name: 'Repository to add' })
    await user.click(input)
    await user.keyboard('{ArrowUp}')

    expect(screen.getByRole('option', { name: 'reveni-io/atlas' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}{ArrowDown}')

    expect(screen.getByRole('option', { name: 'reveni-io/returns' })).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'reveni-io/returns' }).id)

    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenLastCalledWith('reveni-io/returns')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the form with Enter when no suggestion is highlighted, and closes the list with Escape', async () => {
    const onSubmit = vi.fn(event => event.preventDefault())
    const user = userEvent.setup()

    render(
      <form onSubmit={onSubmit}>
        <RepoSearch value="acme" options={REPOS} onChange={vi.fn()} />
      </form>
    )
    await user.click(screen.getByRole('combobox', { name: 'Repository to add' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.keyboard('{Enter}')

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows no list for an empty field or a text nothing matches', async () => {
    const user = userEvent.setup()

    render(<RepoSearch value="zzz" options={REPOS} onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox', { name: 'Repository to add' }))
    await user.keyboard('{ArrowDown}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
