---
name: setup
description: Point this Claude session at your Soporti server. Asks for the MCP endpoint URL, checks that it answers the OAuth challenge, and stores it as SOPORTI_MCP_URL so the plugin's connector resolves. Sign-in happens in the browser afterwards, with no API key.
argument-hint: [Soporti MCP endpoint URL]
---

# Point Claude at your Soporti

The plugin ships the connector already. What it does not ship is **where your Soporti lives**: `.mcp.json` reads the endpoint from `${SOPORTI_MCP_URL}`, so this command's whole job is to put that one value in the user's settings.

Follow the steps in order. Do not skip step 2: an unvalidated URL stores a connector that fails later, far from the cause.

## Rules

- **Never edit `~/.claude/settings.json` with `sed`, `awk` or any textual replacement.** It holds the user's permissions, hooks, model and marketplaces. A bad textual match corrupts their whole configuration. Only the JSON parsers in step 3 are allowed.
- **Merge, never overwrite.** Read the file, add one key under `env`, write the whole object back. Everything else stays exactly as it was.
- **Do not put the URL anywhere else** — not in a repository file, not in a shell profile you edit for them.

## 1. Get the URL

If the invocation carried a URL as an argument, use it. Otherwise ask:

> What is your Soporti MCP endpoint? It is your Soporti's address followed by `/api/mcp` — whoever set up Soporti in your company can tell you. It looks like `https://soporti.your-company.com/api/mcp`.

Reject anything that is not `https://` and does not end in `/api/mcp`, say why, and ask again. Stop here until you have one.

## 2. Check that it is a Soporti with OAuth

An unauthenticated POST must come back `401` carrying a `WWW-Authenticate` header that names the metadata document:

```bash
curl -sS -o /dev/null -D - -X POST "<url>" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -iE '^(HTTP/|www-authenticate)'
```

- **401 with `www-authenticate: Bearer resource_metadata="…"`** — this is the one. Continue.
- **401 without that header** — the server is older than OAuth support. Tell the user it needs upgrading, and that until then they authenticate with a `sop_` API key instead of this plugin. Store nothing.
- **200, or HTML, or anything else** — the URL is wrong, or it is not the MCP endpoint. Say what came back and go back to step 1.

A `403` or a redirect to an SSO login means a proxy is in front of the endpoint and is not letting a non-browser client through. Report that: it is an infrastructure fix on their side, not something to work around here.

## 3. Store it

Pick the first parser that resolves, and use it for both reading and writing:

```bash
command -v node; command -v python3; command -v jq
```

Back the file up first — it may not exist yet, which is fine:

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak 2>/dev/null || true
```

Read it before writing. If it exists and does not parse, **abort without writing**, report it, and leave the file alone.

If `env.SOPORTI_MCP_URL` is already set to a different URL, show both and **ask before replacing it**.

Run only the one line for the parser you picked. Each creates the file when missing, merges into `env`, and leaves every other key untouched:

```bash
node -e 'const f=require("os").homedir()+"/.claude/settings.json",fs=require("fs");const s=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):{};(s.env??={}).SOPORTI_MCP_URL=process.argv[1];fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n")' "<url>"
```

```bash
python3 -c 'import json,os,sys;f=os.path.expanduser("~/.claude/settings.json");s=json.load(open(f)) if os.path.exists(f) else {};s.setdefault("env",{})["SOPORTI_MCP_URL"]=sys.argv[1];json.dump(s,open(f,"w"),indent=2)' "<url>"
```

```bash
jq --arg u "<url>" '.env.SOPORTI_MCP_URL = $u' ~/.claude/settings.json > ~/.claude/settings.json.tmp && mv ~/.claude/settings.json.tmp ~/.claude/settings.json
```

## 4. Confirm

```bash
claude mcp list
```

The connector resolves once the value is in place:

```
plugin:soporti:soporti: https://…/api/mcp (HTTP) - ! Needs authentication
```

`Needs authentication` is the success state here, not an error: it means Claude found the OAuth challenge and will open the browser on the first call. If instead you see `Missing environment variables: SOPORTI_MCP_URL`, the write did not land — check the file parses and try the other parser.

If `claude` is not on the PATH, skip this step and tell the user to restart their Claude session so the new setting is read.

Then tell them what happens next:

> Ask Soporti anything. The first question opens your browser: sign in to Soporti and approve the connection once. After that it stays connected on its own — there is no API key to manage.
