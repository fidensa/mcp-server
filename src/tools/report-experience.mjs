/**
 * report_experience tool — simplified experience reporting.
 *
 * Per CERT_DISTRIBUTION_SPEC.md Section 9 (simplified):
 *   - No consumer identity registration required
 *   - No ECDSA keypair or JWS signing
 *   - API key auth (FIDENSA_API_KEY) or unauthenticated
 *   - content_hash required (proves reporter encountered the cert)
 *
 * The web endpoint accepts API-key-authenticated or unauthenticated reports.
 * The MCP server passes through the API key if configured.
 */

/**
 * @param {object} input
 * @param {string} input.capability_id
 * @param {string} input.content_hash     - SHA-256 content hash from the .cert.json (anti-spam)
 * @param {string} input.outcome          - success | failure | partial
 * @param {string} [input.version]        - capability version (server defaults to latest if omitted)
 * @param {object} [input.environment]    - { agent_platform, agent_version?, os?, runtime_version? }
 * @param {object} [input.details]        - { tools_used?, failure_description?, unexpected_behavior? }
 * @param {import('../lib/api-client.mjs').ApiClient} client
 */
export async function handleReportExperience(input, client) {
  // Build report payload — matches the simplified web endpoint schema
  const body = {
    capability_id: input.capability_id,
    content_hash: input.content_hash,
    outcome: input.outcome,
  };

  if (input.version) {
    body.capability_version = input.version;
  }
  if (input.environment) {
    body.environment = input.environment;
  }
  if (input.details) {
    body.details = input.details;
  }

  try {
    const result = await client.post('/v1/reports', body);

    const lines = [
      '## Report Accepted',
      '',
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
      '',
      'Your report has been recorded and will contribute to this capability\'s trust score.',
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
