import {
  HUBSPOT_API_VERSION,
  HUBSPOT_MAX_FILTER_GROUPS,
  HUBSPOT_MAX_FILTERS,
  HUBSPOT_MAX_FILTERS_PER_GROUP,
  HUBSPOT_MAX_SEARCH_LIMIT,
} from '../constants.js'
import { findUserById } from '../db/users.js'
import { stripHtml } from '../integrations/html.js'
import { redactSecrets } from '../review/output-guard.js'
import { isAllowedGetPath, isListPath, isReadableObjectType, objectTypeIdOf, objectTypeOf } from './permissions.js'
import { getHubspotToken, isHubspotConfigured } from './settings.js'

const BASE_URL = 'https://api.hubapi.com'
const REQUEST_TIMEOUT_MS = 15_000
const RATE_LIMIT_MAX_WAIT_MS = 2_000
const RATE_LIMIT_FALLBACK_WAIT_MS = 1_000
const SNAPSHOT_TTL_MS = 60_000
const ACCOUNT_SNAPSHOT = 'account'
const CUSTOM_OBJECTS_SNAPSHOT = 'customObjects'
const CUSTOM_TYPE = 'custom'
const PIPELINE_TYPES = ['deals', 'tickets']
const OWNERS_PAGE_SIZE = 100
const MAX_PROPERTY_OPTIONS = 100
const ACTIVITY_TYPES = ['notes', 'tasks', 'calls', 'meetings', 'emails']
const ACTIVITY_BASE_FIELDS = { timestamp: 'hs_timestamp', ownerId: 'hubspot_owner_id' }
const ACTIVITY_FIELDS = {
  notes: { body: 'hs_note_body' },
  tasks: { subject: 'hs_task_subject', status: 'hs_task_status', priority: 'hs_task_priority', body: 'hs_task_body' },
  calls: {
    subject: 'hs_call_title',
    direction: 'hs_call_direction',
    durationMs: 'hs_call_duration',
    body: 'hs_call_body',
  },
  meetings: {
    subject: 'hs_meeting_title',
    startTime: 'hs_meeting_start_time',
    outcome: 'hs_meeting_outcome',
    body: 'hs_meeting_body',
  },
  emails: {
    subject: 'hs_email_subject',
    direction: 'hs_email_direction',
    status: 'hs_email_status',
    body: 'hs_email_text',
  },
}
const DEFAULT_TIMELINE_LIMIT = 20
const MAX_TIMELINE_IDS_PER_TYPE = 100
const MAX_ACTIVITY_BODY_CHARS = 1_000
const LISTS_PAGE_SIZE = 100
const LIST_MEMBERS_PAGE_SIZE = 100
const THREADS_PAGE_SIZE = 20
const MESSAGES_PAGE_SIZE = 100
const MAX_MESSAGE_CHARS = 2_000
const CONVERSATION_MESSAGE_TYPES = ['MESSAGE', 'COMMENT']
const CAMPAIGNS_PAGE_SIZE = 50
const CAMPAIGN_FIELDS = {
  name: 'hs_name',
  status: 'hs_campaign_status',
  startDate: 'hs_start_date',
  endDate: 'hs_end_date',
  goal: 'hs_goal',
  audience: 'hs_audience',
  notes: 'hs_notes',
  ownerId: 'hs_owner',
}
const MARKETING_EMAIL_FIELDS = {
  id: 'id',
  name: 'name',
  subject: 'subject',
  state: 'state',
  type: 'type',
  campaignId: 'campaign',
  publishDate: 'publishDate',
}
const MARKETING_EMAIL_SENDER_FIELDS = { name: 'fromName', replyTo: 'replyTo' }
const ASSOCIATION_QUERY_KEYS = ['association', 'associations']
const THREAD_ASSOCIATION_TYPES = { TICKET: 'tickets' }
const MAX_API_GET_CHARS = 20_000
const WRITABLE_ACTIVITY_TYPES = ['notes', 'tasks', 'calls', 'meetings']
const DEFAULT_OWNER_TYPES = ['notes', 'tasks']
const ATTRIBUTION = 'Via Soporti'
const ATTRIBUTION_SEPARATOR = ' · '
const ATTRIBUTION_BREAK = '<br>\n'
const SLACK_ATTRIBUTION_LABEL = 'Slack'
const DYNAMIC_LIST = 'DYNAMIC'
const REPLY_MESSAGE_TYPE = 'MESSAGE'
const CUSTOMER_DIRECTION = 'INCOMING'
const REPLY_RECIPIENT_FIELD = 'TO'
const AGENT_ACTOR_PREFIX = 'A-'
const UNSENDABLE_CHANNEL_RE = /whatsapp/i
const TRUNCATION_MARK = '…'
const MS_PER_SECOND = 1000
const NO_CONTENT_STATUS = 204
const FORBIDDEN_STATUS = 403
const NOT_FOUND_STATUS = 404
const RATE_LIMITED_STATUS = 429
const SERVER_ERROR_STATUS = 500
const TIMEOUT_ERROR = 'TimeoutError'
const MISSING_SCOPES_CATEGORY = 'MISSING_SCOPES'
const SCOPE_CONTEXT_KEYS = ['missingScopes', 'requiredGranularScopes']
const SCOPE_RE = /^[a-z][\w.-]{0,99}$/i
const RETRY_AFTER_SECONDS_RE = /^\d{1,6}$/
const RECORD_ID_RE = /^\d{1,20}$/
const HUBSPOT_APP_HOST_RE = /^app(-[a-z0-9]+)?\.hubspot\.com$/
const RECORD_PATH_RE =
  /^\/contacts\/(?<portalId>\d{1,20})\/record\/(?<objectTypeId>[02]-\d{1,20})\/(?<id>\d{1,20})(\/|$)/
const LEGACY_RECORD_PATH_RE =
  /^\/contacts\/(?<portalId>\d{1,20})\/(?<kind>contact|company|deal|ticket)\/(?<id>\d{1,20})(\/|$)/
