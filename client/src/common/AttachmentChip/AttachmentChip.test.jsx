import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AttachmentChip from './AttachmentChip.jsx'

describe('AttachmentChip', () => {
  it('shows the file name and no truncation note for a complete document', () => {
    render(<AttachmentChip attachment={{ name: 'spec.pdf', truncated: false }} />)

    expect(screen.getByText(/spec\.pdf/)).toBeInTheDocument()
    expect(screen.queryByText('truncated')).not.toBeInTheDocument()
  })

  it('flags a truncated document', () => {
    render(<AttachmentChip attachment={{ name: 'sales.xlsx', truncated: true }} />)

    expect(screen.getByText('truncated')).toBeInTheDocument()
  })

  it('offers no remove button when there is no remove handler', () => {
    render(<AttachmentChip attachment={{ name: 'spec.pdf', truncated: false }} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('removes the attachment when asked to', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(<AttachmentChip attachment={{ name: 'spec.pdf', truncated: false }} onRemove={onRemove} />)

    await user.click(screen.getByTitle('Remove spec.pdf'))

    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
