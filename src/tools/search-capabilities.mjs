/**
 * search_capabilities tool — discovery + alternative suggestions.
 *
 * Calls the search endpoint (Open tier, no API key needed).
 * Returns ranked list of certified capabilities matching the query.
 */

/** Capitalize first letter. */
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * @param {object} input
 * @param {string} input.query
 * @param {string} [input.type]      - mcp_server, skill, workflow, plugin
 * @param {string} [input.tier]      - certified, verified, evaluated
 * @param {number} [input.min_score] - 0-100
 * @param {number} [input.limit]     - 1-50, default 10
 * @param {import('../lib/api-client.mjs').ApiClient} client
 */
export async function handleSearchCapabilities(input, client) {
  const { query, type, tier, min_score, limit } = input;

  try {
    const data = await client.get('/v1/search', {
      q: query,
      type: type || null,
      tier: tier || null,
      min_score: min_score ?? null,
      status: 'valid',
      limit: limit ?? 10,
    });

    if (!data.results || data.results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text:
              `No certified capabilities found matching "${query}".` +
              (type ? ` (type: ${type})` : '') +
              (tier ? ` (tier: ${tier})` : '') +
              (min_score ? ` (min_score: ${min_score})` : '') +
              '\n\n0 results.',
          },
        ],
      };
    }

    const lines = [
      `## Search Results for "${query}"`,
      `${data.total} result${data.total === 1 ? '' : 's'} found.`,
      '',
    ];

    for (const r of data.results) {
      lines.push(
        `- **${r.capability_id}** — ${r.trust_score}/${r.grade} (${capitalize(r.tier)})` +
          ` [${r.type || 'unknown'}]` +
          ` — ${r.status}`,
      );
      if (r.publisher) {
        lines.push(`  Publisher: ${r.publisher}`);
      }
      lines.push(`  ${r.record_url || `https://fidensa.com/certifications/${r.capability_id}`}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Search failed: ${err.message}` }],
    };
  }
}
