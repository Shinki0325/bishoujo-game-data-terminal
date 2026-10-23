import { creditResponsibilityNotes, creditResponsibilityText } from '../lib/credit-responsibility.js';
import { nativeEntryHref } from '../lib/native-entry-route.js';
import { personSongDisplay } from '../lib/person-song-display.js';
import { personCreditInMode, personScopeOverview, groupPersonEditionRows, personCollaborationDetails, representativePersonWorks } from '../lib/person-detail-projection.js';
import { songCategoryLabel } from '../lib/song-category-label.js';
import {companyName} from '../lib/company-ui/__company_v30/company-name.js';
import { formatReleaseDate, releaseDateSortCompare, releaseYear } from '../lib/work-release-date.js';
import { syncSortDirectionControl } from '../lib/ui-sort-control.js';
import { groupPersonTimelineCredits, representativePersonSongs } from '../lib/person-timeline-model.js';
import { queryPersonTimeline } from '../lib/person-section-projection.js';
import {canonicalRole} from '../lib/credit-role-policy.js';
import {personDisplayNameForRole,personDisplayNameVariantLabels as personNameVariantLabels} from '../lib/person-name-variants.js';
import {extendPersonActivityYears} from '../lib/person-activity-timeline.js';
import {createCharacterImageGroup} from '../lib/character-image-loader.js';
import {resolvePublicCoverUrl} from '../lib/asset-url-core.js';
import {setManagedWorkThumbnail as setSafeWorkImage} from '../lib/managed-work-thumbnail.js';
import {setListState} from '../lib/list-state.js';
import {personDisplayNameVariantCount as personNameVariantCount} from '../lib/person-name-variants.js';
import {formatPersonActivitySpan} from '../lib/person-activity-timeline.js';
import {personDirectoryMetric,personDirectoryMetricHint} from '../lib/person-directory-roles.js';

