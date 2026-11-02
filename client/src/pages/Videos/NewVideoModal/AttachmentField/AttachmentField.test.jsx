import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AttachmentField from './AttachmentField.jsx'

const DOCUMENT = { name: 'spec.pdf', text: 'Rules' }

describe('AttachmentField', () => {
  it('hands the picked files over', async () => {
    const onAddFiles = vi.fn()
    const user = userEvent.setup()
    const file = new File(['%PDF'], 'spec.pdf', { type: 'application/pdf' })
    render(
      <AttachmentField
        attachments={[]}
        isUploading={false}
        error={null}
        token="tok"
        onAddFiles={onAddFiles}
        onRemove={vi.fn()}
      />
    )

    await user.upload(screen.getByLabelText('Attach files'), file)

    expect(onAddFiles).toHaveBeenCalledTimes(1)
    expect(onAddFiles.mock.calls[0][0][0]).toBe(file)
  })

  it('lists the attachments and removes one by position', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(
      <AttachmentField
        attachments={[DOCUMENT, { name: 'notes.csv', text: 'a,b' }]}
        isUploading={false}
        error={null}
        token="tok"
        onAddFiles={vi.fn()}
        onRemove={onRemove}
      />
    )

    await user.click(screen.getByTitle('Remove notes.csv'))

    expect(screen.getByText('spec.pdf')).toBeInTheDocument()
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith(1)
  })

  it('locks the picker while uploading and shows the upload error', () => {
    render(
      <AttachmentField
        attachments={[]}
        isUploading={true}
        error="Failed to read the file"
        token="tok"
        onAddFiles={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByText('Uploading…')).toBeInTheDocument()
    expect(screen.getByLabelText('Attach files')).toBeDisabled()
    expect(screen.getByText('Failed to read the file')).toBeInTheDocument()
  })

  it('locks the picker once five files are attached', () => {
    const attachments = ['a', 'b', 'c', 'd', 'e'].map(name => ({ name: `${name}.pdf`, text: name }))

    render(
      <AttachmentField
        attachments={attachments}
        isUploading={false}
        error={null}
        token="tok"
        onAddFiles={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Attach files')).toBeDisabled()
  })
})
