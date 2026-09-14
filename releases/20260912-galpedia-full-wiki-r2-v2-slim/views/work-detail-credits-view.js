import { setListState } from '../lib/list-state.js';
import { characterDescription, metadataConflictNotice, profileFactsView } from './work-detail-character-enrichment-overlay.js';
import { createCharacterImageGroup } from '../lib/character-image-loader.js';

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
const STAFF_ROLE_LABELS = Object.freeze({
  artwork: '原画',
  art: '原画',
  scenario: '剧本',
  music: '作品音乐',
  'character-design': '角色设计',
  chardesign: '角色设计',
  director: '导演',
  editor: '编辑',
  other: '其他',
  qa: '品质保证',
  songs: '歌曲',
  staff: '制作人员',
  translator: '翻译',
  vocalist: '歌手'
});
const CHARACTER_METADATA_FIELDS = Object.freeze([
  { key: 'birthday', label: '生日' },
  { key: 'age', label: '年龄', unit: '岁' },
  { key: 'height', label: '身高', unit: 'cm' },
  { key: 'weight', label: '体重', unit: 'kg' },
  { key: 'bloodType', label: '血型', type: 'blood' },
  { key: 'bust', label: '胸围', unit: 'cm' },
  { key: 'waist', label: '腰围', unit: 'cm' },
  { key: 'hip', label: '臀围', unit: 'cm' },
  { key: 'cupSize', label: '罩杯' }
]);
const METADATA_SOURCE_LABELS = Object.freeze({ bangumi: 'Bangumi', egs: 'EGS', vndb: 'VNDB' });
const METADATA_REVIEW_LABELS = Object.freeze({
  'pending-conflict': '待处理冲突',
  'no-conflict': '无冲突'
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

function metadataValue(entry) {
  if (entry === null || entry === undefined) return null;
  const value = typeof entry === 'object' && !Array.isArray(entry) ? entry.value : entry;
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return { value: String(value).trim(), source: typeof entry === 'object' ? entry.source : undefined, reviewState: typeof entry === 'object' ? entry.reviewState : undefined };
}

function formatBirthday(value) {
  const separated = value.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/u);
  const digits = value.match(/^\d{3,4}$/u);
  const month = separated ? Number(separated[1]) : digits ? Number(value.padStart(4, '0').slice(0, 2)) : null;
  const day = separated ? Number(separated[2]) : digits ? Number(value.padStart(4, '0').slice(2)) : null;
  if (month !== null && day !== null && month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${month}月${day}日`;
  return value;
}

function formatMetadataValue(field, raw) {
  if (field.key === 'birthday') return formatBirthday(raw.value);
  if (field.type === 'blood') return /型$/u.test(raw.value) ? raw.value : `${raw.value.toUpperCase()}型`;
  if (field.unit && /^\d+(?:\.\d+)?$/u.test(raw.value)) return `${raw.value} ${field.unit}`;
  return raw.value;
}

function characterMetadata(documentRef, metadata) {
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'details-cast-metadata';
  const basic = documentRef.createElement('div');
  basic.className = 'details-cast-basic';
  const measurements = documentRef.createElement('div');
  measurements.className = 'details-cast-measurements';
  measurements.setAttribute('aria-label', '三围，单位厘米');
  const measurementTitle = documentRef.createElement('span');
  measurementTitle.className = 'details-cast-measurements-label';
  measurementTitle.textContent = '三围';
  measurements.append(measurementTitle);
  const sources = documentRef.createElement('details');
  sources.className = 'details-cast-attribute-sources';
  const summary = documentRef.createElement('summary');
  summary.textContent = '资料来源';
  const sourceList = documentRef.createElement('dl');
  sourceList.className = 'details-cast-source-list';
  sources.append(summary, sourceList);
  const measurementLabels = { bust: 'B', waist: 'W', hip: 'H' };
  let count = 0;
  for (const field of CHARACTER_METADATA_FIELDS) {
    const raw = metadataValue(metadata?.[field.key]);
    if (!raw) continue;
    count++;
    const row = documentRef.createElement('span');
    row.className = 'details-cast-metadata-item';
    row.dataset.field = field.key;
    const label = documentRef.createElement('span');
    label.className = 'details-cast-metadata-label';
    label.textContent = measurementLabels[field.key] || field.label;
    const value = documentRef.createElement('span');
    value.className = 'details-cast-metadata-value';
    value.textContent = measurementLabels[field.key] ? raw.value : formatMetadataValue(field, raw);
    if (measurementLabels[field.key]) row.setAttribute('aria-label', `${field.label} ${raw.value} 厘米`);
    row.append(label, value);
    if (measurementLabels[field.key]) {
      if (measurements.querySelector('[data-field]')) {
        const separator = documentRef.createElement('span');
        separator.className = 'details-cast-measurement-separator';
        separator.textContent = '/';
        separator.setAttribute('aria-hidden', 'true');
        measurements.append(separator);
      }
      measurements.append(row);
    } else basic.append(row);
    const source = METADATA_SOURCE_LABELS[raw.source] || raw.source;
    const review = METADATA_REVIEW_LABELS[raw.reviewState] || raw.reviewState;
    if (source || (review && review !== '无冲突')) {
      const group = documentRef.createElement('div');
      const term = documentRef.createElement('dt');
      term.textContent = field.label;
      const detail = documentRef.createElement('dd');
      detail.textContent = [source, review && review !== '无冲突' ? review : ''].filter(Boolean).join(' · ');
      group.append(term, detail);sourceList.append(group);
    }
  }
  if (!count) return null;
  if (basic.childElementCount) wrapper.append(basic);
  if (measurements.querySelector('[data-field]')) wrapper.append(measurements);
  if (sourceList.childElementCount) wrapper.append(sources);
  return wrapper;
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
    const linked = /^per_[A-Za-z0-9]+$/u.test(person.personId ?? '');
    const item = documentRef.createElement(linked ? 'a' : 'span');
    item.className = 'details-credit-person';
    if (linked) { item.href = `#persons/person/${person.personId}`; item.dataset.personId = person.personId; item.setAttribute('aria-haspopup', 'dialog'); }
    if (typeof person.creatorId === 'string') item.dataset.creatorId = person.creatorId;
    item.textContent = person.name;
    item.title = [person.personDisplayName && person.personDisplayName !== person.name ? `查看人物：${person.personDisplayName}` : '', person.creditedName && person.creditedName !== person.name ? `来源署名：${person.creditedName}` : ''].filter(Boolean).join('；');
    if (typeof person.detail === 'string') {
      const detail = documentRef.createElement('small');
      detail.textContent = `（${person.detail}）`;
      item.append(detail);
    }
    fragment.append(item);
  });
  return fragment;
}
function appendStaffNames(documentRef, container, entries, role) {
  container.append(people(documentRef, entries.slice(0, 6)));
  if (entries.length <= 6) return;
  const more = documentRef.createElement('details'); more.className = 'details-credit-more';
  const summary = documentRef.createElement('summary');
  const update = () => {
    summary.textContent = `${more.open ? '收起' : '展开'}其余 ${entries.length - 6} 人`;
    summary.setAttribute('aria-label', `${role}：${summary.textContent}`);
  };
  update(); more.addEventListener('toggle', update);
  more.append(summary, people(documentRef, entries.slice(6))); container.append(more);
}

