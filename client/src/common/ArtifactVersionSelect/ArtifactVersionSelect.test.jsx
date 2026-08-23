import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArtifactVersionSelect from './ArtifactVersionSelect.jsx'

describe('ArtifactVersionSelect', () => {
  it('renders one option per version', () => {
    render(<ArtifactVersionSelect versions={[1, 2, 3]} value={3} onChange={vi.fn()} />)

    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByRole('option', { name: 'Version 1' })).toBeInTheDocument()
  })

  it('reports the picked version as a number, not a string', async () => {
    const onChange = vi.fn()
    render(<ArtifactVersionSelect versions={[1, 2]} value={2} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Artifact version'), '1')

    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('renders nothing while there is only one version to pick', () => {
    render(<ArtifactVersionSelect versions={[1]} value={1} onChange={vi.fn()} />)

    expect(screen.queryByLabelText('Artifact version')).not.toBeInTheDocument()
  })

  it('renders nothing when there are no versions yet', () => {
    render(<ArtifactVersionSelect versions={[]} value="" onChange={vi.fn()} />)

    expect(screen.queryByLabelText('Artifact version')).not.toBeInTheDocument()
  })

  it('composes the shared input primitive plus any caller class', () => {
    render(<ArtifactVersionSelect versions={[1, 2]} value={2} onChange={vi.fn()} className="extra" />)

    const select = screen.getByLabelText('Artifact version')
    expect(select).toHaveClass('input')
    expect(select).toHaveClass('artifact-version-select')
    expect(select).toHaveClass('extra')
  })
})
