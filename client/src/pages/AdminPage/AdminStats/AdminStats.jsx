import { STATS_RANGE_OPTIONS } from '../../../constants.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import ChannelTable from './ChannelTable/ChannelTable.jsx'
import ToolsTable from './ToolsTable/ToolsTable.jsx'
import TopUsersTable from './TopUsersTable/TopUsersTable.jsx'
import { useAdminStats } from './hooks/useAdminStats/useAdminStats.js'
import { sourceLabel } from './channels.js'
import { formatCount, formatDuration, formatPercent, formatTokens } from './format.js'
import './AdminStats.css'

export default function AdminStats({ token, onLogout }) {
  const { range, setRange, stats, loading, error } = useAdminStats(token, onLogout)

  return (
    <AdminSection title="Stats">
      <p className="admin__muted">
        Everything Soporti has handled: web, Slack and MCP conversations, scheduled runs, PR reviews and auto-diagnosed
        tickets, and who consumes the most. Token counts start when the agent-run tracking was deployed.
      </p>

      <label className="admin-stats__range">
        Range
        <select
          className="input admin-stats__range-select"
          value={range}
          onChange={event => setRange(event.target.value)}
        >
          {STATS_RANGE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <StatsContent stats={stats} loading={loading} error={error} />
    </AdminSection>
  )
}

function StatsContent({ stats, loading, error }) {
  if (loading) return <p className="admin__muted">Loading...</p>
  if (error) return <p className="alert alert--error">{error}</p>
  if (!stats) return null

  const { runs } = stats

  return (
    <>
      <div className="admin-stats__cards">
        <StatCard
          label="Conversations"
          value={formatCount(stats.conversations)}
          hint={describeSources(stats.conversationsBySource)}
        />
        <StatCard
          label="Messages"
          value={formatCount(stats.messages)}
          hint={`${formatCount(stats.userMessages)} asked`}
        />
        <StatCard label="PRs reviewed" value={formatCount(stats.reviewedPullRequests)} />
        <StatCard label="Tickets diagnosed" value={formatCount(stats.diagnosedTickets)} />
        <StatCard label="MCP queries" value={formatCount(stats.mcpQueries)} />
        <StatCard label="Active users" value={formatCount(stats.activeUsers)} />
        <StatCard label="Agent runs" value={formatCount(runs?.runs)} hint={describeFailures(runs)} />
        <StatCard label="LLM requests" value={formatCount(runs?.requests)} />
        <StatCard
          label="Response time"
          value={formatDuration(runs?.p50DurationMs)}
          hint={`p95 ${formatDuration(runs?.p95DurationMs)}`}
        />
        <StatCard label="Input tokens" value={formatTokens(runs?.inputTokens)} />
        <StatCard label="Output tokens" value={formatTokens(runs?.outputTokens)} />
        <StatCard
          label="Cache read"
          value={formatTokens(runs?.cachedInputTokens)}
          hint={`${formatPercent(runs?.cachedInputTokens, runs?.inputTokens)} of input`}
        />
        <StatCard label="Cache write" value={formatTokens(runs?.cacheWriteTokens)} />
      </div>

      <h3 className="admin__subsection-title">Top users</h3>
      <TopUsersTable rows={stats.topUsers} />

      <h3 className="admin__subsection-title">By channel</h3>
      <ChannelTable rows={stats.byChannel} />

      <h3 className="admin__subsection-title">Most used tools</h3>
      <ToolsTable tools={stats.tools} />
    </>
  )
}

function StatCard({ label, value, hint }) {
  return (
    <div className="admin-stats__card">
      <span className="admin-stats__card-value">{value}</span>
      <span className="admin-stats__card-label">{label}</span>
      {hint && <span className="admin-stats__card-hint">{hint}</span>}
    </div>
  )
}

function describeSources(bySource) {
  return (bySource ?? []).map(entry => `${formatCount(entry.conversations)} ${sourceLabel(entry.source)}`).join(' · ')
}

function describeFailures(runs) {
  if (!runs) return undefined

  return runs.failedRuns > 0 ? `${formatCount(runs.failedRuns)} failed` : 'none failed'
}
