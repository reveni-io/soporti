import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { YOLO_SOURCE } from '../../../constants.js'
import SourcesSheet from './SourcesSheet.jsx'

const REPOS = {
  repos: [{ fullName: 'org/app', description: 'Main app', language: 'JavaScript' }],
  loading: false,
  error: null,
}

describe('SourcesSheet', () => {
  it('picks the sources and the profile in a dialog', async () => {
    const onToggleSource = vi.fn()
    const onSelectProfile = vi.fn()
    const user = userEvent.setup()
    render(
      <SourcesSheet
        selectedSources={[YOLO_SOURCE]}
        onToggleSource={onToggleSource}
        selectedProfile="support"
        onSelectProfile={onSelectProfile}
        repos={REPOS}
        integrations={[]}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Answer with' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /org\/app/ }))
    await user.click(screen.getByRole('button', { name: 'Tech' }))

    expect(onToggleSource).toHaveBeenCalledWith('org/app')
    expect(onSelectProfile).toHaveBeenCalledWith('tech')
  })

  it('closes from its done button', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <SourcesSheet
        selectedSources={[YOLO_SOURCE]}
        onToggleSource={vi.fn()}
        selectedProfile="support"
        onSelectProfile={vi.fn()}
        repos={REPOS}
        integrations={[]}
        onClose={onClose}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
