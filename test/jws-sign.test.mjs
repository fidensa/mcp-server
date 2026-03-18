/**
 * Tests for JWS Compact Serialization signing via Web Crypto.
 *
 * Run: npm test (from mcp-server/)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { toBase64Url, importPrivateKey, signCompactJws } from '../src/lib/jws-sign.mjs';

// ── toBase64Url ──────────────────────────────────────────────────────

describe('toBase64Url', () => {
  it('encodes a string to base64url', () => {
    const result = toBase64Url('hello');
    assert.equal(result, 'aGVsbG8');
  });

  it('strips padding', () => {
    const result = toBase64Url('a');
    assert.ok(!result.includes('='), 'Should not contain padding');
  });

  it('replaces + and / with URL-safe characters', () => {
    // Use bytes that produce + and / in standard base64
    const buf = Buffer.from([0xfb, 0xff, 0xfe]);
    const result = toBase64Url(buf);
    assert.ok(!result.includes('+'), 'Should not contain +');
    assert.ok(!result.includes('/'), 'Should not contain /');
  });
});

// ── importPrivateKey ─────────────────────────────────────────────────

describe('importPrivateKey', () => {
  it('imports a valid ES256 JWK private key', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    const imported = await importPrivateKey(jwk);
    assert.equal(imported.type, 'private');
    assert.deepEqual(imported.algorithm, { name: 'ECDSA', namedCurve: 'P-256' });
  });

  it('rejects a public key (no d parameter)', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    await assert.rejects(() => importPrivateKey(pubJwk));
  });
});

// ── signCompactJws ───────────────────────────────────────────────────

describe('signCompactJws', () => {
  /** Generate a fresh keypair for each test */
  async function makeKey() {
    const kp = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const privateKey = await importPrivateKey(jwk);
    return { privateKey, publicKey: kp.publicKey };
  }

  it('produces a three-part JWS Compact Serialization', async () => {
    const { privateKey } = await makeKey();
    const jws = await signCompactJws({ foo: 'bar' }, privateKey);
    const parts = jws.split('.');
    assert.equal(parts.length, 3, 'JWS Compact should have 3 parts');
  });

  it('encodes the correct header with alg=ES256', async () => {
    const { privateKey } = await makeKey();
    const jws = await signCompactJws({ test: true }, privateKey, 'con-abc');
    const [headerB64] = jws.split('.');

    // Decode header
    const headerJson = Buffer.from(headerB64, 'base64url').toString();
    const header = JSON.parse(headerJson);
    assert.equal(header.alg, 'ES256');
    assert.equal(header.typ, 'report+jws');
    assert.equal(header.kid, 'con-abc');
  });

  it('omits kid from header when not provided', async () => {
    const { privateKey } = await makeKey();
    const jws = await signCompactJws({ test: true }, privateKey);
    const [headerB64] = jws.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    assert.equal(header.kid, undefined);
  });

  it('encodes the payload as base64url JSON', async () => {
    const { privateKey } = await makeKey();
    const payload = { capability_id: 'test-server', outcome: 'success' };
    const jws = await signCompactJws(payload, privateKey);
    const [, payloadB64] = jws.split('.');

    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    assert.deepEqual(decoded, payload);
  });

  it('produces a verifiable signature', async () => {
    const { privateKey, publicKey } = await makeKey();
    const payload = { capability_id: 'test-server', outcome: 'success' };
    const jws = await signCompactJws(payload, privateKey);
    const [headerB64, payloadB64, sigB64] = jws.split('.');

    // Reconstruct signing input
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sigBytes = Buffer.from(sigB64, 'base64url');

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sigBytes,
      signingInput,
    );
    assert.equal(valid, true, 'Signature should verify against the public key');
  });

  it('produces different signatures for different payloads', async () => {
    const { privateKey } = await makeKey();
    const jws1 = await signCompactJws({ data: 'one' }, privateKey);
    const jws2 = await signCompactJws({ data: 'two' }, privateKey);

    const sig1 = jws1.split('.')[2];
    const sig2 = jws2.split('.')[2];
    assert.notEqual(sig1, sig2, 'Different payloads should produce different signatures');
  });
});
