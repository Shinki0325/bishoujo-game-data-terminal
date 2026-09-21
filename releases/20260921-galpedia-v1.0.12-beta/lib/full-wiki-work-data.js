import {createVndbRatingViewModel} from './vndb-rating-view.js';
import {approvedPublicMediaPath} from './asset-url.js';
import {createBangumiRatingViewModel} from './bangumi-rating-view.js';
// Display media follows the edition in details and the confirmed family in lists.
export function withFullWikiWorkMedia(workData, media, {localPreview = false, presentationIdForWork = null} = {}) {
  const cache = new Map();
  const apply = async (works, presentation) => {
    works=works.map(work=>{
      const ratings=work.fullWikiRatings;if(!ratings)return work;
      const v=ratings.vndb,b=ratings.bangumi;
      return {...work,...(ratings.vndbId?{vndbRating:createVndbRatingViewModel({ratingStatus:Number.isFinite(v.rawRating)?'mapped-rated':'mapped-no-rating',ratingRaw:v.rawRating,voteCount:v.voteCount,retrievedAt:v.retrievedAt})}:{}),
        ...(b.subjectId?{bangumiRating:createBangumiRatingViewModel({ratingStatus:Number.isFinite(b.rawScore)?'mapped-rated':'mapped-no-rating',score:b.rawScore,voteCount:b.voteCount,bangumiSubjectId:b.subjectId,retrievedAt:b.retrievedAt??null})}:{}),
        egsSnapshotAt:ratings.egsRetrievedAt};
    });
    if (localPreview) return media.projectWorks(works, {presentation});
    return works.map(work => {
      const row = presentation ? work.fullWikiPresentationMedia : work.fullWikiEditionMedia;
      if (!row) return work;
      const path = descriptor => descriptor ? (descriptor.publicUrl ? approvedPublicMediaPath(descriptor.publicUrl, descriptor) : `data/terminal-wiki-media-v1/${descriptor.path}`) : null;
      return {...work, projectedThumbnailPath:path(row.thumbnail), projectedPreviewPath:path(row.preview),
        coverPath:path(row.thumbnail)??'assets/cover-unavailable.webp', thumbnailPath:path(row.thumbnail)??'assets/cover-unavailable.webp', previewPath:path(row.preview),
        coverWidth:row.thumbnail?.width ?? null, coverHeight:row.thumbnail?.height ?? null,
        previewWidth:row.preview?.width ?? null, previewHeight:row.preview?.height ?? null};
    });
  };
  return Object.freeze({
    ...workData,
    async get(ids) {
      const original = await workData.get(ids);
      const rows = await apply([...original.values()], false);
      for (const row of rows) cache.set(row.workId, row);
      while (cache.size > 500) cache.delete(cache.keys().next().value);
      return new Map(rows.map(row => [row.workId, row]));
    },
    // Result pages need the confirmed presentation-family image. Keep this
    // separate from get(), whose edition projection is required by selected
    // work, ranking, comparison, and detail callers.
    async getList(ids) {
      const source = workData.get(ids);
      // The validated UI summary already knows each edition's family. Start
      // that independent read while the complete card rows are in flight.
      // Only warm media's own cache: the original rows below still decide
      // presentation precedence, missing-family fallback and all ratings.
      const families = localPreview && typeof presentationIdForWork === 'function'
        ? [...new Set(ids.map(presentationIdForWork).filter(id => typeof id === 'string' && id))] : [];
      const warm = families.length && typeof media.getMany === 'function'
        ? media.getMany('presentations', families).catch(() => {}) : Promise.resolve();
      const [original] = await Promise.all([source, warm]);
      return apply([...original.values()], true).then(rows => new Map(rows.map(row => [row.workId, row])));
    },
    peek(id) { return cache.get(id) ?? workData.peek(id); },
    async hydrate(items) { return apply(await workData.hydrate(items), true); }
  });
}
