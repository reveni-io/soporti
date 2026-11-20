const UUID_BYTES = 16
const VERSION_BYTE = 6
const VARIANT_BYTE = 8
const VERSION_4 = 0x40
const VARIANT_RFC_4122 = 0x80
const UUID_GROUPS = [8, 4, 4, 4, 12]

function toHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function formatUuid(hex) {
  let offset = 0

  return UUID_GROUPS.map(length => {
    const group = hex.slice(offset, offset + length)
    offset += length
    return group
  }).join('-')
}

function randomUuidFromBytes() {
  const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTES))
  bytes[VERSION_BYTE] = (bytes[VERSION_BYTE] & 0x0f) | VERSION_4
  bytes[VARIANT_BYTE] = (bytes[VARIANT_BYTE] & 0x3f) | VARIANT_RFC_4122

  return formatUuid(toHex(bytes))
}

export function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  return randomUuidFromBytes()
}