const LEGACY_RECORD_TYPES = { contact: 'contacts', company: 'companies', deal: 'deals', ticket: 'tickets' }
const ASSOCIATION_FILTER_RE = /^associations\.(?<target>.+)$/i
const ASSOCIATION_FILTER_TYPES = {
  contact: 'contacts',
  company: 'companies',
  deal: 'deals',
  ticket: 'tickets',
  note: 'notes',
  task: 'tasks',
  call: 'calls',
  meeting: 'meetings',
  email: 'emails',
  product: 'products',
  line_item: 'line_items',
  quote: 'quotes',
}

const NOT_CONFIGURED_MESSAGE = 'HubSpot is not configured. An admin has to add a Service Key in /admin → HubSpot.'
const REJECTED_MESSAGE =
  'HubSpot rejected the key (401): it is invalid, expired or was revoked. An admin has to add a Service Key in /admin → HubSpot.'
const UNNAMED_SCOPE_MESSAGE =
  'The HubSpot key lacks a scope this request needs — compare it with the scopes listed in /admin → HubSpot and add the missing one in HubSpot → Settings → Service Keys.'
const FORBIDDEN_MESSAGE = 'HubSpot refused the request (403): the key is not allowed to do that in this account.'
const FAILURE_MESSAGES = {
  400: 'HubSpot refused the request as invalid (400): a property, value or filter is not valid for that object. Call describe_hubspot_object to check its properties and options, then retry.',
  401: REJECTED_MESSAGE,
  409: 'HubSpot refused the change because it conflicts with existing data (409): a record with the same unique value (such as an email or a domain) may already exist — search for it before creating another.',
  429: 'HubSpot is rate limiting this key (429): wait a moment and try again.',
}
const TIMEOUT_MESSAGE = `HubSpot did not answer within ${REQUEST_TIMEOUT_MS / MS_PER_SECOND} seconds: try again later.`
const UNREACHABLE_MESSAGE = 'HubSpot could not be reached: try again later.'
const CUSTOM_OBJECT_REQUIRED_MESSAGE =
  'Pass the custom object type: call list_hubspot_custom_objects and use its objectTypeId, name or fullyQualifiedName.'
const NO_ACTIVITY_TYPES_MESSAGE = `There are no activities to read: the timeline covers ${ACTIVITY_TYPES.join(', ')}, and reading activities has to be on in /admin → HubSpot.`
const ASSOCIATION_FAILED_MESSAGE = 'HubSpot could not link the records: retry with associate_hubspot_records.'
const ARCHIVE_RESTORE_NOTE =
  'HubSpot keeps an archived record restorable for 90 days, from HubSpot itself; after that it is deleted for good.'
const EMPTY_MEMBERSHIP_MESSAGE = 'Pass at least one record id or link to add to the list or to remove from it.'
const EMPTY_REPLY_MESSAGE = 'The reply is empty: pass the exact text the user approved.'
const NO_REPLY_USER_MESSAGE =
  'Replies to HubSpot conversations are sent as the HubSpot user of whoever asks for them, and there is no Soporti user with an email behind this request: nothing was sent.'
export const HUBSPOT_REQUEST_FAILED = 'HUBSPOT_REQUEST_FAILED'

const snapshots = new Map()

function hubspotFailure(message, cause) {
  const err = new Error(message, { cause })
  err.code = HUBSPOT_REQUEST_FAILED

  return err
}

function apiPath(family, ...segments) {
  return ['', family, HUBSPOT_API_VERSION, ...segments.map(segment => encodeURIComponent(segment))].join('/')
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function withValues(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => hasValue(value)))
}

