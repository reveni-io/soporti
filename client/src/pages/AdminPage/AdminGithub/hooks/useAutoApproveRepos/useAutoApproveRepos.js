import { useState } from 'react'
import { AUTO_APPROVE_OFF, AUTO_APPROVE_ON, AUTO_APPROVE_SHADOW, REPO_NAME_RE } from '../../../../../constants.js'
import { checkGithubAutoApproveRepo, isUnauthorized } from '../../../../../services/services.js'

const SHADOW_MODES = [AUTO_APPROVE_SHADOW, AUTO_APPROVE_ON]

function describeShadowFirst(blocked, othersCanGoOn) {
  const one = blocked.length === 1
  const others = othersCanGoOn ? ' The other selected repos can go on.' : ''

  return `Shadow first: ${blocked.join(', ')} ${one ? 'has' : 'have'} not been saved in shadow yet. Set ${one ? 'it' : 'them'} to shadow and save, then set ${one ? 'it' : 'them'} to on.${others}`
}

export function useAutoApproveRepos(state, { token, onLogout, keyConfigured }) {
  const [selected, setSelected] = useState([])
  const [message, setMessage] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [addError, setAddError] = useState(null)
  const [adding, setAdding] = useState(false)
  const repos = state.draft.repos
  const savedModes = new Map(state.document.data.repos.map(repo => [repo.name, repo.mode]))
  const selectedRepos = selected.filter(name => repos.some(repo => repo.name === name))

  function updateRepos(update) {
    state.updateDraft(draft => ({ ...draft, repos: update(draft.repos) }))
  }

  function updateRepo(name, changes) {
    updateRepos(current => current.map(repo => (repo.name === name ? { ...repo, ...changes } : repo)))
  }

  function canGoOn(name) {
    return SHADOW_MODES.includes(savedModes.get(name))
  }

  function setModes(names, mode) {
    updateRepos(current => current.map(repo => (names.includes(repo.name) ? { ...repo, mode } : repo)))
  }

  function requestMode(names, mode) {
    setMessage(null)
    if (mode !== AUTO_APPROVE_ON) {
      setModes(names, mode)
      return
    }

    const blocked = names.filter(name => !canGoOn(name))
    const toOn = names.filter(name => canGoOn(name) && repos.find(repo => repo.name === name)?.mode !== AUTO_APPROVE_ON)
    if (blocked.length > 0) setMessage(describeShadowFirst(blocked, toOn.length > 0))
    if (toOn.length > 0) setConfirming(toOn)
  }

  function confirmOn() {
    setModes(confirming, AUTO_APPROVE_ON)
    setConfirming(null)
  }

  function toggleSelected(name, isSelected) {
    setSelected(current => (isSelected ? [...current, name] : current.filter(other => other !== name)))
  }

  function toggleAll(isSelected) {
    setSelected(isSelected ? repos.map(repo => repo.name) : [])
  }

  function removeRepo(name) {
    updateRepos(current => current.filter(repo => repo.name !== name))
    setSelected(current => current.filter(other => other !== name))
  }

  async function addRepo(value) {
    const name = value.trim()
    setAddError(null)
    if (!REPO_NAME_RE.test(name)) {
      setAddError('Use the org/repo format, e.g. acme/docs.')
      return false
    }
    if (repos.some(repo => repo.name.toLowerCase() === name.toLowerCase())) {
      setAddError(`${name} is already in the list.`)
      return false
    }

    setAdding(true)
    try {
      const { fullName } = await checkGithubAutoApproveRepo(token, name)
      updateRepos(current => [...current, { name: fullName, mode: AUTO_APPROVE_OFF, jev: keyConfigured, denylist: [] }])
      return true
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return false
      }
      setAddError(err.message)
      return false
    } finally {
      setAdding(false)
    }
  }

  function cancelOn() {
    setConfirming(null)
  }

  return {
    repos,
    selected: selectedRepos,
    message,
    confirming,
    addError,
    adding,
    canGoOn,
    requestMode,
    confirmOn,
    cancelOn,
    updateRepo,
    toggleSelected,
    toggleAll,
    removeRepo,
    addRepo,
  }
}
