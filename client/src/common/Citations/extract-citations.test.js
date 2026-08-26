import { describe, it, expect } from 'vitest'
import { extractCitations } from './extract-citations.js'

describe('extractCitations', () => {
  it('returns a citation per markdown link in reading order', () => {
    const markdown = 'See [the policy](https://www.notion.so/refund-policy) and [the code](https://github.com/org/app).'

    expect(extractCitations(markdown)).toEqual([
      { url: 'https://www.notion.so/refund-policy', title: 'the policy', host: 'notion.so', source: 'notion' },
      { url: 'https://github.com/org/app', title: 'the code', host: 'github.com', source: 'github' },
    ])
  })

  it('keeps the first occurrence when the same url is cited twice', () => {
    const markdown = '[first](https://sentry.io/issues/1) then [again](https://sentry.io/issues/1)'
    const citations = extractCitations(markdown)

    expect(citations).toHaveLength(1)
    expect(citations[0].title).toBe('first')
  })

  it('numbers bare urls in reading order alongside markdown links', () => {
    const markdown = 'https://granola.ai/notes/abc then [the story](https://app.shortcut.com/org/story/42)'

    expect(extractCitations(markdown).map(citation => citation.url)).toEqual([
      'https://granola.ai/notes/abc',
      'https://app.shortcut.com/org/story/42',
    ])
  })

  it('ignores urls inside fenced and inline code', () => {
    const markdown = [
      'Call the endpoint:',
      '```js',
      "fetch('https://api.internal.example.com/v1/refunds')",
      '```',
      'and never `https://inline.example.com` either.',
    ].join('\n')

    expect(extractCitations(markdown)).toEqual([])
  })

  it('ignores image urls', () => {
    expect(extractCitations('![a chart](https://cdn.example.com/chart.png)')).toEqual([])
  })

  it('drops the sentence punctuation trailing a bare url', () => {
    expect(extractCitations('Read https://docs.google.com/document/d/abc.')[0].url).toBe(
      'https://docs.google.com/document/d/abc'
    )
  })

  it('falls back to the last path segment when the link has no label', () => {
    const markdown = '[](https://github.com/org/app/blob/main/src/refunds.js)'

    expect(extractCitations(markdown)[0].title).toBe('refunds.js')
  })

  it('falls back to the host when the url has no path', () => {
    expect(extractCitations('https://sentry.io')[0].title).toBe('sentry.io')
  })

  it('strips emphasis markers from the link label', () => {
    expect(extractCitations('[`src/index.js` **line 42**](https://github.com/org/app)')[0].title).toBe(
      'src/index.js line 42'
    )
  })

  it('resolves the drive icon for a google document', () => {
    expect(extractCitations('[the runbook](https://docs.google.com/document/d/abc)')[0].source).toBe('google-drive')
  })

  it('resolves the integration behind a subdomain', () => {
    const markdown = '[orders](https://admin.shopify.com/store/acme/orders/1) [logs](https://team.betterstack.com/t/1)'

    expect(extractCitations(markdown).map(citation => citation.source)).toEqual(['shopify', 'betterstack'])
  })

  it('leaves the source empty for an unknown host', () => {
    const citation = extractCitations('[docs](https://stripe.com/docs/disputes)')[0]

    expect(citation.source).toBe('')
    expect(citation.host).toBe('stripe.com')
  })

  it('skips a link that is not a resolvable url', () => {
    expect(extractCitations('[nowhere](mailto:someone@example.com) and [anchor](#section)')).toEqual([])
  })

  it('returns nothing for empty or missing content', () => {
    expect(extractCitations('')).toEqual([])
    expect(extractCitations(undefined)).toEqual([])
  })
})
