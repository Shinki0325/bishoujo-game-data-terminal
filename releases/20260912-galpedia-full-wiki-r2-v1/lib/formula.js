const BINARY_TYPES = new Set(['AND', 'OR']);
const FILTER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const RESERVED_FILTER_IDS = new Set(['AND', 'OR', 'NOT']);
const MAX_FORMULA_LENGTH = 4096;
const MAX_AST_NODES = 1024;
const MAX_AST_DEPTH = 128;

export class FormulaSyntaxError extends Error {
  constructor(message, code, offset) {
    super(message);
    this.name = 'FormulaSyntaxError';
    this.code = code;
    this.offset = offset;
  }
}

function syntaxError(message, code, offset) {
  return new FormulaSyntaxError(message, code, offset);
}

function validateFilterId(id, name = 'filter ID') {
  if (
    typeof id !== 'string'
    || !FILTER_ID_PATTERN.test(id)
    || RESERVED_FILTER_IDS.has(id.toUpperCase())
  ) {
    throw new TypeError(
      `${name} must match ${FILTER_ID_PATTERN} and must not be AND, OR, or NOT`
    );
  }
  return id;
}

function knownIdSet(knownFilterIds) {
  if (!Array.isArray(knownFilterIds) && !(knownFilterIds instanceof Set)) {
    throw new TypeError('knownFilterIds must be an array or Set');
  }

  const knownIds = new Set();
  for (const id of knownFilterIds) {
    knownIds.add(validateFilterId(id, 'knownFilterIds entries'));
  }
  return knownIds;
}

export function tokenizeFormula(source, knownFilterIds) {
  if (typeof source !== 'string') {
    throw new TypeError('source must be a string');
  }
  if (source.length > MAX_FORMULA_LENGTH) {
    throw syntaxError(
      `Formula exceeds ${MAX_FORMULA_LENGTH} characters`,
      'FORMULA_TOO_LONG',
      MAX_FORMULA_LENGTH
    );
  }

  const knownIds = knownIdSet(knownFilterIds);
  const tokens = [];
  let offset = 0;

  while (offset < source.length) {
    if (/\s/u.test(source[offset])) {
      offset += 1;
      continue;
    }

    if (source[offset] === '(' || source[offset] === ')') {
      const type = source[offset] === '(' ? 'LPAREN' : 'RPAREN';
      tokens.push({ type, value: source[offset], offset });
      offset += 1;
      continue;
    }

    const start = offset;
    while (
      offset < source.length
      && !/\s/u.test(source[offset])
      && source[offset] !== '('
      && source[offset] !== ')'
    ) {
      offset += 1;
    }

    const value = source.slice(start, offset);
    const keyword = value.toUpperCase();
    if (keyword === 'AND' || keyword === 'OR' || keyword === 'NOT') {
      tokens.push({ type: keyword, value: keyword, offset: start });
    } else if (knownIds.has(value)) {
      tokens.push({ type: 'FILTER_ID', value, offset: start });
    } else {
      throw syntaxError(`Unknown filter ID "${value}" at offset ${start}`, 'UNKNOWN_FILTER', start);
    }
  }

  if (tokens.length === 0) {
    throw syntaxError('Formula is empty', 'EMPTY_SOURCE', source.length);
  }

  return tokens;
}

