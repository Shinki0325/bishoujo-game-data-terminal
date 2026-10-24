import { CREDIT_SCOPE } from './credit-scope-config.js';
import {withKnownCompanyName} from './company-name-fallbacks.js';
import { createVndbRatingViewModel } from './vndb-rating-view.js';
import { createBangumiRatingViewModel } from './bangumi-rating-view.js';

// Review decisions take precedence after every metadata/rating projection.
export function reviewedEditionWork(work) {
  if (!work) return work;
  work = reviewedSourceWork(work);
  const o = CREDIT_SCOPE.editionOverrides?.[String(work.workId)];
  if (!o) return work;
  const ratings=work.fullWikiRatings??{};
  // Keep the original observation identity across repeated projections. Merely
  // replacing the card's source ID must not authenticate its previous score.
  const identities={
    vndb:ratings.vndb?.sourceId ?? work.ratingSourceIdentities?.vndb ?? ratings.vndbId ?? work.sourceIds?.vndb ?? null,
    bangumi:ratings.bangumi?.sourceId ?? work.ratingSourceIdentities?.bangumi ?? ratings.bangumi?.subjectId ?? null
  };
  const vndb=Boolean(o.vndbId && identities.vndb===o.vndbId);
  const bangumi=Boolean(o.bangumiSubjectId && String(identities.bangumi)===String(o.bangumiSubjectId));
  return {...work, presentationWorkId:o.presentationWorkId,
    ratingSourceIdentities:identities,
    fullWikiPresentationWorkId:o.presentationWorkId, workGroupId:o.presentationWorkId,
    sourceIds:{...work.sourceIds, vndb:o.vndbId, bangumiSubjectsExactEgs:[o.bangumiSubjectId]},
    vndbScore:vndb?work.vndbScore:null, vndbVoteCount:vndb?work.vndbVoteCount:null,
    bangumiScore:bangumi?work.bangumiScore:null, bangumiVoteCount:bangumi?work.bangumiVoteCount:null,
    fullWikiRatings:{...work.fullWikiRatings, vndbId:o.vndbId,
      vndb:vndb?ratings.vndb:{rawRating:null,voteCount:null,retrievedAt:null},
      bangumi:bangumi?ratings.bangumi:{subjectId:o.bangumiSubjectId,rawScore:null,voteCount:null,retrievedAt:null}},
    vndbRating:vndb?work.vndbRating:{...createVndbRatingViewModel({vndbId:o.vndbId,ratingStatus:'mapping-not-returned',retrievedAt:null}),detailScore:'对应条目评分待补'},
    bangumiRating:bangumi?work.bangumiRating:{...createBangumiRatingViewModel({ratingStatus:'mapping-not-returned',bangumiSubjectId:o.bangumiSubjectId,retrievedAt:null}),detailScore:'对应条目评分待补'}};
}

// Native subject admission does not regroup a work or copy another edition's
// score. The observation still has to arrive through the pinned rating table.
export function reviewedSourceWork(work) {
  if (!work) return work;
  work = withKnownCompanyName(work);
  const family=CREDIT_SCOPE.familyCorrections?.[String(work.workId)];
  if(family){
    if(family.kind==='compound-release'){
      work={...work,presentationWorkId:family.presentationWorkId,fullWikiPresentationWorkId:family.presentationWorkId,workGroupId:family.presentationWorkId,presentationFamily:null,presentationMemberCount:1,
        sourceIds:{...work.sourceIds,vndb:null,vndbReleases:[family.nativeReleaseId],vndbComponents:family.releaseComponentIds},vndbScore:null,vndbVoteCount:null,
        vndbRating:undefined,fullWikiPresentationThumbnailPath:null,
        fullWikiRatings:{...work.fullWikiRatings,vndbId:null,vndb:{sourceId:null,rawRating:null,voteCount:null,retrievedAt:null}}};
    }else{
    const observed=family.observation;
    if(observed.sourceId!==family.vndbId)throw new TypeError('reviewed primary work observation mismatch');
    const rating=createVndbRatingViewModel({vndbId:family.vndbId,ratingStatus:Number.isFinite(observed.rawRating)?'mapped-rated':'mapped-no-rating',ratingRaw:observed.rawRating,voteCount:observed.voteCount,retrievedAt:observed.retrievedAt});
    work={...work,presentationWorkId:family.presentationWorkId,fullWikiPresentationWorkId:family.presentationWorkId,workGroupId:family.presentationWorkId,
      presentationFamily:work.presentationFamily?.presentationWorkId===family.presentationWorkId?work.presentationFamily:null,
      presentationMemberCount:family.relatedMembers?.length??1,
      sourceIds:{...work.sourceIds,vndb:family.vndbId,vndbReleases:[family.nativeReleaseId]},
      vndbScore:observed.rawRating,vndbVoteCount:observed.voteCount,vndbRating:rating,
      fullWikiPresentationThumbnailPath:null,
      fullWikiRatings:{...work.fullWikiRatings,vndbId:family.vndbId,vndb:{...observed,ratingStatus:rating.status}}};
    }
  }
  const binding=CREDIT_SCOPE.sourceBindingOverrides?.[String(work.workId)];
  if (!binding) return work;
  const ratings=work.fullWikiRatings, subjectId=String(binding.bangumiSubjectId);
  const observed=ratings?.bangumi;
  const matches=String(observed?.sourceId??observed?.subjectId)===subjectId;
  return {...work,
    sourceIds:{...work.sourceIds,bangumiSubjectsExactEgs:[subjectId],vndbReleases:binding.vndbReleaseIds},
    ...(ratings&&!matches?{bangumiScore:null,bangumiVoteCount:null,
      bangumiRating:createBangumiRatingViewModel({ratingStatus:'mapping-not-returned',bangumiSubjectId:subjectId,retrievedAt:null})}:{}),
    ...(ratings?{fullWikiRatings:{...ratings,
      bangumiCandidates:(ratings.bangumiCandidates??[]).filter(r=>String(r.subjectId)===subjectId),
      bangumi:matches?observed:
        {subjectId,rawScore:null,voteCount:null,retrievedAt:null,selectionStatus:'reviewed-native-edition-binding'}}}:{})};
}

