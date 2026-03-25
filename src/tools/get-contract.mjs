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
 * Safely stringify a value for display.
 * Objects become "key: value" pairs, arrays become comma-separated, primitives pass through.
 */
function display(val) {
  if (val == null) return 'N/A';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : 'none';
  if (typeof val === 'object') {
    // For objects like {name: "...", verified: false}, show the name if present
    if (val.name) return val.verified ? `${val.name} (verified)` : val.name;
    return JSON.stringify(val);
  }
  return String(val);
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

    const contract = data.contract;
    if (!contract) {
      lines.push('_No contract data available._');
      lines.push('');
      lines.push(
        `Full details: ${data.record_url || `https://fidensa.com/certifications/${capability_id}`}`,
      );
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    // ── Identity ──────────────────────────────────────────────────
    const identity = contract.identity;
    if (identity) {
      lines.push('### Identity');
      lines.push(`- Name: ${identity.name || 'N/A'}`);
      lines.push(`- Publisher: ${display(identity.publisher)}`);
      lines.push(`- Type: ${identity.type || 'N/A'}${identity.subtype ? ` (${identity.subtype})` : ''}`);
      if (identity.source) lines.push(`- Source: ${identity.source}`);
      if (identity.license) lines.push(`- License: ${identity.license}`);
      lines.push('');
    }

    // ── Supply Chain ──────────────────────────────────────────────
    const sbom = contract.supply_chain?.sbom;
    if (sbom) {
      lines.push('### Supply Chain');
      lines.push(`- Components: ${sbom.component_count ?? 'N/A'} (${sbom.direct_dependencies ?? '?'} direct, ${sbom.transitive_dependencies ?? '?'} transitive)`);
      if (sbom.vulnerability_summary) {
        const vs = sbom.vulnerability_summary;
        lines.push(
          `- Vulnerabilities: ${vs.critical ?? 0} critical, ${vs.high ?? 0} high, ${vs.medium ?? 0} medium, ${vs.low ?? 0} low`,
        );
        if (vs.total != null) lines.push(`- Total: ${vs.total}`);
      }
      lines.push('');
    }

    // ── Provenance ────────────────────────────────────────────────
    const provenance = contract.provenance;
    if (provenance) {
      lines.push('### Provenance');
      const signals = [];
      if (provenance.license_present) signals.push('license present');
      if (provenance.security_md_present) signals.push('SECURITY.md present');
      if (provenance.readme_present && !provenance.readme_empty) signals.push('README present');
      if (provenance.namespace_match) signals.push('namespace verified');
      if (signals.length > 0) lines.push(`- Signals: ${signals.join(', ')}`);
      if (provenance.contributor_count != null) lines.push(`- Contributors: ${provenance.contributor_count}`);
      if (provenance.repo_age_days != null) lines.push(`- Repo age: ${provenance.repo_age_days} days`);
      lines.push('');
    }

    // ── Type-specific section (security, interface, guarantees) ──
    const typeKey = identity?.type || null;
    const typeSection = typeKey ? contract[typeKey] : null;

    if (typeSection) {
      // Security scan results
      const security = typeSection.security;
      if (security) {
        lines.push('### Security');
        if (security.permissions_required?.length > 0) {
          lines.push(`- Permissions: ${security.permissions_required.join(', ')}`);
        }
        if (security.scan_results) {
          for (const [scanner, result] of Object.entries(security.scan_results)) {
            lines.push(`- ${scanner}: ${result.status || result.severity || 'N/A'}`);
            if (result.findings_summary) {
              const fs = result.findings_summary;
              const counts = [];
              if (fs.critical) counts.push(`${fs.critical} critical`);
              if (fs.high) counts.push(`${fs.high} high`);
              if (fs.medium) counts.push(`${fs.medium} medium`);
              if (fs.low) counts.push(`${fs.low} low`);
              if (counts.length > 0) lines.push(`  Findings: ${counts.join(', ')}`);
            }
          }
        }

        // Adversarial testing
        if (security.adversarial_testing) {
          const adv = security.adversarial_testing;
          lines.push('');
          lines.push('### Adversarial Testing');
          if (adv.categories_tested) {
            lines.push(`- Categories tested: ${adv.categories_tested.length}`);
          }
          if (adv.findings && adv.findings.length > 0) {
            lines.push(`- Findings: ${adv.findings.length}`);
            for (const f of adv.findings) {
              lines.push(
                `  - [${(f.classification || f.severity || 'unknown').toUpperCase()}] ${f.category}: ${f.description || 'No description'}`,
              );
            }
          } else {
            lines.push('- Findings: none');
          }
        }
        lines.push('');
      }

      // Interface summary
      const iface = typeSection.interface;
      if (iface) {
        lines.push('### Interface');
        if (iface.tools && Array.isArray(iface.tools)) {
          lines.push(`- Tools: ${iface.tools.length}`);
          for (const t of iface.tools.slice(0, 10)) {
            const name = t.name || t.tool_name || 'unnamed';
            const desc = t.description ? ` — ${t.description.slice(0, 80)}` : '';
            lines.push(`  - ${name}${desc}`);
          }
          if (iface.tools.length > 10) {
            lines.push(`  - ... and ${iface.tools.length - 10} more`);
          }
        }
        if (iface.resources && Array.isArray(iface.resources) && iface.resources.length > 0) {
          lines.push(`- Resources: ${iface.resources.length}`);
        }
        if (iface.prompts && Array.isArray(iface.prompts) && iface.prompts.length > 0) {
          lines.push(`- Prompts: ${iface.prompts.length}`);
        }
        lines.push('');
      }
    }

    // ── Behavioral Fingerprint ────────────────────────────────────
    const fingerprint = contract.trust?.behavioral_fingerprint;
    if (fingerprint?.signals) {
      lines.push('### Behavioral Fingerprint');
      const sig = fingerprint.signals;
      if (sig.response_time_ms) {
        lines.push(
          `- Response time: p50=${sig.response_time_ms.p50}ms, p95=${sig.response_time_ms.p95}ms, p99=${sig.response_time_ms.p99}ms`,
        );
      }
      if (sig.error_rate != null) {
        lines.push(`- Error rate: ${sig.error_rate}`);
      }
      if (sig.resource_profile) {
        const rp = sig.resource_profile;
        lines.push(
          `- Resources: peak ${rp.peak_memory_mb?.toFixed(1) ?? '?'}MB memory, ${rp.avg_cpu_percent?.toFixed(2) ?? '?'}% CPU`,
        );
      }
      if (sig.per_tool && Object.keys(sig.per_tool).length > 0) {
        lines.push(`- Per-tool stats: ${Object.keys(sig.per_tool).length} tools profiled`);
        for (const [tool, stats] of Object.entries(sig.per_tool).slice(0, 5)) {
          lines.push(
            `  - ${tool}: p50=${stats.p50_ms ?? '?'}ms, p95=${stats.p95_ms ?? '?'}ms, errors=${stats.error_rate ?? 0}, n=${stats.sample_count ?? '?'}`,
          );
        }
        if (Object.keys(sig.per_tool).length > 5) {
          lines.push(`  - ... and ${Object.keys(sig.per_tool).length - 5} more tools`);
        }
      }
      lines.push('');
    }

    // ── OWASP MCP Top 10 ─────────────────────────────────────────
    const owasp = contract.owasp_mcp_coverage;
    if (owasp && Object.keys(owasp).length > 0) {
      lines.push('### OWASP MCP Top 10 Coverage');
      for (const [id, entry] of Object.entries(owasp)) {
        const status = entry.covered ? 'covered' : 'not covered';
        lines.push(`- ${id}: ${status}${entry.evidence ? ` (${entry.evidence})` : ''}`);
      }
      lines.push('');
    }

    lines.push(
      `Full details: ${data.record_url || `https://fidensa.com/certifications/${capability_id}`}`,
    );

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
