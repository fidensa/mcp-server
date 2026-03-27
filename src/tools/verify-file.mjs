/**
 * verify_file tool — quick file integrity check.
 *
 * The most common verification path: AI hashes a capability file,
 * passes the hash + capability_id, and gets a match/mismatch result.
 *
 * Uses the attestation endpoint to fetch the certified content_hash,
 * then compares against the provided file_hash. No artifact needed.
 */

/**
 * @param {object} input
 * @param {string} input.capability_id - Capability identifier
 * @param {string} input.file_hash     - SHA-256 hash of the capability file
 * @param {import('../lib/api-client.mjs').ApiClient} client
 */
export async function handleVerifyFile(input, client) {
  // Fetch attestation data (open tier, no API key required)
  let attestation;
  try {
    attestation = await client.get(`/v1/attestation/${input.capability_id}`);
  } catch (err) {
    if (err.status === 404) {
      return {
        content: [
          {
            type: 'text',
            text:
              `**${input.capability_id}** is not Fidensa certified. ` +
              'File integrity cannot be verified for uncertified capabilities.',
          },
        ],
      };
    }
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to check certification for "${input.capability_id}": ${err.message}`,
        },
      ],
    };
  }

  const certifiedHash = attestation.content_hash;

  if (!certifiedHash) {
    return {
      content: [
        {
          type: 'text',
          text:
            `**${input.capability_id}** is certified (${attestation.trust_score}/${attestation.grade}, ` +
            `${attestation.tier}) but does not have a content hash on record. ` +
            'The certification may predate content hash recording. ' +
            'Use verify_artifact with the .cert.json for full verification.',
        },
      ],
    };
  }

  const providedHash = input.file_hash.replace(/^sha256:/, '').trim().toLowerCase();
  const certified = certifiedHash.replace(/^sha256:/, '').trim().toLowerCase();

  const lines = ['## File Verification', ''];

  if (providedHash === certified) {
    lines.push(
      `**MATCH** -- this file is exactly what Fidensa certified.`,
      '',
      `**Capability:** ${input.capability_id}`,
      `**Score:** ${attestation.trust_score}/${attestation.grade} | **Tier:** ${attestation.tier}`,
      `**Status:** ${attestation.status}`,
    );
  } else {
    lines.push(
      '**MISMATCH** -- this file does not match the Fidensa-certified version.',
      '',
      'The file may have been modified since certification, or a newer version has been ',
      'released that has not yet been recertified.',
      '',
      `**Capability:** ${input.capability_id}`,
      `**Status:** ${attestation.status}`,
      `**Details:** https://fidensa.com/certifications/${input.capability_id}`,
    );
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
