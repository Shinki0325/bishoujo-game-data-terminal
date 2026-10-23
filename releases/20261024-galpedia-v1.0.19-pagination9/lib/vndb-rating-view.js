const STATUS_COPY = Object.freeze({
  'mapped-rated': '已匹配且有评分',
  'unobserved': '评分待补',
  'mapped-no-rating': '已匹配但暂无评分',
  'mapping-not-returned': '条目未返回',
  unmapped: '未建立匹配'
});
const NO_RATING_COPY = '暂无评分';

// Kana rating values use 10–100; only public text uses the familiar 1–10 scale.
export function formatVndbScore(value) {
  return (value / 10).toFixed(2);
}

export function createVndbRatingViewModel(rating = null) {
  if (rating === null || rating === undefined) return null;
  const statusLabel = STATUS_COPY[rating.ratingStatus];
  if (statusLabel === undefined) throw new TypeError('VNDB rating status is unsupported');
  const rated = rating.ratingStatus === 'mapped-rated';
  return Object.freeze({
    subjectId: /^v[1-9][0-9]*$/u.test(rating.vndbId ?? '') ? rating.vndbId : null,
    subjectUrl: /^v[1-9][0-9]*$/u.test(rating.vndbId ?? '') ? 'https://vndb.org/' + rating.vndbId : null,
    status: rating.ratingStatus,
    statusLabel,
    cardText: rated ? `VNDB ${formatVndbScore(rating.ratingRaw)}` : `VNDB ${rating.ratingStatus === 'unobserved' ? '评分待补' : NO_RATING_COPY}`,
    detailScore: rated ? formatVndbScore(rating.ratingRaw) : rating.ratingStatus === 'unobserved' ? '评分待补' : NO_RATING_COPY,
    detailVotes: rated ? `${rating.voteCount} 人评分` : null,
    sortScore: rated ? rating.ratingRaw : null,
    sortVoteCount: rated ? rating.voteCount : null,
    retrievedAt: rated || rating.ratingStatus === 'mapped-no-rating' ? rating.retrievedAt : null
  });
}

export function projectWorkWithVndbRating(work, ratingByWorkId = null) {
  if (ratingByWorkId === null || ratingByWorkId === undefined) return work;
  const rating = ratingByWorkId.get(work.workId) ?? null;
  return rating === null ? work : { ...work, vndbRating: createVndbRatingViewModel(rating) };
}
