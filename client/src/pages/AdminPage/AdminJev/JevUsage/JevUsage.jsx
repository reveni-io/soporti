import { getJevUsage } from '../../../../services/services.js'
import { useAuthedConfig } from '../../../../hooks/useAuthedConfig/useAuthedConfig.js'

const PROJECTS = {
  github: { label: 'GitHub reviews', role: 'Can only veto an approval' },
  legal: { label: 'Legal', role: 'Warns Legal; Legal has the last word' },
}

export default function JevUsage({ token, onLogout }) {
  const { config: usage, error } = useAuthedConfig(getJevUsage, token, onLogout)

  if (error) return <p className="alert alert--error">{error}</p>
  if (!usage) return <p className="admin__muted">Loading...</p>

  return (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Calls (last 30 days)</th>
            <th>What Jev does</th>
          </tr>
        </thead>
        <tbody>
          {usage.projects.map(project => (
            <tr key={project.id}>
              <td>{PROJECTS[project.id].label}</td>
              <td>{project.calls.toLocaleString()}</td>
              <td>{PROJECTS[project.id].role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
