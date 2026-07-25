import { useState } from 'react'
import { draftShopifyTokenQuery, getShopifyConfig, saveShopifyTokenQuery } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'

export default function AdminShopify({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getShopifyConfig, token, onLogout)
  const [editedQuery, setEditedQuery] = useState(null)
  const { saving, error: saveError, savedAt, save } = useSaveField(onLogout)
  const { saving: drafting, error: draftError, save: runDraft } = useSaveField(onLogout)

  const savedQuery = config?.tokenQuery ?? ''
  const tokenQuery = editedQuery ?? savedQuery

  function persist(value) {
    save(async () => {
      const data = await saveShopifyTokenQuery(token, value)
      patchConfig({
        tokenQueryConfigured: data.tokenQueryConfigured,
        tokenQuery: data.tokenQueryConfigured ? value.trim() : '',
      })
      setEditedQuery(null)
    })
  }

  function draftQuery() {
    runDraft(async () => {
      const data = await draftShopifyTokenQuery(token)
      setEditedQuery(data.query)
    })
  }

  if (error || !config) return <AdminSectionStatus title="Shopify" error={error} />

  const dirty = tokenQuery !== savedQuery

  return (
    <>
      <AdminSection title="Shopify integration">
        <p className="admin__muted">
          Lets the assistant query the Shopify Admin API (read-only): orders, products, webhooks and GraphQL lookups. It
          has no credentials of its own: it works when the Database integration is connected and your Shopify store
          tokens live in that database — the assistant looks them up per store with the query below. Saving a query
          enables the integration; removing it disables it.
        </p>

        <StatusRow configured={config.tokenQueryConfigured && config.databaseConfigured} />

        {!config.databaseConfigured && (
          <p className="alert alert--warning">
            The Shopify integration needs the Database integration: configure the read-only connection in the Database
            section. The token query below runs against that database.
          </p>
        )}
      </AdminSection>

      <AdminSection title="Store token query">
        <p className="admin__muted">
          SQL that resolves a store to its Shopify Admin API credentials. Every occurrence of <code>{'{{store}}'}</code>{' '}
          is replaced with the store identifier the assistant was given (a domain or an ID), safely quoted as a string
          literal. The query must be a read-only <code>SELECT</code> returning one row with a <code>domain</code> column
          (the <code>*.myshopify.com</code> domain) and a <code>token</code> column (the Admin API access token).
        </p>
        <p className="admin__muted">
          Don&apos;t write it by hand: <strong>Draft with Soporti</strong> lets the assistant explore the database
          schema (table and column names only — it never reads token values) and fill in the query for you to review and
          save.
        </p>

        {(saveError || draftError) && <p className="alert alert--error">{saveError || draftError}</p>}

        <textarea
          className="textarea textarea--code"
          placeholder={
            "SELECT domain, token\nFROM shopify_stores\nWHERE domain ILIKE '%' || {{store}} || '%' OR id::text = {{store}}\nLIMIT 1"
          }
          value={tokenQuery}
          onChange={event => setEditedQuery(event.target.value)}
          disabled={saving || drafting}
          rows={8}
        />

        <div className="admin__form admin__form--row">
          <button
            className="btn btn--secondary"
            type="button"
            onClick={draftQuery}
            disabled={!config.databaseConfigured || drafting || saving}
            title={config.databaseConfigured ? undefined : 'Configure the Database integration first'}
          >
            {drafting ? 'Soporti is exploring the database...' : 'Draft with Soporti'}
          </button>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => persist(tokenQuery)}
            disabled={!dirty || saving || drafting || !tokenQuery.trim()}
          >
            {saving ? 'Saving...' : 'Save query'}
          </button>
          {config.tokenQueryConfigured && (
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => persist('')}
              disabled={saving || drafting}
            >
              Remove
            </button>
          )}
          {!saveError && savedAt && !dirty && <span className="admin__saved">Saved</span>}
        </div>
      </AdminSection>
    </>
  )
}
