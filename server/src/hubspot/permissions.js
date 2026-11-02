const OFF = 'off'
const READ = 'read'
const WRITE = 'write'
const FULL = 'full'
const REPLY = 'reply'
const DEFAULT_LEVEL = READ
const CUSTOM_TYPE = 'custom'

const OBJECT_LEVELS = [OFF, READ, WRITE, FULL]
const LIST_LEVELS = [OFF, READ, WRITE]
const CONVERSATION_LEVELS = [OFF, READ, REPLY]
const READ_ONLY_LEVELS = [OFF, READ]

const LEVEL_INCLUDES = {
  [OFF]: [],
  [READ]: [READ],
  [WRITE]: [READ, WRITE],
  [FULL]: [READ, WRITE, FULL],
  [REPLY]: [READ, REPLY],
}

const OWNERS_SCOPE = 'crm.objects.owners.read'

const AREAS = [
  {
    id: 'contacts',
    label: 'Contacts',
    levels: OBJECT_LEVELS,
    objectTypes: [{ type: 'contacts', objectTypeId: '0-1' }],
    scopes: { [READ]: ['crm.objects.contacts.read'], [WRITE]: ['crm.objects.contacts.write'] },
  },
  {
    id: 'companies',
    label: 'Companies',
    levels: OBJECT_LEVELS,
    objectTypes: [{ type: 'companies', objectTypeId: '0-2' }],
    scopes: { [READ]: ['crm.objects.companies.read'], [WRITE]: ['crm.objects.companies.write'] },
  },
  {
    id: 'deals',
    label: 'Deals',
    levels: OBJECT_LEVELS,
    objectTypes: [{ type: 'deals', objectTypeId: '0-3' }],
    scopes: { [READ]: ['crm.objects.deals.read'], [WRITE]: ['crm.objects.deals.write'] },
  },
  {
    id: 'tickets',
    label: 'Tickets',
    levels: OBJECT_LEVELS,
    objectTypes: [{ type: 'tickets', objectTypeId: '0-5' }],
    scopes: { [READ]: ['crm.objects.tickets.read'], [WRITE]: ['crm.objects.tickets.write'] },
  },
  {
    id: 'activities',
    label: 'Activities',
    levels: OBJECT_LEVELS,
    objectTypes: [
      { type: 'notes', objectTypeId: '0-46' },
      { type: 'tasks', objectTypeId: '0-27' },
      { type: 'calls', objectTypeId: '0-48' },
      { type: 'meetings', objectTypeId: '0-47' },
      { type: 'emails', objectTypeId: '0-49' },
    ],
    scopes: { [READ]: ['crm.objects.contacts.read', 'sales-email-read'], [WRITE]: ['crm.objects.contacts.write'] },
  },
  {
    id: 'commerce',
    label: 'Commerce',
    levels: OBJECT_LEVELS,
    objectTypes: [
      { type: 'products', objectTypeId: '0-7' },
      { type: 'line_items', objectTypeId: '0-8' },
      { type: 'quotes', objectTypeId: '0-14' },
    ],
    scopes: {
      [READ]: ['crm.objects.products.read', 'crm.objects.line_items.read', 'crm.objects.quotes.read'],
      [WRITE]: ['crm.objects.products.write', 'crm.objects.line_items.write'],
    },
  },
  {
    id: 'custom',
    label: 'Custom objects',
    levels: OBJECT_LEVELS,
    objectTypes: [{ type: CUSTOM_TYPE, objectTypeId: null }],
    scopes: {
      [READ]: ['crm.objects.custom.read', 'crm.schemas.custom.read'],
      [WRITE]: ['crm.objects.custom.write'],
    },
  },
  {
    id: 'lists',
    label: 'Lists',
    levels: LIST_LEVELS,
    objectTypes: [],
    scopes: { [READ]: ['crm.lists.read'], [WRITE]: ['crm.lists.write'] },
  },
  {
    id: 'conversations',
    label: 'Conversations',
    levels: CONVERSATION_LEVELS,
    objectTypes: [],
    scopes: { [READ]: ['conversations.read'], [REPLY]: ['conversations.write'] },
  },
  {
    id: 'marketing',
    label: 'Marketing',
    levels: READ_ONLY_LEVELS,
    objectTypes: [],
    scopes: { [READ]: ['marketing.campaigns.read', 'marketing-email'] },
  },
]