function normalized(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function isShown(item) {
  return !item.hidden && !item.archived
}

function nextAfter(data) {
  return data.paging?.next?.after ?? null
}

function toQueryEntries([key, value]) {
  return [value]
    .flat()
    .filter(hasValue)
    .map(item => [key, String(item)])
}

function toQueryString(query) {
  const text = new URLSearchParams(Object.entries(query ?? {}).flatMap(toQueryEntries)).toString()

  return text ? `?${text}` : ''
}

function buildInit({ method, token, body }) {
  return {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorContexts(error) {
  const details = Array.isArray(error.errors) ? error.errors : []

  return [error.context, ...details.map(detail => detail?.context)].filter(isObject)
}

function missingScopes(error) {
  const named = errorContexts(error).flatMap(context => SCOPE_CONTEXT_KEYS.flatMap(key => [context[key] ?? []].flat()))

  return [...new Set(named.filter(scope => typeof scope === 'string' && SCOPE_RE.test(scope)))]
}

function describeMissingScopes(scopes) {
  const names = scopes.map(scope => `\`${scope}\``).join(', ')
  const noun = scopes.length === 1 ? 'scope' : 'scopes'
  const pronoun = scopes.length === 1 ? 'it' : 'them'

  return `The HubSpot key lacks the ${names} ${noun} — add ${pronoun} in HubSpot → Settings → Service Keys.`
}

function describeForbidden(error) {
  const scopes = missingScopes(error)

  if (scopes.length > 0) return describeMissingScopes(scopes)
  if (error.category === MISSING_SCOPES_CATEGORY) return UNNAMED_SCOPE_MESSAGE

  return FORBIDDEN_MESSAGE
}

function describeFailure({ method, path, status, error }) {
  if (status === FORBIDDEN_STATUS) return describeForbidden(error)
  if (status === NOT_FOUND_STATUS) {
    return `HubSpot found nothing at ${path} (404): the record does not exist, was archived or the id is wrong.`
  }
  if (Object.hasOwn(FAILURE_MESSAGES, status)) return FAILURE_MESSAGES[status]
  if (status >= SERVER_ERROR_STATUS) return `HubSpot is not answering properly right now (${status}): try again later.`

  return `HubSpot API ${method} ${path} failed (${status}).`
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function rateLimitWaitMs(retryAfter) {
  if (!RETRY_AFTER_SECONDS_RE.test(retryAfter ?? '')) return RATE_LIMIT_FALLBACK_WAIT_MS

  return Math.min(Number(retryAfter) * MS_PER_SECOND, RATE_LIMIT_MAX_WAIT_MS)
}

async function send(call) {
  try {
    return await fetch(call.url, buildInit(call))
  } catch (err) {
    console.error(`Failed to reach HubSpot at ${call.method} ${call.path}:`, err.cause?.code ?? err.name)
    throw hubspotFailure(err.name === TIMEOUT_ERROR ? TIMEOUT_MESSAGE : UNREACHABLE_MESSAGE, err)
  }
}

async function sendWithRetry(call) {
  const res = await send(call)
  if (res.status !== RATE_LIMITED_STATUS) return res

  await res.body?.cancel()
  await sleep(rateLimitWaitMs(res.headers.get('retry-after')))

  return send(call)
}

async function readError(res) {
  try {
    const error = await res.json()

    return isObject(error) ? error : {}
  } catch {
    return {}
  }
}

async function readBody(res, path) {
  try {
    return await res.json()
  } catch (err) {
    if (err.name === TIMEOUT_ERROR) throw hubspotFailure(TIMEOUT_MESSAGE, err)

    throw hubspotFailure(`HubSpot answered ${path} with something that is not JSON: try again later.`, err)
  }
}

async function requireToken() {
  const token = await getHubspotToken()
  if (!token) throw hubspotFailure(NOT_CONFIGURED_MESSAGE)

  return token
}

async function request(method, path, { query, body } = {}) {
  const token = await requireToken()
  const call = { method, path, token, body, url: `${BASE_URL}${path}${toQueryString(query)}` }

  const res = await sendWithRetry(call)
  if (!res.ok) throw hubspotFailure(describeFailure({ method, path, status: res.status, error: await readError(res) }))
  if (res.status === NO_CONTENT_STATUS) return null

  return readBody(res, path)
}

function recordRefFromUrl(url) {
  if (url.protocol !== 'https:' || !HUBSPOT_APP_HOST_RE.test(url.hostname)) return null

  const record = RECORD_PATH_RE.exec(url.pathname)?.groups
  if (record) return { id: record.id, objectTypeId: record.objectTypeId, portalId: Number(record.portalId) }

  const legacy = LEGACY_RECORD_PATH_RE.exec(url.pathname)?.groups
  if (!legacy) return null

  return {
    id: legacy.id,
    objectTypeId: objectTypeIdOf(LEGACY_RECORD_TYPES[legacy.kind]),
    portalId: Number(legacy.portalId),
  }
}

function isSnapshotFresh(snapshot, token) {
  return snapshot?.token === token && snapshot.expiresAt > Date.now()
}

async function cachedForKey(name, load, { fresh = false } = {}) {
  const token = await requireToken()
  const snapshot = snapshots.get(name)
  if (!fresh && isSnapshotFresh(snapshot, token)) return snapshot.value

  const value = await load()
  snapshots.set(name, { token, value, expiresAt: Date.now() + SNAPSHOT_TTL_MS })

  return value
}

async function loadAccountDetails() {
  const data = await request('GET', apiPath('account-info', 'details'))

  return {
    portalId: data.portalId ?? null,
    uiDomain: data.uiDomain ?? null,
    dataHostingLocation: data.dataHostingLocation ?? null,
  }
}

function buildRecordUrl({ portalId, uiDomain }, objectTypeId, id) {
  return `https://${uiDomain}/contacts/${portalId}/record/${objectTypeId}/${id}`
}

function objectTypeIdFor(type) {
  return objectTypeIdOf(type) ?? type
}

function toRecordSummary(record, { account, objectTypeId }) {
  return { id: record.id, url: buildRecordUrl(account, objectTypeId, record.id), properties: record.properties }
}

function countFilters(group) {
  return group.filters.length
}

function isValidSearchLimit(limit) {
  return Number.isInteger(limit) && limit >= 1 && limit <= HUBSPOT_MAX_SEARCH_LIMIT
}

function associationFilterType(target) {
  const name = target.toLowerCase()

  return Object.hasOwn(ASSOCIATION_FILTER_TYPES, name) ? ASSOCIATION_FILTER_TYPES[name] : name
}

function isReadableFilter(filter, permissions) {
  const target = ASSOCIATION_FILTER_RE.exec(filter.propertyName)?.groups.target
  if (!target) return true

  return isReadableObjectType(permissions, associationFilterType(target))
}

function unreadableFilterMessage({ propertyName }) {
  return `Searching through "${propertyName}" is not allowed: Soporti only filters by the associations of object types that are readable in /admin → HubSpot.`
}

function searchProblem({ filterGroups, limit, permissions }) {
  const counts = filterGroups.map(countFilters)
  const total = counts.reduce((sum, count) => sum + count, 0)
  const unreadable = filterGroups.flatMap(group => group.filters).find(filter => !isReadableFilter(filter, permissions))

  if (counts.length > HUBSPOT_MAX_FILTER_GROUPS) {
    return `HubSpot search takes at most ${HUBSPOT_MAX_FILTER_GROUPS} filter groups (got ${counts.length}): merge or drop some.`
  }
  if (counts.some(count => count > HUBSPOT_MAX_FILTERS_PER_GROUP)) {
    return `Each HubSpot filter group takes at most ${HUBSPOT_MAX_FILTERS_PER_GROUP} filters: split the group or drop some.`
  }
  if (total > HUBSPOT_MAX_FILTERS) {
    return `HubSpot search takes at most ${HUBSPOT_MAX_FILTERS} filters in total (got ${total}): drop some.`
  }
  if (hasValue(limit) && !isValidSearchLimit(limit)) {
    return `The HubSpot search limit must be a whole number from 1 to ${HUBSPOT_MAX_SEARCH_LIMIT}.`
  }
  if (unreadable) return unreadableFilterMessage(unreadable)

  return null
}

function toFilterGroup(group) {
  return { filters: group.filters.map(withValues) }
}

function searchBody({ query, filterGroups, properties, sorts, limit, after }) {
  return withValues({ query, filterGroups: filterGroups.map(toFilterGroup), properties, sorts, limit, after })
}

function typeMismatchMessage(linkedObjectTypeId, type) {
  const linkedType = objectTypeOf(linkedObjectTypeId)
  const mismatch = `That HubSpot link is for a ${linkedObjectTypeId} record, not ${type}`

  if (linkedType === CUSTOM_TYPE) {
    return `${mismatch}: retry with objectType "${CUSTOM_TYPE}" and customObjectType "${linkedObjectTypeId}".`
  }
  if (linkedType) return `${mismatch}: retry with objectType "${linkedType}".`

  return `${mismatch}, and Soporti does not read that kind of record.`
}

function refProblem(ref, { type, account }) {
  if (ref.objectTypeId !== null && ref.objectTypeId !== objectTypeIdFor(type)) {
    return typeMismatchMessage(ref.objectTypeId, type)
  }
  if (ref.portalId !== null && ref.portalId !== account.portalId) {
    return `That HubSpot link is from portal ${ref.portalId}, but Soporti is connected to portal ${account.portalId}: share the id or link of the record in the connected portal.`
  }

  return null
}

function toAssociationGroup([key, group]) {
  const type = objectTypeOf(key)
  const ids = [...new Set(group.results.map(result => String(result.id)))]

  if (type === CUSTOM_TYPE) return { type, customObjectType: key, ids }

  return { type, ids }
}

function toAssociationGroups(associations, permissions) {
  return Object.entries(associations ?? {})
    .filter(([key]) => isReadableObjectType(permissions, key))
    .map(toAssociationGroup)
}

function ownerName({ firstName, lastName }) {
  return [firstName, lastName].filter(Boolean).join(' ') || null
}

function toOwnerSummary(owner) {
  return {
    id: owner.id,
    userId: owner.userId ?? null,
    email: owner.email,
    name: ownerName(owner),
    teams: (owner.teams ?? []).map(team => team.name),
  }
}

function isReadOnlyProperty(property) {
  return property.modificationMetadata?.readOnlyValue === true || property.calculated === true
}

function toOptionSummary({ label, value }) {
  return { label, value }
}

function toPropertySummary(property) {
  const options = property.options.filter(isShown)
  const summary = {
    name: property.name,
    label: property.label,
    type: property.type,
    readOnly: isReadOnlyProperty(property),
    options: options.slice(0, MAX_PROPERTY_OPTIONS).map(toOptionSummary),
  }
  if (options.length <= MAX_PROPERTY_OPTIONS) return summary

  return { ...summary, omittedOptions: options.length - MAX_PROPERTY_OPTIONS }
}

function toStageSummary({ id, label }) {
  return { id, label }
}

function toPipelineSummary(pipeline) {
  return { id: pipeline.id, label: pipeline.label, stages: pipeline.stages.filter(isShown).map(toStageSummary) }
}

async function listProperties(type) {
  const data = await request('GET', apiPath('crm/properties', type))

  return data.results.filter(isShown).map(toPropertySummary)
}

async function listPipelines(type) {
  if (!PIPELINE_TYPES.includes(type)) return []

  const data = await request('GET', apiPath('crm/pipelines', type))

  return data.results.filter(isShown).map(toPipelineSummary)
}

function toCustomObjectSummary(schema) {
  return {
    objectTypeId: schema.objectTypeId,
    name: schema.name,
    fullyQualifiedName: schema.fullyQualifiedName,
    label: schema.labels.plural,
    primaryDisplayProperty: schema.primaryDisplayProperty ?? null,
  }
}

async function loadCustomObjects() {
  const data = await request('GET', apiPath('crm-object-schemas', 'schemas'))

  return data.results.filter(isShown).map(toCustomObjectSummary)
}

function isCustomObjectNamed(object, wanted) {
  return [object.objectTypeId, object.name, object.fullyQualifiedName].some(
    candidate => normalized(candidate) === wanted
  )
}

async function readRecordRef(type, idOrUrl) {
  const ref = parseRecordRef(idOrUrl)
  const account = await getAccountDetails()
  const problem = refProblem(ref, { type, account })
  if (problem) throw hubspotFailure(problem)

  return { id: ref.id, account }
}

function truncateText(text, maxChars) {
  if (text.length <= maxChars) return text

  return `${text.slice(0, maxChars)}${TRUNCATION_MARK}`
}

function cleanText(html, maxChars) {
  return truncateText(stripHtml(html), maxChars)
}

function pickFields(source, fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, name]) => [key, source[name] ?? null]))
}

