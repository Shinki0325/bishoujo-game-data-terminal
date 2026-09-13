const SOURCE_LABELS = Object.freeze({ bangumi: 'Bangumi', egs: 'EGS', vndb: 'VNDB' });
const REVIEW_LABELS = Object.freeze({
  'pending-conflict': '待处理冲突',
  conflict: '待处理冲突',
  'source-only': '来源补充'
});
function nonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function textValue(entry) {
  if (!nonEmpty(entry)) return null;
  if (typeof entry === 'object' && !Array.isArray(entry)) {
    return textValue(entry.value ?? entry.text ?? entry.description ?? entry.summary);
  }
  const value = String(entry).replace(/\r\n?/gu, '\n').trim();
  if (!value) return null;
  return value;
}

function isSpoiler(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const value = entry.spoiler ?? entry.isSpoiler ?? entry.spoilerLevel ?? entry.spoilerLevelRequired;
  if (value === true) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') return /^(?:true|yes|1|spoiler|剧透)$/iu.test(value.trim()) || /^\d+$/u.test(value.trim()) && Number(value) > 0;
  return false;
}

function sourceOf(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const value = entry.source ?? entry.provider ?? entry.origin;
  if (!nonEmpty(value)) return null;
  return String(value).trim().toLowerCase();
}

function reviewOf(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const value = entry.reviewState ?? entry.review ?? (entry.conflict === true ? 'conflict' : null);
  return nonEmpty(value) ? String(value).trim() : null;
}

function appendCandidate(candidates, entry, fallbackSource = null) {
  if (Array.isArray(entry)) {
    for (const item of entry) appendCandidate(candidates, item, fallbackSource);
    return;
  }
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && Array.isArray(entry.segments)) {
    for (const segment of entry.segments) {
      appendCandidate(candidates, {
        ...(segment && typeof segment === 'object' ? segment : { text: segment }),
        source: segment?.source ?? entry.source,
        sourceCharacterId: segment?.sourceCharacterId ?? entry.sourceCharacterId,
        sourceWorkId: segment?.sourceWorkId ?? entry.sourceWorkId,
        sourceField: segment?.sourceField ?? entry.sourceField,
        reviewState: segment?.reviewState ?? entry.reviewState
      }, fallbackSource);
    }
    return;
  }
  const value = textValue(entry);
  if (!value) return;
  const objectEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  candidates.push({
    value,
    source: sourceOf(objectEntry) ?? fallbackSource,
    sourceCharacterId: nonEmpty(objectEntry.sourceCharacterId) ? String(objectEntry.sourceCharacterId) : null,
    sourceWorkId: nonEmpty(objectEntry.sourceWorkId) ? String(objectEntry.sourceWorkId) : null,
    sourceField: nonEmpty(objectEntry.sourceField) ? String(objectEntry.sourceField) : null,
    spoiler: isSpoiler(objectEntry),
    reviewState: reviewOf(objectEntry)
  });
}

/**
 * Accept the additive `descriptions` array while tolerating the singular
 * aliases used by earlier private exports. The function never chooses between
 * source values: every distinct public-safe text is retained for the UI.
 */
export function normalizeCharacterDescriptions(metadata) {
  if (!metadata || (typeof metadata !== 'object' && !Array.isArray(metadata))) return [];
  const candidates = [];
  if (Array.isArray(metadata)) appendCandidate(candidates, metadata);
  else appendCandidate(candidates, metadata.descriptions);
  if (Array.isArray(metadata)) return dedupeDescriptions(candidates);
  appendCandidate(candidates, metadata.description);
  appendCandidate(candidates, metadata.summary);
  return dedupeDescriptions(candidates);
}

