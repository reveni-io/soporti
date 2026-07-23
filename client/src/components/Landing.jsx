import { useEffect, useRef } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import GridPattern from './GridPattern.jsx'
import ChartBlock from './ChartBlock.jsx'
import CsvBlock from './CsvBlock.jsx'
import IntegrationIcon from './IntegrationIcon.jsx'
import HeroChat from './HeroChat.jsx'
import SettingsPreview from './SettingsPreview.jsx'
import returnFlowDiagram from './returnFlowDiagram.js'
import './Landing.css'

/* ── Content data ──────────────────────────────────────────────── */

// Public source repository — the landing is shown both inside the app and as a
// standalone GitHub Pages build, so this link is always visible (never gated by
// `hideCta`, which only drops the login/app buttons).
const GITHUB_URL = 'https://github.com/reveni-io/soporti'

// Example questions, mirroring the curated pool in example-questions.js.
const QUESTIONS = [
  {
    tag: 'Product',
    icon: 'github',
    text: 'What happens when a user tries to sign up with an email that already exists?',
  },
  { tag: 'Live data', icon: 'postgres', text: 'Show a chart of new signups per day over the last month.' },
  {
    tag: 'Orders',
    icon: 'shopify',
    text: 'Look up order #12345 in Shopify for the Acme store and summarize its status.',
  },
  {
    tag: 'Errors',
    icon: 'sentry',
    text: 'What are the most frequent production errors in the frontend this week?',
  },
  { tag: 'Docs', icon: 'notion', text: 'What does Notion say about the customer onboarding process?' },
  { tag: 'Tickets', icon: 'shortcut', text: 'What is the status of story sc-1234?' },
]

const INTEGRATIONS = [
  {
    id: 'github',
    name: 'GitHub',
    desc: 'Browses directories, reads files, searches code and even runs git log & blame in an ephemeral clone to explain how the product actually works.',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    desc: 'Writes and runs read-only SQL against production data (capped and mutation-free), then turns the rows into tables and charts.',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    desc: 'Looks up orders, fulfilments and products via the Admin API — with per-store tokens, so it can reconcile backend data against the real store.',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    desc: 'Pulls issues and the latest event stack trace, so you can paste a link and ask what caused an error.',
  },
  {
    id: 'notion',
    name: 'Notion',
    desc: 'Reads internal Notion pages and databases to answer questions about processes and policies.',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    desc: 'Finds and reads Docs, Sheets, Slides, PDFs, Word, Excel and PowerPoint across shared drives — read-only.',
  },
  {
    id: 'helpjuice',
    name: 'Help Center',
    desc: 'Searches and reads Helpjuice knowledge-base articles to answer questions the way customers see them.',
  },
  {
    id: 'shortcut',
    name: 'Shortcut',
    desc: 'Fetches stories, epics, status and acceptance criteria so you can track ongoing work from the chat.',
  },
]

// The rich, brand-styled outputs Soporti can render inline in an answer.
const CHART_DEMO = JSON.stringify({
  type: 'area',
  title: 'Returns created per day · last 7 days',
  xKey: 'name',
  data: [
    { name: 'Mon', value: 82 },
    { name: 'Tue', value: 96 },
    { name: 'Wed', value: 121 },
    { name: 'Thu', value: 110 },
    { name: 'Fri', value: 143 },
    { name: 'Sat', value: 68 },
    { name: 'Sun', value: 59 },
  ],
  series: [{ key: 'value', label: 'Returns', color: '#2f9e2c' }],
})

const CSV_DEMO = `Merchant,Returns (30d),Avg refund (€),Top reason
Acme Apparel,1284,42.50,Wrong size
Northwind Home,872,58.10,Changed mind
Globex Beauty,514,27.90,Damaged
Umbrella Shoes,463,63.40,Wrong size
Initech Living,391,35.20,Not as described`

