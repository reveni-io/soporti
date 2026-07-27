# Soporti

[![CI](https://github.com/reveni-io/soporti/actions/workflows/ci.yml/badge.svg)](https://github.com/reveni-io/soporti/actions/workflows/ci.yml) [![CodeQL](https://github.com/reveni-io/soporti/actions/workflows/codeql.yml/badge.svg)](https://github.com/reveni-io/soporti/actions/workflows/codeql.yml) [![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE) ![Node 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

AI-powered code assistant that helps support and engineering teams understand and navigate code repositories. Built on the OpenAI Agents SDK — running against OpenAI or Anthropic, your choice — with a React chat interface.

**[soporti.reveni.com](https://soporti.reveni.com)** — see what it looks like before installing it.

[![Soporti — ask anything about how your product works](docs/images/landing.png)](https://soporti.reveni.com)

[![Deploy to DigitalOcean](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/reveni-io/soporti/tree/main) [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/reveni-io/soporti)

One-click deploys for DigitalOcean App Platform and Render — see the [deployment guide](docs/deployment.md#one-click-deploys).

## Features

### Ask across your stack

Every integration is optional and configured from the `/admin` panel — the assistant only gets tools for what you connect ([setup details](#optional-integrations)).

| Source | What the assistant can do |
|---|---|
| **GitHub** | Browse repositories and directories, read files, search code by content, find files by name, and trace a file's history with `git log` / `git blame` |
| **Database** | Explore schemas and tables, then answer with real data through read-only, row-capped `SELECT`s |
| **Shortcut** | Read a story by ID or search stories — what was specced versus what shipped |
| **Sentry** | Open an issue with its stacktrace, or find issues by error message |
| **Notion** | Search and read the pages shared with the integration |
| **Google Drive** | Search, list and read shared folders — Docs, Sheets, Slides, PDFs and Office files |
| **Helpjuice** | Search and read your help center articles |
| **Shopify** | Look up orders, products and webhooks store by store, or run read-only Admin GraphQL queries |
| **Slack** | Ask the assistant from Slack, in a thread, with an @mention |

### Make it answer your way

- **Pick the sources per conversation** — scope a chat to the repos and integrations it may use, or go YOLO and give it everything. The selection is enforced when the tools are built, not just requested in the prompt
- **Response profiles** — *support* (plain language, behavior-focused) or *tech* (detailed, code-heavy) for the same question
- **Custom instructions** — your role, your language, your preferred level of detail, applied to every chat automatically
- **Skills (`/commands`)** — save reusable instruction snippets (a triage checklist, a review rubric, a tone of voice) and run one by starting a message with `/skill-name`, with autocomplete as you type `/`. The skill stays active for the rest of that conversation, its instructions take precedence over the default style rules, and `$ARGUMENTS` / `$1…$9` slot in what you typed after the command. Create and edit them in **Settings → Skills**

| Choose your sources | Switch response profiles |
| --- | --- |
| ![Sidebar sources selector with YOLO mode, integrations and repos](client/public/tour/sources.png) | ![Sidebar profile toggle between Support and Tech](client/public/tour/profiles.png) |

### It also works without anyone asking

- **Automated PR reviews** — request a review from the bot's GitHub user or add the `soporti-review` label, and it reviews the diff on three axes: correctness, your own written standards (CLAUDE.md, ADRs, agent skills found in the repo) and the linked Shortcut story. It posts inline comments and can approve trivial PRs
- **Replies in PR threads** — @mention the bot in a PR comment or review thread and it answers there, once, with the branch checked out and its data tools available
- **Scheduled queries** — save a question and a cadence (hourly, daily, weekly or monthly, in your own time zone) in **Scheduled queries**, and it asks itself on time with the sources and profile you had selected. Every run lands as a new conversation in the sidebar, marked with a clock, that you can open and keep chatting in
- **Slack ticket auto-diagnose** — tickets filed into a Slack List get triaged autonomously, screenshots included, with the diagnosis written back into the ticket
- **Learns from what worked** — mark an answer as helpful and the case is saved to a knowledge base that later questions search automatically (needs a vector store id in `/admin` → Knowledge base; it runs on OpenAI Vector Stores whichever chat provider you pick, so it needs an OpenAI key of its own when the assistant is on Anthropic)

### Keep and share the answers

- **Conversation history** — chats are persisted and reopenable from the sidebar
- **Read-only share links** — hand a conversation to someone with no account; the transcript is frozen at that point and the link expires in 24 hours

## Prerequisites

- Node.js 20+ (or Docker + Docker Compose for the containerized setups)
- Git
- A PostgreSQL database (provided automatically by Docker Compose — see below)
- An OpenAI or Anthropic API key — configured from the `/admin` panel after the first boot, not an env var

Optional, also configured from `/admin` later: a GitHub Personal Access Token, a Google OAuth Client ID for Google sign-in, Slack/Notion/Google Drive/Helpjuice credentials.

## Quick Start

1. **Clone and install**

```bash
git clone https://github.com/reveni-io/soporti.git
cd soporti
npm run install:all
```

2. **Configure environment**

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string for the app database (users, config) |
| `JWT_SECRET` | Yes | Secret used to sign session JWTs (e.g. `openssl rand -hex 32`) |
| `VITE_GOOGLE_CLIENT_ID` | No | Google OAuth Client ID, baked into the client build — only if you enable Google sign-in |
| `JWT_EXPIRES_IN` | No | Session lifetime (default: `24h`) |
| `CORS_ORIGIN` | No | Allowed browser origins (CSV) — set it when the client is served from a different domain than the API |

Everything else — the LLM provider, its API key and model, the GitHub token and repository catalog, Slack, Notion, Google Drive, Helpjuice, the agent's read-only query database, Shopify, sign-in methods and allowed Google domains — is **not** an env var: it lives in the database and is managed from the admin panel (`/admin`) after the first-run setup.

3. **Start development**

The fastest path is Docker Compose, which brings up PostgreSQL, the server, and the client with one command:

```bash
npm run docker:up
```

This starts PostgreSQL, the server (port 3001), and the client (port 5173) with hot-reload. Database migrations (Drizzle) are applied automatically on server boot, so the schema is ready on first run. Open http://localhost:5173. Stop everything with `npm run docker:down`.

> If you ran an earlier version of this stack before migrations existed, reset the dev database once so Drizzle owns the schema: `docker compose down -v` (this drops the `pgdata` volume), then `npm run docker:up`.

Alternatively, run the server and client directly on your machine (you must provide your own PostgreSQL via `DATABASE_URL`):

```bash
npm run dev
```

This starts both the server (port 3001) and client (port 5173) concurrently. Open http://localhost:5173.

### First run

1. Boot the app. With no admin user yet, the server prints a **one-time setup code** in its logs.
2. Open `/admin`, enter the setup code and create the first admin (email + password).
3. In `/admin` → LLM, pick the provider (OpenAI or Anthropic) and set its API key and model (there is no default model — the chat won't run until both are set).
4. Configure any integrations you want from the panel, and create regular users in `/admin` → Users (there is no self-registration).

Google sign-in is optional and **off by default** (password sign-in is on) — see [Set up Google Sign-In](docs/deployment.md#set-up-google-sign-in) in the deployment guide to enable it.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start server + client in dev mode (needs your own PostgreSQL) |
| `npm run docker:up` | Start PostgreSQL + server + client in Docker (dev) |
| `npm run docker:down` | Stop the Docker dev stack |
| `npm run docker:prod` | Build + start the production stack (`docker-compose.prod.yml`) |
| `npm run docker:prod:down` | Stop the production stack |
| `npm run install:all` | Install dependencies for both packages |
| `npm run build:client` | Build client for production |
| `npm test` | Run all tests (server + client) |
| `npm run test:coverage` | Run all tests with coverage reports |
| `npm run dev --prefix server` | Server only |
| `npm run dev --prefix client` | Client only |

## Optional Integrations

All integrations are conditionally loaded — tools are only registered with the agent if the integration is configured. They are configured from the `/admin` panel (stored in the database, no restart needed); only a few operational tunables remain env vars.

### Configured from `/admin`

- **GitHub** — token, repository catalog, and the PR-review webhook secret (`/admin` → GitHub). Powers repo browsing and automated PR reviews.
- **Notion** — integration token (`/admin` → Notion). Create one at [notion.so/my-integrations](https://www.notion.so/my-integrations) and share the relevant pages with it.
- **Database (agent query tool)** — a read-only PostgreSQL connection string plus a query row cap (`/admin` → Database). This is a **separate** database from the app's own `DATABASE_URL`: it's the customer database the agent explores with schema and SELECT-only tools.
- **Shopify** — rides on that query database: an admin-written SQL template resolves a store identifier to its Shopify domain + Admin API token (`/admin` → Shopify, with a "Draft with Soporti" helper that explores your schema).
- **Google Drive** — a read-only service-account JSON key (`/admin` → Google Drive). Access is governed by Drive sharing: share each folder with the service-account email as Viewer.
- **Helpjuice** — API key + account subdomain (`/admin` → Helpjuice).
- **Shortcut** — API token (`/admin` → Shortcut). Generate one in Shortcut under **Settings → Your Account → API Tokens**. Powers story lookups and the spec axis of PR reviews.
- **Sentry** — auth token + organization slug (`/admin` → Sentry). Create a token at [sentry.io/settings/auth-tokens](https://sentry.io/settings/auth-tokens/). Fetches issue details with stacktraces and searches issues by error message.
- **Slack bot** — bot token, app token and signing secret (`/admin` → Slack); the bot (re)connects in place when they are saved. Uses Socket Mode (no public URL required). Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps) with scopes: `app_mentions:read`, `chat:write`, `channels:history`, `im:history`, `im:read`.

### Configured via env vars

A handful of operational tunables (not integration credentials) are still read from `.env`.

#### Slack ticket auto-diagnose (optional)

Soporti can auto-triage support tickets filed as items in a [Slack List](https://slack.com/help/articles/27452748828179-Use-lists-in-Slack): it polls the List and writes an autonomous diagnosis into each new ticket's diagnosis column. Enable it by setting `SLACK_AUTODIAGNOSE_LIST_ID` — see [Slack ticket auto-diagnose](docs/deployment.md#slack-ticket-auto-diagnose) for the required bot scopes and one-time setup.

## Deployment

The fastest path is the **Deploy to DigitalOcean** / **Deploy to Render** buttons at the top of this README, which provision the whole stack (server, client, PostgreSQL) from [`.do/deploy.template.yaml`](.do/deploy.template.yaml) and [`render.yaml`](render.yaml).

To self-host, `docker-compose.prod.yml` runs the full production stack — PostgreSQL, the server, and the built client served by nginx on one origin. The only required setting is `JWT_SECRET`:

```bash
cp .env.example .env    # set JWT_SECRET (openssl rand -hex 32)
npm run docker:prod     # open http://localhost:8080, then follow the first-run flow
```

The standalone images (`server/Dockerfile`, `client/Dockerfile`) can also be deployed separately — e.g. the client as a static site and the server as a container on a PaaS. See [docs/deployment.md](docs/deployment.md) for the full guide: first-run flow, environment reference, split deployments, and operational notes.

## Security

Soporti is an LLM agent with read access to real systems — before connecting a production database, Drive, or Slack, read [SECURITY.md](SECURITY.md): it explains the security model, the deliberately accepted risks, and a hardening checklist. Vulnerabilities are reported through GitHub's private vulnerability reporting, not public issues.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

[Apache License 2.0](LICENSE)
