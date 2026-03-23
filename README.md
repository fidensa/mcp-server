# @fidensa/mcp-server

[![Fidensa Certified](https://fidensa.com/badges/fidensa-mcp-server.svg)](https://fidensa.com/certifications/fidensa-mcp-server)

MCP server for [Fidensa](https://fidensa.com) -- the independent AI capability certification authority.

Gives your AI agent structured access to Fidensa certification data through the Model Context Protocol. Check trust scores, search for certified alternatives, compare capabilities side-by-side, verify signed artifacts, and report runtime experience -- all through MCP tool calls.

Fidensa certifies MCP servers, skills, agent rules files, hooks, sub-agents, and plugins.

## Quick Start

```bash
npx @fidensa/mcp-server
```

Or install globally:

```bash
npm install -g @fidensa/mcp-server
fidensa-mcp-server
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FIDENSA_API_KEY` | No* | API key for full access. Get one free at [fidensa.com/docs/api](https://fidensa.com/docs/api) |
| `FIDENSA_BASE_URL` | No | Override API base URL (default: `https://fidensa.com`) |
| `FIDENSA_CONSUMER_ID` | No** | Consumer identity ID for experience reporting |
| `FIDENSA_CONSUMER_PRIVATE_KEY` | No** | ECDSA P-256 private key (JWK) for signing experience reports |

\* `check_certification` and `search_capabilities` work without an API key. Other tools require a free Registered-tier key.

\*\* Required only for `report_experience`. Register a consumer identity at [fidensa.com/docs/api](https://fidensa.com/docs/api) to get a keypair.

## Tools

| Tool | Auth | Description |
|------|------|-------------|
| `check_certification` | None | Quick trust check -- status, score, grade, tier |
| `search_capabilities` | None | Search for certified capabilities by keyword, type, tier, or score |
| `get_contract` | API key | Full certification contract with all evidence |
| `compare_capabilities` | API key | Side-by-side comparison of 2-5 capabilities |
| `verify_artifact` | API key | Verify cryptographic signatures on .cert.json artifacts |
| `report_experience` | Consumer identity | Submit signed runtime experience reports for certified capabilities |

## Agent Configuration

### Claude Code

Add to your Claude Code MCP settings:

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

### Cursor

Add to `.cursor/mcp.json`:

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

### Windsurf / VS Code

Add to your MCP configuration:

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
```

See the [Consuming AI Spec](https://fidensa.com/docs/api) for the full recommended system prompt fragment.

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
