# 第三轮总审计

第三轮在加固之后的 Folio 上做了五件事：任意块嵌套、PostgreSQL 与部署、页面历史、协作感知，以及本阶段的大页面性能、键盘与 ARIA、暗色模式。五阶段都完成。产品阶段结束时是单元测试 77、端到端 48，见 [FINAL_AUDIT.md](./FINAL_AUDIT.md)。加固结束时是单元测试 108、端到端 56，见 [FOLIO_NEXT_AUDIT.md](./FOLIO_NEXT_AUDIT.md)。本轮阶段 4 结束时是单元测试 142、端到端 64。本阶段结束时是单元测试 144、端到端 69。

各阶段只追加测试，没有删除或放宽原有断言。

## 完成度

| 阶段 | 完成情况 | 新增单元 | 新增端到端 | 阶段结束时全量 | 自检 |
| --- | --- | --- | --- | --- | --- |
| 1 嵌套块 | 完成。任意块可以缩进、反缩进，也可以拖进另一块。最多 8 层 | 8 | 3 | 116 / 59 | [NESTED_BLOCKS.md](./NESTED_BLOCKS.md) |
| 2 生产部署 | 完成。本地默认 SQLite，用环境变量切到 PostgreSQL。CI 增加 Postgres 16 | 11 | 0 | 127 / 59 | [DEPLOY_PRODUCTION.md](./DEPLOY_PRODUCTION.md) |
| 3 页面历史 | 完成。自动保存记快照，可预览和恢复。恢复走原来的 revision / 409 | 10 | 3 | 137 / 62 | [PAGE_HISTORY.md](./PAGE_HISTORY.md) |
| 4 协作感知 | 完成。其他成员显示在标题下。别人保存后可以刷新。用数据库轮询，不用长连接 | 5 | 2 | 142 / 64 | [PRESENCE.md](./PRESENCE.md) |
| 5 性能、无障碍、暗色 | 完成。生产构建再测了 320 块页面。补了键盘、ARIA 和 axe。外观跟随系统 | 2 | 5 | 144 / 69 | 本文，[LARGE_PAGE_TEST.md](./LARGE_PAGE_TEST.md) |

## 自检文档

- [docs/NESTED_BLOCKS.md](./NESTED_BLOCKS.md)
- [docs/DEPLOY_PRODUCTION.md](./DEPLOY_PRODUCTION.md)
- [docs/PAGE_HISTORY.md](./PAGE_HISTORY.md)
- [docs/PRESENCE.md](./PRESENCE.md)
- [docs/LARGE_PAGE_TEST.md](./LARGE_PAGE_TEST.md)
- [docs/FOLIO_ROUND3_AUDIT.md](./FOLIO_ROUND3_AUDIT.md)

## 新增测试明细

