# 加固总审计

这一轮在已经验收的 Folio 上补了五件事：持续集成、行内链接、图片存储、权限拆分和按用户保存的侧栏，以及本阶段的补测。五阶段都完成。产品阶段的验收仍以 [FINAL_AUDIT.md](./FINAL_AUDIT.md) 为准，那次是单元 77、端到端 48。这篇只记加固。

## 完成度

| 阶段 | 完成情况 | 新增单元 | 新增端到端 | 阶段结束时全量 | 自检 |
| --- | --- | --- | --- | --- | --- |
| 1 GitHub Actions | 完成。push 和 pull request 都会跑 lint、typecheck、单元测试和 Playwright | 0 | 0 | 77 / 48 | [CI_SETUP.md](./CI_SETUP.md) |
| 2 行内链接 | 完成。链接是一种 mark，只接受 http 和 https | 7 | 2 | 84 / 50 | [INLINE_LINKS.md](./INLINE_LINKS.md) |
| 3 图片存储 | 完成。默认仍是 `public/uploads`，另有 S3 兼容示例 | 12 | 0 | 96 / 50 | [IMAGE_STORAGE.md](./IMAGE_STORAGE.md) |
| 4 权限与侧栏开关 | 完成。公开拆成只读和可编辑，侧栏展开按用户存在服务端 | 8 | 2 | 104 / 52 | [PERMISSIONS_AND_TOGGLE.md](./PERMISSIONS_AND_TOGGLE.md) |
| 5 补测试与总审计 | 完成。补了图片页复制、跨块粘贴、连续保存失败和横竖屏抽屉 | 4 | 4 | 108 / 56 | 本文 |

各阶段只加测试，没有删除或放宽原有断言。

## 自检文档

- [docs/CI_SETUP.md](./CI_SETUP.md)
- [docs/INLINE_LINKS.md](./INLINE_LINKS.md)
- [docs/IMAGE_STORAGE.md](./IMAGE_STORAGE.md)
- [docs/PERMISSIONS_AND_TOGGLE.md](./PERMISSIONS_AND_TOGGLE.md)
- [docs/FOLIO_NEXT_AUDIT.md](./FOLIO_NEXT_AUDIT.md)

## 新增测试明细

