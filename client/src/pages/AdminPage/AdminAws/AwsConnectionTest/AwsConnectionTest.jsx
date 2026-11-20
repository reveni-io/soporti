import { useState } from 'react'
import { testAwsConnection } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'

export default function AwsConnectionTest({ token, onLogout }) {
  const [report, setReport] = useState(null)
  const { saving: testing, error, save: run } = useSaveField(onLogout)

  function handleTest() {
    setReport(null)
    run(async () => setReport(await testAwsConnection(token)))
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <div className="admin__form admin__form--row">
        <button className="btn btn--secondary" type="button" onClick={handleTest} disabled={testing}>
          {testing ? 'Testing...' : 'Test connection'}
        </button>
        {report && <span className="admin__saved">Connected</span>}
      </div>

      {report && <ConnectionReport report={report} />}
    </>
  )
}

function ConnectionReport({ report }) {
  return (
    <dl className="admin__kv">
      <div className="admin__kv-row">
        <dt>Identity</dt>
        <dd>
          <code>{report.arn}</code>
        </dd>
      </div>
      <div className="admin__kv-row">
        <dt>Region</dt>
        <dd>
          <code>{report.region}</code>
        </dd>
      </div>
      {report.checks.map(check => (
        <div className="admin__kv-row" key={check.id}>
          <dt>{check.label}</dt>
          <dd>
            <CheckResult check={check} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function CheckResult({ check }) {
  if (check.ok) return <span className="badge badge--success">allowed</span>

  return (
    <>
      <span className="badge">denied</span> {check.error}
    </>
  )
}