function dedupeDescriptions(candidates) {
  const seen = new Set();
  return candidates.filter(entry => {
    const key = [entry.value, entry.source ?? '', entry.sourceCharacterId ?? '', entry.sourceWorkId ?? '', entry.spoiler ? '1' : '0', entry.reviewState ?? ''].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceLabel(entry) {
  return SOURCE_LABELS[entry.source] ?? entry.source ?? '来源未标注';
}

function reviewLabel(entry) {
  return REVIEW_LABELS[entry.reviewState] ?? entry.reviewState;
}

function descriptionConflict(entries) {
  const hasReviewConflict = entries.some(entry => entry.reviewState === 'pending-conflict' || entry.reviewState === 'conflict');
  const sourceCount = new Set(entries.map(entry => entry.source).filter(Boolean)).size;
  return {
    hasReviewConflict,
    hasMultipleSources: sourceCount > 1
  };
}

const DESCRIPTION_SOURCE_ORDER = Object.freeze(['bangumi', 'egs', 'vndb']);

export function groupCharacterDescriptions(metadata) {
  const grouped = new Map();
  for (const entry of normalizeCharacterDescriptions(metadata)) {
    const key = entry.source || '';
    if (!grouped.has(key)) grouped.set(key, { source: entry.source, entries: [] });
    grouped.get(key).entries.push(entry);
  }
  const rank = source => {
    const position = DESCRIPTION_SOURCE_ORDER.indexOf(source);
    return position < 0 ? DESCRIPTION_SOURCE_ORDER.length : position;
  };
  return [...grouped.values()].sort((a, b) => rank(a.source) - rank(b.source));
}

function sourceEvidence(documentRef, group) {
  const node = documentRef.createElement('details');
  node.className = 'details-cast-description-provenance';
  const heading = documentRef.createElement('summary');
  heading.textContent = '来源信息';
  const evidence = documentRef.createElement('small');
  const identities = [...new Set(group.entries.map(entry => [
    entry.sourceCharacterId && `角色ID：${entry.sourceCharacterId}`,
    entry.sourceWorkId && `作品/版本ID：${entry.sourceWorkId}`,
    reviewLabel(entry)
  ].filter(Boolean).join(' · ')).filter(Boolean))];
  evidence.textContent = [`来源：${sourceLabel(group)}`, ...identities].join('；');
  node.append(heading, evidence);
  return node;
}

function sourceDescriptionBody(documentRef, group) {
  const article = documentRef.createElement('article');
  article.className = 'details-cast-description-entry';
  article.dataset.source = group.source || 'unknown';
  const contexts = new Map();
  for (const entry of group.entries) {
    const key = JSON.stringify([entry.sourceCharacterId, entry.sourceWorkId]);
    if (!contexts.has(key)) contexts.set(key, []);
    contexts.get(key).push(entry);
  }
  for (const entries of contexts.values()) {
    if (contexts.size > 1) {
      const context = documentRef.createElement('small');
      context.className = 'details-cast-description-context';
      context.textContent = [entries[0].sourceCharacterId && `角色ID：${entries[0].sourceCharacterId}`,
        entries[0].sourceWorkId && `作品/版本ID：${entries[0].sourceWorkId}`].filter(Boolean).join(' · ');
      article.append(context);
    }
    const plain = entries.filter(entry => !entry.spoiler).map(entry => entry.value);
    if (plain.length) {
      const paragraph = documentRef.createElement('p');
      paragraph.className = 'details-cast-description-text';
      paragraph.textContent = plain.join('\n\n');
      article.append(paragraph);
    }
    const spoilers = entries.filter(entry => entry.spoiler).map(entry => entry.value);
    if (spoilers.length) {
      const details = documentRef.createElement('details');
      details.className = 'details-cast-description-spoiler';
      details.dataset.spoiler = 'true';
      const summary = documentRef.createElement('summary');
      summary.textContent = '含剧透内容';
      const paragraph = documentRef.createElement('p');
      paragraph.textContent = spoilers.join('\n\n');
      details.append(summary, paragraph);
      article.append(details);
    }
  }
  article.append(sourceEvidence(documentRef, group));
  return article;
}

/** Show one preferred source and keep alternatives and spoilers collapsed. */
export function characterDescription(documentRef, metadata) {
  const groups = groupCharacterDescriptions(metadata);
  if (!groups.length) return null;
  const wrapper = documentRef.createElement('details');
  wrapper.className = 'details-cast-description';
  wrapper.dataset.preferredSource = groups[0].source || 'unknown';
  wrapper.setAttribute('aria-label', '角色简介');
  const heading = documentRef.createElement('summary');
  heading.className = 'details-cast-description-heading';
  const title = documentRef.createElement('strong');
  title.textContent = '简介';
  const source = documentRef.createElement('small');
  source.className = 'details-cast-description-source-count';
  source.textContent = sourceLabel(groups[0]);
  heading.append(title, source);
  wrapper.append(heading, sourceDescriptionBody(documentRef, groups[0]));
  for (const group of groups.slice(1)) {
    const alternative = documentRef.createElement('details');
    alternative.className = 'details-cast-description-alternative';
    alternative.dataset.source = group.source || 'unknown';
    const summary = documentRef.createElement('summary');
    summary.textContent = `${sourceLabel(group)} 的简介`;
    alternative.append(summary, sourceDescriptionBody(documentRef, group));
    wrapper.append(alternative);
  }
  if (groups.some(group => group.entries.some(entry => ['pending-conflict', 'conflict'].includes(entry.reviewState)))) {
    wrapper.dataset.conflict = 'true';
    const notice = documentRef.createElement('small');
    notice.className = 'details-cast-description-conflict';
    notice.textContent = '来源存在待核对差异';
    wrapper.append(notice);
  }
  return wrapper;
}

function normalizeProfileFact(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const label = textValue(entry.label);
  const value = textValue(entry.value);
  if (!label || !value) return null;
  return {
    label,
    value,
    source: sourceOf(entry),
    sourceCharacterId: nonEmpty(entry.sourceCharacterId) ? String(entry.sourceCharacterId).trim() : null,
    sourceWorkId: nonEmpty(entry.sourceWorkId) ? String(entry.sourceWorkId).trim() : null,
    sourceField: nonEmpty(entry.sourceField) ? String(entry.sourceField).trim() : null,
    valueContext: nonEmpty(entry.valueContext ?? entry.context) ? String(entry.valueContext ?? entry.context).trim() : null
  };
}

export function normalizeProfileFacts(facts) {
  if (!Array.isArray(facts)) return [];
  const seen = new Set();
  const normalized = [];
  for (const raw of facts) {
    const fact = normalizeProfileFact(raw);
    if (!fact) continue;
    const key = [fact.label, fact.value, fact.source ?? '', fact.sourceCharacterId ?? '', fact.sourceWorkId ?? '', fact.sourceField ?? ''].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(fact);
  }
  return normalized;
}

/** Render source-bound non-identity facts behind an explicit collapsed disclosure. */
export function profileFactsView(documentRef, facts) {
  const entries = normalizeProfileFacts(facts);
  if (entries.length === 0) return null;
  const details = documentRef.createElement('details');
  details.className = 'details-cast-profile-facts';
  const summary = documentRef.createElement('summary');
  summary.textContent = '其他资料';
  details.append(summary);
  const list = documentRef.createElement('dl');
  list.className = 'details-cast-profile-facts-list';
  for (const entry of entries) {
    const row = documentRef.createElement('div');
    row.className = 'details-cast-profile-fact';
    const label = documentRef.createElement('dt');
    label.textContent = entry.label;
    const value = documentRef.createElement('dd');
    value.textContent = entry.value;
    if (entry.source || entry.sourceCharacterId || entry.sourceWorkId || entry.sourceField || entry.valueContext) {
      const provenance = documentRef.createElement('small');
      provenance.className = 'details-cast-profile-fact-provenance';
      const parts = [];
      if (entry.source) parts.push(`来源：${sourceLabel(entry)}`);
      if (entry.sourceCharacterId) parts.push(`角色ID：${entry.sourceCharacterId}`);
      if (entry.sourceWorkId) parts.push(`作品/版本ID：${entry.sourceWorkId}`);
      if (entry.valueContext) parts.push(entry.valueContext === '原文' ? '来源原文' : entry.valueContext);
      provenance.textContent = `（${parts.join('；')}）`;
      value.append(provenance);
    }
    row.append(label, value);
    list.append(row);
  }
  details.append(list);
  return details;
}

function candidateConflictEntries(metadata) {
  if (Array.isArray(metadata)) return metadata.filter(Boolean);
  const candidates = metadata?.metadataCandidateConflicts ?? metadata?.candidateConflicts ?? metadata;
  if (Array.isArray(candidates)) return candidates.filter(Boolean);
  if (!candidates || typeof candidates !== 'object') return [];
  return Object.entries(candidates)
    .filter(([, evidence]) => Array.isArray(evidence) ? evidence.length > 0 : nonEmpty(evidence))
    .map(([field, evidence]) => ({ field, evidence }));
}

/** Show a bounded, source-neutral warning when conflict evidence is retained. */
export function metadataConflictNotice(documentRef, metadata) {
  const conflicts = candidateConflictEntries(metadata);
  if (conflicts.length === 0) return null;
  const notice = documentRef.createElement('small');
  notice.className = 'details-cast-metadata-conflict';
  notice.dataset.conflictCount = String(conflicts.length);
  notice.textContent = `存在待处理属性冲突（${conflicts.length} 项）`;
  return notice;
}

export const CHARACTER_ENRICHMENT_UI_SCHEMA = 'terminal-wiki-character-enrichment-ui-v1';
