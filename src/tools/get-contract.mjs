/**
 * get_contract tool — full contract retrieval.
 *
 * Calls the contracts endpoint (Registered tier, requires API key).
 * Returns the complete certification contract with all evidence sections.
 */

import { FidensaApiError } from '../lib/api-client.mjs';

/** Capitalize first letter. */
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * @param {object} input
 * @param {string} input.capability_id
 * @param {string} [input.version]
 * @param {import('../lib/api-client.mjs').ApiClient} client
 */
export async function handleGetContract(input, client) {
  try {
    client.requireApiKey('get_contract');
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  const { capability_id, version } = input;

  try {
    const path = version
      ? `/v1/contracts/${encodeURIComponent(capability_id)}/${encodeURIComponent(version)}`
      : `/v1/contracts/${encodeURIComponent(capability_id)}`;

    const data = await client.get(path);

    const lines = [
      `## Contract: ${data.capability_id} v${data.version}`,
      '',
      `- **Status:** ${data.status}`,
      `- **Trust Score:** ${data.trust_score}/${data.grade}`,
      `- **Tier:** ${capitalize(data.tier)}`,
      `- **Maturity:** ${data.maturity || 'Initial'}`,
      `- **Certified:** ${data.certified_at}`,
      `- **Expires:** ${data.expires_at}`,
      '',
    ];

    // Summarize contract sections if present
    const contract = data.contract;
    if (contract) {
      if (contract.identity) {
        lines.push('### Identity');
        lines.push(`- Name: ${contract.identity.name || 'N/A'}`);
        lines.push(`- Publisher: ${contract.identity.publisher || 'N/A'}`);
        if (contract.identity.description) {
          lines.push(`- Description: ${contract.identity.description}`);
        }
        lines.push('');
      }

      if (contract.supply_chain) {
        const sc = contract.supply_chain;
        lines.push('### Supply Chain');
        lines.push(`- Components: ${sc.total_components ?? 'N/A'}`);
        if (sc.vulnerability_counts) {
          const vc = sc.vulnerability_counts;
          lines.push(
            `- Vulnerabilities: ${vc.critical ?? 0} critical, ${vc.high ?? 0} high, ` +
              `${vc.medium ?? 0} medium, ${vc.low ?? 0} low`,
          );
        }
        lines.push('');
      }

      if (contract.security) {
        lines.push('### Security');
        const sec = contract.security;
        if (sec.scan_results) {
          lines.push(`- Scan findings: ${JSON.stringify(sec.scan_results.summary || sec.scan_results)}`);
        }
        if (sec.adversarial_results) {
          const adv = sec.adversarial_results;
          lines.push(`- Adversarial findings: ${adv.total_findings ?? 'N/A'}`);
        }
        lines.push('');
      }

      if (contract.behavioral_fingerprint) {
        lines.push('### Behavioral Fingerprint');
        const fp = contract.behavioral_fingerprint;
        if (fp.tools && Object.keys(fp.tools).length > 0) {
          for (const [tool, stats] of Object.entries(fp.tools)) {
            lines.push(
              `- ${tool}: p50=${stats.timing_ms?.p50 ?? 'N/A'}ms, ` +
                `p95=${stats.timing_ms?.p95 ?? 'N/A'}ms, ` +
                `errors=${stats.error_rate ?? 'N/A'}`,
            );
          }
        }
        lines.push('');
      }
    }

    lines.push(`Full details: ${data.record_url || `https://fidensa.com/certifications/${capability_id}`}`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err) {
    if (err instanceof FidensaApiError) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to retrieve contract for '${capability_id}': ${err.message} (HTTP ${err.status})`,
          },
        ],
      };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: `Error retrieving contract: ${err.message}` }],
    };
  }
}
