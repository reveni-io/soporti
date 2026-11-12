import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DeleteConfirm from './DeleteConfirm.jsx'

describe('DeleteConfirm', () => {
  it('asks before deleting and starts on the safe answer', () => {
    render(<DeleteConfirm question="Delete this chart?" busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Delete this chart?' })).toHaveTextContent('Delete this chart?')
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveFocus()
  })

  it('confirms the deletion', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<DeleteConfirm question="Delete this chart?" busy={false} onConfirm={onConfirm} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('backs out of the deletion', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<DeleteConfirm question="Delete this chart?" busy={false} onConfirm={onConfirm} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cannot confirm twice while the chart is being deleted', () => {
    render(<DeleteConfirm question="Delete this chart?" busy onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeDisabled()
  })
})
