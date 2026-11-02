import { useState } from 'react'
import { testHubspotConnection } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'

export default function HubspotConnectionTest({ token, onLogout }) {
  const [account, setAccount] = useState(null)
  const { saving: testing, error, save: run } = useSaveField(onLogout)

  function handleTest() {
    setAccount(null)
    run(async () => setAccount(await testHubspotConnection(token)))
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <div className="admin__form admin__form--row">
        <button className="btn btn--secondary" type="button" onClick={handleTest} disabled={testing}>
          {testing ? 'Testing...' : 'Test connection'}
        </button>
        {account && <span className="admin__saved">Connected</span>}
      </div>

      {account && (
        <dl className="admin__kv">
          <div className="admin__kv-row">
            <dt>Portal ID</dt>
            <dd>
              <code>{account.portalId}</code>
            </dd>
          </div>
          <div className="admin__kv-row">
            <dt>Domain</dt>
            <dd>
              <code>{account.uiDomain}</code>
            </dd>
          </div>
        </dl>
      )}
    </>
  )
}
