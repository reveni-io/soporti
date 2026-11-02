import { describe, it, expect } from 'vitest'
import {
  normalizeHubspotPermissions,
  parseHubspotPermissions,
  hasAreaAccess,
  allowedObjectTypes,
  canPerform,
  areaObjectTypes,
  objectTypeIdOf,
  objectTypeOf,
  isReadableObjectType,
  requiredScopes,
  describeHubspotAreas,
  isActionAvailableInRun,
  isAllowedGetPath,
  isListPath,
} from './permissions.js'

const AREA_IDS = [
  'contacts',
  'companies',
  'deals',
  'tickets',
  'activities',
  'commerce',
  'custom',
  'lists',
  'conversations',
  'marketing',
]

const ALL_READ = Object.fromEntries(AREA_IDS.map(id => [id, 'read']))
const ALL_OFF = Object.fromEntries(AREA_IDS.map(id => [id, 'off']))
const ALL_MAX = {
  contacts: 'full',
  companies: 'full',
  deals: 'full',
  tickets: 'full',
  activities: 'full',
  commerce: 'full',
  custom: 'full',
  lists: 'write',
  conversations: 'reply',
  marketing: 'read',
}

const OBJECT_ACTIONS = ['read', 'create', 'update', 'associate', 'archive', 'unassociate', 'merge']

const READABLE_TYPES = [
  'contacts',
  'companies',
  'deals',
  'tickets',
  'notes',
  'tasks',
  'calls',
  'meetings',
  'emails',
  'products',
  'line_items',
  'quotes',
  'custom',
]

const OBJECT_AREAS = [
  { area: 'contacts', all: ['contacts'], writable: ['contacts'], mergeable: ['contacts'] },
  { area: 'companies', all: ['companies'], writable: ['companies'], mergeable: ['companies'] },
  { area: 'deals', all: ['deals'], writable: ['deals'], mergeable: ['deals'] },
  { area: 'tickets', all: ['tickets'], writable: ['tickets'], mergeable: ['tickets'] },
  {
    area: 'activities',
    all: ['notes', 'tasks', 'calls', 'meetings', 'emails'],
    writable: ['notes', 'tasks', 'calls', 'meetings'],
    mergeable: [],
  },
  {
    area: 'commerce',
    all: ['products', 'line_items', 'quotes'],
    writable: ['products', 'line_items'],
    mergeable: [],
  },
  { area: 'custom', all: ['custom'], writable: ['custom'], mergeable: [] },
]

const TYPES_BY_LEVEL = {
  off: {},
  read: { read: 'all' },
  write: { read: 'all', create: 'writable', update: 'writable', associate: 'writable' },
  full: {
    read: 'all',
    create: 'writable',
    update: 'writable',
    associate: 'writable',
    archive: 'writable',
    unassociate: 'writable',
    merge: 'mergeable',
  },
}

const MATRIX = OBJECT_AREAS.flatMap(areaTypes => Object.keys(TYPES_BY_LEVEL).map(level => ({ ...areaTypes, level })))

describe('normalizeHubspotPermissions', () => {
  it('defaults every area to read when nothing valid is stored', () => {
    expect(normalizeHubspotPermissions(null)).toEqual(ALL_READ)
    expect(normalizeHubspotPermissions(undefined)).toEqual(ALL_READ)
    expect(normalizeHubspotPermissions({})).toEqual(ALL_READ)
    expect(normalizeHubspotPermissions([])).toEqual(ALL_READ)
    expect(normalizeHubspotPermissions('write')).toEqual(ALL_READ)
  })

  it('merges a partial map over the defaults', () => {
    expect(normalizeHubspotPermissions({ deals: 'write', contacts: 'off' })).toEqual({
      ...ALL_READ,
      deals: 'write',
      contacts: 'off',
    })
  })

  it('keeps the highest level each area admits', () => {
    expect(normalizeHubspotPermissions(ALL_MAX)).toEqual(ALL_MAX)
  })

  it('drops unknown areas', () => {
    const normalized = normalizeHubspotPermissions(JSON.parse('{"widgets":"write","__proto__":"full","deals":"off"}'))

    expect(normalized).toEqual({ ...ALL_READ, deals: 'off' })
    expect(Object.keys(normalized)).toEqual(AREA_IDS)
  })

  it('falls back to the default for a level the area does not admit', () => {
    const stored = {
      contacts: 'admin',
      deals: 'reply',
      lists: 'full',
      conversations: 'write',
      marketing: 'write',
      custom: 42,
    }

    expect(normalizeHubspotPermissions(stored)).toEqual(ALL_READ)
  })
})

