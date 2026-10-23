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

const CUSTOM_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const CUSTOM_COLORS = new Map();

export const DEFAULT_TIERS = Object.freeze([
  Object.freeze({ id: 'tier-s', name: 'S', colorId: 'crimson' }),
  Object.freeze({ id: 'tier-a', name: 'A', colorId: 'coral' }),
  Object.freeze({ id: 'tier-b', name: 'B', colorId: 'amber' }),
  Object.freeze({ id: 'tier-c', name: 'C', colorId: 'emerald' }),
  Object.freeze({ id: 'tier-d', name: 'D', colorId: 'blue' })
]);

export function normalizeTierColor(colorId) {
  if (typeof colorId !== 'string') {
    throw new RangeError(`Unknown tier color "${String(colorId)}"`);
  }
  if (Object.hasOwn(COLORS, colorId)) return colorId;
  if (!CUSTOM_COLOR_PATTERN.test(colorId)) {
    throw new RangeError(`Unknown tier color "${String(colorId)}"`);
  }
  return colorId.toLowerCase();
}

function customColor(colorId) {
  const existing = CUSTOM_COLORS.get(colorId);
  if (existing) return existing;
  const channels = [
    Number.parseInt(colorId.slice(1, 3), 16),
    Number.parseInt(colorId.slice(3, 5), 16),
    Number.parseInt(colorId.slice(5, 7), 16)
  ];
  const luminance = channels.reduce((total, channel, index) => {
    const value = channel / 255;
    const linear = value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
    return total + (linear * [0.2126, 0.7152, 0.0722][index]);
  }, 0);
  const foreground = (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05)
    ? '#000000'
    : '#ffffff';
  const palette = Object.freeze({ background: colorId, foreground });
  CUSTOM_COLORS.set(colorId, palette);
  return palette;
}

export function isTierColor(colorId) {
  try {
    normalizeTierColor(colorId);
    return true;
  } catch {
    return false;
  }
}

export function tierColor(colorId) {
  const normalized = normalizeTierColor(colorId);
  return Object.hasOwn(COLORS, normalized) ? COLORS[normalized] : customColor(normalized);
}
