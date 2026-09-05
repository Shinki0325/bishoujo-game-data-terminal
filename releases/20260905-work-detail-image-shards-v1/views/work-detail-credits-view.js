const TAB_ORDER = Object.freeze(['staff', 'cast', 'songs']);
const TAB_LABELS = Object.freeze({
  staff: '制作',
  cast: '角色·声优',
  songs: '歌曲'
});
const CAST_ROLE_LABELS = Object.freeze({
  main: '主角',
  sub: '配角',
  primary: '主角',
  side: '配角',
  appears: '登场',
  'メイン': '主角',
  'サブ': '配角'
});
const CAST_ROLE_RANKS = Object.freeze({
  main: 0,
  primary: 0,
  'メイン': 0,
  sub: 1,
  side: 1,
  'サブ': 1
});
const SONG_CATEGORY_LABELS = Object.freeze({
  '挿入歌': '插入歌',
  'キャラソン': '角色歌',
  'イメージソング': '印象曲',
  IM: '印象曲'
});

function songCategoryLabel(value) {
  const category = String(value ?? '').trim();
  if (SONG_CATEGORY_LABELS[category]) return SONG_CATEGORY_LABELS[category];
  return category
    .replace(/アレンジ/g, ' arrange')
    .replace(/リミックス|ミックス/g, ' remix')
    .replace(/カバー/g, ' cover')
    .trim();
}

function castRoleLabel(value) {
  const role = String(value ?? '').trim();
  return CAST_ROLE_LABELS[role.toLowerCase()] ?? CAST_ROLE_LABELS[role] ?? role;
}

function orderedCast(cast) {
  return (Array.isArray(cast) ? cast : [])
    .map((entry, index) => ({ entry, index, rank: CAST_ROLE_RANKS[String(entry?.role ?? '').trim().toLowerCase()] ?? 2 }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ entry }) => entry);
}

function songCategories(song) {
  return Array.isArray(song?.categories)
    ? song.categories.filter(category => typeof category === 'string' && category.trim())
    : [];
}

function isPureBgm(song) {
  const categories = songCategories(song);
  return categories.length > 0 && categories.every(category => category.trim().toUpperCase() === 'BGM');
}

function isInstrumentalSong(song) {
  return songCategories(song).some(category => /instrumental|インスト/i.test(category));
}

function songCategoryRank(song) {
  const category = songCategories(song)[0]?.trim() ?? '';
  if (category === 'OP') return 0;
  if (category === 'ED') return 1;
  if (category === '挿入歌') return 2;
  if (category === 'キャラソン') return 3;
  if (category !== 'イメージソング' && category.endsWith('イメージソング')) return 4;
  if (category === 'イメージソング' || category === 'IM') return 5;
  return 6;
}

function visibleSongs(songs) {
  return (Array.isArray(songs) ? songs : [])
    .map((song, index) => ({ song, index, rank: songCategoryRank(song) }))
    .filter(entry => !isPureBgm(entry.song) && !isInstrumentalSong(entry.song))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(entry => entry.song);
}

function people(documentRef, entries) {
  const fragment = documentRef.createElement('span');
  fragment.className = 'details-credit-people';
  if (!Array.isArray(entries) || entries.length === 0) {
    const empty = documentRef.createElement('span');
    empty.className = 'details-credit-empty';
    empty.textContent = '暂无声优资料';
    fragment.append(empty);
    return fragment;
  }
  entries.forEach((person, index) => {
    if (index > 0) {
      const separator = documentRef.createElement('span');
      separator.className = 'details-credit-separator';
      separator.textContent = '、';
      fragment.append(separator);
    }
    const item = documentRef.createElement('span');
    item.className = 'details-credit-person';
    if (typeof person.creatorId === 'string') item.dataset.creatorId = person.creatorId;
    item.textContent = person.name;
    if (typeof person.detail === 'string') {
      const detail = documentRef.createElement('small');
      detail.textContent = `（${person.detail}）`;
      item.append(detail);
    }
    fragment.append(item);
  });
  return fragment;
}
function staffPane(documentRef, staff) {
  const list = documentRef.createElement('dl');
  list.className = 'details-credit-list';
  for (const [key, label] of [['artwork', '原画'], ['scenario', '剧本'], ['music', '作品音乐']]) {
    const entries = Array.isArray(staff[key]) ? staff[key] : [];
    if (entries.length === 0) continue;
    const row = documentRef.createElement('div');
    const term = documentRef.createElement('dt');
    const description = documentRef.createElement('dd');
    term.textContent = label;
    description.append(people(documentRef, entries));
    row.append(term, description);
    list.append(row);
  }
  return list;
}

function castPane(documentRef, cast) {
  const list = documentRef.createElement('ul');
  list.className = 'details-cast-list';
  for (const entry of orderedCast(cast)) {
    const item = documentRef.createElement('li');
    if (entry?.scopeLabel) item.dataset.scope = 'admission';
    const portrait = documentRef.createElement('div');
    portrait.className = 'details-cast-portrait';
    const placeholder = documentRef.createElement('span');
    placeholder.className = 'details-cast-placeholder';
    placeholder.textContent = '暂无图片';
    portrait.append(placeholder);
    if (entry?.image?.url) {
      const image = documentRef.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = entry.image.url;
      image.addEventListener('load', () => { portrait.dataset.state = 'loaded'; placeholder.hidden = true; });
      image.addEventListener('error', () => {
        if (entry.image.fallbackUrl && image.dataset.fallbackAttempted !== 'true') {
          image.dataset.fallbackAttempted = 'true';
          image.src = entry.image.fallbackUrl;
          return;
        }
        portrait.dataset.state = 'error';
        image.remove();
        placeholder.hidden = false;
        placeholder.textContent = '图片加载失败';
      });
      portrait.append(image);
    }
    const character = documentRef.createElement('span');
    character.className = 'details-cast-character';
    const identity = documentRef.createElement('span');
    identity.className = 'details-cast-identity';
    const name = documentRef.createElement('strong');
    name.textContent = entry.characterName;
    identity.append(name);
    if (typeof entry.role === 'string') {
      const role = documentRef.createElement('small');
      role.textContent = castRoleLabel(entry.role);
      identity.append(role);
    }
    if (entry?.scopeLabel) {
      const scope = documentRef.createElement('em');
      scope.className = 'details-cast-scope';
      scope.textContent = entry.scopeLabel;
      identity.append(scope);
    }
    character.append(identity);
    const actors = people(documentRef, entry.actors);
    actors.classList.add('details-cast-actors');
    item.append(portrait, character, actors);
    list.append(item);
  }
  return list;
}

