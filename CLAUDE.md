# AI Agent Guidelines

This document is the contract for AI agents working on the Soporti codebase: a light monorepo with `client/` (React 19 + Vite) and `server/` (Express + the OpenAI Agents SDK, running against OpenAI or Anthropic). Both packages are ESM (`"type": "module"`).

Everything here is mandatory. If a rule conflicts with existing code, follow the rule and flag the inconsistency instead of copying the old code.

## Commands

```bash
npm run dev                                    # server (3001) + client (5173, proxies /api)
npm test                                       # full suite (server + client)
npm test --prefix server                       # one side only
npm test --prefix server -- src/routes/skills.test.js   # a single file
npm run lint                                   # eslint (both) + prettier --check
npm run format                                 # prettier --write
npm run test:coverage                          # 90% line threshold, enforced in CI
npm run db:generate --prefix server            # regenerate migrations after editing db/schema.js
npm run docker:up                              # PostgreSQL + server + client via Docker Compose
```

`.env` lives at the repo root and holds only `DATABASE_URL`, `JWT_SECRET`, `VITE_GOOGLE_CLIENT_ID` and tunables — every credential is configured from `/admin` and stored in the database. Deployment shapes are documented in `docs/deployment.md`.

## General Rules

**NO COMMENTS**: NEVER add comments to the code. Code must be self-documenting through clear naming and small functions. The only exception is a functional directive the tooling needs (e.g. `/* eslint-disable */`). When reviewing a PR, flag any added comment as a violation.

**ENGLISH ONLY**: every identifier, string literal, log message and test description is written in English.

**FUNCTION DECLARATIONS, NOT ARROW CONSTANTS**: module-level functions, components and hooks are declared with `function` — the codebase does this exclusively, there is not a single `export const foo = () => {}`. Arrow functions are for callbacks and inline expressions only.

```js
// ✅ GOOD
export function getSentryOrg() {
  return getCachedValue(SENTRY_ORG_KEY)
}

export default function AdminSentry({ token, onLogout }) { ... }

// ❌ BAD
export const getSentryOrg = () => getCachedValue(SENTRY_ORG_KEY)
```

**IMPORTS CARRY THE EXTENSION**: always import with the full file extension — `'../db/skills.js'`, `'./Sidebar.jsx'`, `'../../services/services.js'`. Node ESM requires it and the client follows the same style.

**NAMING**: `camelCase` for variables and functions. `PascalCase` for React components and their folders/files. `SCREAMING_SNAKE_CASE` for constants and regexes. Server files and folders are `kebab-case` (`auto-diagnose-poller.js`, `conversation-render.js`). Hook folders/files are `camelCase` matching the hook name (`hooks/useSkills/useSkills.js`). Handlers are named `handleX`, boolean values read as predicates (`isYoloSelected`, `configured`).

**NO MAGIC VALUES**: values shared across files go in `constants.js` (`client/src/constants.js`, `server/src/constants.js`, `client/src/router/constants.js` for routes). File-private constants and regexes live at the top of the module in `SCREAMING_SNAKE_CASE`.

```js
// ✅ GOOD
const NAME_RE = /^[a-z0-9-]{1,50}$/
const CACHE_TTL_MS = 60_000

// ❌ BAD
if (!/^[a-z0-9-]{1,50}$/.test(name)) return res.status(400).json({ error: 'Invalid name.' })
```

**GUARD CLAUSES FIRST**: validate and bail out at the top, then write the happy path unindented. NEVER wrap the main logic in an `else`.

```js
// ✅ GOOD
router.get('/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid skill ID.' })

  const skill = await getSkillById(Number(req.params.id), req.user.id)
  if (!skill) return res.status(404).json({ error: 'Skill not found.' })

  res.json({ skill })
})
```

**BLANK LINES BETWEEN LOGICAL BLOCKS**: group related statements and separate different groups with a blank line — declarations, guards, main logic, return.

```js
// ✅ GOOD
function resolveLabel(items, isEnabled) {
  const count = items.length

  if (!isEnabled) return DEFAULT_LABEL
  if (count === 0) return EMPTY_LABEL

  return `${count} items`
}

// ❌ BAD
function resolveLabel(items, isEnabled) {
  const count = items.length
  if (!isEnabled) return DEFAULT_LABEL
  if (count === 0) return EMPTY_LABEL
  return `${count} items`
}
```

