export const RANKING_UI_KEY = 'egs-tier-terminal:ranking-ui-v1';
export const ANNOTATION_MAX_CHARACTERS = 16;
export const ANNOTATION_MAX_ITEMS = 100;
export const UI_SCALE_KEYS = Object.freeze(['overall', 'card', 'rail', 'annotation', 'tierName']);
export const UI_SCALE_DEFAULT = 100;
export const UI_SCALE_MIN = 80;
export const UI_SCALE_MAX = 160;
export const UI_SCALE_STEP = 5;

export function normalizeAnnotation(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/[\r\n]+/gu, '').trim())
    .slice(0, ANNOTATION_MAX_CHARACTERS)
    .join('');
}

export function annotationLines(value) {
  const characters = Array.from(normalizeAnnotation(value));
  return [characters.slice(0, 8).join(''), characters.slice(8, 16).join('')]
    .filter(Boolean);
}

function cloneAnnotations(annotations) {
  return Object.fromEntries(Object.entries(annotations));
}

function cloneUiScale(uiScale) {
  return Object.fromEntries(UI_SCALE_KEYS.map(key => [key, uiScale[key]]));
}

export function normalizeUiScale(value) {
  if (!Number.isFinite(Number(value))) return UI_SCALE_DEFAULT;
  const numeric = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Number(value)));
  return UI_SCALE_MIN + Math.round((numeric - UI_SCALE_MIN) / UI_SCALE_STEP) * UI_SCALE_STEP;
}

export function createRankingPresentation({ read, write, storageKey = RANKING_UI_KEY }) {
  if (typeof read !== 'function' || typeof write !== 'function') {
    throw new TypeError('read and write must be functions');
  }
  if (typeof storageKey !== 'string' || storageKey.length === 0) {
    throw new TypeError('storageKey must be a non-empty string');
  }

  let showCounts = false;
  let showTitles = false;
  const annotations = Object.create(null);
  const uiScale = Object.fromEntries(UI_SCALE_KEYS.map(key => [key, UI_SCALE_DEFAULT]));
  try {
    const parsed = JSON.parse(read(storageKey) ?? 'null');
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.showCounts === true) showCounts = true;
      if (typeof parsed.showTitles === 'boolean') showTitles = parsed.showTitles;
      if (parsed.uiScale !== null && typeof parsed.uiScale === 'object' && !Array.isArray(parsed.uiScale)) {
        for (const key of UI_SCALE_KEYS) {
          if (Object.hasOwn(parsed.uiScale, key)) uiScale[key] = normalizeUiScale(parsed.uiScale[key]);
        }
        if (!Object.hasOwn(parsed.uiScale, 'tierName') && Object.hasOwn(parsed.uiScale, 'controls')) {
          uiScale.tierName = normalizeUiScale(parsed.uiScale.controls);
        }
      }
      if (
        parsed.annotations !== null
        && typeof parsed.annotations === 'object'
        && !Array.isArray(parsed.annotations)
      ) {
        const entries = Object.entries(parsed.annotations);
        if (entries.length <= ANNOTATION_MAX_ITEMS) {
          for (const [workId, value] of entries) {
            if (typeof workId !== 'string' || workId.length === 0) continue;
            const normalized = normalizeAnnotation(value);
            if (normalized.length > 0) annotations[workId] = normalized;
          }
        }
      }
    }
  } catch {}

  let immersive = false;

  function persist() {
    try {
      write(storageKey, JSON.stringify({
        showCounts,
        showTitles,
        annotations: cloneAnnotations(annotations),
        uiScale: cloneUiScale(uiScale)
      }));
    } catch {}
  }

  function inspect() {
    return Object.freeze({
      showCounts,
      showTitles,
      annotations: Object.freeze(cloneAnnotations(annotations)),
      uiScale: Object.freeze(cloneUiScale(uiScale)),
      immersive
    });
  }

  return Object.freeze({
    inspect,
    setShowCounts(value) {
      showCounts = value === true;
      persist();
      return showCounts;
    },
    setShowTitles(value) {
      showTitles = value !== false;
      persist();
      return showTitles;
    },
    setUiScale(key, value) {
      if (!UI_SCALE_KEYS.includes(key)) throw new TypeError('unknown ui scale key');
      uiScale[key] = normalizeUiScale(value);
      persist();
      return uiScale[key];
    },
    resetUiScale(key) {
      if (key === undefined) {
        const changed = UI_SCALE_KEYS.some(item => uiScale[item] !== UI_SCALE_DEFAULT);
        for (const item of UI_SCALE_KEYS) uiScale[item] = UI_SCALE_DEFAULT;
        if (changed) persist();
        return changed;
      }
      if (!UI_SCALE_KEYS.includes(key)) throw new TypeError('unknown ui scale key');
      uiScale[key] = UI_SCALE_DEFAULT;
      persist();
      return uiScale[key];
    },
    setAnnotation(workId, value) {
      if (typeof workId !== 'string' || workId.length === 0) {
        throw new TypeError('workId must be a non-empty string');
      }
      const normalized = normalizeAnnotation(value);
      if (normalized.length === 0) {
        if (!Object.hasOwn(annotations, workId)) return null;
        delete annotations[workId];
        persist();
        return null;
      }
      if (!Object.hasOwn(annotations, workId) && Object.keys(annotations).length >= ANNOTATION_MAX_ITEMS) {
        return null;
      }
      annotations[workId] = normalized;
      persist();
      return normalized;
    },
    clearAnnotations() {
      const changed = Object.keys(annotations).length > 0;
      if (!changed) return false;
      for (const workId of Object.keys(annotations)) delete annotations[workId];
      persist();
      return true;
    },
    enterImmersive() {
      immersive = true;
      return true;
    },
    exitImmersive() {
      immersive = false;
      return true;
    }
  });
}

