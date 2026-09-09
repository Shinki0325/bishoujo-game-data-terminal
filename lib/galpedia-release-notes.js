/**
 * GALPEDIA 的版本信息与更新日志唯一来源。
 *
 * 这里绑定当前静态发布，不读取远端 latest。发布前若静态发布编号或实际
 * 发布日期发生变化，只需在此处核对一次，关于首页和完整日志会同步更新。
 */

const V1_SUMMARY = Object.freeze([
  '优化作品筛选与年份分布控件，支持按人物职能缩小作品范围。',
  '调整筛选器的窄屏交互、遮罩和结果状态，保留已有页面内容与操作上下文。',
  '接入时庭轮盘加载状态，让作品、会社和人物资料在各自内容区平稳进入。'
]);

const V1_LOG = Object.freeze([
  Object.freeze({
    title: '内容区加载与时庭轮盘',
    text: '首次进入作品、会社或人物资料时，时庭轮盘直接出现在对应结果区中央；去掉额外加载卡片，加载完成后立即交接到资料内容。'
  }),
  Object.freeze({
    title: '年份分布与人物条件筛选',
    text: '将年份直方图与范围控制合并，修正边界年份遮挡和颜色区分，并加入人物职能条件筛选，让结果范围随当前条件即时更新。'
  }),
  Object.freeze({
    title: '筛选器交互收敛',
    text: '修复筛选回退、窄屏滚动、遮罩和输入框焦点问题；结果为空时保留可恢复的筛选上下文。'
  }),
  Object.freeze({
    title: '筛选返回与遮罩调整',
    text: '修复从空结果筛选返回作品库时残留旧条件的问题，并减弱筛选面板遮罩与搜索框内层边框，让页面内容保持可见。'
  }),
  Object.freeze({
    title: '公测开启',
    text: '新增首页查询入口、作品与会社/人物查找、排榜流程和庭守手册入口，覆盖从找到资料到开始整理的基本路径。'
  }),
  Object.freeze({
    title: '图标、页头与手机操作',
    text: '统一搜索、手册和主题图标样式，调整页头层次与手机操作区，让主要入口更容易找到。'
  }),
  Object.freeze({
    title: '筛选与人物返回',
    text: '修复放大页面后筛选面板的关闭按钮被遮挡，以及人物详情加载和返回时的状态异常。'
  }),
  Object.freeze({
    title: '资料补充',
    text: '补充部分作品的声优资料，完善人物与作品的关联。'
  })
]);

const V1_RELEASE = Object.freeze({
  version: 'v1.0.3-beta',
  label: '公测版',
  date: '2026-09-06',
  releaseId: '20260906-galpedia-v1.0.3-beta',
  notice: '目前处于公测阶段，资料与使用体验仍在持续完善。',
  summary: V1_SUMMARY,
  log: V1_LOG
});

/** Newest first. Keep this list to the versions with an actual public record. */
const V104_RELEASE = Object.freeze({
  version: 'v1.0.4-beta',
  label: '公测版',
  date: '2026-09-07',
  releaseId: '20260907-galpedia-v1.0.4-beta',
  notice: '目前处于公测阶段，资料与使用体验仍在持续完善。',
  summary: Object.freeze([
    '按需载入作品、会社和人物栏目，减少首次打开时不必要的等待。',
    '优先展示首批作品，优化搜索、筛选和翻页时的响应。',
    '精简启动数据，人物关联作品的图片按需读取。'
  ]),
  log: Object.freeze([
    Object.freeze({ title: '栏目按需加载', text: '进入首页时不再提前准备所有栏目；作品、排榜、会社与人物在使用时加载所需资料，保留各自的加载和重试状态。' }),
    Object.freeze({ title: '首屏与列表响应', text: '优先展示首批作品，并在后台准备完整检索；优化大结果集的搜索、筛选恢复和翻页，减少页面停顿。' }),
    Object.freeze({ title: '启动数据与图片', text: '减少作品启动数据的重复传输，将查询计算移到后台线程；人物关联图片按需读取，保留作品详情、版本切换和排榜导入功能。' })
  ])
});
const V105_RELEASE = Object.freeze({
  version: 'v1.0.5-beta',
  label: '公测版',
  date: '2026-09-09',
  releaseId: '20260909-galpedia-v1.0.5-beta-metadata',
  notice: '目前处于公测阶段，资料与使用体验仍在持续完善。',
  summary: Object.freeze([
    '改进排榜显示、直播模式和图片导出，让整理与分享更顺手。',
    '优化长榜拖动与滚动，保留实时插入提示和候选区归还操作。',
    '完善栏目切换、加载恢复与缓存管理，减少重复处理和页面干扰。'
  ]),
  log: Object.freeze([
    Object.freeze({ title: '排榜显示与导出', text: '新增经典排榜预设，支持独立调整分级栏宽度；优化显示控件与明亮模式，提供基础画布和紧凑导出选项，修复部分分级底部的空隙。' }),
    Object.freeze({ title: '沉浸直播模式', text: '精简常驻控件，普通与直播模式分别记住显示设置；支持分层按 Esc 退出，以及放大图片后的滚轮缩放、拖动和触屏缩放。' }),
    Object.freeze({ title: '拖动与长榜响应', text: '拖动卡片时可以滚轮浏览长榜，自动滚动后保持正确落点；完善同级插入提示，所有作品排完后仍可拖回候选区，并减少拖动和落位时的重复处理。' }),
    Object.freeze({ title: '封面编辑与操作入口', text: '完善上传图片、贴纸、画笔、打码、文字和图层整理入口；调整卡片更多操作与标注交互，让常用功能更容易找到。' }),
    Object.freeze({ title: '栏目与加载稳定性', text: '统一栏目切换、取消和重试处理，减少迟到的加载结果干扰当前页面；完善缓存恢复和图片资源管理，优化首屏图片与加载提示的交接。修复人物备用资料在首次加载作品附属信息时过早超时的问题。' })
  ])
});
export const GALPEDIA_RELEASE_NOTES = Object.freeze([V105_RELEASE, V104_RELEASE, V1_RELEASE]);
export const CURRENT_GALPEDIA_RELEASE = GALPEDIA_RELEASE_NOTES[0];