describe('parseHubspotPermissions', () => {
  it('rejects anything that is not an object of levels', () => {
    for (const input of [null, undefined, [], 'read', 3]) {
      expect(parseHubspotPermissions(input), String(input)).toEqual({
        error: 'HubSpot permissions must be an object mapping each area to a level.',
      })
    }
  })

  it('rejects an unknown area', () => {
    expect(parseHubspotPermissions({ deals: 'write', widgets: 'read' })).toEqual({
      error: 'Unknown HubSpot area "widgets".',
    })
    expect(parseHubspotPermissions(JSON.parse('{"__proto__":"read"}'))).toEqual({
      error: 'Unknown HubSpot area "__proto__".',
    })
  })

  it('rejects a level the area does not admit and lists the ones it does', () => {
    expect(parseHubspotPermissions({ marketing: 'write' })).toEqual({
      error: 'Invalid level for Marketing: use off, read.',
    })
    expect(parseHubspotPermissions({ conversations: 'full' })).toEqual({
      error: 'Invalid level for Conversations: use off, read, reply.',
    })
    expect(parseHubspotPermissions({ lists: 'full' })).toEqual({
      error: 'Invalid level for Lists: use off, read, write.',
    })
    expect(parseHubspotPermissions({ deals: 'reply' })).toEqual({
      error: 'Invalid level for Deals: use off, read, write, full.',
    })
    expect(parseHubspotPermissions({ custom: null })).toEqual({
      error: 'Invalid level for Custom objects: use off, read, write, full.',
    })
  })

  it('reports the first invalid entry', () => {
    expect(parseHubspotPermissions({ deals: 'write', tickets: 'admin', widgets: 'read' })).toEqual({
      error: 'Invalid level for Tickets: use off, read, write, full.',
    })
  })

  it('merges a valid partial map over the defaults', () => {
    expect(parseHubspotPermissions({ deals: 'write', conversations: 'reply', marketing: 'off' })).toEqual({
      value: { ...ALL_READ, deals: 'write', conversations: 'reply', marketing: 'off' },
    })
  })

  it('returns the defaults for an empty map', () => {
    expect(parseHubspotPermissions({})).toEqual({ value: ALL_READ })
  })
})

describe('hasAreaAccess', () => {
  it('grants the lower levels a level includes', () => {
    const permissions = { ...ALL_OFF, contacts: 'read', companies: 'write', deals: 'full' }

    expect(['read', 'write', 'full'].map(level => hasAreaAccess(permissions, 'contacts', level))).toEqual([
      true,
      false,
      false,
    ])
    expect(['read', 'write', 'full'].map(level => hasAreaAccess(permissions, 'companies', level))).toEqual([
      true,
      true,
      false,
    ])
    expect(['read', 'write', 'full'].map(level => hasAreaAccess(permissions, 'deals', level))).toEqual([
      true,
      true,
      true,
    ])
  })

  it('grants nothing to an area that is off', () => {
    for (const level of ['read', 'write', 'full', 'reply']) {
      expect(hasAreaAccess(ALL_OFF, 'tickets', level), level).toBe(false)
    }
  })

  it('lets reply include read but not write', () => {
    const permissions = { ...ALL_OFF, conversations: 'reply' }

    expect(hasAreaAccess(permissions, 'conversations', 'read')).toBe(true)
    expect(hasAreaAccess(permissions, 'conversations', 'reply')).toBe(true)
    expect(hasAreaAccess(permissions, 'conversations', 'write')).toBe(false)
    expect(hasAreaAccess({ ...ALL_OFF, conversations: 'read' }, 'conversations', 'reply')).toBe(false)
  })

  it('gates lists and marketing by their own levels', () => {
    expect(hasAreaAccess({ ...ALL_OFF, lists: 'write' }, 'lists', 'write')).toBe(true)
    expect(hasAreaAccess({ ...ALL_OFF, lists: 'read' }, 'lists', 'write')).toBe(false)
    expect(hasAreaAccess({ ...ALL_OFF, marketing: 'read' }, 'marketing', 'read')).toBe(true)
    expect(hasAreaAccess(ALL_OFF, 'marketing', 'read')).toBe(false)
  })

  it('fails closed for an unknown area or a missing or unadmitted level', () => {
    expect(hasAreaAccess(ALL_READ, 'widgets', 'read')).toBe(false)
    expect(hasAreaAccess({}, 'contacts', 'read')).toBe(false)
    expect(hasAreaAccess(null, 'contacts', 'read')).toBe(false)
    expect(hasAreaAccess({ ...ALL_OFF, marketing: 'full' }, 'marketing', 'read')).toBe(false)
  })
})

