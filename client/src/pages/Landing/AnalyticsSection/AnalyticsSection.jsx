import Icon from '../../../common/Icon/Icon.jsx'
import Section from '../Section/Section.jsx'
import PointList from '../PointList/PointList.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import './AnalyticsSection.css'

const POINTS = [
  'Ask in plain language, say “Returns per week over the last 3 months, by status”: an agent explores the schema, writes the SQL, runs it to check it and picks columns, bars, a line, an area, a pie, a headline number or a table',
  'The card appears right away and fills in when the agent is done: follow which table it is reading or when it is trying a query, and keep asking for more charts meanwhile',
  'Arrange the grid by hand: drag a card by its header, resize it from the corner, and the layout is saved',
  'Every card shows live data: results are cached for five minutes so a visit does not run every query again, refresh runs it on the spot, and nothing is saved but the SQL',
  'The SQL is never hidden: open a card to read it, edit it and re-run it, switch the chart type, choose the columns to plot or rename it — or just ask, “make it monthly” or “only the top 5”, and the agent rewrites the query',
  'Keep several dashboards: each one is private until you share it with the team, and a shared one can be edited by everyone signed in',
  'As safe as the chat: read-only transactions, SELECT and WITH only, a row cap and a statement timeout',
]

const PROMPT = 'Returns per week, by status'
const AGENT_STEP = 'Reading the columns of returns…'
const ORDERS_SQL = "SELECT date_trunc('week', created_at) AS week, count(*) AS orders FROM orders GROUP BY 1 ORDER BY 1"

const WEEKLY_ORDERS = [46, 58, 52, 67, 61, 78, 72, 92]
const WEEK_RANGE = ['Sep 21', 'Nov 9']
const PENDING_COLUMNS = [44, 70, 56, 86, 64]

const REFUND_SERIES = [
  {
    label: 'EU',
    path: 'M8 28.4 C14.8 29.7 32.1 35 45.7 35.6 C59.3 36.2 69.9 29.7 83.4 32 C97 34.3 107.6 44.3 121.1 48.2 C134.7 52.1 145.3 53 158.9 53.6 C172.4 54.2 183 49.2 196.6 51.8 C210.1 54.4 220.7 63.8 234.3 68 C247.9 72.2 265.2 73.9 272 75.2',
    end: { x: 272, y: 75.2 },
  },
  {
    label: 'UK',
    path: 'M8 46.4 C14.8 45.4 32.1 40.7 45.7 41 C59.3 41.3 69.9 47.9 83.4 48.2 C97 48.5 107.6 44.4 121.1 42.8 C134.7 41.2 145.3 38.6 158.9 39.2 C172.4 39.8 183 46.1 196.6 46.4 C210.1 46.7 220.7 41.3 234.3 41 C247.9 40.7 265.2 44 272 44.6',
    end: { x: 272, y: 44.6 },
  },
]

const PLOT_WIDTH = 280
const PLOT_HEIGHT = 96
const PLOT_BASELINE = 92
const PLOT_GRID_LINES = [14, 40, 66]
const DOT_RADIUS = 5

const ASK_ICON_SIZE = 14
const CARD_ICON_SIZE = 12

