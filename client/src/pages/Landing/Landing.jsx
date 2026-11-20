import { useRef } from 'react'
import './Landing.css'
import { readStoredToken } from '../../context/AuthContext.jsx'
import { ROUTES } from '../../router/constants.js'
import { THEME } from '../../constants.js'
import AnswersSection from './AnswersSection/AnswersSection.jsx'
import AutomationsSection from './AutomationsSection/AutomationsSection.jsx'
import BentoSection from './BentoSection/BentoSection.jsx'
import DecisionsSection from './DecisionsSection/DecisionsSection.jsx'
import IntegrationsSection from './IntegrationsSection/IntegrationsSection.jsx'
import LandingCta from './LandingCta/LandingCta.jsx'
import LandingFooter from './LandingFooter/LandingFooter.jsx'
import LandingHero from './LandingHero/LandingHero.jsx'
import LandingIntro from './LandingIntro/LandingIntro.jsx'
import LandingNav from './LandingNav/LandingNav.jsx'
import McpSection from './McpSection/McpSection.jsx'
import QuestionsMarquee from './QuestionsMarquee/QuestionsMarquee.jsx'
import SecuritySection from './SecuritySection/SecuritySection.jsx'
import { INTRO_PHASES, useIntro } from './hooks/useIntro/useIntro.js'

const LOGGED_IN_CTA = { href: ROUTES.CHAT, label: 'Open Soporti' }
const LOGGED_OUT_CTA = { href: ROUTES.LOGIN, label: 'Log in' }
const INTRO_CLASSES = {
  [INTRO_PHASES.PLAYING]: ' lp--intro-playing',
  [INTRO_PHASES.LEAVING]: ' lp--intro-leaving',
  [INTRO_PHASES.DONE]: '',
}

export default function Landing({ hideCta = false }) {
  const brandRef = useRef(null)
  const intro = useIntro()
  const cta = readStoredToken() ? LOGGED_IN_CTA : LOGGED_OUT_CTA
  const visibleCta = hideCta ? null : cta

  return (
    <div className={`lp${INTRO_CLASSES[intro.phase]}`} data-theme={THEME.LIGHT}>
      {intro.phase !== INTRO_PHASES.DONE && (
        <LandingIntro isLeaving={intro.phase === INTRO_PHASES.LEAVING} targetRef={brandRef} onSkip={intro.skip} />
      )}
      <LandingNav cta={visibleCta} brandRef={brandRef} />
      <main>
        <LandingHero cta={visibleCta} isIntroPlaying={intro.phase === INTRO_PHASES.PLAYING} />
        <QuestionsMarquee />
        <AnswersSection />
        <BentoSection />
        <IntegrationsSection />
        <AutomationsSection />
        <DecisionsSection />
        <McpSection />
        <SecuritySection />
        <LandingCta cta={visibleCta} />
      </main>
      <LandingFooter />
    </div>
  )
}