describe('allowedObjectTypes', () => {
  it.each(MATRIX)('allows the expected types with $area at $level', ({ area, level, ...types }) => {
    const permissions = { ...ALL_OFF, [area]: level }

    for (const action of OBJECT_ACTIONS) {
      const group = TYPES_BY_LEVEL[level][action]

      expect(allowedObjectTypes(permissions, action), action).toEqual(group ? types[group] : [])
    }
  })

  it('allows only reads with the default permissions', () => {
    expect(allowedObjectTypes(ALL_READ, 'read')).toEqual(READABLE_TYPES)

    for (const action of OBJECT_ACTIONS.filter(name => name !== 'read')) {
      expect(allowedObjectTypes(ALL_READ, action), action).toEqual([])
    }
  })

  it('limits the write actions to deals when only deals is on write', () => {
    const permissions = { ...ALL_READ, deals: 'write' }

    expect(allowedObjectTypes(permissions, 'create')).toEqual(['deals'])
    expect(allowedObjectTypes(permissions, 'update')).toEqual(['deals'])
    expect(allowedObjectTypes(permissions, 'associate')).toEqual(['deals'])
    expect(allowedObjectTypes(permissions, 'archive')).toEqual([])
    expect(allowedObjectTypes(permissions, 'merge')).toEqual([])
  })

  it('drops the types of an area that is off from every action', () => {
    const permissions = { ...ALL_READ, contacts: 'off', activities: 'off' }

    expect(allowedObjectTypes(permissions, 'read')).toEqual([
      'companies',
      'deals',
      'tickets',
      'products',
      'line_items',
      'quotes',
      'custom',
    ])
  })

  it('never offers emails or quotes for writes, nor anything but the four core objects for merge', () => {
    const permissions = { ...ALL_OFF, ...Object.fromEntries(OBJECT_AREAS.map(({ area }) => [area, 'full'])) }

    for (const action of ['create', 'update', 'associate', 'archive', 'unassociate']) {
      expect(allowedObjectTypes(permissions, action), action).toEqual([
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
        'custom',
      ])
    }
    expect(allowedObjectTypes(permissions, 'merge')).toEqual(['contacts', 'companies', 'deals', 'tickets'])
  })

  it('offers custom only while custom objects are readable', () => {
    expect(allowedObjectTypes({ ...ALL_READ, custom: 'off' }, 'read')).not.toContain('custom')
    expect(allowedObjectTypes({ ...ALL_OFF, custom: 'read' }, 'read')).toEqual(['custom'])
  })

  it('gives lists, conversations and marketing no object types', () => {
    const permissions = { ...ALL_OFF, lists: 'write', conversations: 'reply', marketing: 'read' }

    for (const action of OBJECT_ACTIONS) {
      expect(allowedObjectTypes(permissions, action), action).toEqual([])
    }
  })

  it('returns no types for an action that is not tied to object types', () => {
    const permissions = { ...ALL_READ, lists: 'write', conversations: 'reply' }

    expect(allowedObjectTypes(permissions, 'list_membership')).toEqual([])
    expect(allowedObjectTypes(permissions, 'reply')).toEqual([])
    expect(allowedObjectTypes(permissions, 'toString')).toEqual([])
  })
})

