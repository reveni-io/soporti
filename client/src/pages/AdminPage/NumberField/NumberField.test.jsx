import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NumberField from './NumberField.jsx'

describe('NumberField', () => {
  it('lets a decimal be typed and reports it as a number', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<NumberField label="Min confidence" inputMode="decimal" value={null} onChange={onChange} />)
    await user.type(screen.getByLabelText('Min confidence'), '0.75')

    expect(screen.getByLabelText('Min confidence')).toHaveValue('0.75')
    expect(onChange).toHaveBeenLastCalledWith(0.75)
  })

  it('reports an empty field as no value and text that is not a number as is', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<NumberField label="Timeout (s)" value={30} onChange={onChange} />)
    const input = screen.getByLabelText('Timeout (s)')
    await user.clear(input)
    expect(onChange).toHaveBeenLastCalledWith(null)

    await user.type(input, 'x')
    expect(onChange).toHaveBeenLastCalledWith('x')
  })
})
