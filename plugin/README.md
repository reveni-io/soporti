# Soporti plugin for Claude

Connects Claude to the [Soporti](https://github.com/reveni-io/soporti) MCP server, so any Claude session can ask Soporti to investigate across your repos and integrations and answer with the sources it consulted.

The plugin ships one command, `/soporti:setup`, which validates your API key and registers the connector for you.

## Install

The plugin lives in the Soporti repository, which doubles as its marketplace. Add the marketplace once, then install the plugin.

**Claude Code:**

```
/plugin marketplace add reveni-io/soporti
/plugin install soporti@soporti
```

**Cowork:** **Customize → Plugins → Add → Add marketplace**, with `https://github.com/reveni-io/soporti`. Then install **soporti** from the marketplace.

## Set it up

Run `/soporti:setup` and paste your Soporti API key when asked. Create one in Soporti under **Settings → API keys** — the plaintext is shown only once, at creation.

The command validates the key against `https://soporti.reveni.io/api/mcp` before touching anything: an invalid or revoked key registers nothing. Then it registers the connector by whichever route the environment allows:

1. **`claude` on the PATH** (Claude Code) — `claude mcp add`, at user scope.
2. **No binary, but a writable `~/.claude.json`** (SDK sessions, containers) — the entry is written with a real JSON parser, atomically, after backing the file up. Restart the session afterwards so it loads.
3. **Neither** (Cowork) — nothing is registered; you get the exact steps for **Customize → Connectors**, with the URL already validated.

If a server named `soporti` is already registered, the command asks before replacing it.

## What you get

| Tool           | What it does                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `ask_soporti`  | One question in, a synthesized answer with the consulted sources out. Long runs stream progress.      |
| `follow_up`    | Keep asking in the same thread, by the `conversationId` the answer ends with.                          |
| `list_sources` | The repos and integrations the key may consult, to restrict a question to some of them.                |
| `list_skills`  | The stored skills the assistant can apply.                                                             |

Threads opened this way show up in your Soporti sidebar, and every question is recorded on the `mcp` channel of `/admin` → **Stats**.

## Updates

Updates are governed by the `version` field of `.claude-plugin/plugin.json`, which moves independently of the Soporti application version. Pull them with the marketplace **Update** button, or with `/plugin update soporti@soporti`.

## Security

The package carries no credentials. The key is entered by each user at setup time and is never written into a file of this repository. The setup command never edits `~/.claude.json` textually — only through `node`, `python3` or `jq` — and backs the file up before writing.
