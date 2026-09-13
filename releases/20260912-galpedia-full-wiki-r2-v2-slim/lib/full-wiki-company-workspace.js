import { getStaticCompanyClient } from './company-static-client.js';

// The static publication variant uses the same complete pinned directory and
// relation sets as its main workbench.
export function loadFullWikiCompanyWorkspace() {
  return getStaticCompanyClient().loadWorkspace();
}