describe('canPerform', () => {
  it('allows an action on a type whose area reaches the needed level', () => {
    const permissions = { ...ALL_READ, deals: 'write', contacts: 'full' }

    expect(canPerform(permissions, 'deals', 'update')).toBe(true)
    expect(canPerform(permissions, 'contacts', 'merge')).toBe(true)
    expect(canPerform(permissions, 'companies', 'read')).toBe(true)
  })

  it('refuses an action on a type whose area is below the needed level', () => {
    const permissions = { ...ALL_READ, deals: 'write', companies: 'off' }

    expect(canPerform(permissions, 'deals', 'archive')).toBe(false)
    expect(canPerform(permissions, 'tickets', 'update')).toBe(false)
    expect(canPerform(permissions, 'companies', 'read')).toBe(false)
  })

  it('refuses types an action never takes', () => {
    const permissions = { ...ALL_OFF, custom: 'full', activities: 'full', commerce: 'full' }

    expect(canPerform(permissions, 'custom', 'merge')).toBe(false)
    expect(canPerform(permissions, 'emails', 'create')).toBe(false)
    expect(canPerform(permissions, 'quotes', 'update')).toBe(false)
  })

  it('refuses an unknown type or action', () => {
    expect(canPerform(ALL_READ, 'widgets', 'read')).toBe(false)
    expect(canPerform(ALL_READ, 'deals', 'delete')).toBe(false)
  })
})

describe('areaObjectTypes', () => {
  it.each([
    ['activities', ['notes', 'tasks', 'calls', 'meetings', 'emails']],
    ['commerce', ['products', 'line_items', 'quotes']],
    ['custom', ['custom']],
    ['deals', ['deals']],
    ['lists', []],
  ])('lists the object types of the %s area', (areaId, types) => {
    expect(areaObjectTypes(areaId)).toEqual(types)
  })
})

describe('objectTypeIdOf', () => {
  it.each([
    ['contacts', '0-1'],
    ['companies', '0-2'],
    ['deals', '0-3'],
    ['tickets', '0-5'],
    ['products', '0-7'],
    ['line_items', '0-8'],
    ['quotes', '0-14'],
    ['tasks', '0-27'],
    ['notes', '0-46'],
    ['meetings', '0-47'],
    ['calls', '0-48'],
    ['emails', '0-49'],
  ])('gives %s the object type id %s', (type, objectTypeId) => {
    expect(objectTypeIdOf(type)).toBe(objectTypeId)
  })

  it.each(['custom', 'leads', '0-1', '__proto__', 'toString', undefined])('has no object type id for %j', type => {
    expect(objectTypeIdOf(type)).toBeNull()
  })
})

describe('objectTypeOf', () => {
  it.each([
    ['contacts', 'contacts'],
    ['0-1', 'contacts'],
    ['companies', 'companies'],
    ['0-2', 'companies'],
    ['0-3', 'deals'],
    ['0-5', 'tickets'],
    ['notes', 'notes'],
    ['0-49', 'emails'],
    ['line_items', 'line_items'],
    ['0-14', 'quotes'],
    ['2-123456', 'custom'],
    ['p_cars', 'custom'],
    ['p4567_cars', 'custom'],
  ])('reads %s as %s', (value, type) => {
    expect(objectTypeOf(value)).toBe(type)
  })

  it.each(['custom', 'leads', '0-99', '2-', 'p_', 'Contacts', '__proto__', 'toString', '', null, undefined])(
    'knows no type for %j',
    value => {
      expect(objectTypeOf(value)).toBeNull()
    }
  )
})

describe('isReadableObjectType', () => {
  it.each([
    ['deals', 'deals'],
    ['0-3', 'deals'],
    ['0-46', 'activities'],
    ['quotes', 'commerce'],
    ['2-123', 'custom'],
    ['p4567_cars', 'custom'],
  ])('lets %s through only while %s can be read', (value, area) => {
    expect(isReadableObjectType({ ...ALL_OFF, [area]: 'read' }, value)).toBe(true)
    expect(isReadableObjectType({ ...ALL_OFF, [area]: 'full' }, value)).toBe(true)
    expect(isReadableObjectType({ ...ALL_MAX, [area]: 'off' }, value)).toBe(false)
  })

  it.each(['custom', 'leads', 'lists', '0-99', null, undefined])('never lets %j through', value => {
    expect(isReadableObjectType(ALL_MAX, value)).toBe(false)
  })

  it('lets nothing through without permissions', () => {
    expect(isReadableObjectType(undefined, 'contacts')).toBe(false)
  })
})

