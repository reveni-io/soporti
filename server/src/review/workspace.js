import { pool } from '../repo-pool/index.js'

export async function acquireWorkspace(repoFullName, prNumber, logger = console) {
  try {
    return await pool.acquireWorktree(repoFullName, prNumber)
  } catch (err) {
    logger.warn(
      `[review] No PR-head worktree for ${repoFullName}#${prNumber} (${err.message}); trying the default-branch clone`
    )
  }

  try {
    return await pool.acquire(repoFullName)
  } catch (err) {
    logger.warn(`[review] No repo clone for ${repoFullName} (${err.message}); continuing without a checkout`)
    return null
  }
}
