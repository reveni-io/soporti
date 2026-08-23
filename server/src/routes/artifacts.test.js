import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../db/artifacts.js', () => ({
  getArtifact: vi.fn(),
  getArtifactVersions: vi.fn(),
  getArtifactHtml: vi.fn(),
  findArtifactVersion: vi.fn(),
  listArtifacts: vi.fn(),
  deleteArtifact: vi.fn(),
  deleteArtifactVersion: vi.fn(),
  createOrRefreshArtifactShare: vi.fn(),
  VERSION_NOT_FOUND: 'version_not_found',
  ONLY_VERSION: 'only_version',
}))

const {
  getArtifact,
  getArtifactVersions,
  getArtifactHtml,
  findArtifactVersion,
  listArtifacts,
  deleteArtifact,
  deleteArtifactVersion,
  createOrRefreshArtifactShare,
} = await import('../db/artifacts.js')
const { default: artifactsRouter } = await import('./artifacts.js')

const ARTIFACT_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const ARTIFACT = { id: ARTIFACT_ID, identifier: 'refund-dashboard', title: 'Refund dashboard', latestVersion: 2 }

describe('artifacts routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: 1 }
      next()
    })
    app.use('/', artifactsRouter)
  })

  describe('GET /', () => {
    it('lists the artifacts owned by the requesting user', async () => {
      listArtifacts.mockResolvedValue([{ id: ARTIFACT_ID, title: 'Refund dashboard', latestVersion: 2 }])

      const res = await request(app).get('/')

      expect(res.status).toBe(200)
      expect(res.body.artifacts).toHaveLength(1)
      expect(listArtifacts).toHaveBeenCalledWith(1)
    })

    it('returns an empty list rather than a 404 when there are none', async () => {
      listArtifacts.mockResolvedValue([])

      const res = await request(app).get('/')

      expect(res.status).toBe(200)
      expect(res.body.artifacts).toEqual([])
    })

    it('returns 500 when the DB fails', async () => {
      listArtifacts.mockRejectedValue(new Error('boom'))

      const res = await request(app).get('/')

      expect(res.status).toBe(500)
      expect(res.body.error).not.toContain('boom')
    })
  })

  describe('POST /:id/share', () => {
    it('shares the latest version by default and returns its public url', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      findArtifactVersion.mockResolvedValue(2)
      createOrRefreshArtifactShare.mockResolvedValue('a'.repeat(32))

      const res = await request(app).post(`/${ARTIFACT_ID}/share`).send({})

      expect(res.status).toBe(200)
      expect(res.body.version).toBe(2)
      expect(res.body.url).toBe(`/a/${'a'.repeat(32)}`)
      expect(findArtifactVersion).toHaveBeenCalledWith(ARTIFACT_ID, null)
      expect(createOrRefreshArtifactShare).toHaveBeenCalledWith(ARTIFACT_ID, 2)
    })

    it('freezes the requested version instead of the latest', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      findArtifactVersion.mockResolvedValue(1)
      createOrRefreshArtifactShare.mockResolvedValue('b'.repeat(32))

      const res = await request(app).post(`/${ARTIFACT_ID}/share`).send({ version: 1 })

      expect(res.status).toBe(200)
      expect(createOrRefreshArtifactShare).toHaveBeenCalledWith(ARTIFACT_ID, 1)
    })

    it('rejects an invalid version', async () => {
      const res = await request(app).post(`/${ARTIFACT_ID}/share`).send({ version: 'latest' })

      expect(res.status).toBe(400)
      expect(createOrRefreshArtifactShare).not.toHaveBeenCalled()
    })

    it('rejects a non-canonical version', async () => {
      const res = await request(app).post(`/${ARTIFACT_ID}/share`).send({ version: '2e0' })

      expect(res.status).toBe(400)
      expect(createOrRefreshArtifactShare).not.toHaveBeenCalled()
    })

    it('refuses to share an artifact owned by someone else', async () => {
      getArtifact.mockResolvedValue(null)

      const res = await request(app).post(`/${ARTIFACT_ID}/share`).send({})

      expect(res.status).toBe(404)
      expect(createOrRefreshArtifactShare).not.toHaveBeenCalled()
    })

    it('does not read the artifact html just to validate the version to share', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      findArtifactVersion.mockResolvedValue(2)
      createOrRefreshArtifactShare.mockResolvedValue('c'.repeat(32))

      await request(app).post(`/${ARTIFACT_ID}/share`).send({})

      expect(getArtifactHtml).not.toHaveBeenCalled()
    })

    it('returns 404 when the version to freeze does not exist', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      findArtifactVersion.mockResolvedValue(null)

      const res = await request(app).post(`/${ARTIFACT_ID}/share`).send({ version: 99 })

      expect(res.status).toBe(404)
      expect(createOrRefreshArtifactShare).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      findArtifactVersion.mockResolvedValue(2)
      createOrRefreshArtifactShare.mockRejectedValue(new Error('boom'))

      const res = await request(app).post(`/${ARTIFACT_ID}/share`).send({})

      expect(res.status).toBe(500)
      expect(res.body.error).not.toContain('boom')
    })
  })

  describe('DELETE /:id/versions/:version', () => {
    it('deletes the version and returns the latest one left', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      deleteArtifactVersion.mockResolvedValue({ deleted: true, latestVersion: 3 })

      const res = await request(app).delete(`/${ARTIFACT_ID}/versions/2`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ latestVersion: 3 })
      expect(deleteArtifactVersion).toHaveBeenCalledWith(ARTIFACT_ID, 2)
    })

    it('returns 404 for an artifact owned by someone else, touching no version', async () => {
      getArtifact.mockResolvedValue(null)

      const res = await request(app).delete(`/${ARTIFACT_ID}/versions/2`)

      expect(res.status).toBe(404)
      expect(deleteArtifactVersion).not.toHaveBeenCalled()
    })

    it('returns 404 when the version was never stored', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      deleteArtifactVersion.mockResolvedValue({ deleted: false, reason: 'version_not_found' })

      const res = await request(app).delete(`/${ARTIFACT_ID}/versions/99`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Artifact version not found.')
    })

    it('refuses to delete the only version and points at the artifact delete instead', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      deleteArtifactVersion.mockResolvedValue({ deleted: false, reason: 'only_version' })

      const res = await request(app).delete(`/${ARTIFACT_ID}/versions/1`)

      expect(res.status).toBe(422)
      expect(res.body.error).toContain('Delete the artifact instead')
    })

    it('rejects a non-canonical version', async () => {
      const res = await request(app).delete(`/${ARTIFACT_ID}/versions/2e0`)

      expect(res.status).toBe(400)
      expect(deleteArtifactVersion).not.toHaveBeenCalled()
    })

    it('rejects an invalid artifact id', async () => {
      const res = await request(app).delete('/not-a-uuid/versions/2')

      expect(res.status).toBe(400)
      expect(getArtifact).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      deleteArtifactVersion.mockRejectedValue(new Error('boom'))

      const res = await request(app).delete(`/${ARTIFACT_ID}/versions/2`)

      expect(res.status).toBe(500)
      expect(res.body.error).not.toContain('boom')
    })
  })

  describe('DELETE /:id', () => {
    it('deletes the artifact and returns no content', async () => {
      deleteArtifact.mockResolvedValue(true)

      const res = await request(app).delete(`/${ARTIFACT_ID}`)

      expect(res.status).toBe(204)
      expect(deleteArtifact).toHaveBeenCalledWith(ARTIFACT_ID, 1)
    })

    it('returns 404 for an artifact owned by someone else', async () => {
      deleteArtifact.mockResolvedValue(false)

      const res = await request(app).delete(`/${ARTIFACT_ID}`)

      expect(res.status).toBe(404)
    })

    it('rejects a non-numeric id', async () => {
      const res = await request(app).delete('/nope')

      expect(res.status).toBe(400)
      expect(deleteArtifact).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      deleteArtifact.mockRejectedValue(new Error('boom'))

      const res = await request(app).delete(`/${ARTIFACT_ID}`)

      expect(res.status).toBe(500)
      expect(res.body.error).not.toContain('boom')
    })
  })

  describe('GET /:id', () => {
    it('returns the artifact with the versions the user can switch between', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      getArtifactVersions.mockResolvedValue([{ version: 1 }, { version: 2 }])

      const res = await request(app).get(`/${ARTIFACT_ID}`)

      expect(res.status).toBe(200)
      expect(res.body.artifact.title).toBe('Refund dashboard')
      expect(res.body.artifact.versions).toEqual([1, 2])
      expect(getArtifact).toHaveBeenCalledWith(ARTIFACT_ID, 1)
    })

    it('rejects a non-numeric id', async () => {
      const res = await request(app).get('/nope')

      expect(res.status).toBe(400)
      expect(getArtifact).not.toHaveBeenCalled()
    })

    it('rejects anything that is not a uuid, so ids stay unguessable and unenumerable', async () => {
      for (const id of ['7', '0x7', '1e3', 'not-a-uuid', '00000000-0000-0000-0000-000000000000']) {
        const res = await request(app).get(`/${id}`)

        expect(res.status).toBe(400)
      }
      expect(getArtifact).not.toHaveBeenCalled()
    })

    it('returns 404 for an artifact owned by someone else', async () => {
      getArtifact.mockResolvedValue(null)

      const res = await request(app).get(`/${ARTIFACT_ID}`)

      expect(res.status).toBe(404)
      expect(getArtifactVersions).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      getArtifact.mockRejectedValue(new Error('boom'))

      const res = await request(app).get(`/${ARTIFACT_ID}`)

      expect(res.status).toBe(500)
      expect(res.body.error).not.toContain('boom')
    })
  })

  describe('GET /:id/html', () => {
    it('returns the latest version when none is requested', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      getArtifactHtml.mockResolvedValue({ version: 2, html: '<h1>v2</h1>' })

      const res = await request(app).get(`/${ARTIFACT_ID}/html`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ title: 'Refund dashboard', version: 2, html: '<h1>v2</h1>' })
      expect(getArtifactHtml).toHaveBeenCalledWith(ARTIFACT_ID, null)
    })

    it('returns the requested version', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      getArtifactHtml.mockResolvedValue({ version: 1, html: '<h1>v1</h1>' })

      const res = await request(app).get(`/${ARTIFACT_ID}/html?version=1`)

      expect(res.status).toBe(200)
      expect(res.body.version).toBe(1)
      expect(getArtifactHtml).toHaveBeenCalledWith(ARTIFACT_ID, 1)
    })

    it('rejects a non-numeric version', async () => {
      const res = await request(app).get(`/${ARTIFACT_ID}/html?version=latest`)

      expect(res.status).toBe(400)
      expect(getArtifactHtml).not.toHaveBeenCalled()
    })

    it('checks ownership before reading any html', async () => {
      getArtifact.mockResolvedValue(null)

      const res = await request(app).get(`/${ARTIFACT_ID}/html`)

      expect(res.status).toBe(404)
      expect(getArtifactHtml).not.toHaveBeenCalled()
    })

    it('returns 404 when the version was never stored', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      getArtifactHtml.mockResolvedValue(null)

      const res = await request(app).get(`/${ARTIFACT_ID}/html?version=99`)

      expect(res.status).toBe(404)
    })

    it('returns 500 when the DB fails', async () => {
      getArtifact.mockResolvedValue(ARTIFACT)
      getArtifactHtml.mockRejectedValue(new Error('boom'))

      const res = await request(app).get(`/${ARTIFACT_ID}/html`)

      expect(res.status).toBe(500)
      expect(res.body.error).not.toContain('boom')
    })
  })
})
