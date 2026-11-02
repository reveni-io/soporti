import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import HubspotSection from './HubspotSection.jsx'

describe('HubspotSection', () => {
  it('leads with asking and updating the CRM from Soporti', () => {
    render(<HubspotSection />)

    expect(screen.getByRole('heading', { name: /Ask and update the CRM without leaving Soporti/ })).toBeInTheDocument()
    expect(screen.getByText('/admin')).toBeInTheDocument()
    expect(screen.getByText(/choose, area by area, what the assistant may do/)).toBeInTheDocument()
  })

  it('lists what it reads, how it writes and who it writes as', () => {
    const { container } = render(<HubspotSection />)

    expect(container.querySelectorAll('.lp-points li')).toHaveLength(6)
    expect(screen.getByText(/The timeline of a record/)).toBeInTheDocument()
    expect(screen.getByText(/only makes it once you say yes/)).toBeInTheDocument()
    expect(screen.getByText(/signed “Via Soporti” with the name of who asked for it/)).toBeInTheDocument()
    expect(screen.getByText(/a tool you have not allowed does not exist for the assistant/)).toBeInTheDocument()
    expect(screen.getByText(/only from the web chat — never from Slack, MCP or a scheduled run/)).toBeInTheDocument()
  })

  it('shows one level picked per area, offering only the levels each area has', () => {
    const { container } = render(<HubspotSection />)
    const areas = [...container.querySelectorAll('.lp-hubspot__area')]
    const levelsOf = name => {
      const area = areas.find(row => within(row).queryByText(name))
      return [...area.querySelectorAll('.btn')].map(option => option.textContent)
    }
    const pickedOf = name => {
      const area = areas.find(row => within(row).queryByText(name))
      return [...area.querySelectorAll('.btn--primary')].map(option => option.textContent)
    }

    expect(areas).toHaveLength(5)
    expect(levelsOf('Deals')).toEqual(['Off', 'Read', 'Write', 'Full'])
    expect(pickedOf('Deals')).toEqual(['Write'])
    expect(levelsOf('Conversations')).toEqual(['Off', 'Read', 'Reply'])
    expect(levelsOf('Marketing')).toEqual(['Off', 'Read'])
    expect(pickedOf('Marketing')).toEqual(['Off'])
  })

  it('shows a signed call draft waiting for a yes', () => {
    render(<HubspotSection />)

    expect(screen.getByText(/Log this call on the ACME deal/)).toBeInTheDocument()
    expect(screen.getByText('Via Soporti · Ana')).toBeInTheDocument()
    expect(screen.getByText('Waiting for your yes')).toBeInTheDocument()
    expect(screen.getByText('Shall I log it?')).toBeInTheDocument()
  })

  it('is anchored so the page can link to it', () => {
    const { container } = render(<HubspotSection />)

    expect(container.querySelector('#hubspot')).toBeInTheDocument()
  })
})
