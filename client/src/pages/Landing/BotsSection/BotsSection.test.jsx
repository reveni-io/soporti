import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import BotsSection from './BotsSection.jsx'

describe('BotsSection', () => {
  it('explains that a bot keeps doing a job described once', () => {
    render(<BotsSection />)

    expect(
      screen.getByRole('heading', { name: 'Describe a job once. A bot keeps doing it on schedule.' })
    ).toBeInTheDocument()
    expect(screen.getByText(/a single chat that never expires/i)).toBeInTheDocument()
  })

  it('lists privacy, the greeting, routines from the chat, results in its chat, every integration and silent runs', () => {
    const { container } = render(<BotsSection />)

    expect(container.querySelectorAll('.lp-points li')).toHaveLength(6)
    expect(screen.getByText(/private to you: a name, a description of its job/i)).toBeInTheDocument()
    expect(screen.getByText(/it greets you from its description/i)).toBeInTheDocument()
    expect(screen.getByText(/it creates the routine from the chat/i)).toBeInTheDocument()
    expect(screen.getByText(/an unread dot tells you which bot has news/i)).toBeInTheDocument()
    expect(screen.getByText(/every integration you configured, unattended/i)).toBeInTheDocument()
    expect(screen.getByText(/stays silent when there is nothing new/i)).toBeInTheDocument()
  })

  it('heads the chat with the bot avatar, name and description', () => {
    const { container } = render(<BotsSection />)

    const head = container.querySelector('.lp-bots__head')

    expect(head.querySelector('img')).toHaveAttribute('width', '36')
    expect(within(head).getByText('Ticket Triage')).toBeInTheDocument()
    expect(within(head).getByText(/keeps an eye on the new zendesk tickets/i)).toBeInTheDocument()
    expect(within(head).getByText('Routines')).toBeInTheDocument()
  })

  it('shows the greeting, a routine request and the bot confirming the schedule', () => {
    render(<BotsSection />)

    const chat = screen.getByRole('list', { name: 'Chat with Ticket Triage' })

    expect(within(chat).getByText(/^Hi! I’m Ticket Triage/)).toBeInTheDocument()
    expect(within(chat).getByText(/every weekday at 17:00, go through the day’s new tickets/i)).toBeInTheDocument()
    expect(within(chat).getByText(/I created the routine/)).toHaveTextContent(
      'Done. I created the routine Daily ticket sweep: every weekday at 17:00 (Europe/Madrid). The first run is today.'
    )
  })

  it('posts the routine result into the chat, tagged with the routine and marked unread', () => {
    const { container } = render(<BotsSection />)

    const report = container.querySelector('.lp-bots__report')

    expect(within(report).getByText('Routine · Daily ticket sweep')).toBeInTheDocument()
    expect(within(report).getByText('Today, 17:00')).toBeInTheDocument()
    expect(within(report).getByText('14 new tickets today, 2 of them urgent:')).toBeInTheDocument()
    expect(within(report).getAllByRole('listitem')).toHaveLength(2)
    expect(report.querySelector('.lp-bots__unread')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-bots__unread')).toHaveLength(1)
  })

  it('is anchored so the nav can link to it', () => {
    const { container } = render(<BotsSection />)

    expect(container.querySelector('#bots')).toBeInTheDocument()
  })
})
