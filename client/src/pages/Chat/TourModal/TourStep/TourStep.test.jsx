import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TourStep from './TourStep.jsx'

describe('TourStep', () => {
  it('renders the title and description', () => {
    render(
      <TourStep
        step={{ id: 'intro', title: 'Meet Soporti', description: 'Your AI teammate.' }}
        imageHidden={false}
        onImageError={vi.fn()}
        onTryExample={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Meet Soporti' })).toBeInTheDocument()
    expect(screen.getByText('Your AI teammate.')).toBeInTheDocument()
  })

  it('renders an integration chip per matching integration', () => {
    render(
      <TourStep
        step={{
          id: 'data',
          title: 'Live data',
          integrations: [{ id: 'postgres', name: 'PostgreSQL', description: 'Query data' }],
        }}
        imageHidden={false}
        onImageError={vi.fn()}
        onTryExample={vi.fn()}
      />
    )

    expect(screen.getByText('PostgreSQL').closest('.chip')).toHaveAttribute('title', 'Query data')
  })

  it('renders the tips as bullets', () => {
    render(
      <TourStep
        step={{ id: 'tips', title: 'Tips', bullets: ['First tip', 'Second tip'] }}
        imageHidden={false}
        onImageError={vi.fn()}
        onTryExample={vi.fn()}
      />
    )

    expect(screen.getAllByRole('listitem').map(node => node.textContent)).toEqual(['First tip', 'Second tip'])
  })

  it('reports the example the user clicked', async () => {
    const onTryExample = vi.fn()
    const user = userEvent.setup()
    render(
      <TourStep
        step={{ id: 'code', title: 'Code', examples: [{ text: 'How do refunds work?' }] }}
        imageHidden={false}
        onImageError={vi.fn()}
        onTryExample={onTryExample}
      />
    )

    await user.click(screen.getByRole('button', { name: 'How do refunds work?' }))

    expect(onTryExample).toHaveBeenCalledWith('How do refunds work?')
  })

  it('reports a screenshot that failed to load', () => {
    const onImageError = vi.fn()
    const { container } = render(
      <TourStep
        step={{ id: 'sources', title: 'Sources', image: '/tour/sources.png' }}
        imageHidden={false}
        onImageError={onImageError}
        onTryExample={vi.fn()}
      />
    )

    fireEvent.error(container.querySelector('img'))

    expect(onImageError).toHaveBeenCalledTimes(1)
  })

  it('hides a screenshot that is known to be broken', () => {
    const { container } = render(
      <TourStep
        step={{ id: 'sources', title: 'Sources', image: '/tour/sources.png' }}
        imageHidden
        onImageError={vi.fn()}
        onTryExample={vi.fn()}
      />
    )

    expect(container.querySelector('img')).toBeNull()
  })
})
