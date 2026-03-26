/**
 * verify_artifact tool -- offline artifact verification.
 *
 * Accepts either:
 *   - base64-encoded .cert.json content (preferred -- true offline verification)
 *   - A fidensa.com URL to fetch the artifact from (convenience, with circularity warning)
 *
 * Verifies the JWS platform signature using the published public key.
 * URL input is restricted to fidensa.com domain to prevent SSRF.
 *
 * Optional: pass installed_git_sha to verify that installed code matches the
 * certified commit recorded in the artifact.
 */

import * as jose from 'jose';

const ALLOWED_URL_PATTERN = /^https:\/\/(www\.)?fidensa\.(com|dev)\//;

/**
 * @param {object} input
 * @param {string} [input.content]  - Base64-encoded .cert.json content
 * @param {string} [input.url]      - fidensa.com URL to fetch the artifact
 * @param {string} [input.installed_git_sha] - Git SHA of installed code for integrity check
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
  let usedUrl = false;

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
      usedUrl = true;
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
        content: [
          { type: 'text', text: 'Invalid base64 content. Provide valid base64-encoded .cert.json.' },
        ],
      };
    }
  } else {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            'Provide either a base64-encoded artifact via "content" or a fidensa.com URL via "url". ' +
            'For true offline verification, use "content" with a .cert.json file embedded in the ' +
            "capability's package.",
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

  // Circularity warning when fetched from Fidensa itself
  if (usedUrl) {
    results.push(
      '**Note:** This artifact was fetched from fidensa.com. For independent verification, ' +
        "obtain the .cert.json from the capability's published package and pass it via " +
        'the "content" parameter.',
    );
    results.push('');
  }

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
    results.push('Warning: Payload is not valid JSON.');
  }

  // Compute content hash
  const payloadBytes = new TextEncoder().encode(payloadText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', payloadBytes);
  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Collect certification metadata from signature headers
  let certMeta = null;

  // Verify each signature
  for (let i = 0; i < artifact.signatures.length; i++) {
    const sig = artifact.signatures[i];
    const header = sig.protected
      ? JSON.parse(new TextDecoder().decode(jose.base64url.decode(sig.protected)))
      : {};

    const sigType = header.typ === 'attestation+jws' ? 'publisher' : 'platform';
    const kid = header.kid || 'unknown';
    const delegated = header.attestation?.delegated || false;

    // Extract certification metadata from the platform signature header
    if (sigType === 'platform' && header.certification) {
      certMeta = header.certification;
    }

    // Find matching key
    const matchingKey = publicKeys.find((k) => k.kid === kid);

    if (matchingKey) {
      try {
        const key = await jose.importJWK(matchingKey, 'ES256');
        // Construct compact JWS for verification
        const compactJws = `${sig.protected}.${artifact.payload}.${sig.signature}`;
        await jose.compactVerify(compactJws, key);
        results.push(`Signature VALID: ${sigType} (kid: ${kid})`);
      } catch (err) {
        results.push(`Signature INVALID: ${sigType} (kid: ${kid}) -- ${err.message}`);
      }
    } else {
      if (delegated) {
        results.push(`Signature: ${sigType} (kid: ${kid}) -- delegated (platform signed on publisher's behalf)`);
      } else {
        results.push(`Signature UNVERIFIABLE: ${sigType} (kid: ${kid}) -- key not found in platform key set`);
      }
    }
  }

  // Check expiry
  if (payloadData) {
    const expiresAt = certMeta?.expires_at || payloadData.certification?.expires_at || payloadData.expires_at;
    if (expiresAt) {
      const now = new Date();
      const expires = new Date(expiresAt);
      if (now > expires) {
        results.push(`Expiry: EXPIRED at ${expiresAt}`);
      } else {
        results.push(`Expiry: valid (expires ${expiresAt})`);
      }
    }

    // Content hash check
    const declaredHash =
      certMeta?.content_hash || payloadData.certification?.content_hash || payloadData.content_hash;
    if (declaredHash) {
      const normalizedDeclared = declaredHash.replace(/^sha256:/, '');
      if (computedHash === normalizedDeclared) {
        results.push(`Content hash: MATCHES (${computedHash.slice(0, 16)}...)`);
      } else {
        results.push(
          `Content hash: MISMATCH. Declared: ${normalizedDeclared.slice(0, 16)}... Computed: ${computedHash.slice(0, 16)}...`,
        );
      }
    }
  }

  // Code integrity check: git SHA
  const certifiedGitSha = certMeta?.git_sha || payloadData?.identity?.git_sha || null;
  if (certifiedGitSha) {
    results.push('');
    results.push(`Certified git commit: ${certifiedGitSha}`);

    if (input.installed_git_sha) {
      const installed = input.installed_git_sha.trim().toLowerCase();
      const certified = certifiedGitSha.trim().toLowerCase();
      if (installed === certified) {
        results.push(`Code integrity: MATCH -- installed code matches certified commit`);
      } else {
        results.push(
          `Code integrity: MISMATCH -- installed ${installed.slice(0, 12)}... does not match certified ${certified.slice(0, 12)}...`,
        );
      }
    } else {
      results.push(
        'Tip: pass installed_git_sha (from "git rev-parse HEAD" in the installed package) to verify code integrity.',
      );
    }
  } else if (input.installed_git_sha) {
    results.push('');
    results.push(
      'Code integrity: cannot verify -- this artifact was certified before git SHA recording was implemented.',
    );
  }

  // Capability identity summary
  if (certMeta) {
    results.push('');
    results.push(`Capability: ${certMeta.capability_id} v${certMeta.capability_version} (${certMeta.capability_type})`);
    results.push(`Certified: ${certMeta.certified_at}`);
    results.push(`Pipeline stages: ${(certMeta.stages_completed || []).join(', ')}`);
  }

  const lines = ['## Artifact Verification', '', ...results];

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
