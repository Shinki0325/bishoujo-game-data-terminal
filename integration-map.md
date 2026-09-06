# GALPEDIA 时庭轮盘接入映射（v0.1 本地候选）

日期：2026-09-06

## 本轮范围

先接入一个真实、可取消且不会阻塞内容展示的场景：从首页进入作品库/会社库/人物库/排榜时，`galpedia-boot.js` 动态导入 `main.js` 的初始运行时准备过程。这个阶段包含作品首屏 worker、人物目录和直接 hash 路由的首次准备，是目前最慢的首次进入路径，因此使用 `standard` 大轮盘；轮盘只负责加载状态呈现，不创建新的数据 store、不发起请求、不延长任务等待。

## 现有状态映射

| 轮盘契约 | 当前站点节点/来源 | 接入方式 |
| --- | --- | --- |
| pending | `ensureRuntime()` 首次执行；`runtimePromise` 尚不存在 | 调用 `GalpediaDial.createLoadingController().begin()` |
| ready | `main.js` 导出的 `ready` Promise resolve 且返回 API | `ticket.finish()`，隐藏轮盘；保留原有 `syncHome()` |
| error | `main.js.ready` reject 或 runtime API 为空 | `ticket.fail()`，显示原有“资料库暂时未能加载，请刷新页面重试。” |
| cancel / unmount | 当前壳层没有独立取消按钮；页面卸载由控制器的隐藏/销毁约定兜底 | 不伪造取消请求；只清理本地轮盘计时器 |
| slow pending | 控制器 `slowAfter: 8000` | 仅补中性“载入时间较长，请稍候”，不判定请求失败 |

## 主题与可访问性

- 轮盘使用 `theme: 'inherit'`，由 `--gp-host-dial-*` 映射到现有 GALPEDIA 明暗主题；不根据背景猜主题。
- `#galpedia-load-status-text` 是唯一 `role="status"` / `aria-live` 播报节点；SVG 轮盘本身 `aria-hidden`。候选 boot 会在旧壳层的空状态节点内补建这两个 span，因此不要求原 immutable HTML 先被原地修改。
- `#workspace` 由控制器维护 `aria-busy`，内容不会被清空、遮罩或锁定；首页壳层仍按既有 `inert` 规则工作。
- 160ms 延迟只防止快任务闪现；ready/error 立即结束，不等待一轮动画。
- `prefers-reduced-motion` 和页面不可见时由轮盘 CSS/适配器暂停，不改变真实任务状态。

## 现有状态不重复拥有

- 人物目录的 `#person-directory-loading`、作品详情制作资料的 `#details-credits-status`、筛选器结果状态仍由各自现有 view 管理，本轮不叠加第二套 controller。
- `#status-message` 继续承担操作反馈和错误提示，不作为初始运行时轮盘的 live region。

## 回退方式

删除 `galpedia-chronicle-dial.css` 的 link、`lib/chronicle-dial.js` 的 script 以及 `galpedia-boot.js` 中的 controller 分支，即可回到原有文字状态；数据、路由和请求时机不变。

## 尚未宣称

这是本地候选接入，不代表线上 immutable release 已更新；未修改任何已发布 `releases/<旧版本>/` 目录，未创建 release、未运行正式 release gate、未 push/deploy。