**ARROW FUNCTION BODIES**: implicit return only when the whole body fits on the same line. If it wraps, use `{}` with an explicit `return`.

```js
// ✅ GOOD
const isSelected = source => selectedSources.includes(source)

const filteredRepos = repos.filter(repo => {
  if (!search) return true
  return repo.fullName.toLowerCase().includes(query)
})

// ❌ BAD — implicit return wrapping to the next line
const buildTooLongMessage = (field, limit) =>
  `${field} is too long (max ${limit} characters). Shorten it and save again before continuing.`
```

**NO DEAD CODE**: no commented-out code, no unused exports, no leftover `console.log` on the client (`no-console` warns there). On the server, `console.error`/`console.log` are the intended logging mechanism — use them in `catch` blocks, never to trace happy paths.

**NEVER LEAK SECRETS**: never log a token, connection string or credential, and never return a stored secret from an endpoint (see the write-only rule below). Anything posted outside the app (GitHub reviews, comments, Slack) goes through `review/output-guard.js`.

**NO NEW DEPENDENCIES** without asking first. Prefer the primitives already in the repo.

**DON'T HAND-FORMAT**: Prettier owns formatting (`.prettierrc.json`: no semicolons, single quotes, 120 columns, `arrowParens: avoid`, `trailingComma: es5`, 2 spaces). Write code close to that shape and let `npm run format` settle the rest.

**DO WHAT WAS ASKED**: no speculative abstractions, no error handling for impossible cases, no extra config knobs. If a change needs a new env var, update `.env.example` in the same change.

**A NEW FEATURE UPDATES THE DOCS**: when a change adds or meaningfully changes user-facing functionality, update `README.md` (the `## Features` section, and `## Scripts` or the setup steps if they changed) and the landing page (`client/src/pages/Landing/`) in the same change, whenever the feature belongs there. A new landing section is a folder under `Landing/` like any other component, with its `.jsx`, `.test.jsx` and `.css`. Bug fixes, refactors, tests and internal plumbing NEVER touch either — only user-visible capabilities do. If it is unclear whether a feature is worth surfacing on the landing, ask instead of guessing.

## Client Rules

### Structure

Folder-per-unit. Every component owns a folder with its `.jsx`, its `.test.jsx` and its `.css`:

```
pages/Chat/
  Chat.jsx  Chat.test.jsx  Chat.css        # the page
  Sidebar/                                 # page-private component
    Sidebar.jsx  Sidebar.test.jsx  Sidebar.css
  hooks/useChat/useChat.js                 # page-private hook
  example-questions.js                     # page-private constants
common/Message/                            # shared across pages
hooks/useSkills/                           # shared across pages
```

A component used by a single page lives inside that page's folder. Promote it to `common/` only when a second page imports it. Entry points (`main.jsx`, `landing.jsx`), `router/`, `services/`, `context/`, `constants.js`, `index.css` and `styles/ui.css` stay at the `src/` root.

### API layer

**`services/services.js` IS THE ONLY PLACE THAT CALLS `fetch`** and the only place that knows an endpoint path. Adding an endpoint means adding one exported function there. NEVER build a URL, a header or a request body inside a component, page or hook.

