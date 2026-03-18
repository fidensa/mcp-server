/**
 * report_experience tool — social proof submission.
 *
 * Signs and submits consumer experience reports to the Fidensa API.
 * Requires consumer identity configuration:
 *   - FIDENSA_CONSUMER_ID: registered consumer identity
 *   - FIDENSA_CONSUMER_PRIVATE_KEY: ES256 private key (JWK JSON string)
 *
 * Without these credentials, the tool returns instructions for setup.
 * Signing uses Web Crypto (ECDSA P-256) — no external crypto dependencies.
 */

import { importPrivateKey, signCompactJws } from '../lib/jws-sign.mjs';

/**
 * @param {object} input
 * @param {string} input.capability_id
 * @param {string} [input.version]        - capability version (looked up if omitted)
 * @param {string} input.outcome          - success | failure | partial
 * @param {object} input.environment      - { agent_platform, agent_version?, os?, runtime_version? }
 * @param {object} [input.details]        - { tools_used?, failure_description?, unexpected_behavior? }
 * @param {import('../lib/api-client.mjs').ApiClient} client
 */
export async function handleReportExperience(input, client) {
  const consumerId = process.env.FIDENSA_CONSUMER_ID;
  const privateKeyJson = process.env.FIDENSA_CONSUMER_PRIVATE_KEY;

  if (!consumerId || !privateKeyJson) {
    return {
      content: [
        {
          type: 'text',
          text:
            `## Consumer Identity Required\n\n` +
            `To submit experience reports, configure a consumer identity:\n\n` +
            `1. Register at \`POST https://fidensa.com/v1/consumers\` with your display name and email\n` +
            `2. Store the returned \`consumer_id\` and \`private_key\` securely\n` +
            `3. Set environment variables:\n` +
            `   - \`FIDENSA_CONSUMER_ID\` = your consumer_id\n` +
            `   - \`FIDENSA_CONSUMER_PRIVATE_KEY\` = the private_key JSON string\n\n` +
            `Your report for **${input.capability_id}** (outcome: ${input.outcome}) ` +
            `was not submitted. Configure the credentials above and try again.`,
        },
      ],
    };
  }

  // Resolve capability version — use explicit if provided, otherwise look up
  let capabilityVersion = input.version;
  if (!capabilityVersion) {
    try {
      const attestation = await client.get(`/v1/attestation/${input.capability_id}`);
      capabilityVersion = attestation.version;
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              `Failed to look up certification for **${input.capability_id}**: ${err.message}\n\n` +
              `Reports can only be submitted for certified capabilities. ` +
              `Provide an explicit \`version\` parameter or verify the capability ID is correct.`,
          },
        ],
      };
    }
  }

  // Build report payload (everything the server expects, minus the signature)
  const timestamp = new Date().toISOString();
  const reportPayload = {
    capability_id: input.capability_id,
    capability_version: capabilityVersion,
    outcome: input.outcome,
    environment: input.environment,
    consumer_id: consumerId,
    timestamp,
  };
  if (input.details) {
    reportPayload.details = input.details;
  }

  // Sign the report with the consumer's private key
  let signature;
  try {
    const privateJwk = JSON.parse(privateKeyJson);
    const privateKey = await importPrivateKey(privateJwk);
    signature = await signCompactJws(reportPayload, privateKey, consumerId);
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            `Failed to sign report: ${err.message}\n\n` +
            `Verify that FIDENSA_CONSUMER_PRIVATE_KEY contains a valid ES256 (P-256) private key in JWK format.`,
        },
      ],
    };
  }

  // Submit to the reports endpoint
  const body = { ...reportPayload, signature };

  try {
    const result = await client.post('/v1/reports', body);

    const lines = [
      `## Report Accepted`,
      ``,
      `**Capability:** ${result.capability_id}`,
      `**Outcome:** ${input.outcome}`,
      `**Report ID:** ${result.report_id}`,
    ];

    if (result.current_confirmation_rate != null) {
      lines.push(
        `**Current confirmation rate:** ${Math.round(result.current_confirmation_rate * 100)}%`,
      );
    }

    lines.push(
      ``,
      `Your report has been recorded and will contribute to this capability's trust score.`,
    );

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            `Report submission failed: ${err.message}\n\n` +
            `**Capability:** ${input.capability_id}\n` +
            `**Outcome:** ${input.outcome}`,
        },
      ],
    };
  }
}
