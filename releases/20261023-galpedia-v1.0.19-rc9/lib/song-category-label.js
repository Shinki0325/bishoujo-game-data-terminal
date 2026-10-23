const SONG_CATEGORY_LABELS = Object.freeze({
  '挿入歌': '插入歌',
  'キャラソン': '角色歌',
  'イメージソング': '印象曲',
  IM: '印象曲'
});

export function songCategoryLabel(value) {
  const category = String(value ?? '').trim();
  if (SONG_CATEGORY_LABELS[category]) return SONG_CATEGORY_LABELS[category];
  return category
    .replace(/\s*(?:イメージソング|image[\s-]*song)$/iu, '印象曲')
    .replace(/アレンジ/g, ' arrange')
    .replace(/リミックス|ミックス/g, ' remix')
    .replace(/カバー/g, ' cover')
    .trim();
}
