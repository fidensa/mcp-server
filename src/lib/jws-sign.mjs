/**
 * JWS Compact Serialization signing using Web Crypto.
 *
 * Builds a JWS Compact Serialization (header.payload.signature) for
 * consumer experience reports. Uses ECDSA P-256 + SHA-256 (ES256).
 *
 * No external dependencies — uses Node.js built-in crypto.subtle.
 */

/**
 * Encode a buffer or string to base64url (no padding, URL-safe characters).
 * @param {Buffer|Uint8Array|string} input
 * @returns {string}
 */
export function toBase64Url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input) : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Import a JWK private key for ECDSA P-256 signing.
 *
 * @param {object} jwk — Private key in JWK format (must include 'd' parameter)
 * @returns {Promise<CryptoKey>}
 */
export async function importPrivateKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * Sign a payload and produce a JWS Compact Serialization string.
 *
 * @param {object} payload — The JSON object to sign
 * @param {CryptoKey} privateKey — ECDSA P-256 private key
 * @param {string} [kid] — Optional key ID for the protected header
 * @returns {Promise<string>} JWS Compact Serialization (header.payload.signature)
 */
export async function signCompactJws(payload, privateKey, kid) {
  // Build protected header
  const header = { alg: 'ES256', typ: 'report+jws' };
  if (kid) header.kid = kid;

  const headerB64 = toBase64Url(JSON.stringify(header));
  const payloadB64 = toBase64Url(JSON.stringify(payload));

  // Signing input per RFC 7515 §5.1
  const signingInput = `${headerB64}.${payloadB64}`;
  const inputBytes = new TextEncoder().encode(signingInput);

  // ECDSA P-256 + SHA-256 — Web Crypto returns raw R||S (64 bytes)
  const signatureBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    inputBytes,
  );

  const signatureB64 = toBase64Url(new Uint8Array(signatureBytes));

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}
