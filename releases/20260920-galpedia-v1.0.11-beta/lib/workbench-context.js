// Lossless transport references only. Original family validation still runs
// after decoding, including catalog binding, overlap and default-edition checks.
const FAMILY_FIELDS = ['catalogMemberWorkIds','defaultWorkId','members','presentationWorkId','status','title','vndbId'];
const MEMBER_FIELDS = ['default','label','platform','releaseDate','title','workId'];
function exact(value, fields) {
  if (!value || Object.keys(value).sort().join('|') !== fields.slice().sort().join('|')) throw new TypeError('版本族字段不兼容');
}
export function encodeWorkbenchContext(context, works) {
  if (Object.hasOwn(context, 'packedFamilies')) throw new TypeError('版本族编码字段冲突');
  const source = context.presentationFamiliesSource;
  if (!source) return context;
  const position = new Map(works.map((work, i) => [work.workId, i]));
  const ref = id => {if (!position.has(id)) throw new TypeError('版本族引用未知作品');return position.get(id);};
  const text = (value, id, field) => value === works[ref(id)][field] ? ref(id) : value;
  const mapping = {};
  const rows = source.value.families.map(family => {
    exact(family, FAMILY_FIELDS);
    for (const id of family.catalogMemberWorkIds) mapping[id] = family.presentationWorkId;
    return [family.catalogMemberWorkIds.map(ref), ref(family.defaultWorkId), family.members.map(member => {
      exact(member, MEMBER_FIELDS);
      return [member.default, member.label, member.platform, text(member.releaseDate, member.workId, 'releaseDate'), text(member.title, member.workId, 'title'), ref(member.workId)];
    }), family.presentationWorkId, family.status, text(family.title, family.defaultWorkId, 'title'), family.vndbId];
  });
  const original = source.value.workToPresentationWorkId;
  const sameMapping = Object.keys(original).length === Object.keys(mapping).length && Object.entries(original).every(([id, value]) => mapping[id] === value);
  const {families, workToPresentationWorkId, ...metadata} = source.value;
  const {presentationFamiliesSource, ...rest} = context;
  return {...rest, packedFamilies:{schema:'workbench-family-table-v1', source:{...source,value:metadata}, rows,
    mapping:sameMapping ? null : Object.entries(original).map(([id,value]) => [ref(id),value])}};
}
export function decodeWorkbenchContext(context, works) {
  if (!Object.hasOwn(context, 'packedFamilies')) return context;
  if (Object.hasOwn(context, 'presentationFamiliesSource')) throw new TypeError('版本族不可重复声明');
  const packed = context.packedFamilies;
  exact(packed, ['schema','source','rows','mapping']);
  if (packed?.schema !== 'workbench-family-table-v1' || !packed.source?.value || !Array.isArray(packed.rows) || packed.rows.length > works.length) throw new TypeError('版本族编码格式错误');
  if (Object.hasOwn(packed.source.value,'families') || Object.hasOwn(packed.source.value,'workToPresentationWorkId')) throw new TypeError('版本族元数据不可重复声明');
  const work = index => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= works.length) throw new TypeError('版本族作品引用越界');
    return works[index];
  };
  const text = (value, field, owner) => {
    if (typeof value === 'number') {
      if (value !== owner) throw new TypeError('版本族文字引用身份错误');
      return work(value)[field];
    }
    if (typeof value !== 'string') throw new TypeError('版本族文字格式错误');
    return value;
  };
  let memberCount = 0, catalogCount = 0;
  const mapping = Object.create(null);
  const families = packed.rows.map(row => {
    if (!Array.isArray(row) || row.length !== 7 || !Array.isArray(row[0]) || !Array.isArray(row[2])) throw new TypeError('版本族行格式错误');
    memberCount += row[2].length;catalogCount += row[0].length;
    if (memberCount > works.length || catalogCount > works.length) throw new TypeError('版本族成员数量错误');
    const ids = row[0].map(index => work(index).workId);
    for (const id of ids) mapping[id] = row[3];
    return {catalogMemberWorkIds:ids, defaultWorkId:work(row[1]).workId, members:row[2].map(member => {
      if (!Array.isArray(member) || member.length !== 6) throw new TypeError('版本成员行格式错误');
      return {default:member[0],label:member[1],platform:member[2],releaseDate:text(member[3],'releaseDate',member[5]),title:text(member[4],'title',member[5]),workId:work(member[5]).workId};
    }),presentationWorkId:row[3],status:row[4],title:text(row[5],'title',row[1]),vndbId:row[6]};
  });
  let restoredMapping = mapping;
  if (packed.mapping !== null) {
    if (!Array.isArray(packed.mapping) || packed.mapping.length > works.length) throw new TypeError('版本族映射格式错误');
    restoredMapping = Object.create(null);
    for (const pair of packed.mapping) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[1] !== 'string') throw new TypeError('版本族映射行错误');
      const id = work(pair[0]).workId;
      if (Object.hasOwn(restoredMapping,id)) throw new TypeError('版本族映射重复');
      restoredMapping[id] = pair[1];
    }
  }
  const {packedFamilies, ...rest} = context;
  return {...rest,presentationFamiliesSource:{...packed.source,value:{...packed.source.value,families,workToPresentationWorkId:{...restoredMapping}}}};
}
