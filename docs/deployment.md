# Deployment

Soporti is designed so that a production deployment needs almost no configuration
up front: the only required secrets at boot time are `JWT_SECRET` and a PostgreSQL
database for the app itself. Everything else — the OpenAI API key and model, the
GitHub token, Slack, Notion, Google Drive, Helpjuice, the agent's read-only query
database, sign-in methods — lives in that database and is configured from the
`/admin` panel after the first boot.

There are two supported deployment shapes:

1. **Single box with Docker Compose** — everything (PostgreSQL, API, frontend)
   on one host behind one origin. The fastest way to run Soporti.
2. **Split deployment** — the client as a static site and the server as a
   container, each on its own service/domain (e.g. DigitalOcean App Platform,
   Railway, Render, Fly.io).

There are also **one-click deploy buttons** in the README for DigitalOcean App
Platform and Render — see [One-click deploys](#one-click-deploys) below.

## First-run flow (both shapes)

1. Boot the server with `JWT_SECRET` and `DATABASE_URL` set. Migrations are
   applied automatically on boot.
2. The server prints a **one-time setup code** in its logs (regenerated on every
   restart while no admin exists):

   ```
   docker compose -f docker-compose.prod.yml logs server | grep -A3 'setup code'
   ```

3. Open `/admin` in the browser. It asks for that setup code and lets you create
   the first admin user (email + password). This self-disables once an admin
   exists, so grab the code before exposing the URL publicly — or right after.
4. Sign in to `/admin` and configure, at minimum, **OpenAI** (API key + model —
   there is no default model, the chat refuses to run until both are set).
5. Optionally configure the rest from the panel: GitHub (token, repo catalog,
   PR-review webhook secret), Slack, Notion, Google Drive, Helpjuice, the
   read-only query Database, Shopify, sign-in methods and Google domains.
6. Create regular users in `/admin` → Users (there is no self-registration).
   Password sign-in is ON and Google sign-in is OFF by default.

## Option 1 — Docker Compose (single origin)

`docker-compose.prod.yml` runs PostgreSQL, the server (`server/Dockerfile`) and
the built client served by nginx (`client/Dockerfile`). nginx proxies `/api` to
the server container, so the whole app lives on **one origin**: no CORS setup,
no `VITE_API_URL`.

```bash
cp .env.example .env        # set JWT_SECRET (openssl rand -hex 32)
npm run docker:prod         # = docker compose -f docker-compose.prod.yml up -d --build
```

Open `http://localhost:8080` (override the host port with `APP_PORT`). Then
follow the first-run flow above. Stop with `npm run docker:prod:down`.

Environment variables read by the compose file (all from `.env` or the shell):

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | **Yes** | Session signing secret, e.g. `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | No | Internal Postgres password (default `soporti`; the DB is not exposed to the host) |
| `APP_PORT` | No | Host port the app is served on (default `8080`) |
| `VITE_GOOGLE_CLIENT_ID` | No | Only if you enable Google sign-in — baked into the client at build time, must match the client id saved in `/admin` → Authentication |

`DATABASE_URL` is set by the compose file to the internal `db` container.
Postgres data persists in the `pgdata_prod` volume. The optional server tunables
(`SLACK_AUTODIAGNOSE_*`, `REVIEW_*`, …) are also picked up
from `.env` if present. Integration credentials (GitHub, OpenAI, Sentry, Notion,
Shortcut, Slack, …) are not env vars — configure them from `/admin` after boot.

To rebuild after pulling a new version: `npm run docker:prod` again (it
rebuilds the images; migrations run on boot).

## Option 2 — Split deployment (static client + server container)

This is how the reference production deployment runs on DigitalOcean App
Platform, and it maps 1:1 to Railway/Render/Fly static-site + service pairs.

### Server

Deploy `server/Dockerfile`. The image listens on **8080** (`ENV PORT=8080`);
platforms that inject `PORT` at runtime override it — on DO App Platform set
`http_port: 8080` and the injected `PORT` matches the image.

Required runtime env: `DATABASE_URL` (a managed PostgreSQL), `JWT_SECRET`.

Strongly recommended: set `CORS_ORIGIN` to the client's origin (e.g.
`https://app.example.com`). Without it the API accepts requests from **any**
browser origin — the server logs a warning in production when this is the case.
Keep `TRUST_PROXY=1` (the default) behind the platform's proxy so the login
rate limit keys on the real client IP.

To run the image anywhere else:

```bash
cd server
docker build -t soporti-server .
docker run -p 8080:8080 -e DATABASE_URL=... -e JWT_SECRET=... soporti-server
```

### Client

Two interchangeable options:

- **Static site / buildpack** (what the reference deployment uses): build
  command `npm run build` in `client/`, publish `dist/`. Set the build-time env
  var `VITE_API_URL` to the server's public URL (no trailing slash) — every API
  call the client makes is `${VITE_API_URL}/api/...`. Set `VITE_GOOGLE_CLIENT_ID`
  too if you use Google sign-in.
- **Container**: `client/Dockerfile` builds the app and serves it with nginx.

  ```bash
  cd client
  docker build --build-arg VITE_API_URL=https://api.example.com -t soporti-client .
  docker run -p 8080:80 soporti-client
  ```

  When `VITE_API_URL` is left empty the bundle makes same-origin calls and
  nginx proxies `/api` to `API_PROXY_TARGET` (runtime env, default
  `http://server:8080` to match the compose file) — use this mode to keep a
  single origin even outside compose.

### Webhooks and streaming

- The GitHub PR-review webhook must reach the **server** origin:
  `https://<server>/api/webhooks/github`.
- `/api/chat` streams Server-Sent Events. Any proxy you put in front of the
  server must not buffer responses (the bundled nginx config already sets
  `proxy_buffering off` and a long read timeout).

## One-click deploys

The README carries two deploy buttons. Each reads a manifest committed in this
repo, and both only work while the GitHub repository is public. In both cases,
keep a **single server instance** — see the operational notes on rate limiting
and the review queue.

### DigitalOcean App Platform

The **Deploy to DigitalOcean** button uses
[`.do/deploy.template.yaml`](../.do/deploy.template.yaml) to provision the
whole stack on a single App Platform app:

- **server** — container built from `server/Dockerfile`, routed under `/api`
  (with `preserve_path_prefix`, so the Express routes match unchanged).
- **client** — static site built with the Node buildpack (`npm run build` in
  `client/`, publishing `dist/`), served at `/`. Client and API share one
  origin, so no `VITE_API_URL` or CORS setup is needed — the template pins
  `CORS_ORIGIN` to the app's own URL anyway.
- **db** — a development PostgreSQL database, bound to `DATABASE_URL`. Fine to
  start with; for real usage attach a managed production cluster instead.

The only value the creation wizard asks for is `JWT_SECRET` (generate one with
`openssl rand -hex 32`). Once the app is live:

1. Open the **server component → Runtime Logs** and copy the one-time setup
   code.
2. Visit `https://<your-app>.ondigitalocean.app/admin`, enter the code, create
   the admin, and follow the normal
   [first-run flow](#first-run-flow-both-shapes).

> **Forking?** `.do/deploy.template.yaml` hardcodes `repo: reveni-io/soporti`
> twice (the `server` and `client` components). If you deploy from your own
> fork, edit both to `repo: <your-org>/<your-fork>` — otherwise the button
> builds this upstream repository instead of yours.

### Render

The **Deploy to Render** button uses the [`render.yaml`](../render.yaml)
blueprint to provision the split shape:

- **soporti-server** — Docker web service built from `server/Dockerfile`
  (`starter` plan). `JWT_SECRET` is auto-generated by Render.
- **soporti-client** — static site (`npm ci && npm run build` in `client/`,
  publishing `dist/` with an SPA rewrite). Its build-time `VITE_API_URL` is
  wired to the server's public URL automatically.
- **soporti-db** — managed PostgreSQL (`basic-256mb`), bound to
  `DATABASE_URL`. Switch the plan to `free` for a throwaway trial — free
  databases expire after ~30 days, taking users and config with them.

Client and server live on **different origins** here, and the blueprint does
not wire the client's URL back into the server — so after the first deploy,
set `CORS_ORIGIN` on **soporti-server** to the client's URL (e.g.
`https://soporti-client.onrender.com`). Until then the API accepts requests
from any browser origin (the server logs a warning).

First run: open the server service → **Logs**, copy the one-time setup code,
then visit `https://<client>.onrender.com/admin` and follow the
[first-run flow](#first-run-flow-both-shapes).

## Set up Google Sign-In

Google sign-in is **off by default** on fresh installs; password sign-in is on.

1. In the [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), create an **OAuth 2.0 Client ID** of type **Web application**.
2. Under **Authorized JavaScript origins**, add your production origin (and `http://localhost:5173` for local development).
3. Set the generated Client ID as `VITE_GOOGLE_CLIENT_ID` at client **build time** (it is baked into the bundle), save the same value in `/admin` → Authentication, and enable the Google method there. The two must match — the server verifies Google tokens against the value stored in `/admin`.

The allowed Google domains are configured in `/admin` → Authentication (an empty list allows any verified Google account).

## Slack ticket auto-diagnose

Soporti can auto-triage support tickets filed in a channel via a request-form workflow that stores each ticket as an item in a [Slack List](https://slack.com/help/articles/27452748828179-Use-lists-in-Slack). It polls the List, and for every item whose diagnosis column is still empty it reads the ticket (and any screenshots), runs an autonomous diagnosis with the full support toolset, and writes the result — preliminary diagnosis, proposed fixes if it looks like a bug, and a recommendation for support — back into that column.

Enabled only when `SLACK_AUTODIAGNOSE_LIST_ID` is set:

```env
SLACK_AUTODIAGNOSE_LIST_ID=F0XXXXXXX
# SLACK_AUTODIAGNOSE_COLUMN_NAME=Diagnosis
```

One-time setup:

1. Add the bot scopes `lists:read`, `lists:write`, `files:read` and reinstall the Slack app.
2. Give the bot access to the List.
3. Add a Text column named like `SLACK_AUTODIAGNOSE_COLUMN_NAME` (default `Diagnosis`). The empty column doubles as the "not yet diagnosed" marker, so a diagnosis is never duplicated and tickets survive restarts.

To avoid diagnosing the whole historical backlog on first activation, archived tickets are always skipped and you can set `SLACK_AUTODIAGNOSE_SKIP_BEFORE` to the go-live timestamp so only tickets created after it are diagnosed. Posting the diagnosis as a list-item *comment* is not possible — the Slack Lists API has no comment-write method — so the diagnosis lands in a field.

## Operational notes

- **Migrations** run automatically on server boot; no separate deploy step.
- **Rotating credentials** (OpenAI key, GitHub token, Slack tokens, query DB
  connection) takes effect without a restart — they are re-read from the DB.
- **Rate limiting** is in-memory and per-instance; running several server
  replicas multiplies the effective limits and breaks the review queue's
  in-memory dedup. Run a single server instance unless you know what you are
  doing.
- **Conversations** are purged 14 days after last use; the app DB stays small.
- The **Slack bot** uses Socket Mode: no public URL needed, works from behind
  NAT, and reconnects when credentials are saved in `/admin`.
