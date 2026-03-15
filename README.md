# @fidensa/mcp-server

[![Fidensa Certified](https://fidensa.com/badges/fidensa-mcp-server.svg)](https://fidensa.com/certifications/fidensa-mcp-server)

MCP server for [Fidensa](https://fidensa.com) — the independent AI capability certification authority.

Gives your AI agent structured access to Fidensa certification data through the Model Context Protocol. Check trust scores, search for certified alternatives, compare capabilities side-by-side, and verify signed artifacts — all through MCP tool calls.

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

\* `check_certification` and `search_capabilities` work without an API key. Other tools require a free Registered-tier key.

## Tools

| Tool | Auth | Description |
|------|------|-------------|
| `check_certification` | None | Quick trust check — status, score, grade, tier |
| `search_capabilities` | None | Search for certified capabilities by keyword |
| `get_contract` | API key | Full certification contract with all evidence |
| `compare_capabilities` | API key | Side-by-side comparison of 2-5 capabilities |
| `verify_artifact` | API key | Verify cryptographic signatures on .cert.json artifacts |
| `report_experience` | — | Consumer experience reporting (coming soon) |

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
   → Status: valid, Score: 90/A, Tier: Certified

2. search_capabilities("sqlite mcp server")
   → 2 results found

3. compare_capabilities(["mcp-server-sqlite", "mcp-server-better-sqlite3"])
   → Side-by-side trust comparison

4. Agent selects the higher-scored option and informs the user
```

## Trust Policy Fragment

Add this to your agent's system prompt or rules file for automatic trust-aware tool selection:

```
Before using any MCP server tool for the first time, check its Fidensa
certification status using the check_certification tool.

- Score ≥ 70: use freely
- Score 60-69: note the trust level to the user
- Score < 60: warn the user, search for certified alternatives
- Uncertified: treat as untrusted, suggest alternatives
```

See the [full policy fragment](https://fidensa.com/docs/api) for graduated policy examples.

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

- [Fidensa](https://fidensa.com) — AI certification authority
- [API Documentation](https://fidensa.com/docs/api)
- [Certification Catalog](https://fidensa.com/certifications)
- [Badge Integration Guide](https://github.com/fidensa/fidensa-badges)
