import { readStoredToken } from '../../context/AuthContext.jsx'
import { ROUTES } from '../../router/constants.js'
import AskSection from './AskSection/AskSection.jsx'
import AutomationsSection from './AutomationsSection/AutomationsSection.jsx'
import IntegrationsSection from './IntegrationsSection/IntegrationsSection.jsx'
import InstructionsSection from './InstructionsSection/InstructionsSection.jsx'
import LandingCta from './LandingCta/LandingCta.jsx'
import LandingFooter from './LandingFooter/LandingFooter.jsx'
import LandingHero from './LandingHero/LandingHero.jsx'
import LandingNav from './LandingNav/LandingNav.jsx'
import ProfilesSection from './ProfilesSection/ProfilesSection.jsx'
import RendersSection from './RendersSection/RendersSection.jsx'
import SafetySection from './SafetySection/SafetySection.jsx'
import SkillsSection from './SkillsSection/SkillsSection.jsx'
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
      <IntegrationsSection />
      <ProfilesSection />
      <InstructionsSection />
      <SkillsSection />
      <AutomationsSection />
      <SafetySection />
      <LandingCta cta={visibleCta} />
      <LandingFooter />
    </div>
  )
}