function staffPane(documentRef, staff) {
  const list = documentRef.createElement('dl');
  list.className = 'details-credit-list';
  for (const [key, label] of [['artwork', '原画'], ['scenario', '剧本'], ['music', '作品音乐']]) {
    const entries = Array.isArray(staff[key]) ? staff[key] : [];
    if (!entries.length) continue;
    const row = documentRef.createElement('div');
    const term = documentRef.createElement('dt');
    const description = documentRef.createElement('dd');
    term.textContent = label; appendStaffNames(documentRef, description, entries, label);
    row.append(term, description); list.append(row);
  }
  const other = Array.isArray(staff.other) ? staff.other : [];
  if (!other.length) return list;
  const section = documentRef.createElement('div'); section.className = 'details-credit-other-section';
  const heading = documentRef.createElement('dt'); heading.textContent = '其他制作';
  const body = documentRef.createElement('dd');
  const byRole = new Map();
  for (const person of other) {
    const role = person.roleLabel || STAFF_ROLE_LABELS[person.roleCode] || person.roleCode || '其他';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(person);
  }
  for (const [role, entries] of byRole) {
    const group = documentRef.createElement('div'); group.className = 'details-credit-other-group';
    const label = documentRef.createElement('span'); label.className = 'details-credit-role'; label.textContent = role;
    const names = documentRef.createElement('div'); names.className = 'details-credit-role-body';
    const plain = entries.map(person => ({...person, detail:undefined}));
    appendStaffNames(documentRef, names, plain, role);
    const notes = entries.filter(person => typeof person.detail === 'string' && person.detail.trim());
    if (notes.length) {
      const disclosure = documentRef.createElement('details'); disclosure.className = 'details-credit-notes';
      const summary = documentRef.createElement('summary'); summary.textContent = `工作备注（${notes.length}）`;
      summary.setAttribute('aria-label', `${role}的工作备注，${notes.length}条`);
      const noteList = documentRef.createElement('ul'); noteList.className = 'details-credit-note-list';
      for (const person of notes) {
        const item = documentRef.createElement('li'); item.append(people(documentRef, [person])); noteList.append(item);
      }
      disclosure.append(summary, noteList); names.append(disclosure);
    }
    group.append(label, names); body.append(group);
  }
  section.append(heading, body); list.append(section);
  return list;
}


