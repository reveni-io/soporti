import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProductionStatus from './ProductionStatus.jsx'

describe('ProductionStatus', () => {
  it('shows the latest version with its status, phase and progress', () => {
    const version = { version: 2, status: 'running', phase: 'music', progress: 55, step: 'Mixing', error: null }

    render(<ProductionStatus version={version} queuePosition={null} />)

    expect(screen.getByRole('heading', { name: 'Version 2' })).toBeInTheDocument()
    expect(screen.getByText('Generating · Music · 55%')).toBeInTheDocument()
    expect(screen.getByText('Mixing')).toBeInTheDocument()
  })

  it('shows the place in the queue', () => {
    const version = { version: 1, status: 'queued', phase: null, progress: null, step: null, error: null }

    render(<ProductionStatus version={version} queuePosition={3} />)

    expect(screen.getByText('Queued')).toBeInTheDocument()
    expect(screen.getByText('Position 3 in the queue.')).toBeInTheDocument()
  })

  it('shows why the version failed', () => {
    const version = { version: 1, status: 'failed', phase: null, progress: null, step: null, error: 'Render crashed.' }

    render(<ProductionStatus version={version} queuePosition={null} />)

    expect(screen.getByText('Render crashed.')).toBeInTheDocument()
  })

  it('waits for the first version', () => {
    render(<ProductionStatus version={undefined} queuePosition={null} />)

    expect(screen.getByText('Preparing the first version…')).toBeInTheDocument()
  })
})
