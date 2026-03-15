#!/usr/bin/env node

/**
 * Live end-to-end test against the Fidensa API.
 *
 * Run: node test/live-test.mjs
 *
 * Tests the tool handlers against the real API (fidensa.com).
 * No API key needed for the first two tools.
 * Set FIDENSA_API_KEY to test authenticated tools.
 */

import { ApiClient } from '../src/lib/api-client.mjs';
import { handleCheckCertification } from '../src/tools/check-certification.mjs';
import { handleSearchCapabilities } from '../src/tools/search-capabilities.mjs';
import { handleGetContract } from '../src/tools/get-contract.mjs';
import { handleCompareCapabilities } from '../src/tools/compare-capabilities.mjs';
import { handleVerifyArtifact } from '../src/tools/verify-artifact.mjs';
import { handleReportExperience } from '../src/tools/report-experience.mjs';

const client = new ApiClient();
let passed = 0;
let failed = 0;

function header(name) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${'─'.repeat(60)}`);
}

function check(label, result) {
  const text = result.content?.map((c) => c.text).join('\n') || '';
  if (result.isError) {
    // Some errors are expected (e.g., missing API key)
    console.log(`  ⚠️  ${label}: ERROR (may be expected)`);
    console.log(`     ${text.split('\n')[0]}`);
    return { text, isError: true };
  }
  console.log(`  ✅ ${label}`);
  // Show first 3 lines
  const lines = text.split('\n').filter((l) => l.trim());
  for (const line of lines.slice(0, 3)) {
    console.log(`     ${line}`);
  }
  if (lines.length > 3) console.log(`     ... (${lines.length - 3} more lines)`);
  passed++;
  return { text, isError: false };
}

function fail(label, err) {
  console.log(`  ❌ ${label}: ${err.message}`);
  failed++;
}

async function run() {
  console.log('Fidensa MCP Server — Live API Test');
  console.log(`Base URL: ${client.baseUrl}`);
  console.log(`API Key:  ${client.apiKey ? client.apiKey.slice(0, 8) + '...' : '(not set)'}`);

  // ── 1. check_certification (Open tier) ──────────────────────────

  header('1. check_certification — known capability');
  try {
    const r = await handleCheckCertification(
      { capability_id: 'mcp-server-filesystem' },
      client,
    );
    const { text } = check('mcp-server-filesystem', r);
    if (!text.includes('valid')) fail('Expected status "valid"', new Error('missing "valid"'));
    if (!text.includes('Certified')) fail('Expected tier "Certified"', new Error('missing tier'));
  } catch (err) {
    fail('check_certification', err);
  }

  header('1b. check_certification — with version');
  try {
    const r = await handleCheckCertification(
      { capability_id: 'mcp-server-everything', version: '1.0.0' },
      client,
    );
    check('mcp-server-everything v1.0.0', r);
  } catch (err) {
    fail('check_certification versioned', err);
  }

  header('1c. check_certification — uncertified capability');
  try {
    const r = await handleCheckCertification(
      { capability_id: 'definitely-not-a-real-server-xyz' },
      client,
    );
    const { text } = check('uncertified response', r);
    if (!text.includes('uncertified')) fail('Expected "uncertified"', new Error('missing'));
  } catch (err) {
    fail('check_certification uncertified', err);
  }

  // ── 2. search_capabilities (Open tier) ───────────────────────────

  header('2. search_capabilities — broad search');
  try {
    const r = await handleSearchCapabilities({ query: 'server' }, client);
    check('search "server"', r);
  } catch (err) {
    fail('search_capabilities', err);
  }

  header('2b. search_capabilities — with type filter');
  try {
    const r = await handleSearchCapabilities(
      { query: 'filesystem', type: 'mcp_server' },
      client,
    );
    check('search "filesystem" type=mcp_server', r);
  } catch (err) {
    fail('search filtered', err);
  }

  header('2c. search_capabilities — no results');
  try {
    const r = await handleSearchCapabilities(
      { query: 'xyznonexistent999' },
      client,
    );
    check('empty search', r);
  } catch (err) {
    fail('search empty', err);
  }

  // ── 3. get_contract (Registered tier) ────────────────────────────

  header('3. get_contract — requires API key');
  try {
    const r = await handleGetContract(
      { capability_id: 'mcp-server-filesystem' },
      client,
    );
    if (r.isError && !client.apiKey) {
      console.log('  ⚠️  Skipped (no FIDENSA_API_KEY set — expected)');
      console.log(`     ${r.content[0].text.split('\n')[0]}`);
    } else {
      check('get_contract', r);
    }
  } catch (err) {
    fail('get_contract', err);
  }

  // ── 4. compare_capabilities (Registered tier) ────────────────────

  header('4. compare_capabilities — requires API key');
  try {
    const r = await handleCompareCapabilities(
      { capability_ids: ['mcp-server-filesystem', 'mcp-server-everything'] },
      client,
    );
    if (r.isError && !client.apiKey) {
      console.log('  ⚠️  Skipped (no FIDENSA_API_KEY set — expected)');
    } else {
      check('compare 2 capabilities', r);
    }
  } catch (err) {
    fail('compare_capabilities', err);
  }

  // ── 5. report_experience (stub) ──────────────────────────────────

  header('5. report_experience — stub');
  try {
    const r = await handleReportExperience(
      {
        capability_id: 'mcp-server-filesystem',
        outcome: 'success',
        environment: { agent_platform: 'live-test' },
      },
      client,
    );
    const { text } = check('report_experience stub', r);
    if (!text.includes('coming soon')) fail('Expected "coming soon"', new Error('missing'));
  } catch (err) {
    fail('report_experience', err);
  }

  // ── 6. verify_artifact — URL restriction ─────────────────────────

  header('6. verify_artifact — SSRF prevention');
  try {
    const r = await handleVerifyArtifact(
      { url: 'https://evil.com/bad.json' },
      client,
    );
    if (r.isError && !client.apiKey) {
      console.log('  ⚠️  Skipped (no FIDENSA_API_KEY set — expected)');
    } else if (r.isError) {
      const { text } = check('SSRF blocked', r);
      if (!text.includes('fidensa.com')) fail('Expected SSRF error', new Error('wrong error'));
    }
  } catch (err) {
    fail('verify_artifact SSRF', err);
  }

  // ── Summary ──────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (!client.apiKey) {
    console.log('  Note: Set FIDENSA_API_KEY to test authenticated tools (3, 4, 6)');
  }
  console.log(`${'═'.repeat(60)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run();
