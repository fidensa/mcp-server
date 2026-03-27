import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleCheckCertification } from '../src/tools/check-certification.mjs';
import { handleGetContract } from '../src/tools/get-contract.mjs';
import { handleSearchCapabilities } from '../src/tools/search-capabilities.mjs';
import { handleCompareCapabilities } from '../src/tools/compare-capabilities.mjs';
import { handleReportExperience } from '../src/tools/report-experience.mjs';
import { handleVerifyArtifact } from '../src/tools/verify-artifact.mjs';
import { handleVerifyFile } from '../src/tools/verify-file.mjs';

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
  it('submits a report with API key auth', async () => {
    let capturedBody;
    const client = {
      apiKey: 'fid_testapikey',
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
        content_hash: 'abc123def456',
        outcome: 'success',
        environment: { agent_platform: 'claude-code' },
      },
      client,
    );

    assertTextContent(result, 'Report Accepted');
    assertTextContent(result, 'mcp-server-filesystem');
    assertTextContent(result, 'success');
    assertTextContent(result, '95%');

    // Verify the posted body has the required fields
    assert.equal(capturedBody.capability_id, 'mcp-server-filesystem');
    assert.equal(capturedBody.content_hash, 'abc123def456');
    assert.equal(capturedBody.outcome, 'success');
    assert.deepEqual(capturedBody.environment, { agent_platform: 'claude-code' });
    // No signature, no consumer_id, no timestamp — simplified
    assert.equal(capturedBody.signature, undefined);
    assert.equal(capturedBody.consumer_id, undefined);
  });

  it('submits a report without API key (unauthenticated)', async () => {
    let capturedBody;
    const client = {
      apiKey: null,
      async post(path, body) {
        capturedBody = body;
        return {
          accepted: true,
          report_id: 'rpt-xyz789',
          capability_id: 'test-cap',
          current_confirmation_rate: null,
        };
      },
    };

    const result = await handleReportExperience(
      {
        capability_id: 'test-cap',
        content_hash: 'sha256:deadbeef',
        outcome: 'failure',
      },
      client,
    );

    assertTextContent(result, 'Report Accepted');
    assertTextContent(result, 'test-cap');
    assert.equal(capturedBody.capability_id, 'test-cap');
    assert.equal(capturedBody.content_hash, 'sha256:deadbeef');
    assert.equal(capturedBody.outcome, 'failure');
  });

  it('passes optional version through', async () => {
    let capturedBody;
    const client = {
      apiKey: null,
      async post(_path, body) {
        capturedBody = body;
        return {
          accepted: true,
          report_id: 'rpt-v',
          capability_id: 'test',
          current_confirmation_rate: null,
        };
      },
    };

    await handleReportExperience(
      {
        capability_id: 'test',
        content_hash: 'hash123',
        outcome: 'partial',
        version: '2.0.0',
      },
      client,
    );

    assert.equal(capturedBody.capability_version, '2.0.0');
  });

  it('passes details through when provided', async () => {
    let capturedBody;
    const client = {
      apiKey: null,
      async post(_path, body) {
        capturedBody = body;
        return {
          accepted: true,
          report_id: 'rpt-d',
          capability_id: 'test',
          current_confirmation_rate: null,
        };
      },
    };

    await handleReportExperience(
      {
        capability_id: 'test',
        content_hash: 'hash123',
        outcome: 'failure',
        details: { failure_description: 'Tool returned error' },
      },
      client,
    );

    assert.deepEqual(capturedBody.details, { failure_description: 'Tool returned error' });
  });

  it('omits optional fields when not provided', async () => {
    let capturedBody;
    const client = {
      apiKey: null,
      async post(_path, body) {
        capturedBody = body;
        return {
          accepted: true,
          report_id: 'rpt-min',
          capability_id: 'test',
          current_confirmation_rate: null,
        };
      },
    };

    await handleReportExperience(
      {
        capability_id: 'test',
        content_hash: 'hash123',
        outcome: 'success',
      },
      client,
    );

    assert.equal(capturedBody.capability_version, undefined);
    assert.equal(capturedBody.environment, undefined);
    assert.equal(capturedBody.details, undefined);
  });

  it('handles API error from report submission gracefully', async () => {
    const client = {
      apiKey: null,
      async post() {
        const { FidensaApiError } = await import('../src/lib/api-client.mjs');
        throw new FidensaApiError(429, { error: 'Rate limit exceeded' });
      },
    };

    const result = await handleReportExperience(
      {
        capability_id: 'test',
        content_hash: 'hash123',
        outcome: 'success',
      },
      client,
    );

    assertIsError(result);
    assertTextContent(result, 'Rate limit exceeded');
  });

  it('handles content_hash validation error from server', async () => {
    const client = {
      apiKey: null,
      async post() {
        const { FidensaApiError } = await import('../src/lib/api-client.mjs');
        throw new FidensaApiError(400, {
          error: 'content_hash does not match the certified artifact.',
        });
      },
    };

    const result = await handleReportExperience(
      {
        capability_id: 'test',
        content_hash: 'wrong-hash',
        outcome: 'success',
      },
      client,
    );

    assertIsError(result);
    assertTextContent(result, 'content_hash');
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

  // Helper: build a minimal JWS JSON Serialization for testing
  function buildTestArtifact(payloadObj, certMeta = {}) {
    const toB64Url = (str) =>
      Buffer.from(str).toString('base64url');
    const payload = toB64Url(JSON.stringify(payloadObj));
    const platformHeader = {
      alg: 'ES256',
      kid: 'test-key-1',
      typ: 'certification+jws',
      certification: {
        capability_id: 'test-cap',
        capability_version: '1.0.0',
        capability_type: 'mcp_server',
        content_hash: 'abc',
        certified_at: '2026-01-01T00:00:00Z',
        expires_at: '2027-01-01T00:00:00Z',
        stages_completed: ['ingest'],
        ...certMeta,
      },
    };
    return {
      payload,
      signatures: [
        {
          protected: toB64Url(JSON.stringify(platformHeader)),
          signature: toB64Url('fake-sig-bytes-placeholder-pad00'),
        },
      ],
    };
  }

  it('shows git_sha from certification header when present', async () => {
    const artifact = buildTestArtifact(
      { identity: { name: 'test-cap', git_sha: 'aabbccdd11223344' } },
      { git_sha: 'aabbccdd11223344' },
    );
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/.well-known/certification-keys.json': { keys: [] },
    });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify(artifact)) },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(text.includes('aabbccdd11223344'), 'Should display the certified git SHA');
  });

  it('reports code integrity MATCH when installed_git_sha matches', async () => {
    const sha = 'aabbccdd11223344';
    const artifact = buildTestArtifact(
      { identity: { name: 'test-cap', git_sha: sha } },
      { git_sha: sha },
    );
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/.well-known/certification-keys.json': { keys: [] },
    });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify(artifact)), installed_git_sha: sha },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(
      text.includes('Code integrity: MATCH'),
      'Should report code integrity match',
    );
  });

  it('reports code integrity MISMATCH when installed_git_sha differs', async () => {
    const artifact = buildTestArtifact(
      { identity: { name: 'test-cap', git_sha: 'certified111' } },
      { git_sha: 'certified111' },
    );
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/.well-known/certification-keys.json': { keys: [] },
    });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify(artifact)), installed_git_sha: 'installed999' },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(
      text.includes('Code integrity: MISMATCH'),
      'Should report code integrity mismatch',
    );
  });

  it('shows tip about installed_git_sha when SHA in cert but not provided', async () => {
    const artifact = buildTestArtifact(
      { identity: { name: 'test-cap', git_sha: 'aabbcc' } },
      { git_sha: 'aabbcc' },
    );
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/.well-known/certification-keys.json': { keys: [] },
    });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify(artifact)) },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(text.includes('installed_git_sha'), 'Should suggest passing installed_git_sha');
  });

  it('handles cert without git_sha when installed_git_sha is provided', async () => {
    const artifact = buildTestArtifact(
      { identity: { name: 'test-cap' } },
      {},
    );
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/.well-known/certification-keys.json': { keys: [] },
    });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify(artifact)), installed_git_sha: 'abc123' },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(
      text.includes('before git SHA recording'),
      'Should explain cert predates git SHA recording',
    );
  });

  it('reports file integrity MATCH when file_hash matches original_content_hash', async () => {
    const fileHash = 'deadbeef12345678';
    const artifact = buildTestArtifact(
      { trust: { original_content_hash: `sha256:${fileHash}` } },
      { original_content_hash: `sha256:${fileHash}` },
    );
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/.well-known/certification-keys.json': { keys: [] },
    });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify(artifact)), file_hash: fileHash },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(
      text.includes('File integrity: MATCH'),
      'Should report file integrity match',
    );
  });

  it('reports file integrity MISMATCH when file_hash differs from original_content_hash', async () => {
    const artifact = buildTestArtifact(
      {},
      { original_content_hash: 'sha256:certified111' },
    );
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/.well-known/certification-keys.json': { keys: [] },
    });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify(artifact)), file_hash: 'modified999' },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(
      text.includes('File integrity: MISMATCH'),
      'Should report file integrity mismatch',
    );
  });

  it('shows tip about file_hash when original_content_hash present but file_hash not provided', async () => {
    const artifact = buildTestArtifact(
      {},
      { original_content_hash: 'sha256:abc123' },
    );
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/.well-known/certification-keys.json': { keys: [] },
    });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify(artifact)) },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(text.includes('file_hash'), 'Should suggest passing file_hash');
  });

  it('handles missing original_content_hash when file_hash provided', async () => {
    const artifact = buildTestArtifact({}, {});
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/.well-known/certification-keys.json': { keys: [] },
    });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify(artifact)), file_hash: 'abc123' },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(
      text.includes('does not contain an original_content_hash'),
      'Should explain cert lacks content hash',
    );
  });

  it('shows instructions_url when present in cert metadata', async () => {
    const artifact = buildTestArtifact(
      {},
      { instructions_url: 'https://fidensa.com/sop' },
    );
    const client = fakeClient({
      _apiKey: 'fid_test',
      '/.well-known/certification-keys.json': { keys: [] },
    });
    const result = await handleVerifyArtifact(
      { content: btoa(JSON.stringify(artifact)) },
      client,
    );
    const text = result.content.map((c) => c.text).join('\n');
    assert.ok(
      text.includes('https://fidensa.com/sop'),
      'Should display the instructions URL',
    );
  });
});

