export const hubspotConfigFixture = {
  tokenConfigured: true,
  permissions: { contacts: 'read', activities: 'read', conversations: 'read', marketing: 'off' },
  areas: [
    {
      id: 'contacts',
      label: 'Contacts',
      levels: ['off', 'read', 'write', 'full'],
      scopes: {
        off: [],
        read: ['crm.objects.contacts.read'],
        write: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
        full: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
      },
    },
    {
      id: 'activities',
      label: 'Activities',
      levels: ['off', 'read', 'write', 'full'],
      scopes: {
        off: [],
        read: ['crm.objects.contacts.read', 'sales-email-read'],
        write: ['crm.objects.contacts.read', 'sales-email-read', 'crm.objects.contacts.write'],
        full: ['crm.objects.contacts.read', 'sales-email-read', 'crm.objects.contacts.write'],
      },
    },
    {
      id: 'conversations',
      label: 'Conversations',
      levels: ['off', 'read', 'reply'],
      scopes: { off: [], read: ['conversations.read'], reply: ['conversations.read', 'conversations.write'] },
    },
    {
      id: 'marketing',
      label: 'Marketing',
      levels: ['off', 'read'],
      scopes: { off: [], read: ['marketing.campaigns.read', 'marketing-email'] },
    },
  ],
  requiredScopes: ['conversations.read', 'crm.objects.contacts.read', 'crm.objects.owners.read', 'sales-email-read'],
}