export default function AnalyticsSection() {
  return (
    <Section id="analytics" className="lp-section--warm">
      <div className="lp-split">
        <div>
          <span className="lp-eyebrow">Analytics</span>
          <h2 className="lp-h2">Ask for a chart. Get a live dashboard you arrange by hand.</h2>
          <p className="lp-lead">
            Soporti can already query the PostgreSQL database you connect in <strong>/admin</strong>, read-only, so it
            can chart it too. Analytics is a section of its own, apart from the chat: describe the chart you want and it
            lands as a card on a dashboard you can keep to yourself or share, drawn from a query you can always read.
          </p>
          <PointList points={POINTS} />
        </div>

        <div className="lp-split__visual">
          <PreviewWindow className="lp-analytics" badge="Analytics">
            <div className="lp-analytics__body">
              <div className="lp-analytics__ask">
                <Icon name="spark" size={ASK_ICON_SIZE} className="lp-analytics__ask-icon" />
                <span className="lp-analytics__prompt">{PROMPT}</span>
                <span className="btn btn--primary btn--sm lp-analytics__create">Create chart</span>
              </div>

              <ul className="lp-analytics__grid" aria-label="Dashboard cards">
                <DashboardCard slot="columns" title="Orders per week">
                  <ColumnPlot label="Column chart of orders per week" values={WEEKLY_ORDERS} />
                  <div className="lp-analytics__axis">
                    {WEEK_RANGE.map(tick => (
                      <span key={tick}>{tick}</span>
                    ))}
                  </div>
                  <p className="lp-analytics__sql">
                    <Icon name="code" size={CARD_ICON_SIZE} />
                    <code className="lp-analytics__query">{ORDERS_SQL}</code>
                  </p>
                </DashboardCard>

                <DashboardCard slot="generating" title={PROMPT}>
                  <ColumnPlot label="Chart being generated" values={PENDING_COLUMNS} isPending />
                  <p className="lp-analytics__step">{AGENT_STEP}</p>
                </DashboardCard>

                <DashboardCard slot="number" title="Returns this month" isDragging>
                  <span className="lp-analytics__figure">1,284</span>
                </DashboardCard>

                <DashboardCard slot="lines" title="Days to refund" legend={REFUND_SERIES}>
                  <LinePlot label="Line chart of days to refund in the EU and the UK" series={REFUND_SERIES} />
                </DashboardCard>
              </ul>
            </div>
          </PreviewWindow>
        </div>
      </div>
    </Section>
  )
}

function DashboardCard({ slot, title, legend = [], isDragging = false, children }) {
  return (
    <li
      className={`lp-analytics__slot lp-analytics__slot--${slot}${isDragging ? ' lp-analytics__slot--dragging' : ''}`}
    >
      <div className="card lp-analytics__card">
        <div className="lp-analytics__head">
          <Icon name="grip" size={CARD_ICON_SIZE} className="lp-analytics__grip" />
          <span className="lp-analytics__title">{title}</span>
          {legend.length > 0 && (
            <span className="lp-analytics__legend">
              {legend.map((series, index) => (
                <span className="lp-analytics__key" key={series.label}>
                  <span className={`lp-analytics__swatch lp-analytics__series--${index + 1}`} />
                  {series.label}
                </span>
              ))}
            </span>
          )}
        </div>
        {children}
      </div>
    </li>
  )
}

function ColumnPlot({ label, values, isPending = false }) {
  return (
    <div
      className={`lp-analytics__columns${isPending ? ' lp-analytics__columns--pending' : ''}`}
      role="img"
      aria-label={label}
    >
      {values.map((value, index) => (
        <span key={index} className="lp-analytics__column" style={{ height: `${value}%` }} />
      ))}
    </div>
  )
}

function LinePlot({ label, series }) {
  return (
    <svg className="lp-analytics__lines" viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`} role="img" aria-label={label}>
      {PLOT_GRID_LINES.map(y => (
        <line key={y} className="lp-analytics__gridline" x1="0" x2={PLOT_WIDTH} y1={y} y2={y} />
      ))}
      <line
        className="lp-analytics__gridline lp-analytics__gridline--base"
        x1="0"
        x2={PLOT_WIDTH}
        y1={PLOT_BASELINE}
        y2={PLOT_BASELINE}
      />
      {series.map((line, index) => (
        <g key={line.label} className={`lp-analytics__series--${index + 1}`}>
          <path className="lp-analytics__line" d={line.path} />
          <circle className="lp-analytics__dot" cx={line.end.x} cy={line.end.y} r={DOT_RADIUS} />
        </g>
      ))}
    </svg>
  )
}
