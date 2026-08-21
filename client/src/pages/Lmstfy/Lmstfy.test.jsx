import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Lmstfy from './Lmstfy.jsx'

vi.mock('../../common/GridPattern/GridPattern.jsx', () => ({
  default: ({ variant }) => <div data-testid="grid-pattern" data-variant={variant} />,
}))

vi.mock('./QuestionForm/QuestionForm.jsx', () => ({
  default: () => <div data-testid="question-form" />,
}))

vi.mock('./TypingReplay/TypingReplay.jsx', () => ({
  default: ({ question }) => <div data-testid="typing-replay">{question}</div>,
}))

beforeEach(() => {
  global.fetch = vi.fn()
})

describe('Lmstfy', () => {
  it('shows the generator when the link carries no question', () => {
    render(
      <MemoryRouter initialEntries={['/lmstfy']}>
        <Lmstfy />
      </MemoryRouter>
    )

    expect(screen.getByTestId('question-form')).toBeInTheDocument()
    expect(screen.queryByTestId('typing-replay')).not.toBeInTheDocument()
  })

  it('replays the question the link carries', () => {
    render(
      <MemoryRouter initialEntries={['/lmstfy?q=why%20did%20that%20refund%20fail%3F']}>
        <Lmstfy />
      </MemoryRouter>
    )

    expect(screen.getByTestId('typing-replay')).toHaveTextContent('why did that refund fail?')
    expect(screen.queryByTestId('question-form')).not.toBeInTheDocument()
  })

  it('falls back to the generator when the question is only whitespace', () => {
    render(
      <MemoryRouter initialEntries={['/lmstfy?q=%20%20']}>
        <Lmstfy />
      </MemoryRouter>
    )

    expect(screen.getByTestId('question-form')).toBeInTheDocument()
  })

  it('paints the shared grid pattern behind both modes', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/lmstfy']}>
        <Lmstfy />
      </MemoryRouter>
    )

    expect(screen.getByTestId('grid-pattern')).toHaveAttribute('data-variant', 'light')

    unmount()

    render(
      <MemoryRouter initialEntries={['/lmstfy?q=how%20do%20refunds%20work']}>
        <Lmstfy />
      </MemoryRouter>
    )

    expect(screen.getByTestId('grid-pattern')).toHaveAttribute('data-variant', 'light')
  })

  it('needs no session and no request to render', () => {
    render(
      <MemoryRouter initialEntries={['/lmstfy?q=how%20do%20refunds%20work']}>
        <Lmstfy />
      </MemoryRouter>
    )

    expect(screen.getByText('Soporti')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
