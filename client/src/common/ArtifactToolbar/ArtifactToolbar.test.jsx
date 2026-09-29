import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArtifactToolbar from './ArtifactToolbar.jsx'

const ARTIFACT = { title: 'Refund dashboard', latestVersion: 2, versions: [1, 2] }

describe('ArtifactToolbar', () => {
  it('selects the latest version when none is picked', () => {
    render(
      <ArtifactToolbar
        artifact={ARTIFACT}
        version={null}
        hasHtml
        onSelectVersion={vi.fn()}
        onShare={vi.fn()}
        onExportPdf={vi.fn()}
        onDeleteVersion={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Artifact version')).toHaveValue('2')
  })

  it('reports the picked version', async () => {
    const onSelectVersion = vi.fn()
    render(
      <ArtifactToolbar
        artifact={ARTIFACT}
        version={2}
        hasHtml
        onSelectVersion={onSelectVersion}
        onShare={vi.fn()}
        onExportPdf={vi.fn()}
        onDeleteVersion={vi.fn()}
      />
    )

    await userEvent.selectOptions(screen.getByLabelText('Artifact version'), '1')

    expect(onSelectVersion).toHaveBeenCalledTimes(1)
    expect(onSelectVersion).toHaveBeenCalledWith(1)
  })

  it('shares and exports through the given handlers', async () => {
    const onShare = vi.fn()
    const onExportPdf = vi.fn()
    render(
      <ArtifactToolbar
        artifact={ARTIFACT}
        version={2}
        hasHtml
        onSelectVersion={vi.fn()}
        onShare={onShare}
        onExportPdf={onExportPdf}
        onDeleteVersion={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Share artifact' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export as PDF' }))

    expect(onShare).toHaveBeenCalledTimes(1)
    expect(onExportPdf).toHaveBeenCalledTimes(1)
  })

  it('disables share and export while there is no html', () => {
    render(
      <ArtifactToolbar
        artifact={ARTIFACT}
        version={2}
        hasHtml={false}
        onSelectVersion={vi.fn()}
        onShare={vi.fn()}
        onExportPdf={vi.fn()}
        onDeleteVersion={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Share artifact' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export as PDF' })).toBeDisabled()
  })

  it('deletes the current version only after confirming', async () => {
    const onDeleteVersion = vi.fn()
    render(
      <ArtifactToolbar
        artifact={ARTIFACT}
        version={2}
        hasHtml
        onSelectVersion={vi.fn()}
        onShare={vi.fn()}
        onExportPdf={vi.fn()}
        onDeleteVersion={onDeleteVersion}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Delete this version' }))

    expect(onDeleteVersion).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onDeleteVersion).toHaveBeenCalledTimes(1)
    expect(onDeleteVersion).toHaveBeenCalledWith(2)
    expect(screen.getByRole('button', { name: 'Delete this version' })).toBeInTheDocument()
  })

  it('restores the actions when the deletion is cancelled', async () => {
    const onDeleteVersion = vi.fn()
    render(
      <ArtifactToolbar
        artifact={ARTIFACT}
        version={2}
        hasHtml
        onSelectVersion={vi.fn()}
        onShare={vi.fn()}
        onExportPdf={vi.fn()}
        onDeleteVersion={onDeleteVersion}
      >
        <a href="/artifacts/1">Open</a>
      </ArtifactToolbar>
    )

    await userEvent.click(screen.getByRole('button', { name: 'Delete this version' }))

    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDeleteVersion).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Open' })).toBeInTheDocument()
  })

  it('hides delete when only one version exists', () => {
    render(
      <ArtifactToolbar
        artifact={{ ...ARTIFACT, latestVersion: 1, versions: [1] }}
        version={1}
        hasHtml
        onSelectVersion={vi.fn()}
        onShare={vi.fn()}
        onExportPdf={vi.fn()}
        onDeleteVersion={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Delete this version' })).not.toBeInTheDocument()
  })
})
