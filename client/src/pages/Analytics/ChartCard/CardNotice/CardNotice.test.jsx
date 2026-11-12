import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CardNotice from './CardNotice.jsx'

describe('CardNotice', () => {
  it('shows the message with its actions', () => {
    render(
      <CardNotice message="The chart could not be generated.">
        <button type="button">Try again</button>
      </CardNotice>
    )

    expect(screen.getByText('The chart could not be generated.')).not.toHaveClass('card-notice__message--code')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('sets a database message in monospace under its heading', () => {
    render(
      <CardNotice heading="The query failed" message='column "totl" does not exist' isCode>
        <button type="button">Edit SQL</button>
      </CardNotice>
    )

    expect(screen.getByText('The query failed')).toBeInTheDocument()
    expect(screen.getByText('column "totl" does not exist')).toHaveClass('card-notice__message--code')
  })
})
