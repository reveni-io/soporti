import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../db/skills.js', () => ({
  listSkills: vi.fn(),
  getSkillById: vi.fn(),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
}))

const { listSkills, getSkillById, createSkill, updateSkill, deleteSkill } = await import('../db/skills.js')
const { default: skillsRouter } = await import('./skills.js')

const VALID_BODY = { name: 'bug-triage', description: 'Triage bugs', instructions: 'Always ask for repro steps.' }

describe('skills routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: 1 }
      next()
    })
    app.use('/', skillsRouter)
  })

  describe('GET /', () => {
    it('returns the user skills', async () => {
      listSkills.mockResolvedValue([{ id: 1, name: 'bug-triage' }])
      const res = await request(app).get('/')
      expect(res.status).toBe(200)
      expect(res.body.skills).toHaveLength(1)
      expect(listSkills).toHaveBeenCalledWith(1)
    })

    it('returns 500 when the DB fails', async () => {
      listSkills.mockRejectedValue(new Error('boom'))
      const res = await request(app).get('/')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /:id', () => {
    it('rejects a non-numeric id', async () => {
      const res = await request(app).get('/nope')
      expect(res.status).toBe(400)
      expect(getSkillById).not.toHaveBeenCalled()
    })

    it('returns 404 when the skill does not exist or is not owned', async () => {
      getSkillById.mockResolvedValue(null)
      const res = await request(app).get('/1')
      expect(res.status).toBe(404)
    })

    it('returns the skill', async () => {
      getSkillById.mockResolvedValue({ id: 1, ...VALID_BODY })
      const res = await request(app).get('/1')
      expect(res.status).toBe(200)
      expect(res.body.skill).toMatchObject(VALID_BODY)
      expect(getSkillById).toHaveBeenCalledWith(1, 1)
    })
  })

  describe('POST /', () => {
    it('creates a skill', async () => {
      createSkill.mockResolvedValue({ id: 1, ...VALID_BODY })
      const res = await request(app).post('/').send(VALID_BODY)
      expect(res.status).toBe(201)
      expect(res.body.skill).toMatchObject(VALID_BODY)
      expect(createSkill).toHaveBeenCalledWith(1, VALID_BODY)
    })

    it.each([
      ['missing name', { ...VALID_BODY, name: undefined }],
      ['uppercase name', { ...VALID_BODY, name: 'Bug-Triage' }],
      ['name with spaces', { ...VALID_BODY, name: 'bug triage' }],
      ['empty name', { ...VALID_BODY, name: '' }],
      ['name too long', { ...VALID_BODY, name: 'a'.repeat(51) }],
    ])('rejects an invalid name (%s)', async (_label, body) => {
      const res = await request(app).post('/').send(body)
      expect(res.status).toBe(400)
      expect(createSkill).not.toHaveBeenCalled()
    })

    it('rejects a description over the length limit', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...VALID_BODY, description: 'a'.repeat(201) })
      expect(res.status).toBe(400)
    })

    it('rejects missing or empty instructions', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...VALID_BODY, instructions: '   ' })
      expect(res.status).toBe(400)
    })

    it('rejects instructions over the length limit', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...VALID_BODY, instructions: 'a'.repeat(50_001) })
      expect(res.status).toBe(400)
    })

    it('returns 409 on a duplicate name', async () => {
      createSkill.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }))
      const res = await request(app).post('/').send(VALID_BODY)
      expect(res.status).toBe(409)
    })

    it('returns 500 on unexpected errors', async () => {
      createSkill.mockRejectedValue(new Error('boom'))
      const res = await request(app).post('/').send(VALID_BODY)
      expect(res.status).toBe(500)
    })
  })

  describe('PUT /:id', () => {
    it('rejects a non-numeric id (including a uuid)', async () => {
      const res = await request(app).put('/11111111-1111-4111-8111-111111111111').send(VALID_BODY)
      expect(res.status).toBe(400)
      expect(updateSkill).not.toHaveBeenCalled()
    })

    it('rejects an invalid body', async () => {
      const res = await request(app)
        .put('/1')
        .send({ ...VALID_BODY, name: 'Invalid Name' })
      expect(res.status).toBe(400)
    })

    it('returns 404 when the skill does not exist or is not owned', async () => {
      updateSkill.mockResolvedValue(null)
      const res = await request(app).put('/1').send(VALID_BODY)
      expect(res.status).toBe(404)
    })

    it('updates the skill', async () => {
      updateSkill.mockResolvedValue({ id: 1, ...VALID_BODY })
      const res = await request(app).put('/1').send(VALID_BODY)
      expect(res.status).toBe(200)
      expect(res.body.skill).toMatchObject(VALID_BODY)
      expect(updateSkill).toHaveBeenCalledWith(1, 1, VALID_BODY)
    })

    it('returns 409 on a duplicate name', async () => {
      updateSkill.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }))
      const res = await request(app).put('/1').send(VALID_BODY)
      expect(res.status).toBe(409)
    })
  })

  describe('DELETE /:id', () => {
    it('rejects a non-numeric id', async () => {
      const res = await request(app).delete('/nope')
      expect(res.status).toBe(400)
      expect(deleteSkill).not.toHaveBeenCalled()
    })

    it('returns 404 when nothing was deleted', async () => {
      deleteSkill.mockResolvedValue(false)
      const res = await request(app).delete('/1')
      expect(res.status).toBe(404)
    })

    it('deletes the skill', async () => {
      deleteSkill.mockResolvedValue(true)
      const res = await request(app).delete('/1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(deleteSkill).toHaveBeenCalledWith(1, 1)
    })
  })
})