const TYPE_AREAS = Object.fromEntries(AREAS.flatMap(area => area.objectTypes.map(({ type }) => [type, area.id])))
const TYPE_OBJECT_IDS = Object.fromEntries(
  AREAS.flatMap(area => area.objectTypes.map(({ type, objectTypeId }) => [type, objectTypeId]))
)

const WRITABLE_TYPES = [
  'contacts',
  'companies',
  'deals',
  'tickets',
  'notes',
  'tasks',
  'calls',
  'meetings',
  'products',
  'line_items',
  CUSTOM_TYPE,
]
const MERGEABLE_TYPES = ['contacts', 'companies', 'deals', 'tickets']

const OBJECT_ACTIONS = {
  read: { level: READ, types: Object.keys(TYPE_AREAS) },
  create: { level: WRITE, types: WRITABLE_TYPES },
  update: { level: WRITE, types: WRITABLE_TYPES },
  associate: { level: WRITE, types: WRITABLE_TYPES },
  archive: { level: FULL, types: WRITABLE_TYPES },
  unassociate: { level: FULL, types: WRITABLE_TYPES },
  merge: { level: FULL, types: MERGEABLE_TYPES },
}

const ACTION_RUN_REQUIREMENTS = {
  archive: ['attended'],
  merge: ['attended'],
  unassociate: ['attended'],
  list_membership: ['attended'],
  reply: ['attended', 'canReply'],
}

const PATH_SEGMENT_RE = /^[\w@+-]+(\.[\w@+-]+)*$/
const API_VERSION_RE = /^(v3|v4|\d{4}-\d{2})$/
const CUSTOM_PATH_TYPE_RE = /^(2-\d+|p\d*_\w+)$/
const API_VERSION_POSITIONS = [1, 2]
const ASSOCIATIONS_SEGMENT = 'associations'
const MEMBERSHIPS_SEGMENT = 'memberships'

const PATH_OBJECT_TYPES = Object.fromEntries(
  AREAS.flatMap(area =>
    area.objectTypes
      .filter(({ objectTypeId }) => objectTypeId)
      .flatMap(({ type, objectTypeId }) => [
        [type, type],
        [objectTypeId, type],
      ])
  )
)

const LISTS_FAMILY = 'crm/lists'
const PATH_FAMILY_ALIASES = { 'crm-object-schemas/schemas': 'crm/schemas' }

const GET_PATH_RULES = {
  'account-info/details': isOpenPath,
  'crm/owners': isOpenPath,
  'crm/objects': isReadableObjectPath,
  'crm/properties': isReadableTypePath,
  'crm/pipelines': isReadableTypePath,
  'crm/schemas': areaReadRule('custom'),
  [LISTS_FAMILY]: isReadableListPath,
  'conversations/conversations': areaReadRule('conversations'),
  'marketing/campaigns': areaReadRule('marketing'),
  'marketing/emails': areaReadRule('marketing'),
}

function findArea(id) {
  return AREAS.find(area => area.id === id)
}

function levelIn(area, permissions, fallback) {
  const level = permissions?.[area.id]

  return area.levels.includes(level) ? level : fallback
}

function areaScopes(area, level) {
  return LEVEL_INCLUDES[level].flatMap(included => area.scopes[included] ?? [])
}

