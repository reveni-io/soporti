import { createCipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto'

const CURVE = 'prime256v1'
const HASH = 'sha256'
const CIPHER = 'aes-128-gcm'
const ENCODING = 'base64url'
const RECORD_SIZE = 4096
const SALT_BYTES = 16
const RECORD_SIZE_BYTES = 4
const KEY_ID_LENGTH_BYTES = 1
const IKM_BYTES = 32
const CEK_BYTES = 16
const NONCE_BYTES = 12
const KEY_INFO_PREFIX = Buffer.from('WebPush: info\0')
const CEK_INFO = Buffer.from('Content-Encoding: aes128gcm\0')
const NONCE_INFO = Buffer.from('Content-Encoding: nonce\0')
const PADDING_DELIMITER = Buffer.from([0x02])

function deriveKey(ikm, salt, info, length) {
  return Buffer.from(hkdfSync(HASH, ikm, salt, info, length))
}

function createSenderKeys(senderPrivateKey) {
  const sender = createECDH(CURVE)
  if (senderPrivateKey) {
    sender.setPrivateKey(senderPrivateKey)
  } else {
    sender.generateKeys()
  }

  return sender
}

function buildHeader(salt, senderPublicKey) {
  const header = Buffer.alloc(SALT_BYTES + RECORD_SIZE_BYTES + KEY_ID_LENGTH_BYTES)
  salt.copy(header)
  header.writeUInt32BE(RECORD_SIZE, SALT_BYTES)
  header.writeUInt8(senderPublicKey.length, SALT_BYTES + RECORD_SIZE_BYTES)

  return Buffer.concat([header, senderPublicKey])
}

function encryptRecord(plaintext, { cek, nonce }) {
  const cipher = createCipheriv(CIPHER, cek, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.update(PADDING_DELIMITER), cipher.final()])

  return Buffer.concat([ciphertext, cipher.getAuthTag()])
}

export function encryptPushPayload(plaintext, { p256dh, auth }, { senderPrivateKey = null, salt = null } = {}) {
  const receiverPublicKey = Buffer.from(p256dh, ENCODING)
  const recordSalt = salt ?? randomBytes(SALT_BYTES)
  const sender = createSenderKeys(senderPrivateKey)
  const senderPublicKey = sender.getPublicKey()

  const keyInfo = Buffer.concat([KEY_INFO_PREFIX, receiverPublicKey, senderPublicKey])
  const ikm = deriveKey(sender.computeSecret(receiverPublicKey), Buffer.from(auth, ENCODING), keyInfo, IKM_BYTES)
  const cek = deriveKey(ikm, recordSalt, CEK_INFO, CEK_BYTES)
  const nonce = deriveKey(ikm, recordSalt, NONCE_INFO, NONCE_BYTES)

  return Buffer.concat([buildHeader(recordSalt, senderPublicKey), encryptRecord(plaintext, { cek, nonce })])
}
