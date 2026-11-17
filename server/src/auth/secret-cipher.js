import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto'
import config from '../config.js'

const ALGORITHM = 'aes-256-gcm'
const DIGEST = 'sha256'
const KEY_SALT = 'soporti-secret-cipher-v1'
const KEY_INFO = 'soporti-secret'
const KEY_BYTES = 32
const IV_BYTES = 12
const FORMAT_VERSION = 'v1'
const ENCODING = 'base64url'
const SEPARATOR = ':'

function deriveKey() {
  return Buffer.from(hkdfSync(DIGEST, config.jwt.secret, KEY_SALT, KEY_INFO, KEY_BYTES))
}

export function encryptSecret(plaintext) {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [FORMAT_VERSION, iv, tag, ciphertext]
    .map(part => (typeof part === 'string' ? part : part.toString(ENCODING)))
    .join(SEPARATOR)
}

export function decryptSecret(blob) {
  const [version, iv, tag, ciphertext, ...rest] = String(blob).split(SEPARATOR)
  if (version !== FORMAT_VERSION || !ciphertext || rest.length > 0) {
    throw new Error('Unsupported encrypted secret format.')
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(iv, ENCODING))
  decipher.setAuthTag(Buffer.from(tag, ENCODING))

  return Buffer.concat([decipher.update(Buffer.from(ciphertext, ENCODING)), decipher.final()]).toString('utf8')
}
