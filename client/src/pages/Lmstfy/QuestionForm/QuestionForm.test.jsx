import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuestionForm from './QuestionForm.jsx'

describe('QuestionForm', () => {
  it('keeps the action disabled until a question is typed', async () => {
    const user = userEvent.setup()
    render(<QuestionForm />)

    expect(screen.getByRole('button', { name: /generate link/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/the question they asked you/i), '   ')
    expect(screen.getByRole('button', { name: /generate link/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/the question they asked you/i), 'why did that refund fail?')
    expect(screen.getByRole('button', { name: /generate link/i })).toBeEnabled()
  })

  it('builds an absolute /lmstfy link with the question encoded', async () => {
    const user = userEvent.setup()
    render(<QuestionForm />)

    await user.type(screen.getByLabelText(/the question they asked you/i), '  why did that refund fail?  ')
    await user.click(screen.getByRole('button', { name: /generate link/i }))

    expect(screen.getByLabelText('Shareable link')).toHaveValue(
      `${window.location.origin}/lmstfy?q=why%20did%20that%20refund%20fail%3F`
    )
  })

  it('copies the generated link and confirms it', async () => {
    const user = userEvent.setup()
    render(<QuestionForm />)

    await user.type(screen.getByLabelText(/the question they asked you/i), 'how do refunds work')
    await user.click(screen.getByRole('button', { name: /generate link/i }))
    await user.click(screen.getByRole('button', { name: 'Copy' }))

    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/lmstfy?q=how%20do%20refunds%20work`)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('drops the stale link as soon as the question is edited again', async () => {
    const user = userEvent.setup()
    render(<QuestionForm />)

    await user.type(screen.getByLabelText(/the question they asked you/i), 'how do refunds work')
    await user.click(screen.getByRole('button', { name: /generate link/i }))
    expect(screen.getByLabelText('Shareable link')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/the question they asked you/i), '?')
    expect(screen.queryByLabelText('Shareable link')).not.toBeInTheDocument()
  })

  it('makes no request at all', async () => {
    global.fetch = vi.fn()
    const user = userEvent.setup()
    render(<QuestionForm />)

    await user.type(screen.getByLabelText(/the question they asked you/i), 'how do refunds work')
    await user.click(screen.getByRole('button', { name: /generate link/i }))

    expect(global.fetch).not.toHaveBeenCalled()
  })
})