describe('requiredScopes', () => {
  it('asks only for the read scopes, sorted, with the default permissions', () => {
    expect(requiredScopes(ALL_READ)).toEqual([
      'conversations.read',
      'crm.lists.read',
      'crm.objects.companies.read',
      'crm.objects.contacts.read',
      'crm.objects.custom.read',
      'crm.objects.deals.read',
      'crm.objects.line_items.read',
      'crm.objects.owners.read',
      'crm.objects.products.read',
      'crm.objects.quotes.read',
      'crm.objects.tickets.read',
      'crm.schemas.custom.read',
      'marketing-email',
      'marketing.campaigns.read',
      'sales-email-read',
    ])
  })

  it('always asks for the owners scope, even with every area off', () => {
    expect(requiredScopes(ALL_OFF)).toEqual(['crm.objects.owners.read'])
    expect(requiredScopes(null)).toEqual(['crm.objects.owners.read'])
  })

  it('adds the write scope of an area on write and nothing more for full', () => {
    const write = requiredScopes({ ...ALL_OFF, deals: 'write' })

    expect(write).toEqual(['crm.objects.deals.read', 'crm.objects.deals.write', 'crm.objects.owners.read'])
    expect(requiredScopes({ ...ALL_OFF, deals: 'full' })).toEqual(write)
  })

  it('asks for conversations.write only when conversations is on reply', () => {
    expect(requiredScopes({ ...ALL_OFF, conversations: 'read' })).toEqual([
      'conversations.read',
      'crm.objects.owners.read',
    ])
    expect(requiredScopes({ ...ALL_OFF, conversations: 'reply' })).toEqual([
      'conversations.read',
      'conversations.write',
      'crm.objects.owners.read',
    ])
  })

  it('lists a scope shared by two areas once', () => {
    expect(requiredScopes({ ...ALL_OFF, contacts: 'write', activities: 'write' })).toEqual([
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.owners.read',
      'sales-email-read',
    ])
  })

  it('covers the commerce, custom objects and lists write scopes', () => {
    expect(requiredScopes({ ...ALL_OFF, commerce: 'full', custom: 'write', lists: 'write' })).toEqual([
      'crm.lists.read',
      'crm.lists.write',
      'crm.objects.custom.read',
      'crm.objects.custom.write',
      'crm.objects.line_items.read',
      'crm.objects.line_items.write',
      'crm.objects.owners.read',
      'crm.objects.products.read',
      'crm.objects.products.write',
      'crm.objects.quotes.read',
      'crm.schemas.custom.read',
    ])
  })

  it('never asks for a cms scope for marketing emails', () => {
    expect(requiredScopes({ ...ALL_OFF, marketing: 'read' })).toEqual([
      'crm.objects.owners.read',
      'marketing-email',
      'marketing.campaigns.read',
    ])
  })

  it('ignores a level the area does not admit', () => {
    expect(requiredScopes({ ...ALL_OFF, marketing: 'write', lists: 'full' })).toEqual(['crm.objects.owners.read'])
  })
})

describe('describeHubspotAreas', () => {
  it('lists every area in order with its label and admitted levels', () => {
    const areas = describeHubspotAreas()

    expect(areas.map(({ id, label }) => [id, label])).toEqual([
      ['contacts', 'Contacts'],
      ['companies', 'Companies'],
      ['deals', 'Deals'],
      ['tickets', 'Tickets'],
      ['activities', 'Activities'],
      ['commerce', 'Commerce'],
      ['custom', 'Custom objects'],
      ['lists', 'Lists'],
      ['conversations', 'Conversations'],
      ['marketing', 'Marketing'],
    ])
    expect(areas.find(({ id }) => id === 'deals').levels).toEqual(['off', 'read', 'write', 'full'])
    expect(areas.find(({ id }) => id === 'lists').levels).toEqual(['off', 'read', 'write'])
    expect(areas.find(({ id }) => id === 'conversations').levels).toEqual(['off', 'read', 'reply'])
    expect(areas.find(({ id }) => id === 'marketing').levels).toEqual(['off', 'read'])
  })

  it('gives the cumulative scopes of every admitted level', () => {
    const areas = describeHubspotAreas()

    expect(areas.find(({ id }) => id === 'deals').scopes).toEqual({
      off: [],
      read: ['crm.objects.deals.read'],
      write: ['crm.objects.deals.read', 'crm.objects.deals.write'],
      full: ['crm.objects.deals.read', 'crm.objects.deals.write'],
    })
    expect(areas.find(({ id }) => id === 'conversations').scopes).toEqual({
      off: [],
      read: ['conversations.read'],
      reply: ['conversations.read', 'conversations.write'],
    })
    expect(areas.find(({ id }) => id === 'marketing').scopes).toEqual({
      off: [],
      read: ['marketing.campaigns.read', 'marketing-email'],
    })
  })

  it('returns a fresh copy each time', () => {
    const first = describeHubspotAreas()
    first[0].levels.push('admin')
    first[0].scopes.read.push('content')

    const second = describeHubspotAreas()

    expect(second[0].levels).toEqual(['off', 'read', 'write', 'full'])
    expect(second[0].scopes.read).toEqual(['crm.objects.contacts.read'])
  })
})

