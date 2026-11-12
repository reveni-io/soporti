import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NumberTile from './NumberTile.jsx'

describe('NumberTile', () => {
  it('shows the value alone when it has no label', () => {
    const { container } = render(<NumberTile label="" value={128} />)

    expect(container.querySelector('.number-tile__label')).toBeNull()
    expect(screen.getByText('128')).toHaveClass('number-tile__value')
  })

  it('shows the label above the value', () => {
    render(<NumberTile label="Open tickets" value={128} />)

    expect(screen.getByText('Open tickets')).toHaveClass('number-tile__label')
    expect(screen.getByText('128')).toHaveClass('number-tile__value')
  })

  it('compacts a value from ten thousand up and keeps the exact one in the title', () => {
    render(<NumberTile label="Open tickets" value={12949} />)

    expect(screen.getByText('12.9K')).toHaveAttribute('title', '12,949')
  })

  it('compacts millions', () => {
    render(<NumberTile label="Revenue" value={4213877.5} />)

    expect(screen.getByText('4.2M')).toHaveAttribute('title', '4,213,877.5')
  })

  it('writes a value under ten thousand in full', () => {
    render(<NumberTile label="Orders" value={1284} />)

    expect(screen.getByText('1,284')).toHaveAttribute('title', '1,284')
  })

  it('keeps the decimals of a small figure', () => {
    render(<NumberTile label="Average rating" value={4.37} />)

    expect(screen.getByText('4.37')).toBeInTheDocument()
  })

  it('shows a value that is not a number as text', () => {
    render(<NumberTile label="Top category" value="Home & Garden" />)

    expect(screen.getByText('Home & Garden')).toHaveAttribute('title', 'Home & Garden')
  })

  it('tells the stylesheet how many characters must fit', () => {
    render(<NumberTile label="Top category" value="Home & Garden" />)

    expect(screen.getByText('Home & Garden').style.getPropertyValue('--number-tile-length')).toBe('13')
  })

  it('does not let a one-digit figure grow past a three-character fit', () => {
    render(<NumberTile label="Incidents" value={7} />)

    expect(screen.getByText('7').style.getPropertyValue('--number-tile-length')).toBe('3')
  })
})