// ── verify_file ──────────────────────────────────────────────────────

describe('verify_file', () => {
  it('returns MATCH when file_hash matches certified content_hash', async () => {
    const hash = 'abc123def456';
    const client = fakeClient({
      '/v1/attestation/test-cap': {
        capability_id: 'test-cap',
        version: '1.0.0',
        status: 'valid',
        tier: 'Certified',
        trust_score: 90,
        grade: 'A',
        content_hash: hash,
      },
    });

    const result = await handleVerifyFile(
      { capability_id: 'test-cap', file_hash: hash },
      client,
    );
    assertTextContent(result, 'MATCH');
    assertTextContent(result, 'test-cap');
    assertTextContent(result, '90/A');
    assertTextContent(result, 'Certified');
  });

  it('returns MATCH when file_hash has sha256: prefix', async () => {
    const hash = 'abc123def456';
    const client = fakeClient({
      '/v1/attestation/test-cap': {
        capability_id: 'test-cap',
        version: '1.0.0',
        status: 'valid',
        tier: 'Certified',
        trust_score: 90,
        grade: 'A',
        content_hash: `sha256:${hash}`,
      },
    });

    const result = await handleVerifyFile(
      { capability_id: 'test-cap', file_hash: `sha256:${hash}` },
      client,
    );
    assertTextContent(result, 'MATCH');
  });

  it('returns MISMATCH when hashes differ', async () => {
    const client = fakeClient({
      '/v1/attestation/test-cap': {
        capability_id: 'test-cap',
        version: '1.0.0',
        status: 'valid',
        tier: 'Certified',
        trust_score: 90,
        grade: 'A',
        content_hash: 'certified-hash',
      },
    });

    const result = await handleVerifyFile(
      { capability_id: 'test-cap', file_hash: 'different-hash' },
      client,
    );
    assertTextContent(result, 'MISMATCH');
    assertTextContent(result, 'modified since certification');
  });

  it('handles uncertified capability', async () => {
    const client = fakeClient({});

    const result = await handleVerifyFile(
      { capability_id: 'unknown-cap', file_hash: 'abc123' },
      client,
    );
    assertTextContent(result, 'not Fidensa certified');
    assertTextContent(result, 'unknown-cap');
  });

  it('handles missing content_hash in attestation', async () => {
    const client = fakeClient({
      '/v1/attestation/old-cap': {
        capability_id: 'old-cap',
        version: '0.1.0',
        status: 'valid',
        tier: 'Verified',
        trust_score: 70,
        grade: 'D',
        content_hash: null,
      },
    });

    const result = await handleVerifyFile(
      { capability_id: 'old-cap', file_hash: 'abc123' },
      client,
    );
    assertTextContent(result, 'does not have a content hash');
    assertTextContent(result, 'verify_artifact');
  });

  it('handles API error gracefully', async () => {
    const client = {
      apiKey: null,
      async get() {
        throw new Error('Network error');
      },
    };

    const result = await handleVerifyFile(
      { capability_id: 'test', file_hash: 'abc123' },
      client,
    );
    assertIsError(result);
    assertTextContent(result, 'Network error');
  });

  it('is case-insensitive for hash comparison', async () => {
    const client = fakeClient({
      '/v1/attestation/test-cap': {
        capability_id: 'test-cap',
        version: '1.0.0',
        status: 'valid',
        tier: 'Certified',
        trust_score: 90,
        grade: 'A',
        content_hash: 'AABBCCDD',
      },
    });

    const result = await handleVerifyFile(
      { capability_id: 'test-cap', file_hash: 'aabbccdd' },
      client,
    );
    assertTextContent(result, 'MATCH');
  });
});
