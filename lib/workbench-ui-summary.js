import {buildCompanyDirectory,serializeCompanySummary} from './company-directory.js';

export function createWorkbenchUISummary(data) {
  const workIds=[],workGroupByEditionWorkId={},releaseYearCounts={};
  for(const work of data.ratedDisplayWorks) {
    workIds.push(work.workId);
    workGroupByEditionWorkId[work.workId]=work.workGroupId||work.workId;
    const year=Number(work.releaseDate.slice(0,4));
    releaseYearCounts[year]=(releaseYearCounts[year]??0)+1;
  }
  const directory=buildCompanyDirectory({brands:data.brands,works:data.ratedDisplayWorks,
    companyAliasesById:data.enrichment?.companyAliasesById,companyPinyinById:data.enrichment?.companyPinyinById,
    avatarByCompanyId:data.companyProfile?.avatarByCompanyId,includeWorks:false});
  return {schema:'galpedia-workbench-ui-summary-v1',workIds,workGroupByEditionWorkId,releaseYearCounts,
    companies:serializeCompanySummary(directory)};
}

export function validateWorkbenchUISummary(summary, count) {
  if (summary?.schema !== 'galpedia-workbench-ui-summary-v1'
      || !Array.isArray(summary.workIds) || summary.workIds.length !== count
      || summary.workIds.some(id => typeof id !== 'string' || !id)
      || new Set(summary.workIds).size !== count
      || !summary.workGroupByEditionWorkId || !summary.releaseYearCounts
      || Object.keys(summary.workGroupByEditionWorkId).length !== count
      || summary.workIds.some(id => typeof summary.workGroupByEditionWorkId[id] !== 'string' || !summary.workGroupByEditionWorkId[id])
      || !Array.isArray(summary.companies)) throw new TypeError('查询线程启动摘要不兼容');
  const counts = Object.values(summary.releaseYearCounts);
  if (counts.some(n => !Number.isSafeInteger(n) || n < 0)
      || counts.reduce((sum, n) => sum + n, 0) !== count) throw new TypeError('查询线程年份摘要不兼容');
  return summary;
}
