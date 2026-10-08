import { describe, it, expect } from 'vitest'
import { renderInlineComment, renderReviewBody, renderWalkthrough } from './render.js'

const GITHUB_COMMENT_LIMIT = 65_536

function finding(overrides = {}) {
  return {
    path: 'src/checkout.js',
    startLine: null,
    line: 11,
    severity: 'major',
    category: 'bug',
    title: 'The total goes negative on refunds.',
    body: 'sumItems subtracts refunds without a floor (src/cart.js:40), so the charge is negative.',
    suggestion: null,
    fixPrompt: 'Clamp the total to zero in sumItems and add a test with a full refund.',
    ...overrides,
  }
}

function output({ findings = [], ...overrides } = {}) {
  return {
    overview: {
      walkthrough: 'Recomputes the checkout total from the cart items.',
      changes: [{ label: 'Checkout total', files: ['src/checkout.js'], summary: 'Sums the items before validating.' }],
      effort: 2,
      reviewMinutes: 15,
      diagram: null,
      previousFindings: null,
      verdict: 'comment',
      ...overrides,
    },
    findings,
  }
}

function pass(lens, overrides = {}) {
  return { lens, status: 'completed', note: null, ...overrides }
}

const PASSES = [
  pass('overview'),
  pass('correctness', { note: 'No bugs found.' }),
  pass('security', { note: 'No vulnerabilities found.' }),
  pass('standards', { note: 'Follows CLAUDE.md.' }),
  pass('spec', { note: 'Implements sc-42.' }),
]

function review(overrides = {}) {
  return {
    event: 'COMMENT',
    findings: { inline: [], outside: [], nits: [] },
    output: output(),
    passes: PASSES,
    verification: { proposed: 0, confirmed: 0, downgraded: 0, dropped: 0, unverified: 0, skipped: 0 },
    coverage: {
      files: [{ filename: 'src/checkout.js', generated: false, empty: false }],
      reviewedPaths: new Set(['src/checkout.js']),
      notReviewed: [],
    },
    context: {
      trigger: { kind: 'review_requested', baseSha: 'base0001', baseRef: 'main', title: 'Fix the checkout total' },
      history: null,
      headSha: 'deadbeef',
      standards: { documents: [], notInlined: [] },
      spec: { configured: false, stories: [] },
    },
    ...overrides,
  }
}

