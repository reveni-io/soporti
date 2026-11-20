import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LandingIntro from './LandingIntro.jsx'

const NAV_BRAND = { left: 60, top: 30, width: 100, height: 22 }
const INTRO_BRAND = { left: 400, top: 380, width: 400, height: 88 }

function targetWith(rect) {
  return { current: { getBoundingClientRect: () => rect } }
}

function stubBrandRect(rect) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.classList.contains('lp-intro__brand') ? rect : { left: 0, top: 0, width: 0, height: 0 }
  })
}

describe('LandingIntro', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('spells the wordmark letter by letter next to the Reveni mark', () => {
    const { container } = render(<LandingIntro isLeaving={false} targetRef={{ current: null }} onSkip={vi.fn()} />)

    expect(container.querySelector('[data-logo="reveni"]')).toBeInTheDocument()
    expect([...container.querySelectorAll('.lp-intro__letter')].map(letter => letter.textContent).join('')).toBe(
      'Soporti'
    )
    expect(screen.getByText('by Reveni')).toBeInTheDocument()
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstChild).not.toHaveClass('lp-intro--leaving')
  })

  it('skips when it is clicked', async () => {
    const user = userEvent.setup()
    const onSkip = vi.fn()
    const { container } = render(<LandingIntro isLeaving={false} targetRef={{ current: null }} onSkip={onSkip} />)

    await user.click(container.firstChild)

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('flies the brand onto the navigation logo when it leaves', () => {
    stubBrandRect(INTRO_BRAND)

    const { container } = render(<LandingIntro isLeaving targetRef={targetWith(NAV_BRAND)} onSkip={vi.fn()} />)

    const brand = container.querySelector('.lp-intro__brand')
    expect(container.firstChild).toHaveClass('lp-intro--leaving')
    expect(brand).toHaveClass('lp-intro__brand--flying')
    expect(brand.style.transform).toBe('translate(-490px, -383px) scale(0.25)')
  })

  it('just fades out when the navigation logo cannot be measured', () => {
    stubBrandRect(INTRO_BRAND)

    const { container } = render(
      <LandingIntro isLeaving targetRef={targetWith({ left: 0, top: 0, width: 0, height: 0 })} onSkip={vi.fn()} />
    )

    const brand = container.querySelector('.lp-intro__brand')
    expect(brand).not.toHaveClass('lp-intro__brand--flying')
    expect(brand.style.transform).toBe('')
  })
})
