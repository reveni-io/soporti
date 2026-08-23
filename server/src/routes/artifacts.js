import { Router } from 'express'
import {
  ONLY_VERSION,
  VERSION_NOT_FOUND,
  createOrRefreshArtifactShare,
  deleteArtifact,
  deleteArtifactVersion,
  findArtifactVersion,
  getArtifact,
  getArtifactHtml,
  getArtifactVersions,
  listArtifacts,
} from '../db/artifacts.js'
import { UUID_RE } from '../constants.js'

const router = Router()

const POSITIVE_INT_RE = /^[1-9][0-9]{0,8}$/

function parseId(raw) {
  if (!UUID_RE.test(String(raw))) return { error: 'Invalid artifact ID.' }
  return { value: String(raw) }
}

function parseVersion(raw) {
  if (raw === undefined || raw === null) return { value: null }
  if (!POSITIVE_INT_RE.test(String(raw))) return { error: 'Invalid artifact version.' }
  return { value: Number(raw) }
}

router.get('/', async (req, res) => {
  try {
    const artifacts = await listArtifacts(req.user.id)
    res.json({ artifacts })
  } catch (err) {
    console.error('Failed to list the artifacts:', err)
    res.status(500).json({ error: 'Failed to list the artifacts.' })
  }
})

router.get('/:id', async (req, res) => {
  const { error, value: id } = parseId(req.params.id)
  if (error) return res.status(400).json({ error })

  try {
    const artifact = await getArtifact(id, req.user.id)
    if (!artifact) return res.status(404).json({ error: 'Artifact not found.' })

    const versions = await getArtifactVersions(id)

    res.json({ artifact: { ...artifact, versions: versions.map(v => v.version) } })
  } catch (err) {
    console.error('Failed to load the artifact:', err)
    res.status(500).json({ error: 'Failed to load the artifact.' })
  }
})

router.get('/:id/html', async (req, res) => {
  const { error: idError, value: id } = parseId(req.params.id)
  if (idError) return res.status(400).json({ error: idError })

  const { error: versionError, value: version } = parseVersion(req.query.version)
  if (versionError) return res.status(400).json({ error: versionError })

  try {
    const artifact = await getArtifact(id, req.user.id)
    if (!artifact) return res.status(404).json({ error: 'Artifact not found.' })

    const found = await getArtifactHtml(id, version)
    if (!found) return res.status(404).json({ error: 'Artifact version not found.' })

    res.json({ title: artifact.title, version: found.version, html: found.html })
  } catch (err) {
    console.error('Failed to load the artifact version:', err)
    res.status(500).json({ error: 'Failed to load the artifact version.' })
  }
})

router.post('/:id/share', async (req, res) => {
  const { error: idError, value: id } = parseId(req.params.id)
  if (idError) return res.status(400).json({ error: idError })

  const { error: versionError, value: requestedVersion } = parseVersion(req.body?.version)
  if (versionError) return res.status(400).json({ error: versionError })

  try {
    const artifact = await getArtifact(id, req.user.id)
    if (!artifact) return res.status(404).json({ error: 'Artifact not found.' })

    const version = await findArtifactVersion(id, requestedVersion)
    if (!version) return res.status(404).json({ error: 'Artifact version not found.' })

    const shareId = await createOrRefreshArtifactShare(id, version)

    res.json({ shareId, version, url: `/a/${shareId}` })
  } catch (err) {
    console.error('Failed to share the artifact:', err)
    res.status(500).json({ error: 'Failed to share the artifact.' })
  }
})

router.delete('/:id/versions/:version', async (req, res) => {
  const { error: idError, value: id } = parseId(req.params.id)
  if (idError) return res.status(400).json({ error: idError })

  const { error: versionError, value: version } = parseVersion(req.params.version)
  if (versionError) return res.status(400).json({ error: versionError })

  try {
    const artifact = await getArtifact(id, req.user.id)
    if (!artifact) return res.status(404).json({ error: 'Artifact not found.' })

    const result = await deleteArtifactVersion(id, version)
    if (result.reason === VERSION_NOT_FOUND) return res.status(404).json({ error: 'Artifact version not found.' })
    if (result.reason === ONLY_VERSION) {
      return res.status(422).json({ error: 'Cannot delete the only version. Delete the artifact instead.' })
    }

    res.json({ latestVersion: result.latestVersion })
  } catch (err) {
    console.error('Failed to delete the artifact version:', err)
    res.status(500).json({ error: 'Failed to delete the artifact version.' })
  }
})

router.delete('/:id', async (req, res) => {
  const { error, value: id } = parseId(req.params.id)
  if (error) return res.status(400).json({ error })

  try {
    const deleted = await deleteArtifact(id, req.user.id)
    if (!deleted) return res.status(404).json({ error: 'Artifact not found.' })

    res.status(204).end()
  } catch (err) {
    console.error('Failed to delete the artifact:', err)
    res.status(500).json({ error: 'Failed to delete the artifact.' })
  }
})

export default router
