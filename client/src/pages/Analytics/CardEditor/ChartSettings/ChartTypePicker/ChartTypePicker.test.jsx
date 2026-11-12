import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChartTypePicker from './ChartTypePicker.jsx'

describe('ChartTypePicker', () => {
  it('offers the seven chart types and presses the current one', () => {
    render(<ChartTypePicker value="line" onChange={vi.fn()} />)

    const options = screen.getAllByRole('button')

    expect(screen.getByRole('group', { name: 'Chart type' })).toBeInTheDocument()
    expect(options.map(option => option.textContent)).toEqual([
      'Columns',
      'Bars',
      'Line',
      'Area',
      'Pie',
      'Number',
      'Table',
    ])
    expect(screen.getByRole('button', { name: 'Line' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Columns' })).toHaveAttribute('aria-pressed', 'false')
  })

  it.each([
    ['Columns', 'bar'],
    ['Bars', 'row'],
    ['Pie', 'pie'],
    ['Number', 'number'],
    ['Table', 'table'],
  ])('reports the type behind %s', async (label, type) => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ChartTypePicker value="line" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: label }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(type)
  })
})
