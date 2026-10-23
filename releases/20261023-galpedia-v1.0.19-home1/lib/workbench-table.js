// Lossless column encoding. Grouping similar values also improves HTTP compression.
export function encodeWorkbenchTable(works, fields) {
  const previous = [];
  const columns = fields.map(field => {
    const values = works.map(work => work[field] ?? null);
    let copy = null;
    if (values.every(value => value === null || ['string','number','boolean'].includes(typeof value))) {
      for (let source = 0; source < previous.length; source++) {
        const overrides = [];
        for (let row = 0; row < values.length; row++) {
          if (values[row] !== previous[source][row]) overrides.push([row, values[row]]);
          if (overrides.length > values.length / 10) break;
        }
        if (overrides.length <= values.length / 10 && (!copy || overrides.length < copy.overrides.length)) copy = {kind:'copy', source, overrides};
      }
    }
    previous.push(values);
    if (copy) return copy;
    if (values.every(value => Array.isArray(value) && value.every(item => typeof item === 'string'))) {
      const dictionary = [], positions = new Map();
      return {kind:'lists', dictionary, values:values.map(items => items.map(item => {
        if (!positions.has(item)) { positions.set(item, dictionary.length); dictionary.push(item); }
        return positions.get(item);
      }))};
    }
    if (values.every(value => value === null || typeof value === 'string')) {
      const dictionary = [...new Set(values)];
      if (dictionary.length < values.length / 2) {
        const positions = new Map(dictionary.map((value, index) => [value, index]));
        return {kind:'dictionary', dictionary, values:values.map(value => positions.get(value))};
      }
    }
    return {kind:'raw', values};
  });
  return {schema:columns.some(column => column.kind === 'copy') ? 'workbench-column-table-v2' : 'workbench-column-table-v1', length:works.length, columns};
}

export function decodeWorkbenchTable(table, fields, count) {
  if (!['workbench-column-table-v1','workbench-column-table-v2'].includes(table?.schema) || table.length !== count
    || !Array.isArray(table.columns) || table.columns.length !== fields.length) throw new TypeError('作品列索引格式错误');
  // Establish all properties at once; adding dozens of dynamic properties to
  // each empty object can push V8 into slower dictionary-property storage.
  const shape = Object.fromEntries(fields.map(field => [field, null]));
  const works = Array.from({length:count}, () => ({...shape}));
  for (let column = 0; column < fields.length; column++) {
    if (table.columns[column]?.kind === 'copy') {
      const {source, overrides} = table.columns[column];
      if (table.schema !== 'workbench-column-table-v2' || !Number.isSafeInteger(source) || source < 0 || source >= column || !Array.isArray(overrides) || overrides.length > count) throw new TypeError('作品列引用错误');
      for (let row = 0; row < count; row++) {
        const value = works[row][fields[source]];
        if (!(value === null || ['string','number','boolean'].includes(typeof value))) throw new TypeError('作品列引用必须是简单值');
        works[row][fields[column]] = value;
      }
      let previous = -1;
      for (const pair of overrides) {
        if (!Array.isArray(pair) || pair.length !== 2 || !Number.isSafeInteger(pair[0]) || pair[0] <= previous || pair[0] >= count || !(pair[1] === null || ['string','number','boolean'].includes(typeof pair[1]))) throw new TypeError('作品列差异格式错误');
        previous = pair[0];works[pair[0]][fields[column]] = pair[1];
      }
      continue;
    }
    const {kind, values, dictionary} = table.columns[column] ?? {};
    if (!Array.isArray(values) || values.length !== count || !['raw','dictionary','lists'].includes(kind)) throw new TypeError('作品列长度或编码错误');
    if (kind !== 'raw' && (!Array.isArray(dictionary) || dictionary.some(value => typeof value !== 'string' && !(kind === 'dictionary' && value === null)))) throw new TypeError('作品字典格式错误');
    const item = index => {
      if (!Number.isSafeInteger(index) || index < 0 || index >= dictionary.length) throw new TypeError('作品字典引用越界');
      return dictionary[index];
    };
    for (let row = 0; row < count; row++) {
      let value = values[row];
      if (kind === 'dictionary') value = item(value);
      if (kind === 'lists') {
        if (!Array.isArray(value)) throw new TypeError('作品标签列表格式错误');
        value = value.map(item);
      }
      works[row][fields[column]] = value;
    }
  }
  return works;
}
