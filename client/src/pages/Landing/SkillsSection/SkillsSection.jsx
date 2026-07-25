import Section from '../Section/Section.jsx'
import SkillsPreview from '../SkillsPreview/SkillsPreview.jsx'

const COMMANDS = ['/triage-ticket', '/trace-order', '/code-review', '/explain-like-support']

export default function SkillsSection() {
  return (
    <Section id="skills" className="lp-section--cool">
      <div className="lp-split lp-split--reverse">
        <div>
          <span className="lp-eyebrow">Skills</span>
          <h2 className="lp-h2">
            Turn your team&apos;s playbooks into <em>/commands</em>.
          </h2>
          <p className="lp-lead">
            A skill is a saved set of instructions — a triage checklist, a review rubric, a way of talking to customers.
            Start a message with <strong>/skill-name</strong> and Soporti follows it for the rest of that conversation.
            Custom instructions are always on; skills are opt-in, one chat at a time.
          </p>
          <ul className="lp-points">
            <li>Autocomplete as soon as you type “/” — no need to remember the exact name</li>
            <li>
              <code>$ARGUMENTS</code> and <code>$1…$9</code> drop what you typed into the instructions
            </li>
            <li>A skill outranks the default style rules, so “interview me first” really does wait for you</li>
            <li>Every message shows the skill it ran — click the badge to read it</li>
          </ul>
          <div className="lp-tags">
            {COMMANDS.map(command => (
              <span key={command} className="lp-qcard__tag lp-qcard__tag--cmd">
                {command}
              </span>
            ))}
          </div>
        </div>
        <div className="lp-split__visual">
          <SkillsPreview />
        </div>
      </div>
    </Section>
  )
}
