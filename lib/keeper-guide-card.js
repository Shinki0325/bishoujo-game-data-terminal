/**
 * Small, content-first Keeper guide surface.
 *
 * The first release deliberately has no default portrait. An approved asset
 * index may provide `imageUrl` later without changing the card contract.
 */
export function createKeeperGuideCard({
  documentRef = document,
  guideId,
  domGuideId = guideId,
  title,
  body,
  eyebrow = '庭守提示',
  actionLabel,
  onAction,
  helpArticleId = '',
  helpLabel = '查看说明',
  dismissLabel = '知道了',
  onDismiss,
  imageUrl = '',
  imageAlt = '',
  assetIndex = null,
  assetKey = '',
  enhanced = true
} = {}) {
  const node = (tag, className, text) => {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const card = node('aside', 'keeper-guide-card');
  if (!enhanced) card.classList.add('is-base');
  if (guideId || domGuideId) {
    card.dataset.guideId = guideId || domGuideId;
    card.dataset.keeperGuide = domGuideId || guideId;
  }
  card.setAttribute('aria-label', title || eyebrow);
  const copy = node('div', 'keeper-guide-card-copy');
  if (enhanced && eyebrow) copy.append(node('span', 'keeper-guide-card-eyebrow', eyebrow));
  if (enhanced && title) copy.append(node('h3', 'keeper-guide-card-title', title));
  copy.append(node('p', 'keeper-guide-card-body', body || ''));
  const actions = node('div', 'keeper-guide-card-actions');
  if (actionLabel && typeof onAction === 'function') {
    const action = node('button', 'toolbar-button toolbar-button-primary', actionLabel);
    action.type = 'button';
    action.dataset.ui = 'primary';
    action.dataset.keeperAction = domGuideId || guideId || '';
    action.addEventListener('click', onAction);
    actions.append(action);
  }
  if (helpArticleId) {
    const help = node('button', 'keeper-guide-help', helpLabel);
    help.type = 'button'; help.dataset.ui = 'utility'; help.dataset.helpArticle = helpArticleId;
    actions.append(help);
  }
  if (dismissLabel && typeof onDismiss === 'function') {
    const dismiss = node('button', 'toolbar-button toolbar-button-neutral', dismissLabel);
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', '隐藏本条引导');
    dismiss.dataset.ui = 'utility';
    dismiss.dataset.keeperDismiss = domGuideId || guideId || '';
    dismiss.addEventListener('click', onDismiss);
    actions.append(dismiss);
  }
  if (actions.childElementCount) copy.append(actions);
  const indexedAsset = assetIndex && typeof assetIndex === 'object' ? assetIndex[assetKey] : null;
  const resolvedImageUrl = imageUrl || (typeof indexedAsset === 'string' ? indexedAsset : indexedAsset?.url) || '';
  if (typeof resolvedImageUrl === 'string' && resolvedImageUrl.length > 0) {
    const media = node('div', 'keeper-guide-card-media');
    const image = node('img', 'keeper-guide-card-image');
    image.src = resolvedImageUrl;
    image.alt = imageAlt || indexedAsset?.alt || '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 84;
    image.height = 112;
    image.addEventListener('error', () => media.remove(), { once: true });
    media.append(image);
    card.append(media);
  }
  card.append(copy);
  return card;
}

export function replaceKeeperGuideCard(root, options) {
  if (!root) return null;
  const card = createKeeperGuideCard(options);
  root.replaceChildren(card);
  root.hidden = false;
  return card;
}
