export const SELECTION_CARD_PRESENTATION_KEY = 'egs-tier-terminal:selection-card-presentation-v1';

export const DEFAULT_SELECTION_CARD_DISPLAY = Object.freeze({
  showTitle: true,
  showEgs: true,
  showVndb: true,
  showBangumi: true,
  showYear: true
});

const DISPLAY_KEYS = Object.freeze(Object.keys(DEFAULT_SELECTION_CARD_DISPLAY));

export function normalizeSelectionCardDisplay(value = null) {
  const normalized = {};
  for (const key of DISPLAY_KEYS) {
    normalized[key] = value !== null && typeof value === 'object' && value[key] === false
      ? false
      : DEFAULT_SELECTION_CARD_DISPLAY[key];
  }
  return Object.freeze(normalized);
}

export function createSelectionCardPresentation({ read, write, storageKey = SELECTION_CARD_PRESENTATION_KEY }) {
  if (typeof read !== 'function' || typeof write !== 'function') {
    throw new TypeError('read and write must be functions');
  }
  if (typeof storageKey !== 'string' || storageKey.length === 0) {
    throw new TypeError('storageKey must be a non-empty string');
  }

  let display = DEFAULT_SELECTION_CARD_DISPLAY;
  try {
    display = normalizeSelectionCardDisplay(JSON.parse(read(storageKey) ?? 'null'));
  } catch {}

  function inspect() {
    return Object.freeze({ ...display });
  }

  function persist() {
    try {
      write(storageKey, JSON.stringify(display));
    } catch {}
  }

  return Object.freeze({
    inspect,
    setDisplay(patch) {
      if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new TypeError('display patch must be an object');
      }
      const next = { ...display };
      for (const key of DISPLAY_KEYS) {
        if (Object.hasOwn(patch, key)) next[key] = patch[key] !== false;
      }
      display = Object.freeze(next);
      persist();
      return inspect();
    },
    reset() {
      display = DEFAULT_SELECTION_CARD_DISPLAY;
      persist();
      return inspect();
    }
  });
}
