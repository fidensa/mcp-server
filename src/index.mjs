#!/usr/bin/env node

/**
 * @fidensa/mcp-server — Fidensa AI certification authority MCP server.
 *
 * Provides consuming AI agents with structured access to Fidensa certification
 * data through the Model Context Protocol. Six tools for trust-aware tool selection.
 *
 * Configuration:
 *   FIDENSA_API_KEY   — API key for Registered+ tools (optional for check/search)
 *   FIDENSA_BASE_URL  — Override base URL (default: https://fidensa.com)
 *
 * Usage:
 *   npx @fidensa/mcp-server
 *   node src/index.mjs
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { ApiClient } from './lib/api-client.mjs';
import { handleCheckCertification } from './tools/check-certification.mjs';
import { handleGetContract } from './tools/get-contract.mjs';
import { handleSearchCapabilities } from './tools/search-capabilities.mjs';
import { handleCompareCapabilities } from './tools/compare-capabilities.mjs';
import { handleReportExperience } from './tools/report-experience.mjs';
import { handleVerifyArtifact } from './tools/verify-artifact.mjs';

// ── Server setup ─────────────────────────────────────────────────────

const server = new McpServer({
  name: 'fidensa',
  version: '0.2.0',
});

const client = new ApiClient();

// ── Tool registrations ───────────────────────────────────────────────

server.registerTool(
  'check_certification',
  {
    title: 'Check Fidensa Certification',
    description:
      'Quick trust check for an AI capability (MCP server, skill, plugin, or workflow). ' +
      'Returns certification status, trust score, grade, tier, and supply chain status. ' +
      'No API key required. Use this before invoking any capability to verify it has been ' +
      'independently certified by Fidensa.',
    inputSchema: {
      capability_id: z.string().describe('Capability identifier (e.g. "mcp-server-filesystem")'),
      version: z
        .string()
        .optional()
        .describe('Specific version to check (e.g. "1.0.0"). Omit for latest.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async ({ capability_id, version }) => {
    return handleCheckCertification({ capability_id, version }, client);
  },
);

server.registerTool(
  'get_contract',
  {
    title: 'Get Fidensa Certification Contract',
    description:
      'Retrieve the full certification contract for a capability, including identity, ' +
      'supply chain analysis, security scan results, adversarial testing findings, ' +
      'behavioral fingerprint, and trust score breakdown. Requires a free API key ' +
      '(set FIDENSA_API_KEY).',
    inputSchema: {
      capability_id: z.string().describe('Capability identifier'),
      version: z
        .string()
        .optional()
        .describe('Specific version (omit for latest)'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async ({ capability_id, version }) => {
    return handleGetContract({ capability_id, version }, client);
  },
);

server.registerTool(
  'search_capabilities',
  {
    title: 'Search Fidensa Certified Capabilities',
    description:
      'Search for certified AI capabilities by keyword or description. Use this to discover ' +
      'certified alternatives when a capability is uncertified or scores poorly. ' +
      'Supports filtering by type, tier, and minimum trust score. No API key required.',
    inputSchema: {
      query: z.string().describe('Search query (natural language or keywords)'),
      type: z
        .enum(['mcp_server', 'skill', 'workflow', 'plugin'])
        .optional()
        .describe('Filter by capability type'),
      tier: z
        .enum(['certified', 'verified', 'evaluated'])
        .optional()
        .describe('Filter by certification tier'),
      min_score: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe('Minimum trust score (0-100)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum number of results (default: 10)'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async ({ query, type, tier, min_score, limit }) => {
    return handleSearchCapabilities({ query, type, tier, min_score, limit }, client);
  },
);

server.registerTool(
  'compare_capabilities',
  {
    title: 'Compare Fidensa Certified Capabilities',
    description:
      'Side-by-side comparison of 2-5 certified capabilities. Shows trust scores, grades, ' +
      'tiers, and per-signal breakdowns to help choose between alternatives. ' +
      'Requires a free API key (set FIDENSA_API_KEY).',
    inputSchema: {
      capability_ids: z
        .array(z.string())
        .min(2)
        .max(5)
        .describe('Array of 2-5 capability IDs to compare'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async ({ capability_ids }) => {
    return handleCompareCapabilities({ capability_ids }, client);
  },
);

server.registerTool(
  'report_experience',
  {
    title: 'Report Experience with a Capability',
    description:
      'Submit a consumer experience report for a certified capability. ' +
      'Reports feed into the social proof signal of the trust score. ' +
      'Requires consumer identity (FIDENSA_CONSUMER_ID and FIDENSA_CONSUMER_PRIVATE_KEY).',
    inputSchema: {
      capability_id: z.string().describe('Capability identifier'),
      version: z
        .string()
        .optional()
        .describe('Capability version (e.g. "1.0.0"). Looked up automatically if omitted.'),
      outcome: z
        .enum(['success', 'failure', 'partial'])
        .describe('Overall outcome of using the capability'),
      environment: z
        .object({
          agent_platform: z.string().describe('Agent platform (e.g. "claude-code", "cursor")'),
          agent_version: z.string().optional().describe('Agent version'),
          os: z.string().optional().describe('Operating system'),
          runtime_version: z.string().optional().describe('Runtime version (e.g. "node-22.x")'),
        })
        .describe('Environment context'),
      details: z
        .object({
          tools_used: z.array(z.string()).optional().describe('Which tools were used'),
          failure_description: z.string().optional().describe('What went wrong'),
          unexpected_behavior: z.string().optional().describe('Unexpected behavior observed'),
        })
        .optional()
        .describe('Additional details'),
    },
  },
  async ({ capability_id, version, outcome, environment, details }) => {
    return handleReportExperience(
      { capability_id, version, outcome, environment, details },
      client,
    );
  },
);

server.registerTool(
  'verify_artifact',
  {
    title: 'Verify Fidensa Certification Artifact',
    description:
      'Verify the cryptographic signatures on a Fidensa certification artifact (.cert.json). ' +
      'Checks platform signature, publisher attestation, content hash, and expiry. ' +
      'Accepts base64-encoded content or a fidensa.com URL. ' +
      'Requires a free API key (set FIDENSA_API_KEY).',
    inputSchema: {
      content: z
        .string()
        .optional()
        .describe('Base64-encoded .cert.json artifact content'),
      url: z
        .string()
        .optional()
        .describe('fidensa.com URL to fetch the artifact from (restricted to fidensa.com domain)'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async ({ content, url }) => {
    return handleVerifyArtifact({ content, url }, client);
  },
);

// ── Start server ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr — stdout is reserved for MCP JSON-RPC
  console.error('[fidensa] MCP server started (stdio transport)');
  if (client.apiKey) {
    console.error('[fidensa] API key configured — all tools available');
  } else {
    console.error(
      '[fidensa] No FIDENSA_API_KEY set — check_certification and search_capabilities available. ' +
        'Set FIDENSA_API_KEY for full access.',
    );
  }
}

main().catch((err) => {
  console.error('[fidensa] Fatal error:', err);
  process.exit(1);
});
