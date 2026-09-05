export const RANKING_HELP_KEY = 'egs-tier-terminal:ranking-help-v1';

export function createRankingHelp({ read, write, open }) {
  if (typeof read !== 'function' || typeof write !== 'function' || typeof open !== 'function') {
    throw new TypeError('read, write, and open must be functions');
  }

  let entered = false;
  let seen = false;
  try {
    seen = read(RANKING_HELP_KEY) === 'seen';
  } catch {}

  function openContext(context) {
    open(context);
    return context;
  }

  return Object.freeze({
    enterRanking() {
      if (entered || seen) return false;
      entered = true;
      seen = true;
      openContext('full');
      try {
        write(RANKING_HELP_KEY, 'seen');
      } catch {}
      return true;
    },
    openFull() {
      return openContext('full');
    },
    openImmersive() {
      return openContext('immersive');
    }
  });
}
