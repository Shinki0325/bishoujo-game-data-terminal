export const RANKING_UI_KEY = 'egs-tier-terminal:ranking-ui-v1';

export function createRankingPresentation({ read, write }) {
  if (typeof read !== 'function' || typeof write !== 'function') {
    throw new TypeError('read and write must be functions');
  }

  let showCounts = false;
  try {
    const parsed = JSON.parse(read(RANKING_UI_KEY) ?? 'null');
    if (parsed !== null && typeof parsed === 'object' && parsed.showCounts === true) {
      showCounts = true;
    }
  } catch {}

  let immersive = false;

  function persist() {
    write(RANKING_UI_KEY, JSON.stringify({ showCounts }));
  }

  return Object.freeze({
    inspect: () => ({ showCounts, immersive }),
    setShowCounts(value) {
      showCounts = value === true;
      persist();
      return showCounts;
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

  const exitButton = documentRef.getElementById('ranking-immersive-exit');
  if (!exitButton) throw new Error('Missing immersive exit control');
  let idleTimer = null;

  function clearIdleTimer() {
    globalThis.clearTimeout(idleTimer);
    idleTimer = null;
  }

  function revealExit() {
    if (!root.classList.contains('is-ranking-immersive')) {
      exitButton.hidden = true;
      return false;
    }
    exitButton.hidden = false;
    clearIdleTimer();
    idleTimer = globalThis.setTimeout(() => {
      exitButton.hidden = true;
      idleTimer = null;
    }, idleMs);
    return true;
  }

  async function exit() {
    root.classList.remove('is-ranking-immersive');
    onChange(false);
    clearIdleTimer();
    exitButton.hidden = true;
    if (documentRef.fullscreenElement && typeof documentRef.exitFullscreen === 'function') {
      await Promise.resolve(documentRef.exitFullscreen()).catch(() => {});
    }
  }

  async function enter() {
    root.classList.add('is-ranking-immersive');
    onChange(true);
    revealExit();
    if (typeof root.requestFullscreen === 'function') {
      await Promise.resolve(root.requestFullscreen()).catch(() => {});
    }
  }

  documentRef.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.classList.contains('is-ranking-immersive')) void exit();
  });
  for (const type of ['pointermove', 'pointerdown', 'focusin']) {
    root.addEventListener(type, revealExit);
  }
  exitButton.addEventListener('click', () => void exit());

  return Object.freeze({ enter, exit, revealExit });
}