describe('isActionAvailableInRun', () => {
  const ACTIONS = ['create', 'update', 'associate', 'archive', 'merge', 'unassociate', 'list_membership', 'reply']

  function availableActions(run) {
    return ACTIONS.filter(action => isActionAvailableInRun(action, run))
  }

  it('offers every action to a web user with an email', () => {
    expect(availableActions({ attended: true, canReply: true })).toEqual(ACTIONS)
  })

  it('offers everything but reply to an attended user without an email, as in slack', () => {
    expect(availableActions({ attended: true, canReply: false })).toEqual(ACTIONS.filter(name => name !== 'reply'))
  })

  it('offers only create, update and associate to unattended runs', () => {
    expect(availableActions({ attended: false, canReply: false })).toEqual(['create', 'update', 'associate'])
  })

  it('refuses reply to an unattended run even when it could reply', () => {
    expect(isActionAvailableInRun('reply', { attended: false, canReply: true })).toBe(false)
  })

  it('keeps reads available in any run', () => {
    expect(isActionAvailableInRun('read', { attended: false, canReply: false })).toBe(true)
    expect(isActionAvailableInRun('read', undefined)).toBe(true)
  })

  it('refuses the guarded actions when no run context is given', () => {
    expect(isActionAvailableInRun('archive', undefined)).toBe(false)
    expect(isActionAvailableInRun('reply', {})).toBe(false)
  })
})

describe('isListPath', () => {
  it.each([
    '/crm/lists/2026-09/7',
    '/crm/v3/lists/7',
    '/crm/lists/2026-09',
    '/crm/v3/lists/object-type-id/0-1/name/vip',
  ])('recognizes %s as a path of the lists API', path => {
    expect(isListPath(path)).toBe(true)
  })

  it.each(['/crm/v3/objects/contacts/101', '/crm/lists/7', 'crm/v3/lists/7', '/crm/v3/lists/../objects', null])(
    'does not take %s for a path of the lists API',
    path => {
      expect(isListPath(path)).toBe(false)
    }
  )
})

