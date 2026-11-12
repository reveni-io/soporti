import { describe, it, expect } from 'vitest'
import { dashboardPath } from './dashboard-path.js'

describe('dashboardPath', () => {
  it('builds the route of a dashboard from its id', () => {
    expect(dashboardPath('5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e')).toBe(
      '/analytics/5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'
    )
  })
})
