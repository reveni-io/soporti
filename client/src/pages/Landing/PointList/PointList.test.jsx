import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PointList from './PointList.jsx'

describe('PointList', () => {
  it('renders one item per point, in order', () => {
    render(<PointList points={['Matches the title', 'Shows the line that matched']} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Matches the title')
    expect(items[1]).toHaveTextContent('Shows the line that matched')
  })
})
