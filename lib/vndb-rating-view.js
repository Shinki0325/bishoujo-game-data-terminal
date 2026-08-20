const STATUS_COPY = Object.freeze({
  'mapped-rated': '已匹配且有评分',
  'mapped-no-rating': '已匹配但暂无评分',
  'mapping-not-returned': '条目未返回',
  unmapped: '未建立匹配'
});

function formatScore(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function createVndbRatingViewModel(rating = null) {
  if (rating === null || rating === undefined) return null;
  const statusLabel = STATUS_COPY[rating.ratingStatus];
  if (statusLabel === undefined) throw new TypeError('VNDB rating status is unsupported');
  const rated = rating.ratingStatus === 'mapped-rated';
  return Object.freeze({
    status: rating.ratingStatus,
    statusLabel,
    cardText: rated ? `VNDB ${formatScore(rating.ratingRaw)}` : `VNDB ${statusLabel}`,
    detailScore: rated ? formatScore(rating.ratingRaw) : statusLabel,
    detailVotes: rated ? `${rating.voteCount} 人评分` : null,
    retrievedAt: rated || rating.ratingStatus === 'mapped-no-rating' ? rating.retrievedAt : null
  });
}

export function projectWorkWithVndbRating(work, ratingByWorkId = null) {
  if (ratingByWorkId === null || ratingByWorkId === undefined) return work;
  const rating = ratingByWorkId.get(work.workId) ?? null;
  return rating === null ? work : { ...work, vndbRating: createVndbRatingViewModel(rating) };
}
