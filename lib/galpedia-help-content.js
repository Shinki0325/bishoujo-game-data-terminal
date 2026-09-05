/**
 * GALPEDIA 庭守手册唯一正文来源。
 *
 * category 是内容领域，contexts 是手册的四个栏目投影；renderer 不应从旧
 * dialog 复制正文。
 */

const CATEGORIES = Object.freeze({
  HOME: 'home',
  WORKS: 'works',
  TIER: 'tier',
  COMPANIES: 'companies',
  PEOPLE: 'people',
  DATA: 'data',
  ABOUT: 'about'
});

const CONTEXTS = Object.freeze({
  CURRENT: 'current-page',
  COMMON: 'common-actions',
  DATA: 'data',
  ABOUT: 'about'
});

function makeArticle(definition) {
  return Object.freeze({
    id: definition.id,
    category: definition.category,
    title: definition.title,
    subtitle: definition.subtitle ?? '',
    summary: definition.summary,
    keywords: Object.freeze([...definition.keywords]),
    steps: Object.freeze([...(definition.steps ?? [])]),
    notes: Object.freeze([...(definition.notes ?? [])]),
    keeperTip: definition.keeperTip ?? '',
    related: Object.freeze([...(definition.related ?? [])]),
    sections: Object.freeze((definition.sections ?? []).map(section => Object.freeze({
      title: section.title,
      paragraphs: Object.freeze([...section.paragraphs])
    }))),
    contexts: Object.freeze([...(definition.contexts ?? [])]),
    sourceRefs: Object.freeze([...(definition.sourceRefs ?? [])])
  });
}

