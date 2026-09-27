import { resolveAssetUrl } from './asset-url.js';
import { withCjkPersonSearchKey } from './person-search.js';
import { buildPersonDirectoryActivity, formatPersonActivitySpan, resolvePersonActivityBounds } from './person-activity-timeline.js';
import { personNameVariantCount } from './person-name-variants.js';

// Projection only: no DOM, fetch, route state or source-cache ownership.
export function buildPersonRecords(state, {
  worksById, companies, workDisplayTitlesById, characterAssetBase, assetBase,
  representativeFamilyByWorkId, presentationFamilies
}, characterImageMap = null) {
    const personWorks = worksById;
    const records = Array.isArray(state?.records) ? state.records : [];
    const personCreditYears = records.flatMap(person => (person.credits ?? []).map(credit => {
      const work = personWorks.get(String(credit.workId ?? ''));
      return Number(String(credit.releaseDate ?? work?.releaseDate ?? '').slice(0, 4));
    })).filter(year => Number.isInteger(year) && year > 1900);
    const personActivityBounds = resolvePersonActivityBounds(personCreditYears.length ? [{
      firstYear: Math.min(...personCreditYears),
      lastYear: Math.max(...personCreditYears)
    }] : []);
    const imageByCharacterId = new Map();
    const imageBySourceCharacterId = new Map();
    for (const mapping of characterImageMap?.bySourceCharacterId?.values?.() ?? []) {
      if (mapping?.characterId && !imageByCharacterId.has(mapping.characterId)) imageByCharacterId.set(mapping.characterId, mapping);
      if (mapping?.sourceCharacterId && !imageBySourceCharacterId.has(mapping.sourceCharacterId)) imageBySourceCharacterId.set(mapping.sourceCharacterId, mapping);
    }
      const nameById = new Map(records.map(person => [person.entityId, person.displayName ?? person.canonicalName ?? '未命名人物']));
    const workPeople = new Map();
    for (const person of records) {
      for (const credit of person.credits ?? []) {
        if (!credit.workId) continue;
        const bucket = workPeople.get(String(credit.workId)) ?? new Set();
        bucket.add(person.entityId); workPeople.set(String(credit.workId), bucket);
      }
    }
    const companyNameById = new Map(companies.map(company => [String(company.companyId), company.brandName]));
    const projected = records.map(person => {
      const credits = [...(person.credits ?? [])].map(credit => {
        const work = personWorks.get(String(credit.workId ?? ''));
        const characterImage = imageByCharacterId.get(String(credit.characterId ?? ''))
          ?? imageBySourceCharacterId.get(String(credit.sourceCharacterId ?? ''));
        return {
        ...credit,
        displayTitle: workDisplayTitlesById?.get?.(String(credit.workId)) ?? work?.displayTitle ?? credit.title,
        releaseDate: credit.releaseDate ?? work?.releaseDate ?? '',
        bangumiScore: Number.isFinite(work?.bangumiScore) ? work.bangumiScore : null,
        bangumiVoteCount: Number.isSafeInteger(work?.bangumiVoteCount) ? work.bangumiVoteCount : null,
        characterImageUrl: characterImage?.assetPath
          ? `${characterAssetBase}${characterImage.assetPath}`
          : null
        };
      }).sort((a, b) => String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')) || String(a.title).localeCompare(String(b.title), 'zh-Hans'));
      const years = credits.map(credit => Number(String(credit.releaseDate ?? '').slice(0, 4))).filter(year => Number.isInteger(year) && year > 1900);
      const firstYear = years.length ? Math.min(...years) : null; const lastYear = years.length ? Math.max(...years) : null;
      const activityYears = firstYear === null || lastYear === null
        ? []
        : Array.from({ length: lastYear - firstYear + 1 }, (_, index) => ({ year: firstYear + index, count: 0 }));
      if (firstYear !== null) for (const year of years) activityYears[year - firstYear].count += 1;
      const activityPeak = Math.max(1, ...activityYears.map(item => item.count));
      const directoryActivity = buildPersonDirectoryActivity(years, personActivityBounds);
      const workIds = [...new Set(credits.map(credit => String(credit.workId ?? '')).filter(Boolean))];
      // These two lists are only visible after opening a detail dialog. Keep
      // their exact derivation, but defer the peer/company traversal until it
      // is requested so activating the 10k-person directory stays cheap.
      let coActors = null;
      let coCompanies = null;
      const getCoActors = () => {
        if (coActors !== null) return coActors;
        const coCounts = new Map();
        for (const workId of workIds) {
          const peers = workPeople.get(workId);
          for (const peerId of peers ?? []) if (peerId !== person.entityId) coCounts.set(peerId, (coCounts.get(peerId) ?? 0) + 1);
        }
        coActors = [...coCounts.entries()]
          .map(([personId, count]) => ({ personId, count, name: nameById.get(personId) ?? '未命名人物' }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans'))
          .slice(0, 8);
        return coActors;
      };
      const getCoCompanies = () => {
        if (coCompanies !== null) return coCompanies;
        const companyWorks = new Map();
        for (const workId of workIds) {
          const work = personWorks.get(workId);
          const companyId = String(work?.brandId ?? work?.companyId ?? '');
          if (!companyId) continue;
          const bucket = companyWorks.get(companyId) ?? new Set();
          bucket.add(workId);
          companyWorks.set(companyId, bucket);
        }
        coCompanies = [...companyWorks.entries()]
          .map(([companyId, companyWorkIds]) => ({ companyId, count: companyWorkIds.size, name: companyNameById.get(companyId) ?? '未收录会社' }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans'))
          .slice(0, 5);
        return coCompanies;
      };
      // Count one work once per function. A single source work may list the
      // same person repeatedly (or under two duplicate credit rows); counting
      // raw rows makes the directory tabs unstable and can promote a minor
      // secondary function to the primary one.
      const roleWorkKeys = new Map();
      for (const credit of credits) {
        const role = credit.creditType === 'character-voiced-by' ? 'voice-actor' : String(credit.roleCode ?? 'unknown');
        const workKey = String(credit.workId ?? credit.workEntityId ?? credit.relationId ?? '');
        const keys = roleWorkKeys.get(role) ?? new Set();
        keys.add(workKey); roleWorkKeys.set(role, keys);
      }
      const roles = Object.create(null);
      for (const [role, keys] of roleWorkKeys) roles[role] = keys.size;
      for (const hint of person.roleHints ?? []) if (!roles[hint]) roles[hint] = 1;
      const roleOrder = ['voice-actor', 'scenario', 'artwork', 'music', 'unknown'];
      const primaryRole = roleOrder
        .filter(role => role !== 'unknown' || Object.keys(roles).length === 0)
        .sort((left, right) => (roles[right] ?? 0) - (roles[left] ?? 0) || roleOrder.indexOf(left) - roleOrder.indexOf(right))[0] ?? 'unknown';
      const nameVariantCount = personNameVariantCount(person);
      const workKeys = credits.map(credit => credit.workId ?? credit.workEntityId).filter(Boolean);
      // Non-voice staff use their highest-vote credited works as the identity
      // panel's representative works. Resolve against the catalog first so
      // unresolved source-only credits cannot surface as guessed cards.
      const representativeWorkById = new Map();
      for (const credit of credits) {
        const workId = String(credit.workId ?? credit.workEntityId ?? '');
        if (!workId || representativeWorkById.has(workId)) continue;
        const work = personWorks.get(workId);
        if (!work) continue;
        const thumbnailPath = work.projectedThumbnailPath ?? work.coverPath;
        representativeWorkById.set(workId, {
          workId,
          title: workDisplayTitlesById?.get?.(workId) ?? work.displayTitle ?? credit.displayTitle ?? work.title ?? credit.title ?? `作品 ${workId}`,
          releaseDate: work.releaseDate ?? credit.releaseDate ?? '',
          median: Number.isFinite(work.median) ? work.median : null,
          voteCount: Number.isSafeInteger(work.voteCount) ? work.voteCount : null,
          bangumiScore: Number.isFinite(work.bangumiScore) ? work.bangumiScore : null,
          bangumiVoteCount: Number.isSafeInteger(work.bangumiVoteCount) ? work.bangumiVoteCount : null,
          imageUrl: thumbnailPath ? resolveAssetUrl(thumbnailPath, assetBase) : null
        });
      }
      const rankedRepresentativeWorks = [...representativeWorkById.values()]
        .sort((a, b) => {
          const aRated = Number.isSafeInteger(a.bangumiVoteCount);
          const bRated = Number.isSafeInteger(b.bangumiVoteCount);
          return Number(bRated) - Number(aRated)
            || (b.bangumiVoteCount ?? -1) - (a.bangumiVoteCount ?? -1)
            || a.workId.localeCompare(b.workId, 'en')
            || a.title.localeCompare(b.title, 'zh-Hans');
        });
      const representativeWorks = [];
      const seenRepresentativeFamilies = new Set();
      for (const work of rankedRepresentativeWorks) {
        const familyId = representativeFamilyByWorkId.get(String(work.workId))
          ?? presentationFamilies?.familyForWork?.(String(work.workId))?.presentationWorkId;
        const familyKey = familyId ? `family:${familyId}` : `work:${work.workId}`;
        if (seenRepresentativeFamilies.has(familyKey)) continue;
        seenRepresentativeFamilies.add(familyKey);
        representativeWorks.push(work);
        if (representativeWorks.length >= 3) break;
      }
      const representativeCharacters = [];
      const seenCharacters = new Set();
      const seenSeriesCharacters = new Set();
      const seenRepresentativeNames = new Set();
      const normalizeRepresentativeCharacterName = value => String(value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase('ja')
        .replace(/[\p{P}\p{S}\s]+/gu, '');
      const representativeSeriesKey = credit => {
        const workId = String(credit.workId ?? '');
        const family = presentationFamilies?.familyForWork?.(workId) ?? null;
        // Some related entries (for example the different Muv-Luv games)
        // are separate VNDB families but share a stable title prefix. Use
        // that prefix only for representative-display de-duplication; the
        // underlying work/character relations remain untouched.
        // Prefer the family title when available so a family member and a
        // related standalone entry resolve to the same prefix.
        const title = String(family?.title ?? credit.displayTitle ?? credit.title ?? '').normalize('NFKC').trim();
        const prefix = title.match(/^[^\s~～\-—:：([{【「『]+/u)?.[0] ?? '';
        return normalizeRepresentativeCharacterName(prefix) || family?.presentationWorkId || workId;
      };
      const voicedCredits = credits
        .filter(credit => credit.creditType === 'character-voiced-by' && credit.characterId)
        .sort((a, b) => {
          const aMain = ['main', 'primary', 'メイン'].includes(String(a.characterRole ?? '')) ? 1 : 0;
          const bMain = ['main', 'primary', 'メイン'].includes(String(b.characterRole ?? '')) ? 1 : 0;
          return bMain - aMain
            || Number(Boolean(b.characterImageUrl)) - Number(Boolean(a.characterImageUrl))
            || (Number(personWorks.get(String(b.workId))?.bangumiVoteCount) || 0) - (Number(personWorks.get(String(a.workId))?.bangumiVoteCount) || 0)
            || String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? ''))
            || String(a.characterName ?? '').localeCompare(String(b.characterName ?? ''), 'zh-Hans');
        });
      const hasMainCharacter = voicedCredits.some(credit => ['main', 'primary', 'メイン'].includes(String(credit.characterRole ?? '')));
      for (const credit of voicedCredits) {
        if (hasMainCharacter && !['main', 'primary', 'メイン'].includes(String(credit.characterRole ?? ''))) continue;
        if (seenCharacters.has(credit.characterId)) continue;
        const seriesKey = representativeSeriesKey(credit);
        const characterKey = normalizeRepresentativeCharacterName(credit.characterName || credit.characterId);
        const seriesCharacterKey = `${seriesKey}:${characterKey}`;
        // Source systems may assign different character IDs to the same
        // named character across related entries. Representative cards are a
        // compact display, so keep the first (already best-ranked) instance
        // of an exact normalized name as well as the series-scoped key.
        if (seenRepresentativeNames.has(characterKey) || seenSeriesCharacters.has(seriesCharacterKey)) continue;
        seenCharacters.add(credit.characterId);
        seenRepresentativeNames.add(characterKey);
        seenSeriesCharacters.add(seriesCharacterKey);
        representativeCharacters.push({ characterId: credit.characterId, name: credit.characterName ?? `角色 ${credit.characterId}`, imageUrl: credit.characterImageUrl, workId: credit.workId, title: credit.displayTitle ?? credit.title, role: credit.characterRole });
        if (representativeCharacters.length >= 4) break;
      }
      return withCjkPersonSearchKey({ ...person, credits, representativeWorks, representativeCharacters, workCount: new Set(workKeys).size, totalCredits: credits.length, roles, primaryRole, nameVariantCount, firstYear, lastYear, spanLabel: formatPersonActivitySpan(firstYear, lastYear), activity: directoryActivity, activityYears: activityYears.map(item => ({ ...item, percent: Math.round(item.count / activityPeak * 100) })), coActors, coCompanies, getCoActors, getCoCompanies });
    }).sort((a, b) => b.workCount - a.workCount || a.canonicalName.localeCompare(b.canonicalName, 'zh-Hans'));
    return { records: projected, activityAxis: personActivityBounds };
}
