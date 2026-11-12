import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SqlEditor from './SqlEditor.jsx'

describe('SqlEditor', () => {
  it('shows the query in a code field that does not spell-check', () => {
    render(<SqlEditor value="SELECT 1" isRunning={false} error={null} onChange={vi.fn()} onRun={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'SQL' })

    expect(input).toHaveValue('SELECT 1')
    expect(input).toHaveAttribute('spellcheck', 'false')
    expect(input).toHaveAttribute('maxlength', '20000')
    expect(input).toHaveClass('textarea--code')
  })

  it('reports every edit', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SqlEditor value="SELECT 1" isRunning={false} error={null} onChange={onChange} onRun={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'SQL' }), '0')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('SELECT 10')
  })

  it('runs the query from the button', async () => {
    const onRun = vi.fn()
    const user = userEvent.setup()
    render(<SqlEditor value="SELECT 1" isRunning={false} error={null} onChange={vi.fn()} onRun={onRun} />)

    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(onRun).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['Ctrl+Enter', '{Control>}{Enter}{/Control}'],
    ['Cmd+Enter', '{Meta>}{Enter}{/Meta}'],
  ])('runs the query with %s without adding a line', async (_shortcut, keys) => {
    const onRun = vi.fn()
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SqlEditor value="SELECT 1" isRunning={false} error={null} onChange={onChange} onRun={onRun} />)

    await user.click(screen.getByRole('textbox', { name: 'SQL' }))
    await user.keyboard(keys)

    expect(onRun).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not run on a plain Enter', async () => {
    const onRun = vi.fn()
    const user = userEvent.setup()
    render(<SqlEditor value="SELECT 1" isRunning={false} error={null} onChange={vi.fn()} onRun={onRun} />)

    await user.type(screen.getByRole('textbox', { name: 'SQL' }), '{Enter}')

    expect(onRun).not.toHaveBeenCalled()
  })

  it('cannot run an empty query', () => {
    render(<SqlEditor value="   " isRunning={false} error={null} onChange={vi.fn()} onRun={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  })

  it('says so while the query is running', () => {
    render(<SqlEditor value="SELECT 1" isRunning error={null} onChange={vi.fn()} onRun={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled()
  })

  it('shows the message of the database under the query', () => {
    render(
      <SqlEditor
        value="SELEC 1"
        isRunning={false}
        error='syntax error at or near "SELEC"'
        onChange={vi.fn()}
        onRun={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('syntax error at or near "SELEC"')
  })
})
