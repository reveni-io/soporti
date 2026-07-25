import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ChartBlock from '../../../common/ChartBlock/ChartBlock.jsx'
import CsvBlock from '../../../common/CsvBlock/CsvBlock.jsx'
import Section from '../Section/Section.jsx'
import returnFlowDiagram from '../returnFlowDiagram.js'
import { CHART_DEMO, CSV_DEMO, SQL_DEMO } from './demos.js'

const SQL_STYLE = { margin: 0, borderRadius: '8px', fontSize: '12.5px', background: '#042503' }
const SQL_TAG_PROPS = { style: { background: 'transparent' } }

export default function RendersSection() {
  return (
    <Section id="renders" className="lp-section--cool">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Answers you can use</span>
        <h2 className="lp-h2">Not just text — charts, tables, diagrams and code.</h2>
        <p className="lp-lead">
          Soporti renders its findings the way you&apos;d want to see them: interactive charts, downloadable tables,
          architecture diagrams and syntax-highlighted code — all inline in the chat.
        </p>
      </div>
      <div className="lp-renders__grid">
        <DemoCard
          kicker="Charts"
          title="Trends at a glance"
          description="Bar, line, area and pie — rendered live with Recharts in the brand palette."
        >
          <ChartBlock data={CHART_DEMO} />
        </DemoCard>

        <DemoCard
          kicker="Tables"
          title="Data you can take with you"
          description="Query results become clean preview tables with a one-click CSV download."
        >
          <CsvBlock csv={CSV_DEMO} />
        </DemoCard>

        <DemoCard
          kicker="Diagrams"
          title="See how it fits together"
          description="Flowcharts, sequence and ER diagrams rendered with Mermaid — the same in chat and here."
        >
          <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: returnFlowDiagram }} />
        </DemoCard>

        <DemoCard
          kicker="Code & queries"
          title="Show your work"
          description="Reads real source and writes the read-only SQL behind every data answer."
        >
          <SyntaxHighlighter
            language="sql"
            style={oneDark}
            PreTag="div"
            customStyle={SQL_STYLE}
            codeTagProps={SQL_TAG_PROPS}
          >
            {SQL_DEMO}
          </SyntaxHighlighter>
        </DemoCard>
      </div>
    </Section>
  )
}

function DemoCard({ kicker, title, description, children }) {
  return (
    <div className="lp-demo">
      <div className="lp-demo__head">
        <div className="lp-demo__kicker">{kicker}</div>
        <div className="lp-demo__title">{title}</div>
        <div className="lp-demo__desc">{description}</div>
      </div>
      <div className="lp-demo__body">{children}</div>
    </div>
  )
}
