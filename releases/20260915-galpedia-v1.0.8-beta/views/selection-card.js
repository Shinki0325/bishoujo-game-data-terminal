import { applyImageAsset, AssetUrlError, resetExternalCoverImageRecovery } from '../lib/asset-url-core.js';
import { applyAdaptiveImageSource } from '../lib/adaptive-image-source.js';
import { DEFAULT_SELECTION_CARD_DISPLAY, normalizeSelectionCardDisplay } from '../lib/selection-card-presentation.js';
import { createActionIcon } from '../lib/action-icons.js';
import { formatReleaseDate, releaseDateInfo, RELEASE_STATUS } from '../lib/work-release-date.js';

const CARD_VIEWS = new Set(['full', 'compact']);
const VNDB_SORT_KEYS = new Set(['vndbScore', 'vndbVoteCount']);
const BANGUMI_SORT_KEYS = new Set(['bangumiScore', 'bangumiVoteCount']);

function egsRatingText(work) {
  if (!Number.isFinite(work.median) || !Number.isInteger(work.voteCount)) return 'EGS 暂无评分';
  return `EGS ${work.median}`;
}

function releaseDateText(work) {
  return formatReleaseDate(work.releaseDate);
}

function bangumiRatingText(rating) {
  if (rating === null || typeof rating !== 'object') return null;
  return `BGM ${rating.detailScore ?? '暂无评分'}`;
}

export function mobileCardRating(work, sortKey = 'median') {
  if (VNDB_SORT_KEYS.has(sortKey)) {
    return Object.freeze({
      source: 'vndb',
      text: work.vndbRating?.cardText ?? 'VNDB 暂无评分'
    });
  }
  if (BANGUMI_SORT_KEYS.has(sortKey)) {
    return Object.freeze({
      source: 'bangumi',
      text: bangumiRatingText(work.bangumiRating) ?? 'BGM 暂无评分'
    });
  }
  return Object.freeze({ source: 'egs', text: egsRatingText(work) });
}

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function appendTextElement(documentRef, parent, tagName, className, text) {
  const element = documentRef.createElement(tagName);
  element.className = className;
  element.textContent = String(text);
  parent.append(element);
  return element;
}

// Keep the source's display text and scale intact while giving the number
// its own typographic emphasis (including non-numeric unavailable states).
function appendCardRating(documentRef, parent, className, text) {
  const rating = appendTextElement(documentRef, parent, 'span', className, '');
  const [source, ...value] = String(text).split(' ');
  appendTextElement(documentRef, rating, 'span', 'selection-card-rating-source', `${source} `);
  appendTextElement(documentRef, rating, 'strong', 'selection-card-rating-value', value.join(' '));
  return rating;
}

function installMissingImageFallback(documentRef, card, image, {knownMissing = false, title = ''} = {}) {
  const thumbnailUrl = image.getAttribute?.('src') || image.src;
  let fallback = null;
  const clearFailure = () => {
    card.classList.remove('is-image-missing');
    image.hidden = false;
    fallback?.remove();
    fallback = null;
  };
  image.addEventListener('load', () => { if (image.naturalWidth > 0) clearFailure(); });
  image.addEventListener('error', () => {
    if (image.complete && image.naturalWidth > 0) return;
    if (card.classList.contains('is-image-missing')) return;
    image.removeAttribute?.('srcset');
    image.removeAttribute?.('sizes');
    image.src = '';
    image.removeAttribute?.('src');
    image.hidden = true;
    card.classList.add('is-image-missing');
    fallback = documentRef.createElement('span');
    fallback.className = 'selection-card-missing-image';
    if (knownMissing) {
      fallback.textContent = '封面缺失';
      fallback.setAttribute('aria-hidden', 'true');
    } else {
      appendTextElement(documentRef, fallback, 'span', 'selection-card-image-error', '封面加载失败');
      const retry = appendTextElement(documentRef, fallback, 'button', 'selection-card-image-retry', '重试');
      retry.type = 'button';
      retry.setAttribute('aria-label', `重新加载 ${title} 的封面`);
      retry.addEventListener('click', event => {
        event.stopPropagation();
        if (card.isConnected === false) return;
        if (documentRef.activeElement === retry) card.querySelector?.('.selection-card-cover')?.focus({preventScroll:true});
        clearFailure();
        resetExternalCoverImageRecovery(image);
        image.loading = 'eager';
        image.src = thumbnailUrl;
      });
    }
    card.append(fallback);
  });
}

