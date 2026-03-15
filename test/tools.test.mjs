import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleCheckCertification } from '../src/tools/check-certification.mjs';
import { handleGetContract } from '../src/tools/get-contract.mjs';
import { handleSearchCapabilities } from '../src/tools/search-capabilities.mjs';
import { handleCompareCapabilities } from '../src/tools/compare-capabilities.mjs';
import { handleReportExperience } from '../src/tools/report-experience.mjs';
import { handleVerifyArtifact } from '../src/tools/verify-artifact.mjs';

// ── Helpers ──────────────────────────────────────────────────────────

/** Fake API client that returns canned responses. */
function fakeClient(responses = {}) {
  return {
    apiKey: responses._apiKey ?? null,
    baseUrl: 'https://fidensa.com',
    requireApiKey(toolName) {
      if (!this.apiKey) {
        throw new Error(
          `API key required for '${toolName}'. Set FIDENSA_API_KEY environment variable.`,
        );
      }
    },
    async get(path, _params) {
      if (responses[path]) return responses[path];
      // Try prefix matching
      for (const [k, v] of Object.entries(responses)) {
        if (path.startsWith(k)) return v;
      }
      const { FidensaApiError } = await import('../src/lib/api-client.mjs');
      throw new FidensaApiError(404, { error: 'not_found', message: 'Not found.' });
    },
    async post(path, _body) {
      if (responses[path]) return responses[path];
      const { FidensaApiError } = await import('../src/lib/api-client.mjs');
      throw new FidensaApiError(404, { error: 'not_found' });
    },
  };
}

function assertTextContent(result, substring) {
  assert.ok(result.content, 'result should have content');
  assert.ok(result.content.length > 0, 'content should not be empty');
  const text = result.content.map((c) => c.text).join('\n');
  assert.ok(text.includes(substring), `Expected text to include "${substring}", got: ${text}`);
}

function assertIsError(result) {
  assert.equal(result.isError, true);
}

// ── check_certification ──────────────────────────────────────────────

describe('check_certification', () => {
  it('returns certification status for a valid capability', async () => {
    const client = fakeClient({
      '/v1/attestation/mcp-server-filesystem': {
        schema_version: '1.0',
        capability_id: 'mcp-server-filesystem',
        version: '1.0.0',
        status: 'valid',
        tier: 'Certified',
        trust_score: 90,
        grade: 'A',
        maturity: 'Initial',
        max_achievable_score: 95,
        supply_chain_status: 'clean',
        type: 'mcp_server',
        record_url: 'https://fidensa.com/certifications/mcp-server-filesystem',
      },
    });

    const result = await handleCheckCertification(
      { capability_id: 'mcp-server-filesystem' },
      client,
    );
    assertTextContent(result, 'mcp-server-filesystem');
    assertTextContent(result, 'valid');
    assertTextContent(result, '90');
    assertTextContent(result, 'Certified');
  });

  it('returns certification for a specific version', async () => {
    const client = fakeClient({
      '/v1/attestation/mcp-server-filesystem/2.0.0': {
        capability_id: 'mcp-server-filesystem',
        version: '2.0.0',
        status: 'valid',
        tier: 'Verified',
        trust_score: 75,
        grade: 'C',
        maturity: 'Initial',
        type: 'mcp_server',
      },
    });

    const result = await handleCheckCertification(
      { capability_id: 'mcp-server-filesystem', version: '2.0.0' },
      client,
    );
    assertTextContent(result, '2.0.0');
    assertTextContent(result, 'Verified');
  });

  it('returns not_found for uncertified capability', async () => {
    const client = fakeClient({});
    const result = await handleCheckCertification(
      { capability_id: 'unknown-server' },
      client,
    );
    assertTextContent(result, 'uncertified');
  });

  it('returns error on non-404 API failure', async () => {
    const client = {
      apiKey: null,
      async get() {
        throw new Error('Network timeout');
      },
    };
    const result = await handleCheckCertification(
      { capability_id: 'test' },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'Network timeout');
  });
});

// ── get_contract ─────────────────────────────────────────────────────

