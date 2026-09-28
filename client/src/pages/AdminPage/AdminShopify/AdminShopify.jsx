import { getShopifyConfig, saveShopifyTokenAuthorization, saveShopifyTokenUrl } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'

const TOKEN_URL_PLACEHOLDER = 'https://tokens.example.com/shopify/{{store}}'

export default function AdminShopify({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getShopifyConfig, token, onLogout)

  async function saveTokenUrl(value) {
    const data = await saveShopifyTokenUrl(token, value)
    patchConfig({ tokenUrl: data.tokenUrl })
  }

  async function saveAuthorization(value) {
    const data = await saveShopifyTokenAuthorization(token, value)
    patchConfig({ authorizationConfigured: data.authorizationConfigured })
  }

  if (error || !config) return <AdminSectionStatus title="Shopify" error={error} />

  return (
    <>
      <AdminSection title="Shopify integration">
        <p className="admin__muted">
          Lets the assistant query the Shopify Admin API (read-only) across many stores: orders, products, webhooks and
          GraphQL lookups. Soporti holds no Shopify credentials itself: it asks your own token service for a
          store&apos;s access token whenever it needs one, so the service stays the single place that renews expiring
          tokens.
        </p>

        <StatusRow configured={Boolean(config.tokenUrl)} />
        <p className="admin__muted">The integration is enabled once the token service URL is set.</p>
      </AdminSection>

      <AdminSection title="Token service contract">
        <ol className="admin__steps">
          <li>
            Soporti sends a <code>GET</code> to the URL below, replacing <code>{'{{store}}'}</code> with the store
            identifier (URL-encoded) and adding the <code>Authorization</code> header if one is set.
          </li>
          <li>
            The service answers <code>200</code> with JSON: <code>access_token</code> and <code>shop_domain</code>, plus
            optional <code>api_version</code> and <code>expires_at</code> (ISO 8601). Soporti reuses the token until
            shortly before it expires, or for a minute when there is no expiry.
          </li>
          <li>
            Any other status is reported to the assistant: <code>404</code> unknown store, <code>409</code> the store
            must be reconnected to Shopify, <code>401</code>/<code>403</code> wrong Authorization header, anything else
            a temporary failure. When Shopify rejects a token, Soporti asks the service for a fresh one and retries
            once.
          </li>
        </ol>
      </AdminSection>

      <AdminSection title="Token service URL">
        <p className="admin__muted">
          Must contain <code>{'{{store}}'}</code>. The assistant resolves stores to the identifier in your database (its
          UUID when the stores table has one), so select the Database integration alongside Shopify.
        </p>

        <ValueField
          savedValue={config.tokenUrl}
          onSave={saveTokenUrl}
          onLogout={onLogout}
          placeholder={TOKEN_URL_PLACEHOLDER}
          removable
        />
      </AdminSection>

      <AdminSection title="Authorization header">
        <p className="admin__muted">
          Sent verbatim as the <code>Authorization</code> header (e.g. <code>Bearer …</code> or a shared secret).
          Optional. Stored write-only and never shown again.
        </p>

        <StatusRow configured={config.authorizationConfigured} />

        <SecretField
          placeholder="Authorization header value"
          configuredPlaceholder="Paste a new value to replace it"
          configured={config.authorizationConfigured}
          onSave={saveAuthorization}
          onLogout={onLogout}
        />
      </AdminSection>
    </>
  )
}
