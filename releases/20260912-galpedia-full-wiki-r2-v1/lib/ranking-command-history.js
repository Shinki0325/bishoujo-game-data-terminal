// Order page-level annotations alongside the existing board histories. Board
// data stays owned by the original controllers; this journal stores commands,
// not another selection model or binary media. It is session-only and bounded.
export function createRankingCommandHistory({ subjects, announce = () => {}, limit = 100 }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Invalid history limit');
  const stacks = Object.fromEntries(Object.keys(subjects).map(key => [key, { past: [], future: [] }]));
  const snapshot = state => ({ selected: state.selectedWorkIds ?? state.selectedCompanyIds, tiers: state.tiers, order: state.tierOrder });
  const signature = state => JSON.stringify(snapshot(state));
  const push = (key, command) => {
    const stack = stacks[key]; stack.past.push(command); stack.future.length = 0;
    if (stack.past.length > limit) stack.past.shift();
  };
  function labelFor(before, after) {
    if (JSON.stringify(before.tiers) !== JSON.stringify(after.tiers)) return '修改等级';
    if (JSON.stringify(before.selected) !== JSON.stringify(after.selected)) return '调整候选';
    const target = after.tiers.find(tier => (after.order[tier.id] ?? []).some(id => !(before.order[tier.id] ?? []).includes(id)));
    return target ? `移至 ${target.name}` : '调整排榜顺序';
  }
  function board(change, label) {
    const before = Object.fromEntries(Object.entries(subjects).map(([key, owner]) => [key, snapshot(owner.read())]));
    const result = change();
    for (const [key, owner] of Object.entries(subjects)) {
      const after = snapshot(owner.read());
      if (JSON.stringify(before[key]) === JSON.stringify(after)) continue;
      const beforeSignature = JSON.stringify(before[key]), afterSignature = JSON.stringify(after);
      push(key, { label: label ?? labelFor(before[key], after),
        undo: () => signature(owner.read()) === afterSignature && owner.undo(),
        redo: () => signature(owner.read()) === beforeSignature && owner.redo() });
    }
    return result;
  }
  function annotations(key, presentation, change, label = '修改标注') {
    const before = presentation.inspect().annotations;
    const result = change();
    const after = presentation.inspect().annotations;
    if (JSON.stringify(before) === JSON.stringify(after)) return result;
    const restore = value => {
      presentation.clearAnnotations();
      for (const [id, text] of Object.entries(value)) presentation.setAnnotation(id, text);
      return true;
    };
    push(key, { label, undo: () => restore(before), redo: () => restore(after) });
    return result;
  }
  function step(key, direction) {
    const stack = stacks[key], from = direction === 'undo' ? stack.past : stack.future;
    const to = direction === 'undo' ? stack.future : stack.past, command = from.at(-1);
    if (!command) return false;
    if (command[direction]() === false) {
      announce('当前状态已变化，无法恢复该操作。', 'error');
      return false;
    }
    from.pop(); to.push(command);
    announce(`已${direction === 'undo' ? '撤销' : '重做'}：${command.label}`, 'success');
    return true;
  }
  return Object.freeze({ board, annotations,
    undo: key => step(key, 'undo'), redo: key => step(key, 'redo'),
    inspect(key) { const { past, future } = stacks[key]; return { canUndo: past.length > 0, canRedo: future.length > 0,
      undoLabel: past.at(-1)?.label ?? '', redoLabel: future.at(-1)?.label ?? '' }; }
  });
}