const DEFINITIONS = [
  makeArticle({
    id: 'home.overview', category: CATEGORIES.HOME, title: '首页概览',
    subtitle: 'A quiet entrance to the archive',
    summary: '从首页搜索或四个入口开始，进入作品、会社、人物与排榜工作区。',
    keywords: ['首页', '入口', '搜索', '作品库', '会社库', '人物', '排榜', 'GALPEDIA'],
    steps: ['在首页搜索框输入作品、会社或人物名称、别名或拼音。', '选择“浏览作品库”“开始排榜”，或从四个入口进入对应工作区。'],
    notes: [],
    related: ['works.overview', 'companies.overview', 'people.overview', 'tier.overview'],
    contexts: [CONTEXTS.CURRENT],
    sections: [],
    sourceRefs: ['index.html#galpedia-home', 'galpedia-boot.js']
  }),
  makeArticle({
    id: 'works.overview', category: CATEGORIES.WORKS, title: '作品库概览',
    subtitle: 'Search, narrow, compare, choose',
    summary: '作品库把搜索、筛选、卡片浏览、选择与比较放在同一工作区。',
    keywords: ['作品库', '浏览', '筛选', '选择', '比较', '排榜'],
    steps: ['搜索标题、别名或拼音，缩小作品列表。', '打开“筛选”按评分、票数、年份、会社或标签继续缩小范围。', '需要制作排榜时切换到“选择作品”，勾选作品并进入排榜。', '需要对照资料时切换到“比较作品”，选中至少两部作品查看比较。'],
    notes: ['切换浏览、选择和比较不会清掉已有集合。', '排序、卡片显示和筛选只改变你看到的内容，不会修改资料。'],
    related: ['works.search', 'works.filters', 'works.display', 'works.selection', 'works.compare', 'works.mobile'],
    contexts: [CONTEXTS.CURRENT, CONTEXTS.COMMON],
    sections: [{ title: '先做哪一步？', paragraphs: ['只想找资料时保持“浏览作品”；要批量加入候选池时使用“选择作品”；要同时看多作评分与主要信息时使用“比较作品”。'] }],
    sourceRefs: ['index.html#selection-view', 'main.js']
  }),
  makeArticle({
    id: 'works.search', category: CATEGORIES.WORKS, title: '搜索作品',
    subtitle: 'Find by title and known aliases',
    summary: '可用日文、简体中文、别名或拼音搜索作品。',
    keywords: ['搜索', '标题', '别名', '拼音', '简体中文', '日文', '全局搜索'],
    steps: ['在作品库的“搜索作品、别名或拼音”输入框输入关键词。', '从结果中继续按排序查看；清空输入即可回到未按标题限制的结果。', '也可使用页头全局搜索，在作品、会社、人物三类结果中选择目标。'],
    notes: ['拼音、简繁字形只帮助找到结果，不会改显示名称。', '搜索结果仍受当前筛选条件影响；清空搜索可恢复结果。', '页头全局搜索可直接查作品、会社和人物；本帮助搜索只查帮助文章。'],
    related: ['works.filters', 'home.overview', 'people.overview', 'companies.overview'],
    contexts: [CONTEXTS.COMMON],
    sections: [{ title: '匹配方式', paragraphs: ['可按标题、别名、简繁字形和拼音找到结果；页面显示的名称仍保持资料中的写法。'] }],
    sourceRefs: ['lib/galpedia-search.js', 'lib/search-normalization.js', 'lib/cjk-search-pinyin.js']
  }),
  makeArticle({
    id: 'works.filters', category: CATEGORIES.WORKS, title: '筛选作品',
    subtitle: 'Shape the result set without changing data',
    summary: '用基础条件或筛选公式缩小作品结果，并在调整时查看预计结果数量。',
    keywords: ['筛选', '评分', '票数', '年份', '会社', '内容标签', '基础属性', '公式'],
    steps: ['打开“筛选”，先设置最低中位评分、最低评分人数或发行年份范围。', '按需搜索并勾选会社、基础属性和内容标签；内容标签可选“全部满足”“任一满足”或“排除”。', '需要组合条件时切换到“公式”，输入表达式；格式化会校验并整理表达式，输入变更会自动应用，完成后关闭筛选抽屉。', '回到作品库查看结果数量、筛选摘要和可清除的条件。'],
    notes: ['调整条件后，结果会自动更新；点击“应用”即可收起筛选面板。', '找不到预期作品时，可先清除筛选条件再试。'],
    related: ['works.formulas', 'works.display', 'data.missing-data'],
    contexts: [CONTEXTS.COMMON, CONTEXTS.CURRENT],
    sections: [{ title: '排序不是筛选', paragraphs: ['作品库的排序下拉框只改变结果顺序；它与筛选抽屉相互独立，可以先筛选再按 EGS、VNDB、Bangumi、标题或发行日期排序。'] }],
    sourceRefs: ['index.html#filter-drawer', 'lib/filter-drawer.js', 'lib/catalog.js']
  }),
  makeArticle({
    id: 'works.formulas', category: CATEGORIES.WORKS, title: '筛选公式',
    subtitle: '用公式组合筛选条件',
    summary: '用 AND、OR、NOT 和括号组合多个筛选条件。',
    keywords: ['公式', '高级筛选', 'AND', 'OR', 'NOT', '括号', '格式化'],
    steps: ['在筛选抽屉切换到“公式”，从建议列表选择可用条件。', '用 AND 表示同时满足，用 OR 表示任一满足，用 NOT 排除；复杂组合用括号明确优先级。', '输入公式后结果会自动更新；点击“格式化”检查并整理公式，完成后关闭筛选面板。'],
    notes: ['只能选择当前筛选面板提供的条件；输入不存在的条件、空表达式、缺少运算符或括号不配对会提示错误。', '公式过长或过于复杂时会提示错误；错误不会改变现有结果。', '基础筛选和公式筛选只是两种操作方式，可随时切换。'],
    related: ['works.filters', 'data.sources'],
    contexts: [CONTEXTS.COMMON],
    sections: [{ title: '一个可读的形状', paragraphs: ['例如 A AND (B OR NOT C) 表示必须有 A，同时满足 B 或不满足 C；实际使用时请用建议列表中的条件替换 A、B、C。'] }],
    sourceRefs: ['index.html#advanced-panel', 'lib/formula.js', 'lib/formula-autocomplete.js']
  }),
  makeArticle({
    id: 'works.display', category: CATEGORIES.WORKS, title: '卡片与排序显示',
    subtitle: 'Choose the details that help you scan',
    summary: '排序和卡片显示控制浏览信息密度，不会改变作品记录。',
    keywords: ['卡片显示', '排序', 'EGS', 'VNDB', 'Bangumi', '年份', '会社', '分页'],
    steps: ['在排序下拉框选择 EGS 评分、评分人数、EGS 综合评分、VNDB 综合评分、Bangumi 综合评分、标题、会社或发行日期。', '用方向按钮切换升序与降序。', '打开“卡片显示”，按需要显示作品名称、会社名称、EGS/VNDB/BGM 分数或年份。', '使用结果分页的上一页、页码和下一页浏览当前结果。'],
    notes: ['不同来源分数与人数分开显示；缺少某来源评分时保持空白，不会换算成别的来源。', '排序遇到空白会按界面顺序放在后面；“显示”只影响卡片呈现。', '卡片显示偏好保存在当前浏览器，不是共享给其他设备的排榜内容。'],
    related: ['works.overview', 'data.scores', 'data.missing-data'],
    contexts: [CONTEXTS.COMMON],
    sections: [{ title: '快速扫描', paragraphs: ['想看来源分数时打开对应项目；想看作品关系时打开会社与年份。需要完整资料和角色信息，请打开作品详情。'] }],
    sourceRefs: ['index.html#selection-card-display-menu', 'lib/catalog.js', 'views/selection-view.js']
  }),
  makeArticle({
    id: 'works.selection', category: CATEGORIES.WORKS, title: '选择作品',
    subtitle: 'Build a candidate pool for your ranking',
    summary: '选择模式用于把作品加入候选池，再进入作品排榜。',
    keywords: ['选择', '候选池', '全选', '当前页', '清除', '排榜', '200'],
    steps: ['切换到“选择作品”，点击卡片或复选控件选择作品。', '用“选择当前页”或“全选”批量选择，必要时用“查看已选”检查集合。', '用“清除”移除选择，或点击“开始作品排榜”进入候选区。', '回到浏览模式可继续查看资料；已有选择不会因为隐藏工具而凭空消失。'],
    notes: ['一次最多选择 200 部作品；达到上限时会提示。', '批量选择可能需要确认；比较列表和排榜候选互不影响。', '本地自定义作品可以加入候选，但不会写入作品排榜 JSON；需要迁移时请另存图片或保留原浏览器。'],
    related: ['tier.overview', 'tier.candidates', 'works.compare', 'tier.backup'],
    contexts: [CONTEXTS.COMMON, CONTEXTS.CURRENT],
    sections: [{ title: '选择与排榜', paragraphs: ['作品选择只决定哪些作品进入排榜候选区；它不替你决定等级、顺序或颜色。进入排榜后仍可移除候选或撤销最近编辑。'] }],
    sourceRefs: ['lib/selection.js', 'lib/work-limit.js', 'main.js']
  }),
  makeArticle({
    id: 'works.compare', category: CATEGORIES.WORKS, title: '比较作品',
    subtitle: 'Keep comparison separate from selection',
    summary: '比较模式把多部作品的核心资料和评分并列展示，适合做浏览决策。',
    keywords: ['比较', '并列', '双作', '多作', '评分', '20'],
    steps: ['切换到“比较作品”，在卡片上加入要比较的作品。', '选中至少两部后打开双作或多作比较。', '在比较视图中选择指标或排序方式；点击作品标题可回到对应详情。', '完成后清空比较集合，或切回其他浏览模式继续工作。'],
    notes: ['最多同时比较 20 部作品；少于两部时比较按钮保持不可用。', '比较列表和排榜候选、作品选择互不影响；清空比较不会清空候选。', '比较只并列显示已有的主要项目，不会把不同来源分数合并。'],
    related: ['works.overview', 'works.display', 'data.scores'],
    contexts: [CONTEXTS.COMMON],
    sections: [{ title: '比较看什么', paragraphs: ['双作比较适合查看来源评分、评分人数、发行信息与会社等项目；多作列表聚焦主要信息，需要更详细资料时打开详情。'] }],
    sourceRefs: ['main.js', 'index.html#work-compare-bar']
  }),
  makeArticle({
    id: 'works.mobile', category: CATEGORIES.WORKS, title: '移动端选片',
    subtitle: 'Browse first, continue ranking on desktop',
    summary: '移动端优先支持浏览、搜索、筛选、查看详情与选择；分享候选后可在电脑继续排榜。',
    keywords: ['移动端', '手机', '触控', '选择', '分享链接', '电脑', '筛选'],
    steps: ['在移动作品库搜索标题、别名或拼音，并打开筛选抽屉。', '点击“选择”进入选择模式，勾选多部作品后打开“查看已选”。', '点击“生成分享链接”复制候选选择。', '在电脑网页端打开分享链接，选择追加或替换候选池后继续排榜。'],
    notes: ['分享链接只带作品选择，不带本地图片或完整排榜状态。', '导入前会显示可以加入和暂时找不到的作品；追加和替换是两个不同操作。', '手机端适合浏览、筛选和选片，完整排榜请在电脑继续。'],
    related: ['works.selection', 'tier.backup', 'tier.overview'],
    contexts: [CONTEXTS.CURRENT, CONTEXTS.COMMON],
    sections: [{ title: '为什么在电脑继续？', paragraphs: ['分享链接用于把选片带到电脑排榜，不是完整排榜备份；本地图片、贴纸和等级顺序仍需在原浏览器或备份文件中保留。'] }],
    sourceRefs: ['index.html#mobile-selection-view', 'views/mobile-selection-view.js', 'lib/share-selection.js']
  }),
  makeArticle({
    id: 'tier.overview', category: CATEGORIES.TIER, title: '排榜概览',
    subtitle: 'Turn a candidate pool into your own tiers',
    summary: '排榜区用于把已选作品或会社放入分级、调整顺序，并保存或导出结果。',
    keywords: ['排榜', 'Tier List', '等级', '候选', '排序', '作品排榜', '会社排榜'],
    steps: ['从作品库选择作品，或在会社库选择会社后进入对应排榜。', '在候选区确认待整理对象，拖入目标等级。', '在等级内调整顺序，必要时编辑等级名称、颜色、顺序或删除等级。', '用撤销/重做检查编辑，再选择 JSON 备份或 PNG 导出。'],
    notes: ['作品排榜和会社排榜的对象不同，各自整理。', '排榜和显示偏好保存在当前浏览器；跨设备请导出。', '手机端可选片和分享，完整排榜请在电脑打开。'],
    related: ['tier.candidates', 'tier.drag-drop', 'tier.edit-tiers', 'tier.export', 'companies.ranking'],
    contexts: [CONTEXTS.CURRENT],
    sections: [{ title: '两种排榜对象', paragraphs: ['作品排榜从作品选择进入，会社排榜从会社库选择进入。切换前确认当前工作区，避免把作品和会社混在一起。'] }],
    sourceRefs: ['index.html#ranking-view', 'lib/app-controller.js', 'lib/company-ranking.js']
  }),
  makeArticle({
    id: 'tier.candidates', category: CATEGORIES.TIER, title: '管理候选区',
    subtitle: 'Prepare what will be ranked',
    summary: '候选区收纳尚未分级的作品或会社，可搜索、移除、恢复和添加本地作品图片。',
    keywords: ['候选区', '候选池', '候选作品', '候选会社', '添加', '移除', '撤销', '搜索'],
    steps: ['在候选区查看未分级的对象，作品排榜可用候选搜索框按标题筛选。', '点击单张卡片的移除按钮，或先批量选中后移除。', '需要恢复时点击撤销；也可把已分级对象拖回候选区。', '作品排榜可点击候选区末尾的“+”导入本地图片；会社排榜不提供作品图片导入入口。'],
    notes: ['移除候选只移出本次排榜，不会删除作品资料；撤销可恢复最近操作。', '候选区里的对象尚未分级，导出 PNG 只包含已经放入等级的对象。', '导入图片需要成功读取和裁切；浏览器存储不可用时会提示失败。'],
    related: ['tier.drag-drop', 'tier.batch-select', 'tier.custom-images', 'tier.overview'],
    contexts: [CONTEXTS.COMMON, CONTEXTS.CURRENT],
    sections: [{ title: '候选与等级', paragraphs: ['候选区里的卡片尚未分级；进入某个等级后才会出现在排榜中。'] }],
    sourceRefs: ['index.html#ranking-candidates', 'views/ranking-view.js', 'main.js']
  }),
  makeArticle({
    id: 'tier.bangumi', category: CATEGORIES.TIER, title: '从 Bangumi 导入公开收藏',
    subtitle: 'Read a public collection, then confirm matches',
    summary: '从 Bangumi 读取公开的游戏收藏，确认匹配结果后追加到作品候选池。',
    keywords: ['Bangumi', '公开收藏', '导入', '用户名', 'UID', '严格匹配', '主作品', '版本'],
    steps: ['在电脑端排榜的“更多操作”中选择“从 Bangumi 导入”。', '输入 Bangumi 用户名、UID 或个人主页链接，点击“读取公开收藏”。', '检查匹配结果，展开查看未匹配的收藏。', '勾选需要追加的作品；同一作品默认选择主要版本，也可展开选择其他版本，再追加到候选池。'],
    notes: ['流程只读取 Bangumi 公开游戏收藏，不需要登录；网络错误、用户不存在、访问受限或返回不完整时会提示。', '只有明确对应的条目才会自动列入匹配；没有把握的条目会保留为未匹配，不按标题猜测。', '导入只会追加到当前候选池，不会修改 Bangumi 或替换已有排榜。', '候选区已满时不能继续追加；已有对象不会重复加入。'],
    related: ['tier.candidates', 'tier.backup', 'data.sources', 'data.missing-data'],
    contexts: [CONTEXTS.COMMON],
    sections: [{ title: '确认窗口里的几个数字', paragraphs: ['“严格匹配条目”是确认可以对应的收藏；“默认导入主作品”是每组作品预选的主要版本；未匹配条目可展开查看，但不会被自动导入。'] }],
    sourceRefs: ['index.html#bangumi-public-import-dialog', 'lib/bangumi-public-import.js', 'lib/bangumi-public-bindings.js']
  }),
  makeArticle({
    id: 'tier.drag-drop', category: CATEGORIES.TIER, title: '拖放与排序',
    subtitle: 'Place, reorder, and return cards',
    summary: '用拖放把候选卡片放入等级，在等级内调整位置，也可拖回候选区。',
    keywords: ['拖放', '拖拽', '排序', '等级', '候选区', '触控', '自动滚动'],
    steps: ['从候选区拖起一张或一组卡片，移动到目标等级的插入位置后松开。', '拖动等级中的卡片可调整同级顺序，或移动到其他等级。', '将已分级卡片拖出排榜区域并松开，使它回到候选区。', '长列表拖动时靠近边缘可触发滚动；完成后用撤销检查是否放置正确。'],
    notes: ['批量选中的候选会作为一组移动；放错位置时可点击撤销。'],
    related: ['tier.candidates', 'tier.batch-select', 'tier.edit-tiers', 'tier.live'],
    contexts: [CONTEXTS.COMMON],
    sections: [],
    sourceRefs: ['views/ranking-view.js', 'lib/drag.js', 'main.js']
  }),
  makeArticle({
    id: 'tier.batch-select', category: CATEGORIES.TIER, title: '批量选择候选',
    subtitle: 'Move a group with one gesture',
    summary: '在候选区选中多张卡片后，可以整组移动或移除。',
    keywords: ['批量选择', '多选', '长按', '连续选择', '整组拖动', '批量移除'],
    steps: ['在候选区勾选多张卡片，或按住候选卡片约 0.3 秒后滑过其他卡片连续选择。', '把选中的卡片一起拖到目标等级，确认目标位置后松开。', '若要取消候选，可对已选卡片执行批量移除；需要恢复时立即撤销。'],
    notes: ['批量选择只作用于候选区，不会把已在等级中的卡片自动加入。', '批量操作受候选数量、目标等级和设备支持限制；误操作可用撤销。', '批量选择与作品库的“全选/选择当前页”是不同阶段的操作。'],
    related: ['tier.candidates', 'tier.drag-drop', 'works.selection'],
    contexts: [CONTEXTS.COMMON],
    sections: [{ title: '避免误拖', paragraphs: ['先观察卡片的选择状态，再开始拖动；移动过程中不要松开指针到目标区域以外，否则卡片可能回到原处。'] }],
    sourceRefs: ['index.html#ranking-candidate-grid', 'views/ranking-view.js']
  }),
  makeArticle({
    id: 'tier.custom-images', category: CATEGORIES.TIER, title: '本地图片与自定义作品',
    subtitle: 'Crop an image before it enters the board',
    summary: '排榜可从本地图片创建自定义候选，或为已有作品替换当前浏览器中的图片。',
    keywords: ['本地图片', '自定义作品', '替换图片', '裁切', '方形', '原图', '恢复原图'],
    steps: ['在作品排榜候选区点击“+”选择一张或多张图片；为已有作品可从图片预览选择“替换图片”。', '在裁切界面拖动、滚轮缩放或双指缩放方形区域，按需重置裁切并填写标题。', '确认后保存；也可先进入“添加贴纸”，完成贴纸编辑后返回保存。', '对已有替换图可在预览的更多操作中选择“恢复原图”，确认后删除本地替换和贴纸编辑。'],
    notes: ['图片在当前浏览器本地处理；存储不可用、文件无法读取或空间不足时会提示失败。', '每张裁切输出为不超过 1024 的方形图片；跳过当前文件会继续处理，取消全部会停止本次导入。', '自定义作品和替换图片只保存在本地，不会写入作品排榜 JSON；恢复原图会删除相应编辑。'],
    related: ['tier.stickers', 'tier.candidates', 'tier.backup'],
    contexts: [CONTEXTS.COMMON],
    sections: [{ title: '替换与自定义的区别', paragraphs: ['替换图片仍属于已有作品；自定义作品只在本地候选中出现。两者都不会改公开作品资料，也不会把本地图片上传到本站。'] }],
    sourceRefs: ['views/media-dialog-view.js', 'lib/local-media-store.js', 'lib/media-preview-actions.js', 'main.js']
  }),
  makeArticle({
    id: 'tier.stickers', category: CATEGORIES.TIER, title: '图片贴纸',
    subtitle: 'Annotate a local image without changing its source',
    summary: '在图片编辑器中添加遮挡、马赛克、模糊或角色贴纸，并调整位置、大小、旋转与图层。',
    keywords: ['贴纸', '图片编辑', '马赛克', '模糊', '遮挡条', '旋转', '图层', '撤销', '重做'],
    steps: ['从图片预览选择“编辑贴纸”，或在裁切流程中进入贴纸编辑器。', '从面板添加黑色遮挡条、马赛克、模糊、“请稍候”或纸袋角色贴纸。', '选中贴纸后拖动位置；用双指或控制点等比缩放、旋转，并用图层按钮调整前后顺序。', '用撤销、重做或“清空贴纸”整理结果，选择“保存贴纸”提交；取消则保留进入编辑器前的版本。'],
    notes: ['每张图片最多添加 12 个贴纸。', '贴纸只保存在当前浏览器，不会改动原图。', '清空后保存，会移除这张图片上的全部贴纸。'],
    related: ['tier.custom-images', 'tier.live', 'tier.export'],
    contexts: [CONTEXTS.COMMON],
    sections: [{ title: '编辑历史', paragraphs: ['编辑器内的撤销和重做只影响贴纸，不影响排榜顺序。'] }],
    sourceRefs: ['lib/sticker-document.js', 'lib/sticker-compositor.js', 'views/sticker-editor-view.js']
  }),
  makeArticle({
    id: 'tier.edit-tiers', category: CATEGORIES.TIER, title: '编辑等级与显示',
    subtitle: 'Name, color, scale, and presentation',
    summary: '编辑等级名称、颜色、顺序与数量，并调整标题、计数、卡片和标注显示。',
    keywords: ['等级', '分级', '名称', '颜色', '删除', '添加', '显示数量', '标题', '缩放'],
    steps: ['点击等级名称打开编辑，修改名称、颜色、顺序或删除该等级；点击分级板底部“+”添加等级。', '打开“显示”菜单，切换显示数量或标题。', '按需要调节总体、卡片、行高/候选区、图片标注和分级名称大小，或恢复默认。', '在公司排榜中使用相同的展示控制，但确认当前对象是会社。'],
    notes: ['等级名称、颜色和顺序属于排榜内容；显示偏好和图片标注只影响展示。', '可以使用自定义颜色和排序；删除等级前先按界面提示确认卡片如何处理。'],
    related: ['tier.overview', 'tier.drag-drop', 'tier.export', 'companies.ranking'],
    contexts: [CONTEXTS.COMMON],
    sections: [{ title: '尺寸调节', paragraphs: ['缩放只调整当前排榜界面与导出展示；它不会改变原始封面文件，也不会把等级名称写回作品资料。'] }],
    sourceRefs: ['index.html#display-menu', 'lib/tier-config.js', 'lib/ranking-presentation.js']
  }),
  makeArticle({
    id: 'tier.live', category: CATEGORIES.TIER, title: '直播模式',
    subtitle: 'A focused board for live presentation',
    summary: '直播模式隐藏候选管理工具，保留排榜浏览、拖动、预览和桌面图片标注；可从边缘控件退出。',
    keywords: ['直播模式', '沉浸', '全屏', '图片标注', 'Escape', '退出', '桌面', '移动端'],
    steps: ['在排榜工具栏点击“直播模式”进入聚焦视图。', '拖动候选或已分级图片调整排榜，点击图片查看大图。', '在桌面端右键图片添加或修改最多两行图片标注。', '将鼠标移到右上边缘（移动端轻触右侧边缘）显示边缘控件，点击“×”或按 Escape 退出。'],
    notes: ['直播模式下不提供候选管理、等级编辑和图片贴纸编辑入口；退出后回到普通排榜。', '手机端不提供图片标注编辑入口；桌面右键操作只能在电脑使用。', '退出直播模式请使用边缘控件、关闭按钮或 Escape。'],
    related: ['tier.overview', 'tier.stickers', 'tier.export'],
    contexts: [CONTEXTS.CURRENT, CONTEXTS.COMMON],
    sections: [{ title: '标注限制', paragraphs: ['每条标注最多 16 个字符，并按两行显示；手机端不能编辑图片标注。'] }],
    sourceRefs: ['index.html#ranking-immersive-edge', 'lib/ranking-presentation.js', 'lib/ranking-help.js']
  }),
  makeArticle({
    id: 'tier.export', category: CATEGORIES.TIER, title: '导入与导出',
    subtitle: 'Keep a portable board and a shareable image',
    summary: 'JSON 用于保存可恢复的排榜状态，PNG 用于导出当前排榜的视觉结果。',
    keywords: ['导入', '导出', 'JSON', 'PNG', '图片', '备份', '会社排榜'],
    steps: ['在电脑端排榜的“更多操作”中选择“导出 JSON”，保存当前排榜。', '需要恢复时选择“导入 JSON”；导入成功会替换当前排榜，请先备份。', '想分享结果图时，选择“导出图片”，生成 PNG。'],
    notes: ['导入 JSON 会先检查文件是否可用；失败时不会把当前排榜改成半成品。', '自定义本地作品、图片和贴纸不会随作品排榜 JSON 一起带走。', 'PNG 导出包含当前等级、标题显示和图片标注；图片无法加载时会按界面提示处理。', '导出文件只是本地保存，不会自动同步到其他设备。'],
    related: ['tier.backup', 'tier.edit-tiers', 'tier.custom-images', 'works.mobile'],
    contexts: [CONTEXTS.COMMON],
    sections: [{ title: '选择格式', paragraphs: ['想继续编辑请保存 JSON；想发送一张结果图请导出 PNG。若需要带本地图片跨设备迁移，应另行保留图片和贴纸，不能只依赖 JSON。'] }],
    sourceRefs: ['lib/app-controller.js', 'lib/company-ranking.js', 'lib/png-export.js', 'main.js']
  }),
  makeArticle({
    id: 'tier.backup', category: CATEGORIES.TIER, title: '备份与恢复',
    subtitle: 'Understand what a backup contains',
    summary: '备份前区分排榜 JSON、分享选片链接与浏览器中的本地图片，按用途选择恢复方式。',
    keywords: ['备份', '恢复', 'JSON', '分享链接', '候选池', '本地图片'],
    steps: ['先用 JSON 导出保存等级、排序和可恢复的作品选择。', '若只需把作品选择交给电脑排榜，使用移动端生成分享链接。', '如使用替换图片、自定义作品或贴纸，另外保留产生它们的浏览器本地环境。', '恢复 JSON 后检查作品、等级和显示设置，再继续编辑。'],
    notes: ['分享链接不是完整排榜备份，只传递作品选择。', '清理浏览器网站数据、换浏览器或禁止存储，可能使本地图片、贴纸与自定义作品不可用。', 'JSON 不会带回另一个设备的图片编辑；跨设备前应先导出 PNG 作为视觉记录。', '导入失败会保留当前排榜；检查文件后重试。'],
    keeperTip: '请定期导出 JSON；使用了本地图片时，也保存一张排榜结果图。',
    related: ['tier.export', 'tier.custom-images', 'tier.stickers', 'works.mobile'],
    contexts: [CONTEXTS.COMMON, CONTEXTS.DATA],
    sections: [{ title: '三种保存物', paragraphs: ['JSON 是可编辑排榜，分享链接是选片传递，本地图片是浏览器保存的素材。它们互相不能完全替代。'] }],
    sourceRefs: ['lib/share-selection.js', 'lib/share-import.js', 'lib/local-media-store.js', 'lib/app-controller.js']
  }),
  makeArticle({
    id: 'companies.overview', category: CATEGORIES.COMPANIES, title: '会社库概览',
    subtitle: 'Browse brands and their works',
    summary: '会社库按会社名称、别名和拼音查找创作品牌，查看关联作品或进入会社排榜。',
    keywords: ['会社', '会社库', '品牌', '别名', '拼音', '作品', '会社排榜'],
    steps: ['在会社库输入会社名称、别名或拼音。', '按总评分数量、作品数量、平均每作评分数量、最早发售或名称排序。', '按需关闭“仅显示已有会社图片”，浏览完整目录。', '点击会社卡片展开资料；需要整理会社时进入会社排榜。'],
    notes: [],
    related: ['companies.works', 'companies.ranking', 'works.search', 'data.missing-data'],
    contexts: [CONTEXTS.CURRENT],
    sections: [],
    sourceRefs: ['index.html#company-view', 'lib/company-directory.js', 'views/company-directory-view.js']
  }),
  makeArticle({
    id: 'companies.works', category: CATEGORIES.COMPANIES, title: '查看会社作品',
    subtitle: 'Follow a brand into its catalogue',
    summary: '会社资料侧栏列出关联作品，可按年份、评分或评分人数排序并进入作品详情。',
    keywords: ['会社作品', '关联作品', '年份', '评分人数', '详情', '返回会社'],
    steps: ['在会社库打开会社卡片，查看右侧关联作品列表。', '用列表排序切换发行年份、评分或评分人数，并切换升序/降序。', '点击作品打开作品详情；完成后用详情中的会社链接或返回路径回到会社目录。'],
    notes: ['关联作品列表只表示资料中已有的关系，不代表会社承担所有创作职能。', '评分仍按来源分别显示；排序不会改变评分或发行信息。', '打开作品详情后可以返回会社继续浏览。'],
    related: ['companies.overview', 'works.overview', 'data.scores'],
    contexts: [CONTEXTS.CURRENT, CONTEXTS.COMMON],
    sections: [{ title: '从会社到排榜', paragraphs: ['如果要把会社而不是作品放入分级，请回到会社库使用“选择”并进入会社排榜；公司关联作品列表本身不会直接变成排榜候选。'] }],
    sourceRefs: ['lib/company-directory.js', 'views/company-directory-view.js', 'main.js']
  }),
  makeArticle({
    id: 'companies.ranking', category: CATEGORIES.COMPANIES, title: '会社排榜',
    subtitle: 'Rank brands with the familiar board',
    summary: '会社排榜使用与作品排榜相同的等级、拖动、撤销、显示和导出操作；作品与会社分别整理。',
    keywords: ['会社排榜', '会社', '等级', '候选会社', 'JSON', 'PNG', '撤销'],
    steps: ['在会社库打开选择模式，勾选会社并点击“进入排榜”。', '在候选会社区把会社拖入等级，调整顺序或拖回候选区。', '使用显示菜单、撤销/重做、等级编辑和清理操作。', '从更多操作导出会社排榜 JSON，或导出当前排榜 PNG。'],
    notes: ['会社排榜里的选择和顺序与作品排榜分开；切换前看清标题和候选标签。', '会社排榜不能从作品候选区导入本地图片，也不会把会社图片当作作品封面。', 'PNG 只导出已放入等级的会社；导入 JSON 时，找不到的会社会被跳过并提示。'],
    related: ['companies.overview', 'tier.overview', 'tier.edit-tiers', 'tier.export'],
    contexts: [CONTEXTS.CURRENT, CONTEXTS.COMMON],
    sections: [{ title: '相同的板，不同的对象', paragraphs: ['作品和会社使用相同的排榜操作，但分别整理；排序、导出和恢复都以当前排榜对象为准。'] }],
    sourceRefs: ['lib/company-ranking.js', 'index.html#company-selection-context-bar', 'main.js']
  }),
  makeArticle({
    id: 'people.overview', category: CATEGORIES.PEOPLE, title: '人物概览',
    subtitle: 'Find the names behind the works',
    summary: '人物目录按姓名或别名查找人物，并查看参与作品。',
    keywords: ['人物', '声优', '剧本', '原画', '音乐', '姓名', '别名', '参与作品', '拼音'],
    steps: ['进入人物工作区，输入人物姓名或别名。', '在结果中选择人物，查看参与作品；有职能信息时一并查看。', '从参与作品打开作品详情，沿导航返回人物目录。'],
    notes: ['没有可靠记录的资料会留空。'],
    related: ['works.search', 'data.sources', 'data.missing-data'],
    contexts: [CONTEXTS.CURRENT],
    sections: [],
    sourceRefs: ['index.html#person-view', 'views/person-directory-view.js', 'lib/person-search.js']
  }),
  makeArticle({
    id: 'data.sources', category: CATEGORIES.DATA, title: '资料来源',
    subtitle: 'EGS, VNDB, and Bangumi in one view',
    summary: 'GALPEDIA 汇集 EGS、VNDB 与 Bangumi 的公开资料，方便查找和对照。',
    keywords: ['资料来源', 'EGS', 'VNDB', 'Bangumi', '公开资料', '来源标识', '对应'],
    steps: [],
    notes: ['作品、评分和匹配信息分别标注 EGS、VNDB 或 Bangumi 来源。', 'Bangumi 导入只读取公开收藏，并把确认对应的作品列入匹配；无法确认的会显示未匹配。', '不同来源的评分、票数和状态分别保留，不会合成一个分数。'],
    related: ['data.scores', 'data.snapshots', 'tier.bangumi', 'data.missing-data'],
    contexts: [CONTEXTS.DATA, CONTEXTS.CURRENT],
    sections: [{ title: '汇集与统一展示', paragraphs: ['本站把 EGS、VNDB 和 Bangumi 的公开资料放在一起，方便检索、对照和排榜；各来源仍按自己的计分方式解释。'] }],
    sourceRefs: ['main.js', 'lib/vndb-ratings.js', 'lib/bangumi-ratings.js', 'lib/bangumi-public-bindings.js']
  }),
  makeArticle({
    id: 'data.scores', category: CATEGORIES.DATA, title: '如何理解评分',
    subtitle: 'Read each source on its own terms',
    summary: '卡片与详情分别显示 EGS、VNDB、Bangumi 的评分和评分人数；排序也按来源分别处理。',
    keywords: ['评分', 'EGS 评分', 'EGS 综合评分', 'VNDB 评分', 'Bangumi 评分', '评分人数', '尺度'],
    steps: [],
    notes: ['EGS 显示中位评分、评分人数和综合评分等项目；名称以界面显示为准。', 'VNDB 作品即使已找到，也可能暂无评分；尚未找到对应作品时会显示另一种提示。', 'Bangumi 评分使用 0–10 的来源评分与评分人数；已找到但无评分同样保持“暂无评分”。', '不要把不同来源的分数直接相加、平均或按一个来源的尺度解释另一个来源。'],
    keeperTip: '比较分数时，请先确认它们来自同一个评分网站。',
    related: ['data.sources', 'data.snapshots', 'works.display', 'data.missing-data'],
    contexts: [CONTEXTS.DATA],
    sections: [{ title: '排序时看清来源', paragraphs: ['作品库的排序项明确区分 EGS、VNDB 与 Bangumi 分数/票数；空白不会伪装成零分或高分。'] }],
    sourceRefs: ['lib/catalog.js', 'lib/vndb-rating-view.js', 'lib/bangumi-rating-view.js']
  }),
  makeArticle({
    id: 'data.snapshots', category: CATEGORIES.DATA, title: '来源与快照时间',
    subtitle: 'A dated view, not a real-time promise',
    summary: '页面展示带来源和快照时间的公开资料；页面更新时间不等于资料更新时间。',
    keywords: ['快照', '时间', '更新时间', '来源', '公开资料'],
    steps: [],
    notes: ['日期来自公开快照或来源查询；不同来源可能有不同日期。', '页面更新完成只说明新页面已发布，不代表 EGS、VNDB、Bangumi 同时更新。', '本站不是实时同步；原始来源的新变化可能稍后才出现。'],
    related: ['data.sources', 'data.missing-data', 'home.overview'],
    contexts: [CONTEXTS.DATA],
    sections: [{ title: '如何理解日期', paragraphs: ['看到“快照”时，把它当作当前公开资料的观察时间；看到“暂无评分”或“未匹配”时，应以页面提示为准，不要用日期推断缺失原因。'] }],
    sourceRefs: ['brand/snapshot.json', 'main.js', 'lib/runtime-config.js']
  }),
  makeArticle({
    id: 'data.missing-data', category: CATEGORIES.DATA, title: '缺失资料与加载状态',
    subtitle: 'Blank, failed, and zero are not the same',
    summary: '空白、加载失败、未匹配和确实为零代表不同情况，不能互相替换。',
    keywords: ['缺失资料', '空白', '加载失败', '暂无评分', '未匹配', '零', '状态'],
    steps: [],
    notes: ['没有可靠来源记录时保持空白或“暂无评分”；这不等于分数为零。', '请求失败或资料无法读取时显示加载/错误状态；重试成功前不要把错误当作数据缺失。', '已对应但暂无评分、暂时找不到条目、没有对应关系是不同状态；Bangumi 也会显示匹配状态和查询时间。', '筛选和排序遇到空白会按界面顺序处理，不会自动补分。'],
    keeperTip: '暂无评分不等于零分；加载失败时可以稍后重试。',
    related: ['data.sources', 'data.scores', 'data.snapshots', 'tier.bangumi'],
    contexts: [CONTEXTS.DATA, CONTEXTS.COMMON],
    sections: [{ title: '遇到空白怎么办', paragraphs: ['先看项目旁的来源和提示，再确认网络或快照是否可用；不要仅凭空白推断作品没有评分、会社没有作品，或人物没有参与记录。'] }],
    sourceRefs: ['lib/vndb-rating-view.js', 'lib/bangumi-rating-view.js', 'main.js']
  }),
  makeArticle({
    id: 'about.galpedia', category: CATEGORIES.ABOUT, title: '关于 GALPEDIA',
    subtitle: 'A personal archive and a working tool',
    summary: '少女使时间成为故事，记录让故事继续存在。少女箱庭 GALPEDIA 是美少女游戏资料库，在这里查找作品、了解创作者，也为喜欢的作品制作自己的排榜。',
    keywords: ['关于', 'GALPEDIA', '少女箱庭', '资料库', '个人工具', '品牌'],
    steps: [],
    notes: [],
    related: ['about.shiori', 'home.overview', 'data.sources'],
    contexts: [CONTEXTS.ABOUT],
    sections: [{ title: '庭守手册', paragraphs: ['手册按你所在页面提供简短操作说明；从首页、作品、会社、人物或排榜打开帮助，都可以直接查看当前任务的做法。'] }],
    sourceRefs: ['index.html#galpedia-home', 'handoff/galpedia-interaction-help-design-20260905.md']
  }),
  makeArticle({
    id: 'about.shiori', category: CATEGORIES.ABOUT, title: '关于綴木 栞',
    subtitle: 'Keeper of the small garden',
    summary: '綴木 栞是少女箱庭的庭守，负责整理、保存并引导查看记录。',
    keywords: ['綴木栞', '綴木 栞', '庭守', '少女箱庭', '品牌背景'],
    steps: [],
    notes: [],
    related: ['about.galpedia', 'data.missing-data'],
    contexts: [CONTEXTS.ABOUT],
    sections: [{ title: '她守护什么', paragraphs: ['她照看着箱庭里的记录，也陪你寻找作品与创作者留下的故事。'] }],
    sourceRefs: ['index.html#galpedia-home', 'brand/snapshot.json', 'handoff/galpedia-interaction-help-design-20260905.md']
  })
];

