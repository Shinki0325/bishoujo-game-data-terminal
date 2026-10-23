const styles = [
  ['company-roles-v30-style', new URL('./company-ui/__company_v30/roles.css', import.meta.url).href],
  ['company-scope-style', new URL('./company-ui/__company_v35/scope.css', import.meta.url).href],
  ['player-profile-css', new URL('./company-ui/__player_v43/player.css', import.meta.url).href],
  ['company-families-style', new URL('./company-ui/__company_v33/families.css', import.meta.url).href],
  ['company-profile-style', new URL('./company-ui/__company_v20/profile.css', import.meta.url).href],
  ['company-card-v20-style', new URL('./company-ui/__company_v20/card.css', import.meta.url).href],
  ['company-work-honors-style', new URL('./company-ui/__company_v20/honors.css', import.meta.url).href]
];
const attempts = new WeakMap();

function load(documentRef, id, href) {
  let link = documentRef.getElementById(id);
  if (link?.sheet) return Promise.resolve(true);
  if (link && attempts.has(link)) return attempts.get(link);
  if (link?.dataset.profileStyle === 'error') { link.remove(); link = null; }
  const fresh = !link;
  if (fresh) {
    link = documentRef.createElement('link');
    link.id = id; link.rel = 'stylesheet'; link.href = href;
    if (id === 'company-families-style') link.dataset.companyFamilies = 'true';
  }
  const promise = new Promise(resolve => {
    let done = false;
    const finish = ok => {
      if (done) return; done = true;
      clearTimeout(timer); link.removeEventListener('load', loaded); link.removeEventListener('error', failed);
      link.dataset.profileStyle = ok ? 'ready' : 'error'; attempts.delete(link); resolve(ok);
    };
    const loaded = () => finish(true), failed = () => finish(false);
    const timer = setTimeout(failed, 12000); timer.unref?.();
    link.addEventListener('load', loaded, {once:true});
    link.addEventListener('error', failed, {once:true});
    if (fresh) documentRef.head.append(link);
  });
  attempts.set(link, promise);
  return promise;
}

export async function prepareCompanyProfileStyles(documentRef) {
  return (await Promise.all(styles.map(([id, href]) => load(documentRef, id, href)))).every(Boolean);
}