const SQL_DEMO = `-- Soporti writes the query for you (read-only)
SELECT m.name AS merchant,
       count(*) AS returns
FROM returns r
JOIN merchants m ON m.id = r.merchant_id
WHERE r.created_at >= now() - interval '30 days'
GROUP BY m.name
ORDER BY returns DESC
LIMIT 5;`

/* ── Small building blocks ─────────────────────────────────────── */

// Read the session token without throwing where localStorage is unavailable.
function readAuthToken() {
  try {
    return localStorage.getItem('auth_token')
  } catch {
    return null
  }
}

function HelpCenterIcon({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.2" />
      <line x1="5.6" y1="5.6" x2="9.7" y2="9.7" />
      <line x1="14.3" y1="14.3" x2="18.4" y2="18.4" />
      <line x1="18.4" y1="5.6" x2="14.3" y2="9.7" />
      <line x1="9.7" y1="14.3" x2="5.6" y2="18.4" />
    </svg>
  )
}

function Arrow() {
  return (
    <svg
      className="lp-btn__arrow"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

// The exact same Mermaid diagram the chat produces, pre-rendered to SVG with the
// very same engine (beautiful-mermaid). Everyone sees the real Mermaid render —
// logged in or not — with no server call, so it's identical for all visitors.
// The SVG and how to regenerate it live in returnFlowDiagram.js.
function DiagramDemo() {
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: returnFlowDiagram }} />
}

// Fades a section in as it scrolls into view (respects reduced motion, and
// degrades gracefully where matchMedia / IntersectionObserver are unavailable).
function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible')
      return
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

