import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PermissionField from './PermissionField.jsx'

describe('PermissionField', () => {
  it('names the group after the area and offers every level it supports', () => {
    render(<PermissionField area="Deals" levels={['off', 'read', 'write', 'full']} value="read" onChange={vi.fn()} />)

    const group = screen.getByRole('radiogroup', { name: 'Deals' })
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    expect(within(group).getByRole('radio', { name: 'Off' })).toHaveAttribute('value', 'off')
    expect(within(group).getByRole('radio', { name: 'Read' })).toHaveAttribute('value', 'read')
    expect(within(group).getByRole('radio', { name: 'Write' })).toHaveAttribute('value', 'write')
    expect(within(group).getByRole('radio', { name: 'Full' })).toHaveAttribute('value', 'full')
  })

  it('does not offer write on an area that can only be read', () => {
    render(<PermissionField area="Marketing" levels={['off', 'read']} value="off" onChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: 'Off' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Read' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Write' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Full' })).not.toBeInTheDocument()
  })

  it('offers reply instead of write and full for conversations', () => {
    render(<PermissionField area="Conversations" levels={['off', 'read', 'reply']} value="reply" onChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: 'Reply' })).toBeChecked()
    expect(screen.queryByRole('radio', { name: 'Write' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Full' })).not.toBeInTheDocument()
  })

  it('checks only the current level', () => {
    render(<PermissionField area="Deals" levels={['off', 'read', 'write', 'full']} value="write" onChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: 'Write' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Off' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Read' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Full' })).not.toBeChecked()
  })

  it('reports the level the admin picks', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<PermissionField area="Deals" levels={['off', 'read', 'write', 'full']} value="read" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'Full' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('full')
  })

  it('keeps the level while it is disabled', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<PermissionField area="Lists" levels={['off', 'read', 'write']} value="read" disabled onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'Write' }))

    expect(screen.getByRole('radio', { name: 'Write' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Read' })).toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves through the levels of one area with the arrow keys without reaching the next area', async () => {
    const onContactsChange = vi.fn()
    const onTicketsChange = vi.fn()
    const user = userEvent.setup()

    render(
      <>
        <PermissionField
          area="Contacts"
          levels={['off', 'read', 'write', 'full']}
          value="full"
          onChange={onContactsChange}
        />
        <PermissionField
          area="Tickets"
          levels={['off', 'read', 'write', 'full']}
          value="read"
          onChange={onTicketsChange}
        />
      </>
    )

    await user.click(within(screen.getByRole('radiogroup', { name: 'Contacts' })).getByRole('radio', { name: 'Full' }))
    await user.keyboard('{ArrowRight}')

    expect(onContactsChange).toHaveBeenCalledTimes(1)
    expect(onContactsChange).toHaveBeenCalledWith('off')
    expect(onTicketsChange).not.toHaveBeenCalled()
  })
})
