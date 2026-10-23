// Shared identity/shape validation for inline and deferred search carriers.
export function snapshotSearchText(searchText, workIds) {
  if (!['query-search-text-v1','query-search-text-v2'].includes(searchText?.schema)
    || !Array.isArray(searchText.workIds) || searchText.workIds.length !== workIds.length
    || searchText.workIds.some((id,i)=>id!==workIds[i])) throw new TypeError('search text identity mismatch');
  if (searchText.schema === 'query-search-text-v2') {
    if (!Array.isArray(searchText.rows) || searchText.rows.length !== workIds.length
      || searchText.rows.some(row=>!Array.isArray(row)||row.length!==3||row.some(value=>typeof value!=='string'))) throw new TypeError('search text format mismatch');
    return [0,1,2].map(i=>Object.freeze(searchText.rows.map(row=>row[i])));
  }
  return ['normalizedTitles','normalizedLooseTitles','pinyinTitles'].map(key=>{
    if (!Array.isArray(searchText[key]) || searchText[key].length !== workIds.length
      || searchText[key].some(value=>typeof value!=='string')) throw new TypeError('search text format mismatch');
    return Object.freeze(searchText[key].slice());
  });
}
