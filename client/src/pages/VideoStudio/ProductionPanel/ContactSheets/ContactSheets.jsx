import { useCallback } from 'react'
import { getVideoFrame } from '../../../../services/services.js'
import { useBlobUrl } from '../../../../hooks/useBlobUrl/useBlobUrl.js'
import { formatTimecode } from '../../format-timecode.js'
import './ContactSheets.css'

function newestFirst(frames) {
  return [...frames].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function describeTimes(times) {
  return `${formatTimecode(times[0])}–${formatTimecode(times[times.length - 1])} · ${times.length} frames`
}

export default function ContactSheets({ videoId, frames, token, onLogout }) {
  if (frames.length === 0) {
    return <p className="contact-sheets__empty">The frames Soporti reviews appear here as it composes.</p>
  }

  return (
    <section className="contact-sheets" aria-label="Contact sheets">
      <h3 className="contact-sheets__title">Frames Soporti reviewed</h3>
      <ul className="contact-sheets__list">
        {newestFirst(frames).map(frame => (
          <ContactSheet key={frame.id} videoId={videoId} frame={frame} token={token} onLogout={onLogout} />
        ))}
      </ul>
    </section>
  )
}

function ContactSheet({ videoId, frame, token, onLogout }) {
  const loadImage = useCallback(() => getVideoFrame(token, videoId, frame.id), [token, videoId, frame.id])
  const { url } = useBlobUrl(loadImage, onLogout)
  const caption = describeTimes(frame.times)

  return (
    <li>
      <figure className="contact-sheets__sheet">
        <SheetImage url={url} caption={caption} />
        <figcaption className="contact-sheets__caption">{caption}</figcaption>
      </figure>
    </li>
  )
}

function SheetImage({ url, caption }) {
  if (!url) return <div className="contact-sheets__placeholder" aria-hidden="true" />

  return <img className="contact-sheets__image" src={url} alt={`Contact sheet of ${caption}`} />
}
