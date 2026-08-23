import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ArtifactBody from './ArtifactBody.jsx'

describe('ArtifactBody', () => {
  it('renders the artifact in a frame titled after it', () => {
    render(<ArtifactBody html="<h1>Refunds</h1>" title="Refund dashboard" loading={false} error="" />)

    expect(screen.getByTitle('Refund dashboard').getAttribute('srcdoc')).toContain('<h1>Refunds</h1>')
  })

  it('sits the frame on its own canvas, so the artifact reads as a surface of its own', () => {
    const { container } = render(
      <ArtifactBody html="<h1>Refunds</h1>" title="Refund dashboard" loading={false} error="" />
    )

    const canvas = container.querySelector('.artifact-body__canvas')
    expect(canvas).toBeInTheDocument()
    expect(canvas.contains(screen.getByTitle('Refund dashboard'))).toBe(true)
  })

  it('draws no canvas around a loading or error state', () => {
    const { container: pending } = render(<ArtifactBody html="" title="Refund dashboard" loading={true} error="" />)
    expect(pending.querySelector('.artifact-body__canvas')).toBeNull()

    const { container: failed } = render(
      <ArtifactBody html="" title="Refund dashboard" loading={false} error="Failed." />
    )
    expect(failed.querySelector('.artifact-body__canvas')).toBeNull()
  })

  it('falls back to a generic frame title when the metadata has not arrived', () => {
    render(<ArtifactBody html="<h1>Refunds</h1>" title={undefined} loading={false} error="" />)

    expect(screen.getByTitle('Artifact')).toBeInTheDocument()
  })

  it('shows the error instead of the frame', () => {
    render(<ArtifactBody html="" title="Refund dashboard" loading={false} error="Artifact not found." />)

    expect(screen.getByText('Artifact not found.')).toBeInTheDocument()
    expect(screen.queryByTitle('Refund dashboard')).not.toBeInTheDocument()
  })

  it('prefers the error over a stale document', () => {
    render(<ArtifactBody html="<h1>Old</h1>" title="Refund dashboard" loading={false} error="Failed." />)

    expect(screen.getByText('Failed.')).toBeInTheDocument()
    expect(screen.queryByTitle('Refund dashboard')).not.toBeInTheDocument()
  })

  it('shows a loading note before the first document arrives', () => {
    render(<ArtifactBody html="" title="Refund dashboard" loading={true} error="" />)

    expect(screen.getByText('Loading artifact...')).toBeInTheDocument()
  })

  it('keeps the current document on screen while the next version loads', () => {
    render(<ArtifactBody html="<h1>Refunds</h1>" title="Refund dashboard" loading={true} error="" />)

    expect(screen.getByTitle('Refund dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Loading artifact...')).not.toBeInTheDocument()
  })

  it('says the artifact is gone when there is nothing to render and nothing pending', () => {
    render(<ArtifactBody html="" title="Refund dashboard" loading={false} error="" />)

    expect(screen.getByText('This artifact is no longer available.')).toBeInTheDocument()
  })
})
