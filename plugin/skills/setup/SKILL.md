---
name: setup
description: Connect this Claude session to the Soporti MCP server. Asks for a sop_ API key, validates it against https://soporti.reveni.io/api/mcp, and registers the connector — or hands back the manual steps when this environment cannot register it.
argument-hint: [sop_ API key]
---

# Connect Claude to Soporti

Register `https://soporti.reveni.io/api/mcp` as an MCP server in this environment, authenticated with the user's Soporti API key.

Follow the steps in order. Do not skip step 2: without a validated key, register nothing.

## Rules

- **Never print the API key back to the user** and never include it in your summary. Only ever pass it to the commands below.
- **Never write the key into a file inside the repository**, and never commit it.
- **Never edit `~/.claude.json` with `sed`, `awk` or any textual replacement.** That file holds `"mcpServers"` keys in many places (the root one plus one per project) and it stores live state, not just configuration: a bad textual match corrupts the user's whole Claude Code configuration and history. Only the JSON parsers in step 3 are allowed.

## 1. Get the API key

If the invocation already carried a `sop_…` key as an argument, use it. Otherwise ask the user for it and tell them where it comes from:

> Paste your Soporti API key (it starts with `sop_`). Create one in Soporti under **Settings → API keys** — the plaintext is shown only once, at creation.

If what they paste does not start with `sop_`, say so and ask again. Stop here until you have one.

## 2. Validate the key

Run the `initialize` call and keep the response headers:

```bash
curl -sS -D - -o /tmp/soporti-init.txt -w '\nHTTP %{http_code}\n' \
  -X POST https://soporti.reveni.io/api/mcp \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-07-28","capabilities":{},"clientInfo":{"name":"soporti-plugin-setup","version":"0.1.0"}}}'
```

Read the status code:

- **401** — the key is invalid or revoked. Tell the user exactly that, point them at **Settings → API keys** in Soporti to issue a new one, and **stop**. Register nothing.
- **429** — rate limited. Wait a few seconds and retry once.
- **curl exits non-zero, or any 5xx** — this is a network or availability problem, not a bad key. Say so, show the error, and **stop**. Register nothing.
- **200** — the key is valid. Continue.

Then list the tools, reusing the `mcp-session-id` response header if the `initialize` response carried one:

```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  -X POST https://soporti.reveni.io/api/mcp \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session id, only if one came back>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

The response is an SSE stream: the JSON-RPC payload is on the `data:` lines. Expect `ask_soporti`, `follow_up`, `list_sources` and `list_skills`. A scoped key still lists all four.

If this second call fails for a protocol or session reason while `initialize` returned 200, the key is still valid — say what happened and carry on with the registration.

## 3. Register the connector

Try these three routes in order and stop at the first that applies.

### Route 1 — the `claude` binary is on the PATH

```bash
command -v claude
```

If it resolves, this is the route: the CLI coordinates writing the config file itself.

First check whether a server named `soporti` is already registered:

```bash
claude mcp get soporti
```

If there is one, tell the user and **ask before replacing it**. On a yes:

```bash
claude mcp remove soporti --scope user
```

Then register it:

```bash
claude mcp add --transport http soporti https://soporti.reveni.io/api/mcp \
  --header "Authorization: Bearer <key>" --scope user
```

Confirm with `claude mcp list`.

### Route 2 — no binary, but `~/.claude.json` exists and is writable

```bash
test -w ~/.claude.json && echo writable
```

If it is not writable or does not exist, go to route 3.

Check whether the entry already exists, and **ask before replacing it** if it does:

```bash
node -e 'const c=require("fs").readFileSync(require("os").homedir()+"/.claude.json","utf8");console.log(JSON.stringify(Object.keys(JSON.parse(c).mcpServers||{})))'
```

Back the file up before touching it:

```bash
cp ~/.claude.json ~/.claude.json.soporti-backup
```

Then write the entry with a real JSON parser, trying these in order and moving on only when the tool is missing. Pass the key through the environment so it never lands in a file of this repo, and write to a temporary file that is renamed over the original, so an interrupted write cannot truncate the config:

**`node`:**

```bash
SOPORTI_KEY='<key>' node -e '
const fs = require("fs"), os = require("os")
const file = os.homedir() + "/.claude.json"
const config = JSON.parse(fs.readFileSync(file, "utf8"))
config.mcpServers = config.mcpServers || {}
config.mcpServers.soporti = {
  type: "http",
  url: "https://soporti.reveni.io/api/mcp",
  headers: { Authorization: "Bearer " + process.env.SOPORTI_KEY },
}
fs.writeFileSync(file + ".soporti-tmp", JSON.stringify(config, null, 2))
fs.renameSync(file + ".soporti-tmp", file)
'
```

**`python3`:**

```bash
SOPORTI_KEY='<key>' python3 -c '
import json, os, pathlib
file = pathlib.Path.home() / ".claude.json"
config = json.loads(file.read_text())
config.setdefault("mcpServers", {})["soporti"] = {
    "type": "http",
    "url": "https://soporti.reveni.io/api/mcp",
    "headers": {"Authorization": "Bearer " + os.environ["SOPORTI_KEY"]},
}
tmp = file.parent / (file.name + ".soporti-tmp")
tmp.write_text(json.dumps(config, indent=2))
tmp.replace(file)
'
```

**`jq`:**

```bash
jq --arg key '<key>' '.mcpServers.soporti = {
  "type": "http",
  "url": "https://soporti.reveni.io/api/mcp",
  "headers": { "Authorization": ("Bearer " + $key) }
}' ~/.claude.json > ~/.claude.json.soporti-tmp && mv ~/.claude.json.soporti-tmp ~/.claude.json
```

If the parser fails because the file is not valid JSON, **abort without writing**: report it and leave the file and the backup alone. If none of the three tools is available, go to route 3.

When the write succeeds, tell the user two things:

- **Restart the Claude session** so the new server is loaded.
- A session that is already running rewrites `~/.claude.json` as it goes, so it can overwrite the entry. If the server does not show up after restarting, run the command again with every other session closed. The pre-write copy is at `~/.claude.json.soporti-backup`.

### Route 3 — neither

Register nothing. The key is already validated, so hand the user the manual steps:

> Open **Customize → Connectors → Add connector**, pick an HTTP MCP server and fill in:
>
> - **Name**: `soporti`
> - **URL**: `https://soporti.reveni.io/api/mcp`
> - **Header**: `Authorization: Bearer <your sop_ key>`

If they already have a connector named `soporti`, tell them to edit that one instead of adding a second.

## 4. Confirm

Close by telling the user the connection is set up and listing what they get:

- `ask_soporti` — ask a question; Soporti investigates across the configured sources and answers with the sources it consulted.
- `follow_up` — keep asking in the same thread, by the `conversationId` the answer ends with.
- `list_sources` — the repos and integrations it may consult, to narrow a question down.
- `list_skills` — the stored skills it can apply.

Add the restart reminder if you took route 2, and the manual steps if you took route 3.
