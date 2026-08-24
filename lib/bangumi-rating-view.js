const NO_RATING_COPY = '暂无评分';

function formatScore(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function createBangumiRatingViewModel(rating = null) {
  if (rating === null || rating === undefined) return null;
  const rated = rating.ratingStatus === 'mapped-rated';
  return Object.freeze({
    detailScore: rated ? formatScore(rating.score) : NO_RATING_COPY,
    detailVotes: rated ? `${rating.voteCount} 人评分` : null,
    retrievedAt: rating.retrievedAt,
    status: rating.ratingStatus,
    subjectId: rating.bangumiSubjectId,
    subjectUrl: `https://bgm.tv/subject/${rating.bangumiSubjectId}`
  });
}

export function projectWorkWithBangumiRating(work, ratingByWorkId = null) {
  if (ratingByWorkId === null || ratingByWorkId === undefined) return work;
  const rating = ratingByWorkId.get(work.workId) ?? null;
  return rating === null ? work : { ...work, bangumiRating: createBangumiRatingViewModel(rating) };
}
