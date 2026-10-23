function normalizedName(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim() : '';
}

function displayNameKey(value) {
  return normalizedName(value).replace(/([\u3040-\u30ff\u3400-\u9fff])\s+(?=[\u3040-\u30ff\u3400-\u9fff])/gu, '$1');
}

export function personNameVariantLabels(person) {
  const structured = Array.isArray(person?.nameVariants)
    ? person.nameVariants.map(item => normalizedName(item?.name)).filter(Boolean) : [];
  const candidates = structured.length > 0 ? structured
    : (Array.isArray(person?.aliases) ? person.aliases.map(normalizedName).filter(Boolean) : []);
  const seen = new Set();
  return candidates.filter(name => {
    const key = displayNameKey(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function personNameVariantCount(person) {
  const labels = personNameVariantLabels(person);
  if (labels.length > 0) return labels.length;
  return Number.isSafeInteger(person?.nameVariantCount) ? person.nameVariantCount : 0;
}

export function personDisplayNameVariantLabels(person) {
  const hidden = new Set((person?.hiddenNameVariants ?? []).map(displayNameKey));
  return personNameVariantLabels(person).filter(name => !hidden.has(displayNameKey(name)));
}

export function personDisplayNameVariantCount(person) {
  return personNameVariantLabels(person).length ? personDisplayNameVariantLabels(person).length : personNameVariantCount(person);
}

// Reviewed display context only; do not rewrite an identity or original credit name.
const REVIEWED_ROLE_NAMES = Object.freeze({
  per_fw9674be6e0c1afb72d47b8026: Object.freeze({vocalist:'Riryka', vocal:'Riryka', music:'Riryka', composition:'Riryka', lyrics:'Riryka', arrangement:'Riryka'})
});
export function personDisplayNameForRole(person, role = 'all') {
  const selected = !role || role === 'all' ? person?.primaryRole : role;
  const preferred = REVIEWED_ROLE_NAMES[person?.entityId]?.[selected];
  const known = personNameVariantLabels(person);
  if (preferred && (known.includes(preferred) || person?.canonicalName === preferred || person?.name === preferred)) return preferred;
  return person?.displayName || person?.canonicalName || person?.name || '未命名人物';
}