describe('renderInlineComment', () => {
  it('renders the badges, the bold title, the body and a collapsed prompt for AI agents', () => {
    const comment = renderInlineComment(finding({ anchorStartLine: null }))

    expect(comment).toBe(
      [
        '**🐛 Bug** | **🟠 Major**',
        '**The total goes negative on refunds.**',
        'sumItems subtracts refunds without a floor (src/cart.js:40), so the charge is negative.',
        '<details>\n<summary>🤖 Prompt for AI Agents</summary>',
        '```\nVerify this finding against the current code and only fix it if it is still valid.',
        'In @src/checkout.js at line 11: Clamp the total to zero in sumItems and add a test with a full refund.\n```',
        '</details>',
      ].join('\n\n')
    )
  })

  it('collapses the verifier evidence under "Why this was flagged" between the body and the suggestion', () => {
    const comment = renderInlineComment(
      finding({
        anchorStartLine: null,
        suggestion: 'const total = 0',
        evidence: 'src/cart.js:40 subtracts refunds and nothing clamps the result.',
      })
    )

    expect(comment).toContain(
      [
        'sumItems subtracts refunds without a floor (src/cart.js:40), so the charge is negative.',
        '<details>\n<summary>🔍 Why this was flagged</summary>',
        'src/cart.js:40 subtracts refunds and nothing clamps the result.',
        '</details>',
        '<details>\n<summary>📝 Committable suggestion</summary>',
      ].join('\n\n')
    )
    expect(renderInlineComment(finding({ anchorStartLine: null, evidence: null }))).not.toContain(
      'Why this was flagged'
    )
    expect(renderInlineComment(finding({ anchorStartLine: null, evidence: '  ' }))).not.toContain(
      'Why this was flagged'
    )
  })

  it('labels every severity and category', () => {
    const comment = renderInlineComment(finding({ severity: 'critical', category: 'security', anchorStartLine: null }))

    expect(comment.startsWith('**🔒 Security** | **🔴 Critical**')).toBe(true)
  })

  it('adds a collapsed committable suggestion for a range anchored in one hunk', () => {
    const comment = renderInlineComment(
      finding({
        startLine: 10,
        line: 12,
        anchorStartLine: 10,
        suggestion: 'const total = sumItems(cart)\nvalidate(total)',
      })
    )

    expect(comment).toContain(
      [
        '<details>\n<summary>📝 Committable suggestion</summary>',
        '> ‼️ **IMPORTANT**\n> Review the suggestion before committing it: it replaces lines 10–12.',
        '```suggestion\nconst total = sumItems(cart)\nvalidate(total)\n```',
        '</details>',
      ].join('\n\n')
    )
    expect(comment).toContain('In @src/checkout.js around lines 10 - 12: Clamp the total')
  })

  it('makes a single-line suggestion committable on that line', () => {
    const comment = renderInlineComment(finding({ anchorStartLine: null, suggestion: 'const total = 0' }))

    expect(comment).toContain('it replaces line 11.')
    expect(comment).toContain('```suggestion\nconst total = 0\n```')
  })

  it('shows a non-committable proposed fix when the range could not be anchored', () => {
    const comment = renderInlineComment(
      finding({ startLine: 2, line: 21, anchorStartLine: null, suggestion: 'const total = 0' })
    )

    expect(comment).toContain(
      '<details>\n<summary>🛠️ Proposed fix</summary>\n\n```\nconst total = 0\n```\n\n</details>'
    )
    expect(comment).not.toContain('```suggestion')
    expect(comment).not.toContain('Committable suggestion')
    expect(comment).toContain('In @src/checkout.js around lines 2 - 21:')
  })

  it('omits the suggestion block when there is none', () => {
    const comment = renderInlineComment(finding({ anchorStartLine: null, suggestion: '  ' }))

    expect(comment).not.toContain('Committable suggestion')
    expect(comment).not.toContain('Proposed fix')
  })

  it('drops trailing newlines from a suggestion so committing it adds no blank line', () => {
    const comment = renderInlineComment(finding({ anchorStartLine: null, suggestion: 'const total = 0\n\n' }))

    expect(comment).toContain('```suggestion\nconst total = 0\n```')
  })

  it('fences content with more backticks than any run inside it', () => {
    const comment = renderInlineComment(
      finding({ anchorStartLine: null, suggestion: 'const doc = `\n```js\n```\n`', fixPrompt: 'Use ``` fences.' })
    )

    expect(comment).toContain('````suggestion\nconst doc = `\n```js\n```\n`\n````')
    expect(comment).toContain('````\nVerify this finding')
  })

  it('redacts secrets', () => {
    const comment = renderInlineComment(
      finding({ anchorStartLine: null, body: 'Hardcoded token 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 here.' })
    )

    expect(comment).not.toContain('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')
    expect(comment).toContain('Hardcoded token [redacted] here.')
  })
})