describe('get_contract', () => {
  it('returns full contract data with all sections', async () => {
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/v1/contracts/mcp-server-filesystem': {
        capability_id: 'mcp-server-filesystem',
        version: '1.0.0',
        status: 'valid',
        trust_score: 90,
        grade: 'A',
        tier: 'Certified',
        maturity: 'Initial',
        certified_at: '2026-03-14T00:00:00Z',
        expires_at: '2027-03-14T00:00:00Z',
        record_url: 'https://fidensa.com/certifications/mcp-server-filesystem',
        contract: {
          identity: {
            name: '@modelcontextprotocol/server-filesystem',
            publisher: 'Anthropic',
            description: 'Filesystem access via MCP',
          },
          supply_chain: {
            total_components: 45,
            vulnerability_counts: { critical: 0, high: 1, medium: 3, low: 2 },
          },
          security: {
            scan_results: { summary: { total: 2 } },
            adversarial_results: { total_findings: 3 },
          },
          behavioral_fingerprint: {
            tools: {
              read_file: {
                timing_ms: { p50: 12, p95: 45 },
                error_rate: 0.02,
              },
              write_file: {
                timing_ms: { p50: 8, p95: 30 },
                error_rate: 0.01,
              },
            },
          },
        },
      },
    });

    const result = await handleGetContract(
      { capability_id: 'mcp-server-filesystem' },
      client,
    );
    // Identity
    assertTextContent(result, 'Anthropic');
    assertTextContent(result, 'Filesystem access via MCP');
    // Supply chain
    assertTextContent(result, '45');
    assertTextContent(result, 'critical');
    // Security
    assertTextContent(result, 'Adversarial findings: 3');
    // Fingerprint
    assertTextContent(result, 'read_file');
    assertTextContent(result, 'p50=12');
    assertTextContent(result, 'write_file');
  });

  it('returns error when API key is missing', async () => {
    const client = fakeClient({});
    const result = await handleGetContract(
      { capability_id: 'mcp-server-filesystem' },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'API key required');
  });

  it('returns error for not-found capability', async () => {
    const client = fakeClient({ _apiKey: 'fid_test' });
    const result = await handleGetContract(
      { capability_id: 'nonexistent' },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'nonexistent');
  });

  it('handles contract with minimal data gracefully', async () => {
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/v1/contracts/minimal': {
        capability_id: 'minimal',
        version: '0.1.0',
        status: 'valid',
        trust_score: 55,
        grade: 'E',
        tier: 'Evaluated',
        contract: {},
      },
    });

    const result = await handleGetContract({ capability_id: 'minimal' }, client);
    assertTextContent(result, 'minimal');
    assertTextContent(result, '55');
    // Should not crash on missing sections
    assert.ok(!result.isError);
  });

  it('passes version through', async () => {
    let capturedPath;
    const client = {
      apiKey: 'fid_test',
      requireApiKey() {},
      async get(path) {
        capturedPath = path;
        return {
          capability_id: 'test',
          version: '2.0.0',
          status: 'valid',
          trust_score: 80,
          grade: 'B',
          tier: 'Certified',
          contract: {},
        };
      },
    };

    await handleGetContract({ capability_id: 'test', version: '2.0.0' }, client);
    assert.ok(capturedPath.includes('2.0.0'));
  });
});

// ── search_capabilities ──────────────────────────────────────────────

describe('search_capabilities', () => {
  it('returns search results with publisher info', async () => {
    const client = fakeClient({
      '/v1/search': {
        query: 'filesystem',
        total: 1,
        results: [
          {
            capability_id: 'mcp-server-filesystem',
            type: 'mcp_server',
            trust_score: 90,
            grade: 'A',
            tier: 'Certified',
            status: 'valid',
            publisher: 'Anthropic',
            record_url: 'https://fidensa.com/certifications/mcp-server-filesystem',
          },
        ],
      },
    });

    const result = await handleSearchCapabilities({ query: 'filesystem' }, client);
    assertTextContent(result, 'mcp-server-filesystem');
    assertTextContent(result, '1');
    assertTextContent(result, 'Anthropic');
  });

  it('returns empty results gracefully', async () => {
    const client = fakeClient({
      '/v1/search': { query: 'nonexistent', total: 0, results: [] },
    });

    const result = await handleSearchCapabilities({ query: 'nonexistent' }, client);
    assertTextContent(result, '0');
  });

  it('passes filters through', async () => {
    let capturedParams;
    const client = {
      apiKey: null,
      async get(_path, params) {
        capturedParams = params;
        return { query: 'test', total: 0, results: [] };
      },
    };

    await handleSearchCapabilities(
      { query: 'test', type: 'mcp_server', min_score: 70, tier: 'Certified' },
      client,
    );
    assert.equal(capturedParams.type, 'mcp_server');
    assert.equal(capturedParams.min_score, 70);
    assert.equal(capturedParams.tier, 'Certified');
  });

  it('handles API error gracefully', async () => {
    const client = {
      apiKey: null,
      async get() {
        throw new Error('Search API unavailable');
      },
    };

    const result = await handleSearchCapabilities({ query: 'test' }, client);
    assertIsError(result);
    assertTextContent(result, 'Search failed');
  });
});

// ── compare_capabilities ─────────────────────────────────────────────

