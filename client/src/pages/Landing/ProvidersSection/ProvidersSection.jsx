import Section from '../Section/Section.jsx'
import { LLM_PROVIDERS } from './providers.js'

export default function ProvidersSection() {
  return (
    <Section id="providers" className="lp-section--cool">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Bring your own model</span>
        <h2 className="lp-h2">Runs on the LLM provider your company already trusts.</h2>
        <p className="lp-lead">
          Pick the provider in <strong>/admin</strong>, paste its API key and name any model that key can reach — there
          is no allowlist to wait on. Credentials live in your own database, never an env var, and switching takes
          effect on the next message with no redeploy.
        </p>
      </div>
      <div className="lp-prov__grid">
        {LLM_PROVIDERS.map(provider => (
          <div className="lp-prov" key={provider.id}>
            <div className="lp-prov__name">{provider.name}</div>
            <div className="lp-prov__desc">{provider.desc}</div>
          </div>
        ))}
      </div>
      <p className="lp-prov__note">
        More providers land here as they are added. The optional knowledge base runs on OpenAI Vector Stores whichever
        provider you pick, so it takes an OpenAI key of its own when the assistant is on Anthropic.
      </p>
    </Section>
  )
}