describe('isAllowedGetPath', () => {
  const AREA_GET_PATHS = [
    { area: 'contacts', path: '/crm/v3/objects/contacts/101' },
    { area: 'contacts', path: '/crm/objects/2026-09/contacts/101' },
    { area: 'companies', path: '/crm/v3/objects/0-2' },
    { area: 'companies', path: '/crm/objects/2026-09/companies' },
    { area: 'deals', path: '/crm/v3/objects/0-3/7' },
    { area: 'deals', path: '/crm/objects/2026-09/0-3/7' },
    { area: 'tickets', path: '/crm/v3/objects/tickets/9' },
    { area: 'tickets', path: '/crm/objects/2026-09/0-5/9' },
    { area: 'activities', path: '/crm/v3/objects/notes/5' },
    { area: 'activities', path: '/crm/objects/2026-09/0-49/5' },
    { area: 'commerce', path: '/crm/v3/objects/line_items/3' },
    { area: 'commerce', path: '/crm/objects/2026-09/0-14' },
    { area: 'custom', path: '/crm/v3/objects/2-123/9' },
    { area: 'custom', path: '/crm/objects/2026-09/p_cars/9' },
    { area: 'custom', path: '/crm/objects/2026-09/p4567_cars' },
    { area: 'custom', path: '/crm/v3/schemas' },
    { area: 'custom', path: '/crm-object-schemas/2026-09/schemas' },
    { area: 'custom', path: '/crm-object-schemas/v3/schemas/p_cars' },
    { area: 'deals', path: '/crm/v3/properties/deals' },
    { area: 'deals', path: '/crm/properties/2026-09/0-3/dealstage' },
    { area: 'custom', path: '/crm/properties/2026-09/2-123' },
    { area: 'tickets', path: '/crm/v3/pipelines/tickets' },
    { area: 'tickets', path: '/crm/pipelines/2026-09/0-5/default/stages' },
    { area: 'lists', path: '/crm/v3/lists/12' },
    { area: 'lists', path: '/crm/lists/2026-09/object-type-id/0-1/name/vip' },
    { area: 'conversations', path: '/conversations/v3/conversations/threads' },
    { area: 'conversations', path: '/conversations/conversations/2026-09/threads/77/messages' },
    { area: 'conversations', path: '/conversations/2026-09/conversations/threads/77' },
    { area: 'marketing', path: '/marketing/v3/campaigns' },
    { area: 'marketing', path: '/marketing/campaigns/2026-09/0f6c3c2e-1b2a-4c5d-9e8f-123456789abc' },
    { area: 'marketing', path: '/marketing/v3/emails/42' },
    { area: 'marketing', path: '/marketing/emails/2026-09/statistics/list' },
  ]

  const OPEN_GET_PATHS = [
    '/crm/v3/owners',
    '/crm/v3/owners/12',
    '/crm/owners/2026-09',
    '/account-info/v3/details',
    '/account-info/2026-09/details',
  ]

  const UNLISTED_GET_PATHS = [
    '/settings/v3/users',
    '/settings/users/2026-09',
    '/automation/v4/flows',
    '/cms/v3/pages/site-pages',
    '/webhooks/v3/123/subscriptions',
    '/files/v3/files',
    '/account-info/v3/activity/audit-logs',
    '/crm/v3/imports',
    '/crm/v4/associations/contacts/deals/labels',
    '/conversations/v3/custom-channels',
    '/marketing/v3/forms',
  ]

  const UNKNOWN_TYPE_PATHS = [
    '/crm/v3/objects',
    '/crm/v3/objects/leads',
    '/crm/v3/objects/0-4',
    '/crm/v3/objects/2-abc',
    '/crm/v3/objects/custom/1',
    '/crm/v3/objects/__proto__',
    '/crm/v3/objects/constructor',
    '/crm/v3/properties/toString',
    '/crm/v3/pipelines',
  ]

  const UNSAFE_GET_PATHS = [
    '/crm/v3/objects/contacts/../../../settings/v3/users',
    '/crm/v3/objects/contacts/1/..',
    '/crm/v3/./objects/contacts',
    '//crm/v3/objects/contacts',
    '/crm/v3//objects/contacts',
    '/crm/v3/objects/contacts/',
    '/crm/v3/objects/contacts%2F..%2Fsettings',
    '/crm/v3/objects/contacts%2f1',
    '/crm/v3/objects/contacts/%2e%2e',
    '/crm/v3/objects/contacts\\1',
    '/crm/v3/objects/contacts/1?archived=true',
    '/crm/v3/objects/contacts/1#properties',
    '/crm/v3/objects/contacts/ 1',
    'https://api.hubapi.com/crm/v3/objects/contacts',
    'crm/v3/objects/contacts',
    '',
    '/',
  ]

  const ASSOCIATION_PATHS = [
    { path: '/crm/v4/objects/contacts/1/associations/deals', from: 'contacts', to: 'deals' },
    { path: '/crm/objects/2026-09/0-1/1/associations/0-3', from: 'contacts', to: 'deals' },
    { path: '/crm/v3/objects/deals/7/associations/2-123', from: 'deals', to: 'custom' },
    { path: '/crm/objects/2026-09/p_cars/9/associations/notes', from: 'custom', to: 'activities' },
    { path: '/crm/v4/objects/companies/1/ASSOCIATIONS/tickets', from: 'companies', to: 'tickets' },
  ]

  const MEMBERSHIP_PATHS = [
    '/crm/v3/lists/12/memberships',
    '/crm/lists/2026-09/12/memberships',
    '/crm/lists/2026-09/12/memberships/join-order',
    '/crm/lists/2026-09/records/0-1/101/memberships',
    '/crm/lists/2026-09/12/Memberships',
  ]

  it.each(AREA_GET_PATHS)('allows $path with only $area on read', ({ area, path }) => {
    expect(isAllowedGetPath({ ...ALL_OFF, [area]: 'read' }, path)).toBe(true)
  })

  it.each(AREA_GET_PATHS)('rejects $path with $area off', ({ area, path }) => {
    expect(isAllowedGetPath({ ...ALL_MAX, [area]: 'off' }, path)).toBe(false)
  })

  it.each([
    { area: 'deals', level: 'full', path: '/crm/v3/objects/deals/7' },
    { area: 'lists', level: 'write', path: '/crm/lists/2026-09/12' },
    { area: 'conversations', level: 'reply', path: '/conversations/v3/conversations/threads' },
  ])('allows $path with $area on $level', ({ area, level, path }) => {
    expect(isAllowedGetPath({ ...ALL_OFF, [area]: level }, path)).toBe(true)
  })

  it.each(OPEN_GET_PATHS)('always allows %s', path => {
    expect(isAllowedGetPath(ALL_OFF, path)).toBe(true)
  })

  it.each(UNLISTED_GET_PATHS)('rejects %s even with every area at its highest level', path => {
    expect(isAllowedGetPath(ALL_MAX, path)).toBe(false)
  })

  it.each(UNKNOWN_TYPE_PATHS)('rejects the unknown object type in %s', path => {
    expect(isAllowedGetPath(ALL_MAX, path)).toBe(false)
  })

  it.each(UNSAFE_GET_PATHS)('rejects the unsafe path %j', path => {
    expect(isAllowedGetPath(ALL_MAX, path)).toBe(false)
  })

  it.each([undefined, null, 42, ['/crm/v3/owners']])('rejects a path that is not a string: %j', path => {
    expect(isAllowedGetPath(ALL_MAX, path)).toBe(false)
  })

  it('treats an objectTypeId as the type it stands for', () => {
    const permissions = { ...ALL_READ, deals: 'off' }

    expect(isAllowedGetPath(permissions, '/crm/v3/objects/0-3/7')).toBe(false)
    expect(isAllowedGetPath(permissions, '/crm/v3/objects/0-1/7')).toBe(true)
  })

  it('accepts an email as the record id', () => {
    expect(isAllowedGetPath(ALL_READ, '/crm/v3/objects/contacts/jane.doe+vip@example.com')).toBe(true)
  })

  it('accepts any date version', () => {
    expect(isAllowedGetPath(ALL_READ, '/crm/objects/2025-03/contacts')).toBe(true)
  })

  it.each([
    '/crm/objects/contacts/1',
    '/crm/v1/objects/contacts',
    '/crm/v2/objects/contacts',
    '/crm/objects/26-09/contacts',
    '/contacts/v1/contact/vid/1/profile',
  ])('rejects %s, which has no supported version', path => {
    expect(isAllowedGetPath(ALL_MAX, path)).toBe(false)
  })

  it.each(['/crm/v3/objects/2026-09/contacts', '/crm/v3/v4/objects/contacts'])(
    'strips a single version segment from %s',
    path => {
      expect(isAllowedGetPath(ALL_MAX, path)).toBe(false)
    }
  )

  it.each(ASSOCIATION_PATHS)('allows $path when $from and $to are readable', ({ path, from, to }) => {
    expect(isAllowedGetPath({ ...ALL_OFF, [from]: 'read', [to]: 'read' }, path)).toBe(true)
  })

  it.each(ASSOCIATION_PATHS)('rejects $path when $to is off', ({ path, to }) => {
    expect(isAllowedGetPath({ ...ALL_MAX, [to]: 'off' }, path)).toBe(false)
  })

  it.each(ASSOCIATION_PATHS)('rejects $path when $from is off', ({ path, from }) => {
    expect(isAllowedGetPath({ ...ALL_MAX, [from]: 'off' }, path)).toBe(false)
  })

  it.each(MEMBERSHIP_PATHS)('rejects the list memberships path %s even with every area at its highest level', path => {
    expect(isAllowedGetPath(ALL_MAX, path)).toBe(false)
  })

  it('rejects an association path without a target type', () => {
    expect(isAllowedGetPath(ALL_MAX, '/crm/v4/objects/contacts/1/associations')).toBe(false)
  })

  it('treats a missing or invalid level as off', () => {
    expect(isAllowedGetPath({}, '/crm/v3/objects/contacts')).toBe(false)
    expect(isAllowedGetPath({ contacts: 'admin' }, '/crm/v3/objects/contacts')).toBe(false)
    expect(isAllowedGetPath(undefined, '/crm/v3/lists/12')).toBe(false)
    expect(isAllowedGetPath(undefined, '/crm/v3/owners')).toBe(true)
  })
})
