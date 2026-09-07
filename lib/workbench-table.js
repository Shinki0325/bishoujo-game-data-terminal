// Lossless column encoding. Grouping similar values also improves HTTP compression.
export function encodeWorkbenchTable(works, fields) {
  const columns = fields.map(field => {
    const values = works.map(work => work[field] ?? null);
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
  return {schema:'workbench-column-table-v1', length:works.length, columns};
}

export function decodeWorkbenchTable(table, fields, count) {
  if (table?.schema !== 'workbench-column-table-v1' || table.length !== count
    || !Array.isArray(table.columns) || table.columns.length !== fields.length) throw new TypeError('作品列索引格式错误');
  // Establish all properties at once; adding dozens of dynamic properties to
  // each empty object can push V8 into slower dictionary-property storage.
  const shape = Object.fromEntries(fields.map(field => [field, null]));
  const works = Array.from({length:count}, () => ({...shape}));
  for (let column = 0; column < fields.length; column++) {
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
