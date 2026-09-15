// Preserve explicit editions; family-only credits open their current default.
export function resolveCompanyWorkIds(index, canonicalId, defaults) {
  const ids=new Set(index.workRelations[canonicalId]??[]);
  for(const pid of index.presentationRelations[canonicalId]??[]) {
    const id=defaults.get(pid);
    if(!id)throw new TypeError('Company presentation reference is missing');
    ids.add(String(id));
  }
  return [...ids];
}