export function parseFormula(source, knownFilterIds) {
  const tokens = tokenizeFormula(source, knownFilterIds);
  const astStats = new WeakMap();
  let position = 0;

  const current = () => tokens[position];
  const atEnd = () => position >= tokens.length;

  function missingOperatorError(token) {
    return syntaxError(`Missing operator at offset ${token.offset}`, 'MISSING_OPERATOR', token.offset);
  }

  function unexpectedOperatorError(token) {
    return syntaxError(
      `Unexpected operator ${token.value} at offset ${token.offset}`,
      'UNEXPECTED_OPERATOR',
      token.offset
    );
  }

  function formulaTooComplexError(offset) {
    return syntaxError(
      `Formula exceeds the complexity limit at offset ${offset}`,
      'FORMULA_TOO_COMPLEX',
      offset
    );
  }

  function registerNode(node, depth, nodeCount, token) {
    if (depth > MAX_AST_DEPTH || nodeCount > MAX_AST_NODES) {
      throw formulaTooComplexError(token?.offset ?? source.length);
    }
    astStats.set(node, { depth, nodeCount });
    return node;
  }

  function filterNode(token) {
    return registerNode({ type: 'filter', id: token.value }, 1, 1, token);
  }

  function notNode(value, token) {
    const valueStats = astStats.get(value);
    return registerNode(
      { type: 'not', value },
      valueStats.depth + 1,
      valueStats.nodeCount + 1,
      token
    );
  }

  function binaryNode(type, left, right, token) {
    const leftStats = astStats.get(left);
    const rightStats = astStats.get(right);
    return registerNode(
      { type, left, right },
      Math.max(leftStats.depth, rightStats.depth) + 1,
      leftStats.nodeCount + rightStats.nodeCount + 1,
      token
    );
  }

  function parsePrimary(nestingDepth) {
    const token = current();

    if (!token) {
      throw syntaxError('Expected an expression at end of input', 'UNEXPECTED_END', source.length);
    }

    if (token.type === 'FILTER_ID') {
      position += 1;
      return filterNode(token);
    }

    if (token.type === 'LPAREN') {
      if (nestingDepth >= MAX_AST_DEPTH) {
        throw formulaTooComplexError(token.offset);
      }
      position += 1;

      if (current()?.type === 'RPAREN') {
        throw syntaxError(
          `Empty parentheses at offset ${current().offset}`,
          'EMPTY_PARENTHESES',
          current().offset
        );
      }

      if (atEnd()) {
        throw syntaxError(
          'Missing closing parenthesis at end of input',
          'MISMATCHED_PARENTHESIS',
          source.length
        );
      }

      const expression = parseOr(nestingDepth + 1);
      const closing = current();
      if (!closing) {
        throw syntaxError(
          'Missing closing parenthesis at end of input',
          'MISMATCHED_PARENTHESIS',
          source.length
        );
      }
      if (closing.type !== 'RPAREN') {
        if (closing.type === 'FILTER_ID' || closing.type === 'LPAREN' || closing.type === 'NOT') {
          throw missingOperatorError(closing);
        }
        throw unexpectedOperatorError(closing);
      }

      position += 1;
      return expression;
    }

    if (BINARY_TYPES.has(token.type)) {
      throw unexpectedOperatorError(token);
    }

    if (token.type === 'RPAREN') {
      throw syntaxError(
        `Unexpected closing parenthesis at offset ${token.offset}`,
        'MISMATCHED_PARENTHESIS',
        token.offset
      );
    }

    throw syntaxError(`Unexpected token at offset ${token.offset}`, 'UNEXPECTED_TOKEN', token.offset);
  }

  function parseUnary(nestingDepth) {
    const token = current();
    if (token?.type !== 'NOT') {
      return parsePrimary(nestingDepth);
    }
    if (nestingDepth >= MAX_AST_DEPTH) {
      throw formulaTooComplexError(token.offset);
    }

    position += 1;
    const next = current();
    if (!next) {
      throw syntaxError('Dangling NOT at end of input', 'DANGLING_NOT', source.length);
    }
    if (next.type === 'RPAREN') {
      throw syntaxError(`Dangling NOT at offset ${next.offset}`, 'DANGLING_NOT', next.offset);
    }
    if (BINARY_TYPES.has(next.type)) {
      throw unexpectedOperatorError(next);
    }

    return notNode(parseUnary(nestingDepth + 1), token);
  }

  function parseAnd(nestingDepth) {
    let left = parseUnary(nestingDepth);

    while (current()?.type === 'AND') {
      const operator = current();
      position += 1;
      const next = current();
      if (!next) {
        throw syntaxError('Dangling AND at end of input', 'DANGLING_OPERATOR', source.length);
      }
      if (next.type === 'RPAREN') {
        throw syntaxError(`Dangling AND at offset ${next.offset}`, 'DANGLING_OPERATOR', next.offset);
      }
      if (BINARY_TYPES.has(next.type)) {
        throw unexpectedOperatorError(next);
      }

      left = binaryNode('and', left, parseUnary(nestingDepth), operator);
    }

    return left;
  }

  function parseOr(nestingDepth) {
    let left = parseAnd(nestingDepth);

    while (current()?.type === 'OR') {
      const operator = current();
      position += 1;
      const next = current();
      if (!next) {
        throw syntaxError('Dangling OR at end of input', 'DANGLING_OPERATOR', source.length);
      }
      if (next.type === 'RPAREN') {
        throw syntaxError(`Dangling OR at offset ${next.offset}`, 'DANGLING_OPERATOR', next.offset);
      }
      if (BINARY_TYPES.has(next.type)) {
        throw unexpectedOperatorError(next);
      }

      left = binaryNode('or', left, parseAnd(nestingDepth), operator);
    }

    return left;
  }

  const ast = parseOr(0);
  const trailing = current();
  if (!trailing) {
    return ast;
  }

  if (trailing.type === 'RPAREN') {
    throw syntaxError(
      `Unexpected closing parenthesis at offset ${trailing.offset}`,
      'MISMATCHED_PARENTHESIS',
      trailing.offset
    );
  }
  if (trailing.type === 'FILTER_ID' || trailing.type === 'LPAREN' || trailing.type === 'NOT') {
    throw missingOperatorError(trailing);
  }
  throw unexpectedOperatorError(trailing);
}

