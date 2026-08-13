import config from '../config.js'
import {
  MCP_ENDPOINT_PATH,
  OAUTH_AUTHORIZE_PATH,
  OAUTH_CODE_CHALLENGE_METHOD,
  OAUTH_GRANT_AUTHORIZATION_CODE,
  OAUTH_GRANT_REFRESH_TOKEN,
  OAUTH_REGISTER_PATH,
  OAUTH_RESPONSE_TYPE_CODE,
  OAUTH_SCOPE,
  OAUTH_TOKEN_PATH,
  PROTECTED_RESOURCE_METADATA_PATH,
} from '../constants.js'

export function mcpResourceUri() {
  return `${config.publicUrl}${MCP_ENDPOINT_PATH}`
}

export function protectedResourceMetadataUrl() {
  return `${config.publicUrl}${PROTECTED_RESOURCE_METADATA_PATH}`
}

export function buildProtectedResourceMetadata() {
  return {
    resource: mcpResourceUri(),
    authorization_servers: [config.publicUrl],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
  }
}

export function buildAuthorizationServerMetadata() {
  return {
    issuer: config.publicUrl,
    authorization_endpoint: `${config.publicUrl}${OAUTH_AUTHORIZE_PATH}`,
    token_endpoint: `${config.publicUrl}${OAUTH_TOKEN_PATH}`,
    registration_endpoint: `${config.publicUrl}${OAUTH_REGISTER_PATH}`,
    scopes_supported: [OAUTH_SCOPE],
    response_types_supported: [OAUTH_RESPONSE_TYPE_CODE],
    grant_types_supported: [OAUTH_GRANT_AUTHORIZATION_CODE, OAUTH_GRANT_REFRESH_TOKEN],
    code_challenge_methods_supported: [OAUTH_CODE_CHALLENGE_METHOD],
    token_endpoint_auth_methods_supported: ['none'],
  }
}
