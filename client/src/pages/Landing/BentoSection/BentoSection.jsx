import ArtifactsPreview from '../ArtifactsPreview/ArtifactsPreview.jsx'
import AnalyticsTile from '../AnalyticsTile/AnalyticsTile.jsx'
import AppTile from '../AppTile/AppTile.jsx'
import BentoCard from '../BentoCard/BentoCard.jsx'
import BotsTile from '../BotsTile/BotsTile.jsx'
import HighlightsGrid from '../HighlightsGrid/HighlightsGrid.jsx'
import Section from '../Section/Section.jsx'
import SectionHeading from '../SectionHeading/SectionHeading.jsx'
import SkillsPreview from '../SkillsPreview/SkillsPreview.jsx'
import SubagentsTile from '../SubagentsTile/SubagentsTile.jsx'
import VideosTile from '../VideosTile/VideosTile.jsx'
import { SECTION_IDS } from '../constants.js'
import { useSpotlight } from '../hooks/useSpotlight/useSpotlight.js'
import './BentoSection.css'

export default function BentoSection() {
  const spotlight = useSpotlight()

  return (
    <Section id={SECTION_IDS.PRODUCT}>
      <SectionHeading
        eyebrow="Beyond the answer"
        title={
          <>
            When the answer is a <em>deliverable</em>, Soporti builds it.
          </>
        }
        lead="Reports that open beside the chat, dashboards that stay live, product videos with their own soundtrack, and bots that keep doing the job on a schedule."
      />

      <div className="lp-bento" {...spotlight}>
        <BentoCard
          icon="artifact"
          kicker="Artifacts"
          title="Reports, runbooks and dashboards"
          description="A deliverable opens in a panel next to the chat. Ask for a change and get a new version, then export it as a PDF or share it with a link."
          isWide
        >
          <ArtifactsPreview />
        </BentoCard>
        <BentoCard
          icon="bot"
          kicker="Bots"
          title="Describe a job once"
          description="Give a bot a name and a purpose, tell it “every weekday at 17:00” and its report lands in its own chat."
          index={1}
        >
          <BotsTile />
        </BentoCard>
        <BentoCard
          icon="zap"
          kicker="Skills"
          title="Your playbooks as /commands"
          description="Save a triage checklist or a review rubric once, then run it with its name. Autocomplete included."
          index={2}
        >
          <SkillsPreview />
        </BentoCard>
        <BentoCard
          icon="chart"
          kicker="Analytics"
          title="Ask for a chart, keep a live dashboard"
          description="An agent explores the schema, writes the SQL and picks the chart. Drag, resize and share it; the query is always one click away."
          isWide
          index={3}
        >
          <AnalyticsTile />
        </BentoCard>
        <BentoCard
          icon="video"
          kicker="Videos"
          title="Product videos from a brief"
          description="It reads the repos, proposes a storyboard and, once you approve it, renders an MP4 with music composed to match the scenes."
          isWide
          index={4}
        >
          <VideosTile />
        </BentoCard>
        <BentoCard
          icon="subagents"
          kicker="Subagents"
          title="Specialists behind one assistant"
          description="Each specialist gets its own prompt, model and tools. The assistant decides when a question belongs to one."
          index={5}
        >
          <SubagentsTile />
        </BentoCard>
        <BentoCard
          icon="download"
          kicker="App"
          title="Soporti in your dock and in your pocket"
          description="Install it on desktop or phone, laid out for one thumb. Get notified when a bot reports, an answer lands or a video is ready, and share screenshots into a chat."
          isLandscape
          index={6}
        >
          <AppTile />
        </BentoCard>
      </div>

      <HighlightsGrid />
    </Section>
  )
}
