import Section from '../Section/Section.jsx'
import ArtifactsPreview from '../ArtifactsPreview/ArtifactsPreview.jsx'

export default function ArtifactsSection() {
  return (
    <Section id="artifacts" className="lp-section--warm">
      <div className="lp-split">
        <div>
          <span className="lp-eyebrow">Artifacts</span>
          <h2 className="lp-h2">When an answer is a deliverable, it opens beside the chat.</h2>
          <p className="lp-lead">
            Ask for a deliverable — an incident report, a runbook, a migration guide, or a dashboard you can filter —
            and Soporti builds it as a small self-contained page and opens it in a panel next to the conversation. Ask
            for a change and it publishes a new version, so you can flip back to the previous one whenever you want.
          </p>
          <ul className="lp-points">
            <li>Built from real data: it runs your queries first, then bakes the results into the page</li>
            <li>
              Every revision is a version you can switch between — or delete on its own when it no longer earns its
              place
            </li>
            <li>Any version exports as a PDF from the panel, its own page or a shared link</li>
            <li>Opens on its own page too, and a temporary link shares it with anyone — no account needed</li>
            <li>Typeset with the app&apos;s own design system, and charts drawn by the same library as the chat</li>
            <li>
              Runs sandboxed on its own origin: it cannot reach your session, and a strict content policy blocks every
              fetch — only the app&apos;s fonts load
            </li>
          </ul>
        </div>
        <div className="lp-split__visual">
          <ArtifactsPreview />
        </div>
      </div>
    </Section>
  )
}
