/**
 * Deterministic normalization and merging for single- and dual-model results.
 */

const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));

export function scoreResult(result) {
  return clamp(result?.score);
}

export function confidenceFor(result, source = 'unknown') {
  if (typeof result?.confidence === 'number') return clamp(result.confidence);
  if (source === 'vision' || source === 'text') return result ? 70 : 0;
  return result ? 60 : 0;
}

export function normalizeResult(result, source = 'unknown', confidence) {
  const value = result && typeof result === 'object' ? result : {};
  return {
    ...value,
    score: scoreResult(value),
    summary: String(value.summary || ''),
    issues: Array.isArray(value.issues) ? value.issues : [],
    positives: Array.isArray(value.positives) ? value.positives : [],
    source,
    confidence: confidence ?? confidenceFor(value, source)
  };
}

function stableIssueKey(issue) {
  return [
    issue.element || '',
    issue.description || '',
    issue.recommendation || ''
  ].join('|').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Merge text and vision evaluations without depending on completion order.
 * Vision findings are additive; duplicate findings retain the stronger severity.
 */
export function mergeResults(results = []) {
  const normalized = results.filter(Boolean).map(item =>
    item.source ? normalizeResult(item, item.source, item.confidence) : normalizeResult(item)
  );
  if (!normalized.length) return normalizeResult({}, 'none', 0);
  const score = Math.round(normalized.reduce((sum, item) => sum + scoreResult(item), 0) / normalized.length);
  const issueMap = new Map();
  normalized.forEach(item => (item.issues || []).forEach(issue => {
    const key = stableIssueKey(issue);
    const existing = issueMap.get(key);
    if (!existing || severityRank(issue.severity) < severityRank(existing.severity)) {
      issueMap.set(key, { ...issue, sources: [...new Set([...(existing?.sources || []), item.source])] });
    } else {
      existing.sources = [...new Set([...(existing.sources || []), item.source])];
    }
  }));
  return normalizeResult({
    score,
    summary: normalized.map(item => item.summary).filter(Boolean).join(' '),
    issues: [...issueMap.values()].sort((a, b) => stableIssueKey(a).localeCompare(stableIssueKey(b))),
    positives: [...new Set(normalized.flatMap(item => item.positives || []))],
    scoreJustification: normalized.map(item => item.scoreJustification).filter(Boolean).join(' ')
  }, normalized.map(item => item.source).sort().join('+'), Math.round(
    normalized.reduce((sum, item) => sum + confidenceFor(item, item.source), 0) / normalized.length
  ));
}

function severityRank(severity) {
  return { critical: 0, moderate: 1, minor: 2 }[severity] ?? 1;
}
