// Use the same validated families as the work library; group only filtered records.
export function groupCompanyWorks(works, familyForWork) {
  const groups = new Map();
  for (const work of works) {
    const family = familyForWork(work.workId);
    const key = family?.presentationWorkId ?? `work:${work.workId}`;
    if (!groups.has(key)) groups.set(key, { key, family, works: [] });
    groups.get(key).works.push(work);
  }
  // First matching version follows the user's sort, including at group level.
  return [...groups.values()];
}
