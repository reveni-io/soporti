import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CsvBlock from './CsvBlock.jsx'

const CSV = 'id,name,total\n1,"Acme, Inc.",1200\n2,Globex,980'

describe('CsvBlock', () => {
  it('renders a table with the header and data rows', () => {
    render(<CsvBlock csv={CSV} />)
    expect(screen.getByText('id')).toBeInTheDocument()
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('Acme, Inc.')).toBeInTheDocument()
    expect(screen.getByText('Globex')).toBeInTheDocument()
  })

  it('shows a row/column summary', () => {
    render(<CsvBlock csv={CSV} />)
    expect(screen.getByText('2 rows · 3 columns')).toBeInTheDocument()
  })

  it('uses singular labels for a single row and column', () => {
    render(<CsvBlock csv={'name\nAcme'} />)
    expect(screen.getByText('1 row · 1 column')).toBeInTheDocument()
  })

  it('renders the download button by default', () => {
    render(<CsvBlock csv={CSV} />)
    expect(screen.getByRole('button', { name: /download csv/i })).toBeInTheDocument()
  })

  it('hides the download button when canDownload is false', () => {
    render(<CsvBlock csv={CSV} canDownload={false} />)
    expect(screen.queryByRole('button', { name: /download csv/i })).not.toBeInTheDocument()
  })

  it('renders nothing for empty content', () => {
    const { container } = render(<CsvBlock csv={'   '} />)
    expect(container.querySelector('.csv-block')).toBeNull()
  })

  it('truncates the preview and notes hidden rows', () => {
    const rows = ['col']
    for (let i = 0; i < 60; i++) rows.push(String(i))
    render(<CsvBlock csv={rows.join('\n')} />)
    expect(screen.getByText(/and 10 more rows/i)).toBeInTheDocument()
  })

  describe('download', () => {
    let clickSpy

    beforeEach(() => {
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock')
      globalThis.URL.revokeObjectURL = vi.fn()
      clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('triggers a CSV download with the raw content', async () => {
      const user = userEvent.setup()
      render(<CsvBlock csv={CSV} />)

      await user.click(screen.getByRole('button', { name: /download csv/i }))

      expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1)
      const blob = globalThis.URL.createObjectURL.mock.calls[0][0]
      expect(blob.type).toContain('text/csv')
      expect(await blob.text()).toBe(CSV)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    })
  })
})