function Section({ className = '', children, id }) {
  const ref = useReveal()
  return (
    <section id={id} className={`lp-section ${className}`}>
      <div className="lp__inner lp-reveal" ref={ref}>
        {children}
      </div>
    </section>
  )
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function Landing({ hideCta = false }) {
  // When there's already a session, the CTA reads "Enter" and goes straight to
  // the chat; otherwise it's a "Log in" button pointing at /login. We never
  // auto-redirect an authenticated visitor away from this page.
  // `hideCta` is set by the standalone GitHub Pages build (src/landing.jsx),
  // which ships this marketing page without a reachable chat/login backend, so
  // the login/app buttons are dropped (section anchors stay).
  const loggedIn = !!readAuthToken()
  const cta = loggedIn ? { href: '/chat', label: 'Open Soporti' } : { href: '/login', label: 'Log in' }

  return (
    <div className="lp">
      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp__inner lp-nav__inner">
          <div className="lp-nav__brand">
            <span className="lp-nav__logo">Soporti</span>
            <span className="lp-nav__by">by Reveni</span>
          </div>
          <div className="lp-nav__links">
            <a className="lp-nav__link" href="#ask">
              Ask
            </a>
            <a className="lp-nav__link" href="#renders">
              Answers
            </a>
            <a className="lp-nav__link" href="#integrations">
              Integrations
            </a>
            <a className="lp-nav__link" href="#automations">
              Automations
            </a>
            <a
              className="lp-nav__gh"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Soporti on GitHub"
            >
              <IntegrationIcon id="github" size={18} />
              <span className="lp-nav__gh-label">GitHub</span>
            </a>
            {!hideCta && (
              <a className="lp-btn lp-btn--primary lp-btn--sm" href={cta.href}>
                {cta.label}
                <Arrow />
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="lp-hero">
        <div className="lp-hero__grid">
          <GridPattern variant="dark" />
        </div>
        <div className="lp__inner lp-hero__inner">
          <div className="lp-hero__text">
            <span className="lp-hero__badge">
              <span className="lp-hero__badge-dot" />
              Internal AI teammate · Read-only &amp; safe
            </span>
            <h1 className="lp-hero__title">
              Ask anything about <em>how your product works</em>.
            </h1>
            <p className="lp-hero__subtitle">
              Soporti reads your code, queries production data, and searches docs, tickets and errors — then explains
              what it finds in plain language. No spelunking required.
            </p>
            <div className="lp-hero__cta">
              {!hideCta && (
                <a className="lp-btn lp-btn--primary" href={cta.href}>
                  {cta.label}
                  <Arrow />
                </a>
              )}
              <a className="lp-btn lp-btn--ghost" href="#renders">
                See what it can do
              </a>
            </div>
            <p className="lp-hero__note">Company sign-in only · nothing is ever modified</p>
          </div>
          <div className="lp-hero__visual">
            <HeroChat />
          </div>
        </div>
      </header>

      {/* Stat strip */}
      <Section className="lp-section--warm">
        <div className="lp-stats">
          <div className="lp-stat">
            <div className="lp-stat__num">7+</div>
            <div className="lp-stat__label">Connected sources: code, data, docs, tickets &amp; errors</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat__num">2</div>
            <div className="lp-stat__label">Answer styles — Support and Tech</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat__num">3</div>
            <div className="lp-stat__label">Surfaces: web chat, Slack and GitHub PR reviews</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat__num">0</div>
            <div className="lp-stat__label">Write access — every tool is strictly read-only</div>
          </div>
        </div>
      </Section>

      {/* Ask */}
      <Section id="ask" className="lp-section--white">
        <div className="lp-section__head">
          <span className="lp-eyebrow">What you can ask</span>
          <h2 className="lp-h2">Real questions, answered from the real system.</h2>
          <p className="lp-lead">
            Skip the code archaeology and the “who knows this?” Slack thread. Ask in plain language and Soporti figures
            out which repos, databases and docs to look in.
          </p>
        </div>
        <div className="lp-ask__grid">
          {QUESTIONS.map(q => (
            <div className="lp-qcard" key={q.text}>
              <span className="lp-qcard__tag">
                <IntegrationIcon id={q.icon} size={14} />
                {q.tag}
              </span>
              <p className="lp-qcard__text">{q.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Renders */}
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
          <div className="lp-demo">
            <div className="lp-demo__head">
              <div className="lp-demo__kicker">Charts</div>
              <div className="lp-demo__title">Trends at a glance</div>
              <div className="lp-demo__desc">
                Bar, line, area and pie — rendered live with Recharts in the brand palette.
              </div>
            </div>
            <div className="lp-demo__body">
              <ChartBlock data={CHART_DEMO} />
            </div>
          </div>

          <div className="lp-demo">
            <div className="lp-demo__head">
              <div className="lp-demo__kicker">Tables</div>
              <div className="lp-demo__title">Data you can take with you</div>
              <div className="lp-demo__desc">
                Query results become clean preview tables with a one-click CSV download.
              </div>
            </div>
            <div className="lp-demo__body">
              <CsvBlock csv={CSV_DEMO} />
            </div>
          </div>

          <div className="lp-demo">
            <div className="lp-demo__head">
              <div className="lp-demo__kicker">Diagrams</div>
              <div className="lp-demo__title">See how it fits together</div>
              <div className="lp-demo__desc">
                Flowcharts, sequence and ER diagrams rendered with Mermaid — the same in chat and here.
              </div>
            </div>
            <div className="lp-demo__body">
              <DiagramDemo />
            </div>
          </div>

          <div className="lp-demo">
            <div className="lp-demo__head">
              <div className="lp-demo__kicker">Code &amp; queries</div>
              <div className="lp-demo__title">Show your work</div>
              <div className="lp-demo__desc">
                Reads real source and writes the read-only SQL behind every data answer.
              </div>
            </div>
            <div className="lp-demo__body">
              <SyntaxHighlighter
                language="sql"
                style={oneDark}
                PreTag="div"
                customStyle={{ margin: 0, borderRadius: '8px', fontSize: '12.5px', background: '#042503' }}
                codeTagProps={{ style: { background: 'transparent' } }}
              >
                {SQL_DEMO}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      </Section>

      {/* Integrations */}
      <Section id="integrations" className="lp-section--white">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Connected everywhere</span>
          <h2 className="lp-h2">Plugged into the tools your team already uses.</h2>
          <p className="lp-lead">
            Every integration is optional and read-only. Leave <strong>YOLO (auto)</strong> on and Soporti picks the
            right tools for each question, or focus it on specific repos and sources.
          </p>
        </div>
        <div className="lp-int__grid">
          {INTEGRATIONS.map(int => (
            <div className="lp-int" key={int.id}>
              <div className="lp-int__icon">
                {int.id === 'helpjuice' ? <HelpCenterIcon size={22} /> : <IntegrationIcon id={int.id} size={22} />}
              </div>
              <div>
                <div className="lp-int__name">{int.name}</div>
                <div className="lp-int__desc">{int.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Profiles / sources (dark) */}
      <Section className="lp-section--dark">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Made for the whole team</span>
          <h2 className="lp-h2">One assistant, tuned to how you work.</h2>
        </div>
        <div className="lp-feat__grid lp-feat__grid--2col">
          <div className="lp-feat">
            <div className="lp-feat__icon" aria-hidden="true">
              🤝
            </div>
            <div className="lp-feat__title">Support profile</div>
            <div className="lp-feat__desc">
              Simplified, behaviour-focused answers for support and ops — what the product does and why, without the
              code.
            </div>
          </div>
          <div className="lp-feat">
            <div className="lp-feat__icon" aria-hidden="true">
              🛠️
            </div>
            <div className="lp-feat__title">Tech profile</div>
            <div className="lp-feat__desc">
              Code-level detail for engineers — file paths, architecture and the exact logic behind a behaviour.
            </div>
          </div>
          <div className="lp-feat">
            <div className="lp-feat__icon" aria-hidden="true">
              🎯
            </div>
            <div className="lp-feat__title">Pick your sources</div>
            <div className="lp-feat__desc">
              Enforced at the tool layer, not just the prompt. Scope a chat to specific repos and integrations, or let
              YOLO auto-select.
            </div>
          </div>
          <div className="lp-feat">
            <div className="lp-feat__icon" aria-hidden="true">
              💬
            </div>
            <div className="lp-feat__title">Chat that remembers</div>
            <div className="lp-feat__desc">
              Conversations are saved and searchable, share a thread with a teammate, set custom instructions, and watch
              every answer stream in real time — tool calls and all.
            </div>
          </div>
        </div>
      </Section>

      {/* Custom instructions */}
      <Section id="instructions" className="lp-section--white">
        <div className="lp-split">
          <div>
            <span className="lp-eyebrow">Make it yours</span>
            <h2 className="lp-h2">Teach Soporti how you work.</h2>
            <p className="lp-lead">
              Set your custom instructions once and they&apos;re added to every chat — your role, the response style you
              like, the language you prefer. Soporti keeps them in mind so answers fit you from the first message.
            </p>
            <div className="lp-ci-tags">
              <span className="lp-qcard__tag">Your role</span>
              <span className="lp-qcard__tag">Response style</span>
              <span className="lp-qcard__tag">Language</span>
              <span className="lp-qcard__tag">Formatting</span>
            </div>
          </div>
          <div className="lp-split__visual">
            <SettingsPreview />
          </div>
        </div>
      </Section>

      {/* Automations */}
      <Section id="automations" className="lp-section--warm">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Beyond the chat</span>
          <h2 className="lp-h2">Soporti shows up where the work happens.</h2>
          <p className="lp-lead">
            The same brain that answers in chat also works autonomously across Slack and GitHub.
          </p>
        </div>
        <div className="lp-feat__grid">
          <div className="lp-feat lp-feat--light">
            <div className="lp-feat__icon" aria-hidden="true">
              💬
            </div>
            <div className="lp-feat__title">Slack teammate</div>
            <div className="lp-feat__desc">
              Mention Soporti in Slack and it answers in the thread — same tools, same read-only safety.
            </div>
            <ul className="lp-feat__list">
              <li>Auto-diagnoses new support tickets on its own</li>
              <li>Reads screenshots attached to a ticket (vision)</li>
              <li>Writes its findings back onto the ticket</li>
            </ul>
          </div>
          <div className="lp-feat lp-feat--light">
            <div className="lp-feat__icon" aria-hidden="true">
              🔍
            </div>
            <div className="lp-feat__title">Automated PR reviews</div>
            <div className="lp-feat__desc">
              Request a review (or add a label) and Soporti reviews the code with your changes actually applied, on
              three axes.
            </div>
            <ul className="lp-feat__list">
              <li>Correctness, standards (cites your CLAUDE.md &amp; ADRs) and spec vs. the linked Shortcut story</li>
              <li>Posts inline comments; can approve trivial PRs, never blocks</li>
              <li>Replies to @-mentions right in the PR thread</li>
            </ul>
          </div>
          <div className="lp-feat lp-feat--light">
            <div className="lp-feat__icon" aria-hidden="true">
              🌱
            </div>
            <div className="lp-feat__title">Learns from feedback</div>
            <div className="lp-feat__desc">
              A 👍 on a good answer saves it as a solved case, and future questions reuse it automatically.
            </div>
            <ul className="lp-feat__list">
              <li>Answers get grounded in past resolutions</li>
              <li>Semantic search over the knowledge base</li>
              <li>Gets more accurate the more the team uses it</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Safety */}
      <Section className="lp-section--white">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Safe by design</span>
          <h2 className="lp-h2">Powerful access, zero blast radius.</h2>
        </div>
        <div className="lp-safe__grid">
          <div className="lp-safe">
            <div className="lp-safe__icon">
              <ShieldIcon />
            </div>
            <div className="lp-safe__title">Read-only everywhere</div>
            <div className="lp-safe__desc">
              No tool can change code, data or settings. You can&apos;t break anything by asking.
            </div>
          </div>
          <div className="lp-safe">
            <div className="lp-safe__icon">
              <ShieldIcon />
            </div>
            <div className="lp-safe__title">Company sign-in only</div>
            <div className="lp-safe__desc">
              Google SSO restricted to your company&apos;s domains, with stateless session tokens.
            </div>
          </div>
          <div className="lp-safe">
            <div className="lp-safe__icon">
              <ShieldIcon />
            </div>
            <div className="lp-safe__title">Secrets stay secret</div>
            <div className="lp-safe__desc">
              A credential guard redacts anything secret-shaped before it&apos;s ever posted or shown.
            </div>
          </div>
          <div className="lp-safe">
            <div className="lp-safe__icon">
              <ShieldIcon />
            </div>
            <div className="lp-safe__title">Your data, briefly</div>
            <div className="lp-safe__desc">
              Conversations are purged 14 days after their last use. Webhooks are HMAC-verified.
            </div>
          </div>
        </div>
      </Section>

      {/* Final CTA */}
      <section className="lp-section lp-section--dark lp-cta">
        <div className="lp-cta__grid">
          <GridPattern variant="dark" />
        </div>
        <div className="lp__inner lp-cta__inner">
          <h2 className="lp-cta__title">Stop guessing. Just ask Soporti.</h2>
          <p className="lp-cta__sub">Your AI teammate for code, data &amp; docs — one question away.</p>
          {!hideCta && (
            <div className="lp-cta__actions">
              <a className="lp-btn lp-btn--primary" href={cta.href}>
                {cta.label}
                <Arrow />
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp__inner lp-footer__inner">
          <span className="lp-footer__logo">Soporti</span>
          <span className="lp-footer__small">An open-source tool by Reveni · Read-only by design</span>
          <a className="lp-footer__gh" href={GITHUB_URL} target="_blank" rel="noreferrer">
            <IntegrationIcon id="github" size={16} />
            View on GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
