/**
 * compare_capabilities tool — side-by-side trust evaluation.
 *
 * Fetches trust score breakdowns for multiple capabilities (Registered tier).
 * Returns a comparison table with scores, grades, tiers, and per-signal detail.
 */

import { FidensaApiError } from '../lib/api-client.mjs';

/** Capitalize first letter. */
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * @param {object} input
 * @param {string[]} input.capability_ids - 2-5 capability IDs to compare
 * @param {import('../lib/api-client.mjs').ApiClient} client
 */
export async function handleCompareCapabilities(input, client) {
  const { capability_ids } = input;

  if (!capability_ids || capability_ids.length < 2) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Provide at least 2 capability IDs to compare.' }],
    };
  }

  if (capability_ids.length > 5) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Provide at most 5 capability IDs per comparison.' }],
    };
  }

  try {
    client.requireApiKey('compare_capabilities');
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  // Fetch score breakdowns in parallel
  const results = await Promise.all(
    capability_ids.map(async (id) => {
      try {
        const data = await client.get(
          `/v1/contracts/${encodeURIComponent(id)}/score`,
        );
        return { id, data, error: null };
      } catch (err) {
        const msg =
          err instanceof FidensaApiError
            ? `not found (HTTP ${err.status})`
            : err.message;
        return { id, data: null, error: msg };
      }
    }),
  );

  const lines = ['## Capability Comparison', ''];

  // Summary table
  lines.push('| Capability | Score | Grade | Tier | Maturity |');
  lines.push('|------------|-------|-------|------|----------|');

  for (const r of results) {
    if (r.data) {
      lines.push(
        `| ${r.id} | ${r.data.trust_score} | ${r.data.grade} | ${capitalize(r.data.tier)} | ${r.data.maturity || 'Initial'} |`,
      );
    } else {
      lines.push(`| ${r.id} | — | — | — | ${r.error} |`);
    }
  }

  lines.push('');

  // Per-signal comparison (only for successfully fetched capabilities)
  const fetched = results.filter((r) => r.data && r.data.signals);
  if (fetched.length >= 2) {
    // Collect all signal names
    const allSignals = new Set();
    for (const r of fetched) {
      for (const s of r.data.signals) {
        allSignals.add(s.signal);
      }
    }

    lines.push('### Per-Signal Breakdown');
    lines.push('');

    const header = ['| Signal', ...fetched.map((r) => `| ${r.id}`), '|'];
    lines.push(header.join(' '));
    const sep = ['|--------', ...fetched.map(() => '|------'), '|'];
    lines.push(sep.join(''));

    for (const sig of allSignals) {
      const row = [`| ${sig}`];
      for (const r of fetched) {
        const s = r.data.signals.find((x) => x.signal === sig);
        row.push(`| ${s ? (s.score * 100).toFixed(0) + '%' : '—'}`);
      }
      row.push('|');
      lines.push(row.join(' '));
    }

    lines.push('');
  }

  // Recommendation
  const ranked = results
    .filter((r) => r.data)
    .sort((a, b) => b.data.trust_score - a.data.trust_score);

  if (ranked.length > 0) {
    lines.push(
      `**Highest scored:** ${ranked[0].id} (${ranked[0].data.trust_score}/${ranked[0].data.grade})`,
    );
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
