// The fallback is the existing grid contract; list widths match mobile-library.css.
export function selectionCardImageSizes(image,gridSizes=image.dataset?.workGridSizes){
 if(!gridSizes)return null;
 const list=image.ownerDocument?.documentElement?.dataset.workCardLayout==='list';
 return list?`${image.loading==='lazy'?'auto, ':''}(max-width: 899px) 68px, 80px`:gridSizes;
}
export function syncSelectionCardImageSizes(root=document){
 for(const image of root.querySelectorAll('.selection-card-cover img[data-work-grid-sizes]')){
  const sizes=selectionCardImageSizes(image);if(image.sizes!==sizes)image.sizes=sizes;
 }
}
