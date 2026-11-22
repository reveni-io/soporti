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

Soporti is an LLM agent wired to real systems: your source code, a production database (read-only), Google Drive, Slack. Like any LLM agent, it is exposed to **prompt injection** — content the agent reads (PR diffs, support tickets, documents, query results) can attempt to steer its behavior. The project ships deterministic guardrails, but five design decisions deliberately trade isolation for capability. They are summarized here because **every adopter must evaluate them against their own threat model before connecting production systems.**

### 1. The agent runs live queries against the databases you connect

The chat agent — and the automated PR reviewer — carry a `query_database` tool that executes read-only SELECTs against the databases connected in `/admin` → Database. The PR reviewer's input is author-controlled (title, body, diff — including vendored or generated code), and its output is published on GitHub, so a prompt-injected PR could in principle steer the agent into reading data and echoing it into a review comment. A deterministic output guard redacts credential-shaped strings from everything posted, but **data that does not look like a credential (e.g. business rows) can still leak**.

The **Analytics** dashboard (`/analytics`) uses the same connections. Its agent writes and runs queries the same way, and the SQL of every card is editable: **any signed-in user can run their own read-only `SELECT` against any of those databases, with no model in between**. Treat everything the connected database users can read as readable by every user of the app.

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

### 4. Slack: channel membership IS the posting and reading boundary

Once the Slack bot is configured, every agent run — web chat, Slack, scheduled queries, MCP and auto-diagnose — carries `post_slack_message`, which posts as the bot in any channel the bot has been invited to. There is no channel allowlist in code: what the agent read (database rows, tickets, documents) can be posted wherever the bot is a member, and a prompt-injected ticket or document could in principle steer an unattended run into doing so.

The same membership decides what the agent can read with the Slack source (`list_slack_channels`, `read_slack_channel`, `read_slack_thread`): every user of Soporti can read, through the bot, any **public** channel the bot is a member of. A **private** channel the bot is in is read only for its own members: each read matches the person asking to a Slack user (the Slack account they asked from, or the Slack user with their Soporti email) and checks `conversations.members`; when Soporti cannot match them, or nobody is behind the run, it reads public channels only. That match trusts the email on the Soporti account, so an admin who creates a password account with someone else's email gives it that person's private channels. Asked from Slack, a private channel is read only in a direct message with the bot or in that same channel. Direct messages and group messages are refused in code — each read asks Slack for the conversation and rejects anything that is not a channel — so the bot's `im:history`, which it needs to answer DMs, never exposes them through these tools. Once a private channel has been read, its content is in the conversation: the prompt tells the agent to keep it with the person asking, but a prompt-injected run could still be steered into posting it where the bot is a member. Channel messages are written by anyone in the workspace, including guests and Slack Connect partners, so they are another prompt-injection surface: the system prompt declares them data, never instructions.

Deploy accordingly:

- Invite the bot only to channels whose members may see what the agent can read, and to public channels whose content every Soporti user may read; remove it from the ones that no longer need it.
- Never grant the bot `mpim:history` or `mpim:read`: Soporti refuses group messages anyway, and without them Slack does too.
- Never grant the bot `chat:write.public`: without it, the bot cannot post in a channel it has not been invited to.

### 5. GitHub write access: a steered run can push a branch and open a pull request

With write access enabled in `/admin` → GitHub (off by default), every agent run that can read a repository — web chat, Slack, MCP, bots, scheduled queries and auto-diagnose — carries `edit_file`, `write_file`, `delete_file`, `continue_pull_request` and `open_pull_request`. They push a `soporti/…` branch with the GitHub token and open a draft pull request. A prompt-injected ticket, email or document could in principle steer a run into pushing code nobody asked for. The pull request never merges by itself, but **your CI runs on that branch, and workflows triggered by pull requests from branches of the same repository get its secrets** — code pushed there executes before anyone has reviewed it.

What is enforced in code: pushes only go to `soporti/` branches, never to the default branch; nothing under `.github/` (in any casing), `.env*`, `.git` or `node_modules` can be written, and never through a symbolic link; commits and pushes run with git hooks disabled, so nothing from the repository is executed on the server; the switch is checked again right before every push; the pull request title and body go through the output guard.

Deploy accordingly:

- Leave write access off unless your team will use it, and turn it on only with a token whose account may push branches to the repositories the agent reads.
- Protect the default branch with required reviews **that the token's account cannot bypass**: a machine user with admin rights skips branch protection unless it is enforced for administrators too.
- Do not grant the token the `workflow` scope (the **Workflows** permission on a fine-grained token), so GitHub itself rejects any push that touches a workflow file.
- Check what your pull-request workflows expose to same-repository branches (secrets, deploy previews), as you would for any collaborator who can push a branch.
- Auto-diagnose (section 3) carries these tools too when write access is on: the most exposed input surface reaching a tool that writes.

### Built-in guardrails (they reduce the risks above — they do not eliminate them)

- Everything published to GitHub or Slack passes through a deterministic output guard that redacts credential-shaped strings — API tokens, JWTs, private keys, connection-string passwords (`server/src/review/output-guard.js`).
- The database tool is SELECT-only with a configurable row cap; Analytics queries are SELECT-only too, run in a read-only transaction, and are capped at 2,000 rows with a 30-second statement timeout; Google Drive uses the read-only `drive.readonly` scope; Shopify token lookups never enter the drafting agent's context.
- System prompts declare all external content (PR text, tickets, documents, tool output) to be data, never instructions; autonomous runs ignore user-saved custom instructions.

## Hardening Checklist

- Generate a strong `JWT_SECRET` (`openssl rand -hex 32`) — the server refuses to boot with the placeholder value.
- Serve the app behind TLS, and set `CORS_ORIGIN` when the client is served from a different origin than the API.
- Set `TRUST_PROXY=false` when clients connect directly to the server (prevents spoofing the per-IP login rate limit via `X-Forwarded-For`).
- Google sign-in is off by default on fresh installs. If you enable it, configure the allowed-domains list — an empty list allows **any** verified Google account.
- Create users only for people who should see everything the agent can see: there is no per-user data ACL inside the app.
- Keep the app database (`DATABASE_URL`) and the agent's query database separate, with separate credentials.
- Give the IAM role or user behind the AWS integration only the read actions `/admin` → AWS lists (see `docs/deployment.md`): the IAM policy is what AWS enforces, whatever the tools would ask for.
- If you enable GitHub write access, protect the default branch with required reviews the token's account cannot bypass, and leave out the `workflow` scope.
- Create the HubSpot Service Key with only the scopes `/admin` → HubSpot lists for the levels you chose: the key's scopes are what HubSpot itself enforces, whatever the levels say.
