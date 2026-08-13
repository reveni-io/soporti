import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatComposer from './ChatComposer.jsx'

const DROP_HINT = 'Drop your files to attach them'
const ATTACH_HINT = 'Attach a PDF, Word or Excel file, or an image'

const BASE_PROPS = {
  input: '',
  textareaRef: { current: null },
  highlightRef: { current: null },
  commandPrefix: '',
  canSend: false,
  menuOpen: false,
  matchingSkills: [],
  menuIndex: 0,
  onChange: vi.fn(),
  onKeyDown: vi.fn(),
  onSubmit: vi.fn(),
  onSelectSkill: vi.fn(),
  onBlur: vi.fn(),
  onScroll: vi.fn(),
  isLoading: false,
  hasSourcesSelected: true,
  onStop: vi.fn(),
  attachments: [],
  attachmentError: '',
  isUploadingAttachment: false,
  onAttachFiles: vi.fn(),
  onRemoveAttachment: vi.fn(),
}

function pdfFile(name = 'spec.pdf') {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' })
}

function fileDrag(files = []) {
  return { types: ['Files'], files, dropEffect: '' }
}

describe('ChatComposer', () => {
  it('invites a question when sources are selected', () => {
    render(<ChatComposer {...BASE_PROPS} />)

    expect(screen.getByPlaceholderText('Ask Soporti anything...')).toBeEnabled()
  })

  it('disables the textarea and asks for a source when none is selected', () => {
    render(<ChatComposer {...BASE_PROPS} hasSourcesSelected={false} />)

    expect(screen.getByPlaceholderText('Select a source from the sidebar first...')).toBeDisabled()
  })

  it('reports what the user types', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ChatComposer {...BASE_PROPS} onChange={onChange} />)

    await user.type(screen.getByPlaceholderText('Ask Soporti anything...'), 'h')

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('keeps Send disabled until the message can be sent', () => {
    const { rerender } = render(<ChatComposer {...BASE_PROPS} />)
    expect(screen.getByTitle('Send')).toBeDisabled()

    rerender(<ChatComposer {...BASE_PROPS} canSend />)
    expect(screen.getByTitle('Send')).toBeEnabled()
  })

  it('submits the form', async () => {
    const onSubmit = vi.fn(event => event.preventDefault())
    const user = userEvent.setup()
    render(<ChatComposer {...BASE_PROPS} canSend onSubmit={onSubmit} />)

    await user.click(screen.getByTitle('Send'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('swaps Send for Stop while a response is streaming', async () => {
    const onStop = vi.fn()
    const user = userEvent.setup()
    render(<ChatComposer {...BASE_PROPS} isLoading onStop={onStop} />)

    expect(screen.queryByTitle('Send')).not.toBeInTheDocument()
    await user.click(screen.getByTitle('Stop'))

    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('overlays the command prefix only when a skill is invoked', () => {
    const { container, rerender } = render(<ChatComposer {...BASE_PROPS} input="/trace-order 1024" />)
    expect(container.querySelector('.chat__input-highlight')).toBeNull()

    rerender(<ChatComposer {...BASE_PROPS} input="/trace-order 1024" commandPrefix="/trace-order" />)

    expect(container.querySelector('.chat__input-command').textContent).toBe('/trace-order')
    expect(container.querySelector('.chat__input-highlight').textContent).toBe('/trace-order 1024')
    expect(screen.getByPlaceholderText('Ask Soporti anything...')).toHaveClass('chat__input--overlaid')
  })

  it('hands the picked files to the attachment handler', async () => {
    const onAttachFiles = vi.fn()
    const user = userEvent.setup()
    render(<ChatComposer {...BASE_PROPS} onAttachFiles={onAttachFiles} />)

    await user.upload(screen.getByLabelText('Attach files'), pdfFile())

    expect(onAttachFiles).toHaveBeenCalledTimes(1)
    expect([...onAttachFiles.mock.calls[0][0]].map(file => file.name)).toEqual(['spec.pdf'])
  })

  it('attaches the files dropped on the composer', () => {
    const onAttachFiles = vi.fn()
    const { container } = render(<ChatComposer {...BASE_PROPS} onAttachFiles={onAttachFiles} />)
    const area = container.querySelector('.chat__input-area')
    const dataTransfer = fileDrag([pdfFile()])

    fireEvent.dragEnter(area, { dataTransfer })
    expect(screen.getByText(DROP_HINT)).toBeInTheDocument()

    fireEvent.drop(area, { dataTransfer })

    expect(onAttachFiles).toHaveBeenCalledTimes(1)
    expect([...onAttachFiles.mock.calls[0][0]].map(file => file.name)).toEqual(['spec.pdf'])
    expect(screen.queryByText(DROP_HINT)).not.toBeInTheDocument()
  })

  it('ignores a drop once the attachment limit is reached', () => {
    const onAttachFiles = vi.fn()
    const attachments = [
      { name: 'a.pdf', truncated: false },
      { name: 'b.pdf', truncated: false },
      { name: 'c.pdf', truncated: false },
    ]
    const { container } = render(
      <ChatComposer {...BASE_PROPS} attachments={attachments} onAttachFiles={onAttachFiles} />
    )
    const area = container.querySelector('.chat__input-area')
    const dataTransfer = fileDrag([pdfFile('d.pdf')])

    fireEvent.dragEnter(area, { dataTransfer })
    fireEvent.drop(area, { dataTransfer })

    expect(screen.queryByText(DROP_HINT)).not.toBeInTheDocument()
    expect(onAttachFiles).not.toHaveBeenCalled()
  })

  it('leaves a text drag to the textarea', () => {
    const onAttachFiles = vi.fn()
    const { container } = render(<ChatComposer {...BASE_PROPS} onAttachFiles={onAttachFiles} />)
    const area = container.querySelector('.chat__input-area')
    const dataTransfer = { types: ['text/plain'], files: [] }

    fireEvent.dragEnter(area, { dataTransfer })
    fireEvent.drop(area, { dataTransfer })

    expect(screen.queryByText(DROP_HINT)).not.toBeInTheDocument()
    expect(onAttachFiles).not.toHaveBeenCalled()
  })

  it('accepts the supported document and image types', () => {
    render(<ChatComposer {...BASE_PROPS} />)

    expect(screen.getByLabelText('Attach files')).toHaveAttribute(
      'accept',
      '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.gif'
    )
  })

  it('lists the attached files and removes the one the user picks', async () => {
    const onRemoveAttachment = vi.fn()
    const user = userEvent.setup()
    render(
      <ChatComposer
        {...BASE_PROPS}
        attachments={[
          { name: 'spec.pdf', truncated: false },
          { name: 'sales.xlsx', truncated: true },
        ]}
        onRemoveAttachment={onRemoveAttachment}
      />
    )

    expect(screen.getByText(/spec\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/sales\.xlsx/)).toBeInTheDocument()
    expect(screen.getByText('truncated')).toBeInTheDocument()

    await user.click(screen.getByTitle('Remove sales.xlsx'))

    expect(onRemoveAttachment).toHaveBeenCalledWith(1)
  })

  it('disables attaching once the limit is reached', () => {
    const attachments = [
      { name: 'a.pdf', truncated: false },
      { name: 'b.pdf', truncated: false },
      { name: 'c.pdf', truncated: false },
    ]
    const { rerender } = render(<ChatComposer {...BASE_PROPS} attachments={attachments.slice(0, 2)} />)
    expect(screen.getByTitle(ATTACH_HINT)).toBeEnabled()

    rerender(<ChatComposer {...BASE_PROPS} attachments={attachments} />)

    expect(screen.getByTitle(ATTACH_HINT)).toBeDisabled()
  })

  it('disables attaching while a file is uploading or no source is selected', () => {
    const { rerender } = render(<ChatComposer {...BASE_PROPS} isUploadingAttachment />)
    expect(screen.getByTitle(ATTACH_HINT)).toBeDisabled()

    rerender(<ChatComposer {...BASE_PROPS} hasSourcesSelected={false} />)

    expect(screen.getByTitle(ATTACH_HINT)).toBeDisabled()
  })

  it('attaches an image pasted from the clipboard', () => {
    const onAttachFiles = vi.fn()
    const image = new File(['bytes'], 'image.png', { type: 'image/png' })
    render(<ChatComposer {...BASE_PROPS} onAttachFiles={onAttachFiles} />)

    fireEvent.paste(screen.getByPlaceholderText('Ask Soporti anything...'), {
      clipboardData: { files: [image], types: ['Files'] },
    })

    expect(onAttachFiles).toHaveBeenCalledWith([image])
  })

  it('leaves pasted text alone', () => {
    const onAttachFiles = vi.fn()
    render(<ChatComposer {...BASE_PROPS} onAttachFiles={onAttachFiles} />)

    fireEvent.paste(screen.getByPlaceholderText('Ask Soporti anything...'), {
      clipboardData: { files: [], types: ['text/plain'] },
    })

    expect(onAttachFiles).not.toHaveBeenCalled()
  })

  it('ignores a pasted file that is not a supported image', () => {
    const onAttachFiles = vi.fn()
    const archive = new File(['bytes'], 'backup.zip', { type: 'application/zip' })
    render(<ChatComposer {...BASE_PROPS} onAttachFiles={onAttachFiles} />)

    fireEvent.paste(screen.getByPlaceholderText('Ask Soporti anything...'), {
      clipboardData: { files: [archive], types: ['Files'] },
    })

    expect(onAttachFiles).not.toHaveBeenCalled()
  })

  it('does not attach a pasted image once the attachment limit is reached', () => {
    const onAttachFiles = vi.fn()
    const image = new File(['bytes'], 'image.png', { type: 'image/png' })
    const attachments = [
      { name: 'a.pdf', truncated: false },
      { name: 'b.pdf', truncated: false },
      { name: 'c.pdf', truncated: false },
    ]
    render(<ChatComposer {...BASE_PROPS} attachments={attachments} onAttachFiles={onAttachFiles} />)

    fireEvent.paste(screen.getByPlaceholderText('Ask Soporti anything...'), {
      clipboardData: { files: [image], types: ['Files'] },
    })

    expect(onAttachFiles).not.toHaveBeenCalled()
  })

  it('shows the attachment error', () => {
    render(<ChatComposer {...BASE_PROPS} attachmentError='"huge.pdf" is too large (max 10 MB).' />)

    expect(screen.getByText('"huge.pdf" is too large (max 10 MB).')).toBeInTheDocument()
  })

  it('shows the skill menu only while it is open', () => {
    const skills = [{ id: 1, name: 'trace-order' }]
    const { rerender } = render(<ChatComposer {...BASE_PROPS} matchingSkills={skills} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    rerender(<ChatComposer {...BASE_PROPS} menuOpen matchingSkills={skills} />)

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('/trace-order')).toBeInTheDocument()
  })
})
