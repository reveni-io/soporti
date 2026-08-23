import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ArtifactPanel from './ArtifactPanel.jsx'

const ARTIFACT_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

const ARTIFACT = {
  id: ARTIFACT_ID,
  identifier: 'refund-dashboard',
  title: 'Refund dashboard',
  latestVersion: 2,
  versions: [1, 2],
}

describe('ArtifactPanel', () => {
  it('renders the artifact html inside the frame', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Refund dashboard' })).toBeInTheDocument()
    expect(screen.getByTitle('Refund dashboard').getAttribute('srcdoc')).toContain('<h1>Refunds</h1>')
  })

  it('switches to the version the user picks', async () => {
    const onSelectVersion = vi.fn()
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={false}
          error=""
          onSelectVersion={onSelectVersion}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    await userEvent.selectOptions(screen.getByLabelText('Artifact version'), '1')

    expect(onSelectVersion).toHaveBeenCalledWith(1)
  })

  it('hides the version picker while there is only one version', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={{ ...ARTIFACT, latestVersion: 1, versions: [1] }}
          html="<h1>Refunds</h1>"
          version={1}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.queryByLabelText('Artifact version')).not.toBeInTheDocument()
  })

  it('closes the panel', async () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onClose={onClose}
        />
      </MemoryRouter>
    )

    await userEvent.click(screen.getByRole('button', { name: /close artifact/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a loading note before the first html arrives', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={null}
          html=""
          version={null}
          loading={true}
          error=""
          onSelectVersion={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Loading artifact...')).toBeInTheDocument()
    expect(screen.queryByTitle('Artifact')).not.toBeInTheDocument()
  })

  it('keeps the current version on screen while the next one loads', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={true}
          error=""
          onSelectVersion={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByTitle('Refund dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Loading artifact...')).not.toBeInTheDocument()
  })

  it('links to the artifact on its own page', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onShare={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: /open artifact on its own page/i })).toHaveAttribute(
      'href',
      `/artifacts/${ARTIFACT_ID}`
    )
  })

  it('shares the artifact', async () => {
    const onShare = vi.fn()
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onShare={onShare}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    await userEvent.click(screen.getByRole('button', { name: /share artifact/i }))

    expect(onShare).toHaveBeenCalledTimes(1)
  })

  it('surfaces a share failure instead of leaving a dead button', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onShare={vi.fn()}
          shareError="Failed to share the artifact."
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Failed to share the artifact.')).toBeInTheDocument()
    expect(screen.getByTitle('Refund dashboard')).toBeInTheDocument()
  })

  it('cannot share an artifact that has not loaded yet', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={null}
          html=""
          version={null}
          loading={true}
          error=""
          onSelectVersion={vi.fn()}
          onShare={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /share artifact/i })).toBeDisabled()
  })

  it('exports the artifact as a pdf through the frame', async () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onShare={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    const frame = screen.getByTitle('Refund dashboard')
    const postMessage = vi.spyOn(frame.contentWindow, 'postMessage')

    await userEvent.click(screen.getByRole('button', { name: 'Export as PDF' }))

    expect(postMessage).toHaveBeenCalledWith({ type: 'artifact_print' }, '*')
  })

  it('cannot export a pdf before the html arrives', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={null}
          html=""
          version={null}
          loading={true}
          error=""
          onSelectVersion={vi.fn()}
          onShare={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: 'Export as PDF' })).toBeDisabled()
  })

  it('deletes the version on screen only after an explicit confirmation', async () => {
    const onDeleteVersion = vi.fn()
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onShare={vi.fn()}
          onDeleteVersion={onDeleteVersion}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    await userEvent.click(screen.getByRole('button', { name: 'Delete this version' }))
    expect(onDeleteVersion).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onDeleteVersion).toHaveBeenCalledTimes(1)
    expect(onDeleteVersion).toHaveBeenCalledWith(2)
  })

  it('keeps the version when the confirmation is cancelled', async () => {
    const onDeleteVersion = vi.fn()
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onShare={vi.fn()}
          onDeleteVersion={onDeleteVersion}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    await userEvent.click(screen.getByRole('button', { name: 'Delete this version' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDeleteVersion).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete this version' })).toBeInTheDocument()
  })

  it('offers no version delete while there is only one version', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={{ ...ARTIFACT, latestVersion: 1, versions: [1] }}
          html="<h1>Refunds</h1>"
          version={1}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onShare={vi.fn()}
          onDeleteVersion={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.queryByRole('button', { name: 'Delete this version' })).not.toBeInTheDocument()
  })

  it('surfaces a delete failure instead of swallowing it', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html="<h1>Refunds</h1>"
          version={2}
          loading={false}
          error=""
          onSelectVersion={vi.fn()}
          onShare={vi.fn()}
          onDeleteVersion={vi.fn()}
          deleteError="Cannot delete the only version. Delete the artifact instead."
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Cannot delete the only version. Delete the artifact instead.')).toBeInTheDocument()
    expect(screen.getByTitle('Refund dashboard')).toBeInTheDocument()
  })

  it('shows the error instead of the frame', () => {
    render(
      <MemoryRouter>
        <ArtifactPanel
          artifactId={ARTIFACT_ID}
          artifact={ARTIFACT}
          html=""
          version={2}
          loading={false}
          error="Failed to load the artifact"
          onSelectVersion={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Failed to load the artifact')).toBeInTheDocument()
    expect(screen.queryByTitle('Refund dashboard')).not.toBeInTheDocument()
  })
})
