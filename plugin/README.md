# Soporti plugin for Claude

Connects Claude to your [Soporti](https://github.com/reveni-io/soporti) MCP server, so any Claude session can ask Soporti to investigate across your repos and integrations and answer with the sources it consulted.

The plugin ships the connector and one command, `/soporti:setup`, which asks where your Soporti lives. There is no API key: you sign in through the browser with the account you already use.

## Install

The plugin lives in the Soporti repository, which doubles as its marketplace. Add the marketplace once, then install the plugin.

**Claude Code:**

```
/plugin marketplace add reveni-io/soporti
/plugin install soporti@soporti
```

**Cowork:** **Customize → Plugins → Add → Add marketplace**, with `https://github.com/reveni-io/soporti`. Then install **soporti** from the marketplace.

**Claude web (Chat) does not use plugins**, so this package does not apply there. On a Team or Enterprise plan an Owner adds the MCP endpoint once as a custom connector under **Organization settings → Connectors**, and every member presses Connect. The sign-in that follows is the same OAuth flow, so the identity and the guarantees below are identical.

## Point it at your Soporti

The connector reads its endpoint from `SOPORTI_MCP_URL`, so the package carries no address of anyone's server. Run:

```
/soporti:setup
```

and paste your Soporti's MCP endpoint — your Soporti's address followed by `/api/mcp`. Whoever set up Soporti in your company can tell you which one it is. The command checks that the URL really answers the OAuth challenge before storing anything, then writes it to `env.SOPORTI_MCP_URL` in `~/.claude/settings.json` (`%USERPROFILE%\.claude\settings.json` on Windows), merging into whatever is already there.

You can set that variable yourself instead, by any means your environment offers; the command is a convenience, not a requirement. Until it is set, the server shows up as `Failed to connect — Missing environment variables: SOPORTI_MCP_URL`.

## Connect

Ask Soporti anything. The first call comes back unauthenticated, Claude opens your browser, you sign in to Soporti and approve the connection on a consent screen. After that it stays connected on its own.

The token Claude receives is issued by Soporti for its own MCP endpoint and nothing else, is valid for fifteen minutes at a time, and is refreshed silently. You keep your identity: threads open under your name and your `/admin` stats stay yours.

Servers declared by a plugin are registered namespaced, as `plugin:soporti:soporti`, so this never collides with a `soporti` you added by hand.

## What you get

| Tool           | What it does                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `ask_soporti`  | One question in, a synthesized answer with the consulted sources out. Long runs stream progress. |
| `follow_up`    | Keep asking in the same thread, by the `conversationId` the answer ends with.                    |
| `list_sources` | The repos and integrations it may consult, to restrict a question to some of them.               |
| `list_skills`  | The stored skills the assistant can apply.                                                       |

Threads opened this way show up in your Soporti sidebar, and every question is recorded on the `mcp` channel of `/admin` → **Stats**.

## Requirements

Your Soporti must be recent enough to serve OAuth on `/api/mcp`, and must have `PUBLIC_URL` set to the origin that serves both the web app and `/api` — it is the OAuth issuer and the audience of every token. `/soporti:setup` tells you when the endpoint answers without the OAuth challenge, which is what an older or misconfigured server looks like.

## Updates

Updates are governed by the `version` field of `.claude-plugin/plugin.json`, which moves independently of the Soporti application version. Pull them with the marketplace **Update** button, or with `/plugin update soporti@soporti`.

## Security

The package carries no credentials and no address: it is a manifest, a connector that reads one environment variable, and a command that helps you set it. No key ever reaches the terminal — Soporti authenticates you in the browser and hands Claude a short-lived token bound to the MCP endpoint.

`/soporti:setup` never edits settings textually. It reads and writes `settings.json` through a real JSON parser, backs it up first, merges only the one key under `env`, and aborts without writing if the existing file does not parse.

Headless agents that never see a browser can still authenticate with a `sop_…` API key from **Settings → API keys**, registering the endpoint themselves with `claude mcp add … --header`. That path does not go through this plugin.
