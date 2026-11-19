import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import HeroChat from './HeroChat.jsx'

const QUESTION = { role: 'user', text: 'Look up order #1024 in Shopify for Acme' }

function assistant(overrides) {
  return { role: 'assistant', phase: 'tools', tools: [], answer: [], ...overrides }
}

describe('HeroChat', () => {
  it('renders the chat window with its composer', () => {
    render(<HeroChat messages={[]} />)

    expect(screen.getByText('Soporti')).toBeInTheDocument()
    expect(screen.getByText('YOLO')).toBeInTheDocument()
    expect(screen.getByText('Ask Soporti anything…')).toBeInTheDocument()
  })

  it('shows the question and the thinking indicator before any tool runs', () => {
    const { container } = render(<HeroChat messages={[QUESTION, assistant({ phase: 'thinking' })]} />)

    expect(screen.getByText(QUESTION.text)).toBeInTheDocument()
    expect(container.querySelector('.message__typing')).toBeInTheDocument()
  })

  it('shows a running tool without its duration and lights its source up', () => {
    const tools = [{ source: 'shopify', label: 'Searching Shopify', detail: 'order #1024', duration: '0.8s' }]
    const { container } = render(<HeroChat messages={[QUESTION, assistant({ tools })]} />)

    expect(screen.getByText('Searching Shopify')).toBeInTheDocument()
    expect(screen.queryByText('0.8s')).not.toBeInTheDocument()
    expect(container.querySelector('[data-source="shopify"]')).toHaveAttribute('data-state', 'running')
    expect(container.querySelector('[data-source="github"]')).toHaveAttribute('data-state', 'idle')
  })

  it('marks a finished tool with its duration and keeps a source running while another of its tools runs', () => {
    const tools = [
      { source: 'github', label: 'Searching code', detail: 'labels', duration: '1.4s', done: true },
      { source: 'github', label: 'Reading file', detail: 'labels/service.rb', duration: '0.5s' },
      { source: 'postgres', label: 'Querying database', detail: 'returns', duration: '0.6s', done: true },
    ]
    const { container } = render(<HeroChat messages={[QUESTION, assistant({ tools })]} />)

    expect(screen.getByText('1.4s')).toBeInTheDocument()
    expect(screen.queryByText('0.5s')).not.toBeInTheDocument()
    expect(container.querySelector('[data-source="github"]')).toHaveAttribute('data-state', 'running')
    expect(container.querySelector('[data-source="postgres"]')).toHaveAttribute('data-state', 'done')
  })

  it('renders the streamed answer with its highlighted tokens', () => {
    const answer = [{ t: 'Order ' }, { t: '#1024', b: true }, { t: ' is fulfilled.' }]
    render(<HeroChat messages={[QUESTION, assistant({ phase: 'answer', answer })]} />)

    expect(screen.getByText('#1024').tagName).toBe('STRONG')
    expect(screen.getByText(/is fulfilled/)).toBeInTheDocument()
  })
})