export function reviewedRawRatings(id,raw) {
  const family=CREDIT_SCOPE.familyCorrections?.[String(id)];
  if(family?.kind==='compound-release'){const {vndb,...others}=raw??{};return others;}
  if(family)return {...raw,vndb:{...family.observation,ratingStatus:Number.isFinite(family.observation.rawRating)?'mapped-rated':'mapped-no-rating'}};
  const o=CREDIT_SCOPE.editionOverrides?.[String(id)];
  if(!o || !raw)return raw;
  const result={};
  if(raw.vndb?.sourceId===o.vndbId && o.vndbId)result.vndb=raw.vndb;
  if(String(raw.bangumi?.sourceId??raw.bangumi?.subjectId)===String(o.bangumiSubjectId) && o.bangumiSubjectId)result.bangumi=raw.bangumi;
  return Object.keys(result).length?result:null;
}

export function withReviewedObservation(work,raw){
    if(!CREDIT_SCOPE.editionOverrides?.[String(work.workId)]&&!CREDIT_SCOPE.sourceBindingOverrides?.[String(work.workId)])return work;
    const observed=reviewedRawRatings(work.workId,raw);
    return observed?{...work,fullWikiRatings:{...work.fullWikiRatings,...observed}}:work;
}

// Validate the existing score snapshot with its original consumer, then apply
// independently pinned edition decisions to every exposed projection.
export function reviewedSplitWorkCards(source) {
  const reviewRows=async rows=>{
    const raw=rows.some(w=>CREDIT_SCOPE.editionOverrides?.[String(w.workId)]||CREDIT_SCOPE.sourceBindingOverrides?.[String(w.workId)])?await source.queryRawProjection():()=>null;
    return rows.map(work=>reviewedEditionWork(withReviewedObservation(work,raw(work.workId))));
  };
  return Object.freeze({
    get revision(){return source.revision;},
    get usingFallback(){return source.usingFallback;},
    async manifest(){
      const manifest=await source.manifest();
      // Group changes invalidate lists computed from the former work identity,
      // including EGS sorts that deduplicate by the old presentation family.
      return Object.keys(CREDIT_SCOPE.familyCorrections??{}).length
        ?{...manifest,legacyQueriesCompatible:false,reviewedWorkFamilies:true}:manifest;
    },bind:ids=>source.bind(ids),
    pinRevision:revision=>source.pinRevision(revision),
    async queryProjection(){const [project,raw]=await Promise.all([source.queryProjection(),source.queryRawProjection()]);return work=>reviewedEditionWork(withReviewedObservation(project(work),raw(work.workId)));},
    async queryRawProjection(){const project=await source.queryRawProjection();return id=>reviewedRawRatings(id,project(id));},
    prepareRatings:ids=>source.prepareRatings?.(ids),
    async projectRows(rows,options){return reviewRows(await source.projectRows(rows,options));},
    async getSummaries(...args){return reviewRows(await (source.getSummaries??source.get).apply(source,args));},
    async get(...args){return reviewRows(await source.get(...args));},
    prune:()=>source.prune(),stats:()=>source.stats()
  });
}
