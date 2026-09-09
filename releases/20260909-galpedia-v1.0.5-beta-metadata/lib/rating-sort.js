function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function createWeightedRatingSort({ ratings, scoreField }) {
  if (!(ratings instanceof Map)) throw new TypeError('ratings must be a Map');
  if (typeof scoreField !== 'string' || scoreField.length === 0) {
    throw new TypeError('scoreField must be a non-empty string');
  }
  const observed = [...ratings.values()].filter(rating => (
    rating?.ratingStatus === 'mapped-rated'
    && finiteNonNegative(rating[scoreField])
    && Number.isInteger(rating.voteCount)
    && rating.voteCount >= 0
  ));
  if (observed.length === 0) return null;
  const sourceMean = observed.reduce((sum, rating) => sum + rating[scoreField], 0) / observed.length;
  const priorVotes = median(observed.map(rating => rating.voteCount));
  return Object.freeze({
    sourceMean,
    priorVotes,
    score(score, voteCount) {
      if (!finiteNonNegative(score) || !Number.isInteger(voteCount) || voteCount < 0) return null;
      return ((voteCount / (voteCount + priorVotes)) * score)
        + ((priorVotes / (voteCount + priorVotes)) * sourceMean);
    }
  });
}
