import { useSearchParams } from 'react-router-dom'
import { getGuards, getJevConfig } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import GuardEditor from './GuardEditor/GuardEditor.jsx'
import GuardsTable from './GuardsTable/GuardsTable.jsx'
import JevConnection from './JevConnection/JevConnection.jsx'

const GUARD_PARAM = 'guard'

export default function AdminGuards({ token, onLogout }) {
  const [params, setParams] = useSearchParams()
  const { config: catalog, error: catalogError, patchConfig } = useAuthedConfig(getJevConfig, token, onLogout)
  const { config: list, error: listError, reload } = useAuthedConfig(getGuards, token, onLogout)

  const loadError = catalogError ?? listError
  if (loadError || !catalog || !list) return <AdminSectionStatus title="Guards" error={loadError} />

  const selected = list.guards.find(guard => guard.id === params.get(GUARD_PARAM))

  function openGuard(id) {
    setParams({ [GUARD_PARAM]: id })
  }

  function closeGuard() {
    setParams({})
  }

  return (
    <>
      <JevConnection token={token} onLogout={onLogout} config={catalog} onConfigChange={patchConfig} />

      <AdminSection title="Guards">
        <p className="admin__muted">
          A guard is the list of questions Jev answers about something Soporti or a person wants checked: a reply to a
          customer or a pull request. Each answer comes with a confidence, and the answers you mark raise a warning.
          Guards warn: they never send, approve or block anything on their own. Press Edit to change a guard.
        </p>
        <GuardsTable guards={list.guards} onEdit={openGuard} />
      </AdminSection>

      {selected && (
        <GuardEditor
          key={selected.id}
          token={token}
          guard={selected}
          onLogout={onLogout}
          onSaved={reload}
          onClose={closeGuard}
        />
      )}
    </>
  )
}
