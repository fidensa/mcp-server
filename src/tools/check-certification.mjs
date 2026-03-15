/**
 * check_certification tool — quick trust check.
 *
 * Calls the attestation endpoint (Open tier, no API key needed).
 * Returns status, trust score, grade, tier, maturity, and supply chain status.
 */

import { FidensaApiError } from '../lib/api-client.mjs';

/** Capitalize first letter (e.g. 'certified' → 'Certified'). */
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * @param {object} input
 * @param {string} input.capability_id
 * @param {string} [input.version]
 * @param {import('../lib/api-client.mjs').ApiClient} client
 */
export async function handleCheckCertification(input, client) {
  const { capability_id, version } = input;

  try {
    const path = version
      ? `/v1/attestation/${encodeURIComponent(capability_id)}/${encodeURIComponent(version)}`
      : `/v1/attestation/${encodeURIComponent(capability_id)}`;

    const data = await client.get(path);

    const lines = [
      `## Certification: ${data.capability_id}${data.version ? ` v${data.version}` : ''}`,
      '',
      `- **Status:** ${data.status}`,
      `- **Trust Score:** ${data.trust_score}/${data.grade}`,
      `- **Tier:** ${capitalize(data.tier)}`,
      `- **Type:** ${data.type || 'unknown'}`,
      `- **Maturity:** ${data.maturity || 'Initial'}`,
      `- **Max Achievable Score:** ${data.max_achievable_score ?? 'N/A'}`,
      `- **Supply Chain:** ${data.supply_chain_status || 'unknown'}`,
      '',
      `Details: ${data.record_url || `https://fidensa.com/certifications/${capability_id}`}`,
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err) {
    if (err instanceof FidensaApiError && err.status === 404) {
      return {
        content: [
          {
            type: 'text',
            text:
              `**${capability_id}** is uncertified — no Fidensa certification record exists.\n\n` +
              'Per Fidensa\'s foundational principle: "everything is untrusted until proven trustworthy." ' +
              'This capability has not been independently verified.\n\n' +
              'Use `search_capabilities` to find certified alternatives.',
          },
        ],
      };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: `Error checking certification: ${err.message}` }],
    };
  }
}
