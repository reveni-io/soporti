import { useCallback, useState } from 'react'
import { JEV_LEGAL_DOCUMENT, JEV_SETTINGS_DOCUMENT } from '../../../constants.js'
import { getJevConfig, getLegalUsage } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useJevDocument } from '../hooks/useJevDocument/useJevDocument.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import DocBar from '../DocBar/DocBar.jsx'
import JevHistory from '../JevHistory/JevHistory.jsx'
import QuestionSetEditor from '../QuestionSetEditor/QuestionSetEditor.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import VersionsTable from '../VersionsTable/VersionsTable.jsx'
import LegalUsage from './LegalUsage/LegalUsage.jsx'
import { describeQueries } from './describe-queries.js'

function describeSetUsers(queriesOn) {
  if (!queriesOn) return null

  const queries = queriesOn === 1 ? '1 scheduled query has' : `${queriesOn} scheduled queries have`

  return `Cannot delete the set: ${queries} Legal review on. They must turn it off first.`
}

export default function AdminLegal({ token, onLogout }) {
  const project = useJevDocument(token, JEV_LEGAL_DOCUMENT, onLogout)
  const settings = useJevDocument(token, JEV_SETTINGS_DOCUMENT, onLogout)
  const { config: catalog, error: catalogError } = useAuthedConfig(getJevConfig, token, onLogout)
  const [usageRequest, setUsageRequest] = useState({ page: 1 })
  const fetchUsage = useCallback(authToken => getLegalUsage(authToken, usageRequest.page), [usageRequest])
  const { config: usage, error: usageError } = useAuthedConfig(fetchUsage, token, onLogout)

  const loadError = catalogError ?? project.loadError ?? settings.loadError
  if (loadError || !catalog || !project.document || !settings.document) {
    return <AdminSectionStatus title="Legal" error={loadError} />
  }

  const savedSet = project.document.data.set
  const isReady = catalog.keyConfigured && settings.document.data.enabled && savedSet.questions.length > 0
  const minConfidence = project.draft.set.minConfidence ?? 'the minimum'

  return (
    <>
      <AdminSection title="Legal">
        <p className="admin__muted">
          Legal answers customer tickets from Zendesk and HubSpot with scheduled queries. Soporti reads each ticket and
          the data behind it, and drafts the reply. Jev checks every case: whether the customer is asking for something
          unusual, and whether the reply is legal and safe to send. When something looks wrong, the case shows a Careful
          warning. Legal has the last word.
        </p>
        <ol className="admin__steps">
          <li>
            A scheduled query with <strong>Legal review</strong> on runs at its time.
          </li>
          <li>Soporti reads the customer tickets and the data, and drafts a reply for each one.</li>
          <li>
            Jev answers the questions below about the customer’s request and about the draft. An answer marked to warn
            Legal, or one Jev is not sure about, shows a Careful warning.
          </li>
          <li>
            A person reads the reply and the warnings, edits it if needed, copies it and sends it from the ticket.
            Soporti doesn’t send anything for now.
          </li>
        </ol>
        <StatusRow configured={isReady} configuredLabel="ready" unconfiguredLabel="not ready" />
        {!isReady && (
          <p className="alert alert--error">
            Legal needs the API key and Jev calls turned on in the Jev section, and at least one saved question.
          </p>
        )}
        <dl className="admin__kv admin__kv--text">
          <div className="admin__kv-row">
            <dt>API key</dt>
            <dd>Shared, from the Jev section ({catalog.keyConfigured ? 'configured' : 'not configured'})</dd>
          </div>
          <div className="admin__kv-row">
            <dt>Who decides</dt>
            <dd>Legal. Jev only warns.</dd>
          </div>
          <div className="admin__kv-row">
            <dt>Who sends</dt>
            <dd>
              Always a person. For now they copy the reply and send it from the ticket: sending from Soporti comes
              later.
            </dd>
          </div>
          <div className="admin__kv-row">
            <dt>Low confidence</dt>
            <dd>
              <span className="badge badge--warning">Careful</span> Jev is not sure, when its confidence in any answer
              is below {minConfidence} <span className="badge">fixed</span>
            </dd>
          </div>
          <div className="admin__kv-row">
            <dt>Turned on in</dt>
            <dd>{usage ? describeQueries(usage.queriesOn) : '…'}</dd>
          </div>
        </dl>
        <p className="admin__muted">
          The low confidence rule is always on and cannot be changed: an answer Jev is not sure about always shows a
          warning.
        </p>
        <p className="note">
          Legal uses the same API key as the Jev section. In GitHub, Jev can veto an approval. In Legal it never blocks
          anything: it warns, and Legal has the last word.
        </p>
        <p className="alert alert--warning">
          This project can send sensitive data to a third party. Review TypeSafe’s data retention before turning it on.
        </p>
        <p className="note">
          There is no switch here to turn Legal on. Each user turns it on per query with the{' '}
          <strong>Legal review</strong> check in Scheduled queries.
        </p>
      </AdminSection>

      <AdminSection title="Questions and answers">
        <p className="admin__muted">
          Add every question and answer Legal needs. Jev answers them about the customer’s request and about Soporti’s
          draft. Mark the answers that should warn Legal: when Jev gives one, the case shows a Careful warning.
        </p>
        <QuestionSetEditor
          project={JEV_LEGAL_DOCUMENT}
          state={project}
          catalog={catalog}
          inUseMessage={describeSetUsers(usage?.queriesOn)}
        />
        <p className="note">
          Daily limit: <code>0</code> (no limit) by default. With a limit, runs over it are marked{' '}
          <strong>Not checked</strong> and show a warning instead of skipping the call silently, because the check
          promises to call Jev on every run.
        </p>
      </AdminSection>

      <AdminSection title="Usage">
        <LegalUsage usage={usage} error={usageError} onPage={page => setUsageRequest({ page })} />
      </AdminSection>

      <AdminSection title="Versions">
        <p className="admin__muted">Versions of the Legal question set and how many calls used each one.</p>
        <VersionsTable
          key={project.document.setVersion}
          token={token}
          project={JEV_LEGAL_DOCUMENT}
          state={project}
          onLogout={onLogout}
          withCalls
        />
      </AdminSection>

      <AdminSection title="Change history">
        <JevHistory key={project.document.rev} token={token} documentId={JEV_LEGAL_DOCUMENT} onLogout={onLogout} />
      </AdminSection>

      <DocBar label="Legal project" state={project} />
    </>
  )
}