const articleIds = new Set(DEFINITIONS.map(item => item.id));
for (const item of DEFINITIONS) {
  for (const relatedId of item.related) {
    if (!articleIds.has(relatedId)) throw new Error('Unknown help article related ID: ' + relatedId);
  }
}

/** The canonical, immutable article list. */
export const articles = Object.freeze([...DEFINITIONS]);
export const HELP_ARTICLES = articles;

const articleById = new Map(articles.map(item => [item.id, item]));

export function getHelpArticle(id) {
  if (typeof id !== 'string') return undefined;
  return articleById.get(id);
}

function normalizeQuery(value) {
  return value.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('zh-CN');
}

function searchableFields(item) {
  return {
    title: normalizeQuery(item.title),
    keywords: normalizeQuery(item.keywords.join(' ')),
    summary: normalizeQuery(item.summary),
    sections: normalizeQuery(item.sections.flatMap(section => [section.title, ...section.paragraphs]).join(' ')),
    steps: normalizeQuery(item.steps.join(' ')),
    notes: normalizeQuery([...item.notes, item.keeperTip].join(' '))
  };
}

/**
 * Search only local handbook content. Empty/whitespace input intentionally
 * returns no results so opening the drawer does not become a second index.
 */
export function searchHelpArticles(query) {
  if (typeof query !== 'string') throw new TypeError('query must be a string');
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) return [];

  const matches = [];
  for (const [index, item] of articles.entries()) {
    const fields = searchableFields(item);
    const priority = ['title', 'keywords', 'summary', 'sections', 'steps', 'notes']
      .findIndex(field => fields[field].includes(normalized));
    if (priority >= 0) matches.push({ item, index, priority });
  }
  matches.sort((left, right) => left.priority - right.priority || left.index - right.index);
  return matches.map(match => match.item);
}

export { CATEGORIES, CONTEXTS };