function assertGeneratedFormulaParseable(source, filterIds) {
  if (source.length > 0) {
    parseFormula(source, new Set(filterIds));
  }
}

function assertWorkFilterIds(workFilterIds) {
  if (!Array.isArray(workFilterIds) && !(workFilterIds instanceof Set)) {
    throw new TypeError('workFilterIds must be an array or Set');
  }

  const ids = workFilterIds instanceof Set ? workFilterIds : new Set(workFilterIds);
  for (const id of ids) {
    validateFilterId(id, 'workFilterIds entries');
  }
  return ids;
}

function inspectAst(ast) {
  const stack = [{ node: ast, depth: 1 }];
  const seen = new Set();
  const filterIds = new Set();
  let nodeCount = 0;

  while (stack.length > 0) {
    const { node, depth } = stack.pop();

    if (node === null || typeof node !== 'object') {
      throw new TypeError('ast must contain only formula node objects');
    }
    if (seen.has(node)) {
      throw new TypeError('ast must be a tree without cycles or shared nodes');
    }
    seen.add(node);

    if (depth > MAX_AST_DEPTH) {
      throw new RangeError(`ast exceeds the maximum depth of ${MAX_AST_DEPTH}`);
    }
    nodeCount += 1;
    if (nodeCount > MAX_AST_NODES) {
      throw new RangeError(`ast exceeds the maximum node count of ${MAX_AST_NODES}`);
    }
    if (!Object.hasOwn(node, 'type')) {
      throw new TypeError('ast nodes require an own type property');
    }

    switch (node.type) {
      case 'filter':
        if (!Object.hasOwn(node, 'id')) {
          throw new TypeError('filter AST nodes require an id');
        }
        validateFilterId(node.id, 'filter AST node id');
        filterIds.add(node.id);
        break;
      case 'not':
        if (!Object.hasOwn(node, 'value')) {
          throw new TypeError('not AST nodes require a value');
        }
        stack.push({ node: node.value, depth: depth + 1 });
        break;
      case 'and':
      case 'or':
        if (!Object.hasOwn(node, 'left') || !Object.hasOwn(node, 'right')) {
          throw new TypeError(`${node.type} AST nodes require left and right values`);
        }
        stack.push({ node: node.right, depth: depth + 1 });
        stack.push({ node: node.left, depth: depth + 1 });
        break;
      default:
        throw new TypeError(`Unknown AST node type: ${String(node.type)}`);
    }
  }

  return { filterIds };
}

export function evaluateFormula(ast, workFilterIds) {
  inspectAst(ast);
  const ids = assertWorkFilterIds(workFilterIds);

  function evaluate(node) {
    switch (node.type) {
      case 'filter':
        return ids.has(node.id);
      case 'not':
        return !evaluate(node.value);
      case 'and':
        return evaluate(node.left) && evaluate(node.right);
      case 'or':
        return evaluate(node.left) || evaluate(node.right);
      default:
        throw new TypeError(`Unknown AST node type: ${String(node.type)}`);
    }
  }

  return evaluate(ast);
}

function nodePrecedence(node) {
  switch (node?.type) {
    case 'or':
      return 1;
    case 'and':
      return 2;
    case 'not':
      return 3;
    case 'filter':
      return 4;
    default:
      throw new TypeError(`Unknown AST node type: ${String(node?.type)}`);
  }
}

export function formatFormula(ast) {
  const { filterIds } = inspectAst(ast);

  function format(node) {
    const precedence = nodePrecedence(node);

    if (node.type === 'filter') {
      return node.id;
    }

    if (node.type === 'not') {
      const value = format(node.value);
      return nodePrecedence(node.value) < precedence ? `NOT (${value})` : `NOT ${value}`;
    }

    const operator = node.type.toUpperCase();
    const left = format(node.left);
    const right = format(node.right);
    const leftPrecedence = nodePrecedence(node.left);
    const rightPrecedence = nodePrecedence(node.right);
    const formattedLeft = leftPrecedence < precedence ? `(${left})` : left;
    const formattedRight = rightPrecedence <= precedence ? `(${right})` : right;
    return `${formattedLeft} ${operator} ${formattedRight}`;
  }

  const source = format(ast);
  assertGeneratedFormulaParseable(source, filterIds);
  return source;
}