阶段 1 没有新测试。通过的基线运行是 [42847585112](https://github.com/bob1525/notion-build/actions/runs/42847585112)，日志里是 `77 passed` 和 `48 passed`。

阶段 2，[42866334779](https://github.com/bob1525/notion-build/actions/runs/42866334779)：

| 位置 | 数量 | 覆盖 |
| --- | --- | --- |
| `src/lib/rich-text.test.ts` | 6 | 链接解析、渲染、和加粗叠在一起、非法协议、光标移动、拆开再接上 |
| `src/lib/markdown.test.ts` | 1 | Markdown 往返保留链接，`javascript:` 不当成链接 |
| `e2e/inline-links.spec.ts` | 2 | 添加、修改、打开、移除；分享页上安全链接可点 |

阶段 3，[42871658821](https://github.com/bob1525/notion-build/actions/runs/42871658821)：

| 位置 | 数量 | 覆盖 |
| --- | --- | --- |
| `src/lib/image-storage.test.ts` | 8 | 本地读写删、非法键、按环境变量选择后端 |
| `src/lib/s3-client.test.ts` | 4 | SigV4、拒绝错误的桶和键 |

阶段 4，[42879743862](https://github.com/bob1525/notion-build/actions/runs/42879743862)：

| 位置 | 数量 | 覆盖 |
| --- | --- | --- |
| `src/lib/permissions-access.test.ts` | 6 | 只读拒写、可编辑可写但不能改权限、未公开拒绝、切换级别后规则跟着变 |
| `src/lib/ui-state.test.ts` | 2 | 侧栏状态按工作区隔开，坏数据和危险键被丢掉 |
| `e2e/permissions-access.spec.ts` | 2 | Mia 在只读、可编辑、再改回私有时的实际请求；Nash 换浏览器后侧栏仍收着 |

阶段 5，本地全量是单元 108、端到端 56。新增单元 4 个，都在 `src/lib/clipboard.test.ts`：

| 测试 | 结果 |
| --- | --- |
| 跨块范围带上空块、marks，以及范围外但属于选中引用的嵌套段落 | 通过 |
| 切下加粗和链接，贴进空字符串后偏移还在；插到已有 mark 中间会把后面的 mark 推开 | 通过 |
| 贴进空段落时替换这个空块，中间的空块留下；多行纯文本 `甲\n\n乙` 也留空行 | 通过 |
| HTML 往返后，`javascript:` 图片地址被清空，`/uploads/` 和宽度留下 | 通过 |

新增端到端 4 个：

| 位置 | 测试 | 结果 |
| --- | --- | --- |
| `e2e/folio-next.spec.ts` | 上传图片并设成小宽度，复制页面。副本和原文在刷新后都还有同一地址、同一宽度和配图说明 | 通过 |
| `e2e/folio-next.spec.ts` | Shift+方向键选中三块（加粗、链接、中间空块、结尾），复制后贴到新页面。空块还在，链接和加粗还在。再把链接贴进那个空块，刷新后仍是「文档」 | 通过 |
| `e2e/conflict-save.spec.ts` | 同一次草稿连续三次 PATCH 得到 500。状态一直是「保存失败」，正文不回退。第四次重试成功，刷新后文字还在 | 通过 |
| `e2e/folio-next.spec.ts` | 390×844 打开抽屉。转到 700×360 抽屉仍开着，点遮罩关掉。转到 900×400 侧栏变成常驻，顶栏按钮隐藏。回到 390×844 抽屉是关的，Esc 和点进页面仍能收起 | 通过 |

## 原有 77 个单元和 48 个端到端

阶段 1 的 PR 运行 [42847585112](https://github.com/bob1525/notion-build/actions/runs/42847585112) 记下了当时的全量：单元 `77 passed (77)`，端到端 `48 passed (6.4m)`。那之后的提交只追加测试。`e2e/conflict-save.spec.ts` 里原来的 4 个用例没有改断言，只在文件末尾加了连续失败这一条。

本阶段本地再跑了包含那 48 个名字在内的 56 个端到端，以及包含那 77 个在内的 108 个单元，全部通过。因此原先那一组仍在通过的集合里。分支头的 GitHub Actions 运行补在下一节，用的是同一套命令。

## 本阶段怎么验证

| 命令 | 结果 |
| --- | --- |
| `npm test` | 19 个文件，108 / 108 |
| `npm run lint` | `No ESLint warnings or errors` |
| `npm run typecheck` | 退出码 0 |
| `npm run test:e2e` | 56 / 56，6.4 分钟 |

## 做了什么

复制页面本来就会带上图片地址和宽度，这次用端到端把上传后的图片页复制钉住。块编辑器之前不能一次选中多块。现在在块首或块尾按住 Shift 再按上下方向，会扩成一块范围。复制时把块、marks 和链接放进剪贴板的 HTML，并在本标签页的 `sessionStorage` 留一份。贴回空段落时替换这个空块，所以不会多出一个空行；范围里原有的空块会留下来。贴到 Folio 以外只有 Markdown 或纯文本，空段落可能被 Markdown 折掉。`javascript:` 图片地址在读回剪贴板时丢掉。

保存失败原来测的是失败一次再重试。现在连续三次 500，提示一直是「保存失败」，编辑器里的字不撤，第四次写入成功后刷新还在。

窄屏抽屉在宽度仍小于 768 的横屏里保持开或关。跨过 768 再转回来时把抽屉关掉，避免横屏常驻侧栏在回到竖屏后盖住页面。点遮罩、Esc 和点进页面仍然会关。

## 剩余限制与后续建议

- 没有实时协作。同一页在别处保存过时，后提交停在冲突对话框上，要选择覆盖或放弃并刷新。
- 块只能在同级之间拖。不能把一块拖进另一块，也不能拖到别的层级。后续可以单独做跨级拖拽，并继续拒绝拖进自己的子孙。
- 图片单张不超过 2MB，只接受 png、jpeg、gif、webp。默认写在本机 `public/uploads`。没有持久磁盘时要改 `IMAGE_STORAGE=s3`，并让 `S3_PUBLIC_BASE_URL` 能被浏览器直接打开。地址不是预签名。
- 公开分成只读和可编辑。可编辑的成员能改正文，不能改可见性、置顶、移动或删除，也不能在只读页下新建子页面。两种分享链接都只能阅读。工作区所有者仍能改只读页的正文，避免把所有者锁在外面。
- 侧栏展开按用户存在服务端。块的折叠仍是页面内容，打开这篇的人看到的是同一种收起状态。移动端抽屉、Markdown 模式和搜索范围不跨设备保存。
- 在 Folio 里跨块复制会保留格式、链接和空块。贴到别的程序时只剩 Markdown 或纯文本。
- 数据库是 SQLite，适合单机演示，不适合多进程同时写。若要部署成多实例，再换到 Postgres，而不是在 SQLite 上加锁。

## GitHub Actions

本地命令和 CI 的步骤相同。分支头的运行链接在推送并通过之后写入这一节。
