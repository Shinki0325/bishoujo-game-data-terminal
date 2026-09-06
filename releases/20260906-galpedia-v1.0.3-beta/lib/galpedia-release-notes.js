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
export const GALPEDIA_RELEASE_NOTES = Object.freeze([V1_RELEASE]);
export const CURRENT_GALPEDIA_RELEASE = GALPEDIA_RELEASE_NOTES[0];
