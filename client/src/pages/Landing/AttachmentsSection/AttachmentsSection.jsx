import Section from '../Section/Section.jsx'
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS } from '../../../constants.js'

const FORMATS = ATTACHMENT_ACCEPT.split(',')

export default function AttachmentsSection() {
  return (
    <Section id="attachments" className="lp-section--warm">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Bring your own documents</span>
        <h2 className="lp-h2">Attach the spec instead of pasting it.</h2>
        <p className="lp-lead">
          Drag a PDF, a Word document or an Excel sheet onto the message box — or pick it with the paperclip — and
          Soporti reads it as context for that conversation, tables and sheets included. No copy-pasting, no structure
          lost on the way.
        </p>
        <ul className="lp-points">
          <li>Up to {MAX_ATTACHMENTS} files per message, read the moment you drop them</li>
          <li>The text stays in that conversation — nothing is indexed or shared with your other chats</li>
          <li>A very long document is cut at a safe size, and the file says so right in the chat</li>
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
