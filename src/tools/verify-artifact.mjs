/**
 * verify_artifact tool — offline artifact verification.
 *
 * Accepts either:
 *   - base64-encoded .cert.json content
 *   - A fidensa.com URL to fetch the artifact from
 *
 * Verifies the JWS platform signature using the published public key.
 * URL input is restricted to fidensa.com domain to prevent SSRF.
 */

import * as jose from 'jose';
import { FidensaApiError } from '../lib/api-client.mjs';

const ALLOWED_URL_PATTERN = /^https:\/\/(www\.)?fidensa\.(com|dev)\//;

/**
 * @param {object} input
 * @param {string} [input.content]  - Base64-encoded .cert.json content
 * @param {string} [input.url]      - fidensa.com URL to fetch the artifact
 * @param {import('../lib/api-client.mjs').ApiClient} client
 */
export async function handleVerifyArtifact(input, client) {
  try {
    client.requireApiKey('verify_artifact');
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  // Resolve artifact content
  let artifactJson;

  if (input.url) {
    // Validate URL domain
    if (!ALLOWED_URL_PATTERN.test(input.url)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              `URL must be on the fidensa.com or fidensa.dev domain. ` +
              `Received: ${input.url}\n\n` +
              `This restriction prevents SSRF attacks. Pass the artifact content ` +
              `as base64 in the 'content' parameter instead.`,
          },
        ],
      };
    }

    try {
      const response = await fetch(input.url);
      if (!response.ok) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to fetch artifact from ${input.url}: HTTP ${response.status}`,
            },
          ],
        };
      }
      artifactJson = await response.text();
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to fetch artifact: ${err.message}` }],
      };
    }
  } else if (input.content) {
    try {
      artifactJson = atob(input.content);
    } catch {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Invalid base64 content. Provide valid base64-encoded .cert.json.' }],
      };
    }
  } else {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Provide either a base64-encoded artifact via "content" or a fidensa.com URL via "url".',
        },
      ],
    };
  }

  // Parse artifact
  let artifact;
  try {
    artifact = JSON.parse(artifactJson);
  } catch {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Artifact is not valid JSON.' }],
    };
  }

  // Validate structure
  if (!artifact.signatures || !Array.isArray(artifact.signatures) || !artifact.payload) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Artifact does not appear to be a JWS JSON Serialization. Expected "payload" and "signatures" fields.',
        },
      ],
    };
  }

  const results = [];

  // Fetch platform public keys
  let publicKeys;
  try {
    const keysData = await client.get('/.well-known/certification-keys.json');
    publicKeys = keysData.keys || [];
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch platform public keys: ${err.message}. Cannot verify signatures.`,
        },
      ],
    };
  }

  // Decode payload
  let payloadText;
  try {
    payloadText = new TextDecoder().decode(jose.base64url.decode(artifact.payload));
  } catch {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Failed to decode artifact payload.' }],
    };
  }

  let payloadData;
  try {
    payloadData = JSON.parse(payloadText);
  } catch {
    results.push('⚠️ Payload is not valid JSON.');
  }

  // Verify content hash
  const payloadBytes = new TextEncoder().encode(payloadText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', payloadBytes);
  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Verify each signature
  for (let i = 0; i < artifact.signatures.length; i++) {
    const sig = artifact.signatures[i];
    const header = sig.protected
      ? JSON.parse(new TextDecoder().decode(jose.base64url.decode(sig.protected)))
      : {};

    const sigType = header.x_sig_type || (i === 0 ? 'platform' : 'publisher');
    const kid = header.kid || 'unknown';
    const delegated = header.delegated || false;

    // Find matching key
    const matchingKey = publicKeys.find((k) => k.kid === kid);

    if (matchingKey) {
      try {
        const key = await jose.importJWK(matchingKey, 'ES256');
        // Construct compact JWS for verification
        const compactJws = `${sig.protected}.${artifact.payload}.${sig.signature}`;
        await jose.compactVerify(compactJws, key);
        results.push(`✅ ${sigType} signature (kid: ${kid}): **VALID**`);
      } catch (err) {
        results.push(`❌ ${sigType} signature (kid: ${kid}): **INVALID** — ${err.message}`);
      }
    } else {
      if (delegated) {
        results.push(
          `⚠️ ${sigType} signature (kid: ${kid}): delegated (platform signed on publisher's behalf)`,
        );
      } else {
        results.push(
          `⚠️ ${sigType} signature (kid: ${kid}): key not found in platform key set`,
        );
      }
    }
  }

  // Check expiry
  if (payloadData) {
    const expiresAt = payloadData.certification?.expires_at || payloadData.expires_at;
    if (expiresAt) {
      const now = new Date();
      const expires = new Date(expiresAt);
      if (now > expires) {
        results.push(`❌ **Expired** at ${expiresAt}`);
      } else {
        results.push(`✅ **Not expired** (expires ${expiresAt})`);
      }
    }

    // Content hash check
    const declaredHash =
      payloadData.certification?.content_hash || payloadData.content_hash;
    if (declaredHash) {
      if (computedHash === declaredHash) {
        results.push(`✅ Content hash matches: ${computedHash.slice(0, 16)}...`);
      } else {
        results.push(
          `❌ Content hash MISMATCH. Declared: ${declaredHash.slice(0, 16)}... Computed: ${computedHash.slice(0, 16)}...`,
        );
      }
    }
  }

  const lines = [
    '## Artifact Verification',
    '',
    `Signatures found: ${artifact.signatures.length}`,
    '',
    ...results,
  ];

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
