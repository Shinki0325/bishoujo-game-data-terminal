import { yieldMainThread } from './yield-main-thread.js';
const COLUMNS = ['canonicalEntityId','name','displayName','aliases','nameVariants','sourceIds','roleCodes','workCount','totalCredits','roles','primaryRole','firstYear','lastYear','entityId','hiddenNameVariants'];
const SHA = /^[a-f0-9]{64}$/u;

export function personDirectoryTransportRequest(config, baseUrl) {
  const compact = config.transport;
  if (!compact) return {url:new URL(config.url,baseUrl),sha256:config.sha256,bytes:config.bytes,compact:false};
  if (compact.schema !== 'terminal-wiki-person-transport-v1'
    || !/^\.\.\/runtime-data\/person-directory-transport-v1\/person-directory\.[a-f0-9]{16}\.json$/u.test(compact.url ?? '')
    || !SHA.test(compact.sha256 ?? '') || !Number.isSafeInteger(compact.bytes) || compact.bytes < 1
    || compact.sourceIndexSha256 !== config.sha256) throw new TypeError('人物紧凑传输配置或来源绑定无效');
  return {url:new URL(compact.url,baseUrl),sha256:compact.sha256,bytes:compact.bytes,compact:true};
}

export function decodePersonDirectoryTransport(body, config) {
  if (body?.schema !== 'terminal-wiki-person-transport-v1' || body.sourceIndexSha256 !== config.sha256
    || JSON.stringify(body.columns) !== JSON.stringify(COLUMNS) || !Array.isArray(body.rows)
    || body.header?.schemaVersion !== config.schemaVersion
    || body.header.directoryManifestSha256 !== config.directoryManifestSha256
    || body.header.sourceManifestSha256 !== config.sourceManifestSha256
    || body.header.counts?.persons !== body.rows.length) throw new TypeError('人物紧凑传输格式或来源版本无效');
  const rows = new Array(body.rows.length), workIdsByCanonical = {}, searchKeysByCanonical = {};
  for (let i = 0; i < rows.length; i++) {
    const r = body.rows[i];
    if (!Array.isArray(r) || r.length !== 17 || typeof r[0] !== 'string' || !r[0]
      || Object.hasOwn(workIdsByCanonical,r[0]) || !Array.isArray(r[15]) || !Array.isArray(r[16]) || r[16].length !== 2
      || ['__proto__','constructor','prototype'].includes(r[0])) throw new TypeError('人物紧凑传输记录无效');
    rows[i] = {canonicalEntityId:r[0],name:r[1],displayName:r[2],aliases:r[3],nameVariants:r[4],sourceIds:r[5],roleCodes:r[6],workCount:r[7],totalCredits:r[8],roles:r[9],primaryRole:r[10],firstYear:r[11],lastYear:r[12],entityId:r[13],hiddenNameVariants:r[14]};
    workIdsByCanonical[r[0]] = r[15]; searchKeysByCanonical[r[0]] = r[16];
  }
  return {...body.header,rows,workIdsByCanonical,searchKeysByCanonical};
}

// Keep the synchronous decoder for existing callers.  Directory bootstrap can
// opt into this cooperative variant so the 53,075-row validation/materializing
// loop does not become one long task after JSON.parse has completed.
const yieldCodecTask = yieldMainThread;

export async function decodePersonDirectoryTransportAsync(body, config, {yieldEvery = 512} = {}) {
  if (body?.schema !== 'terminal-wiki-person-transport-v1' || body.sourceIndexSha256 !== config.sha256
    || JSON.stringify(body.columns) !== JSON.stringify(COLUMNS) || !Array.isArray(body.rows)
    || body.header?.schemaVersion !== config.schemaVersion
    || body.header.directoryManifestSha256 !== config.directoryManifestSha256
    || body.header.sourceManifestSha256 !== config.sourceManifestSha256
    || body.header.counts?.persons !== body.rows.length) throw new TypeError('人物紧凑传输格式或来源版本无效');
  const rows = new Array(body.rows.length), workIdsByCanonical = {}, searchKeysByCanonical = {};
  for (let i = 0; i < rows.length; i += 1) {
    const r = body.rows[i];
    if (!Array.isArray(r) || r.length !== 17 || typeof r[0] !== 'string' || !r[0]
      || Object.hasOwn(workIdsByCanonical,r[0]) || !Array.isArray(r[15]) || !Array.isArray(r[16]) || r[16].length !== 2
      || ['__proto__','constructor','prototype'].includes(r[0])) throw new TypeError('人物紧凑传输记录无效');
    rows[i] = {canonicalEntityId:r[0],name:r[1],displayName:r[2],aliases:r[3],nameVariants:r[4],sourceIds:r[5],roleCodes:r[6],workCount:r[7],totalCredits:r[8],roles:r[9],primaryRole:r[10],firstYear:r[11],lastYear:r[12],entityId:r[13],hiddenNameVariants:r[14]};
    workIdsByCanonical[r[0]] = r[15]; searchKeysByCanonical[r[0]] = r[16];
    if ((i + 1) % Math.max(1, yieldEvery) === 0) await yieldCodecTask();
  }
  return {...body.header,rows,workIdsByCanonical,searchKeysByCanonical};
}
