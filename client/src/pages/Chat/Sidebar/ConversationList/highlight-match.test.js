import { describe, it, expect } from 'vitest'
import { splitOnMatch } from './highlight-match.js'

describe('splitOnMatch', () => {
  it('marks every occurrence of the query regardless of case', () => {
    expect(splitOnMatch('Refund issued, the refund window', 'refund')).toEqual([
      { text: 'Refund', isMatch: true },
      { text: ' issued, the ', isMatch: false },
      { text: 'refund', isMatch: true },
      { text: ' window', isMatch: false },
    ])
  })

  it('keeps the text whole when the query is blank', () => {
    expect(splitOnMatch('the refund window', '  ')).toEqual([{ text: 'the refund window', isMatch: false }])
  })

  it('keeps the text whole when the query does not appear', () => {
    expect(splitOnMatch('the refund window', 'payout')).toEqual([{ text: 'the refund window', isMatch: false }])
  })

  it('ignores the spaces around the query', () => {
    expect(splitOnMatch('the refund', ' refund ')).toEqual([
      { text: 'the ', isMatch: false },
      { text: 'refund', isMatch: true },
    ])
  })
})