阶段 1，全量 116 / 59。通过的运行：[45962344207](https://github.com/bob1525/notion-build/actions/runs/45962344207)。

| 位置 | 数量 | 覆盖 |
| --- | --- | --- |
| `src/lib/nested-blocks.test.ts` | 8 | 缩进保留子块和 marks；反缩进收养后面的同级；拖进块内并打开折叠；拒绝拖进子孙；第 8 层停住；规范化拆环；Markdown 往返；粘贴保留层级 |
| `e2e/nested-blocks.spec.ts` | 3 | Tab / Shift+Tab 刷新后仍在；拖进另一块再拖出来；拖到子孙上指示线变红 |

阶段 2，全量 127 / 59。通过的运行：[45968147499](https://github.com/bob1525/notion-build/actions/runs/45968147499)。

| 位置 | 数量 | 覆盖 |
| --- | --- | --- |
| `src/lib/database-provider.test.ts` | 11 | 默认 SQLite；两种 Postgres 地址；`DATABASE_PROVIDER` 覆盖地址；已有环境变量优先于 `.env`；示例文件仍是 SQLite；Postgres schema 只改 datasource；两种数据库的清空语句 |

阶段 3 在这个文件上再加了 1 个，阶段 4 再加了 1 个。文件现在是 13 个。阶段 3 全量 137 / 62，通过的运行：[45975487581](https://github.com/bob1525/notion-build/actions/runs/45975487581)。

| 位置 | 数量 | 覆盖 |
| --- | --- | --- |
| `src/lib/page-history.test.ts` | 9 | 同一人 5 分钟内合并；换人新开；恢复强制新开；超长跳过；50 条清理；只读能看不能恢复；两种数据库的建表 SQL |
| `src/lib/database-provider.test.ts` | 1 | 重新播种时删除 `PageSnapshot` |
| `e2e/page-history.spec.ts` | 3 | 连续编辑合成一条；恢复后版本号增加并拒绝旧版本；只读成员能看不能恢复 |

阶段 4，全量 142 / 64。通过的运行：[45984857339](https://github.com/bob1525/notion-build/actions/runs/45984857339)。

| 位置 | 数量 | 覆盖 |
| --- | --- | --- |
| `src/lib/presence.test.ts` | 4 | 过期的人消失；自己不出现在名单里；只读被改成查看；只有更新的版本号才提示「有新版本」 |
| `src/lib/database-provider.test.ts` | 1 | 重新播种时删除 `PagePresence` |
| `e2e/presence.spec.ts` | 2 | 另一名成员可见，刷新后再改不会撞上 409；只读显示为查看，分享页不显示他人 |

阶段 5，全量 144 / 69。

| 位置 | 数量 | 覆盖 |
| --- | --- | --- |
| `src/lib/theme.test.ts` | 2 | 未选择时跟随系统；手动浅色或深色盖过系统；顺序是跟随系统、浅色、深色 |
| `e2e/theme.spec.ts` | 2 | 系统为深色时登录页是深色，点三次回到跟随系统，刷新后手动选择还在；分享页用同一个开关 |
| `e2e/a11y.spec.ts` | 3 | 浅色下登录、编辑、历史、分享没有 critical / serious 的 axe 问题；深色下同样四页；侧栏方向键移动，搜索对话框困住焦点，Esc 关闭 |

本轮合计新增单元测试 36 个（8 + 11 + 10 + 5 + 2），新增端到端 13 个（3 + 0 + 3 + 2 + 5）。108 + 36 = 144，56 + 13 = 69。

## 原有测试仍在通过

三组基线都还在现在这 144 个单元和 69 个端到端里面。后面的提交只追加用例。

| 基线 | 当时的全量 | 通过记录 |
| --- | --- | --- |
| 产品阶段 | 单元 77，端到端 48 | [42847585112](https://github.com/bob1525/notion-build/actions/runs/42847585112)。日志是 `77 passed` 和 `48 passed` |
| 加固结束 | 单元 108，端到端 56 | [42888587599](https://github.com/bob1525/notion-build/actions/runs/42888587599)（pull request）、[42888573451](https://github.com/bob1525/notion-build/actions/runs/42888573451)（push）。补记运行 [42890421987](https://github.com/bob1525/notion-build/actions/runs/42890421987) |
| 本轮阶段 4 | 单元 142，端到端 64 | 功能提交 `fca104b`：[45984857339](https://github.com/bob1525/notion-build/actions/runs/45984857339)（pull request）、[45984847999](https://github.com/bob1525/notion-build/actions/runs/45984847999)（push）。分支头 `ad60886`：[45986440520](https://github.com/bob1525/notion-build/actions/runs/45986440520)（pull request）、[45986429754](https://github.com/bob1525/notion-build/actions/runs/45986429754)（push） |

本阶段把这 142 个单元和 64 个端到端又跑了一遍，全部通过，然后再加上外观和可达性的用例。SQLite 上先跑过不含深色 axe 的 68 个端到端（8.6 分钟）。深色 axe 补进同一文件之后，全量改为 69 个，SQLite 和 PostgreSQL 各再跑一遍。结果写在下一节。

## 本阶段怎么验证

| 检查 | 结果 |
| --- | --- |
| `npm test` | 24 个文件，144 / 144。新增 `theme.test.ts` 2 个 |
| `npm run lint` | `No ESLint warnings or errors` |
| `npm run typecheck` | 退出码 0 |
| `npm run build` | 生产构建成功 |
| 生产大页面，第一次 | 第 320 块 230 ms，文档响应 48 ms，合成输入 11 ms，按键 19 ms，拖拽 248 ms，长任务 0，15 层 72 ms |
| 生产大页面，第二次 | 第 320 块 148 ms，文档响应 44 ms，合成输入 9 ms，按键 24 ms，拖拽 249 ms，长任务 0，15 层 57 ms |
| 生产大页面，第三次 | 第 320 块 162 ms，文档响应 46 ms，合成输入 21 ms，按键 19 ms，拖拽 261 ms，长任务 0，15 层 63 ms |
| 浅色 axe 与键盘 | `e2e/a11y.spec.ts` 前两条通过 |
| 深色 axe | `e2e/a11y.spec.ts` 的 dark theme 通过，覆盖登录、编辑、历史和分享 |
| 外观 | `e2e/theme.spec.ts` 2 个通过 |
| SQLite 全量端到端（69） | 69 通过，8.4 分钟。日志有 `数据库：sqlite（push）`、`页面历史表：sqlite`、`在线状态表：sqlite`，播种仍是 2 个用户、3 个工作区、16 页、99 块 |
| PostgreSQL 16 全量端到端（69） | 69 通过，8.4 分钟。日志有 `数据库：postgresql（push）`、`页面历史表：postgresql`、`在线状态表：postgresql`，播种仍是 2 个用户、3 个工作区、16 页、99 块 |

原先两次生产基线是第 320 块 130 ms 和 165 ms，文档响应 42 ms 和 59 ms。本阶段三次响应都在 60 ms 以内。可见时间一次是 230 ms，另外两次是 148 ms 和 162 ms，靠近原来的区间。编辑和拖拽没有长任务。没有为渲染再改实现。命令和表格在 [LARGE_PAGE_TEST.md](./LARGE_PAGE_TEST.md)。

## 做了什么

大页面仍用原来的 `scripts/large-page.bench.ts`。生产配置是 `playwright.bench.prod.config.ts`：先 `npm run build`，再由 Playwright 启动 `next start`。这次测量发生在嵌套块、历史、在线状态和暗色都已经进页面之后。

键盘和读屏：

- 每个登录后的页面有「跳到正文」，指向 `#folio-content`。
- 侧栏标成「工作区侧栏」。页面树是 `nav`。焦点在页面链接上时，上下方向键在页面之间移动，右方向展开，左方向在有子页面时收起。新建子页面的按钮在键盘聚焦时可见。
- 对话框把 Tab 留在面板里，Esc 关闭，关闭后焦点回到打开它的控件。搜索框同样处理。冲突对话框仍不能被 Esc 关掉，后提交的人还是要选择覆盖或放弃。
- 侧栏已经打开时，若对话框也开着，Esc 只关掉对话框。
- 历史列表每一项读出时间和编辑者。在线成员一行是 `status`，每个人读出名字和「正在查看」或「正在编辑」。「有新版本」也是 `status`。
- 可聚焦的分割线改为分组并标成「分割线」，里面的横线仍是那条 `hr`。Tab 缩进的行为不变。只读视图里的待办复选框标成「已完成」或「未完成」。

axe 使用 `@axe-core/playwright`，只把 `critical` 和 `serious` 当成失败。浅色和深色各扫登录、欢迎页编辑器、历史对话框和分享页。修过的对比度：正文次要色和更淡的颜色在白底和侧栏上都达到 4.5:1；浅色强调色和危险色加深；收藏星改成更深的棕色，深色下改成浅棕；深色代码着色单独换了一套。行内链接浅色是 `#1d4ed8`，深色是 `#9ec5ff`。

暗色模式：

- 颜色是 CSS 变量。`html[data-theme=dark]` 切换。默认跟随系统。
- 选择存在 `localStorage` 的 `folio-theme`。顺序是跟随系统、浅色、深色，再回到跟随系统。
- 页面绘制前有一段脚本，按已经记住的选择设置主题，避免先闪一下浅色。
- 开关在侧栏底部、登录页右上角和分享页顶栏。系统主题变化时，处在「跟随系统」的页面会跟着变。

## 剩余限制与后续建议

- 没有多人同时改同一段文字的合并。不刷新就保存，后提交仍停在冲突提示上。在线状态大约每 5 秒更新，离开后最多大约 20 秒还显示。没有后台清扫。未登录的分享页不显示他人。
- 页面历史把同一人 5 分钟内的连续保存收成一条。每页最多 50 条，单条超过 40 万字符就跳过。只读成员能看不能恢复。公开链接没有历史。
- 本地默认 SQLite，一个写入者。线上用 PostgreSQL，建表用 `npm run db:deploy`（`prisma db push`）。仓库里的迁移 SQL 是 SQLite 写法，不要在 PostgreSQL 上执行。
- 图片单张不超过 2MB。默认写在本机 `public/uploads`。没有持久磁盘时改 `IMAGE_STORAGE=s3`。
- 搜索在内存里完成。外观存在这台浏览器，不跟账号走。
- 编辑时最多 8 层。代码块里的 Tab 插入两个空格，代码块和图片改层级用拖拽。
- axe 覆盖了登录、编辑器、历史对话框和分享页，浅色和深色各一遍，外加侧栏方向键和搜索对话框。冲突对话框、工作区菜单、图片上传和窄屏抽屉没有单独再扫一遍。
- 320 块在生产模式里仍然一次画出来。当前测量没有长任务。页面再大一个数量级时，可以再做只渲染可见行。
- 后续可以做真正的协同编辑、服务端记住外观，以及没人打开页面时清掉过期的在线记录。

## GitHub Actions

本地命令和 CI 的步骤相同。CI 有三条 job：`lint, typecheck, unit`、SQLite 的 `playwright`、PostgreSQL 的 `playwright on postgres`。一次 push 会同时产生 push 和 pull request 两条运行。

提交 `5af775a` 的 pull request 运行 [45993951115](https://github.com/bob1525/notion-build/actions/runs/45993951115) 通过。lint、typecheck 和单元测试 1 分 19 秒；SQLite 的 Playwright 11 分 20 秒；PostgreSQL 上的 Playwright 12 分 57 秒。同一提交的 push 运行 [45993942618](https://github.com/bob1525/notion-build/actions/runs/45993942618) 也通过：单元测试 1 分 22 秒，SQLite Playwright 11 分 34 秒，PostgreSQL Playwright 11 分 13 秒。六条 job 都是成功。Node.js 20 的弃用提示如果还在，不影响结果。
