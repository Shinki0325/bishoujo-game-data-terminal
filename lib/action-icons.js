const RAW_ICONS = Object.freeze({
  sticker: [
    ['path', { d: 'M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z' }],
    ['path', { d: 'M15 3v5a1 1 0 0 0 1 1h5' }],
    ['path', { d: 'M8 13h.01' }],
    ['path', { d: 'M16 13h.01' }],
    ['path', { d: 'M10 16s.8 1 2 1c1.3 0 2-1 2-1' }]
  ],
  'image-up': [
    ['path', { d: 'M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21' }],
    ['path', { d: 'm14 19.5 3-3 3 3' }],
    ['path', { d: 'M17 22v-5.5' }],
    ['circle', { cx: '9', cy: '9', r: '2' }]
  ],
  ellipsis: [
    ['circle', { cx: '12', cy: '12', r: '1' }],
    ['circle', { cx: '19', cy: '12', r: '1' }],
    ['circle', { cx: '5', cy: '12', r: '1' }]
  ],
  'rotate-ccw': [
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }]
  ],
  'undo-2': [
    ['path', { d: 'M9 14 4 9l5-5' }],
    ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }]
  ],
  'redo-2': [
    ['path', { d: 'm15 14 5-5-5-5' }],
    ['path', { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13' }]
  ],
  'layers-2': [
    ['path', { d: 'M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z' }],
    ['path', { d: 'm20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845' }]
  ],
  'arrow-down': [
    ['path', { d: 'M12 5v14' }],
    ['path', { d: 'm19 12-7 7-7-7' }]
  ],
  'arrow-up': [
    ['path', { d: 'm5 12 7-7 7 7' }],
    ['path', { d: 'M12 19V5' }]
  ],
  'trash-2': [
    ['path', { d: 'M10 11v6' }],
    ['path', { d: 'M14 11v6' }],
    ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }]
  ],
  save: [
    ['path', { d: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' }],
    ['path', { d: 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7' }],
    ['path', { d: 'M7 3v4a1 1 0 0 0 1 1h7' }]
  ],
  x: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }]
  ],
  filter: [
    ['path', { d: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z' }]
  ],
  sun: [
    ['circle', { cx: '12', cy: '12', r: '4' }],
    ['path', { d: 'M12 2v2' }],
    ['path', { d: 'M12 20v2' }],
    ['path', { d: 'm4.93 4.93 1.41 1.41' }],
    ['path', { d: 'm17.66 17.66 1.41 1.41' }],
    ['path', { d: 'M2 12h2' }],
    ['path', { d: 'M20 12h2' }],
    ['path', { d: 'm6.34 17.66-1.41 1.41' }],
    ['path', { d: 'm19.07 4.93-1.41 1.41' }]
  ],
  moon: [
    ['path', { d: 'M20.8 15.6A9 9 0 0 1 8.4 3.2A9 9 0 1 0 20.8 15.6z' }]
  ],
  'arrow-down-a-z': [
    ['path', { d: 'm3 16 4 4 4-4' }],
    ['path', { d: 'M7 20V4' }],
    ['path', { d: 'M15 4h5' }],
    ['path', { d: 'M15 8h3' }],
    ['path', { d: 'M15 12h1' }]
  ],
  'arrow-up-a-z': [
    ['path', { d: 'm3 8 4-4 4 4' }],
    ['path', { d: 'M7 4v16' }],
    ['path', { d: 'M15 4h5' }],
    ['path', { d: 'M15 8h3' }],
    ['path', { d: 'M15 12h1' }]
  ]
});

const ICONS = Object.freeze(Object.fromEntries(
  Object.entries(RAW_ICONS).map(([name, nodes]) => [
    name,
    Object.freeze(nodes.map(([tag, attributes]) => Object.freeze([
      tag,
      Object.freeze({ ...attributes })
    ])))
  ])
));

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const ACTION_ICON_NAMES = Object.freeze([
  'sticker', 'image-up', 'ellipsis', 'rotate-ccw', 'undo-2', 'redo-2',
  'layers-2', 'arrow-down', 'arrow-up', 'trash-2', 'save', 'x',
  'filter', 'sun', 'moon', 'arrow-down-a-z', 'arrow-up-a-z'
]);

export function createActionIcon(documentRef, name) {
  if (typeof documentRef?.createElementNS !== 'function') {
    throw new TypeError('documentRef must provide createElementNS');
  }
  const definition = ICONS[name];
  if (!definition) throw new TypeError(`Unknown action icon: ${name}`);
  const svg = documentRef.createElementNS(SVG_NAMESPACE, 'svg');
  for (const [attribute, value] of Object.entries({
    width: '24',
    height: '24',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    focusable: 'false',
    'aria-hidden': 'true'
  })) svg.setAttribute(attribute, value);
  for (const [tag, attributes] of definition) {
    const child = documentRef.createElementNS(SVG_NAMESPACE, tag);
    for (const [attribute, value] of Object.entries(attributes)) child.setAttribute(attribute, value);
    svg.append(child);
  }
  return svg;
}
