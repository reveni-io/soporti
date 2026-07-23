# Contributing Guide

## Ground Rules

This project follows standard software engineering practices. Every contributor — regardless of experience level — is expected to follow these guidelines. **PRs that don't meet these standards will be sent back for revision.**

## The Golden Rule: One PR, One Thing

Each Pull Request must do **one thing only**. This is non-negotiable.

- **One feature** per PR
- **One bug fix** per PR
- **One refactor** per PR
- Never mix features with refactors. Never mix bug fixes with style changes.

If your PR touches more than one concern, split it into multiple PRs.

### Why?

- Smaller PRs are easier to review
- Smaller PRs have fewer bugs
- Smaller PRs get merged faster
- If something breaks, it's easy to revert one small change

## Branch Naming

Use the following format:

```
<type>/<short-description>
```

Types: `feature/`, `fix/`, `refactor/`, `chore/`, `docs/`

Examples:
- `feature/add-sentry-error-details`
- `fix/sse-connection-timeout`
- `refactor/extract-auth-middleware`

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

Examples:
- `feat(agent): add tool for querying Shortcut stories`
- `fix(chat): handle SSE disconnection gracefully`
- `refactor(server): extract session compaction logic`
- `test(routes): add missing tests for mermaid endpoint`

Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`

## Pull Request Titles

PR titles follow the same Conventional Commits format:

```
<type>(<scope>): <description>
```

This matters because when we squash-merge, the PR title becomes the commit message in `main`.

## Working with `main`

- **Never push directly to `main`.** All changes go through Pull Requests.
- All PRs target `main` as base branch.
- If your branch falls behind `main`, rebase (don't merge):

```bash
git fetch origin
git rebase origin/main
```

This keeps the history clean. If you have conflicts, resolve them during the rebase.

## Before Opening a PR

### 1. Make sure it builds

```bash
npm run install:all
npm run dev  # verify it starts without errors
```

### 2. Run ALL tests

```bash
npm test
```

Don't just run the tests for the files you changed. Run the full suite. Your change might break something else.

### 3. Run the linter

```bash
npm run lint
```

Fix all warnings and errors before pushing.

### 4. Run the formatter

```bash
npm run format
```

The project uses Prettier. All code must be formatted before pushing. Don't mix formatting changes with logic changes — if you need to format existing files, do it in a separate commit.

### 5. Review your own diff

Before opening the PR, review every line of your diff:

```bash
git diff main
```

Ask yourself:
- Is there any code I don't fully understand?
- Is there any dead code, commented-out code, or console.logs left behind?
- Did I add anything that wasn't asked for?
- Are there any hardcoded values that should be in config?
- Did I introduce any security issues (exposed tokens, unsanitized input)?

### 6. Keep the diff small

If your diff is over **300 lines of code** (excluding test files and lock files), it's probably too big. Split it up.

### 7. Bump the version

**Every PR to `main` must bump the product version** in the root `package.json`. This is a required CI check (`Version bump check`) — your PR cannot be merged without a semver-increasing version. Pick the bump that matches your change:

```bash
npm version patch --no-git-tag-version   # bug fix / small change
npm version minor --no-git-tag-version    # new feature, backward-compatible
npm version major --no-git-tag-version    # breaking change
```

Run it at the repo root (not in `server/` or `client/` — those stay unversioned) and commit the change. On merge, CI tags the commit `vX.Y.Z` and publishes a GitHub Release automatically, so **never create tags by hand**.

## Code Standards

### General

- All code, comments, and variable names must be in **English**
- No `console.log` left in production code (use proper logging or remove)
- No commented-out code. Delete it. Git has history.
- No TODO comments without a linked issue
- Don't add dependencies without discussing it first
- If you add a new environment variable, update `.env.example`

### Server

- Follow existing patterns in `server/src/`
- New tools go in `agent/tools.js` following the existing structure
- New integrations are conditional — their tools are only registered when the integration is configured. Most credentials live in the database, not env vars: follow the DB-backed pattern (a `settings.js` reading `app_config`, an `/admin` section to edit it, and an **async** `isConfigured()` resolved per turn). See `notion/` for a minimal example
- Tests are colocated next to source files (`foo.js` -> `foo.test.js`)

### Client

- Follow existing patterns in `client/src/`
- Components go in `components/`, hooks in `hooks/`
- Use existing UI patterns before creating new ones
- Tests use `@testing-library/react` — test behavior, not implementation

### AI-Generated Code

If you're using AI tools to write code:

- **You are responsible for every line.** "The AI wrote it" is not an excuse.
- Read and understand every line before committing
- Don't blindly accept suggestions — verify they follow our patterns
- AI tools tend to over-engineer: add unnecessary abstractions, error handling for impossible cases, and excessive comments. Strip all of that out.
- AI tools often generate code that looks correct but doesn't match the project's conventions. Adapt it.
- If you can't explain what a piece of code does, don't commit it.

## Database Migrations (Drizzle)

The app's own schema (`server/src/db/schema.js`) is managed with [Drizzle ORM](https://orm.drizzle.team/). Migration SQL is committed under `server/drizzle/` and applied automatically on server boot. After changing the schema, regenerate the migration and commit it with your change:

```bash
npm run db:generate --prefix server   # create a new migration from the schema
npm run db:migrate --prefix server    # apply migrations to DATABASE_URL (optional; the server also does this on boot)
npm run db:studio --prefix server     # browse the database in Drizzle Studio
```

## PR Description

Every PR must include:

1. **What** — A clear description of what changed
2. **Why** — The reason for the change (link to issue if applicable)
3. **How** — Brief explanation of the approach
4. **How to test** — Steps to verify the change works

## Visual Changes

If your PR includes any UI or visual change, you **must** attach screenshots or a screen recording showing the before and after. No exceptions.

This applies to: layout changes, new components, style updates, responsive adjustments, error states, loading states, etc.

## Code Review

- Address all review comments before requesting a re-review
- Don't resolve conversations yourself — let the reviewer resolve them
- If you disagree with feedback, explain your reasoning. Don't just ignore it.
- Approval from at least one reviewer is required before merging

## Testing

- New features must include tests
- Bug fixes must include a test that reproduces the bug
- Don't write tests just to increase coverage — write tests that catch real bugs
- Follow the existing test patterns (Vitest, colocated test files)
- The project enforces a **90% line-coverage threshold in CI** (`npm run test:coverage`), on both the server and the client. Your PR must not drop coverage below that line.
- **Test behavior, not implementation.** Test *what* a function does (given X input, expect Y output), not *how* it does it internally. Don't spy on internal methods or assert that a specific function was called N times — those tests break on every refactor and don't catch real bugs. AI tools are especially bad at this: they generate tests full of spies and mocks that verify nothing useful.
