import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ToolsTable from './ToolsTable.jsx'

describe('ToolsTable', () => {
  it('lists the tools with their call count', () => {
    render(
      <ToolsTable
        tools={[
          { tool: 'get_file_contents', calls: 1200 },
          { tool: 'query_database', calls: 34 },
        ]}
      />
    )

    expect(screen.getByText('get_file_contents')).toBeInTheDocument()
    expect(screen.getByText('1,200')).toBeInTheDocument()
    expect(screen.getByText('query_database')).toBeInTheDocument()
    expect(screen.getByText('34')).toBeInTheDocument()
  })

  it('says so when the ranking could not be loaded', () => {
    render(<ToolsTable tools={null} />)

    expect(screen.getByText('The tool ranking is unavailable right now.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an empty state when no tool was called', () => {
    render(<ToolsTable tools={[]} />)

    expect(screen.getByText('No tool calls recorded yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
