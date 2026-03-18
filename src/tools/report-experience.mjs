/**
 * report_experience tool — social proof submission.
 *
 * The consumer reports endpoint (POST /v1/reports) is live.
 * This tool requires consumer identity configuration to sign reports:
 *   - FIDENSA_CONSUMER_ID: registered consumer identity
 *   - FIDENSA_CONSUMER_PRIVATE_KEY: ES256 private key (JWK JSON string)
 *
 * Without these credentials, the tool returns instructions for setup.
 * Full signing integration is tracked for the next MCP server release.
 */

/**
 * @param {object} input
 * @param {string} input.capability_id
 * @param {string} input.outcome          - success | failure | partial
 * @param {object} input.environment      - { agent_platform, agent_version?, os?, runtime_version? }
 * @param {object} [input.details]        - { tools_used?, failure_description?, unexpected_behavior? }
 * @param {import('../lib/api-client.mjs').ApiClient} _client
 */
export async function handleReportExperience(input, _client) {
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

  // TODO: Implement JWS signing and POST /v1/reports call
  // This requires: build JWS Compact Serialization of the report payload
  // using the consumer's ES256 private key, then POST to the reports endpoint.
  // Tracked for next MCP server release (v0.2.0).
  return {
    content: [
      {
        type: 'text',
        text:
          `Consumer identity is configured (${consumerId}), but report signing ` +
          `is not yet implemented in this version of the MCP server.\n\n` +
          `Your report for **${input.capability_id}** (outcome: ${input.outcome}) ` +
          `was not submitted. Report signing will be available in v0.2.0.\n\n` +
          `In the meantime, you can submit reports directly via the REST API:\n` +
          `\`POST https://fidensa.com/v1/reports\``,
      },
    ],
  };
}
