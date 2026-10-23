import {bindImageSafety} from '../../image-safety.js';

// These templates deliberately contain no src/srcset. Resolve safety before
// loading honors, profile and cross-company exploration covers.
const mounted = new WeakSet();
function mount(root) {
  const images = root.matches?.('img[data-company-safety-url]') ? [root] : [];
  images.push(...root.querySelectorAll?.('img[data-company-safety-url]') ?? []);
  for (const image of images) {
    if (mounted.has(image)) continue;
    mounted.add(image);
    // Profile cover wrappers used to hide decorative covers from AT. The new
    // reveal control must remain reachable by keyboard and screen readers.
    image.parentElement?.removeAttribute('aria-hidden');
    bindImageSafety(image, {
      urls: [image.dataset.companySafetyUrl],
      show: ([url]) => { image.src = url; }
    });
  }
}
mount(document);
new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) mount(node);
  }
}).observe(document.documentElement, {childList: true, subtree: true});
