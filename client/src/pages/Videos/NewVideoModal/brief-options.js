export const AUDIENCE_OPTIONS = [
  { value: 'merchants', label: 'Merchants' },
  { value: 'internal', label: 'Internal team' },
  { value: 'sales', label: 'Sales' },
  { value: 'developers', label: 'Developers' },
]

export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
]

export const FORMAT_OPTIONS = [
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
]

export const DURATION_OPTIONS = [20, 30, 60, 90].map(seconds => ({ value: seconds, label: `~${seconds} s` }))

export const PACE_OPTIONS = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
]

export const PACE_HINT = 'Relaxed: on-screen text stays long enough to read.'

export const DEFAULT_BRIEF = {
  idea: '',
  repos: [],
  path: '',
  audience: 'merchants',
  language: 'en',
  format: '16:9',
  durationSeconds: 30,
  pace: 'relaxed',
}
