import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SidebarSearch from './SidebarSearch.jsx'

describe('SidebarSearch', () => {
  it('reports what is typed', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SidebarSearch value="" label="Search sources" placeholder="Search sources..." onChange={onChange} />)

    await user.type(screen.getByRole('textbox', { name: 'Search sources' }), 'n')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('n')
  })

  it('clears the query with escape', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SidebarSearch value="notion" label="Search sources" onChange={onChange} />)

    await user.type(screen.getByRole('textbox', { name: 'Search sources' }), '{Escape}')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('clears the query from the clear button', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SidebarSearch value="notion" label="Search sources" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('offers no clear button while the query is empty', () => {
    render(<SidebarSearch value="" label="Search sources" onChange={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
  })

  it('caps the query at the given length', () => {
    render(<SidebarSearch value="" label="Search conversations" maxLength={200} onChange={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Search conversations' })).toHaveAttribute('maxLength', '200')
  })
})