function timelineTypes(types, permissions) {
  const wanted = types ?? ACTIVITY_TYPES

  return ACTIVITY_TYPES.filter(type => wanted.includes(type) && isReadableObjectType(permissions, type))
}

function newestIdFirst(a, b) {
  return b.length - a.length || b.localeCompare(a)
}

function toActivity(type, record, fields) {
  const { body, ...details } = pickFields(record.properties, fields)

  return { type, id: record.id, ...details, body: cleanText(body, MAX_ACTIVITY_BODY_CHARS) }
}

async function readActivities({ type, ids }) {
  const fields = { ...ACTIVITY_BASE_FIELDS, ...ACTIVITY_FIELDS[type] }
  const latestIds = [...ids].sort(newestIdFirst).slice(0, MAX_TIMELINE_IDS_PER_TYPE)
  const data = await request('POST', apiPath('crm/objects', type, 'batch', 'read'), {
    body: { inputs: latestIds.map(id => ({ id })), properties: Object.values(fields), propertiesWithHistory: [] },
  })

  return data.results.map(record => toActivity(type, record, fields))
}

function activityTime(activity) {
  return Date.parse(activity.timestamp) || 0
}

function newestActivityFirst(a, b) {
  return activityTime(b) - activityTime(a)
}

function countIds(groups) {
  return groups.reduce((sum, group) => sum + group.ids.length, 0)
}

