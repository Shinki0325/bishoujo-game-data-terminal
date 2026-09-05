function normalizedName(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim();
}

export function personNameVariantLabels(person) {
  const structured = Array.isArray(person?.nameVariants)
    ? person.nameVariants.map(item => normalizedName(item?.name)).filter(Boolean)
    : [];
  const candidates = structured.length > 0
    ? structured
    : (Array.isArray(person?.aliases) ? person.aliases.map(normalizedName).filter(Boolean) : []);
  return [...new Set(candidates)];
}

export function personNameVariantCount(person) {
  const labels = personNameVariantLabels(person);
  if (labels.length > 0) return labels.length;
  return Number.isSafeInteger(person?.nameVariantCount) ? person.nameVariantCount : 0;
}