export function createSelectionCard(documentRef, work, {
  view,
  selected,
  onToggle,
  onOpenDetails,
  assetBase,
  imageAsset = applyImageAsset,
  coverUrl = null,
  previewUrl = null,
  eagerCover = false,
  priorityCover = false,
  cardSize = null,
  display = DEFAULT_SELECTION_CARD_DISPLAY,
  mobileSortKey = 'median',
  selectionEnabled = true,
  isSelectionEnabled = () => Boolean(selectionEnabled),
  isSelected = () => Boolean(selected),
  selectionHotspots = false,
  isCardActive = () => true,
  onCompare = null,
  compared = false,
  isCompared = () => Boolean(compared),
  compareMode = false
}) {
  if (documentRef === null || typeof documentRef?.createElement !== 'function') {
    throw new TypeError('documentRef must provide createElement');
  }
  if (work === null || typeof work !== 'object' || Array.isArray(work)) {
    throw new TypeError('work must be an object');
  }
  if (!CARD_VIEWS.has(view)) throw new RangeError('view must be full or compact');
  assertFunction(onToggle, 'onToggle');
  assertFunction(onOpenDetails, 'onOpenDetails');
  assertFunction(isSelectionEnabled, 'isSelectionEnabled');
  assertFunction(isSelected, 'isSelected');
  assertFunction(isCardActive, 'isCardActive');
  assertFunction(isCompared, 'isCompared');
  const shouldToggleFromCardSurface = () => selectionHotspots && isSelectionEnabled();
  const cardDisplay = normalizeSelectionCardDisplay(display);

  const displayTitle = typeof work.displayTitle === 'string' && work.displayTitle.length > 0
    ? work.displayTitle
    : work.title;
  const card = documentRef.createElement('article');
  card.className = `selection-card selection-card-${view}`;
  card.classList.toggle('is-compare-mode', Boolean(compareMode));
  card.classList.toggle('is-selected', Boolean(selected));
  card.classList.toggle('is-selectable', Boolean(selectionEnabled));
  card.dataset.workId = work.workId;
  card.setAttribute('aria-label', `查看 ${displayTitle} 详情`);
  // Compare selections can change without rebuilding the current page. Read
  // the live collection supplied by the owner instead of a stale render flag
  // or button class so a second click always removes the current work.
  const currentCompared = () => isCompared();
  card.addEventListener('click', () => {
    if (!isCardActive()) return;
    if (compareMode && typeof onCompare === 'function') {
      onCompare(work, !currentCompared());
      return;
    }
    if (isSelectionEnabled()) onToggle(work, !isSelected());
    else onOpenDetails(work);
  });

  const image = documentRef.createElement('img');
  image.loading = eagerCover ? 'eager' : 'lazy';
  image.fetchPriority = priorityCover ? 'high' : 'auto';
  if (typeof coverUrl === 'string' && coverUrl.length > 0) {
    if (!coverUrl.startsWith('blob:')) image.crossOrigin = 'anonymous';
    const resolvedCardSize = cardSize ?? (documentRef.defaultView?.getComputedStyle?.(documentRef.documentElement)
      .getPropertyValue('--selection-card-size')?.trim() || '180px');
    applyAdaptiveImageSource(image, { thumbnailUrl: coverUrl, previewUrl,
      thumbnailWidth: work.coverWidth, previewWidth: work.previewWidth,
      sizes: `${eagerCover ? '' : 'auto, '}(max-width: 720px) calc((100vw - 44px) / 3), ${resolvedCardSize}` });
  } else {
    try {
      imageAsset(image, work, assetBase);
    } catch (error) {
      if (error instanceof AssetUrlError) {
        throw new TypeError('work.coverPath must use the approved public asset path');
      }
      throw error;
    }
  }
  image.alt = '';
  image.decoding = 'async';
  installMissingImageFallback(documentRef, card, image, {
    knownMissing: work.coverPath === 'assets/cover-unavailable.webp' && !work.projectedThumbnailPath && !coverUrl?.startsWith('blob:'),
    title: displayTitle
  });

  const cover = documentRef.createElement('button');
  cover.type = 'button';
  cover.className = 'selection-card-cover';
  cover.dataset.controlType = 'details';
  cover.setAttribute('aria-label', `查看 ${displayTitle} 详情`);
  cover.title = `查看 ${displayTitle} 详情`;
  cover.addEventListener('click', event => {
    event.stopPropagation();
    if (!isCardActive()) return;
    if (compareMode && typeof onCompare === 'function') {
      onCompare(work, !currentCompared());
      return;
    }
    if (shouldToggleFromCardSurface()) onToggle(work, !isSelected());
    else onOpenDetails(work);
  });
  cover.append(image);

  let checkbox = null;
  if (selectionEnabled) {
    checkbox = documentRef.createElement('input');
    checkbox.className = 'selection-card-checkbox';
    checkbox.type = 'checkbox';
    checkbox.dataset.controlType = 'checkbox';
    checkbox.checked = Boolean(selected);
    checkbox.setAttribute('aria-label', `${selected ? '取消选择' : '选择'} ${displayTitle}`);
    checkbox.addEventListener('click', event => event.stopPropagation());
  checkbox.addEventListener('change', event => {
      event.stopPropagation();
      if (!isCardActive()) {
        checkbox.checked = Boolean(isSelected());
        return;
      }
      if (isSelectionEnabled()) onToggle(work, checkbox.checked);
      else checkbox.checked = Boolean(isSelected());
    });
    checkbox.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    });
  }

  const overlay = documentRef.createElement('div');
  overlay.className = 'selection-card-overlay';
  if (cardDisplay.showTitle) {
    const title = appendTextElement(documentRef, overlay, 'p', 'selection-card-title', displayTitle);
    title.title = displayTitle;
  }
  // Compact cards in the ranking candidate drawer retain their legacy overlay.
  const metadata = view === 'full' ? documentRef.createElement('div') : overlay;
  if (metadata !== overlay) metadata.className = 'selection-card-metadata';
  if (cardDisplay.showCompany && typeof work.brandName === 'string' && work.brandName.length > 0) {
    const company = appendTextElement(documentRef, metadata, 'p', 'selection-card-company', work.brandName);
    company.title = work.brandName;
  }
  const releaseInfo = releaseDateInfo(work.releaseDate);
  const year = cardDisplay.showYear || releaseInfo.kind !== RELEASE_STATUS.RELEASED
    ? releaseDateText(work)
    : null;
  const yearBadge = year === null ? null : documentRef.createElement('span');
  if (yearBadge !== null) {
    yearBadge.className = 'selection-card-year';
    yearBadge.textContent = year;
    if (view === 'full') metadata.append(yearBadge);
  }
  if (metadata !== overlay && metadata.children.length > 0) overlay.append(metadata);
  if (cardDisplay.showEgs || (cardDisplay.showVndb && work.vndbRating != null) || (cardDisplay.showBangumi && work.bangumiRating !== undefined)) {
    const ratings = documentRef.createElement('div');
    ratings.className = 'selection-card-rating-lines';
    if (cardDisplay.showEgs) {
      appendCardRating(documentRef, ratings, 'selection-card-rating-line selection-card-egs-rating', egsRatingText(work));
    }
    if (cardDisplay.showVndb && work.vndbRating != null) {
      appendCardRating(documentRef, ratings, 'selection-card-rating-line selection-card-vndb-rating', work.vndbRating.cardText);
    }
    if (cardDisplay.showBangumi && work.bangumiRating !== undefined) {
      const text = bangumiRatingText(work.bangumiRating);
      if (text !== null) appendCardRating(documentRef, ratings, 'selection-card-rating-line selection-card-bangumi-rating', text);
    }
    overlay.append(ratings);
  }
  const hasOverlayContent = overlay.children.length > 0;

  let versionBadge = null;
  if (Number.isInteger(work.presentationMemberCount) && work.presentationMemberCount > 1) {
    versionBadge = documentRef.createElement('span');
    versionBadge.className = 'selection-card-version-badge';
    versionBadge.setAttribute('aria-label', `${work.presentationMemberCount} 个公开版本`);
    versionBadge.append(createActionIcon(documentRef, 'layers-2'));
    appendTextElement(documentRef, versionBadge, 'span', 'selection-card-version-count', work.presentationMemberCount);
  }

  const mobileRating = mobileCardRating(work, mobileSortKey);
  const mobileRatingBadge = documentRef.createElement('span');
  mobileRatingBadge.className = 'selection-card-mobile-rating';
  mobileRatingBadge.dataset.source = mobileRating.source;
  mobileRatingBadge.textContent = mobileRating.text;
  mobileRatingBadge.setAttribute('aria-label', `当前排序来源评分：${mobileRating.text}`);
  card.classList.toggle('has-selection-card-year', yearBadge !== null);
  card.classList.toggle('has-scheduled-release', releaseInfo.kind === RELEASE_STATUS.UNRELEASED);
  card.append(
    cover,
    ...(versionBadge === null ? [] : [versionBadge]),
    ...(checkbox === null ? [] : [checkbox]),
    ...(hasOverlayContent ? [overlay] : []),
    mobileRatingBadge,
    ...(view === 'compact' && yearBadge !== null ? [yearBadge] : [])
  );
  if (typeof onCompare === 'function') {
    const compareButton = documentRef.createElement('button');
    compareButton.type = 'button';
    compareButton.className = 'selection-card-compare';
    compareButton.dataset.controlType = 'compare';
    compareButton.classList.toggle('is-compared', Boolean(compared));
    compareButton.textContent = compared ? '已加入比较' : '加入比较';
    compareButton.setAttribute('aria-pressed', String(Boolean(compared)));
    compareButton.setAttribute('aria-label', `${compared ? '移出' : '加入'}比较：${displayTitle}`);
    compareButton.addEventListener('click', event => {
      event.stopPropagation();
      if (!isCardActive()) return;
      onCompare(work, !currentCompared());
    });
    card.append(compareButton);
  }
  if (selected && !selectionEnabled) {
    const marker = documentRef.createElement('span');
    marker.className = 'selection-card-selected-mark';
    marker.textContent = '已选';
    marker.setAttribute('aria-label', '已选');
    card.append(marker);
  }
  return card;
}
