/**
 * GALPEDIA 的版本信息与更新日志唯一来源。
 *
 * 这里绑定当前静态发布，不读取远端 latest。发布前若静态发布编号或实际
 * 发布日期发生变化，只需在此处核对一次，关于首页和完整日志会同步更新。
 */

const V1_SUMMARY = Object.freeze([
  '公测开启，提供作品、会社与人物查询，以及排榜、联动搜索和庭守手册。',
  '优化顶栏与页头、手机操作，以及人物资料的反馈与返回体验。',
  '补充部分作品的声优资料，完善人物与作品的关联。'
]);

const V1_LOG = Object.freeze([
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
  version: 'v1.0.1-beta',
  label: '公测版',
  date: '2026-09-06',
  releaseId: '20260906-galpedia-v1.0.1-beta',
  notice: '目前处于公测阶段，资料与使用体验仍在持续完善。',
  summary: V1_SUMMARY,
  log: V1_LOG
});

/** Newest first. Keep this list to the versions with an actual public record. */
export const GALPEDIA_RELEASE_NOTES = Object.freeze([V1_RELEASE]);
export const CURRENT_GALPEDIA_RELEASE = GALPEDIA_RELEASE_NOTES[0];
