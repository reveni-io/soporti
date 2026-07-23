# Soporti

[![CI](https://github.com/reveni-io/soporti/actions/workflows/ci.yml/badge.svg)](https://github.com/reveni-io/soporti/actions/workflows/ci.yml) [![CodeQL](https://github.com/reveni-io/soporti/actions/workflows/codeql.yml/badge.svg)](https://github.com/reveni-io/soporti/actions/workflows/codeql.yml) [![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE) ![Node 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

AI-powered code assistant that helps support and engineering teams understand and navigate code repositories. Built with OpenAI's Agent SDK and a React chat interface.

![Soporti — ask anything about how your product works](docs/images/landing.png)

[![Deploy to DigitalOcean](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/reveni-io/soporti/tree/main) [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/reveni-io/soporti)

One-click deploys for DigitalOcean App Platform and Render — see the [deployment guide](docs/deployment.md#one-click-deploys).

## Features

- **AI Chat with Tool Calling** — Ask questions about your codebase and get answers powered by OpenAI agents that can browse files, search code, and explore directory structures
- **Admin-managed auth** — Email/password sign-in plus optional Google Sign-In (restrictable to your email domains); users are created from the admin panel and persisted in PostgreSQL
- **Zero-config-file setup** — Credentials and integrations are configured from the `/admin` panel and stored in the database; booting needs only `JWT_SECRET` and `DATABASE_URL`
- **Multiple Integrations** — Connect GitHub, Notion, PostgreSQL, Sentry, Shortcut, Slack, Google Drive, Helpjuice, and Shopify
- **Response Profiles** — Switch between "tech" (detailed, code-heavy) and "support" (simplified, behavior-focused) modes
- **Real-time Streaming** — Server-Sent Events for live response streaming
- **Rich Rendering** — Markdown, syntax highlighting, Mermaid diagrams (rendered as SVG), and Recharts-based charts
- **Slack Bot** — Interact with the assistant directly from Slack via @mentions
- **Shareable Conversations** — Generate read-only links to share chat sessions

| Choose your sources | Switch response profiles |
| --- | --- |
| ![Sidebar sources selector with YOLO mode, integrations and repos](client/public/tour/sources.png) | ![Sidebar profile toggle between Support and Tech](client/public/tour/profiles.png) |

## Prerequisites

- Node.js 20+ (or Docker + Docker Compose for the containerized setups)
- Git
- A PostgreSQL database (provided automatically by Docker Compose — see below)
- An OpenAI API key — configured from the `/admin` panel after the first boot, not an env var

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

Everything else — the OpenAI API key and model, the GitHub token and repository catalog, Slack, Notion, Google Drive, Helpjuice, the agent's read-only query database, Shopify, sign-in methods and allowed Google domains — is **not** an env var: it lives in the database and is managed from the admin panel (`/admin`) after the first-run setup.

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
3. In `/admin` → OpenAI, set the API key and model (there is no default model — the chat won't run until both are set).
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
