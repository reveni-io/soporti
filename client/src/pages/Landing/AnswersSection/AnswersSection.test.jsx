import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AnswersSection from './AnswersSection.jsx'

vi.mock('../../../common/ChartBlock/ChartBlock.jsx', () => ({ default: () => <div data-testid="chart" /> }))
vi.mock('../../../common/CsvBlock/CsvBlock.jsx', () => ({ default: () => <div data-testid="csv" /> }))
vi.mock('react-syntax-highlighter', () => ({ Prism: ({ children }) => <pre data-testid="sql">{children}</pre> }))
vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ oneDark: {} }))

describe('AnswersSection', () => {
  it('starts on the chart answer', () => {
    const { container } = render(<AnswersSection />)

    expect(container.querySelector('section')).toHaveAttribute('id', 'answers')
    expect(screen.getByRole('tab', { name: 'Charts' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('How many returns did we get per day last week?')
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('switches to the format that is picked', async () => {
    const user = userEvent.setup()
    const { container } = render(<AnswersSection />)

    await user.click(screen.getByRole('tab', { name: 'Tables' }))
    expect(screen.getByRole('tab', { name: 'Tables' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Charts' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('csv')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Diagrams' }))
    expect(container.querySelector('.mermaid-diagram svg')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Code & SQL' }))
    expect(screen.getByTestId('sql')).toHaveTextContent('read-only')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'lp-answers-tab-code')
  })

  describe('auto-advance (with IntersectionObserver)', () => {
    let observers

    class MockIntersectionObserver {
      constructor(callback) {
        this.callback = callback
        this.elements = []
        observers.push(this)
      }
      observe(element) {
        this.elements.push(element)
      }
      unobserve() {}
      disconnect() {}
    }

    function setInView(isIntersecting) {
      act(() => {
        observers.forEach(observer =>
          observer.elements.forEach(element => observer.callback([{ isIntersecting, target: element }]))
        )
      })
    }

    beforeEach(() => {
      observers = []
      vi.useFakeTimers()
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
      vi.stubGlobal('matchMedia', () => ({ matches: false }))
    })

    afterEach(() => {
      vi.clearAllTimers()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    it('moves to the next format on its own while in view, with a progress bar on the current tab', async () => {
      const { container } = render(<AnswersSection />)
      setInView(true)

      expect(screen.getByRole('tab', { name: 'Charts' }).querySelector('.lp-progress-bar')).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(7000)
      })

      expect(screen.getByRole('tab', { name: 'Tables' })).toHaveAttribute('aria-selected', 'true')
      expect(container.querySelectorAll('.lp-progress-bar')).toHaveLength(1)
    })

    it('drops the progress bar while it is out of view', () => {
      const { container } = render(<AnswersSection />)
      setInView(true)
      setInView(false)

      expect(container.querySelector('.lp-progress-bar')).not.toBeInTheDocument()
    })
  })
})