function stableUniqueIds(ids, name) {
  if (!Array.isArray(ids)) {
    throw new TypeError(`${name} must be an array`);
  }

  const uniqueIds = [];
  const seen = new Set();
  for (const id of ids) {
    validateFilterId(id, `${name} entries`);
    if (!seen.has(id)) {
      seen.add(id);
      uniqueIds.push(id);
    }
  }
  return uniqueIds;
}

export function basicToFormula(positiveIds, excludedIds, operator) {
  if (typeof operator !== 'string') {
    throw new TypeError('operator must be AND or OR');
  }

  const normalizedOperator = operator.toUpperCase();
  if (normalizedOperator !== 'AND' && normalizedOperator !== 'OR') {
    throw new RangeError('operator must be AND or OR');
  }

  const positives = stableUniqueIds(positiveIds, 'positiveIds');
  const exclusions = stableUniqueIds(excludedIds, 'excludedIds');
  const exclusionFormula = exclusions.map(id => `NOT ${id}`).join(' AND ');
  let source = exclusionFormula;

  if (positives.length > 0) {
    let positiveFormula = positives.join(` ${normalizedOperator} `);
    if (normalizedOperator === 'OR' && positives.length > 1 && exclusions.length > 0) {
      positiveFormula = `(${positiveFormula})`;
    }

    source = exclusionFormula ? `${positiveFormula} AND ${exclusionFormula}` : positiveFormula;
  }

  assertGeneratedFormulaParseable(source, [...positives, ...exclusions]);
  return source;
}

function appendFlattened(node, type, output) {
  if (node?.type === type) {
    appendFlattened(node.left, type, output);
    appendFlattened(node.right, type, output);
  } else {
    output.push(node);
  }
}

function collectFilterIds(node, type) {
  const nodes = [];
  appendFlattened(node, type, nodes);
  if (nodes.some(item => item?.type !== 'filter')) {
    return null;
  }
  return nodes.map(item => item.id);
}

function stableUnique(values) {
  return [...new Set(values)];
}

export function formulaToBasic(ast) {
  inspectAst(ast);

  if (ast?.type === 'filter') {
    return { positiveIds: [ast.id], excludedIds: [], operator: 'AND' };
  }

  if (ast?.type === 'not') {
    if (ast.value?.type !== 'filter') {
      return null;
    }
    return { positiveIds: [], excludedIds: [ast.value.id], operator: 'AND' };
  }

  if (ast?.type === 'or') {
    const positiveIds = collectFilterIds(ast, 'or');
    if (!positiveIds) {
      return null;
    }
    const uniquePositiveIds = stableUnique(positiveIds);
    return {
      positiveIds: uniquePositiveIds,
      excludedIds: [],
      operator: uniquePositiveIds.length === 1 ? 'AND' : 'OR'
    };
  }

  if (ast?.type !== 'and') {
    return null;
  }

  const terms = [];
  appendFlattened(ast, 'and', terms);
  const excludedIds = [];
  const positiveTerms = [];

  for (const term of terms) {
    if (term?.type === 'not') {
      if (term.value?.type !== 'filter') {
        return null;
      }
      excludedIds.push(term.value.id);
    } else {
      positiveTerms.push(term);
    }
  }

  if (positiveTerms.length === 0) {
    return {
      positiveIds: [],
      excludedIds: stableUnique(excludedIds),
      operator: 'AND'
    };
  }

  const orTerms = positiveTerms.filter(term => term?.type === 'or');
  if (orTerms.length > 0) {
    if (positiveTerms.length !== 1 || orTerms.length !== 1) {
      return null;
    }
    const positiveIds = collectFilterIds(orTerms[0], 'or');
    if (!positiveIds) {
      return null;
    }
    const uniquePositiveIds = stableUnique(positiveIds);
    return {
      positiveIds: uniquePositiveIds,
      excludedIds: stableUnique(excludedIds),
      operator: uniquePositiveIds.length === 1 ? 'AND' : 'OR'
    };
  }

  if (positiveTerms.some(term => term?.type !== 'filter')) {
    return null;
  }

  return {
    positiveIds: stableUnique(positiveTerms.map(term => term.id)),
    excludedIds: stableUnique(excludedIds),
    operator: 'AND'
  };
}
