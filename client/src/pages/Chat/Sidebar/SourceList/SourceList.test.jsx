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
    render(<SourceList {...BASE_PROPS} onToggleSource={vi.fn()} />)

    const sources = screen.getAllByRole('button')
    expect(sources).toHaveLength(3)
    expect(sources[0]).toHaveTextContent(/^YOLO \(auto\)/)
    expect(sources[1]).toHaveTextContent(/^Notion/)
    expect(sources[2]).toHaveTextContent(/^org\/app/)
  })

  it('shows the logo of each integration and the github mark on repos', () => {
    render(<SourceList {...BASE_PROPS} onToggleSource={vi.fn()} />)

    const [yolo, notion, repo] = screen.getAllByRole('button')
    expect(yolo.querySelector('[data-icon="zap"]')).toBeInTheDocument()
    expect(notion.querySelector('[data-icon="notion"]')).toBeInTheDocument()
    expect(repo.querySelector('[data-icon="github"]')).toBeInTheDocument()
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
    render(<SourceList {...BASE_PROPS} selectedSources={['org/app', 'integration:notion']} onToggleSource={vi.fn()} />)

    expect(screen.getByRole('button', { name: /org\/app/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /notion/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /yolo/i })).toHaveAttribute('aria-pressed', 'false')
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
