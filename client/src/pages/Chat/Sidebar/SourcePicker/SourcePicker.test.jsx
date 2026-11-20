import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { YOLO_SOURCE } from '../../../../constants.js'
import SourcePicker from './SourcePicker.jsx'

const REPOS = {
  repos: [
    { fullName: 'org/app', description: 'Main app', language: 'JavaScript' },
    { fullName: 'org/lib', description: 'Library', language: 'TypeScript' },
  ],
  loading: false,
  error: null,
}
const INTEGRATIONS = [{ id: 'notion', name: 'Notion', description: 'Search Notion', selectable: true }]

describe('SourcePicker', () => {
  it('lists the automatic mode, the integrations and the repos', () => {
    render(
      <SourcePicker
        selectedSources={[YOLO_SOURCE]}
        onToggleSource={vi.fn()}
        selectedProfile="support"
        onSelectProfile={vi.fn()}
        repos={REPOS}
        integrations={INTEGRATIONS}
      />
    )

    expect(screen.getByRole('button', { name: /yolo \(auto\)/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /notion/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /org\/lib/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Support' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('narrows the sources to the search and toggles one', async () => {
    const onToggleSource = vi.fn()
    const user = userEvent.setup()
    render(
      <SourcePicker
        selectedSources={[]}
        onToggleSource={onToggleSource}
        selectedProfile="support"
        onSelectProfile={vi.fn()}
        repos={REPOS}
        integrations={INTEGRATIONS}
      />
    )

    await user.type(screen.getByRole('textbox', { name: 'Search sources' }), 'lib')
    expect(screen.queryByRole('button', { name: /org\/app/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /org\/lib/ }))

    expect(onToggleSource).toHaveBeenCalledTimes(1)
    expect(onToggleSource).toHaveBeenCalledWith('org/lib')
  })

  it('switches the profile', async () => {
    const onSelectProfile = vi.fn()
    const user = userEvent.setup()
    render(
      <SourcePicker
        selectedSources={[]}
        onToggleSource={vi.fn()}
        selectedProfile="support"
        onSelectProfile={onSelectProfile}
        repos={REPOS}
        integrations={INTEGRATIONS}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Tech' }))

    expect(onSelectProfile).toHaveBeenCalledTimes(1)
    expect(onSelectProfile).toHaveBeenCalledWith('tech')
  })

  it('says when the token reaches no repo', () => {
    render(
      <SourcePicker
        selectedSources={[]}
        onToggleSource={vi.fn()}
        selectedProfile="support"
        onSelectProfile={vi.fn()}
        repos={{ repos: [], loading: false, error: null }}
        integrations={[]}
      />
    )

    expect(screen.getByText('No repos found for this GitHub token.')).toBeInTheDocument()
  })
})
