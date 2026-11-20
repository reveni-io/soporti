import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const testConnection = vi.fn()
vi.mock('../aws/client.js', () => ({ AWS_REQUEST_FAILED: 'AWS_REQUEST_FAILED', testConnection }))

const { AWS_SECRET_ACCESS_KEY_KEY, _resetAwsSettingsCacheForTests } = await import('../aws/settings.js')
const { default: adminAwsRouter } = await import('./admin-aws.js')

const app = express()
app.use(express.json())
app.use('/api/admin/config/aws', adminAwsRouter)

const ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE'
const SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

let stored

function awsFailure(message) {
  return Object.assign(new Error(message), { code: 'AWS_REQUEST_FAILED' })
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetAwsSettingsCacheForTests()
  stored = {}
  getConfigValue.mockImplementation(async key => stored[key] ?? null)
  setConfigValue.mockImplementation(async (key, value) => {
    stored[key] = value
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/admin/config/aws', () => {
  it('starts switched off, with no region and no access key', async () => {
    const res = await request(app).get('/api/admin/config/aws')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ enabled: false, region: '', accessKeyConfigured: false })
  })

  it('reports whether an access key is stored but never returns it', async () => {
    await request(app)
      .put('/api/admin/config/aws/access-key')
      .send({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY })

    const res = await request(app).get('/api/admin/config/aws')

    expect(res.body).toEqual({ enabled: false, region: '', accessKeyConfigured: true })
    expect(JSON.stringify(res.body)).not.toContain(ACCESS_KEY_ID)
    expect(JSON.stringify(res.body)).not.toContain(SECRET_ACCESS_KEY)
  })

  it('answers 500 when the settings cannot be read', async () => {
    getConfigValue.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/config/aws')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the AWS settings.' })
  })
})

describe('PUT /api/admin/config/aws/enabled', () => {
  it('turns the integration on and off', async () => {
    const on = await request(app).put('/api/admin/config/aws/enabled').send({ enabled: true })

    expect(on.status).toBe(200)
    expect(on.body).toEqual({ enabled: true })
    expect(stored.aws_enabled).toBe(true)
    expect((await request(app).get('/api/admin/config/aws')).body.enabled).toBe(true)

    await request(app).put('/api/admin/config/aws/enabled').send({ enabled: false })

    expect(stored.aws_enabled).toBe(false)
  })

  it('rejects a value that is not a boolean', async () => {
    const res = await request(app).put('/api/admin/config/aws/enabled').send({ enabled: 'yes' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: '"enabled" must be a boolean.' })
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('answers 500 when the switch cannot be saved', async () => {
    setConfigValue.mockRejectedValue(new Error('db down'))

    const res = await request(app).put('/api/admin/config/aws/enabled').send({ enabled: true })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the AWS switch.' })
  })
})

describe('PUT /api/admin/config/aws/region', () => {
  it('saves a region and clears it with an empty value', async () => {
    const saved = await request(app).put('/api/admin/config/aws/region').send({ region: ' EU-Central-1 ' })

    expect(saved.status).toBe(200)
    expect(saved.body).toEqual({ region: 'eu-central-1' })
    expect((await request(app).get('/api/admin/config/aws')).body.region).toBe('eu-central-1')

    const cleared = await request(app).put('/api/admin/config/aws/region').send({ region: '' })

    expect(cleared.body).toEqual({ region: '' })
    expect(stored.aws_region).toBe('')
  })

  it('rejects what is not a region', async () => {
    const res = await request(app).put('/api/admin/config/aws/region').send({ region: 'frankfurt' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'That does not look like an AWS region (e.g. "eu-central-1").' })
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('answers 500 when the region cannot be saved', async () => {
    setConfigValue.mockRejectedValue(new Error('db down'))

    const res = await request(app).put('/api/admin/config/aws/region').send({ region: 'eu-west-1' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the AWS region.' })
  })
})

describe('PUT /api/admin/config/aws/access-key', () => {
  it('stores the key with the secret encrypted, and removes it with empty values', async () => {
    const saved = await request(app)
      .put('/api/admin/config/aws/access-key')
      .send({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY })

    expect(saved.status).toBe(200)
    expect(saved.body).toEqual({ accessKeyConfigured: true })
    expect(stored[AWS_SECRET_ACCESS_KEY_KEY]).not.toContain(SECRET_ACCESS_KEY)

    const removed = await request(app)
      .put('/api/admin/config/aws/access-key')
      .send({ accessKeyId: '', secretAccessKey: '' })

    expect(removed.body).toEqual({ accessKeyConfigured: false })
    expect((await request(app).get('/api/admin/config/aws')).body.accessKeyConfigured).toBe(false)
  })

  it('rejects a temporary or malformed key', async () => {
    const res = await request(app)
      .put('/api/admin/config/aws/access-key')
      .send({ accessKeyId: 'ASIAIOSFODNN7EXAMPLE', secretAccessKey: SECRET_ACCESS_KEY })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/starts with "AKIA"/)
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('answers 500 without logging the key when it cannot be saved', async () => {
    setConfigValue.mockRejectedValue(new Error(`insert ${SECRET_ACCESS_KEY} failed`))

    const res = await request(app)
      .put('/api/admin/config/aws/access-key')
      .send({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the AWS access key.' })
    expect(console.error).toHaveBeenCalledWith('Failed to save the AWS access key:', 'Error')
    expect(JSON.stringify(console.error.mock.calls)).not.toContain(SECRET_ACCESS_KEY)
  })
})

describe('POST /api/admin/config/aws/test', () => {
  it('returns the identity and the result of each permission check', async () => {
    const report = {
      account: '123456789012',
      arn: 'arn:aws:sts::123456789012:assumed-role/soporti-task/abc',
      region: 'eu-central-1',
      checks: [{ id: 'alarms', label: 'CloudWatch alarms', action: 'cloudwatch:DescribeAlarms', ok: true }],
    }
    testConnection.mockResolvedValue(report)

    const res = await request(app).post('/api/admin/config/aws/test')

    expect(res.status).toBe(200)
    expect(res.body).toEqual(report)
    expect(testConnection).toHaveBeenCalledTimes(1)
  })

  it('answers 422 with the reason when AWS cannot be reached with these settings', async () => {
    testConnection.mockRejectedValue(awsFailure('No AWS region is set.'))

    const res = await request(app).post('/api/admin/config/aws/test')

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'No AWS region is set.' })
  })

  it('answers a generic 500 on an unexpected failure', async () => {
    testConnection.mockRejectedValue(new Error('socket hang up at 10.0.0.1'))

    const res = await request(app).post('/api/admin/config/aws/test')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to test the AWS connection.' })
  })
})
