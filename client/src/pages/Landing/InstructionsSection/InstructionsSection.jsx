import Section from '../Section/Section.jsx'
import SettingsPreview from '../SettingsPreview/SettingsPreview.jsx'

const TAGS = ['Your role', 'Response style', 'Language', 'Formatting']

export default function InstructionsSection() {
  return (
    <Section id="instructions" className="lp-section--white">
      <div className="lp-split">
        <div>
          <span className="lp-eyebrow">Make it yours</span>
          <h2 className="lp-h2">Teach Soporti how you work.</h2>
          <p className="lp-lead">
            Set your custom instructions once and they&apos;re added to every chat — your role, the response style you
            like, the language you prefer. Soporti keeps them in mind so answers fit you from the first message.
          </p>
          <div className="lp-tags">
            {TAGS.map(tag => (
              <span key={tag} className="lp-qcard__tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="lp-split__visual">
          <SettingsPreview />
        </div>
      </div>
    </Section>
  )
}
