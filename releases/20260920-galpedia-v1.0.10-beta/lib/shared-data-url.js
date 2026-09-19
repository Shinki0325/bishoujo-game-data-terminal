import { SHARED_DATA } from './shared-data-config.js';

// 仅实际发布目录采用已固定的共享家族；源码预览仍读取自身资料。
// 这是请求发出前的地址解析，不增加重定向、清单请求或失败重试。
export function createSharedDataURLResolver({config = SHARED_DATA, moduleUrl = import.meta.url} = {}) {
  if (config?.schema !== 'galpedia-static-shared-layout-v1'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(config.releaseId)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(config.sourceReleaseId)
    || config.releaseId === config.sourceReleaseId
    || !/^[a-f0-9]{64}$/u.test(config.sourceManifestSha256)
    || !Array.isArray(config.prefixes) || !config.prefixes.length
    || config.prefixes.some(p => !/^(?:data|static-site-data-v1|runtime-data\/[A-Za-z0-9-]+)\/$/u.test(p))) {
    throw new TypeError('共享资料配置无效');
  }
  const prefixes = [...config.prefixes], base = new URL('../', moduleUrl);
  const active = base.pathname.endsWith(`/releases/${config.releaseId}/`);
  const shared = new URL(`../${config.sourceReleaseId}/`, base);
  return input => {
    if (!active || !(typeof input === 'string' || input instanceof URL)) return input;
    let url;
    try { url = new URL(String(input), moduleUrl); } catch { return input; }
    if (url.origin !== base.origin || url.username || url.password || !url.pathname.startsWith(base.pathname)
      || /%(?:2f|5c|00)/iu.test(url.pathname)) return input;
    const relative = url.pathname.slice(base.pathname.length);
    if (!prefixes.some(prefix => relative.startsWith(prefix))) return input;
    url.pathname = shared.pathname + relative;
    return url;
  };
}

export const resolveSharedDataURL = createSharedDataURLResolver();
