import { describe, it, expect } from 'vitest'
import { EXAMPLE_QUESTIONS, sampleExampleQuestions, questionsForCategories } from './example-questions.js'

const github = { id: 'github', name: 'GitHub' }
const postgres = { id: 'postgres', name: 'Database' }
const shopify = { id: 'shopify', name: 'Shopify' }
const sentry = { id: 'sentry', name: 'Sentry' }

describe('EXAMPLE_QUESTIONS', () => {
  it('every question has a category and text', () => {
    for (const question of EXAMPLE_QUESTIONS) {
      expect(question.category).toBeTruthy()
      expect(question.text).toBeTruthy()
    }
  })

  it('has at least one untagged question as a fallback', () => {
    expect(EXAMPLE_QUESTIONS.some(q => !q.integrationId)).toBe(true)
  })
})

describe('sampleExampleQuestions', () => {
  it('only returns questions for configured integrations (plus untagged ones)', () => {
    const sample = sampleExampleQuestions([github], 20)
    for (const question of sample) {
      expect([undefined, 'github']).toContain(question.integrationId)
    }
  })

  it('returns the requested number of questions when enough are available', () => {
    const sample = sampleExampleQuestions([github, postgres, sentry], 4)
    expect(sample).toHaveLength(4)
  })

  it('returns only untagged questions when no integrations are configured', () => {
    const sample = sampleExampleQuestions([], 4)
    expect(sample.length).toBeGreaterThan(0)
    for (const question of sample) {
      expect(question.integrationId).toBeUndefined()
    }
  })

  it('does not repeat questions', () => {
    const sample = sampleExampleQuestions([github, postgres, sentry], 10)
    const texts = sample.map(q => q.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('spreads the sample across categories', () => {
    const sample = sampleExampleQuestions([github, postgres, sentry], 4, () => 0)
    const categories = sample.map(q => q.category)
    expect(new Set(categories).size).toBe(4)
  })

  it('caps the sample at the available pool size', () => {
    const sample = sampleExampleQuestions([github], 100)
    const available = EXAMPLE_QUESTIONS.filter(q => !q.integrationId || q.integrationId === 'github')
    expect(sample).toHaveLength(available.length)
  })
})

describe('questionsForCategories', () => {
  it('only returns questions from the given categories', () => {
    const questions = questionsForCategories(['product'], [github, postgres], 10)
    expect(questions.length).toBeGreaterThan(0)
    for (const question of questions) {
      expect(question.category).toBe('product')
    }
  })

  it('alternates between categories instead of exhausting the first one', () => {
    const questions = questionsForCategories(['data', 'orders'], [postgres, shopify])
    expect(questions).toHaveLength(3)
    expect(questions[0].category).toBe('data')
    expect(questions[1].category).toBe('orders')
  })

  it('filters out questions of unconfigured integrations', () => {
    const questions = questionsForCategories(['data', 'orders'], [shopify], 10)
    expect(questions.length).toBeGreaterThan(0)
    for (const question of questions) {
      expect(question.integrationId).toBe('shopify')
    }
  })

  it('is deterministic', () => {
    const a = questionsForCategories(['product'], [github])
    const b = questionsForCategories(['product'], [github])
    expect(a).toEqual(b)
  })
})
