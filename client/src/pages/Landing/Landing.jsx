import { readStoredToken } from '../../context/AuthContext.jsx'
import { ROUTES } from '../../router/constants.js'
import AskSection from './AskSection/AskSection.jsx'
import ArtifactsSection from './ArtifactsSection/ArtifactsSection.jsx'
import AttachmentsSection from './AttachmentsSection/AttachmentsSection.jsx'
import AutomationsSection from './AutomationsSection/AutomationsSection.jsx'
import McpSection from './McpSection/McpSection.jsx'
import IntegrationsSection from './IntegrationsSection/IntegrationsSection.jsx'
import InstructionsSection from './InstructionsSection/InstructionsSection.jsx'
import LandingCta from './LandingCta/LandingCta.jsx'
import LandingFooter from './LandingFooter/LandingFooter.jsx'
import LandingHero from './LandingHero/LandingHero.jsx'
import LandingNav from './LandingNav/LandingNav.jsx'
import LmstfySection from './LmstfySection/LmstfySection.jsx'
import ProfilesSection from './ProfilesSection/ProfilesSection.jsx'
import ProvidersSection from './ProvidersSection/ProvidersSection.jsx'
import RendersSection from './RendersSection/RendersSection.jsx'
import SafetySection from './SafetySection/SafetySection.jsx'
import SkillsSection from './SkillsSection/SkillsSection.jsx'
import SlackSection from './SlackSection/SlackSection.jsx'
import SubagentsSection from './SubagentsSection/SubagentsSection.jsx'
import StatsSection from './StatsSection/StatsSection.jsx'
import './Landing.css'

const LOGGED_IN_CTA = { href: ROUTES.CHAT, label: 'Open Soporti' }
const LOGGED_OUT_CTA = { href: ROUTES.LOGIN, label: 'Log in' }

export default function Landing({ hideCta = false }) {
  const cta = readStoredToken() ? LOGGED_IN_CTA : LOGGED_OUT_CTA
  const visibleCta = hideCta ? null : cta

  return (
    <div className="lp">
      <LandingNav cta={visibleCta} />
      <LandingHero cta={visibleCta} />
      <StatsSection />
      <AskSection />
      <RendersSection />
      <ArtifactsSection />
      <IntegrationsSection />
      <SlackSection />
      <AttachmentsSection />
      <ProvidersSection />
      <SubagentsSection />
      <ProfilesSection />
      <InstructionsSection />
      <SkillsSection />
      <AutomationsSection />
      <McpSection />
      <LmstfySection />
      <SafetySection />
      <LandingCta cta={visibleCta} />
      <LandingFooter />
    </div>
  )
}