function toListSummary(list, size) {
  return {
    id: list.listId,
    name: list.name,
    objectType: objectTypeOf(list.objectTypeId),
    objectTypeId: list.objectTypeId,
    processingType: list.processingType,
    size,
  }
}

function toSearchedList(list) {
  const size = list.additionalProperties?.hs_list_size

  return toListSummary(list, hasValue(size) ? Number(size) : null)
}

function listKind(list) {
  return objectTypeOf(list.objectTypeId) ?? list.objectTypeId
}

function unreadableListMessage(list) {
  return `The HubSpot list "${list.name}" holds ${listKind(list)} records, and reading them is off in /admin → HubSpot.`
}

function isReadableList(list, permissions) {
  return isReadableObjectType(permissions, list.objectTypeId)
}

function assertReadableList(list, permissions) {
  if (!isReadableList(list, permissions)) throw hubspotFailure(unreadableListMessage(list))

  return list
}

function readableLists(lists, permissions) {
  return lists.filter(list => isReadableList(list, permissions))
}

function readableListResponse(data, permissions) {
  if (isObject(data?.list)) assertReadableList(data.list, permissions)
  if (!Array.isArray(data?.lists)) return data

  return { ...data, lists: readableLists(data.lists, permissions) }
}

async function readableList(listId, permissions) {
  const { list } = await request('GET', apiPath('crm/lists', listId))

  return assertReadableList(list, permissions)
}

function dynamicListMessage(list) {
  return `The HubSpot list "${list.name}" is an active list: HubSpot adds and removes its records from its filters, so its members cannot be changed by hand. Change its filters in HubSpot instead.`
}

function listMemberId(idOrUrl, { list, account }) {
  const ref = parseRecordRef(idOrUrl)
  if (ref.objectTypeId !== null && ref.objectTypeId !== list.objectTypeId) {
    throw hubspotFailure(
      `That HubSpot link is for a ${ref.objectTypeId} record, but the list "${list.name}" holds ${listKind(list)} records.`
    )
  }

  const problem = refProblem(ref, { type: list.objectTypeId, account })
  if (problem) throw hubspotFailure(problem)

  return ref.id
}

function toListMember(member, { account, objectTypeId }) {
  const id = String(member.recordId)

  return { id, url: buildRecordUrl(account, objectTypeId, id), addedAt: member.membershipTimestamp }
}

function toThreadSummary(thread) {
  return {
    id: thread.id,
    status: thread.status,
    inboxId: thread.inboxId,
    channelId: thread.originalChannelId,
    associatedContactId: thread.associatedContactId,
    assignedTo: thread.assignedTo ?? null,
    createdAt: thread.createdAt,
    closedAt: thread.closedAt ?? null,
    latestMessageAt: thread.latestMessageTimestamp ?? null,
  }
}

function toActor(actor) {
  return { actorId: actor.actorId ?? null, name: actor.name ?? null, address: actor.deliveryIdentifier?.value ?? null }
}

function isConversationMessage(message) {
  return CONVERSATION_MESSAGE_TYPES.includes(message.type)
}

function toMessage(message) {
  return {
    id: message.id,
    type: message.type,
    direction: message.direction ?? null,
    createdAt: message.createdAt,
    subject: message.subject ?? null,
    from: (message.senders ?? []).map(toActor),
    to: (message.recipients ?? []).map(toActor),
    text: cleanText(message.text, MAX_MESSAGE_CHARS),
  }
}

function toCampaignSummary(campaign) {
  return { id: campaign.id, ...pickFields(campaign.properties, CAMPAIGN_FIELDS) }
}

function toEmailStats(stats) {
  if (!stats) return null

  return { counters: stats.counters, ratios: stats.ratios }
}

function toMarketingEmail(email) {
  return {
    ...pickFields(email, MARKETING_EMAIL_FIELDS),
    from: pickFields(email.from ?? {}, MARKETING_EMAIL_SENDER_FIELDS),
    stats: toEmailStats(email.stats),
  }
}

function queryAssociationTypes(query) {
  return Object.entries(query ?? {})
    .filter(([key]) => ASSOCIATION_QUERY_KEYS.includes(key.toLowerCase()))
    .flatMap(([, value]) => [value].flat().filter(hasValue))
    .flatMap(value => String(value).split(','))
    .map(value => value.trim())
    .filter(Boolean)
}

function isReadableQueryAssociation(permissions, value) {
  const type = Object.hasOwn(THREAD_ASSOCIATION_TYPES, value) ? THREAD_ASSOCIATION_TYPES[value] : value

  return isReadableObjectType(permissions, type)
}

function apiGetProblem(path, query, permissions) {
  if (!isAllowedGetPath(permissions, path)) {
    return `Soporti does not let hubspot_api_get read ${path}: only GET paths of the CRM, conversations, marketing and account APIs are allowed, and only for areas that are at least read in /admin → HubSpot. List members are read with get_hubspot_list_members.`
  }

  const blocked = queryAssociationTypes(query).find(value => !isReadableQueryAssociation(permissions, value))
  if (blocked) {
    return `Soporti does not let hubspot_api_get read "${blocked}" associations: that object type is unknown or its area is off in /admin → HubSpot.`
  }

  return null
}

function boundedResponse(data) {
  const text = JSON.stringify(data)
  if (text.length <= MAX_API_GET_CHARS) return { truncated: false, data }

  return { truncated: true, totalChars: text.length, partialJson: text.slice(0, MAX_API_GET_CHARS) }
}

function activityBodyProperty(type) {
  return WRITABLE_ACTIVITY_TYPES.includes(type) ? ACTIVITY_FIELDS[type].body : null
}

async function loadUser(userId) {
  return userId ? findUserById(userId) : null
}

function attributionLabel(user) {
  if (!user) return null

  return user.name || user.email || SLACK_ATTRIBUTION_LABEL
}

function attributionHeader(user) {
  const label = attributionLabel(user)

  return label ? `${ATTRIBUTION}${ATTRIBUTION_SEPARATOR}${label}` : ATTRIBUTION
}