```js
// ✅ GOOD
import { getSentryConfig, isUnauthorized } from '../../../services/services.js'

const data = await getSentryConfig(token)

// ❌ BAD — a component that knows a URL
const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/sentry`, {
  headers: { Authorization: `Bearer ${token}` },
})
```

New service functions delegate to the private `request()` helper and pass a human `errorMessage` fallback. The only escape hatches are `streamChat` (returns the raw `Response` because SSE needs `body.getReader()`) and `absoluteApiUrl` (builds a displayable absolute URL).

**HANDLE 401 BEFORE ANY OTHER ERROR**: every call that can 401 checks `isUnauthorized(err)` and logs the user out instead of rendering an error.

```js
// ✅ GOOD
try {
  const data = await getSentryConfig(token)
  setOrg(data.org)
} catch (err) {
  if (isUnauthorized(err)) {
    onLogout?.()
    return
  }
  setError(err.message)
}
```

### Components

- Default export, props destructured in the signature: `export default function Sidebar({ token, onLogout }) {`.
- **NO PROPTYPES**. NEVER add them.
- **ONE EXPORTED COMPONENT PER FILE**. A small presentational sub-component used only by that file may live below it in the same file (see `AdminSentry.jsx` → `OrgField`, `TokenField`). The moment a second file needs it, it gets its own folder.
- **EARLY RETURNS FOR LOADING, ERROR AND EMPTY STATES**, before the main `return`. NEVER nest them as ternaries inside the JSX.

```jsx
// ✅ GOOD
if (loading) return <p className="admin__muted">Loading...</p>
if (error) return <p className="alert alert--error">{error}</p>
if (skills.length === 0) return <p className="skills__empty">No skills yet.</p>

return (
  <ul className="skills__list">
    {skills.map(skill => (
      <SkillRow key={skill.id} skill={skill} onEdit={onEdit} />
    ))}
  </ul>
)

// ❌ BAD
return <ul>{loading ? <Spinner /> : skills.length > 0 ? skills.map(renderSkill) : <Empty />}</ul>
```

- **NO BUSINESS LOGIC IN COMPONENTS**: non-trivial state, fetching or derivation moves into a custom hook.
- **NAMED HANDLERS FOR ANYTHING WITH LOGIC**: declare `function handleSubmit(event)` in the component body and pass the reference. Inline arrows are acceptable only for a trivial delegation (`onClick={() => onSelectProfile('tech')}`) or to pass the current item inside a `.map()`.
- **NO CONDITIONAL PROP SPREADING**: never build props with `{...(cond && { prop })}`; pass each prop explicitly. Spreading a prop bag returned by a hook (`{...overlayProps}` from `useOverlayDismiss`) is the one accepted use of spread.
- **NO PREMATURE MEMOIZATION**: a function re-created every render is the correct default. Reach for `useCallback`/`useMemo` only when there is a concrete consumer: the value is in another hook's dependency array, it is passed to a `React.memo` child, or the computation is genuinely expensive. A cheap `map`/`filter` over a small array is not.

### Hooks

- Shared hooks in `hooks/<name>/<name>.js`, page-private hooks in `pages/<Page>/hooks/<name>/<name>.js`. Named export, `use` prefix, returns an object (`{ skills, loading, error, reload }`).
- **REUSE BEFORE CREATING**: before writing a hook that fetches something, grep for an existing consumer of that service function. A resource has a **single owner** hook — `useSkills` is created once in `Chat` and passed down to `ChatPanel` and `SettingsModal`; consumers call `reload()` after mutating. NEVER add a second fetch of the same endpoint, and never re-sort server-ordered data on the client.
- For a plain authed GET, use `useAuthedResource` with a **service function** (never a path).
- **GUARD STATE UPDATES AFTER `await`** in effects with a cancellation flag:

```js
useEffect(() => {
  let active = true
  async function load() {
    const data = await getSentryConfig(token)
    if (!active) return
    setOrg(data.org)
  }
  load()
  return () => {
    active = false
  }
}, [token])
```

### Styling

Two layers, both loaded globally from `main.jsx`: `index.css` holds design tokens, `styles/ui.css` holds shared primitives (`.btn` + `--primary/--secondary/--danger/--sm/--block`, `.input`/`.textarea`, `.card`, `.modal-overlay`/`.modal`, `.alert`, `.note`, `.badge`, `.chip`).

- **COMPOSE THE PRIMITIVES**: reach for an existing class before writing CSS — `className="btn btn--primary admin__save"`. Component CSS holds only layout and structure.
- **ALWAYS USE TOKENS**: NEVER hardcode a hex, an rgba, a spacing value or a font size. Use `var(--sp3)`, `var(--fs-sm)`, `var(--radius-md)`, `var(--text-muted)`, and derive alphas with `rgba(var(--green-deep-rgb), 0.15)`. If no token fits, add one to `index.css`.
- **BEM-ISH NAMING**, block named after the component: `.sidebar`, `.sidebar__source`, `.sidebar__source--selected`.

```css
/* ✅ GOOD */
.sidebar__source--selected {
  background: var(--sidebar-selected);
  padding: var(--sp3);
  font-size: var(--fs-sm);
  border-radius: var(--radius-md);
}

/* ❌ BAD */
.sidebar__source--selected {
  background: #0d3a0b;
  padding: 12px;
  font-size: 13px;
}
```

### Routing

Routes live in `router/Router.jsx` and their paths in `router/constants.js` (`ROUTES`). Import `ROUTES` in links and redirects — NEVER hardcode a path string.

## Server Rules

### Structure

One folder per domain under `server/src/`: `routes/` (Express routers), `agent/` (Agents SDK wiring, tools, prompts), `llm/` (the provider layer — see below), `db/` (the app's own PostgreSQL via Drizzle), `sessions/`, `middleware/`, `review/`, and one folder per integration (`github/`, `notion/`, `sentry/`, `slack/`, `shopify/`, `postgres/`, …), each with a `client.js` (API calls) and a `settings.js` (stored credentials).

### LLM providers

`llm/` is flat, like every other server folder. `model.js` is the only module the rest of the server imports: `resolveModelForAgent({ intent })`, `isConfigured()`, `wrapSession()`, `usesContinuationToken()`, `describeProvider()`. It never hands a provider module out — callers get plain values, never the module itself. `registry.js` maps a provider id to its module and `settings.js` owns the stored selection and every provider credential.

Adding a provider is one new file plus one registry entry. A provider module exports `id`, `label`, `continuationToken` (whether the vendor stores conversation state server-side), an async `isConfigured()`, an async `buildModel()` returning `{ modelId, model }`, `modelSettings(modelId, { intent })` returning an object (never `null` — call sites spread it unconditionally), and `wrapSession(underlyingSession)`.

**NEVER REACH FOR A VENDOR SDK OUTSIDE ITS PROVIDER MODULE.** `OpenAIResponsesCompactionSession`, `setDefaultOpenAIClient` and `aisdk()` belong in `llm/openai.js` and `llm/anthropic.js`. The one exception is `knowledge/`, which is pinned to OpenAI Vector Stores independently of the selected chat provider.

### Routes

One `Router` per resource, default-exported. Validate first, return the app's error shape, never let an exception escape:

- Input validation lives in a small `parse*` helper that returns `{ error }` or `{ value }`; the handler turns `error` into `400`.
- Errors are always `res.status(<code>).json({ error: '<human sentence>.' })`. Status codes in use: `400` invalid input, `401` no/invalid token, `403` wrong role, `404` missing or not owned, `409` duplicate, `422` unprocessable, `500` unexpected.
- Every handler wraps its work in `try/catch`, logs with `console.error('Failed to …:', err)` and returns a generic `500` message. NEVER surface a raw error string to the client.
- **OWNERSHIP IS SCOPED IN THE QUERY**, not checked afterwards: pass `req.user.id` into the DB function and treat "not found" and "not owned" identically (`404`).

### Credentials and integrations

**CREDENTIALS LIVE IN THE DATABASE, NOT IN ENV VARS.** Only `DATABASE_URL`, `JWT_SECRET`, `VITE_GOOGLE_CLIENT_ID` and pure tunables are env vars. When adding or touching an integration, follow the established pattern (`sentry/`, `notion/` are the minimal examples):

1. `<domain>/settings.js` — read/write the value through `db/app-config.js` with a 60s cache, invalidate the cache on save, and expose an **async** `isConfigured()` plus `_reset<Domain>SettingsCacheForTests()`.
2. `<domain>/client.js` — resolve the credential per call (or rebuild the client when it changes) so rotation needs no restart. Fail with a clear "configure it in /admin" error when unset.
3. `routes/admin.js` — a `GET` returning only booleans (`{ tokenConfigured }`) plus non-secret values, and one `PUT` per value. **A STORED SECRET IS WRITE-ONLY: NEVER RETURN IT.** An empty value clears it.
4. `pages/AdminPage/Admin<Domain>/` on the client, registered in `AdminPage.jsx`'s `SECTIONS`.
5. Register the agent tools conditionally: `createAgent` resolves `<domain>Configured` and passes it into `buildAgentTools`; `routes/integrations.js` and the Slack bot `await` the same check.

### Agent

- New tools go in `agent/tools.js` following the existing structure, with a Zod schema and a description written for the model.
- Tool registration is **enforced at the tool layer, not only in the prompt**: `buildSourcePolicy` (`agent/sources.js`) decides which tools exist for the selected sources, and `buildBasePrompt` only injects a section for tools that were registered. When you add a source-gated capability, update both.
- Prompt text lives in `agent/system-prompt.js` (chat) or `review/prompt.js` (PR reviews) — never inline a multi-paragraph prompt at a call site.
- The system prompt is **not** part of the conversation history: `instructions` are a per-request field, so anything conversation-scoped (like an invoked skill) must be re-derived and re-injected on every turn.

### Database

`db/schema.js` is the source of truth for the app's own schema. After editing it run `npm run db:generate --prefix server` and commit the generated SQL in `server/drizzle/` — the server applies pending migrations on boot. Shared query predicates (`ownedWebConversation`) and shared shape conversions (`conversation-render.js`) live in `db/` and are used by every caller; do not duplicate them in a route.

This is distinct from `postgres/`, which is the agent's **read-only** query tool against a customer database.

## Testing Rules

- **Vitest, tests colocated next to the source**: `foo.js` → `foo.test.js`, `Sidebar.jsx` → `Sidebar.test.jsx`. Every new component, hook, route and module ships with its tests. CI enforces **90% line coverage** on both packages.
- **`describe('<unit>')` + `it('<lowercase behavior sentence>')`**. Tests never hit the network, a database or a real API key.
- **RENDER EXPLICITLY IN EACH TEST**. NEVER extract a `renderComponent` helper — the props under test must be visible in the test body.
- **CLIENT: MOCK `global.fetch`**, not the services module, so the services layer is exercised too:

```js
global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ org: 'my-org' }) })
```

- **SERVER: `vi.mock()` THE MODULE BOUNDARY, then `await import()`** the mocked module and the unit under test (hoisting requires this order). Routes are tested with `supertest` over a bare `express()` app that injects `req.user`.
- **PREFER `userEvent` OVER `fireEvent`** and always `await` interactions. Query by role first (`getByRole('button', { name: /save/i })`), then by text or display value.
- **TEST BEHAVIOR, NOT IMPLEMENTATION**: assert what the user sees and the observable outcome (status code, response body, rendered text, the arguments the request was made with). A test whose only assertion is "this function was called" proves nothing. When asserting on a mock, check both the call count and the arguments.
- **NO SNAPSHOT TESTS** for pages or composed components. Assert the specific conditional behavior instead.
- **MOCK ≠ FIXTURE**: a mock replaces behavior (`vi.fn()`), a fixture is static data. Inline test data by default; extract it only when a second test file needs the exact same payload, and place it in a `__fixtures__/` folder at the closest common ancestor with a `Fixture`-suffixed export. NEVER name a file of static data `mocks.js`.

## Before You Finish

Run these in order, from the repo root, and fix what they report:

```bash
npm run lint     # eslint + prettier --check
npm run format   # only if lint reported formatting issues, then re-run lint
npm test         # the full suite, not just the files you touched
```

## Pull Requests

The full process is in `CONTRIBUTING.md`. The rules an agent must not miss:

- **ONE PR, ONE THING**. Never mix a feature with a refactor or a bug fix with formatting.
- **BUMP THE ROOT VERSION**: every PR to `main` must bump `version` in the **root** `package.json` with `npm version <patch|minor|major> --no-git-tag-version`. `server` and `client` stay at `0.0.0`. This is a required CI check (`Version bump check`) and a PR cannot merge without it. Ask which increment applies if the change type is ambiguous. Never create tags by hand — merging to `main` tags and releases automatically.
- **USE THE PR TEMPLATE** at `.github/pull_request_template.md`, filling in what changed, why, how, and how to test it.
- **CONVENTIONAL COMMITS** for commits and the PR title (`feat(client): …`, `fix(server): …`) — the squashed title becomes the commit message on `main`. The title is a required CI check (`PR title check`): `<type>(<scope>): <description>`, lowercase scope, types `feat|fix|refactor|test|chore|docs|style|perf`.
- **ATTACH SCREENSHOTS** for any UI or visual change.
- Never push to `main` directly; rebase onto it instead of merging.
