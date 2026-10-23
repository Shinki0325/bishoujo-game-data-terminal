import { STATIC_DETAIL_INDEX } from './static-detail-index-config.js';
import { CREDIT_SCOPE } from './credit-scope-config.js';
import { VERSION_SCOPE } from './version-scope-config.js';
import { PERSON_STATIC_DETAIL } from './person-static-detail-config.js';
import { PERSON_DETAIL_SHARDS } from './person-detail-shards-config.js';
import { PERSON_SUMMARY_SHARDS } from './person-summary-shards-config.js';
import { SONG_COLLABORATIONS } from './song-collaboration-config.js';
import { WORK_FULL_CARDS } from './work-full-cards-config.js';
import { PRESENTATION_FAMILIES_SIDECAR_SHA256 } from './runtime-config.js';
// These are the current authoritative input descriptors, not the derived head.
// A missed update invalidates the shortcut and keeps the complete legacy path.
export async function personSectionSourceKey(cryptoRef=globalThis.crypto){
  const bytes=new TextEncoder().encode(JSON.stringify([4,STATIC_DETAIL_INDEX,CREDIT_SCOPE,VERSION_SCOPE,PERSON_STATIC_DETAIL,PERSON_DETAIL_SHARDS,PERSON_SUMMARY_SHARDS,SONG_COLLABORATIONS,WORK_FULL_CARDS,PRESENTATION_FAMILIES_SIDECAR_SHA256]));
  return Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
