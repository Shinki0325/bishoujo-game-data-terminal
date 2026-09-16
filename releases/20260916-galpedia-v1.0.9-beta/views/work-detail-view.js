import { formatReleaseDate } from '../lib/work-release-date.js';
import {cleanDisplayAliases,splitDisplayAliases} from '../lib/work-display-aliases.js';
import { applyAdaptiveImageSource } from '../lib/adaptive-image-source.js';

function formatSnapshotDate(value) {
  if (typeof value !== 'string') return '未返回';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? '未返回';
}

export function createWorkDetailView({ elements, documentRef, partitionFilters, attributeGroupIds }) {
  let coverSequence = 0;
  let aliasDisclosure = null;
  let aliasPreview = null;
  let aliasWorkId = null;
function render(work, { workAliasesById = null, onOpenCompany = null, projectEntityRuntime = null, detailMedia = null, egsSnapshotAt = null } = {}) {
  const detailVm = projectEntityRuntime?.adaptWorkDetail?.(work.workId, work) ?? work;
  elements.detailsDialog.dataset.projectEntitySource = detailVm.source ?? 'legacy';
  elements.detailsDialog.dataset.mediaClearanceStatus = work.mediaProjection?.clearanceStatus ?? 'legacy-fallback';
  elements.detailsTitle.textContent = work.title;
  elements.detailsBrand.replaceChildren();
  const brandButton = documentRef.createElement('button');
  brandButton.type = 'button';
  brandButton.className = 'details-company-link';
  brandButton.textContent = work.brandName;
  brandButton.addEventListener('click', () => onOpenCompany?.(work.brandId));
  elements.detailsBrand.append(brandButton);
  const aliases = cleanDisplayAliases(work.fullWikiDisplayAliases ?? workAliasesById?.get?.(work.workId) ?? [], work.title);
  const {visible: visibleAliases, more: moreAliases} = splitDisplayAliases(aliases);
  if (!aliasDisclosure) {
    aliasPreview = documentRef.createElement('p');
    aliasPreview.className = 'details-work-alias-preview';
    aliasDisclosure = documentRef.createElement('details');
    aliasDisclosure.className = 'details-work-alias-disclosure';
    const heading = documentRef.createElement('summary');
    elements.detailsAliases.before(aliasPreview, aliasDisclosure);
    aliasDisclosure.append(heading, elements.detailsAliases);
    elements.detailsAliases.tabIndex = 0;
    elements.detailsAliases.setAttribute('aria-label', '更多作品别名');
  }
  aliasPreview.hidden = visibleAliases.length === 0;
  aliasPreview.textContent = visibleAliases.length ? `别名：${visibleAliases.join(' / ')}` : '';
  elements.detailsAliases.hidden = moreAliases.length === 0;
  elements.detailsAliases.textContent = moreAliases.join(' / ');
  aliasDisclosure.hidden = moreAliases.length === 0;
  if (aliasWorkId !== String(work.workId)) {
    aliasDisclosure.open = false;
    aliasWorkId = String(work.workId);
  }
  aliasDisclosure.querySelector('summary').textContent = `更多别名（${moreAliases.length}）`;

  const coverToken = String(++coverSequence);
  elements.detailsCover.dataset.coverToken = coverToken;
  elements.detailsCover.disabled = true;
  elements.detailsCoverImage.hidden = true;
  elements.detailsCoverImage.alt = '';
  elements.detailsCoverImage.removeAttribute('src');
  elements.detailsCover.onclick = () => {
    void detailMedia?.open?.(work);
  };
  const coverUrlRequest = detailMedia?.coverSources?.(work);
  if (coverUrlRequest !== undefined) {
    void coverUrlRequest.then(({ thumbnailUrl, previewUrl }) => {
      if (String(coverSequence) !== coverToken) return;
      applyAdaptiveImageSource(elements.detailsCoverImage, { thumbnailUrl, previewUrl });
      elements.detailsCoverImage.alt = `${work.title} 作品图片`;
      elements.detailsCoverImage.hidden = false;
      elements.detailsCover.disabled = false;
    }).catch(() => {
      if (String(coverSequence) !== coverToken) return;
      applyAdaptiveImageSource(elements.detailsCoverImage, { thumbnailUrl: detailMedia.fallbackUrl });
      elements.detailsCoverImage.alt = `${work.title} 图片不可用`;
      elements.detailsCoverImage.hidden = false;
    });
  }
  elements.detailsRelease.textContent = formatReleaseDate(work.releaseDate);
  const createScoreSource = (label, value, snapshotText, href = null) => {
    const source = documentRef.createElement('div');
    source.className = `details-score-source details-score-source-${label.toLowerCase()}`;
    const rating = href ? documentRef.createElement('a') : documentRef.createElement('span');
    rating.className = `details-rating-line${href ? ' details-rating-link' : ''}`;
    if (href) {
      rating.href = href;
      rating.target = '_blank';
      rating.rel = 'noopener noreferrer';
    }
    const sourceLabel = documentRef.createElement('span');
    sourceLabel.className = 'details-rating-source-label';
    sourceLabel.textContent = label;
    const score = documentRef.createElement('strong');
    score.className = 'details-rating-value';
    score.dataset.hasRating = String(/^\d/u.test(value));
    const parts = /^(\d+(?:\.\d+)?) \/ (\d+) 票(?: ↗)?$/u.exec(value);
    score.textContent = parts ? parts[1] : value;
    rating.append(sourceLabel, score);
    if (parts) {
      const votes = documentRef.createElement('span');
      votes.className = 'details-rating-votes';
      votes.textContent = `${parts[2]} 票${href ? ' ↗' : ''}`;
      rating.append(votes);
    }
    const snapshot = documentRef.createElement('small');
    snapshot.className = 'details-rating-snapshot';
    snapshot.textContent = snapshotText.replace('数据快照：', '');
    snapshot.title = snapshotText;
    snapshot.setAttribute('aria-label', snapshotText);
    source.append(rating, snapshot);
    return source;
  };
  const ratingSources = [];
  const egsValue = Number.isFinite(work.median) && Number.isInteger(work.voteCount)
    ? `${work.median} / ${work.voteCount} 票`
    : '暂无评分';
  ratingSources.push(createScoreSource('EGS', egsValue, `数据快照：${formatSnapshotDate(work.egsSnapshotAt??egsSnapshotAt)}`));
  if (work.vndbRating !== undefined) {
    const voteCount = work.vndbRating.detailVotes === null
      ? null
      : String(work.vndbRating.detailVotes).replace(/\s*人评分$/u, '').trim();
    const value = work.vndbRating.detailVotes === null
      ? `${work.vndbRating.detailScore}（${work.vndbRating.statusLabel}）`
      : `${work.vndbRating.detailScore} / ${voteCount} 票`;
    ratingSources.push(createScoreSource('VNDB', value, `数据快照：${formatSnapshotDate(work.vndbRating.retrievedAt)}`));
  }
  if (work.bangumiRating !== undefined) {
    const voteCount = work.bangumiRating.detailVotes === null
      ? null
      : String(work.bangumiRating.detailVotes).replace(/\s*人评分$/u, '').trim();
    const value = work.bangumiRating.detailVotes === null
      ? `${work.bangumiRating.detailScore} ↗`
      : `${work.bangumiRating.detailScore} / ${voteCount} 票 ↗`;
    ratingSources.push(createScoreSource('Bangumi', value, `数据快照：${formatSnapshotDate(work.bangumiRating.retrievedAt)}`, work.bangumiRating.subjectUrl));
  }
  const unresolvedBangumi = work.fullWikiRatings?.bangumi?.subjectId
    ? [] : (work.fullWikiRatings?.bangumiCandidates ?? []);
  if (unresolvedBangumi.length) {
    const group = documentRef.createElement('details');
    group.className = 'details-score-source details-score-bangumi details-bangumi-matches';
    const summary = documentRef.createElement('summary');
    summary.textContent = `Bangumi · 已匹配 ${unresolvedBangumi.length} 个条目`;
    group.append(summary);
    for (const candidate of unresolvedBangumi) {
      const score = Number.isFinite(candidate.rawScore) && Number.isInteger(candidate.voteCount)
        ? `${candidate.rawScore} / ${candidate.voteCount} 票` : '暂无评分';
      const item = createScoreSource('Bangumi', `${candidate.title ?? candidate.subjectId} · ${score} ↗`,
        `数据快照：${formatSnapshotDate(candidate.retrievedAt)}`, `https://bgm.tv/subject/${candidate.subjectId}`);
      group.append(item);
    }
    ratingSources.push(group);
  }
  elements.detailsScore.replaceChildren(...ratingSources);
  const createTag = (filter, hidden = false) => {
    const item = documentRef.createElement('li');
    item.className = filter.groupId === 'character'
      ? 'details-tag-character'
      : filter.groupId === 'adult'
        ? 'details-tag-adult'
        : attributeGroupIds.has(filter.groupId)
          ? 'details-tag-attribute'
          : 'details-tag-content';
    item.textContent = filter.displayTitle;
    item.hidden = hidden;
    return item;
  };
  const { visible, collapsed } = partitionFilters(work);
  const visibleTags = visible.map(filter => createTag(filter));
  if (collapsed.length === 0) {
    elements.detailsTags.replaceChildren(...visibleTags);
  } else {
    const collapsedTags = collapsed.map(filter => createTag(filter, true));
    const controlItem = documentRef.createElement('li');
    controlItem.className = 'details-sensitive-control';
    const toggle = documentRef.createElement('button');
    toggle.type = 'button';
    toggle.className = 'details-sensitive-toggle';
    toggle.textContent = '+';
    toggle.title = '显示角色属性与成人内容标签';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? '\u2212' : '+';
      toggle.title = expanded
        ? '收起角色属性与成人内容标签'
        : '显示角色属性与成人内容标签';
      toggle.setAttribute('aria-label', toggle.title);
      for (const item of collapsedTags) item.hidden = !expanded;
    });
    controlItem.append(toggle);
    elements.detailsTags.replaceChildren(
      ...visibleTags,
      controlItem,
      ...collapsedTags
    );
  }
  if (visibleTags.length > 8) {
    const extra = visibleTags.slice(8);
    for (const item of extra) item.hidden = true;
    const control = documentRef.createElement('li');
    control.className = 'details-tags-more';
    const toggle = documentRef.createElement('button');
    toggle.type = 'button';
    toggle.textContent = `更多标签（${extra.length}）`;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? '收起标签' : `更多标签（${extra.length}）`;
      for (const item of extra) item.hidden = !expanded;
    });
    control.append(toggle);
    const sensitive = elements.detailsTags.querySelector('.details-sensitive-control');
    if (sensitive) sensitive.before(control); else elements.detailsTags.append(control);
  }
  const wasOpen = elements.detailsDialog.open;
  if (typeof elements.detailsDialog.showModal === 'function') elements.detailsDialog.showModal();
  if (!wasOpen) elements.detailsDialog.querySelector('.details-heading-actions form button')?.focus({ preventScroll: true });
}

  return Object.freeze({ render, suspend() { coverSequence++; } });
}
