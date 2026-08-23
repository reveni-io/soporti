import crypto from 'node:crypto'

import { SHARE_ID_BYTES } from '../constants.js'

export function newShareId() {
  return crypto.randomBytes(SHARE_ID_BYTES).toString('hex')
}