export function createPersonDetailRenderer({documentRef,dialog,detailTitle,detailMeta,detailPrimaryRole,detailBody,currentYear,familyForWork,imageUrlForWork,loadImageForWork,setWorkImage,onLoadPerson,onOpenWork,onOpenPerson,onOpenCompany,node,roleLabel,characterRoleLabel,personRoleCounts,isVoiceActor,getRoleFilter,state}) {
  return function renderDetail(person, { pending = false } = {}) {
    const roleFilter = getRoleFilter();
    state.sectionController?.abort();
    state.sectionController = new AbortController();
    const sectionSignal = state.sectionController.signal;
    state.timelineReady = Promise.resolve(); state.restoreTimelineCount = async () => {};
    if(person&&dialog)dialog.dataset.entityId=String(person.entityId);
    if (!person || !detailBody) return;
    if (pending && !Array.isArray(person.credits) && !person.displayName && !person.canonicalName) {
      // No identity summary is available yet. Do not expose fabricated zero
      // counts or treat an empty placeholder's mode as a user's selection.
      detailTitle.textContent = '人物详情';
      if (detailPrimaryRole) detailPrimaryRole.textContent = '';
      detailMeta.textContent = ''; detailMeta.removeAttribute('title');
      detailBody.replaceChildren(); return;
    }
    const sections = person.detailSections?.schema === 'galpedia-person-sections-v1' ? person.detailSections : null;
    const voiceActor = isVoiceActor(person);
    const primaryRole = canonicalRole(person.primaryRole || Object.entries(person.roles ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0]);
    const musicRoles = ['vocalist', 'vocal', 'composition', 'lyrics', 'arrangement', 'music', 'songs', 'sound-director'];
    const recordedRoles = new Set(sections?.recordedRoles ?? [...Object.entries(personRoleCounts(person)).filter(([, count]) => count > 0).map(([role]) => canonicalRole(role)), ...(person.credits ?? []).map(credit => canonicalRole(credit.roleCode))]);
    const songRole = musicRoles.includes(primaryRole) ? primaryRole : musicRoles.find(role => recordedRoles.has(role));
    const musicCreator = Boolean(songRole);
    const vocalist = ['vocal','vocalist'].some(r=>recordedRoles.has(r));
    const musicMaker = ['composition','lyrics','arrangement','music','songs','sound-director'].some(r=>recordedRoles.has(r));
    const scenarioWriter=recordedRoles.has('scenario'), artworkArtist=recordedRoles.has('artwork');
    const representativeLabel = musicCreator ? (['vocalist', 'vocal'].includes(songRole) ? '代表歌曲' : '代表曲目') : '代表作品';
    const groupedCredits = sections ? [] : groupPersonTimelineCredits(person.credits ?? [], person.timelineCast ?? []);
    let representativeMode = ['scenario','artwork'].includes(roleFilter) && recordedRoles.has(roleFilter) ? roleFilter : roleFilter === 'voice-actor' && voiceActor ? 'characters' : roleFilter === 'vocalist' && vocalist ? 'vocal' : roleFilter === 'music' && musicMaker ? 'music' : ['scenario','artwork'].includes(primaryRole) ? primaryRole : primaryRole === 'voice-actor' ? 'characters' : ['vocal','vocalist'].includes(primaryRole) ? 'vocal' : musicCreator ? 'music' : 'all';
    const groupsByMode = new Map([['all', groupedCredits]]);
    const scopedGroups = () => {
      if (!groupsByMode.has(representativeMode)) groupsByMode.set(representativeMode,
        groupPersonTimelineCredits((person.credits ?? []).filter(c => personCreditInMode(c, representativeMode)), representativeMode === 'characters' ? person.timelineCast ?? [] : []));
      return groupsByMode.get(representativeMode);
    };
    let updateCollaborators = () => {};
    let updateIdentityScope = () => {};
    let selectTimelineYear = () => {};
    let updateOverviewAvailability = () => {};
    detailTitle.textContent = personDisplayNameForRole(person, roleFilter);
    if (detailPrimaryRole) detailPrimaryRole.textContent = [...new Set([primaryRole, ...(voiceActor ? ['voice-actor'] : []), ...['vocalist','composition','lyrics','arrangement'].filter(role => recordedRoles.has(role))])].filter(role => roleLabel(role) !== '其他').map(roleLabel).join(' · ');
    const allRoleText = detailPrimaryRole?.textContent ?? '';
    detailMeta.textContent = `总收录 ${new Intl.NumberFormat('zh-CN').format(person.workCount ?? 0)} 部作品${person.editionCount > person.workCount ? ` · ${new Intl.NumberFormat('zh-CN').format(person.editionCount)} 个版本` : ''} · ${new Intl.NumberFormat('zh-CN').format(personNameVariantCount(person))} 个名义`;
    if (person.scopeRevision) detailMeta.title = '作品数包含已记录的作品关联；版本数和年份只统计已记录的具体版本。';
    detailBody.replaceChildren();
    if(person.entityKind==='source-placeholder'){
      detailTitle.textContent='作曲者不详';
      if(detailPrimaryRole)detailPrimaryRole.textContent='来源署名';
      detailMeta.textContent='';
      const note=node(documentRef,'p','person-detail-aliases','这条记录表示来源未注明作曲者，并非一位作者的姓名。原署名：不詳。');
      detailBody.append(note);return;
    }
    const layout = node(documentRef, 'div', 'person-detail-layout');
    layout.dataset.page = 'overview';
    const navigation = node(documentRef, 'div', 'person-detail-navigation');
    const identity = node(documentRef, 'aside', 'person-detail-identity');
    if (voiceActor) {
      const representative = node(documentRef, 'section', 'person-detail-block person-detail-representative');
      const heading = node(documentRef, 'div', 'person-detail-block-heading');
      heading.append(node(documentRef, 'h3', '', '代表角色'));
      const representativeImages = createCharacterImageGroup(documentRef);
      heading.append(representativeImages.button);
      representative.append(heading);
      const list = node(documentRef, 'div', 'person-representative-list');
      const characters = Array.isArray(person.representativeCharacters) ? person.representativeCharacters.slice(0, 6) : [];
      for (const character of characters) {
        const item = node(documentRef, character.workId ? 'button' : 'div', 'person-representative-item');
        if (character.workId) {
          item.type = 'button'; item.dataset.workId = character.workId;
          item.setAttribute('aria-label', `查看${character.name || '角色'}的作品 ${character.title || ''}`);
          item.addEventListener('click', () => onOpenWork?.(character.workId));
        }
        item.dataset.characterId = character.characterId;
        item.title = [character.name || '未命名角色', characterRoleLabel(character.role), character.title].filter(Boolean).join(' · ');
        const image = character.imageUrl ? node(documentRef, 'img', 'person-representative-image') : null;
        if (image) {
          image.alt = ''; image.referrerPolicy = 'no-referrer';
          const frame = node(documentRef, 'span', 'person-representative-image-frame');
          frame.append(image); item.append(frame);
          representativeImages.load(image, { url: character.imageUrl, onState(state) { item.dataset.characterImageState = state; } });
        }
        item.append(node(documentRef, 'strong', '', character.name || '未命名角色'));
        if (character.title) item.append(node(documentRef, 'span', 'person-representative-context', character.title));
        if (character.scopeLabel) item.title += ' · ' + character.scopeLabel;
        list.append(item);
      }
      if (list.children.length) { representative.append(list); identity.append(representative); }
    }
    const workModes=[...(vocalist?['vocal']:[]),...(musicMaker?['music']:[]),...(scenarioWriter?['scenario']:[]),...(artworkArtist?['artwork']:[])];
    if (!workModes.length && !voiceActor) workModes.push('all');
    if (workModes.length) {
     for (const panelMode of workModes) {
      const representative = node(documentRef, 'section', 'person-detail-block person-detail-representative person-detail-representative-works');
      const heading = node(documentRef, 'div', 'person-detail-block-heading');
      representative.dataset.representativeScope = panelMode;
      heading.append(node(documentRef, 'h3', '', panelMode === 'vocal' ? '代表歌曲' : panelMode === 'music' ? '代表曲目' : panelMode === 'scenario' ? '代表剧本作品' : panelMode === 'artwork' ? '代表原画作品' : representativeLabel));
      representative.append(heading);
      const list = node(documentRef, 'div', 'person-representative-works-list');
      const genericWorks = panelMode === 'all' ? (sections?.representativeWorksByMode?.all ?? representativePersonWorks(groupPersonTimelineCredits(person.credits??[]))) : [];
      const works = ['scenario','artwork'].includes(panelMode) ? (sections?.representativeWorksByMode?.[panelMode] ?? representativePersonWorks(groupPersonTimelineCredits((person.credits??[]).filter(c=>personCreditInMode(c,panelMode))))) : ['vocal','music'].includes(panelMode) ? (sections?.representativeSongsByMode?.[panelMode] ?? representativePersonSongs(person, groupPersonTimelineCredits((person.credits??[]).filter(c=>personCreditInMode(c,panelMode))), panelMode==='vocal'?'vocalist':'music')) : (genericWorks.length ? genericWorks : (person.representativeWorks??[]).slice(0,6));
      for (const work of works) {
        const item = node(documentRef, 'button', 'person-representative-work');
        item.type = 'button';
        item.dataset.workId = work.workId ?? '';
        if (work.workId) item.dataset.detailFocusToken = `representative-work:${work.workId}`;
        item.disabled = !work.workId;
        item.setAttribute('aria-label', work.song ? `${work.song.title} · 打开所属作品 ${work.displayTitle || work.title || ''}` : `打开作品 ${work.title || work.workId || '详情'}`);
        item.title = work.song ? `${work.song.title} · ${work.displayTitle || work.title || ''}` : work.title || '';
        const image = node(documentRef, 'img', 'person-representative-work-image');
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        const coverUrl = resolvePublicCoverUrl(imageUrlForWork?.(work) || work.imageUrl);
        if (coverUrl) {
          setSafeWorkImage(image, coverUrl);
          image.addEventListener('error', () => { image.hidden = true; item.classList.add('is-image-missing'); }, { once: true });
        } else {
          image.hidden = true;
          item.classList.add('is-image-missing');
        }
        const copy = node(documentRef, 'span', 'person-representative-work-copy');
        copy.append(node(documentRef, 'strong', 'person-representative-work-title', work.song?.title || work.title || '未命名作品'));
        if (work.song) {
          item.classList.add('person-representative-song');
          if (work.song.songId) item.dataset.songId = work.song.songId;
          const usage = [...new Set(work.song.categories.map(songCategoryLabel))].join(' / ');
          if (usage) copy.append(node(documentRef, 'span', 'person-representative-song-usage', usage));
          if (panelMode !== 'vocal') copy.append(node(documentRef, 'span', 'person-representative-work-meta', work.song.roleCodes.map(roleLabel).join(' / ')));
          copy.append(node(documentRef, 'span', 'person-representative-work-meta', work.displayTitle || work.title || '所属作品'));
        } else {
        const rating = work.bangumiRating;
        const score = rating?.status === 'mapped-rated' && Number.isFinite(rating.sortScore)
          ? `${rating.sortScore.toFixed(1)} 分` : '暂无评分';
        const votes = Number.isSafeInteger(rating?.sortVoteCount) && rating.sortVoteCount >= 0
          ? `${new Intl.NumberFormat('zh-CN').format(rating.sortVoteCount)} 票` : '';
        const scoreNode = node(documentRef, 'span', 'person-representative-work-meta',
          `Bangumi ${score}${votes ? ` · ${votes}` : ''}`);
        copy.append(scoreNode);
        }
        item.append(image, copy);
        item.addEventListener('click', () => work.workId && onOpenWork?.(work.workId));
        list.append(item);
      }
      if (list.children.length) { representative.append(list); identity.append(representative); }
     }
    }

    if (voiceActor || musicCreator || scenarioWriter || artworkArtist) {
      const tabs = node(documentRef, 'nav', 'person-representative-tabs');
      tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '查看身份');
      const panels = [...identity.querySelectorAll('.person-detail-representative')];
      const modes = ['all', ...(voiceActor ? ['characters'] : []), ...(vocalist ? ['vocal'] : []), ...(musicMaker ? ['music'] : []), ...(scenarioWriter ? ['scenario'] : []), ...(artworkArtist ? ['artwork'] : [])];
      const buttons = modes.map(mode => {
        const button = node(documentRef, 'button', '', {all:'全部', characters:'声优', vocal:'歌手', music:'音乐制作',scenario:'剧本',artwork:'原画'}[mode]);
        button.type = 'button'; button.dataset.representativeMode = mode;
        button.dataset.detailFocusToken = `representative-mode:${mode}`;
        tabs.append(button); return button;
      });
      const select = index => {
        representativeMode = modes[index];
        detailTitle.textContent = personDisplayNameForRole(person, representativeMode === 'characters' ? 'voice-actor' : representativeMode === 'vocal' ? 'vocalist' : ['music','scenario','artwork'].includes(representativeMode) ? representativeMode : 'all');
        buttons.forEach((button, i) => {
          button.setAttribute('aria-pressed', String(i === index));
        });
        panels.forEach(panel => {
          const songs = panel.classList.contains('person-detail-representative-works');
          panel.hidden = representativeMode !== 'all' && (songs ? representativeMode !== panel.dataset.representativeScope : representativeMode !== 'characters');
        });
        updateIdentityScope();
      };
      buttons.forEach((button, index) => {
        button.addEventListener('click', () => select(index));
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
          select(next); buttons[next].focus();
        });
      });
      select(Math.max(0, modes.indexOf(representativeMode)));
      if (modes.length > 2 || [...recordedRoles].some(role => !personCreditInMode({roleCode:role}, modes[1]))) navigation.append(tabs);
    }

    identity.append(node(documentRef, 'h3', 'person-detail-section-title', '名义'));
    const aliases = node(documentRef, 'div', 'person-detail-aliases');
    for (const variant of personNameVariantLabels(person)) aliases.append(node(documentRef, 'span', 'person-alias-chip', variant));
    if (!aliases.children.length) aliases.append(node(documentRef, 'span', 'person-detail-muted', '暂无其他名义'));
    identity.append(aliases);

    const content = node(documentRef, 'section', 'person-detail-content');
    const pageTabs = node(documentRef, 'nav', 'person-detail-page-tabs');
    pageTabs.id = 'person-detail-page-tabs';
    pageTabs.setAttribute('aria-label', '人物详情分页');
    pageTabs.setAttribute('role', 'tablist');
    const overviewButton = node(documentRef, 'button', 'person-detail-page-tab is-active', '概览');
    overviewButton.type = 'button'; overviewButton.id = 'person-detail-tab-overview'; overviewButton.dataset.personDetailPage = 'overview'; overviewButton.dataset.detailFocusToken = 'tab:overview'; overviewButton.setAttribute('role', 'tab'); overviewButton.setAttribute('aria-selected', 'true'); overviewButton.setAttribute('aria-pressed', 'true'); overviewButton.setAttribute('aria-controls', 'person-detail-panel-overview'); overviewButton.tabIndex = 0;
    const timelineButton = node(documentRef, 'button', 'person-detail-page-tab', '作品年表');
    timelineButton.type = 'button'; timelineButton.id = 'person-detail-tab-timeline'; timelineButton.dataset.personDetailPage = 'timeline'; timelineButton.dataset.detailFocusToken = 'tab:timeline'; timelineButton.setAttribute('role', 'tab'); timelineButton.setAttribute('aria-selected', 'false'); timelineButton.setAttribute('aria-pressed', 'false'); timelineButton.setAttribute('aria-controls', 'person-detail-panel-timeline'); timelineButton.tabIndex = -1;
    pageTabs.append(overviewButton, timelineButton); navigation.append(pageTabs);

    const overviewPage = node(documentRef, 'div', 'person-detail-page person-detail-overview-page');
    overviewPage.id = 'person-detail-panel-overview'; overviewPage.setAttribute('role', 'tabpanel'); overviewPage.setAttribute('aria-labelledby', overviewButton.id); overviewPage.tabIndex = 0;
    const duties = node(documentRef,'section','person-detail-music-duties'); overviewPage.append(duties);
    const activity = node(documentRef, 'section', 'person-detail-block person-detail-activity-block');
    const activityHeading = node(documentRef, 'div', 'person-detail-block-heading');
    activityHeading.append(node(documentRef, 'h3', '', voiceActor && !musicCreator ? '出演频率' : '作品活动'), node(documentRef, 'span', 'person-detail-muted', '作品数 · 按最早已知发行年'));
    activity.append(activityHeading);
    const chart = node(documentRef, 'div', 'person-frequency-chart');
    const bars = node(documentRef, 'div', 'person-frequency');
    const axis = node(documentRef, 'div', 'person-frequency-axis');
    const frequencyNote = node(documentRef, 'div', 'person-frequency-note');
    const updateActivity = summary => {
    bars.replaceChildren(); axis.replaceChildren(); frequencyNote.replaceChildren();
    activityHeading.querySelector('h3').textContent = representativeMode === 'characters' ? '配音活动' : representativeMode === 'vocal' ? '演唱活动' : representativeMode === 'music' ? '音乐制作活动' : representativeMode === 'scenario' ? '剧本活动' : representativeMode === 'artwork' ? '原画活动' : '作品活动';
    const activityYears = extendPersonActivityYears(summary, currentYear);
    activity.hidden = !activityYears.some(item => item.count > 0);
    // Keep the temporal resolution useful on a wide detail panel without
    // forcing every individual year label into the axis.
    const viewport = documentRef.defaultView?.innerWidth ?? 1440;
    const labelCount = Math.min(activityYears.length, viewport <= 760 ? Math.max(3, Math.floor((viewport - 60) / 50)) : 14);
    const labelIndexes = new Set(Array.from({length:labelCount}, (_, i) => Math.round(i * (activityYears.length - 1) / Math.max(1, labelCount - 1))));
    activityYears.forEach((item, index) => {
      const column = node(documentRef, 'button', 'person-frequency-column');
      column.type = 'button'; column.disabled = item.count <= 0;
      column.setAttribute('aria-label', `查看 ${item.year} 年的 ${item.count} 部作品`);
      column.dataset.detailFocusToken = `year:${item.year}`;
      const bar = node(documentRef, 'i', 'person-frequency-bar');
      const percent = Number(item.percent) || 0;
      bar.classList.toggle('is-empty', percent <= 0);
      if (percent > 0) bar.style.height = `${Math.max(4, percent)}%`;
      bar.title = `${item.year} · ${item.count} 部作品`;
      bar.dataset.count = String(item.count);
      column.title = bar.title;
      column.addEventListener('click', () => selectTimelineYear(String(item.year)));
      column.append(bar); bars.append(column);
      const labelText = labelIndexes.has(index) ? item.year : '';
      const label = node(documentRef, 'span', `person-frequency-year${labelText ? '' : ' is-empty'}`, labelText);
      label.style.left = `${index * 100 / Math.max(1, activityYears.length - 1)}%`;
      label.title = `${item.year} · ${item.count} 部作品`;
      axis.append(label);
    });
    if (!activityYears.length) bars.append(node(documentRef, 'span', 'person-detail-muted', '暂无年份数据'));
    frequencyNote.append(
      node(documentRef, 'span', 'person-detail-muted', formatPersonActivitySpan(summary.firstYear, summary.lastYear)),
      node(documentRef, 'span', 'person-detail-muted', `已收录 ${summary.workCount ?? 0} 部作品`)
    );
    };
    chart.append(bars, axis); activity.append(chart, frequencyNote);

    const companyBlock = node(documentRef, 'section', 'person-detail-block person-detail-company-block');
    const companyHeading = node(documentRef, 'div', 'person-detail-block-heading');
    companyHeading.append(node(documentRef, 'h3', '', '最多合作会社')); companyBlock.append(companyHeading);
    const companyList = node(documentRef, 'div', 'person-company-list');
    const updateCompanies = summary => {
    companyList.replaceChildren();
    const coCompanies = summary.coCompanies;
    companyBlock.hidden = !coCompanies.length;
    for (const company of coCompanies.slice(0, 5)) {
      const row = node(documentRef, 'button', 'person-company-row'); row.type = 'button'; row.dataset.companyId = company.companyId; row.dataset.detailFocusToken = `company:${company.companyId}`;
      row.append(node(documentRef, 'span', 'person-company-name', companyName(company.companyId,company.name)), node(documentRef, 'strong', '', company.count), node(documentRef, 'span', 'person-detail-muted', '部作品'));
      row.addEventListener('click', () => onOpenCompany?.(company.companyId)); companyList.append(row);
    }
    if (!companyList.children.length) companyList.append(node(documentRef, 'span', 'person-detail-muted', person.collaborationScopeStatus === 'unresolved' ? '合作会社待按版本重算' : '暂无合作会社'));
    };
    companyBlock.append(companyList);

    const coBlock = node(documentRef, 'section', 'person-detail-block person-detail-co-block');
    updateCollaborators = () => {
    coBlock.replaceChildren(); coBlock.dataset.collaborationMode = representativeMode;
    const modes = representativeMode === 'all' ? [...(voiceActor ? ['characters'] : []), ...(vocalist ? ['vocal'] : []), ...(musicMaker ? ['music'] : []), ...(scenarioWriter ? ['scenario'] : []), ...(artworkArtist ? ['artwork'] : [])] : [representativeMode];
    if (!modes.length) modes.push('all');
    for (const mode of modes) {
    const coHeading = node(documentRef, 'div', 'person-detail-block-heading');
    const coTitle = node(documentRef, 'h3');
    coHeading.append(coTitle);
    coBlock.append(coHeading);
    const coList = node(documentRef, 'div', 'person-co-list');
    const staffPeers = ['scenario','artwork'].includes(mode);
    const songPeers = ['songs','vocal','music'].includes(mode), workPeers = mode === 'music'||staffPeers;
    coTitle.textContent = staffPeers ? `${mode==='scenario'?'剧本':'原画'}合作` : workPeers ? '音乐制作合作' : songPeers ? '演唱合作' : voiceActor ? '共演声优' : '最多合作人物';
    coHeading.title = staffPeers ? '仅按本人以当前职责参与、且双方同版本有制作署名的作品统计；包含剧本、原画、企划等制作协作，跨版本去重。' : workPeers ? '以明确的同曲同版本署名确认合作，按作品去重排序；同作多首BGM和多个版本只计一次。' : songPeers ? '按已收录的同曲、同版本署名统计；相同歌曲跨版本只计一次。'+(person.songCollaborationMode==='vocal'?'列出与演唱合作的作词、作曲、编曲者。':'') : '按已收录的配音关系统计共同出演作品。';
    coList.replaceChildren();
    const legacyPeers = typeof person.getCoActors === 'function' ? person.getCoActors() : (person.coActors ?? []);
    const legacyIsSong = person.collaborationScopeStatus === 'recorded-song-relations';
    const coActors = staffPeers ? person[mode+'CoActors']??[] : mode === 'vocal' ? person.vocalCoActors ?? [] : workPeers ? person.musicCoActors ?? [] : songPeers ? person.songCoActors ?? (legacyIsSong ? legacyPeers : []) : person.voiceCoActors ?? (!legacyIsSong ? legacyPeers : []);
    if (!coActors.length) { coHeading.remove(); continue; }
    for (const actor of coActors.slice(0, 5)) {
      const row = node(documentRef, 'div', 'person-co-row'); row.dataset.personId = actor.personId;
      const name=node(documentRef, 'button', 'person-co-name', actor.name);
      name.type = 'button'; name.dataset.detailFocusToken = `person:${actor.personId}`;
      name.setAttribute('aria-label', `查看人物 ${actor.name}`);
      if(songPeers||staffPeers){
        name.classList.add('person-co-song-person');
        const duties=node(documentRef,'span','person-co-song-duties',(staffPeers?['scenario','artwork','director','planning','original-story','character-design']:['vocalist','lyrics','composition','arrangement']).filter(role=>actor.roles?.[role]).map(roleLabel).join(' · '));
        duties.title=Object.entries(actor.roles??{}).map(([role,count])=>`${roleLabel(role)}：${count} ${workPeers?'部作品':'首'}`).join('；');name.append(duties);
      }
      name.addEventListener('click', () => onOpenPerson?.(actor.personId));
      const toggle = node(documentRef, 'button', 'person-peer-expand'); toggle.type = 'button';
      toggle.dataset.detailFocusToken = `peer:${mode}:${actor.personId}`;
      toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', `查看与${actor.name}合作的${songPeers && !workPeers ? '歌曲' : '作品'}`);
      toggle.append(node(documentRef, 'strong', '', actor.count), node(documentRef, 'span', '', songPeers && !workPeers ? '首歌' : '部作品'), node(documentRef, 'span', 'person-peer-chevron', '›'));
      const detail = node(documentRef, 'div', 'person-peer-detail'); detail.hidden = true;
      detail.id = `person-peer-${mode}-${actor.personId}`; toggle.setAttribute('aria-controls', detail.id);
      let loaded = false, pending = false;
      const loadDetail = async () => {
        if (loaded || pending) return;
        pending = true; detail.replaceChildren(node(documentRef, 'span', 'person-detail-muted', '正在读取合作记录…'));
        detail.setAttribute('aria-busy', 'true');
        try {
          const [peer, own] = await Promise.all([
            onLoadPerson?.(actor.personId, actor, {signal: sectionSignal}),
            sections ? onLoadPerson?.(person.entityId, person, {signal: sectionSignal}) : person
          ]);
          if (!peer?.credits) throw Error('人物署名未加载');
          if (!detail.isConnected) return;
          const entries = personCollaborationDetails(own.credits, peer.credits, { songs: songPeers, vocalOnly: mode === 'vocal', musicOnly:mode==='music', workUnit:workPeers, staffMode:staffPeers?mode:null });
          detail.replaceChildren();
          const list = node(documentRef, 'div', 'person-peer-records'); detail.append(list);
          let count = 0;
          const more = node(documentRef, 'button', 'person-peer-more', '显示更多'); more.type = 'button';
          const append = () => {
            const end = Math.min(entries.length, count + 8);
            for (; count < end; count++) {
              const entry = entries[count], item = node(documentRef, 'div', 'person-peer-record');
              item.append(node(documentRef, 'strong', '', entry.title || (songPeers && !workPeers ? '歌曲' : '作品')));
              if (songPeers||staffPeers) item.append(node(documentRef, 'span', 'person-detail-muted', entry.roles.map(roleLabel).join(' / ')));
              for (const work of entry.works) {
                const target = work.workId || work.sourceWorkId || work.nativeWorkId;
                const member = work.workId ? familyForWork(work.workId)?.members?.find(m => String(m.workId) === String(work.workId)) : null;
                const label = [songPeers ? work.title : '', work.workId ? formatReleaseDate(work.releaseDate) : '作品记录', member?.platform].filter(Boolean).join(' · ');
                const link = node(documentRef, target ? 'button' : 'span', 'person-peer-work', label);
                if (target) { link.type = 'button'; link.dataset.detailFocusToken = toggle.dataset.detailFocusToken; link.addEventListener('click', () => work.nativeWorkId && !work.workId && !work.sourceWorkId ? documentRef.defaultView.location.hash = nativeEntryHref(work.nativeWorkId) : onOpenWork?.(target)); }
                item.append(link);
              }
              list.append(item);
            }
            more.hidden = count >= entries.length;
          };
          more.addEventListener('click', append); detail.append(more); append();
          while (count < Math.min(entries.length, Number(toggle.dataset.restoreCount) || 0)) append();
          if (!entries.length) detail.append(node(documentRef, 'span', 'person-detail-muted', '暂未取得可展开的合作记录'));
          detail.dataset.recordCount = String(entries.length); loaded = true;
        } catch {
          if (!detail.isConnected) return;
          const retry = node(documentRef, 'button', 'person-peer-more', '明细未能加载，点击重试'); retry.type = 'button'; retry.addEventListener('click', loadDetail); detail.replaceChildren(retry);
        } finally { pending = false; detail.removeAttribute('aria-busy'); }
      };
      toggle.addEventListener('click', () => { detail.hidden = !detail.hidden; toggle.setAttribute('aria-expanded', String(!detail.hidden)); if (!detail.hidden) void loadDetail(); });
      row.append(name, toggle, detail); coList.append(row);
    }
    if (!coList.children.length) coList.append(node(documentRef, 'span', 'person-detail-muted', songPeers ? '暂无已收录的歌曲合作署名' : person.collaborationScopeStatus === 'unresolved' ? '合作关系待按版本重算' : '暂无共演关系'));
    coBlock.append(coList);
    }
    coBlock.hidden = !coBlock.querySelector('.person-co-list');
    };
    const relationSummary = node(documentRef, 'div', 'person-detail-relation-summary');
    relationSummary.append(companyBlock, coBlock);
    overviewPage.append(activity, relationSummary); content.append(overviewPage);

    const timelinePage = node(documentRef, 'div', 'person-detail-page person-detail-timeline-page');
    timelinePage.id = 'person-detail-panel-timeline'; timelinePage.setAttribute('role', 'tabpanel'); timelinePage.setAttribute('aria-labelledby', timelineButton.id); timelinePage.tabIndex = 0;
    timelinePage.hidden = true;
    const worksBlock = node(documentRef, 'section', 'person-detail-block person-detail-works-block');
    const worksHeading = node(documentRef, 'div', 'person-detail-block-heading');
    worksHeading.classList.add('person-timeline-toolbar');
    const timelineTools = node(documentRef, 'div', 'person-detail-sort-tools gp-sort-control');
    const timelineYear = node(documentRef, 'select', 'person-timeline-year');
    timelineYear.setAttribute('aria-label', '按年份筛选年表');
    timelineYear.dataset.detailFocusToken = 'timeline-year';
    const updateYearOptions = () => {
      const selected = timelineYear.value;
      const years = sections?.years[representativeMode] ?? [...new Set(scopedGroups().map(c => releaseYear(c.releaseDate)).filter(Boolean))].sort((a,b) => b-a);
      timelineYear.hidden = !years.length;
      timelineYear.replaceChildren();
      for (const value of ['', ...years.map(String)]) {
        const option = node(documentRef, 'option', '', value ? `${value} 年` : '全部年份');
        option.value = value; timelineYear.append(option);
      }
      timelineYear.value = years.map(String).includes(selected) ? selected : '';
    };
    const timelineSort = node(documentRef, 'select', 'person-detail-sort');
    timelineSort.dataset.detailFocusToken = 'timeline-sort';
    timelineSort.setAttribute('aria-label', '作品年表排序');
    for (const [value, label] of [
      ['releaseDate', '发售日期'],
      ['bangumiVoteCount', 'Bangumi 评分人数'],
      ['bangumiScore', 'Bangumi 评分']
    ]) {
      const option = node(documentRef, 'option', '', label);
      option.value = value;
      timelineSort.append(option);
    }
    const timelineDirection = node(documentRef, 'button', 'person-detail-sort-direction');
    timelineDirection.type = 'button';
    timelineDirection.dataset.ui = 'utility';
    timelineDirection.dataset.detailFocusToken = 'timeline-direction';
    const timelineSortState = { key: 'releaseDate', direction: 'desc' };
    const timelineStates = new Map(); layout.identityTimelineStates = timelineStates; let activeTimelineMode = representativeMode;
    const updateTimelineControls = () => {
      timelineSort.value = timelineSortState.key;
      syncSortDirectionControl({
        button: timelineDirection,
        icon: timelineDirection,
        direction: timelineSortState.direction,
        labelPrefix: '作品年表排序',
        documentRef
      });
    };
    timelineTools.append(timelineYear, timelineSort, timelineDirection);
    const searchBar = node(documentRef, 'div', 'person-timeline-searchbar');
    const timelineSearch = node(documentRef, 'input', 'person-timeline-search');
    timelineSearch.type = 'search'; timelineSearch.placeholder = '查找作品、角色、歌曲或职责';
    timelineSearch.setAttribute('aria-label', '在人物作品年表中查找');
    timelineSearch.dataset.detailFocusToken = 'timeline-search';
    const searchStatus = node(documentRef, 'span', 'person-timeline-search-status');
    searchStatus.setAttribute('role', 'status');
    searchBar.append(timelineSearch);
    worksHeading.append(searchBar, timelineTools);
    worksBlock.append(worksHeading, searchStatus);
    const workList = node(documentRef, 'div', 'person-detail-works');
    const workForCredit = credit => credit.work ?? credit;
    const TIMELINE_BATCH_SIZE = 48;
    let timelineCredits = [];
    let timelineRenderedCount = 0;
    const normalizeSearch = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
    const searchText = new Map();
    const searchableText = c => {
      if (!searchText.has(c)) searchText.set(c, normalizeSearch([
        c.title, c.displayTitle, c.releaseDate, ...c.roleCodes.map(roleLabel), familyForWork(c.workId)?.members?.find(m => String(m.workId) === String(c.workId))?.platform,
        ...c.characters.map(x => x.name), ...c.songs.flatMap(x => [x.title, ...x.categories.map(songCategoryLabel), ...x.roleCodes.map(roleLabel)]),
        ...creditResponsibilityNotes(c.sourceCredits), ...c.sourceCredits.map(creditResponsibilityText), ...c.sourceCredits.map(credit => credit.creditedName)
      ].filter(Boolean).join(' ')));
      return searchText.get(c);
    };
    const sortedCredits = () => scopedGroups().filter(c => {
      if (timelineYear.value && String(releaseYear(c.releaseDate)) !== timelineYear.value) return false;
      const query = normalizeSearch(timelineSearch.value);
      return !query || query.split(' ').every(term => searchableText(c).includes(term));
    }).sort((a, b) => {
      if (person.scopeRevision && Boolean(a.workId||a.nativeReleaseIdentity) !== Boolean(b.workId||b.nativeReleaseIdentity)) return a.workId||a.nativeReleaseIdentity ? -1 : 1;
      const aw = workForCredit(a); const bw = workForCredit(b);
      const key = timelineSortState.key;
      const av = key === 'releaseDate' ? (a.releaseDate ?? aw.releaseDate ?? '') : aw[key];
      const bv = key === 'releaseDate' ? (b.releaseDate ?? bw.releaseDate ?? '') : bw[key];
      if (key === 'releaseDate') return releaseDateSortCompare(av, bv, { direction: timelineSortState.direction }) || String(a.workId ?? '').localeCompare(String(b.workId ?? ''), 'en');
      const aMissing = av === null || av === undefined || av === '';
      const bMissing = bv === null || bv === undefined || bv === '';
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      let result = typeof av === 'number' && typeof bv === 'number' ? bv - av : String(bv ?? '').localeCompare(String(av ?? ''), 'zh-Hans');
      if (timelineSortState.direction === 'asc') result *= -1;
      return result || String(a.workId ?? '').localeCompare(String(b.workId ?? ''), 'en') || String(a.displayTitle ?? a.title ?? '').localeCompare(String(b.displayTitle ?? b.title ?? ''), 'zh-Hans');
    });
    const appendTimelineDOM = () => {
      const start = timelineRenderedCount;
      const end = Math.min(timelineCredits.length, start + TIMELINE_BATCH_SIZE);
      for (let index = start; index < end; index += 1) {
        const editionGroup = timelineCredits[index];
        const container = node(documentRef, 'div', 'person-edition-group');
        container.dataset.editionGroup = editionGroup.rows.map(row => String(row.workId || row.sourceWorkIdentity || '')).sort().join('|');
        const distinctEditionTitles = new Set(editionGroup.rows.map(row => row.editionTitle || row.title).filter(Boolean)).size > 1;
        let others = null;
        for (const [editionIndex, credit] of editionGroup.rows.entries()) {
      const targetWorkId=credit.workId||credit.sourceWorkId||credit.nativeWorkId;
      const row = node(documentRef, 'button', 'person-work-row'); row.type = 'button'; if (person.scopeRevision) row.classList.add('has-edition-scope'); row.dataset.workId = credit.workId ?? ''; row.dataset.detailFocusToken = credit.workId ? `timeline-work:${credit.workId}` : `timeline-work:missing:${index}`; row.disabled = !targetWorkId;
      row.setAttribute('aria-setsize', String(timelineCredits.length));
      row.setAttribute('aria-posinset', String(index + 1));
      row.setAttribute('aria-label', `打开作品 ${credit.displayTitle ?? credit.title ?? '未命名作品'}`);
      const thumb = node(documentRef, 'span', 'person-work-thumb');
      const imageSource = typeof imageUrlForWork === 'function' ? imageUrlForWork(credit) : null;
      const thumbnailUrl = typeof imageSource === 'string' ? imageSource : imageSource?.thumbnailUrl;
      if (thumbnailUrl || loadImageForWork) {
        const image = node(documentRef, 'img');
        setWorkImage(image, credit, thumbnailUrl);
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => { image.hidden = true; thumb.textContent = '▧'; }, { once: true });
        thumb.append(image);
      } else {
        thumb.textContent = '▧';
      }
      const copy = node(documentRef, 'span', 'person-work-copy');
      copy.append(node(documentRef, 'strong', 'person-work-title', credit.displayTitle ?? credit.title ?? '未命名作品'));
      const editionTitle = credit.editionTitle || credit.title;
      const editionText = [credit.editionPlatform, distinctEditionTitles && editionTitle !== credit.displayTitle ? editionTitle : ''].filter(Boolean).join(' · ');
      if (editionText) copy.append(node(documentRef, 'span', 'person-work-edition', editionText));
      for (const character of credit.characters) {
        const characterRole = characterRoleLabel(character.role);
        const roleClass = ['主角'].includes(characterRole) ? 'is-main' : ['配角'].includes(characterRole) ? 'is-side' : 'is-appears';
        const characterLine = node(documentRef, 'span', 'person-work-character');
        characterLine.append(node(documentRef, 'span', '', `饰演：${character.name}`));
        if (characterRole) characterLine.append(node(documentRef, 'span', `person-character-role ${roleClass}`, characterRole));
        if(character.appearanceContext)characterLine.append(node(documentRef,'span','person-character-role',character.appearanceContext));
        copy.append(characterLine);
      }
      if(credit.voiceCreditNotes?.length)copy.append(node(documentRef,'span','person-work-character','配音署名：'+credit.voiceCreditNotes.join('；')));
      const songDisplay=personSongDisplay(credit.songs,credit.sourceCredits);
      for (const song of songDisplay.songs) {
        const line = node(documentRef, 'span', 'person-work-song');
        if(song.songId)line.dataset.songId = song.songId;
        if(song.displayNotes.length)line.title=[...new Set(song.displayNotes)].join('；');
        const usage = [...new Set(song.categories.map(songCategoryLabel))].join(' / ');
        const roles = song.roleCodes.map(roleLabel).join(' / ');
        if (usage) line.append(node(documentRef, 'span', 'person-song-usage', usage));
        line.append(node(documentRef, 'span', 'person-song-title', song.title));
        if (roles) line.append(node(documentRef, 'span', 'person-song-duty', roles));
        for(const detail of song.displayDetails??[])if(detail!==roles)line.append(node(documentRef,'span','person-song-duty',detail));
        copy.append(line);
      }
      const notesByRole = new Map();
      for(const note of songDisplay.notes){const label=roleLabel(note.roleCode);if(!notesByRole.has(label))notesByRole.set(label,[]);notesByRole.get(label).push(note.text);}
      for (const [label, noteRows] of notesByRole) {
        const detail = node(documentRef, 'span', 'person-credit-scope-notes', label + '：' + noteRows.join('；'));
        detail.style.display = 'block'; detail.style.whiteSpace = 'normal'; detail.style.overflowWrap = 'anywhere';
        copy.append(detail);
      }
      const specificSongRole = credit.roleCodes.some(role => ['vocalist', 'vocal', 'lyrics', 'composition', 'arrangement'].includes(role));
      const shownSongRoles = new Set(songDisplay.songs.flatMap(song => song.roleCodes.map(canonicalRole)));
      const labels = [...new Set(credit.roleCodes.filter(role => (role !== 'songs' || !specificSongRole) && !shownSongRoles.has(canonicalRole(role))).map(roleLabel))];
      const meta = node(documentRef, 'span', 'person-work-meta');
      meta.append(node(documentRef,'span','person-work-date',credit.scope?.status && credit.scope.status !== 'confirmed' && !credit.nativeReleaseIdentity ? '作品记录' : formatReleaseDate(credit.releaseDate)), node(documentRef,'span','person-work-duties',labels.join(' / ')));
      meta.title = [meta.querySelector('.person-work-date').textContent, labels.join(' / ')].filter(Boolean).join(' · ');
      const sourceNotes = [...new Set(credit.sourceCredits.map(item => item.sourceRoleDetailName).filter(Boolean))];
      if (sourceNotes.length) meta.title += `\n来源记载：${sourceNotes.join('；')}`;
      row.append(thumb, copy, meta); row.addEventListener('click', () => {if(credit.nativeWorkId&&!credit.workId&&!credit.sourceWorkId)documentRef.defaultView.location.hash=nativeEntryHref(credit.nativeWorkId);else if(targetWorkId)onOpenWork?.(targetWorkId);});
      if (editionIndex === 0) container.append(row);
      else {
        if (!others) {
          others = node(documentRef, 'details', 'person-edition-others');
          const summary = node(documentRef, 'summary', '', `另有 ${editionGroup.rows.length - 1} 个版本`);
          summary.dataset.detailFocusToken = `editions:${editionGroup.rows[0].workId}`;
          others.append(summary); container.append(others);
        }
        others.append(row);
      }
      }
      workList.append(container);
      }
      timelineRenderedCount = end;
      if (!timelineRenderedCount) workList.append(node(documentRef, 'span', 'person-detail-muted', timelineSearch.value.trim() || timelineYear.value ? '没有找到匹配的作品记录' : '暂无作品记录'));
    };
    let timelineDirty = true, timelineTicket = 0, timelineIndex, batchPending = null;
    const reportTimelineError = error => {
      if (sectionSignal.aborted || !layout.isConnected) return;
      searchStatus.replaceChildren();
      const retry = node(documentRef, 'button', 'person-peer-more', '年表未能加载，点击重试');
      retry.type = 'button'; retry.addEventListener('click', renderTimeline); searchStatus.append(retry);
    };
    const appendTimelineBatch = () => {
      if (batchPending) return batchPending;
      const ticket = timelineTicket, groups = timelineCredits;
      const start = timelineRenderedCount, end = Math.min(groups.length, start + TIMELINE_BATCH_SIZE);
      const pending = (async () => {
        if (sections && start < end) {
          const selected = groups.slice(start, end);
          const ids = selected.flatMap(g => g.ids);
          const rows = await onLoadPerson(person.entityId, person, {section:'records', ids, index:timelineIndex, signal:sectionSignal});
          if (ticket !== timelineTicket || sectionSignal.aborted) return;
          let offset = 0;
          for (const group of selected) { group.rows = rows.slice(offset, offset + group.ids.length); offset += group.ids.length; }
        }
        if (ticket === timelineTicket && !sectionSignal.aborted) appendTimelineDOM();
      })();
      batchPending = pending;
      pending.catch(error => { if (ticket === timelineTicket) reportTimelineError(error); }).finally(() => { if (batchPending === pending) batchPending = null; });
      return pending;
    };
    state.restoreTimelineCount = async count => {
      if (layout.dataset.page !== 'timeline') return;
      while (!sectionSignal.aborted && timelineRenderedCount < Math.min(count, timelineCredits.length)) {
        const before = timelineRenderedCount;
        try { await appendTimelineBatch(); } catch { break; }
        if (timelineRenderedCount === before) break;
      }
    };
    const renderTimeline = () => {
      timelineDirty = true;
      const ticket = ++timelineTicket; batchPending = null;
      updateTimelineControls();
      if (layout.dataset.page !== 'timeline') return;
      timelineDirty = false;
      workList.setAttribute('aria-busy','true');
      timelineCredits = []; timelineRenderedCount = 0; workList.replaceChildren();
      const query = {mode:representativeMode, year:timelineYear.value, search:timelineSearch.value, ...timelineSortState};
      state.timelineReady = (async () => {
        let totalRecords, totalWorks;
        if (sections) {
          searchStatus.textContent = '正在读取作品年表…';
          const index = await onLoadPerson(person.entityId, person, {section:'index', signal:sectionSignal});
          if (ticket !== timelineTicket || sectionSignal.aborted) return;
          timelineIndex = index;
          const result = queryPersonTimeline(index, query);
          timelineCredits = result.groups; totalRecords = result.totalRecords; totalWorks = result.totalWorks;
        } else {
          const matches = sortedCredits();
          timelineCredits = groupPersonEditionRows(matches, familyForWork); totalRecords = matches.length; totalWorks = new Set(matches.map(r=>r.presentationWorkId||r.sourceWorkIdentity||r.workId||r.nativeReleaseIdentity)).size;
        }
        searchStatus.textContent = query.search.trim() || query.year ? `${query.year ? query.year + ' 年 · ' : ''}${totalWorks} 部作品` : '';
        await appendTimelineBatch();
      })().catch(error => { if (ticket === timelineTicket) reportTimelineError(error); }).finally(() => {
        if (ticket === timelineTicket) workList.setAttribute('aria-busy','false');
      });
      return state.timelineReady;
    };
    workList.addEventListener('scroll', () => {
      if (timelineRenderedCount >= timelineCredits.length) return;
      if (workList.scrollTop + workList.clientHeight < workList.scrollHeight - 180) return;
      appendTimelineBatch();
    }, { passive: true });
    // On narrow screens the dialog's layout, rather than the work list, owns
    // the scroll. Keep the same progressive loading behavior there so mobile
    // users can still reach every relation without paying the full DOM cost up
    // front.
    layout.addEventListener('scroll', () => {
      if (timelineRenderedCount >= timelineCredits.length) return;
      if (layout.scrollTop + layout.clientHeight < layout.scrollHeight - 260) return;
      appendTimelineBatch();
    }, { passive: true });
    timelineSort.addEventListener('change', () => { timelineSortState.key = timelineSort.value; renderTimeline(); });
    timelineSearch.addEventListener('input', () => { renderTimeline(); workList.scrollTop = 0; });
    timelineYear.addEventListener('change', () => { renderTimeline(); workList.scrollTop = 0; });
    selectTimelineYear = year => {
      timelineYear.value = year;
      timelineSearch.value = '';
      renderTimeline(); workList.scrollTop = 0; timelineButton.click(); timelineYear.focus();
    };
    timelineDirection.addEventListener('click', () => { timelineSortState.direction = timelineSortState.direction === 'asc' ? 'desc' : 'asc'; renderTimeline(); });
    updateIdentityScope = () => {
      if(activeTimelineMode !== representativeMode){
        timelineStates.set(activeTimelineMode,{...timelineSortState,year:timelineYear.value,search:timelineSearch.value});
        const saved=timelineStates.get(representativeMode)??{key:'releaseDate',direction:'desc',year:'',search:''};
        Object.assign(timelineSortState,{key:saved.key,direction:saved.direction});timelineSearch.value=saved.search;
        updateYearOptions();timelineYear.value=saved.year;activeTimelineMode=representativeMode;
      }
      const stats=person.roleStats??{},nameCount=personNameVariantCount(person);
      const metricRole={characters:'voice-actor',vocal:'vocalist',music:'music',scenario:'scenario',artwork:'artwork'}[representativeMode];
      detailMeta.textContent=(metricRole?personDirectoryMetric(person,metricRole):`总收录 ${person.workCount??0} 部作品`)+` · ${nameCount} 个名义`;
      detailMeta.title=metricRole?personDirectoryMetricHint(metricRole):'按已核定作品身份去重；各版本的原始署名保留在年表中。';
      if(detailPrimaryRole)detailPrimaryRole.textContent=representativeMode==='all'?allRoleText:{characters:'声优',vocal:'演唱',music:'音乐制作',scenario:'剧本',artwork:'原画'}[representativeMode];
      duties.replaceChildren();duties.hidden=representativeMode!=='music';
      if(!duties.hidden){
        duties.append(node(documentRef,'h3','','制作职责'));
        const labels=[['compositionWorks','作曲'],['lyricsWorks','作词'],['arrangementWorks','编曲'],['genericMusicWorks','未细分职责']];
        const line=node(documentRef,'div','person-detail-duty-counts');
        for(const [key,label]of labels)if(stats[key]>0)line.append(node(documentRef,'span','',`${label} ${stats[key]} 部`));
        duties.append(line,node(documentRef,'p','person-detail-muted','同一作品可以兼任多项职责，分项不相加。'));
      }
      const summary = sections?.overviews[representativeMode] ?? personScopeOverview(scopedGroups());
      updateYearOptions(); updateActivity(summary); updateCompanies(summary); updateCollaborators(); renderTimeline();
      workList.scrollTop = 0;
      updateOverviewAvailability();
    };
    updateIdentityScope();
    worksBlock.append(workList); timelinePage.append(worksBlock); content.append(timelinePage);
    const pageButtons = [overviewButton, timelineButton];
    for (const button of pageButtons) button.addEventListener('click', () => {
      const showOverview = button.dataset.personDetailPage === 'overview';
      layout.dataset.page = showOverview ? 'overview' : 'timeline';
      overviewPage.hidden = !showOverview; timelinePage.hidden = showOverview;
      if (!showOverview && timelineDirty) renderTimeline();
      pageButtons.forEach(item => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); item.setAttribute('aria-pressed', String(active)); item.tabIndex = active ? 0 : -1; });
      layout.scrollTop = 0;
    });
    pageButtons.forEach((button, index) => button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? pageButtons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + pageButtons.length) % pageButtons.length;
      pageButtons[targetIndex].click();
      pageButtons[targetIndex].focus();
    }));
    const sourceWorksHeading = node(documentRef, 'h3', '', '参与作品');
    sourceWorksHeading.hidden = true; worksHeading.prepend(sourceWorksHeading);
    updateOverviewAvailability = () => {
      const hasOverview = !activity.hidden || !companyBlock.hidden || !coBlock.hidden;
      // A directory summary may not contain credits yet. Keep its initial tab
      // until the full record loads so state restoration cannot make a normal
      // person's first visit inherit a temporary empty-summary fallback.
      const timelineOnly = (sections?.groupCount ?? groupedCredits.length) > 0 && !hasOverview;
      overviewButton.hidden = timelineOnly;
      pageTabs.hidden = timelineOnly;
      sourceWorksHeading.hidden = !timelineOnly;
      navigation.hidden = [...navigation.children].every(child => child.hidden);
      if (timelineOnly) timelineButton.click();
    };
    updateOverviewAvailability();
    layout.append(navigation, identity, content); detailBody.append(layout);
  }

}
