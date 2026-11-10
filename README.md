# Folio

一个安静、清晰的块式知识库。可以注册登录，在多个工作区里用嵌套页面写笔记，按块编辑，也可以切到 Markdown。风格尽量靠近 Notion：浅色侧栏、大标题、少装饰。

## 技术栈

- Next.js 15（App Router）+ React 19 + TypeScript
- Tailwind CSS
- Prisma 6 + SQLite
- 自研块编辑器（快捷键、`/` 菜单、Markdown 往返）
- 认证：bcrypt 密码哈希，JWT 放在 HttpOnly cookie
- 测试：Vitest、Playwright

## 本地启动

需要 Node.js 20 或更新版本。

```bash
npm install
cp .env.example .env
npm run setup
npx playwright install chromium
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。`npm run setup` 会生成 Prisma Client、创建 `prisma/dev.db` 并写入种子数据。

生产构建：

```bash
npm run build
npm start
```

## 种子账号

两个账号的密码都是 `folio-demo`。

| 名字 | 邮箱 | 能进的工作区 |
| --- | --- | --- |
| Nash | nash@folio.dev | 产品工作台（所有者）、研究笔记、个人空间 |
| Mia | mia@folio.dev | 产品工作台、研究笔记 |

登录页可以一键填入 Nash 的账号。种子里有三个工作区、多层嵌套页面，以及标题、段落、列表、待办、代码块和分割线。

## 功能

- 注册、登录、退出
- 多个工作区，侧栏里切换
- 页面树可以拖拽换顺序、拖进另一页，或拖出来升一级。不能拖进自己或子页面
- 块编辑：标题、段落、无序 / 有序列表、待办、引用、折叠、代码块、分割线、图片
- 块内格式：加粗、斜体、删除线、行内代码。可用 `**`、`*`、`~~`、`` ` ``，也可以用 Cmd/Ctrl+B、I、Shift+X、E，或 `/` 菜单和选区浮动条
- 同级块可以拖握把排序，松手后自动保存
- 引用和折叠可以嵌套段落。折叠的收起状态会保存
- 图片可以用 https 地址插入，也可以上传 png / jpeg / gif / webp，并在小、中、大之间切换
- 代码块可选语言。JavaScript、Python、CSS 有基础着色
- 快捷键：`#`、`##`、`###`、`-`、`1.`、`[]` 加空格，以及 `---` 和 ` ``` `
- Markdown 编辑和预览，可以切回块
- 复制页面。可以选择只复制这一页，或连同子页面一起复制。标题会加上「副本」
- 按标题和正文搜索，私有页只对作者出现
- 收藏（每个人自己的）和置顶（同级排序，看见这篇的人都会看到）
- 私有 / 公开。私有只有作者能打开；公开对工作区成员可见，并有一条只读分享链接
- 空状态、加载骨架、错误提示和保存状态
- 编辑后约 500 毫秒自动保存。保存失败时提示原因，并可以手动重试
- 同一页在别处保存过时，后提交的人会看到冲突，可以选择覆盖，或放弃并刷新

## 界面

登录。

![登录](docs/screenshots/login.png)

工作区首页，侧栏里是收藏和嵌套页面。

![工作区](docs/screenshots/workspace.png)

块编辑。欢迎页包含列表、待办和代码块。

![编辑器](docs/screenshots/editor.png)

搜索会命中标题和正文，包括代码里的词。

![搜索](docs/screenshots/search.png)

Markdown 源码和预览并排。

![Markdown](docs/screenshots/markdown.png)

公开页可以不登录阅读。

![分享](docs/screenshots/share.png)

窄屏下侧栏收进抽屉。

![移动端](docs/screenshots/mobile.png)

## 测试

```bash
npm test
npm run test:e2e
```

`npm test` 跑单元测试，覆盖块编辑、行内格式、Markdown 往返、搜索排序、页面树拖拽和复制、权限、快捷键、引用、折叠、图片校验、代码着色，以及大页面里未改动块保持原对象。当前 63 个通过。

`npm run test:e2e` 会先推送数据库并重新播种，再用 Playwright 打开应用。覆盖错误密码、注册、创建并嵌套页面、编辑块、搜索、切换工作区、收藏、置顶、Markdown、空工作区、私有页、分享链接，以及块拖拽、空块光标、富文本保存、斜体对齐、引用、折叠、图片上传、代码高亮、页面树拖拽、页面复制、并发冲突和保存失败重试。当前 45 个通过。第一次跑之前需要 `npx playwright install chromium`。

阶段说明在 [docs/EDITOR_RICH_TEXT.md](docs/EDITOR_RICH_TEXT.md)、[docs/EDITOR_DRAG.md](docs/EDITOR_DRAG.md)、[docs/PHASE1_TESTS.md](docs/PHASE1_TESTS.md)、[docs/NEW_BLOCKS.md](docs/NEW_BLOCKS.md)、[docs/PAGE_TREE_OPS.md](docs/PAGE_TREE_OPS.md)、[docs/CONFLICT_AND_SAVE.md](docs/CONFLICT_AND_SAVE.md)、[docs/LARGE_PAGE_TEST.md](docs/LARGE_PAGE_TEST.md)。

重置本地数据：

```bash
npm run db:reset
```

## 已知限制

- 没有实时协作。同一页在别处已经保存时，后提交会停在冲突提示上，要选择覆盖或放弃并刷新。
- 块内有加粗、斜体、删除线和行内代码，还没有行内链接。斜体用倾斜变换，占位宽度和光标一致。
- 可以上传图片。单张不超过 2MB，只接受 png、jpeg、gif、webp。
- 同级块可以拖拽排序。页面树可以换顺序和层级；置顶页仍排在同级未置顶页前面。
- 公开表示工作区成员可见，外加一条不易猜到的只读链接，不是更细的权限表。
- 置顶跟页面走，收藏跟用户走。
- 数据库是 SQLite，适合单机演示，不适合多进程同时写。