function castPane(documentRef, cast, images) {
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
      image.decoding = 'async';
      images.load(image, { url: entry.image.url, fallbackUrl: entry.image.fallbackUrl, onState(state) {
        portrait.dataset.state = state;
        placeholder.hidden = state === 'loaded';
        placeholder.textContent = state === 'error' ? '图片加载失败' : state === 'retrying' ? '正在重试…' : '正在加载…';
      }
      });
      portrait.append(image);
    }
    const character = documentRef.createElement('div');
    character.className = 'details-cast-character';
    const identity = documentRef.createElement('span');
    identity.className = 'details-cast-identity';
    const name = documentRef.createElement('strong');
    name.textContent = entry.characterName;
    if (entry.characterNameSource === 'bangumi') name.title = '中文名来源：Bangumi';
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
    const metadata = characterMetadata(documentRef, entry?.metadata);

    const metadataConflict = metadataConflictNotice(documentRef, entry?.metadataCandidateConflicts);

    const description = characterDescription(documentRef, entry?.descriptions);
    const profileFacts = profileFactsView(documentRef, entry?.profileFacts);
    character.append(identity);
    if (entry.originalCharacterName && entry.originalCharacterName !== entry.characterName) {
      const original = documentRef.createElement('span');
      original.className = 'details-cast-original-name';
      original.textContent = entry.originalCharacterName;
      original.setAttribute('aria-label', `原名：${entry.originalCharacterName}`);
      character.append(original);
    }
    const actors = people(documentRef, entry.actors);
    actors.classList.add('details-cast-actors');
    const cv = documentRef.createElement('small');
    cv.className = 'details-cast-cv-label';
    cv.textContent = 'CV';
    actors.prepend(cv);
    if (metadata) character.append(metadata);
    character.append(actors);
    const sources = metadata?.querySelector('.details-cast-attribute-sources');
    if (sources) character.append(sources);
    if (metadataConflict) character.append(metadataConflict);
    item.append(portrait, character);
    if (description) item.append(description);
    if (profileFacts) item.append(profileFacts);
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
      return ['artwork', 'scenario', 'music', 'other'].some(key => Array.isArray(staff[key]) && staff[key].length > 0);
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
    setListState({status,state:'ready'});
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
      if (tabId === 'cast') {
        const images = createCharacterImageGroup(documentRef);
        pane.append(images.button, castPane(documentRef, work.cast, images));
      }
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
    setListState({status,state:'ready'});
    tabs.hidden = true;
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
      setListState({status,state:'loading',layout:'panel',message:'正在加载制作人员与角色',detail:'制作人员和角色资料加载完成后，会显示在这里。',slowLabel:'人物资料仍在加载，请再等一会儿。'});
    },
    renderWork,
    renderError(onRetry) {
      root.hidden = false;
      tabs.hidden = true;
      content.replaceChildren();
      setListState({status,state:'error',layout:'panel',message:'人物资料没能加载出来',detail:'作品介绍仍然可以查看，人物资料可以再试一次。',retry:onRetry});
    }
  });
}