function isLevelMap(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function areaLevelError(id, level) {
  const area = findArea(id)

  if (!area) return `Unknown HubSpot area "${id}".`
  if (!area.levels.includes(level)) return `Invalid level for ${area.label}: use ${area.levels.join(', ')}.`

  return null
}

function isOpenPath() {
  return true
}

function areaReadRule(areaId) {
  return permissions => hasAreaAccess(permissions, areaId, READ)
}

function isReadableTypePath(permissions, [type]) {
  return isReadableObjectType(permissions, type)
}

function isSegment(segment, name) {
  return segment?.toLowerCase() === name
}

function isReadableObjectPath(permissions, [type, , relation, toType]) {
  if (!isReadableObjectType(permissions, type)) return false

  return !isSegment(relation, ASSOCIATIONS_SEGMENT) || isReadableObjectType(permissions, toType)
}

function isReadableListPath(permissions, rest) {
  if (rest.some(segment => isSegment(segment, MEMBERSHIPS_SEGMENT))) return false

  return hasAreaAccess(permissions, 'lists', READ)
}

function parseGetPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return null

  const segments = path.slice(1).split('/')
  if (!segments.every(segment => PATH_SEGMENT_RE.test(segment))) return null

  const versionIndex = API_VERSION_POSITIONS.find(index => API_VERSION_RE.test(segments[index]))
  if (versionIndex === undefined) return null

  const [api, resource, ...rest] = segments.filter((_, index) => index !== versionIndex)
  const family = `${api}/${resource}`

  return { family: Object.hasOwn(PATH_FAMILY_ALIASES, family) ? PATH_FAMILY_ALIASES[family] : family, rest }
}

export function normalizeHubspotPermissions(stored) {
  return Object.fromEntries(AREAS.map(area => [area.id, levelIn(area, stored, DEFAULT_LEVEL)]))
}

export function parseHubspotPermissions(input) {
  if (!isLevelMap(input)) return { error: 'HubSpot permissions must be an object mapping each area to a level.' }

  const error = Object.entries(input)
    .map(([id, level]) => areaLevelError(id, level))
    .find(Boolean)
  if (error) return { error }

  return { value: normalizeHubspotPermissions(input) }
}

export function hasAreaAccess(permissions, areaId, level) {
  const area = findArea(areaId)
  if (!area) return false

  return LEVEL_INCLUDES[levelIn(area, permissions, OFF)].includes(level)
}

export function allowedObjectTypes(permissions, action) {
  if (!Object.hasOwn(OBJECT_ACTIONS, action)) return []

  const { level, types } = OBJECT_ACTIONS[action]

  return types.filter(type => hasAreaAccess(permissions, TYPE_AREAS[type], level))
}

export function areaObjectTypes(areaId) {
  return findArea(areaId).objectTypes.map(({ type }) => type)
}

export function objectTypeIdOf(type) {
  return Object.hasOwn(TYPE_OBJECT_IDS, type) ? TYPE_OBJECT_IDS[type] : null
}

export function objectTypeOf(value) {
  if (CUSTOM_PATH_TYPE_RE.test(value)) return CUSTOM_TYPE

  return Object.hasOwn(PATH_OBJECT_TYPES, value) ? PATH_OBJECT_TYPES[value] : null
}

export function isReadableObjectType(permissions, value) {
  return canPerform(permissions, objectTypeOf(value), READ)
}

export function canPerform(permissions, objectType, action) {
  return allowedObjectTypes(permissions, action).includes(objectType)
}

export function requiredScopes(permissions) {
  const scopes = AREAS.flatMap(area => areaScopes(area, levelIn(area, permissions, OFF)))

  return [...new Set([OWNERS_SCOPE, ...scopes])].sort()
}

export function describeHubspotAreas() {
  return AREAS.map(area => ({
    id: area.id,
    label: area.label,
    levels: [...area.levels],
    scopes: Object.fromEntries(area.levels.map(level => [level, areaScopes(area, level)])),
  }))
}

export function isActionAvailableInRun(action, run) {
  const requirements = Object.hasOwn(ACTION_RUN_REQUIREMENTS, action) ? ACTION_RUN_REQUIREMENTS[action] : []

  return requirements.every(requirement => Boolean(run?.[requirement]))
}

export function isListPath(path) {
  return parseGetPath(path)?.family === LISTS_FAMILY
}

export function isAllowedGetPath(permissions, path) {
  const parsed = parseGetPath(path)
  if (!parsed || !Object.hasOwn(GET_PATH_RULES, parsed.family)) return false

  return GET_PATH_RULES[parsed.family](permissions, parsed.rest)
}
