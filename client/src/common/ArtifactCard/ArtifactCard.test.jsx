import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArtifactCard from './ArtifactCard.jsx'

describe('ArtifactCard', () => {
  it('opens the artifact it belongs to when clicked', async () => {
    const onOpen = vi.fn()
    render(
      <ArtifactCard
        artifactId="3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601"
        title="Refund dashboard"
        version={1}
        onOpen={onOpen}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /refund dashboard/i }))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith('3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601')
  })

  it('labels the first version as an artifact rather than as version 1', () => {
    render(
      <ArtifactCard
        artifactId="3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601"
        title="Refund dashboard"
        version={1}
        onOpen={vi.fn()}
      />
    )

    expect(screen.getByText('Interactive artifact')).toBeInTheDocument()
    expect(screen.queryByText('Version 1')).not.toBeInTheDocument()
  })

  it('shows the version once the agent has iterated on it', () => {
    render(
      <ArtifactCard
        artifactId="3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601"
        title="Refund dashboard"
        version={3}
        onOpen={vi.fn()}
      />
    )

    expect(screen.getByText('Version 3')).toBeInTheDocument()
  })

  it('renders without a button where no panel can open it, as on a shared conversation', () => {
    render(<ArtifactCard artifactId="3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601" title="Refund dashboard" version={2} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Refund dashboard')).toBeInTheDocument()
    expect(screen.getByText('Version 2')).toBeInTheDocument()
  })
})