describe('compare_capabilities', () => {
  it('returns comparison of multiple capabilities', async () => {
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/v1/contracts/cap-a/score': {
        capability_id: 'cap-a',
        trust_score: 91,
        grade: 'A',
        tier: 'Certified',
        maturity: 'Initial',
        signals: [{ signal: 'supply_chain', score: 0.95 }],
      },
      '/v1/contracts/cap-b/score': {
        capability_id: 'cap-b',
        trust_score: 72,
        grade: 'C',
        tier: 'Verified',
        maturity: 'Initial',
        signals: [{ signal: 'supply_chain', score: 0.6 }],
      },
    });

    const result = await handleCompareCapabilities(
      { capability_ids: ['cap-a', 'cap-b'] },
      client,
    );
    assertTextContent(result, 'cap-a');
    assertTextContent(result, 'cap-b');
    assertTextContent(result, '91');
    assertTextContent(result, '72');
    assertTextContent(result, 'Highest scored');
  });

  it('errors when fewer than 2 capabilities provided', async () => {
    const client = fakeClient({ _apiKey: 'fid_test' });
    const result = await handleCompareCapabilities(
      { capability_ids: ['cap-a'] },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'at least 2');
  });

  it('errors when more than 5 capabilities provided', async () => {
    const client = fakeClient({ _apiKey: 'fid_test' });
    const result = await handleCompareCapabilities(
      { capability_ids: ['a', 'b', 'c', 'd', 'e', 'f'] },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'at most 5');
  });

  it('errors when API key is missing', async () => {
    const client = fakeClient({});
    const result = await handleCompareCapabilities(
      { capability_ids: ['cap-a', 'cap-b'] },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'API key required');
  });

  it('handles partial failures gracefully', async () => {
    const client = {
      apiKey: 'fid_test',
      requireApiKey() {},
      async get(path) {
        if (path.includes('cap-a')) {
          return {
            capability_id: 'cap-a',
            trust_score: 91,
            grade: 'A',
            tier: 'Certified',
            signals: [],
          };
        }
        const { FidensaApiError } = await import('../src/lib/api-client.mjs');
        throw new FidensaApiError(404, { error: 'not_found' });
      },
    };

    const result = await handleCompareCapabilities(
      { capability_ids: ['cap-a', 'cap-missing'] },
      client,
    );
    assertTextContent(result, 'cap-a');
    assertTextContent(result, 'cap-missing');
    assertTextContent(result, 'not found');
  });
});

// ── report_experience ────────────────────────────────────────────────

describe('report_experience', () => {
  it('returns coming-soon message', async () => {
    const client = fakeClient({});
    const result = await handleReportExperience(
      {
        capability_id: 'mcp-server-filesystem',
        outcome: 'success',
        environment: { agent_platform: 'claude-code' },
      },
      client,
    );
    assertTextContent(result, 'coming soon');
    assertTextContent(result, 'mcp-server-filesystem');
    assertTextContent(result, 'success');
  });
});

// ── verify_artifact ──────────────────────────────────────────────────

describe('verify_artifact', () => {
  it('errors when API key is missing', async () => {
    const client = fakeClient({});
    const result = await handleVerifyArtifact(
      { content: btoa('{}') },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'API key required');
  });

  it('rejects non-fidensa.com URLs', async () => {
    const client = fakeClient({ _apiKey: 'fid_test' });
    const result = await handleVerifyArtifact(
      { url: 'https://evil.com/malicious.cert.json' },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'fidensa.com');
  });

  it('errors when neither content nor url provided', async () => {
    const client = fakeClient({ _apiKey: 'fid_test' });
    const result = await handleVerifyArtifact({}, client);
    assertIsError(result);
    assertTextContent(result, 'Provide either');
  });

  it('errors on invalid base64', async () => {
    const client = fakeClient({ _apiKey: 'fid_test' });
    const result = await handleVerifyArtifact(
      { content: '!!!not-valid-base64!!!' },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'base64');
  });

  it('errors on non-JSON content', async () => {
    const client = fakeClient({ _apiKey: 'fid_test' });
    const result = await handleVerifyArtifact(
      { content: btoa('this is not json') },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'not valid JSON');
  });

  it('errors on JSON without JWS structure', async () => {
    const client = fakeClient({ _apiKey: 'fid_test' });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify({ foo: 'bar' })) },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'JWS JSON Serialization');
  });

  it('accepts valid fidensa.com URLs', async () => {
    const client = fakeClient({ _apiKey: 'fid_test' });
    // URL accepted but will fail at fetch — that's OK, we're testing URL validation passes
    const result = await handleVerifyArtifact(
      { url: 'https://fidensa.com/artifacts/test.cert.json' },
      client,
    );
    // Should NOT get the domain restriction error
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(!text.includes('must be on the fidensa.com'));
  });

  it('accepts valid fidensa.dev URLs', async () => {
    const client = fakeClient({ _apiKey: 'fid_test' });
    const result = await handleVerifyArtifact(
      { url: 'https://fidensa.dev/artifacts/test.cert.json' },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(!text.includes('must be on the fidensa.com'));
  });
});
