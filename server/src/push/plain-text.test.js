import { describe, it, expect } from 'vitest'
import { toPlainText } from './plain-text.js'

describe('toPlainText', () => {
  it('keeps plain text as it is', () => {
    expect(toPlainText('Three refunds over 500 EUR since yesterday.')).toBe(
      'Three refunds over 500 EUR since yesterday.'
    )
  })

  it.each([
    ['## Summary\nAll good', 'Summary\nAll good'],
    ['> quoted\n> > nested', 'quoted\nnested'],
    ['- one\n* two\n+ three\n1. four\n2) five', 'one\ntwo\nthree\nfour\nfive'],
    ['- [x] done\n- [ ] pending', 'done\npending'],
    ['before\n\n---\n\nafter', 'before\n\n\n\nafter'],
  ])('drops the block markup of %j', (markdown, expected) => {
    expect(toPlainText(markdown)).toBe(expected)
  })

  it.each([
    ['**bold** and __strong__', 'bold and strong'],
    ['*italic* and _emphasis_', 'italic and emphasis'],
    ['~~gone~~ now', 'gone now'],
    ['run `npm test` first', 'run npm test first'],
    ['see [the docs](https://example.com/docs)', 'see the docs'],
    ['![a chart](https://example.com/chart.png)', 'a chart'],
    ['line<br>break and <b>tag</b>', 'line break and  tag '],
    ['5 \\* 3 \\_ok\\_', '5 * 3 _ok_'],
  ])('drops the inline markup of %j', (markdown, expected) => {
    expect(toPlainText(markdown)).toBe(expected)
  })

  it('keeps the identifiers that only look like emphasis', () => {
    expect(toPlainText('the snake_case_name field and 2*3*4')).toBe('the snake_case_name field and 2*3*4')
  })

  it('keeps the code of a fenced block without its fences', () => {
    expect(toPlainText('Run:\n```bash\nnpm test\n```\nDone.')).toBe('Run:\n\nnpm test\n\nDone.')
  })

  it('turns a table into its cell values', () => {
    const table = '| Order | Status |\n| --- | :---: |\n| 1001 | refunded |'

    expect(toPlainText(table)).toBe(' Order Status \n\n 1001 refunded ')
  })
})
