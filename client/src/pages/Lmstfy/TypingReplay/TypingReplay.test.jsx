import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import TypingReplay from './TypingReplay.jsx'
import {
  OPENING_PHASE,
  ADDRESS_PHASE,
  URL_PHASE,
  LOADING_PHASE,
  COMPOSER_PHASE,
  QUESTION_PHASE,
  SEND_PHASE,
  PRESSING_PHASE,
  DONE_PHASE,
} from '../hooks/useTypingReplay/useTypingReplay.js'

let replayState

vi.mock('../hooks/useTypingReplay/useTypingReplay.js', async importOriginal => {
  const original = await importOriginal()
  return { ...original, useTypingReplay: () => replayState }
})

const QUESTION = 'why did that refund fail?'
const SITE_URL = 'soporti.test'

function replay({ phase, typedUrl = '', typedQuestion = '', isClicking = false }) {
  replayState = { phase, typedUrl, typedQuestion, isClicking }
  return render(<TypingReplay question={QUESTION} />)
}

beforeEach(() => {
  replayState = { phase: OPENING_PHASE, typedUrl: '', typedQuestion: '', isClicking: false }
})

describe('TypingReplay', () => {
  it('starts with an empty browser window and the cursor parked', () => {
    const { container } = replay({ phase: OPENING_PHASE })

    expect(screen.getByTestId('replay-address')).toBeEmptyDOMElement()
    expect(container.querySelector('.chat-preview')).toBeNull()
    expect(screen.getByTestId('replay-cursor').className).toBe('lmstfy-replay__cursor')
  })

  it('moves the cursor to the address bar', () => {
    replay({ phase: ADDRESS_PHASE })

    expect(screen.getByTestId('replay-cursor')).toHaveClass('lmstfy-replay__cursor--address')
  })

  it('marks a click on the target it just reached', () => {
    replay({ phase: ADDRESS_PHASE, isClicking: true })

    expect(screen.getByTestId('replay-cursor')).toHaveClass('lmstfy-replay__cursor--clicking')
  })

  it('types the site url into a focused address bar, with the app not loaded yet', () => {
    const { container } = replay({ phase: URL_PHASE, typedUrl: 'sopor' })

    expect(screen.getByTestId('replay-address')).toHaveTextContent('sopor')
    expect(container.querySelector('.lmstfy-replay__address--focused')).toBeTruthy()
    expect(container.querySelector('.chat-preview')).toBeNull()
  })

  it('shows a loading bar between the url and the app', () => {
    const { container } = replay({ phase: LOADING_PHASE, typedUrl: SITE_URL })

    expect(screen.getByTestId('replay-progress')).toBeInTheDocument()
    expect(container.querySelector('.chat-preview')).toBeNull()
    expect(container.querySelector('.lmstfy-replay__address--focused')).toBeNull()
  })

  it('loads the chat preview and sends the cursor to the composer', () => {
    const { container } = replay({ phase: COMPOSER_PHASE, typedUrl: SITE_URL })

    expect(container.querySelector('.chat-preview')).toBeTruthy()
    expect(screen.queryByTestId('replay-progress')).not.toBeInTheDocument()
    expect(screen.getByTestId('replay-cursor')).toHaveClass('lmstfy-replay__cursor--composer')
  })

  it('types the question into the preview composer', () => {
    replay({ phase: QUESTION_PHASE, typedUrl: SITE_URL, typedQuestion: 'why did' })

    expect(screen.getByText('why did')).toBeInTheDocument()
    expect(screen.getByTestId('replay-cursor')).toHaveClass('lmstfy-replay__cursor--composer')
  })

  it('reaches the send button without pressing it yet', () => {
    const { container } = replay({ phase: SEND_PHASE, typedUrl: SITE_URL, typedQuestion: QUESTION })

    expect(screen.getByTestId('replay-cursor')).toHaveClass('lmstfy-replay__cursor--send')
    expect(container.querySelector('.chat-preview__send--pressed')).toBeNull()
  })

  it('presses the send button', () => {
    const { container } = replay({ phase: PRESSING_PHASE, typedUrl: SITE_URL, typedQuestion: QUESTION })

    expect(container.querySelector('.chat-preview__send--pressed')).toBeTruthy()
    expect(screen.getByTestId('replay-cursor')).toHaveClass('lmstfy-replay__cursor--send')
  })

  it('announces the handover once the click is done', () => {
    replay({ phase: DONE_PHASE, typedUrl: SITE_URL, typedQuestion: QUESTION })

    expect(screen.getByText(/next time, ask it yourself/i)).toBeInTheDocument()
  })

  it('draws a mouse cursor inside the window', () => {
    const { container } = replay({ phase: OPENING_PHASE })

    expect(container.querySelector('[data-icon="cursor"]')).toBeTruthy()
  })
})
