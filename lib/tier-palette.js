export const TIER_COLOR_IDS = Object.freeze([
  'crimson',
  'coral',
  'amber',
  'lime',
  'emerald',
  'cyan',
  'blue',
  'violet',
  'magenta',
  'neutral'
]);

const COLORS = Object.freeze({
  crimson: Object.freeze({ background: '#9f2f35', foreground: '#ffffff' }),
  coral: Object.freeze({ background: '#a94332', foreground: '#ffffff' }),
  amber: Object.freeze({ background: '#765000', foreground: '#ffffff' }),
  lime: Object.freeze({ background: '#4d6500', foreground: '#ffffff' }),
  emerald: Object.freeze({ background: '#176447', foreground: '#ffffff' }),
  cyan: Object.freeze({ background: '#006b73', foreground: '#ffffff' }),
  blue: Object.freeze({ background: '#285a9f', foreground: '#ffffff' }),
  violet: Object.freeze({ background: '#68479a', foreground: '#ffffff' }),
  magenta: Object.freeze({ background: '#8f3d76', foreground: '#ffffff' }),
  neutral: Object.freeze({ background: '#4f5964', foreground: '#ffffff' })
});

export const DEFAULT_TIERS = Object.freeze([
  Object.freeze({ id: 'tier-s', name: 'S', colorId: 'crimson' }),
  Object.freeze({ id: 'tier-a', name: 'A', colorId: 'coral' }),
  Object.freeze({ id: 'tier-b', name: 'B', colorId: 'amber' }),
  Object.freeze({ id: 'tier-c', name: 'C', colorId: 'emerald' }),
  Object.freeze({ id: 'tier-d', name: 'D', colorId: 'blue' })
]);

export function tierColor(colorId) {
  if (typeof colorId !== 'string' || !Object.hasOwn(COLORS, colorId)) {
    throw new RangeError(`Unknown tier color "${String(colorId)}"`);
  }
  return COLORS[colorId];
}
