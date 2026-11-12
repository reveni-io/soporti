import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardNameForm from './DashboardNameForm.jsx'

function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })

  return { promise, resolve }
}

describe('DashboardNameForm', () => {
  it('starts empty, focused and limited to the length the server accepts', () => {
    render(
      <DashboardNameForm
        placeholder="e.g. Returns overview"
        autoFocus
        submitLabel="Create"
        busyLabel="Creating…"
        onSubmit={vi.fn()}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const input = screen.getByRole('textbox', { name: 'Name' })

    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('maxlength', '80')
    expect(input).toHaveAttribute('placeholder', 'e.g. Returns overview')
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('submits the trimmed name and reports that it is done', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(
      <DashboardNameForm
        submitLabel="Create"
        busyLabel="Creating…"
        onSubmit={onSubmit}
        onDone={onDone}
        onCancel={vi.fn()}
      />
    )

    await user.type(screen.getByRole('textbox', { name: 'Name' }), '  Returns overview ')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('Returns overview')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('submits on Enter', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(<DashboardNameForm submitLabel="Create" busyLabel="Creating…" onSubmit={onSubmit} onDone={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Operations{Enter}')

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('Operations')
  })

  it('does not submit a blank name', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<DashboardNameForm submitLabel="Create" busyLabel="Creating…" onSubmit={onSubmit} onDone={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), '   {Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('cannot save a name that did not change', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(
      <DashboardNameForm
        initialName="Returns overview"
        submitLabel="Save"
        busyLabel="Saving…"
        onSubmit={onSubmit}
        onDone={vi.fn()}
      />
    )
    const input = screen.getByRole('textbox', { name: 'Name' })

    expect(input).toHaveValue('Returns overview')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()

    await user.type(input, ' 2026')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith('Returns overview 2026')
  })

  it('cannot submit twice while the request is on its way', async () => {
    const submission = deferred()
    const onSubmit = vi.fn().mockReturnValue(submission.promise)
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<DashboardNameForm submitLabel="Create" busyLabel="Creating…" onSubmit={onSubmit} onDone={onDone} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Operations{Enter}')

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()

    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()

    await act(async () => submission.resolve())
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('shows why the name was rejected and stays open', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('You already have 20 dashboards.'))
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<DashboardNameForm submitLabel="Create" busyLabel="Creating…" onSubmit={onSubmit} onDone={onDone} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Operations{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have 20 dashboards.')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  it('cancels without submitting', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <DashboardNameForm
        submitLabel="Create"
        busyLabel="Creating…"
        onSubmit={onSubmit}
        onDone={vi.fn()}
        onCancel={onCancel}
      />
    )

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Operations')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
