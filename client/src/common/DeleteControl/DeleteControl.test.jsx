import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DeleteControl from './DeleteControl.jsx'

describe('DeleteControl', () => {
  it('asks before deleting', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(
      <DeleteControl
        label="Delete dashboard"
        question="Delete this dashboard and its charts?"
        busy={false}
        onDelete={onDelete}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))

    expect(screen.getByRole('group', { name: 'Delete this dashboard and its charts?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete dashboard' })).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes once confirmed', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<DeleteControl label="Delete chart" question="Delete this chart?" busy={false} onDelete={onDelete} />)

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('goes back to the first step when the deletion is not confirmed', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<DeleteControl label="Delete chart" question="Delete this chart?" busy={false} onDelete={onDelete} />)

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete chart' })).toBeInTheDocument()
  })

  it('cannot confirm twice while the deletion is on its way', async () => {
    const user = userEvent.setup()
    render(<DeleteControl label="Delete chart" question="Delete this chart?" busy onDelete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))

    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeDisabled()
  })
})
