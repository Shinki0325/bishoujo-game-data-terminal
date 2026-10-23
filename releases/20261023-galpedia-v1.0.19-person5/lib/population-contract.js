const WORK_ID_PATTERN = /^[1-9][0-9]*$/u;

function uniqueWorkIds(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const ids = [...value];
  if (ids.some(id => typeof id !== 'string' || !WORK_ID_PATTERN.test(id))) {
    throw new TypeError(`${label} contains an invalid work ID`);
  }
  if (new Set(ids).size !== ids.length) throw new TypeError(`${label} contains duplicate work IDs`);
  return ids;
}

function population(id, workIds) {
  return Object.freeze({
    populationId: id,
    workIds: Object.freeze([...workIds]),
    expectedCount: workIds.length
  });
}

export function createRuntimePopulationContract({ coreWorkIds, admittedWorkIds = [] } = {}) {
  const core = uniqueWorkIds(coreWorkIds, 'coreWorkIds');
  const admitted = uniqueWorkIds(admittedWorkIds, 'admittedWorkIds');
  const coreSet = new Set(core);
  if (admitted.some(id => coreSet.has(id))) throw new TypeError('admittedWorkIds overlaps coreWorkIds');
  const runtime = [...core, ...admitted];
  return Object.freeze({
    core: population('core-v1', core),
    admissions: population('admissions-v1', admitted),
    runtime: population('runtime-v1', runtime),
    presentation: population('presentation-core-v1', core)
  });
}

export function assertPopulationCarrier(carrier, expectedPopulation) {
  if (carrier === null || typeof carrier !== 'object' || Array.isArray(carrier)) {
    throw new TypeError('population carrier must be an object');
  }
  if (carrier.populationId !== expectedPopulation.populationId) {
    throw new TypeError(`population carrier expected ${expectedPopulation.populationId}`);
  }
  const ids = uniqueWorkIds(carrier.workIds, 'population carrier workIds');
  if (ids.length !== expectedPopulation.expectedCount
      || ids.some((id, index) => id !== expectedPopulation.workIds[index])) {
    throw new TypeError('population carrier work IDs do not match the authority population');
  }
  return expectedPopulation;
}
