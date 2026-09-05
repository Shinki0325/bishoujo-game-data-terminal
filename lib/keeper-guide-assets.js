// Only owner-confirmed source crops. No full-body source or generated variants.
// Literal URLs are intentional: the immutable packager can discover every asset.
const CROPS = Object.freeze({
  'neutral-avatar': [new URL('../brand/keeper/shiori-neutral-avatar.webp', import.meta.url).href, new URL('../brand/keeper/shiori-neutral-avatar@2x.webp', import.meta.url).href],
  'neutral-bust': [new URL('../brand/keeper/shiori-neutral-bust.webp', import.meta.url).href, new URL('../brand/keeper/shiori-neutral-bust@2x.webp', import.meta.url).href],
  'smile-avatar': [new URL('../brand/keeper/shiori-smile-avatar.webp', import.meta.url).href, new URL('../brand/keeper/shiori-smile-avatar@2x.webp', import.meta.url).href],
  'smile-bust': [new URL('../brand/keeper/shiori-smile-bust.webp', import.meta.url).href, new URL('../brand/keeper/shiori-smile-bust@2x.webp', import.meta.url).href]
});
export const KEEPER_PORTRAIT_MANIFEST_URL = new URL('../brand/keeper/manifest.json', import.meta.url).href;
export function resolveKeeperPortrait(guide, { enabled = true, variant = 'avatar' } = {}) {
  if (!enabled || !guide?.showEnhancement || !guide.showPortrait) return null;
  if (!['neutral', 'smile'].includes(guide.expression) || !['avatar', 'bust'].includes(variant)) return null;
  const [src, highResolution] = CROPS[`${guide.expression}-${variant}`];
  return Object.freeze({
    src,
    srcSet: `${src} 1x, ${highResolution} 2x`,
    width: variant === 'avatar' ? 128 : 320,
    height: variant === 'avatar' ? 128 : 400,
    variant,
    alt: '' // Decorative: the adjacent content carries all instructions.
  });
}
