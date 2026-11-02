import { HUBSPOT_LEVEL_LABELS } from '../../../constants.js'
import Section from '../Section/Section.jsx'
import PointList from '../PointList/PointList.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import './HubspotSection.css'

const POINTS = [
  'Contacts, companies, deals, tickets, products and your custom objects — by free text or any property, with the records each one is linked to',
  'The timeline of a record — notes, calls, emails, meetings and tasks — plus lists, inbox conversations and marketing campaigns',
  'Creates and updates records, logs a call or a note and links records — it shows you the change first and only makes it once you say yes',
  'Every note, call, meeting or task it writes is signed “Via Soporti” with the name of who asked for it',
  'Off, read, write or full for each area in /admin: a tool you have not allowed does not exist for the assistant, and /admin lists the exact scopes the key needs',
  'Replies to a customer go out as your own HubSpot user, only from the web chat — never from Slack, MCP or a scheduled run',
]

const AREAS = [
  { name: 'Contacts', levels: ['off', 'read', 'write', 'full'], value: 'read' },
  { name: 'Deals', levels: ['off', 'read', 'write', 'full'], value: 'write' },
  { name: 'Activities', levels: ['off', 'read', 'write', 'full'], value: 'write' },
  { name: 'Conversations', levels: ['off', 'read', 'reply'], value: 'read' },
  { name: 'Marketing', levels: ['off', 'read'], value: 'off' },
]

const REQUEST = 'Log this call on the ACME deal: they want to move to the annual plan in January'
const DRAFT_TARGET = 'Call · ACME — Annual renewal'
const SIGNATURE = 'Via Soporti · Ana'
const DRAFT_BODY = 'They want to move to the annual plan in January.'

export default function HubspotSection() {
  return (
    <Section id="hubspot" className="lp-section--white">
      <div className="lp-split lp-split--reverse">
        <div className="lp-section__head">
          <span className="lp-eyebrow">HubSpot</span>
          <h2 className="lp-h2">
            Ask and update the CRM <em>without leaving Soporti</em>.
          </h2>
          <p className="lp-lead">
            Paste a HubSpot Service Key in <strong>/admin</strong> and choose, area by area, what the assistant may do.
            It finds the customer, reads what happened on the account and, where you allow it, makes the change for you
            in the same conversation where you worked out what went wrong.
          </p>
          <PointList points={POINTS} />
        </div>

        <div className="lp-split__visual lp-hubspot">
          <div className="card lp-hubspot__levels">
            <span className="lp-preview-window__hint">/admin → HubSpot</span>
            <ul className="lp-hubspot__areas">
              {AREAS.map(area => (
                <li className="lp-hubspot__area" key={area.name}>
                  <span className="lp-hubspot__area-name">{area.name}</span>
                  <span className="lp-hubspot__options">
                    {area.levels.map(level => (
                      <LevelOption key={level} level={level} selected={level === area.value} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <PreviewWindow badge="Waiting for your yes">
            <div className="lp-hubspot__chat">
              <div className="message message--user">
                <div className="message__bubble message__bubble--user">{REQUEST}</div>
              </div>
              <div className="message message--assistant">
                <div className="message__bubble message__bubble--assistant lp-hubspot__answer">
                  <span>This is the call I will log on the deal:</span>
                  <div className="note lp-hubspot__draft">
                    <strong>{DRAFT_TARGET}</strong>
                    <span className="lp-hubspot__signature">{SIGNATURE}</span>
                    <span>{DRAFT_BODY}</span>
                  </div>
                  <span>Shall I log it?</span>
                </div>
              </div>
            </div>
          </PreviewWindow>
        </div>
      </div>
    </Section>
  )
}

function LevelOption({ level, selected }) {
  const variant = selected ? 'btn--primary' : 'btn--secondary'

  return <span className={`btn btn--sm ${variant}`}>{HUBSPOT_LEVEL_LABELS[level]}</span>
}
