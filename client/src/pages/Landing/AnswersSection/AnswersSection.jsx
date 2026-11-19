import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ChartBlock from '../../../common/ChartBlock/ChartBlock.jsx'
import CsvBlock from '../../../common/CsvBlock/CsvBlock.jsx'
import Icon from '../../../common/Icon/Icon.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import Section from '../Section/Section.jsx'
import SectionHeading from '../SectionHeading/SectionHeading.jsx'
import { useAutoCycle } from '../hooks/useAutoCycle/useAutoCycle.js'
import { SECTION_IDS } from '../constants.js'
import { staggerStyle } from '../stagger.js'
import { CHART_DEMO, CSV_DEMO, SQL_DEMO } from './demos.js'
import returnFlowDiagram from './returnFlowDiagram.js'
import './AnswersSection.css'

const CYCLE_MS = 7000
const TAB_ICON_SIZE = 16
const PANEL_ID = 'lp-answers-panel'
const SQL_STYLE = {
  margin: 0,
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--fs-md)',
  background: 'var(--green-deep)',
}
const SQL_TAG_PROPS = { style: { background: 'transparent' } }

const TABS = [
  {
    id: 'chart',
    icon: 'chart-area',
    label: 'Charts',
    question: 'How many returns did we get per day last week?',
    intro: 'Returns peaked on Friday at 143, then dropped over the weekend:',
  },
  {
    id: 'table',
    icon: 'table',
    label: 'Tables',
    question: 'Which merchants had the most returns in the last 30 days?',
    intro: 'Acme Apparel leads by a wide margin. Here are the top five, ready to download:',
  },
  {
    id: 'diagram',
    icon: 'subagents',
    label: 'Diagrams',
    question: 'How does a return get approved?',
    intro: 'Every request goes through the policy rules first:',
  },
  {
    id: 'code',
    icon: 'code',
    label: 'Code & SQL',
    question: 'Show me the query behind those numbers',
    intro: 'This is the read-only query I ran:',
  },
]

const TAB_CONTENT = {
  chart: () => <ChartBlock data={CHART_DEMO} />,
  table: () => <CsvBlock csv={CSV_DEMO} />,
  diagram: () => <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: returnFlowDiagram }} />,
  code: () => (
    <SyntaxHighlighter language="sql" style={oneDark} PreTag="div" customStyle={SQL_STYLE} codeTagProps={SQL_TAG_PROPS}>
      {SQL_DEMO}
    </SyntaxHighlighter>
  ),
}

export default function AnswersSection() {
  const cycle = useAutoCycle({ count: TABS.length, intervalMs: CYCLE_MS })
  const tab = TABS[cycle.active]
  const renderContent = TAB_CONTENT[tab.id]

  return (
    <Section id={SECTION_IDS.ANSWERS}>
      <SectionHeading
        eyebrow="Answers you can use"
        title={
          <>
            Not just text. <em>Charts, tables, diagrams</em> and code.
          </>
        }
        lead="Soporti shows what it found the way you would want to see it: interactive charts, tables you can download, diagrams of how things connect and the exact query behind every number. Right in the chat."
        isCentered
      />

      <div className="lp-answers lp-rise" style={staggerStyle(3)} ref={cycle.ref} {...cycle.hoverProps}>
        <div className="lp-answers__tabs" role="tablist" aria-label="Answer formats">
          {TABS.map((item, index) => (
            <AnswerTab
              key={item.id}
              tab={item}
              isActive={index === cycle.active}
              progressKey={cycle.progressKey}
              onSelect={() => cycle.select(index)}
            />
          ))}
        </div>

        <PreviewWindow className="lp-answers__window" badge={tab.label}>
          <div
            key={tab.id}
            className="lp-answers__panel"
            role="tabpanel"
            id={PANEL_ID}
            aria-labelledby={`lp-answers-tab-${tab.id}`}
          >
            <div className="message message--user">
              <div className="message__bubble message__bubble--user">{tab.question}</div>
            </div>
            <div className="message message--assistant lp-answers__reply">
              <div className="message__bubble message__bubble--assistant">
                <p>{tab.intro}</p>
                {renderContent()}
              </div>
            </div>
          </div>
        </PreviewWindow>
      </div>
    </Section>
  )
}

function AnswerTab({ tab, isActive, progressKey, onSelect }) {
  return (
    <button
      type="button"
      role="tab"
      id={`lp-answers-tab-${tab.id}`}
      className={`lp-answers__tab lp-focusable${isActive ? ' lp-answers__tab--active' : ''}`}
      aria-selected={isActive}
      aria-controls={PANEL_ID}
      onClick={onSelect}
    >
      <Icon name={tab.icon} size={TAB_ICON_SIZE} />
      {tab.label}
      {isActive && progressKey && (
        <span key={progressKey} className="lp-progress-bar" style={{ animationDuration: `${CYCLE_MS}ms` }} />
      )}
    </button>
  )
}
