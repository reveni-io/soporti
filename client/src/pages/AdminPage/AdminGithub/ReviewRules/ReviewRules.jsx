import { useState } from 'react'
import { GITHUB_RULES, RULE_ROLES } from '../github-rules.js'
import './ReviewRules.css'

const RULES_BY_ID = new Map(GITHUB_RULES.map(rule => [rule.id, rule]))
const DENYLIST_RULE = 'denylist'

function limitLabel(rule, limit) {
  return rule.unit ? `${limit} ${rule.unit}` : String(limit)
}

function newRule(definition) {
  return definition.limits
    ? { id: definition.id, role: 'veto', limit: definition.limits[0] }
    : { id: definition.id, role: 'veto' }
}

export default function ReviewRules({ state }) {
  const rules = state.draft.set.rules
  const missing = GITHUB_RULES.filter(rule => !rules.some(current => current.id === rule.id))
  const [toAdd, setToAdd] = useState('')
  const ruleToAdd = missing.find(rule => rule.id === toAdd) ?? missing[0]

  function updateRules(update) {
    state.updateDraft(draft => ({ ...draft, set: { ...draft.set, rules: update(draft.set.rules) } }))
  }

  function updateRule(id, changes) {
    updateRules(current => current.map(rule => (rule.id === id ? { ...rule, ...changes } : rule)))
  }

  function handleLimitChange(definition, value) {
    const limit = definition.limits.find(option => String(option) === value)
    updateRule(definition.id, { limit })
  }

  function handleDenylistChange(name, text) {
    state.updateDraft(draft => ({
      ...draft,
      repos: draft.repos.map(repo => (repo.name === name ? { ...repo, denylist: text.split('\n') } : repo)),
    }))
  }

  return (
    <>
      <p className="admin__muted">
        Each rule becomes a question that Jev answers from the review of the PR, in the same call as the questions
        above. A <code>veto</code> rule blocks the approval when its answer fails; an <code>info</code> rule is only
        shown. Remove a rule to stop asking it.
      </p>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Role</th>
              <th>Limit</th>
              <th>What it checks</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => {
              const definition = RULES_BY_ID.get(rule.id)
              return (
                <tr key={rule.id}>
                  <td>{definition.label}</td>
                  <td>
                    <select
                      className="input"
                      aria-label={`Role of ${definition.label}`}
                      value={rule.role}
                      onChange={event => updateRule(rule.id, { role: event.target.value })}
                    >
                      {RULE_ROLES.map(role => (
                        <option key={role.value} value={role.value}>
                          {role.value}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {definition.limits ? (
                      <select
                        className="input"
                        aria-label={`Limit of ${definition.label}`}
                        value={String(rule.limit)}
                        onChange={event => handleLimitChange(definition, event.target.value)}
                      >
                        {definition.limits.map(limit => (
                          <option key={limit} value={String(limit)}>
                            {limitLabel(definition, limit)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="admin__muted">none</span>
                    )}
                  </td>
                  <td>
                    {definition.checks}{' '}
                    <span className="admin__muted">{RULE_ROLES.find(role => role.value === rule.role).help}.</span>
                  </td>
                  <td>
                    <button
                      className="btn btn--secondary btn--sm"
                      type="button"
                      aria-label={`Remove ${definition.label}`}
                      onClick={() => updateRules(current => current.filter(other => other.id !== rule.id))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && (
        <div className="admin__form admin__form--row">
          <select
            className="input"
            aria-label="Rule to add"
            value={ruleToAdd.id}
            onChange={event => setToAdd(event.target.value)}
          >
            {missing.map(rule => (
              <option key={rule.id} value={rule.id}>
                {rule.label}
              </option>
            ))}
          </select>
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => updateRules(current => [...current, newRule(ruleToAdd)])}
          >
            Add rule
          </button>
        </div>
      )}

      <h3 className="admin__subsection-title">Denylist per repo</h3>
      <p className="admin__muted">
        PRs that touch these paths are not approved. One pattern per line, e.g. <code>src/payments/**</code>. Each repo
        has its own list; a repo without patterns has no denylist.
      </p>
      {!rules.some(rule => rule.id === DENYLIST_RULE) && (
        <p className="alert alert--warning">The Denylist rule is removed: these lists are not checked.</p>
      )}
      {state.draft.repos.map(repo => (
        <label key={repo.name} className="review-rules__label">
          <code>{repo.name}</code>
          <textarea
            className="textarea textarea--code"
            rows={2}
            placeholder="e.g. src/payments/**"
            value={repo.denylist.join('\n')}
            onChange={event => handleDenylistChange(repo.name, event.target.value)}
          />
        </label>
      ))}
    </>
  )
}
