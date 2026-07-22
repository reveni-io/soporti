# Security Policy

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues, discussions, or pull requests.

Instead, use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability): open the **Security** tab of this repository and click **Report a vulnerability**.

Include as much of the following as you can:

- The affected component (route, tool, integration) and version/commit
- Steps to reproduce, or a proof of concept
- The impact you believe it has (what an attacker gains)

We will acknowledge your report as soon as we can — usually within a few business days — keep you informed of progress, and credit you in the fix unless you prefer otherwise. Please give us reasonable time to ship a fix before disclosing publicly.

## Supported Versions

Security fixes land on `main`. There are no long-term support branches; run the latest code.

## Security Model — Read This Before You Deploy

Soporti is an LLM agent wired to real systems: your source code, a production database (read-only), Google Drive, Slack. Like any LLM agent, it is exposed to **prompt injection** — content the agent reads (PR diffs, support tickets, documents, query results) can attempt to steer its behavior. The project ships deterministic guardrails, but three design decisions deliberately trade isolation for capability. They are summarized here because **every adopter must evaluate them against their own threat model before connecting production systems.**

### 1. The agent runs live queries against the database you connect

The chat agent — and the automated PR reviewer — carry a `query_database` tool that executes read-only SELECTs against the database configured in `/admin` → Database. The PR reviewer's input is author-controlled (title, body, diff — including vendored or generated code), and its output is published on GitHub, so a prompt-injected PR could in principle steer the agent into reading data and echoing it into a review comment. A deterministic output guard redacts credential-shaped strings from everything posted, but **data that does not look like a credential (e.g. business rows) can still leak**.

Deploy accordingly:

- Connect a **read-only database user**, scoped to the schemas the agent genuinely needs. Never reuse an admin or read-write connection string.
- Enable PR reviews only on repositories whose authors you trust. If external contributors can open PRs against a repository the bot reviews, revisit this decision before anything else.

### 2. Google Drive: sharing IS the access boundary

There is no folder allowlist in code: the agent can read anything shared with its service account, and **every chat user can read what the agent can read** — chat authentication checks identity, not per-user Drive ACLs. One mistaken or inherited share of a sensitive folder (HR, compensation, security) makes it readable to everyone with chat access.

Deploy accordingly:

- Create a **dedicated service account** for Soporti; never reuse one that already has shares.
- Treat "shared with the service account" as "visible to all chat users", and audit the SA's shares periodically (its email is logged at startup and shown in `/admin` → Google Drive).

### 3. Slack auto-diagnose runs autonomously on channel-writable input

When enabled (`SLACK_AUTODIAGNOSE_LIST_ID`), the agent autonomously processes free-text tickets submitted by **anyone who can post in the support channel**, carrying the full read-only data toolset, with no human in the loop before the diagnosis is written. This is the least-trusted input surface in the product reaching the most capable toolset.

Deploy accordingly:

- Only enable it on channels restricted to your own staff.
- Do **not** enable it if the channel accepts external or guest submitters.

### Built-in guardrails (they reduce the risks above — they do not eliminate them)

- Everything published to GitHub or Slack passes through a deterministic output guard that redacts credential-shaped strings — API tokens, JWTs, private keys, connection-string passwords (`server/src/review/output-guard.js`).
- The database tool is SELECT-only with a configurable row cap; Google Drive uses the read-only `drive.readonly` scope; Shopify token lookups never enter the drafting agent's context.
- System prompts declare all external content (PR text, tickets, documents, tool output) to be data, never instructions; autonomous runs ignore user-saved custom instructions.

## Hardening Checklist

- Generate a strong `JWT_SECRET` (`openssl rand -hex 32`) — the server refuses to boot with the placeholder value.
- Serve the app behind TLS, and set `CORS_ORIGIN` when the client is served from a different origin than the API.
- Set `TRUST_PROXY=false` when clients connect directly to the server (prevents spoofing the per-IP login rate limit via `X-Forwarded-For`).
- Google sign-in is off by default on fresh installs. If you enable it, configure the allowed-domains list — an empty list allows **any** verified Google account.
- Create users only for people who should see everything the agent can see: there is no per-user data ACL inside the app.
- Keep the app database (`DATABASE_URL`) and the agent's query database separate, with separate credentials.
