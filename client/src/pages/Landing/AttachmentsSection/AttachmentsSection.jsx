import Section from '../Section/Section.jsx'
import { ATTACHMENT_ACCEPT, IMAGE_RETENTION_DAYS, MAX_ATTACHMENTS } from '../../../constants.js'

const FORMATS = ATTACHMENT_ACCEPT.split(',')

export default function AttachmentsSection() {
  return (
    <Section id="attachments" className="lp-section--warm">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Bring your own documents and screenshots</span>
        <h2 className="lp-h2">Show it instead of describing it.</h2>
        <p className="lp-lead">
          Drag a PDF, a Word document or an Excel sheet onto the message box — or paste a screenshot with{' '}
          <code>Cmd+V</code> — and Soporti reads it as context for that conversation, tables and sheets included. The
          error screen, the broken checkout, the dashboard that looks wrong: it looks at the image itself, so you do not
          have to put it into words.
        </p>
        <ul className="lp-points">
          <li>Up to {MAX_ATTACHMENTS} files per message, read the moment you drop them</li>
          <li>The text stays in that conversation — nothing is indexed or shared with your other chats</li>
          <li>A very long document is cut at a safe size, and the file says so right in the chat</li>
          <li>A photo straight off your phone is resized in the browser — no exporting or cropping first</li>
          <li>
            Screenshots stay available for {IMAGE_RETENTION_DAYS} days so reopening the conversation still shows them
          </li>
        </ul>
        <div className="lp-tags">
          {FORMATS.map(format => (
            <span key={format} className="lp-qcard__tag lp-qcard__tag--cmd">
              {format}
            </span>
          ))}
        </div>
      </div>
    </Section>
  )
}