function signedBody(body, header) {
  if (!body) return header
  if (body.trimStart().startsWith(header)) return body

  return `${header}${ATTRIBUTION_BREAK}${body}`
}

function withAttribution(type, properties, user) {
  const bodyProperty = activityBodyProperty(type)

  return { ...properties, [bodyProperty]: signedBody(properties[bodyProperty], attributionHeader(user)) }
}

function redactProperties(properties) {
  return Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, redactSecrets(value)]))
}

async function defaultOwnerId(type, properties, user) {
  if (!DEFAULT_OWNER_TYPES.includes(type) || hasValue(properties.hubspot_owner_id) || !user?.email) return null

  const owner = await findOwnerByEmail(user.email)

  return owner?.id ?? null
}

async function createdActivityProperties(type, properties, userId) {
  const user = await loadUser(userId)
  const defaults = withValues({
    hs_timestamp: hasValue(properties.hs_timestamp) ? null : new Date().toISOString(),
    hubspot_owner_id: await defaultOwnerId(type, properties, user),
  })

  return withAttribution(type, { ...properties, ...defaults }, user)
}

async function createdProperties(type, properties, userId) {
  if (!activityBodyProperty(type)) return properties

  return createdActivityProperties(type, properties, userId)
}

async function updatedProperties(type, properties, userId) {
  const bodyProperty = activityBodyProperty(type)
  if (!bodyProperty || !Object.hasOwn(properties, bodyProperty)) return properties

  return withAttribution(type, properties, await loadUser(userId))
}

function unknownLabelMessage({ fromType, toType, label, specs }) {
  const labels = [...new Set(specs.map(spec => spec.label).filter(hasValue))].map(name => `"${name}"`)
  const options = labels.length > 0 ? `Its labels are ${labels.join(', ')}.` : 'It has no labels.'

  return `"${label}" is not an association label from ${fromType} to ${toType} in this HubSpot account. ${options} Leave the label empty to link the records with the default association.`
}

async function findAssociationSpec({ fromType, toType, label }) {
  const data = await request('GET', apiPath('crm/associations', fromType, toType, 'labels'))
  const spec = data.results.find(result => normalized(result.label) === normalized(label))
  if (!spec) throw hubspotFailure(unknownLabelMessage({ fromType, toType, label, specs: data.results }))

  return spec
}

async function linkWithLabel({ fromType, fromId, toType, toId, label }) {
  const spec = await findAssociationSpec({ fromType, toType, label })
  await request('PUT', apiPath('crm/objects', fromType, fromId, 'associations', toType, toId), {
    body: [{ associationCategory: spec.category, associationTypeId: spec.typeId }],
  })

  return spec.label
}

async function linkByDefault({ fromType, fromId, toType, toId }) {
  await request('PUT', apiPath('crm/objects', fromType, fromId, 'associations', 'default', toType, toId))

  return null
}

function linkedRecord(type, { id, account }) {
  return { type, id, url: buildRecordUrl(account, objectTypeIdFor(type), id) }
}

function failureReason(err) {
  return err.code === HUBSPOT_REQUEST_FAILED ? err.message : ASSOCIATION_FAILED_MESSAGE
}

function toAssociationOutcome(settled, { toType, toId }) {
  if (settled.status === 'fulfilled') return { ...settled.value.to, associated: true }

  return { type: toType, id: toId, associated: false, error: failureReason(settled.reason) }
}

async function readLinkEnds({ fromType, fromId, toType, toId }) {
  const from = await readRecordRef(fromType, fromId)
  const to = await readRecordRef(toType, toId)

  return { from, to }
}

async function replySender(userId) {
  const user = await loadUser(userId)
  if (!user?.email) throw hubspotFailure(NO_REPLY_USER_MESSAGE)

  const owner = await findOwnerByEmail(user.email)
  if (!owner) {
    throw hubspotFailure(
      `No HubSpot user matches ${user.email} — replies are sent as your own HubSpot user, so nothing was sent.`
    )
  }
  if (!owner.userId) {
    throw hubspotFailure(
      `The HubSpot owner matching ${user.email} has no active HubSpot user (it may be deactivated) — replies are sent as your own HubSpot user, so nothing was sent.`
    )
  }

  return owner
}

function isCustomerMessage(message) {
  return message.direction === CUSTOMER_DIRECTION
}

function newestMessageFirst(a, b) {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt)
}

async function readCustomerMessages(threadId) {
  const path = apiPath('conversations/conversations', 'threads', threadId, 'messages')
  const messages = []
  let after = null

  do {
    const data = await request('GET', path, { query: { after, limit: MESSAGES_PAGE_SIZE } })
    messages.push(...data.results.filter(isCustomerMessage))
    after = nextAfter(data)
  } while (after)

  return messages
}

async function lastCustomerMessage(threadId) {
  const [message] = (await readCustomerMessages(threadId)).sort(newestMessageFirst)
  if (!message) {
    throw hubspotFailure(
      `The HubSpot thread ${threadId} has no message from the customer to reply to: nothing was sent.`
    )
  }

  return message
}

async function replyChannel(threadId, message) {
  const channel = await request('GET', apiPath('conversations/conversations', 'channels', message.channelId))
  if (UNSENDABLE_CHANNEL_RE.test(channel.name)) {
    throw hubspotFailure(
      `HubSpot does not let apps send ${channel.name} messages: reply to thread ${threadId} from the HubSpot inbox instead. Nothing was sent.`
    )
  }

  return channel
}

function toRecipient(sender) {
  return withValues({
    actorId: sender.actorId,
    name: sender.name,
    recipientField: REPLY_RECIPIENT_FIELD,
    deliveryIdentifiers: [sender.deliveryIdentifier].filter(Boolean),
  })
}

function replyBody({ text, owner, message }) {
  return withValues({
    type: REPLY_MESSAGE_TYPE,
    text: redactSecrets(text),
    senderActorId: `${AGENT_ACTOR_PREFIX}${owner.userId}`,
    channelId: message.channelId,
    channelAccountId: message.channelAccountId,
    recipients: message.senders.map(toRecipient),
    subject: message.subject,
    attachments: [],
  })
}

