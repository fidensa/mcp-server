/**
 * Fidensa API client.
 *
 * Thin HTTP wrapper for the Fidensa REST API (fidensa.com/v1/*).
 * Used by all MCP tool handlers to fetch certification data.
 *
 * Configuration via constructor opts or environment variables:
 *   - FIDENSA_API_KEY:  API key for Registered+ endpoints (optional)
 *   - FIDENSA_BASE_URL: Override base URL (default: https://fidensa.com)
 */

export class FidensaApiError extends Error {
  constructor(status, body) {
    const msg = body?.message || body?.error || `HTTP ${status}`;
    super(msg);
    this.name = 'FidensaApiError';
    this.status = status;
    this.body = body;
  }
}

export class ApiClient {
  /**
   * @param {object} opts
   * @param {string} [opts.baseUrl] - API base URL (default: FIDENSA_BASE_URL env or https://fidensa.com)
   * @param {string} [opts.apiKey]  - API key for authenticated endpoints (default: FIDENSA_API_KEY env)
   */
  constructor(opts = {}) {
    const rawUrl = opts.baseUrl || process.env.FIDENSA_BASE_URL || 'https://fidensa.com';
    this.baseUrl = rawUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey || process.env.FIDENSA_API_KEY || null;
  }

  /**
   * Make a GET request to the Fidensa API.
   *
   * @param {string} path    - URL path (e.g. '/v1/attestation/mcp-server-filesystem')
   * @param {object} [params] - Query parameters (null/undefined values are skipped)
   * @returns {Promise<object>} Parsed JSON response body
   * @throws {FidensaApiError} On non-2xx HTTP responses
   */
  async get(path, params = {}) {
    const url = new URL(path, this.baseUrl);

    for (const [key, value] of Object.entries(params)) {
      if (value != null) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      Accept: 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      redirect: 'follow',
    });

    // If we got a 401 after a redirect, the auth header was likely stripped
    // (standard HTTP security behavior on cross-origin redirects, e.g.
    // fidensa.com → www.fidensa.com). Retry against the final URL with
    // the auth header re-attached.
    if (response.status === 401 && this.apiKey && response.redirected) {
      response = await fetch(response.url, {
        method: 'GET',
        headers,
        redirect: 'follow',
      });
    }

    if (!response.ok) {
      let body;
      try {
        body = await response.json();
      } catch {
        body = { error: `HTTP ${response.status}` };
      }
      throw new FidensaApiError(response.status, body);
    }

    return response.json();
  }

  /**
   * Make a POST request to the Fidensa API.
   *
   * @param {string} path - URL path
   * @param {object} body - Request body (JSON-serialized)
   * @returns {Promise<object>} Parsed JSON response body
   * @throws {FidensaApiError} On non-2xx HTTP responses
   */
  async post(path, body) {
    const url = new URL(path, this.baseUrl);

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let responseBody;
      try {
        responseBody = await response.json();
      } catch {
        responseBody = { error: `HTTP ${response.status}` };
      }
      throw new FidensaApiError(response.status, responseBody);
    }

    return response.json();
  }

  /**
   * Assert that an API key is configured. Throws a clear error if not.
   * Call this at the start of any tool that requires Registered+ access.
   *
   * @param {string} toolName - Name of the tool (for the error message)
   * @throws {Error} If apiKey is not set
   */
  requireApiKey(toolName) {
    if (!this.apiKey) {
      throw new Error(
        `API key required for '${toolName}'. ` +
          'Set FIDENSA_API_KEY environment variable or configure it in your MCP settings. ' +
          'Get a free key at https://fidensa.com/docs/api',
      );
    }
  }
}
