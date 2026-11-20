import { useSearchParams } from 'react-router-dom'
import { JEV_LEGAL_DOCUMENT } from '../../../constants.js'
import { getGuards, getJevConfig } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import GuardEditor from './GuardEditor/GuardEditor.jsx'
import GuardsTable from './GuardsTable/GuardsTable.jsx'
import JevConnection from './JevConnection/JevConnection.jsx'
import NewGuardForm from './NewGuardForm/NewGuardForm.jsx'

const GUARD_PARAM = 'guard'

export default function AdminGuards({ token, onLogout }) {
  const [params, setParams] = useSearchParams()
  const { config: catalog, error: catalogError, patchConfig } = useAuthedConfig(getJevConfig, token, onLogout)
  const { config: list, error: listError, reload } = useAuthedConfig(getGuards, token, onLogout)

  const loadError = catalogError ?? listError
  if (loadError || !catalog || !list) return <AdminSectionStatus title="Guards" error={loadError} />

  const selectedId = params.get(GUARD_PARAM) ?? JEV_LEGAL_DOCUMENT
  const selected = list.guards.find(guard => guard.id === selectedId) ?? list.guards[0]

  function select(id) {
    setParams({ [GUARD_PARAM]: id })
  }

  function handleCreated(guard) {
    reload()
    select(guard.id)
  }

  function handleDeleted() {
    reload()
    select(JEV_LEGAL_DOCUMENT)
  }

  return (
    <>
      <AdminSection title="Guards">
        <p className="admin__muted">
          A guard is a set of questions Jev answers about something Soporti or a person wants checked: a reply to a
          customer, an answer, a PR. Each answer comes with a confidence, and the answers you mark raise a warning.
          Guards warn: they never send, approve or block anything on their own.
        </p>
        <GuardsTable guards={list.guards} selectedId={selected.id} onSelect={select} />
        <NewGuardForm token={token} onLogout={onLogout} onCreated={handleCreated} />
      </AdminSection>

      <GuardEditor
        key={selected.id}
        token={token}
        guard={selected}
        catalog={catalog}
        onLogout={onLogout}
        onSaved={reload}
        onDeleted={handleDeleted}
      />

      <JevConnection token={token} onLogout={onLogout} config={catalog} onConfigChange={patchConfig} />
    </>
  )
}
