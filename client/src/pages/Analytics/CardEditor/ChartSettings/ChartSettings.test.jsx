import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChartSettings from './ChartSettings.jsx'

const COLUMNS = [
  { name: 'week', kind: 'date' },
  { name: 'country', kind: 'text' },
  { name: 'orders', kind: 'number' },
  { name: 'revenue', kind: 'number' },
]

const BAR = {
  type: 'bar',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'orders', label: 'Orders' }],
  stacked: false,
}

describe('ChartSettings', () => {
  it('asks to run the query while there is no chart yet', () => {
    render(<ChartSettings chart={null} columns={[]} onChange={vi.fn()} />)

    expect(screen.getByText('Run the query to choose how to draw it.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Chart type' })).toBeNull()
  })

  it('offers only the type until the columns of the result are known', () => {
    render(<ChartSettings chart={BAR} columns={[]} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Columns' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('shows the axis, the values, the grouping and the stacking of a column chart', () => {
    render(<ChartSettings chart={BAR} columns={COLUMNS} onChange={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Chart' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'X axis' })).toHaveValue('week')
    expect(screen.getByRole('combobox', { name: 'Group by' })).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: 'orders' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'revenue' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Stacked' })).not.toBeChecked()
    expect(screen.queryByRole('combobox', { name: 'Value' })).toBeNull()
  })

  it('lists every column for the axis and only the free ones for the grouping', () => {
    render(<ChartSettings chart={BAR} columns={COLUMNS} onChange={vi.fn()} />)

    const axisOptions = [...screen.getByRole('combobox', { name: 'X axis' }).options].map(option => option.value)
    const groupOptions = [...screen.getByRole('combobox', { name: 'Group by' }).options].map(option => option.text)

    expect(axisOptions).toEqual(['week', 'country', 'orders', 'revenue'])
    expect(groupOptions).toEqual(['None', 'country', 'revenue'])
  })

  it('switches the type, keeping what still applies', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ChartSettings chart={{ ...BAR, stacked: true }} columns={COLUMNS} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Line' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ ...BAR, type: 'line' })
  })

  it('fills the axis and the value when a table becomes a chart', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const table = { type: 'table', xKey: null, groupKey: null, series: [], stacked: false }
    render(<ChartSettings chart={table} columns={COLUMNS} onChange={onChange} />)

    expect(screen.queryByRole('combobox')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Columns' }))

    expect(onChange).toHaveBeenCalledWith(BAR)
  })

  it('moves the axis to another column', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ChartSettings chart={BAR} columns={COLUMNS} onChange={onChange} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'X axis' }), 'country')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ ...BAR, xKey: 'country' })
  })

  it('adds a second value', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ChartSettings chart={BAR} columns={COLUMNS} onChange={onChange} />)

    await user.click(screen.getByRole('checkbox', { name: 'revenue' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      ...BAR,
      series: [
        { key: 'orders', label: 'Orders' },
        { key: 'revenue', label: 'Revenue' },
      ],
    })
  })

  it('keeps the last value checked', () => {
    render(<ChartSettings chart={BAR} columns={COLUMNS} onChange={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: 'orders' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'revenue' })).toBeEnabled()
  })

  it('stops offering more values once eight are plotted', () => {
    const measures = Array.from({ length: 9 }, (_, index) => ({ name: `m${index}`, kind: 'number' }))
    const full = { ...BAR, series: measures.slice(0, 8).map(column => ({ key: column.name, label: column.name })) }
    render(<ChartSettings chart={full} columns={[COLUMNS[0], ...measures]} onChange={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: 'm8' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'm0' })).toBeEnabled()
  })

  it('groups by a column, keeping a single value to split', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const multi = { ...BAR, series: [...BAR.series, { key: 'revenue', label: 'Revenue' }] }
    render(<ChartSettings chart={multi} columns={COLUMNS} onChange={onChange} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Group by' }), 'country')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ ...BAR, groupKey: 'country' })
  })

  it('picks the single value of a grouped chart from a list', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const grouped = { ...BAR, groupKey: 'country' }
    render(<ChartSettings chart={grouped} columns={COLUMNS} onChange={onChange} />)

    expect(screen.queryByRole('checkbox', { name: 'orders' })).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Value' }), 'revenue')

    expect(onChange).toHaveBeenCalledWith({ ...grouped, series: [{ key: 'revenue', label: 'Revenue' }] })
  })

  it('stops grouping when None is chosen', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ChartSettings chart={{ ...BAR, groupKey: 'country' }} columns={COLUMNS} onChange={onChange} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Group by' }), 'None')

    expect(onChange).toHaveBeenCalledWith(BAR)
  })

  it('stacks the values', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ChartSettings chart={BAR} columns={COLUMNS} onChange={onChange} />)

    await user.click(screen.getByRole('checkbox', { name: 'Stacked' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ ...BAR, stacked: true })
  })

  it.each([
    ['Columns', 'bar', true],
    ['Bars', 'row', true],
    ['Area', 'area', true],
    ['Line', 'line', false],
  ])('offers stacking for %s only when the type can stack', (_label, type, isStackable) => {
    render(<ChartSettings chart={{ ...BAR, type }} columns={COLUMNS} onChange={vi.fn()} />)

    expect(screen.queryAllByRole('checkbox', { name: 'Stacked' })).toHaveLength(isStackable ? 1 : 0)
  })

  it('asks a pie for its category and a single value', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const pie = { ...BAR, type: 'pie', xKey: 'country' }
    render(<ChartSettings chart={pie} columns={COLUMNS} onChange={onChange} />)

    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('country')
    expect(screen.getByRole('combobox', { name: 'Value' })).toHaveValue('orders')
    expect(screen.queryByRole('combobox', { name: 'Group by' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Value' }), 'revenue')

    expect(onChange).toHaveBeenCalledWith({ ...pie, series: [{ key: 'revenue', label: 'Revenue' }] })
  })

  it('names the axis of horizontal bars a category', () => {
    render(<ChartSettings chart={{ ...BAR, type: 'row' }} columns={COLUMNS} onChange={vi.fn()} />)

    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('week')
    expect(screen.queryByRole('combobox', { name: 'X axis' })).toBeNull()
  })

  it('asks a number only for its value', () => {
    const number = { type: 'number', xKey: null, groupKey: null, series: BAR.series, stacked: false }
    render(<ChartSettings chart={number} columns={COLUMNS} onChange={vi.fn()} />)

    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.getByRole('combobox', { name: 'Value' })).toHaveValue('orders')
  })

  it('asks a table for nothing', () => {
    const table = { type: 'table', xKey: null, groupKey: null, series: [], stacked: false }
    render(<ChartSettings chart={table} columns={COLUMNS} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('says so when the result has no number to plot', () => {
    const texts = [
      { name: 'country', kind: 'text' },
      { name: 'plan', kind: 'text' },
    ]
    render(<ChartSettings chart={{ ...BAR, xKey: 'country', series: [] }} columns={texts} onChange={vi.fn()} />)

    expect(screen.getByText('The result has no number column to plot.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'plan' })).toBeNull()
  })
})
