# @fidensa/mcp-server

[![Fidensa Certified](https://fidensa.com/badges/fidensa-mcp-server.svg)](https://fidensa.com/certifications/fidensa-mcp-server)

MCP server for [Fidensa](https://fidensa.com) -- the independent AI capability certification authority.

Gives your AI agent structured access to Fidensa certification data through the Model Context Protocol. Check trust scores, search for certified alternatives, compare capabilities side-by-side, verify signed artifacts, check file integrity, and report runtime experience -- all through MCP tool calls.

Fidensa certifies MCP servers, skills, agent rules files, hooks, sub-agents, and plugins.

## Getting Started

### 1. Install

```bash
npm install -g @fidensa/mcp-server
```

### 2. Verify it works

Several tools work without an API key (`check_certification`, `search_capabilities`, `verify_file`, and `report_experience`). Start the server and confirm it connects to the production API:

```bash
fidensa-mcp-server
```

You should see:

```
[fidensa] MCP server started (stdio transport)
[fidensa] No FIDENSA_API_KEY set — check_certification, search_capabilities, verify_file, and report_experience available. Set FIDENSA_API_KEY for full access.
```

Press Ctrl+C to stop.

### 3. Get an API key (optional, free)

The remaining tools (`get_contract`, `compare_capabilities`, `verify_artifact`) require a free API key. An API key also gives `report_experience` higher rate limits. Register one:

```bash
curl -X POST https://fidensa.com/v1/keys \
  -H "Content-Type: application/json" \
  -d '{"display_name": "My Agent", "email": "you@example.com"}'
```

Or in PowerShell:

```powershell
Invoke-RestMethod -Uri "https://fidensa.com/v1/keys" -Method Post -ContentType "application/json" -Body '{"display_name": "My Agent", "email": "you@example.com"}'
```

The response contains your API key (prefixed `fid_`). Store it securely -- it is shown only once.

### 4. Add to your agent

Pick your platform and add the MCP server configuration:

**Claude Desktop / Claude Code**

```json
{
  "mcpServers": {
    "fidensa": {
      "command": "npx",
      "args": ["@fidensa/mcp-server"],
      "env": {
        "FIDENSA_API_KEY": "fid_your_key_here"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "fidensa": {
      "command": "npx",
      "args": ["@fidensa/mcp-server"],
      "env": {
        "FIDENSA_API_KEY": "fid_your_key_here"
      }
    }
  }
}
```

**Windsurf / VS Code**

```json
{
  "servers": {
    "fidensa": {
      "type": "stdio",
      "command": "npx",
      "args": ["@fidensa/mcp-server"],
      "env": {
        "FIDENSA_API_KEY": "fid_your_key_here"
      }
    }
  }
}
```

Omit the `FIDENSA_API_KEY` line if you only need the open-tier tools.

> **Claude Desktop tip:** Access the config file via Settings → Developer → Edit Config. After saving, fully quit and reopen Claude Desktop (right-click the system tray icon and select Quit — just closing the window isn't enough).

## Tools

| Tool | Auth | Description |
|------|------|-------------|
| `check_certification` | None | Quick trust check -- status, score, grade, tier |
| `search_capabilities` | None | Search for certified capabilities by keyword, type, tier, or score |
| `verify_file` | None | Quick file integrity check -- hash a capability file and verify it matches what Fidensa certified |
| `report_experience` | None (API key for higher rate limits) | Submit runtime experience reports for certified capabilities |
| `get_contract` | API key | Full certification contract with all evidence |
| `compare_capabilities` | API key | Side-by-side comparison of 2-5 capabilities |
| `verify_artifact` | API key | Verify cryptographic signatures on .cert.json artifacts, with optional file and code integrity checks |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FIDENSA_API_KEY` | No | API key for full access (see [Getting Started](#3-get-an-api-key-optional-free)) |
| `FIDENSA_BASE_URL` | No | Override API base URL (default: `https://fidensa.com`) |

`check_certification`, `search_capabilities`, `verify_file`, and `report_experience` work without any configuration. The remaining tools require `FIDENSA_API_KEY`.

## Example Agent Workflow

```
User: "Set up a filesystem watcher that writes logs to SQLite."

Agent:
1. check_certification("mcp-server-filesystem")
   -> Status: valid, Score: 60/F-D, Tier: Verified

2. search_capabilities("sqlite mcp server")
   -> 2 results found

3. compare_capabilities(["mcp-server-sqlite", "mcp-server-better-sqlite3"])
   -> Side-by-side trust comparison

4. Agent selects the higher-scored option and informs the user

5. report_experience(
     capability_id: "mcp-server-filesystem",
     content_hash: "abc123...",  // from the .cert.json
     outcome: "success"
   )
   -> Confirmation rate updated
```

## Trust Policy Fragments

Add one of these to your agent's system prompt or rules file for trust-aware tool selection. Three levels of granularity -- pick the one that fits your needs.

### Tier-based (simplest)

Uses the certification tier alone. No numbers to tune.

```
Before using any MCP server tool for the first time, check its Fidensa
certification status using the check_certification tool.

- Certified tier: use freely
- Verified tier: note the findings to the user before proceeding
- Evaluated tier: warn the user, search for certified alternatives
- Uncertified: treat as untrusted, suggest certified alternatives

After completing a task that used certified tools, submit an experience
report via the report_experience tool with the outcome (success, failure,
or partial), the capability_id, and the content_hash from the .cert.json.
```

### Score-based (grade-aligned)

Uses the trust score, aligned with Fidensa's grade definitions.

```
Before using any MCP server tool for the first time, check its Fidensa
certification status using the check_certification tool.

- Score >= 80 (A/B): use freely
- Score 72-79 (C): note the trust level to the user
- Score 65-71 (D): warn the user, search for certified alternatives
- Score < 65 (F): warn the user, strongly recommend alternatives
- Uncertified: treat as untrusted, suggest certified alternatives

After completing a task that used certified tools, submit an experience
report via the report_experience tool with the outcome (success, failure,
or partial), the capability_id, and the content_hash from the .cert.json.
```

### Combined (tier + score)

The most precise option -- distinguishes between a Certified capability with
a moderate score and a Verified capability with findings that blocked
Certified tier.

```
Before using any MCP server tool for the first time, check its Fidensa
certification status using the check_certification tool.

- Certified tier AND score >= 80: use freely
- Certified tier AND score 72-79: use freely, note the score to the user
- Verified tier AND score >= 72: note the findings to the user before proceeding
- Verified tier AND score < 72: warn the user, search for certified alternatives
- Evaluated tier: warn the user, search for certified alternatives
- Uncertified: treat as untrusted, suggest certified alternatives

For any tool with status "suspended" or "revoked": do not use.
Search for certified alternatives and present them to the user.

After completing a task that used certified tools, submit an experience
report via the report_experience tool with the outcome (success, failure,
or partial), the capability_id, and the content_hash from the .cert.json.
```

See the [API Documentation](https://fidensa.com/docs/api) for the full specification.

## Development

```bash
npm install
npm test          # Run tests with coverage
npm run lint      # ESLint
npm run format    # Prettier
```

## License

MIT

## Links

- [Fidensa](https://fidensa.com) -- AI certification authority
- [API Documentation](https://fidensa.com/docs/api)
- [Certification Catalog](https://fidensa.com/certifications)
- [Badge Integration Guide](https://github.com/fidensa/fidensa-badges)
