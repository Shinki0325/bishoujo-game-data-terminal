import {
  MAX_TIERS,
  MIN_TIERS,
  TIER_NAME_MAX_LENGTH,
  appendTier,
  applyTierConfig,
  moveTier,
  normalizeTiers,
  removeTier
} from '../lib/tier-config.js';
import { TIER_COLOR_IDS, tierColor } from '../lib/tier-palette.js';

const NAME_ERROR_PATH = /^tiers\[(\d+)\]\.name$/u;

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function requiredElement(root, id) {
  const node = root.querySelector?.(`#${id}`);
  if (!node) throw new Error(`Tier manager root is missing #${id}`);
  return node;
}

function setButtonLabel(button, label) {
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}

function cloneTier(tier) {
  return { id: tier.id, name: tier.name, colorId: tier.colorId };
}

function isValidDraftName(name) {
  if (typeof name !== 'string') return false;
  const length = [...name.trim()].length;
  return length >= 1 && length <= TIER_NAME_MAX_LENGTH;
}

export function createTierManagerView({ root, onSave, confirmDelete, randomUUID }) {
  if (root === null || typeof root?.querySelector !== 'function') {
    throw new TypeError('root must provide querySelector');
  }
  const documentRef = root.ownerDocument;
  if (documentRef === null || typeof documentRef?.createElement !== 'function') {
    throw new TypeError('root must provide ownerDocument.createElement');
  }
  assertFunction(onSave, 'onSave');
  assertFunction(confirmDelete, 'confirmDelete');
  assertFunction(randomUUID, 'randomUUID');

  const elements = {
    rows: requiredElement(root, 'tier-manager-rows'),
    duplicateWarning: requiredElement(root, 'tier-duplicate-warning'),
    add: requiredElement(root, 'add-tier'),
    cancel: requiredElement(root, 'cancel-tier-manager'),
    save: requiredElement(root, 'save-tier-manager')
  };

  let draftTiers = null;
  let draftTierOrder = null;
  let saving = false;

  function isOpen() {
    return draftTiers !== null && root.open !== false;
  }

  function updateDuplicateWarning() {
    if (draftTiers === null) return;
    const names = new Map();
    for (const tier of draftTiers) {
      const name = tier.name.trim();
      if (name.length === 0) continue;
      names.set(name, (names.get(name) ?? 0) + 1);
    }
    const duplicates = [...names.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
    elements.duplicateWarning.hidden = duplicates.length === 0;
    elements.duplicateWarning.textContent = duplicates.length === 0
      ? ''
      : `存在同名等级：${duplicates.join('、')}`;
  }

  function structuralTiers() {
    return draftTiers.map(tier => ({
      ...tier,
      name: isValidDraftName(tier.name) ? tier.name : '临时等级'
    }));
  }

  function createIconButton(className, icon, label, disabled, onClick) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = icon;
    button.disabled = disabled;
    setButtonLabel(button, label);
    button.addEventListener('click', onClick);
    return button;
  }

  function setSelectedSwatch(swatches, colorId) {
    for (const swatch of swatches) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.colorId === colorId));
    }
  }

  function createRow(tier, index, rowControls) {
    const row = documentRef.createElement('div');
    row.className = 'tier-manager-row';
    row.dataset.tierId = tier.id;

    const palette = documentRef.createElement('div');
    palette.className = 'tier-color-palette';
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', `${tier.name} 等级颜色`);
    const swatches = TIER_COLOR_IDS.map(colorId => {
      const color = tierColor(colorId);
      const swatch = documentRef.createElement('button');
      swatch.type = 'button';
      swatch.className = 'tier-color-swatch';
      swatch.dataset.colorId = colorId;
      swatch.setAttribute('style', `background-color: ${color.background}; color: ${color.foreground};`);
      swatch.setAttribute('aria-label', `选择 ${colorId} 颜色`);
      swatch.setAttribute('title', colorId);
      swatch.addEventListener('click', () => {
        if (draftTiers === null) return;
        const current = draftTiers.find(item => item.id === tier.id);
        if (!current) return;
        current.colorId = colorId;
        setSelectedSwatch(swatches, colorId);
      });
      return swatch;
    });
    setSelectedSwatch(swatches, tier.colorId);
    palette.append(...swatches);

    const input = documentRef.createElement('input');
    input.type = 'text';
    input.className = 'tier-name-input';
    input.dataset.tierId = tier.id;
    input.value = tier.name;
    input.maxLength = TIER_NAME_MAX_LENGTH;
    input.setAttribute('maxlength', TIER_NAME_MAX_LENGTH);
    input.setAttribute('aria-label', `${tier.name} 等级名称`);
    input.setAttribute('aria-invalid', 'false');
    input.addEventListener('input', () => {
      if (draftTiers === null) return;
      const current = draftTiers.find(item => item.id === tier.id);
      if (!current) return;
      current.name = input.value;
      input.setAttribute('aria-invalid', 'false');
      updateDuplicateWarning();
    });

    const count = Array.isArray(draftTierOrder[tier.id])
      ? draftTierOrder[tier.id].length
      : 0;
    const workCount = documentRef.createElement('output');
    workCount.className = 'tier-work-count';
    workCount.textContent = `${count} 部作品`;

    const actions = documentRef.createElement('div');
    actions.className = 'tier-manager-actions';
    const moveUp = createIconButton(
      'tier-move-up',
      '↑',
      `上移 ${tier.name}`,
      index === 0,
      () => moveDraftTier(tier.id, -1, 'moveUp')
    );
    const moveDown = createIconButton(
      'tier-move-down',
      '↓',
      `下移 ${tier.name}`,
      index === draftTiers.length - 1,
      () => moveDraftTier(tier.id, 1, 'moveDown')
    );
    const remove = createIconButton(
      'tier-delete',
      '×',
      `删除 ${tier.name}`,
      draftTiers.length <= MIN_TIERS,
      () => requestDeleteTier(tier.id)
    );
    actions.append(moveUp, moveDown, remove);
    row.append(palette, input, workCount, actions);
    rowControls.set(tier.id, { input, moveUp, moveDown, remove });
    return row;
  }

  function render(focusRequest = null) {
    if (draftTiers === null) return;
    const rowControls = new Map();
    const rows = draftTiers.map((tier, index) => createRow(tier, index, rowControls));
    elements.rows.replaceChildren(...rows);
    elements.add.disabled = draftTiers.length >= MAX_TIERS;
    elements.save.disabled = false;
    updateDuplicateWarning();

    if (focusRequest !== null) {
      const controls = rowControls.get(focusRequest.id);
      controls?.[focusRequest.control]?.focus?.();
    }
  }

  function moveDraftTier(tierId, direction, control) {
    if (!isOpen()) return;
    const orderedIds = moveTier(structuralTiers(), tierId, direction).map(tier => tier.id);
    const tiersById = new Map(draftTiers.map(tier => [tier.id, tier]));
    draftTiers = orderedIds.map(id => tiersById.get(id));
    render({ id: tierId, control });
  }

  function addDraftTier() {
    if (!isOpen() || draftTiers.length >= MAX_TIERS) return;
    const appended = appendTier(structuralTiers(), randomUUID);
    const added = appended.at(-1);
    draftTiers = [...draftTiers, added];
    draftTierOrder[added.id] = [];
    render({ id: added.id, control: 'input' });
  }

  function deleteDraftTier(tierId) {
    const currentIndex = draftTiers.findIndex(tier => tier.id === tierId);
    if (currentIndex === -1 || draftTiers.length <= MIN_TIERS) return;
    const remainingIds = new Set(removeTier(structuralTiers(), tierId).map(tier => tier.id));
    draftTiers = draftTiers.filter(tier => remainingIds.has(tier.id));
    delete draftTierOrder[tierId];
    const focusTier = draftTiers[Math.min(currentIndex, draftTiers.length - 1)];
    render({ id: focusTier.id, control: 'input' });
  }

  function requestDeleteTier(tierId) {
    if (!isOpen() || draftTiers.length <= MIN_TIERS) return;
    const tier = draftTiers.find(item => item.id === tierId);
    if (!tier) return;
    const count = draftTierOrder[tierId]?.length ?? 0;
    if (count > 0 && !confirmDelete({ tier: cloneTier(tier), count })) return;
    deleteDraftTier(tierId);
  }

  function close() {
    draftTiers = null;
    draftTierOrder = null;
    saving = false;
    if (root.open && typeof root.close === 'function') root.close();
    else root.open = false;
  }

  function save() {
    if (!isOpen() || saving) return;
    let normalized;
    try {
      normalized = normalizeTiers(draftTiers);
    } catch (error) {
      const match = typeof error?.path === 'string'
        ? NAME_ERROR_PATH.exec(error.path)
        : null;
      if (match !== null) {
        const invalidTier = draftTiers[Number(match[1])];
        const input = Array.from(elements.rows.children).find(
          row => row.dataset?.tierId === invalidTier?.id
        )?.querySelector?.('.tier-name-input');
        input?.setAttribute('aria-invalid', 'true');
        input?.focus?.();
        return;
      }
      throw error;
    }

    saving = true;
    try {
      onSave(normalized.map(cloneTier));
      close();
    } catch (error) {
      saving = false;
      throw error;
    }
  }

  function open({ tiers, tierOrder }) {
    const snapshot = applyTierConfig({
      currentTiers: tiers,
      currentTierOrder: tierOrder,
      nextTiers: tiers
    });
    draftTiers = snapshot.tiers;
    draftTierOrder = snapshot.tierOrder;
    saving = false;
    render();
    if (!root.open) {
      if (typeof root.showModal === 'function') root.showModal();
      else root.open = true;
    }
    const firstInput = elements.rows.querySelector?.('.tier-name-input');
    firstInput?.focus?.();
  }

  elements.add.addEventListener('click', addDraftTier);
  elements.cancel.addEventListener('click', close);
  elements.save.addEventListener('click', save);
  root.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    close();
  });
  root.addEventListener('close', () => {
    draftTiers = null;
    draftTierOrder = null;
    saving = false;
  });

  return Object.freeze({ open, close, cancel: close });
}
