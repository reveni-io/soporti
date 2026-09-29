import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConversationsPanel from './ConversationsPanel.jsx'

describe('ConversationsPanel', () => {
  it('labels the panel and renders its content', () => {
    render(
      <ConversationsPanel>
        <p>Why did the payout fail?</p>
      </ConversationsPanel>
    )

    expect(screen.getByText('Conversations')).toBeInTheDocument()
    expect(screen.getByText('Why did the payout fail?')).toBeInTheDocument()
  })
})
