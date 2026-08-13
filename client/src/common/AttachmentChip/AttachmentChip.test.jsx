import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AttachmentChip from './AttachmentChip.jsx'

const IMAGE_ID = '22222222-2222-4222-8222-222222222222'
const DATA_URI = 'data:image/png;base64,AQID'

describe('AttachmentChip', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
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

  it('shows the local preview of an image being attached without fetching it', () => {
    global.fetch = vi.fn()
    render(<AttachmentChip attachment={{ name: 'error.png', imageId: IMAGE_ID, previewUrl: 'blob:local' }} token="t" />)

    expect(screen.getByAltText('error.png')).toHaveAttribute('src', 'blob:local')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('loads a stored image by id when there is no local preview', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ name: 'error.png', image: DATA_URI }) })

    render(<AttachmentChip attachment={{ name: 'error.png', imageId: IMAGE_ID }} token="t" />)

    await waitFor(() => expect(screen.getByAltText('error.png')).toHaveAttribute('src', DATA_URI))
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/attachments/images/${IMAGE_ID}`,
      expect.objectContaining({ headers: { Authorization: 'Bearer t' } })
    )
  })

  it('falls back to a placeholder when the image is no longer stored', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Not found.' }) })

    render(<AttachmentChip attachment={{ name: 'error.png', imageId: IMAGE_ID }} token="t" />)

    await waitFor(() => expect(screen.getByTitle('error.png is no longer stored')).toBeInTheDocument())
    expect(screen.queryByAltText('error.png')).not.toBeInTheDocument()
    expect(screen.getByText(/error\.png/)).toBeInTheDocument()
  })

  it('keeps the paperclip for a document', () => {
    render(<AttachmentChip attachment={{ name: 'spec.pdf', truncated: false }} token="t" />)

    expect(screen.queryByAltText('spec.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('\u{1F4CE}')).toBeInTheDocument()
  })
})
