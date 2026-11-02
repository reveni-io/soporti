import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SegmentedControl from './SegmentedControl.jsx'

const OPTIONS = [
  { value: 20, label: '~20 s' },
  { value: 30, label: '~30 s' },
]

describe('SegmentedControl', () => {
  it('checks the selected option inside a labelled group', () => {
    render(<SegmentedControl label="Duration" name="duration" options={OPTIONS} value={30} onChange={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Duration' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '~30 s' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '~20 s' })).not.toBeChecked()
  })

  it('reports the value of the option picked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SegmentedControl label="Duration" name="duration" options={OPTIONS} value={30} onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: '~20 s' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(20)
  })

  it('shows the hint when one is given', () => {
    render(
      <SegmentedControl
        label="Pace"
        name="pace"
        options={OPTIONS}
        value={20}
        hint="Text stays long enough to read."
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('Text stays long enough to read.')).toBeInTheDocument()
  })
})
