import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../github/client.js', () => ({
  listRepos: vi.fn(),
}))

import { listRepos } from '../github/client.js'
import router from './repos.js'

const app = express()
app.use('/', router)

describe('GET /api/repos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns list of repos', async () => {
    listRepos.mockResolvedValue([
      { fullName: 'org/app', description: 'Main app', language: 'JS', defaultBranch: 'main' },
    ])

    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.repos).toHaveLength(1)
    expect(res.body.repos[0].fullName).toBe('org/app')
  })

  it('returns 500 on error', async () => {
    listRepos.mockRejectedValue(new Error('GitHub API error'))

    const res = await request(app).get('/')
    expect(res.status).toBe(500)
    expect(res.body.error).toContain('Failed to fetch')
  })
})
