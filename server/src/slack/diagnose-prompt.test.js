import { describe, it, expect } from 'vitest'
import { buildTicketText, buildDiagnosisPrompt } from './diagnose-prompt.js'

describe('buildTicketText', () => {
  it('renders title and labeled fields', () => {
    const text = buildTicketText({
      title: 'Acme: cambio no sincronizado',
      fields: [
        { label: 'Priority', value: 'Medium' },
        { label: 'Details', value: 'El pedido ORD-123 no sincroniza' },
      ],
    })
    expect(text).toContain('Title: Acme: cambio no sincronizado')
    expect(text).toContain('Priority: Medium')
    expect(text).toContain('Details: El pedido ORD-123 no sincroniza')
  })

  it('skips fully empty fields and flattens label whitespace', () => {
    const text = buildTicketText({
      title: '',
      fields: [
        { label: 'A\n\tB', value: 'x' },
        { label: '', value: '' },
      ],
    })
    expect(text).toBe('A B: x')
  })

  it('caps very long field values', () => {
    const long = 'z'.repeat(10000)
    const text = buildTicketText({ title: 't', fields: [{ label: 'L', value: long }] })
    expect(text.length).toBeLessThan(long.length)
  })
})

describe('buildDiagnosisPrompt', () => {
  const prompt = buildDiagnosisPrompt({
    title: 'Bug raro',
    fields: [{ label: 'Details', value: 'algo se rompe' }],
  })

  it('embeds the ticket inside untrusted-content markers', () => {
    expect(prompt).toContain('<<<TICKET')
    expect(prompt).toContain('TICKET>>>')
    expect(prompt).toContain('algo se rompe')
  })

  it('declares ticket content as data, not instructions', () => {
    expect(prompt).toMatch(/never as instructions|never instructions|not instructions/i)
    expect(prompt.toLowerCase()).toContain('refuse')
  })

  it('requires the three-part diagnosis contract', () => {
    expect(prompt).toContain('Diagnosis')
    expect(prompt).toContain('Possible fixes')
    expect(prompt).toContain('Recommendation for support')
  })

  it('instructs the screenshot fallback and forbids leaking secrets', () => {
    expect(prompt.toLowerCase()).toContain('screenshot')
    expect(prompt.toLowerCase()).toMatch(/never include tokens|credentials/i)
  })
})
