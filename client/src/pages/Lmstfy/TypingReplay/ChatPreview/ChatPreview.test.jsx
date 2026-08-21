import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChatPreview from './ChatPreview.jsx'

describe('ChatPreview', () => {
  it('shows the composer placeholder while nothing has been typed', () => {
    const { container } = render(<ChatPreview question="" isComposerActive={false} isSendPressed={false} />)

    expect(screen.getByText('Ask Soporti anything...')).toBeInTheDocument()
    expect(container.querySelector('.chat-preview__text--placeholder')).toBeTruthy()
  })

  it('shows the question as it is being typed, with a caret in an active composer', () => {
    const { container } = render(<ChatPreview question="why did it" isComposerActive isSendPressed={false} />)

    expect(screen.getByText('why did it')).toBeInTheDocument()
    expect(screen.queryByText('Ask Soporti anything...')).not.toBeInTheDocument()
    expect(container.querySelector('.chat-preview__composer--active')).toBeTruthy()
    expect(container.querySelector('.lmstfy-caret')).toBeTruthy()
  })

  it('presses the send button when told to', () => {
    const { container } = render(<ChatPreview question="why did it fail?" isComposerActive={false} isSendPressed />)

    expect(container.querySelector('.chat-preview__send--pressed')).toBeTruthy()
    expect(container.querySelector('.lmstfy-caret')).toBeNull()
  })

  it('looks like the real app, with the selected source and the empty state', () => {
    render(<ChatPreview question="" isComposerActive={false} isSendPressed={false} />)

    expect(screen.getByText('YOLO')).toBeInTheDocument()
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.getByText('Ask Soporti anything')).toBeInTheDocument()
  })
})