function songsPane(documentRef, songs) {
  const list = documentRef.createElement('div');
  list.className = 'details-song-list';
  const creditLabels = {
    vocal: '演唱',
    lyrics: '作词',
    composition: '作曲',
    arrangement: '编曲'
  };
  for (const song of visibleSongs(songs)) {
    const article = documentRef.createElement('article');
    article.className = 'details-song';
    const heading = documentRef.createElement('div');
    heading.className = 'details-song-heading';
    for (const category of song.categories ?? []) {
      const badge = documentRef.createElement('span');
      badge.className = 'details-song-category';
      badge.textContent = songCategoryLabel(category);
      heading.append(badge);
    }
    const title = documentRef.createElement('strong');
    title.textContent = song.title;
    heading.append(title);
    article.append(heading);
    const credits = documentRef.createElement('dl');
    credits.className = 'details-song-credits';
    for (const key of ['vocal', 'lyrics', 'composition', 'arrangement']) {
      const entries = Array.isArray(song.credits?.[key]) ? song.credits[key] : [];
      if (entries.length === 0) continue;
      const row = documentRef.createElement('div');
      const term = documentRef.createElement('dt');
      const description = documentRef.createElement('dd');
      term.textContent = creditLabels[key];
      description.append(people(documentRef, entries));
      row.append(term, description);
      credits.append(row);
    }
    article.append(credits);
    list.append(article);
  }
  return list;
}

function availableTabs(work) {
  const staff = work?.staff ?? {};
  return TAB_ORDER.filter(tab => {
    if (tab === 'staff') {
      return ['artwork', 'scenario', 'music'].some(key => Array.isArray(staff[key]) && staff[key].length > 0);
    }
    if (tab === 'songs') return visibleSongs(work?.songs).length > 0;
    return Array.isArray(work?.[tab]) && work[tab].length > 0;
  });
}

export function createWorkDetailCreditsView({ root, tabs, content, status }) {
  const documentRef = root.ownerDocument;
  let tabButtons = [];
  let panes = [];
  let activeTabId = null;

  function selectTab(tabId, { focus = false } = {}) {
    activeTabId = tabId;
    for (const button of tabButtons) {
      const active = button.dataset.tab === tabId;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    }
    for (const pane of panes) pane.hidden = pane.dataset.pane !== tabId;
  }

  function renderWork(work) {
    const available = availableTabs(work);
    if (available.length === 0) {
      clear();
      return false;
    }
    root.hidden = false;
    status.hidden = true;
    status.replaceChildren();
    tabs.hidden = false;
    tabButtons = available.map(tabId => {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.dataset.tab = tabId;
      button.setAttribute('role', 'tab');
      button.textContent = TAB_LABELS[tabId];
      button.addEventListener('click', () => selectTab(tabId));
      return button;
    });
    panes = available.map(tabId => {
      const pane = documentRef.createElement('div');
      pane.className = 'details-credits-pane';
      pane.dataset.pane = tabId;
      pane.setAttribute('role', 'tabpanel');
      if (tabId === 'staff') pane.append(staffPane(documentRef, work.staff));
      if (tabId === 'cast') pane.append(castPane(documentRef, work.cast));
      if (tabId === 'songs') pane.append(songsPane(documentRef, work.songs));
      return pane;
    });
    tabs.replaceChildren(...tabButtons);
    content.replaceChildren(...panes);
    const initialTab = activeTabId !== null && available.includes(activeTabId)
      ? activeTabId
      : TAB_ORDER.find(tabId => available.includes(tabId));
    selectTab(initialTab);
    return true;
  }

  function clear() {
    tabButtons = [];
    panes = [];
    activeTabId = null;
    tabs.replaceChildren();
    content.replaceChildren();
    status.replaceChildren();
    tabs.hidden = true;
    status.hidden = true;
    root.hidden = true;
  }

  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || tabButtons.length < 2) return;
    event.preventDefault();
    const currentIndex = Math.max(0, tabButtons.findIndex(button => button.getAttribute('aria-selected') === 'true'));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabButtons.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length;
    selectTab(tabButtons[nextIndex].dataset.tab, { focus: true });
  });

  return Object.freeze({
    clear,
    renderLoading() {
      activeTabId = null;
      root.hidden = false;
      tabs.hidden = true;
      content.replaceChildren();
      status.hidden = false;
      status.dataset.state = 'loading';
      status.textContent = '正在加载制作资料…';
    },
    renderWork,
    renderError(onRetry) {
      root.hidden = false;
      tabs.hidden = true;
      content.replaceChildren();
      status.hidden = false;
      status.dataset.state = 'error';
      const message = documentRef.createElement('span');
      message.textContent = '制作资料暂时无法加载。';
      const retry = documentRef.createElement('button');
      retry.type = 'button';
      retry.textContent = '重试';
      retry.addEventListener('click', onRetry);
      status.replaceChildren(message, retry);
    }
  });
}