async function sendReply(threadId, { body, owner }) {
  try {
    return await request('POST', apiPath('conversations/conversations', 'threads', threadId, 'messages'), { body })
  } catch (err) {
    if (err.message !== FORBIDDEN_MESSAGE) throw err

    throw hubspotFailure(
      `HubSpot refused to send the reply as ${owner.email}: check that this HubSpot user can reply in the inbox of thread ${threadId}. Nothing was sent.`,
      err
    )
  }
}

export function getAccountDetails(options) {
  return cachedForKey(ACCOUNT_SNAPSHOT, loadAccountDetails, options)
}

export function parseRecordRef(idOrUrl) {
  const raw = String(idOrUrl ?? '').trim()
  if (RECORD_ID_RE.test(raw)) return { id: raw, objectTypeId: null, portalId: null }

  const ref = URL.canParse(raw) ? recordRefFromUrl(new URL(raw)) : null
  if (!ref) {
    throw hubspotFailure(
      `"${raw}" is not a HubSpot record id or link: pass the numeric id or the record URL from HubSpot.`
    )
  }

  return ref
}

export async function searchRecords(type, options = {}) {
  const search = { ...options, filterGroups: options.filterGroups ?? [] }
  const problem = searchProblem(search)
  if (problem) throw hubspotFailure(problem)

  const data = await request('POST', apiPath('crm/objects', type, 'search'), { body: searchBody(search) })
  const account = await getAccountDetails()
  const objectTypeId = objectTypeIdFor(type)

  return {
    total: data.total,
    results: data.results.map(record => toRecordSummary(record, { account, objectTypeId })),
    after: nextAfter(data),
  }
}

export async function getRecord(type, idOrUrl, { properties, associations, permissions } = {}) {
  const { id, account } = await readRecordRef(type, idOrUrl)
  const readable = (associations ?? []).filter(value => isReadableObjectType(permissions, value))
  const record = await request('GET', apiPath('crm/objects', type, id), {
    query: { properties, associations: readable },
  })

  return {
    ...toRecordSummary(record, { account, objectTypeId: objectTypeIdFor(type) }),
    associations: toAssociationGroups(record.associations, permissions),
  }
}

export async function listOwners({ email, after } = {}) {
  const query = { email, after, limit: OWNERS_PAGE_SIZE, archived: false }
  const data = await request('GET', apiPath('crm/owners'), { query })

  return { owners: data.results.filter(isShown).map(toOwnerSummary), after: nextAfter(data) }
}

export async function findOwnerByEmail(email) {
  const wanted = normalized(email)
  if (!wanted) return null

  const { owners } = await listOwners({ email: wanted })

  return owners.find(owner => normalized(owner.email) === wanted) ?? null
}

export async function describeObject(type) {
  const [properties, pipelines] = await Promise.all([listProperties(type), listPipelines(type)])

  return { properties, pipelines }
}

export function listCustomObjects() {
  return cachedForKey(CUSTOM_OBJECTS_SNAPSHOT, loadCustomObjects)
}

export async function resolveCustomObjectType(value) {
  const wanted = normalized(value)
  if (!wanted) throw hubspotFailure(CUSTOM_OBJECT_REQUIRED_MESSAGE)

  const match = (await listCustomObjects()).find(object => isCustomObjectNamed(object, wanted))
  if (!match) {
    throw hubspotFailure(
      `"${String(value).trim()}" is not a custom object in this HubSpot account: call list_hubspot_custom_objects and use its objectTypeId, name or fullyQualifiedName.`
    )
  }

  return match
}

export async function getTimeline(type, idOrUrl, { types, limit, permissions } = {}) {
  const wanted = timelineTypes(types, permissions)
  if (wanted.length === 0) throw hubspotFailure(NO_ACTIVITY_TYPES_MESSAGE)

  const { id, account } = await readRecordRef(type, idOrUrl)
  const record = await request('GET', apiPath('crm/objects', type, id), { query: { associations: wanted } })
  const groups = toAssociationGroups(record.associations, permissions).filter(
    group => wanted.includes(group.type) && group.ids.length > 0
  )
  const activities = (await Promise.all(groups.map(readActivities))).flat().sort(newestActivityFirst)
  const shown = activities.slice(0, limit ?? DEFAULT_TIMELINE_LIMIT)
  const total = countIds(groups)

  return {
    id,
    url: buildRecordUrl(account, objectTypeIdFor(type), id),
    activities: shown,
    total,
    truncated: shown.length < total,
  }
}

export async function searchLists({ query, offset, permissions } = {}) {
  const body = withValues({
    query,
    offset: offset ?? 0,
    count: LISTS_PAGE_SIZE,
    listIds: [],
    processingTypes: [],
    additionalProperties: [],
  })
  const data = await request('POST', apiPath('crm/lists', 'search'), { body })

  const lists = readableLists(data.lists, permissions).map(toSearchedList)

  return { total: data.total, lists, nextOffset: data.hasMore ? data.offset : null }
}

export async function getListMembers(listId, { after, permissions } = {}) {
  const list = await readableList(listId, permissions)
  const query = { after, limit: LIST_MEMBERS_PAGE_SIZE }
  const data = await request('GET', apiPath('crm/lists', listId, 'memberships'), { query })
  const target = { account: await getAccountDetails(), objectTypeId: list.objectTypeId }

  return {
    list: toListSummary(list, list.size ?? null),
    members: data.results.map(member => toListMember(member, target)),
    after: nextAfter(data),
  }
}

export async function listConversations({ status, inboxId, contactId, limit, after } = {}) {
  const query = {
    threadStatus: status,
    inboxId,
    associatedContactId: contactId,
    limit: limit ?? THREADS_PAGE_SIZE,
    after,
  }
  const data = await request('GET', apiPath('conversations/conversations', 'threads'), { query })

  return { threads: data.results.map(toThreadSummary), after: nextAfter(data) }
}

