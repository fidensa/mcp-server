import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// We'll test the ApiClient class.
// Mock global fetch for all tests.
let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(status, body, headers = {}) {
  globalThis.fetch = mock.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers)),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  return globalThis.fetch;
}

// Dynamic import so env vars can be set before module loads
async function loadClient(opts = {}) {
  // Clear module cache by using a query param trick
  const mod = await import(`../src/lib/api-client.mjs?t=${Date.now()}-${Math.random()}`);
  return new mod.ApiClient(opts);
}

describe('ApiClient', () => {
  describe('constructor', () => {
    it('defaults baseUrl to https://fidensa.com', async () => {
      const client = await loadClient();
      assert.equal(client.baseUrl, 'https://fidensa.com');
    });

    it('accepts custom baseUrl', async () => {
      const client = await loadClient({ baseUrl: 'http://localhost:3000' });
      assert.equal(client.baseUrl, 'http://localhost:3000');
    });

    it('strips trailing slash from baseUrl', async () => {
      const client = await loadClient({ baseUrl: 'https://fidensa.com/' });
      assert.equal(client.baseUrl, 'https://fidensa.com');
    });

    it('stores apiKey when provided', async () => {
      const client = await loadClient({ apiKey: 'fid_abc123' });
      assert.equal(client.apiKey, 'fid_abc123');
    });

    it('apiKey defaults to null', async () => {
      const client = await loadClient();
      assert.equal(client.apiKey, null);
    });
  });

  describe('get()', () => {
    it('makes a GET request to the correct URL', async () => {
      const f = mockFetch(200, { status: 'valid' });
      const client = await loadClient();
      await client.get('/v1/attestation/mcp-server-filesystem');
      assert.equal(f.mock.calls.length, 1);
      const [url, opts] = f.mock.calls[0].arguments;
      assert.equal(url, 'https://fidensa.com/v1/attestation/mcp-server-filesystem');
      assert.equal(opts.method, 'GET');
    });

    it('includes Authorization header when apiKey is set', async () => {
      const f = mockFetch(200, { status: 'valid' });
      const client = await loadClient({ apiKey: 'fid_test1234567890123456789012' });
      await client.get('/v1/contracts/test');
      const [, opts] = f.mock.calls[0].arguments;
      assert.equal(opts.headers['Authorization'], 'Bearer fid_test1234567890123456789012');
    });

    it('does not include Authorization header when no apiKey', async () => {
      const f = mockFetch(200, { status: 'valid' });
      const client = await loadClient();
      await client.get('/v1/attestation/test');
      const [, opts] = f.mock.calls[0].arguments;
      assert.equal(opts.headers['Authorization'], undefined);
    });

    it('returns parsed JSON on success', async () => {
      mockFetch(200, { capability_id: 'test', status: 'valid' });
      const client = await loadClient();
      const result = await client.get('/v1/attestation/test');
      assert.deepEqual(result, { capability_id: 'test', status: 'valid' });
    });

    it('appends query params', async () => {
      const f = mockFetch(200, { results: [] });
      const client = await loadClient();
      await client.get('/v1/search', { q: 'filesystem', type: 'mcp_server', min_score: '70' });
      const [url] = f.mock.calls[0].arguments;
      assert.ok(url.includes('q=filesystem'));
      assert.ok(url.includes('type=mcp_server'));
      assert.ok(url.includes('min_score=70'));
    });

    it('skips null/undefined query params', async () => {
      const f = mockFetch(200, { results: [] });
      const client = await loadClient();
      await client.get('/v1/search', { q: 'test', type: null, tier: undefined });
      const [url] = f.mock.calls[0].arguments;
      assert.ok(url.includes('q=test'));
      assert.ok(!url.includes('type='));
      assert.ok(!url.includes('tier='));
    });

    it('throws FidensaApiError on 404', async () => {
      mockFetch(404, { error: 'not_found', message: 'No certification record exists.' });
      const client = await loadClient();
      await assert.rejects(() => client.get('/v1/attestation/nonexistent'), (err) => {
        assert.equal(err.name, 'FidensaApiError');
        assert.equal(err.status, 404);
        assert.equal(err.body.error, 'not_found');
        return true;
      });
    });

    it('throws FidensaApiError on 401', async () => {
      mockFetch(401, { error: 'Missing or invalid Authorization header.' });
      const client = await loadClient();
      await assert.rejects(() => client.get('/v1/contracts/test'), (err) => {
        assert.equal(err.status, 401);
        return true;
      });
    });

    it('throws FidensaApiError on 429', async () => {
      mockFetch(429, { error: 'Rate limit exceeded.' });
      const client = await loadClient();
      await assert.rejects(() => client.get('/v1/contracts/test'), (err) => {
        assert.equal(err.status, 429);
        return true;
      });
    });

    it('throws on network error', async () => {
      globalThis.fetch = mock.fn(async () => {
        throw new Error('fetch failed');
      });
      const client = await loadClient();
      await assert.rejects(() => client.get('/v1/attestation/test'), (err) => {
        assert.ok(err.message.includes('fetch failed'));
        return true;
      });
    });
  });

  describe('requireApiKey()', () => {
    it('throws a clear error when apiKey is not set', async () => {
      const client = await loadClient();
      assert.throws(() => client.requireApiKey('get_contract'), (err) => {
        assert.ok(err.message.includes('API key required'));
        assert.ok(err.message.includes('FIDENSA_API_KEY'));
        return true;
      });
    });

    it('does not throw when apiKey is set', async () => {
      const client = await loadClient({ apiKey: 'fid_test1234567890123456789012' });
      assert.doesNotThrow(() => client.requireApiKey('get_contract'));
    });
  });
});