export function createImmersiveController({ root, documentRef, idleMs = 3000, onChange = () => {} }) {
  if (root === null || typeof root?.classList?.add !== 'function') {
    throw new TypeError('root must provide classList');
  }
  if (documentRef === null || typeof documentRef?.getElementById !== 'function') {
    throw new TypeError('documentRef must provide getElementById');
  }
  if (!Number.isFinite(idleMs) || idleMs < 0) throw new TypeError('idleMs must be a non-negative number');
  if (typeof onChange !== 'function') throw new TypeError('onChange must be a function');

  const edge = documentRef.getElementById('ranking-immersive-edge');
  const controls = documentRef.getElementById('ranking-immersive-controls');
  const exitButton = documentRef.getElementById('ranking-immersive-exit');
  if (!edge || !controls || !exitButton) throw new Error('Missing immersive edge controls');
  edge.tabIndex = -1;
  let idleTimer = null;

  function clearIdleTimer() {
    globalThis.clearTimeout(idleTimer);
    idleTimer = null;
  }

  function hideControls(force = false) {
    clearIdleTimer();
    const focused = documentRef.activeElement;
    const focusWithinEdge = focused === edge
      || (typeof edge.contains === 'function' && edge.contains(focused));
    if (!force && focusWithinEdge) {
      return false;
    }
    controls.hidden = true;
    return true;
  }

  function revealControls() {
    if (!root.classList.contains('is-ranking-immersive')) {
      hideControls(true);
      return false;
    }
    controls.hidden = false;
    clearIdleTimer();
    idleTimer = globalThis.setTimeout(() => {
      hideControls();
      idleTimer = null;
    }, idleMs);
    return true;
  }

  function deactivate() {
    const wasImmersive = root.classList.contains('is-ranking-immersive');
    root.classList.remove('is-ranking-immersive');
    edge.tabIndex = -1;
    hideControls(true);
    if (wasImmersive) onChange(false);
    return wasImmersive;
  }

  async function exit() {
    deactivate();
    if (documentRef.fullscreenElement && typeof documentRef.exitFullscreen === 'function') {
      await Promise.resolve(documentRef.exitFullscreen()).catch(() => {});
    }
  }

  async function enter() {
    root.classList.add('is-ranking-immersive');
    edge.tabIndex = 0;
    onChange(true);
    hideControls(true);
    if (typeof root.requestFullscreen === 'function') {
      await Promise.resolve(root.requestFullscreen()).catch(() => {});
    }
  }

  documentRef.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !root.classList.contains('is-ranking-immersive')) return;
    if (typeof documentRef.querySelector === 'function' && documentRef.querySelector('dialog[open]')) return;
    void exit();
  });
  documentRef.addEventListener('fullscreenchange', () => {
    if (root.classList.contains('is-ranking-immersive') && documentRef.fullscreenElement !== root) {
      deactivate();
    }
  });
  for (const type of ['pointerenter', 'pointerdown', 'focusin']) edge.addEventListener(type, revealControls);
  edge.addEventListener('pointerleave', () => hideControls());
  controls.addEventListener('focusin', revealControls);
  controls.addEventListener('focusout', event => {
    if (typeof controls.contains === 'function' && controls.contains(event.relatedTarget)) return;
    hideControls(true);
  });
  exitButton.addEventListener('click', () => void exit());

  return Object.freeze({ enter, exit, revealControls, hideControls });
}