describe('renderReviewBody', () => {
  it('starts with the inline count and a rollup of the inline and outside-diff severities', () => {
    const body = renderReviewBody(
      review({
        findings: {
          inline: [finding({ anchorStartLine: null }), finding({ severity: 'minor', anchorStartLine: null })],
          outside: [finding({ line: null, severity: 'minor' })],
          nits: [finding({ severity: 'nit' })],
        },
      })
    )

    expect(body.split('\n')[0]).toBe('**Actionable comments posted: 2** · 🟠 1 major · 🟡 2 minor')
  })

  it('starts an approved review with the approval line', () => {
    const body = renderReviewBody(review({ event: 'APPROVE' }))

    expect(body.split('\n')[0]).toBe('✅ **Approved**: trivial change, safe to merge')
  })

  it('omits every empty section from a clean review', () => {
    const body = renderReviewBody(review())

    expect(body.split('\n')[0]).toBe('**Actionable comments posted: 0**')
    expect(body).not.toMatch(/Partial review|Outside diff range|Nitpick|Since the last review|Prompt for all/)
    expect(body).toContain('<summary>ℹ️ Review info</summary>')
    expect(body.endsWith('<sub>Automated review by Soporti</sub>')).toBe(true)
  })

  it('flags a partial review right after the count', () => {
    const body = renderReviewBody(
      review({
        coverage: {
          files: [{ filename: 'src/checkout.js' }, { filename: 'src/cart.js' }],
          reviewedPaths: new Set(['src/checkout.js']),
          notReviewed: ['src/cart.js'],
        },
      })
    )

    expect(body.split('\n\n')[1]).toBe(
      '> ⚠️ **Partial review**: 1 file(s) were not reviewed (listed under Review info). A human needs to check what was not covered.'
    )
  })

  it('flags a partial review when a finder pass failed, naming the failed shards, but not for the overview', () => {
    const passes = [
      pass('overview', { status: 'failed' }),
      pass('correctness'),
      pass('correctness', { status: 'failed' }),
      pass('security', { status: 'failed' }),
    ]

    const failedFinders = renderReviewBody(review({ passes }))
    const failedOverview = renderReviewBody(
      review({ passes: [pass('overview', { status: 'failed' }), pass('security')] })
    )
    const both = renderReviewBody(
      review({
        passes: [pass('overview'), pass('security', { status: 'failed' })],
        coverage: { files: [{ filename: 'src/cart.js' }], reviewedPaths: new Set(), notReviewed: ['src/cart.js'] },
      })
    )

    expect(failedFinders.split('\n\n')[1]).toBe(
      '> ⚠️ **Partial review**: the correctness (1 of 2 shards) and security passes failed. A human needs to check what was not covered.'
    )
    expect(failedOverview).not.toMatch(/Partial review/)
    expect(both.split('\n\n')[1]).toBe(
      '> ⚠️ **Partial review**: 1 file(s) were not reviewed (listed under Review info) and the security pass failed. A human needs to check what was not covered.'
    )
  })

  it('collapses the outside-diff findings by file and opens them when one is critical or major', () => {
    const body = renderReviewBody(
      review({
        findings: {
          inline: [],
          outside: [
            finding({ path: 'src/cart.js', startLine: 10, line: 12, severity: 'minor', category: 'tests' }),
            finding({ path: 'src/db.js', line: null, category: 'spec', title: 'The migration is missing.' }),
          ],
          nits: [],
        },
      })
    )

    expect(body).toContain('<details open>\n<summary>⚠️ Outside diff range comments (2)</summary><blockquote>')
    expect(body).toContain(
      [
        '<details>\n<summary>src/db.js (1)</summary><blockquote>',
        '**📋 Spec** | **🟠 Major**',
        '**The migration is missing.**',
        'sumItems subtracts refunds without a floor (src/cart.js:40), so the charge is negative.',
        '</blockquote></details>',
      ].join('\n\n')
    )
    expect(body).toContain('`10-12`: **🧪 Tests** | **🟡 Minor**')
    expect(body.indexOf('src/db.js (1)')).toBeLessThan(body.indexOf('src/cart.js (1)'))
  })

  it('keeps the outside-diff section closed when it holds only minor findings', () => {
    const body = renderReviewBody(
      review({ findings: { inline: [], outside: [finding({ line: 500, severity: 'minor' })], nits: [] } })
    )

    expect(body).toContain('<details>\n<summary>⚠️ Outside diff range comments (1)</summary><blockquote>')
    expect(body).toContain('`500`: **🐛 Bug** | **🟡 Minor**')
  })

  it('collapses the evidence of a body finding too', () => {
    const body = renderReviewBody(
      review({
        findings: {
          inline: [],
          outside: [finding({ line: null, evidence: 'No migration adds the column (server/drizzle/).' })],
          nits: [],
        },
      })
    )

    expect(body).toContain(
      '<details>\n<summary>🔍 Why this was flagged</summary>\n\nNo migration adds the column (server/drizzle/).\n\n</details>'
    )
  })

  it('shows the suggestion of a body finding as a proposed fix', () => {
    const body = renderReviewBody(
      review({ findings: { inline: [], outside: [finding({ line: null, suggestion: 'ALTER TABLE x;' })], nits: [] } })
    )

    expect(body).toContain('<summary>🛠️ Proposed fix</summary>\n\n```\nALTER TABLE x;\n```')
    expect(body).not.toContain('```suggestion')
  })

  it('collapses the nits by file and shows at most 15 of them', () => {
    const nits = Array.from({ length: 17 }, (_, i) =>
      finding({ path: i < 10 ? 'src/a.js' : 'src/b.js', line: i + 1, severity: 'nit', title: `Nit ${i + 1}.` })
    )

    const body = renderReviewBody(review({ findings: { inline: [], outside: [], nits } }))

    expect(body).toContain('<details>\n<summary>🧹 Nitpick comments (17)</summary><blockquote>')
    expect(body).toContain('<summary>src/a.js (10)</summary>')
    expect(body).toContain('<summary>src/b.js (5)</summary>')
    expect(body).toContain('**Nit 15.**')
    expect(body).not.toContain('**Nit 16.**')
    expect(body).toContain('…and 2 more')
  })

  it('collapses what changed since the last review', () => {
    const body = renderReviewBody(review({ output: output({ previousFindings: '- Fixed: the negative total' }) }))

    expect(body).toContain(
      '<details>\n<summary>♻️ Since the last review</summary>\n\n- Fixed: the negative total\n\n</details>'
    )
  })

  it('aggregates every fix prompt for AI agents by section and file', () => {
    const body = renderReviewBody(
      review({
        findings: {
          inline: [
            finding({ startLine: 10, line: 12, anchorStartLine: 10, fixPrompt: 'Guard the total.\nAdd a test.' }),
          ],
          outside: [finding({ path: 'src/db.js', line: null, severity: 'minor', fixPrompt: 'Add the migration.' })],
          nits: [finding({ line: 55, severity: 'nit', fixPrompt: 'Rename total.' })],
        },
      })
    )

    expect(body).toContain(
      [
        '<details>\n<summary>🤖 Prompt for all review comments with AI agents</summary>',
        '```\nVerify each finding against the current code and only fix it if needed.',
        'Inline comments:\nIn @src/checkout.js:\n- Around lines 10 - 12: Guard the total.\n  Add a test.',
        'Outside diff range comments:\nIn @src/db.js:\n- Add the migration.',
        'Nitpick comments:\nIn @src/checkout.js:\n- At line 55: Rename total.\n```',
        '</details>',
      ].join('\n\n')
    )
  })

  it('lists the actionable findings in an open section when they could not be posted inline', () => {
    const body = renderReviewBody(
      review({
        findings: { inline: [finding({ anchorStartLine: null })], outside: [], nits: [] },
        isInlineInBody: true,
      })
    )

    expect(body.split('\n')[0]).toBe('**Actionable comments posted: 1** · 🟠 1 major')
    expect(body).toContain('<details open>\n<summary>💬 Actionable comments (1)</summary><blockquote>')
    expect(body).toContain('`11`: **🐛 Bug** | **🟠 Major**')
    expect(body).toContain('Actionable comments:\nIn @src/checkout.js:\n- At line 11: Clamp the total')
  })

  it('reports the commits, trigger, standards and spec in the review info', () => {
    const body = renderReviewBody(
      review({
        context: {
          trigger: { kind: 'labeled', baseSha: 'base0001', baseRef: 'main' },
          history: { lastReviewedSha: 'abc1234def', changes: { status: 'incremental', files: [] } },
          headSha: 'deadbeef',
          standards: {
            documents: [{ path: 'CLAUDE.md', modified: false, content: 'No comments.', truncated: false }],
            notInlined: [{ path: 'docs/adr/0001-x.md', modified: false }],
          },
          spec: {
            configured: true,
            stories: [
              { id: 42, story: { name: 'Checkout' } },
              { id: 43, story: null },
            ],
          },
        },
      })
    )

    expect(body).toContain(
      [
        '- **Commits:** `base000..deadbee` (re-review since `abc1234`)',
        '- **Trigger:** label',
        '- **Standards:** `CLAUDE.md`, `docs/adr/0001-x.md`',
        '- **Spec:** sc-42, sc-43',
        '- **Passes:** overview, correctness, security, standards, spec',
        '- **Verification:** 0 proposed · 0 confirmed · 0 downgraded · 0 dropped',
      ].join('\n')
    )
  })

  it('counts the passes, marks the failed ones and sums up the verification in the review info', () => {
    const body = renderReviewBody(
      review({
        passes: [
          pass('overview'),
          pass('correctness'),
          pass('correctness', { status: 'failed' }),
          pass('correctness'),
          pass('security', { status: 'failed' }),
        ],
        verification: { proposed: 7, confirmed: 2, downgraded: 1, dropped: 1, unverified: 1, skipped: 2 },
      })
    )

    expect(body).toContain(
      [
        '- **Passes:** overview, correctness ×3 (❌ 1 failed), security (❌ failed)',
        '- **Verification:** 7 proposed · 2 confirmed · 1 downgraded · 1 dropped · 1 unverified · 2 skipped (over the verification limit)',
      ].join('\n')
    )
  })

  it('names the base branch, the full-diff re-review and the missing standards and spec', () => {
    const body = renderReviewBody(
      review({
        context: {
          trigger: { kind: 'synchronize', baseSha: null, baseRef: 'main' },
          history: { lastReviewedSha: 'abc1234def', changes: { status: 'diverged' } },
          headSha: 'deadbeef',
          standards: { documents: [], notInlined: [] },
          spec: { configured: true, stories: [] },
        },
      })
    )

    expect(body).toContain(
      [
        '- **Commits:** `main..deadbee` (re-review of the full diff)',
        '- **Trigger:** push',
        '- **Standards:** none found',
        '- **Spec:** none',
      ].join('\n')
    )
  })

  it('splits the changed files into reviewed, skipped and not reviewed', () => {
    const body = renderReviewBody(
      review({
        coverage: {
          files: [
            { filename: 'src/checkout.js' },
            { filename: 'package-lock.json', generated: true },
            { filename: 'yarn.lock', generated: true },
            { filename: 'apps/__init__.py', empty: true },
            { filename: 'db/seed.sql' },
          ],
          reviewedPaths: new Set(['src/checkout.js', 'yarn.lock']),
          notReviewed: ['db/seed.sql'],
        },
      })
    )

    expect(body).toContain(
      '<summary>📒 Files reviewed (2)</summary>\n\n- `src/checkout.js`\n- `yarn.lock` (generated)\n\n</details>'
    )
    expect(body).toContain(
      '<summary>⏭️ Files skipped (2)</summary>\n\n- `package-lock.json` (generated)\n- `apps/__init__.py` (empty)\n\n</details>'
    )
    expect(body).toContain('<summary>⚠️ Files not reviewed (1)</summary>\n\n- `db/seed.sql`\n\n</details>')
  })

  it('caps a long file list at 100 entries', () => {
    const files = Array.from({ length: 250 }, (_, i) => ({ filename: `src/module-${i}.js` }))

    const body = renderReviewBody(
      review({ coverage: { files, reviewedPaths: new Set(files.map(file => file.filename)), notReviewed: [] } })
    )

    expect(body).toContain('<summary>📒 Files reviewed (250)</summary>')
    expect(body).toContain('- `src/module-99.js`')
    expect(body).not.toContain('- `src/module-100.js`')
    expect(body).toContain('…and 150 more')
  })

  it("stays under GitHub's size limit by leaving out the sections that do not fit", () => {
    const outside = Array.from({ length: 100 }, (_, i) =>
      finding({ path: `src/module-${i}.js`, line: null, body: 'x'.repeat(1000) })
    )
    const files = Array.from({ length: 600 }, (_, i) => ({ filename: `src/a/very/deep/path/to/module-${i}.js` }))

    const body = renderReviewBody(
      review({
        findings: { inline: [], outside, nits: [] },
        coverage: { files, reviewedPaths: new Set(), notReviewed: files.map(file => file.filename) },
      })
    )

    expect(body.length).toBeLessThan(GITHUB_COMMENT_LIMIT)
    expect(body).not.toContain('Outside diff range comments (100)')
    expect(body).toContain('<summary>ℹ️ Review info</summary>')
    expect(body).toContain("> ✂️ **Truncated**: some sections were left out to stay under GitHub's comment size limit.")
    expect(body.endsWith('<sub>Automated review by Soporti</sub>')).toBe(true)
  })

  it('redacts secrets', () => {
    const body = renderReviewBody(
      review({
        output: output({ previousFindings: 'Still connects with postgres://app:s3cr3t@db.internal/soporti.' }),
      })
    )

    expect(body).not.toContain('s3cr3t')
    expect(body).toContain('postgres://[redacted]@db.internal/soporti')
  })
})