export async function getConversation(threadId, { after } = {}) {
  const [thread, data] = await Promise.all([
    request('GET', apiPath('conversations/conversations', 'threads', threadId)),
    request('GET', apiPath('conversations/conversations', 'threads', threadId, 'messages'), {
      query: { after, limit: MESSAGES_PAGE_SIZE },
    }),
  ])

  return {
    thread: toThreadSummary(thread),
    messages: data.results.filter(isConversationMessage).map(toMessage),
    after: nextAfter(data),
  }
}

export async function listCampaigns({ name, after } = {}) {
  const query = { name, after, limit: CAMPAIGNS_PAGE_SIZE, properties: Object.values(CAMPAIGN_FIELDS) }
  const data = await request('GET', apiPath('marketing/campaigns'), { query })

  return { total: data.total, campaigns: data.results.map(toCampaignSummary), after: nextAfter(data) }
}

export async function getMarketingEmail(emailId) {
  const email = await request('GET', apiPath('marketing/emails', emailId), { query: { includeStats: true } })

  return toMarketingEmail(email)
}

export async function apiGet(path, query, permissions) {
  const problem = apiGetProblem(path, query, permissions)
  if (problem) throw hubspotFailure(problem)

  const data = await request('GET', path, { query })

  return boundedResponse(isListPath(path) ? readableListResponse(data, permissions) : data)
}

export async function createRecord(type, { properties, associations = [] }, { userId } = {}) {
  const account = await getAccountDetails()
  const prepared = await createdProperties(type, properties, userId)
  const created = await request('POST', apiPath('crm/objects', type), {
    body: { properties: redactProperties(prepared), associations: [] },
  })
  const links = await Promise.allSettled(
    associations.map(({ toType, toId }) => associateRecords({ fromType: type, fromId: created.id, toType, toId }))
  )

  return {
    ...toRecordSummary(created, { account, objectTypeId: objectTypeIdFor(type) }),
    associations: links.map((settled, index) => toAssociationOutcome(settled, associations[index])),
  }
}

export async function updateRecord(type, idOrUrl, properties, { userId } = {}) {
  const { id, account } = await readRecordRef(type, idOrUrl)
  const prepared = await updatedProperties(type, properties, userId)
  const updated = await request('PATCH', apiPath('crm/objects', type, id), {
    body: { properties: redactProperties(prepared) },
  })

  return toRecordSummary(updated, { account, objectTypeId: objectTypeIdFor(type) })
}

export async function associateRecords({ fromType, fromId, toType, toId, label }) {
  const { from, to } = await readLinkEnds({ fromType, fromId, toType, toId })
  const link = { fromType, fromId: from.id, toType, toId: to.id, label }
  const linkedLabel = normalized(label) ? await linkWithLabel(link) : await linkByDefault(link)

  return { from: linkedRecord(fromType, from), to: linkedRecord(toType, to), label: linkedLabel }
}

export async function removeAssociation({ fromType, fromId, toType, toId }) {
  const { from, to } = await readLinkEnds({ fromType, fromId, toType, toId })
  await request('DELETE', apiPath('crm/objects', fromType, from.id, 'associations', toType, to.id))

  return { from: linkedRecord(fromType, from), to: linkedRecord(toType, to), removed: true }
}

export async function archiveRecord(type, idOrUrl) {
  const { id } = await readRecordRef(type, idOrUrl)
  await request('DELETE', apiPath('crm/objects', type, id))

  return { type, id, archived: true, restore: ARCHIVE_RESTORE_NOTE }
}

export async function mergeRecords(type, primaryIdOrUrl, mergedIdOrUrl) {
  const primary = await readRecordRef(type, primaryIdOrUrl)
  const merged = await readRecordRef(type, mergedIdOrUrl)
  if (primary.id === merged.id) {
    throw hubspotFailure(`Both records are ${type} ${primary.id}: pass two different records to merge.`)
  }

  const objectTypeId = objectTypeIdFor(type)
  const record = await request('POST', apiPath('crm/objects', objectTypeId, 'merge'), {
    body: { primaryObjectId: primary.id, objectIdToMerge: merged.id },
  })

  return { ...toRecordSummary(record, { account: primary.account, objectTypeId }), mergedId: merged.id }
}

export async function updateListMembership(listId, { add, remove, permissions } = {}) {
  const changes = { add: add ?? [], remove: remove ?? [] }
  if (changes.add.length + changes.remove.length === 0) throw hubspotFailure(EMPTY_MEMBERSHIP_MESSAGE)

  const list = await readableList(listId, permissions)
  if (list.processingType === DYNAMIC_LIST) throw hubspotFailure(dynamicListMessage(list))

  const target = { list, account: await getAccountDetails() }
  const body = {
    recordIdsToAdd: changes.add.map(idOrUrl => listMemberId(idOrUrl, target)),
    recordIdsToRemove: changes.remove.map(idOrUrl => listMemberId(idOrUrl, target)),
  }
  const data = await request('PUT', apiPath('crm/lists', listId, 'memberships', 'add-and-remove'), { body })

  return {
    list: { id: list.listId, name: list.name },
    added: data.recordsIdsAdded,
    removed: data.recordIdsRemoved,
    missing: data.recordIdsMissing,
  }
}

export async function replyToConversation(threadId, text, { userId } = {}) {
  if (!normalized(text)) throw hubspotFailure(EMPTY_REPLY_MESSAGE)

  const owner = await replySender(userId)
  const message = await lastCustomerMessage(threadId)
  const channel = await replyChannel(threadId, message)
  const sent = await sendReply(threadId, { body: replyBody({ text, owner, message }), owner })

  return {
    threadId,
    messageId: sent.id,
    sentBy: { name: owner.name, email: owner.email },
    channel: channel.name,
    to: message.senders.map(toActor),
  }
}

export async function isConfigured() {
  return isHubspotConfigured()
}

export function _resetHubspotClientCachesForTests() {
  snapshots.clear()
}
