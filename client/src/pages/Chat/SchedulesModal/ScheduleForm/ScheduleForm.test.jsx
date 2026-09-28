import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScheduleForm from './ScheduleForm.jsx'

const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ schedule: { id: 1 } }) })
})

const WEEKLY = {
  id: 4,
  question: 'Weekly summary',
  sources: ['reveni-io/soporti'],
  profile: 'tech',
  frequency: 'weekly',
  minute: 30,
  hour: 8,
  weekday: 5,
  monthDay: null,
  timezone: 'America/New_York',
}

function lastBody() {
  const [, options] = global.fetch.mock.calls.at(-1)
  return JSON.parse(options.body)
}

describe('ScheduleForm', () => {
  it('creates a daily schedule with the current sources, profile and time zone', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
        onSaved={onSaved}
      />
    )

    await user.type(screen.getByLabelText(/question/i), 'Which payments failed?')
    await user.selectOptions(screen.getByLabelText(/at hour/i), '7')
    await user.selectOptions(screen.getByLabelText('minute'), '15')
    await user.click(screen.getByRole('button', { name: /create schedule/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/schedules')
    expect(options.method).toBe('POST')
    expect(lastBody()).toMatchObject({
      question: 'Which payments failed?',
      sources: ['yolo'],
      profile: 'support',
      frequency: 'daily',
      hour: 7,
      minute: 15,
      timezone: BROWSER_TIMEZONE,
    })
  })

  it('sends the weekday of a weekly schedule', async () => {
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="tech"
        onSaved={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText(/question/i), 'Weekly summary')
    await user.selectOptions(screen.getByLabelText(/repeat/i), 'weekly')
    await user.selectOptions(screen.getByLabelText(/^on$/i), '5')
    await user.click(screen.getByRole('button', { name: /create schedule/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(lastBody()).toMatchObject({ frequency: 'weekly', weekday: 5 })
  })

  it('sends the day of the month of a monthly schedule', async () => {
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="tech"
        onSaved={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText(/question/i), 'Monthly summary')
    await user.selectOptions(screen.getByLabelText(/repeat/i), 'monthly')
    await user.selectOptions(screen.getByLabelText(/on day/i), '12')
    await user.click(screen.getByRole('button', { name: /create schedule/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(lastBody()).toMatchObject({ frequency: 'monthly', monthDay: 12 })
  })

  it('only asks for the minute of an hourly schedule', async () => {
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
        onSaved={vi.fn()}
      />
    )

    await user.selectOptions(screen.getByLabelText(/repeat/i), 'hourly')

    expect(screen.queryByLabelText(/at hour/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/at minute/i)).toBeInTheDocument()
  })

  it('keeps the submit button disabled until there is a question', async () => {
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
        onSaved={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /create schedule/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/question/i), 'Anything')

    expect(screen.getByRole('button', { name: /create schedule/i })).toBeEnabled()
  })

  it('shows which sources and profile the schedule will use', () => {
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['reveni-io/soporti']}
        selectedProfile="tech"
        onSaved={vi.fn()}
      />
    )

    expect(screen.getByText(/uses reveni-io\/soporti · tech profile/i)).toBeInTheDocument()
  })

  it('shows the server error and keeps the question', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'You can only have 20 scheduled queries.' }),
    })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
        onSaved={onSaved}
      />
    )

    await user.type(screen.getByLabelText(/question/i), 'One more')
    await user.click(screen.getByRole('button', { name: /create schedule/i }))

    expect(await screen.findByText('You can only have 20 scheduled queries.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/question/i)).toHaveValue('One more')
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={onLogout}
        selectedSources={['yolo']}
        selectedProfile="support"
        onSaved={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText(/question/i), 'Anything')
    await user.click(screen.getByRole('button', { name: /create schedule/i }))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
  })

  it('pre-fills the question, cadence, sources and profile of the schedule being edited', () => {
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
        schedule={WEEKLY}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Edit scheduled query' })).toBeInTheDocument()
    expect(screen.getByLabelText(/question/i)).toHaveValue('Weekly summary')
    expect(screen.getByLabelText(/repeat/i)).toHaveValue('weekly')
    expect(screen.getByLabelText(/^on$/i)).toHaveValue('5')
    expect(screen.getByLabelText(/at hour/i)).toHaveValue('8')
    expect(screen.getByLabelText('minute')).toHaveValue('30')
    expect(screen.getByText('Uses reveni-io/soporti · tech profile · America/New_York')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
  })

  it('saves the edited schedule in place with its stored sources, profile and time zone', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
        schedule={WEEKLY}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />
    )

    await user.clear(screen.getByLabelText(/question/i))
    await user.type(screen.getByLabelText(/question/i), 'Daily summary')
    await user.selectOptions(screen.getByLabelText(/repeat/i), 'daily')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/schedules/4')
    expect(options.method).toBe('PUT')
    expect(lastBody()).toMatchObject({
      question: 'Daily summary',
      sources: ['reveni-io/soporti'],
      profile: 'tech',
      frequency: 'daily',
      hour: 8,
      minute: 30,
      timezone: 'America/New_York',
    })
  })

  it('replaces the stored sources and profile with the current selection', async () => {
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
        schedule={WEEKLY}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /use current selection/i }))

    expect(screen.getByText('Uses YOLO (auto) · support profile · America/New_York')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    expect(lastBody()).toMatchObject({ sources: ['yolo'], profile: 'support' })
  })

  it('cancels the edit without saving', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
        schedule={WEEKLY}
        onSaved={vi.fn()}
        onCancel={onCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does not offer cancel or the current selection when creating', () => {
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
        onSaved={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'New scheduled query' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /use current selection/i })).not.toBeInTheDocument()
  })

  it('shows the server error when saving the edit fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Scheduled query not found.' }),
    })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(
      <ScheduleForm
        token="tok"
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
        schedule={WEEKLY}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText('Scheduled query not found.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/question/i)).toHaveValue('Weekly summary')
  })
})
