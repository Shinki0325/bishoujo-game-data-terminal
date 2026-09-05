// Only owner-confirmed source crops. No full-body source or generated variants.
export function resolveKeeperPortrait(guide, { enabled = true, variant = 'avatar' } = {}) {
  if (!enabled || !guide?.showEnhancement || !guide.showPortrait) return null;
  if (!['neutral', 'smile'].includes(guide.expression) || !['avatar', 'bust'].includes(variant)) return null;
  const stem = `../brand/keeper/shiori-${guide.expression}-${variant}`;
  return Object.freeze({
    src: new URL(`${stem}.webp`, import.meta.url).href,
    srcSet: `${new URL(`${stem}.webp`, import.meta.url).href} 1x, ${new URL(`${stem}@2x.webp`, import.meta.url).href} 2x`,
    width: variant === 'avatar' ? 128 : 320,
    height: variant === 'avatar' ? 128 : 400,
    variant,
    alt: '' // Decorative: the adjacent content carries all instructions.
  });
}
