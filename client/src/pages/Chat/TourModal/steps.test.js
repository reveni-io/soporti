import { describe, it, expect } from 'vitest'
import { buildSteps } from './steps.js'

const GENERAL_IDS = ['intro', 'sources', 'profiles']

describe('buildSteps', () => {
  it('always includes the general steps and the closing tips', () => {
    const steps = buildSteps([])

    expect(steps.map(step => step.id)).toEqual([...GENERAL_IDS, 'tips'])
    expect(steps.at(-1).bullets.length).toBeGreaterThan(0)
  })

  it('adds only the capability steps whose integrations are configured', () => {
    const steps = buildSteps([{ id: 'github', name: 'GitHub' }])

    expect(steps.map(step => step.id)).toEqual([...GENERAL_IDS, 'code', 'tips'])
  })

  it('keeps the capability steps in their declared order', () => {
    const steps = buildSteps([
      { id: 'sentry', name: 'Sentry' },
      { id: 'github', name: 'GitHub' },
      { id: 'notion', name: 'Notion' },
    ])

    expect(steps.map(step => step.id)).toEqual([...GENERAL_IDS, 'code', 'docs', 'tracking', 'tips'])
  })

  it('attaches the matching integrations to the step', () => {
    const steps = buildSteps([
      { id: 'postgres', name: 'PostgreSQL' },
      { id: 'shopify', name: 'Shopify' },
      { id: 'github', name: 'GitHub' },
    ])

    const dataStep = steps.find(step => step.id === 'data')
    expect(dataStep.integrations.map(integration => integration.id)).toEqual(['postgres', 'shopify'])
  })

  it('attaches example questions for the step categories', () => {
    const steps = buildSteps([{ id: 'github', name: 'GitHub' }])

    const codeStep = steps.find(step => step.id === 'code')
    expect(codeStep.examples.length).toBeGreaterThan(0)
    expect(codeStep.examples.every(example => example.category === 'product')).toBe(true)
  })
})