describe('renderWalkthrough', () => {
  function walkthrough(overrides = {}) {
    return { ...review(), ciStatus: null, reviewerLogin: 'soporti-bot', ...overrides }
  }

  it('renders the marker, the walkthrough, the merge risk, the effort and the footer', () => {
    const comment = renderWalkthrough(walkthrough())

    expect(comment).toMatch(/^<!-- soporti:walkthrough -->\n## 📝 Walkthrough\n\nRecomputes the checkout total/)
    expect(comment).toContain(
      '**Merge risk:** 🟢 Low · no blocking issues found\n**Estimated review effort:** 🎯 2 (Simple) · ⏱️ ~15 minutes'
    )
    expect(
      comment.endsWith(
        '<sub>Last reviewed commit: `deadbee` · updated on every review · comment `@soporti-bot review` to request a new one</sub>'
      )
    ).toBe(true)
  })

  it('leaves the review command out of the footer when the reviewer login is unknown', () => {
    const comment = renderWalkthrough(walkthrough({ reviewerLogin: null }))

    expect(comment.endsWith('<sub>Last reviewed commit: `deadbee` · updated on every review</sub>')).toBe(true)
  })

  it('rates the merge risk from the most severe posted finding', () => {
    const findings = [
      finding({ severity: 'major', title: 'Major issue.' }),
      finding({ severity: 'critical', title: 'Deletes every order.' }),
    ]

    expect(renderWalkthrough(walkthrough({ output: output({ findings }) }))).toContain(
      '**Merge risk:** 🔴 High · Deletes every order.'
    )
    expect(renderWalkthrough(walkthrough({ output: output({ findings: [findings[0]] }) }))).toContain(
      '**Merge risk:** 🟠 Medium · Major issue.'
    )
  })

  it('rates the merge risk unknown when files were not reviewed and low on an approval', () => {
    const partial = walkthrough({
      output: output({ findings: [finding({ severity: 'minor' })] }),
      coverage: { files: [], reviewedPaths: new Set(), notReviewed: ['a.js', 'b.js'] },
    })

    expect(renderWalkthrough(partial)).toContain('**Merge risk:** ⚪ Unknown · 2 file(s) not reviewed')
    expect(renderWalkthrough(walkthrough({ event: 'APPROVE' }))).toContain(
      '**Merge risk:** 🟢 Low · trivial change, approved'
    )
  })

  it('clamps the review effort to the 1-5 scale', () => {
    expect(renderWalkthrough(walkthrough({ output: output({ effort: 9, reviewMinutes: 240 }) }))).toContain(
      '🎯 5 (Very complex) · ⏱️ ~240 minutes'
    )
    expect(renderWalkthrough(walkthrough({ output: output({ effort: 0, reviewMinutes: 0 }) }))).toContain(
      '🎯 1 (Trivial) · ⏱️ ~1 minutes'
    )
  })

  it('collapses the changes table, escaping backslashes, pipes and newlines in its cells', () => {
    const changes = [
      {
        label: 'Totals | math',
        files: ['src/checkout.js', 'src/cart.js'],
        summary: 'Sums items.\nMatches \\| literally.',
      },
    ]

    const comment = renderWalkthrough(walkthrough({ output: output({ changes }) }))

    expect(comment).toContain(
      [
        '<details>\n<summary>📂 Changes</summary>\n',
        '| Cohort / File(s) | Summary |',
        '| :--- | :--- |',
        '| **Totals \\| math**<br>`src/checkout.js`, `src/cart.js` | Sums items.<br>Matches \\\\\\| literally. |\n',
        '</details>',
      ].join('\n')
    )
  })

  it('caps the files listed in a cohort', () => {
    const files = Array.from({ length: 130 }, (_, i) => `src/module-${i}.js`)

    const comment = renderWalkthrough(
      walkthrough({ output: output({ changes: [{ label: 'All', files, summary: 's' }] }) })
    )

    expect(comment).toContain('`src/module-99.js`, …and 30 more |')
    expect(comment).not.toContain('`src/module-100.js`')
  })

  it('adds the sequence diagram only when there is one', () => {
    const diagram = 'sequenceDiagram\n  Client->>API: POST /checkout'

    expect(renderWalkthrough(walkthrough({ output: output({ diagram }) }))).toContain(
      '<details>\n<summary>📊 Sequence diagram</summary>\n\n```mermaid\nsequenceDiagram\n  Client->>API: POST /checkout\n```\n\n</details>'
    )
    expect(renderWalkthrough(walkthrough())).not.toContain('Sequence diagram')
  })

  it('omits the changes table when there are no cohorts', () => {
    expect(renderWalkthrough(walkthrough({ output: output({ changes: [] }) }))).not.toContain('📂 Changes')
  })

  it('passes the checks when no posted finding breaks the standards or the spec and CI is green', () => {
    const comment = renderWalkthrough(
      walkthrough({
        context: {
          ...review().context,
          spec: {
            configured: true,
            stories: [
              { id: 42, story: { name: 'Checkout' } },
              { id: 43, story: null },
            ],
          },
        },
        ciStatus: {
          checks: [
            { name: 'test', state: 'completed' },
            { name: 'lint', state: 'completed' },
          ],
        },
      })
    )

    expect(comment).toContain(
      [
        '<details>\n<summary>🚥 Checks · ✅ 3</summary>\n',
        '| Check | Status | Details |',
        '| :--- | :--- | :--- |',
        '| Standards | ✅ Passed | Follows CLAUDE.md. |',
        '| Spec | ✅ Passed | Implements sc-42. |',
        '| CI | ✅ Passed | 2 passed |',
      ].join('\n')
    )
  })

  it('warns on the standards and spec checks when a posted finding breaks them and reports failed CI', () => {
    const findings = [finding({ category: 'standards' }), finding({ category: 'spec' })]
    const checks = [
      { name: 'test (server)', state: 'failed' },
      { name: 'build', state: 'pending' },
    ]

    const comment = renderWalkthrough(
      walkthrough({
        output: output({ findings }),
        context: {
          ...review().context,
          spec: { configured: true, stories: [{ id: 42, story: { name: 'Checkout' } }] },
        },
        ciStatus: { checks },
      })
    )

    expect(comment).toContain('<summary>🚥 Checks · ⚠️ 2 · ❌ 1</summary>')
    expect(comment).toContain('| Standards | ⚠️ Warning | Follows CLAUDE.md. |')
    expect(comment).toContain('| Spec | ⚠️ Warning | Implements sc-42. |')
    expect(comment).toContain('| CI | ❌ Failed | 1 failed: test (server) |')
  })

  it('skips the spec check when no spec pass ran, while the review info still lists the detected stories', () => {
    const spec = {
      configured: true,
      stories: [
        { id: 42, story: null },
        { id: 43, story: null },
      ],
    }
    const context = { ...review().context, spec }
    const passes = PASSES.filter(candidate => candidate.lens !== 'spec')
    const findings = [finding({ category: 'spec' })]

    expect(renderReviewBody(review({ context, passes }))).toContain('- **Spec:** sc-42, sc-43')
    expect(renderWalkthrough(walkthrough({ context, passes, output: output({ findings }) }))).toContain(
      '| Spec | ➖ Skipped | No spec available |'
    )
  })

  it('skips the standards check when no standards document was found', () => {
    const passes = PASSES.filter(candidate => candidate.lens !== 'standards')

    expect(renderWalkthrough(walkthrough({ passes }))).toContain(
      '| Standards | ➖ Skipped | No standards documents found |'
    )
  })

  it('warns on a check whose pass did not complete', () => {
    const passes = PASSES.map(candidate =>
      candidate.lens === 'standards' ? pass('standards', { status: 'failed' }) : candidate
    )

    expect(renderWalkthrough(walkthrough({ passes }))).toContain(
      '| Standards | ⚠️ Warning | The standards pass did not complete |'
    )
  })

  it('reports pending or missing CI', () => {
    const pendingChecks = Array.from({ length: 7 }, (_, i) => ({ name: `job-${i}`, state: 'pending' }))

    const pending = renderWalkthrough(walkthrough({ ciStatus: { checks: pendingChecks } }))

    expect(pending).toContain('| CI | ⏳ Pending | 7 pending: job-0, job-1, job-2, job-3, job-4, … |')
    expect(pending).toContain('<summary>🚥 Checks · ✅ 2 · ⏳ 1</summary>')
    expect(renderWalkthrough(walkthrough({ ciStatus: { checks: [] } }))).toContain(
      '| CI | ➖ Skipped | No checks reported |'
    )
    expect(renderWalkthrough(walkthrough({ ciStatus: null }))).toContain(
      '| CI | ➖ Skipped | The CI status could not be loaded |'
    )
  })

  it('rates the merge risk unknown when a finder pass failed', () => {
    const passes = [pass('overview'), pass('correctness'), pass('security', { status: 'failed' })]

    expect(renderWalkthrough(walkthrough({ passes }))).toContain(
      '**Merge risk:** ⚪ Unknown · the security pass failed'
    )
  })

  it('falls back to the PR title and a note when the overview is unavailable', () => {
    const comment = renderWalkthrough(
      walkthrough({
        output: { overview: null, findings: [finding({ severity: 'minor' })] },
        passes: [pass('overview', { status: 'failed' }), pass('correctness'), pass('security')],
      })
    )

    expect(comment).toContain(
      [
        '<!-- soporti:walkthrough -->\n## 📝 Walkthrough',
        '**Fix the checkout total**',
        '> ⚠️ The overview is unavailable for this review: its pass did not complete. The findings are in the review.',
        '**Merge risk:** 🟢 Low · no blocking issues found',
        '<details>\n<summary>🚥 Checks',
      ].join('\n\n')
    )
    expect(comment).not.toMatch(/Estimated review effort|📂 Changes|Sequence diagram/)
    expect(
      renderReviewBody(
        review({ output: { overview: null, findings: [] }, passes: [pass('overview', { status: 'failed' })] })
      )
    ).not.toContain('Since the last review')
  })

  it("stays under GitHub's size limit for a PR with hundreds of files", () => {
    const changes = Array.from({ length: 8 }, (_, cohort) => ({
      label: `Cohort ${cohort}`,
      files: Array.from({ length: 400 }, (_, i) => `packages/cohort-${cohort}/src/deeply/nested/module-${i}.ts`),
      summary: 'Moves the module.',
    }))

    const comment = renderWalkthrough(walkthrough({ output: output({ changes }) }))

    expect(comment.length).toBeLessThan(GITHUB_COMMENT_LIMIT)
    expect(comment.startsWith('<!-- soporti:walkthrough -->')).toBe(true)
    expect(comment.match(/…and 300 more/g)).toHaveLength(8)
    expect(comment).toContain('<summary>🚥 Checks')
  })

  it('redacts secrets', () => {
    const comment = renderWalkthrough(
      walkthrough({
        output: output({ walkthrough: 'Rotates ghp_abcdefghijklmnopqrstuvwxyz0123456789 in the config.' }),
      })
    )

    expect(comment).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(comment).toContain('Rotates [redacted] in the config.')
  })
})
