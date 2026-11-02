import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import LivePreview from './LivePreview.jsx'

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const BUNDLE = '<!doctype html><html><body><div id="stage"></div></body></html>'

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('LivePreview', () => {
  it('runs the preview bundle in a sandbox that only allows scripts', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ html: BUNDLE }))

    render(<LivePreview token="tok" videoId={VIDEO_ID} version={2} format="9:16" onLogout={vi.fn()} />)

    expect(screen.getByText('Loading the live preview…')).toBeInTheDocument()
    const frame = await screen.findByTitle('Live preview of version 2')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame).toHaveAttribute('srcdoc', BUNDLE)
    expect(frame.parentElement).toHaveClass('screen-frame--tall')
    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}/versions/2/preview`)
  })

  it('shows why the preview could not be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ error: 'The preview is not ready yet.' }, 409))

    render(<LivePreview token="tok" videoId={VIDEO_ID} version={1} format="16:9" onLogout={vi.fn()} />)

    expect(await screen.findByText('The preview is not ready yet.')).toBeInTheDocument()
    expect(screen.queryByTitle('Live preview of version 1')).toBeNull()
  })
})
