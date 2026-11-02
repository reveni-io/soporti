import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ContactSheets from './ContactSheets.jsx'

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

const FRAMES = [
  { id: 7, times: [0, 2, 4, 6], createdAt: '2026-10-30T10:05:00Z' },
  { id: 9, times: [10, 12, 14], createdAt: '2026-10-30T10:09:00Z' },
]

beforeEach(() => {
  vi.restoreAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:frame')
  URL.revokeObjectURL = vi.fn()
})

describe('ContactSheets', () => {
  it('shows the contact sheets newest first, each fetched with the token', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['png']) })

    render(<ContactSheets videoId={VIDEO_ID} frames={FRAMES} token="tok" onLogout={vi.fn()} />)

    const captions = screen.getAllByText(/frames$/).map(caption => caption.textContent)
    expect(captions).toEqual(['0:10–0:14 · 3 frames', '0:00–0:06 · 4 frames'])
    expect(await screen.findByAltText('Contact sheet of 0:10–0:14 · 3 frames')).toHaveAttribute('src', 'blob:frame')
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    expect(global.fetch.mock.calls.map(([url]) => url).sort()).toEqual([
      `/api/videos/${VIDEO_ID}/frames/7`,
      `/api/videos/${VIDEO_ID}/frames/9`,
    ])
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('says where the frames will appear before the first review', () => {
    global.fetch = vi.fn()

    render(<ContactSheets videoId={VIDEO_ID} frames={[]} token="tok" onLogout={vi.fn()} />)

    expect(screen.getByText('The frames Soporti reviews appear here as it composes.')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
