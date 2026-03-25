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
            publisher: { name: 'Anthropic', verified: false },
            type: 'mcp_server',
            source: 'https://github.com/modelcontextprotocol/servers',
            license: 'MIT',
          },
          supply_chain: {
            sbom: {
              component_count: 45,
              direct_dependencies: 12,
              transitive_dependencies: 33,
              vulnerability_summary: { critical: 0, high: 1, medium: 3, low: 2, total: 6 },
            },
          },
          provenance: {
            license_present: true,
            security_md_present: true,
            readme_present: true,
            readme_empty: false,
            namespace_match: true,
            contributor_count: 5,
            repo_age_days: 180,
          },
          trust: {
            behavioral_fingerprint: {
              fingerprint_version: '1.0',
              signals: {
                response_time_ms: { p50: 5, p95: 20, p99: 45 },
                error_rate: 0.02,
                resource_profile: { peak_memory_mb: 72.38, avg_cpu_percent: 0.03 },
                per_tool: {
                  read_file: { p50_ms: 12, p95_ms: 45, error_rate: 0.02, sample_count: 97 },
                  write_file: { p50_ms: 8, p95_ms: 30, error_rate: 0.01, sample_count: 50 },
                },
              },
            },
          },
          mcp_server: {
            interface: {
              tools: [
                { name: 'read_file', description: 'Read a file from the filesystem' },
                { name: 'write_file', description: 'Write content to a file' },
              ],
            },
            security: {
              permissions_required: ['filesystem:read', 'filesystem:write'],
              scan_results: {
                cisco_mcp_scanner: {
                  status: 'SAFE',
                  findings_summary: { critical: 0, high: 0, medium: 0, low: 0 },
                },
              },
              adversarial_testing: {
                categories_tested: ['prompt_injection_chains', 'privilege_escalation', 'data_exfiltration_side_channels'],
                findings: [
                  { category: 'privilege_escalation', severity: 'critical', classification: 'block', description: 'Path traversal beyond allowed directories' },
                  { category: 'data_exfiltration_side_channels', severity: 'medium', classification: 'warn', description: 'Timing side channel on file existence' },
                ],
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
    assertTextContent(result, 'mcp_server');
    // Supply chain
    assertTextContent(result, '45');
    assertTextContent(result, 'critical');
    // Security + adversarial
    assertTextContent(result, 'cisco_mcp_scanner');
    assertTextContent(result, 'Findings: 2');
    assertTextContent(result, 'BLOCK');
    assertTextContent(result, 'Path traversal');
    // Fingerprint
    assertTextContent(result, 'read_file');
    assertTextContent(result, 'p50=12');
    assertTextContent(result, 'write_file');
    // Provenance
    assertTextContent(result, 'namespace verified');
    assertTextContent(result, 'Contributors: 5');
    // Interface
    assertTextContent(result, 'Tools: 2');
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
  it('returns credential setup instructions when no consumer identity configured', async () => {
    // Clear env vars to simulate missing identity
    const savedId = process.env.FIDENSA_CONSUMER_ID;
    const savedKey = process.env.FIDENSA_CONSUMER_PRIVATE_KEY;
    delete process.env.FIDENSA_CONSUMER_ID;
    delete process.env.FIDENSA_CONSUMER_PRIVATE_KEY;

    const client = fakeClient({});
    const result = await handleReportExperience(
      {
        capability_id: 'mcp-server-filesystem',
        outcome: 'success',
        environment: { agent_platform: 'claude-code' },
      },
      client,
    );
    assertTextContent(result, 'Consumer Identity Required');
    assertTextContent(result, 'mcp-server-filesystem');
    assertTextContent(result, 'success');

    // Restore
    if (savedId) process.env.FIDENSA_CONSUMER_ID = savedId;
    if (savedKey) process.env.FIDENSA_CONSUMER_PRIVATE_KEY = savedKey;
  });

  it('submits a signed report when consumer identity is configured', async () => {
    // Generate a real ES256 keypair for testing via Web Crypto
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    const savedId = process.env.FIDENSA_CONSUMER_ID;
    const savedKey = process.env.FIDENSA_CONSUMER_PRIVATE_KEY;
    process.env.FIDENSA_CONSUMER_ID = 'con-test1234';
    process.env.FIDENSA_CONSUMER_PRIVATE_KEY = JSON.stringify(privateJwk);

    let capturedBody;
    const client = {
      apiKey: null,
      async get(path) {
        // Attestation lookup for version
        if (path.startsWith('/v1/attestation/')) {
          return { capability_id: 'mcp-server-filesystem', version: '1.0.0', status: 'valid' };
        }
        throw new Error('Unexpected GET: ' + path);
      },
      async post(path, body) {
        capturedBody = body;
        return {
          accepted: true,
          report_id: 'rpt-abc123',
          capability_id: 'mcp-server-filesystem',
          current_confirmation_rate: 0.95,
        };
      },
    };

    const result = await handleReportExperience(
      {
        capability_id: 'mcp-server-filesystem',
        outcome: 'success',
        environment: { agent_platform: 'claude-code' },
      },
      client,
    );

    // Should succeed
    assertTextContent(result, 'Report Accepted');
    assertTextContent(result, 'mcp-server-filesystem');

    // Verify the posted body has required fields
    assert.equal(capturedBody.capability_id, 'mcp-server-filesystem');
    assert.equal(capturedBody.capability_version, '1.0.0');
    assert.equal(capturedBody.outcome, 'success');
    assert.equal(capturedBody.consumer_id, 'con-test1234');
    assert.ok(capturedBody.timestamp, 'Should have a timestamp');
    assert.ok(capturedBody.signature, 'Should have a JWS signature');
    // JWS Compact has 3 dot-separated parts
    assert.equal(capturedBody.signature.split('.').length, 3, 'Signature should be JWS Compact');

    // Restore
    if (savedId) process.env.FIDENSA_CONSUMER_ID = savedId;
    else delete process.env.FIDENSA_CONSUMER_ID;
    if (savedKey) process.env.FIDENSA_CONSUMER_PRIVATE_KEY = savedKey;
    else delete process.env.FIDENSA_CONSUMER_PRIVATE_KEY;
  });

  it('uses explicit version when provided instead of looking up', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    const savedId = process.env.FIDENSA_CONSUMER_ID;
    const savedKey = process.env.FIDENSA_CONSUMER_PRIVATE_KEY;
    process.env.FIDENSA_CONSUMER_ID = 'con-test1234';
    process.env.FIDENSA_CONSUMER_PRIVATE_KEY = JSON.stringify(privateJwk);

    let getWasCalled = false;
    let capturedBody;
    const client = {
      apiKey: null,
      async get() {
        getWasCalled = true;
        return { capability_id: 'test', version: '9.9.9', status: 'valid' };
      },
      async post(_path, body) {
        capturedBody = body;
        return { accepted: true, report_id: 'rpt-x', capability_id: 'test', current_confirmation_rate: null };
      },
    };

    await handleReportExperience(
      {
        capability_id: 'test',
        version: '2.0.0',
        outcome: 'failure',
        environment: { agent_platform: 'cursor' },
      },
      client,
    );

    assert.equal(capturedBody.capability_version, '2.0.0');
    assert.equal(getWasCalled, false, 'Should not call attestation API when version is explicit');

    if (savedId) process.env.FIDENSA_CONSUMER_ID = savedId;
    else delete process.env.FIDENSA_CONSUMER_ID;
    if (savedKey) process.env.FIDENSA_CONSUMER_PRIVATE_KEY = savedKey;
    else delete process.env.FIDENSA_CONSUMER_PRIVATE_KEY;
  });

  it('handles API error from report submission gracefully', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    const savedId = process.env.FIDENSA_CONSUMER_ID;
    const savedKey = process.env.FIDENSA_CONSUMER_PRIVATE_KEY;
    process.env.FIDENSA_CONSUMER_ID = 'con-test1234';
    process.env.FIDENSA_CONSUMER_PRIVATE_KEY = JSON.stringify(privateJwk);

    const client = {
      apiKey: null,
      async get() {
        return { capability_id: 'test', version: '1.0.0', status: 'valid' };
      },
      async post() {
        const { FidensaApiError } = await import('../src/lib/api-client.mjs');
        throw new FidensaApiError(429, { error: 'Rate limit exceeded' });
      },
    };

    const result = await handleReportExperience(
      {
        capability_id: 'test',
        outcome: 'success',
        environment: { agent_platform: 'claude-code' },
      },
      client,
    );

    assertIsError(result);
    assertTextContent(result, 'Rate limit exceeded');

    if (savedId) process.env.FIDENSA_CONSUMER_ID = savedId;
    else delete process.env.FIDENSA_CONSUMER_ID;
    if (savedKey) process.env.FIDENSA_CONSUMER_PRIVATE_KEY = savedKey;
    else delete process.env.FIDENSA_CONSUMER_PRIVATE_KEY;
  });

  it('handles version lookup failure gracefully', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    const savedId = process.env.FIDENSA_CONSUMER_ID;
    const savedKey = process.env.FIDENSA_CONSUMER_PRIVATE_KEY;
    process.env.FIDENSA_CONSUMER_ID = 'con-test1234';
    process.env.FIDENSA_CONSUMER_PRIVATE_KEY = JSON.stringify(privateJwk);

    const client = {
      apiKey: null,
      async get() {
        const { FidensaApiError } = await import('../src/lib/api-client.mjs');
        throw new FidensaApiError(404, { error: 'not_found' });
      },
      async post() {
        throw new Error('Should not reach POST');
      },
    };

    const result = await handleReportExperience(
      {
        capability_id: 'nonexistent',
        outcome: 'success',
        environment: { agent_platform: 'claude-code' },
      },
      client,
    );

    assertIsError(result);
    assertTextContent(result, 'nonexistent');

    if (savedId) process.env.FIDENSA_CONSUMER_ID = savedId;
    else delete process.env.FIDENSA_CONSUMER_ID;
    if (savedKey) process.env.FIDENSA_CONSUMER_PRIVATE_KEY = savedKey;
    else delete process.env.FIDENSA_CONSUMER_PRIVATE_KEY;
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
