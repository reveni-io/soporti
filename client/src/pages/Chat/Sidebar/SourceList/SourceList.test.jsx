import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { YOLO_SOURCE } from '../../../../constants.js'
import SourceList from './SourceList.jsx'

const BASE_PROPS = {
  repos: [{ fullName: 'org/app', description: 'Main app', language: 'JavaScript' }],
  integrations: [{ id: 'notion', name: 'Notion', description: 'Search Notion' }],
  yoloMatches: true,
  selectedSources: [],
  onToggleSource: vi.fn(),
  loadingRepos: false,
  reposError: null,
}

describe('SourceList', () => {
  it('lists yolo, then the integrations, then the repos', () => {
    const { container } = render(<SourceList {...BASE_PROPS} onToggleSource={vi.fn()} />)

    const names = [...container.querySelectorAll('.sidebar__source-name')].map(node => node.textContent)
    expect(names).toEqual(['YOLO (auto)', 'Notion', 'org/app'])
  })

  it('hides the yolo entry when the search filtered it out', () => {
    render(<SourceList {...BASE_PROPS} yoloMatches={false} onToggleSource={vi.fn()} />)

    expect(screen.queryByText('YOLO (auto)')).not.toBeInTheDocument()
  })

  it('toggles the yolo source by its constant', async () => {
    const onToggleSource = vi.fn()
    const user = userEvent.setup()
    render(<SourceList {...BASE_PROPS} onToggleSource={onToggleSource} />)

    await user.click(screen.getByText('YOLO (auto)'))

    expect(onToggleSource).toHaveBeenCalledWith(YOLO_SOURCE)
  })

  it('toggles an integration by its prefixed key', async () => {
    const onToggleSource = vi.fn()
    const user = userEvent.setup()
    render(<SourceList {...BASE_PROPS} onToggleSource={onToggleSource} />)

    await user.click(screen.getByText('Notion'))

    expect(onToggleSource).toHaveBeenCalledWith('integration:notion')
  })

  it('toggles a repo by its full name', async () => {
    const onToggleSource = vi.fn()
    const user = userEvent.setup()
    render(<SourceList {...BASE_PROPS} onToggleSource={onToggleSource} />)

    await user.click(screen.getByText('org/app'))

    expect(onToggleSource).toHaveBeenCalledWith('org/app')
  })

  it('marks the selected sources', () => {
    const { container } = render(
      <SourceList {...BASE_PROPS} selectedSources={['org/app', 'integration:notion']} onToggleSource={vi.fn()} />
    )

    expect(container.querySelectorAll('.sidebar__source--selected')).toHaveLength(2)
  })

  it('shows the repo loading row while repos are pending', () => {
    render(<SourceList {...BASE_PROPS} repos={[]} loadingRepos onToggleSource={vi.fn()} />)

    expect(screen.getByText('Loading repos...')).toBeInTheDocument()
  })

  it('shows the repo error', () => {
    render(<SourceList {...BASE_PROPS} repos={[]} reposError="Network error" onToggleSource={vi.fn()} />)

    expect(screen.getByText('Network error')).toBeInTheDocument()
  })
})
