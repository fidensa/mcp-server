/**
 * report_experience tool — social proof submission.
 *
 * The consumer reports endpoint (POST /v1/reports) is not yet built (Step 14).
 * This tool is registered so agents discover it and know it exists, but
 * returns a clear "coming soon" message until the backend is ready.
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
  return {
    content: [
      {
        type: 'text',
        text:
          `Consumer experience reporting is coming soon.\n\n` +
          `Your report for **${input.capability_id}** (outcome: ${input.outcome}) ` +
          `has been noted but cannot be submitted yet. The consumer reports ` +
          `endpoint is under development.\n\n` +
          `Visit https://fidensa.com/docs/api for updates on when this feature goes live.`,
      },
    ],
  };
}
