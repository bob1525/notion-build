# 块类型

阶段 2 在原有块上增加引用、折叠和图片，并给代码块做了三种语言的着色。分割线在编辑器和只读视图里用同一个 `DividerRule`。

## 全部块类型

| 类型 | 怎么创建 | 数据字段 | 说明 |
| --- | --- | --- | --- |
| paragraph | 默认块，`/` 文本 | `content`、`marks` | 普通段落 |
| heading1 / heading2 / heading3 | `#`、`##`、`###` 加空格，或 `/` | `content`、`marks` | 标题 |
| bulleted | `-`、`*`、`+` 加空格，或 `/` | `content`、`marks` | 无序列表 |
| numbered | `1.` 或 `1)` 加空格，或 `/` | `content`、`marks` | 有序列表，编号按同级连续计算 |
| todo | `[]` 加空格，或 `/` | `content`、`marks`、`checked` | 待办 |
| code | 行尾再输入一个 `` ` `` 凑成 ` ``` `，或 `/` | `content`、`language` | 代码。`marks` 固定为空 |
| divider | `--` 后再输入 `-`，或 `/` | 无正文 | `content` 固定为空。样式类名 `folio-divider` |
| quote | `>` 加空格，或 `/引用` | `content`、`marks`、`parentId` | 左边线引用。Enter 在非空引用里会把后半段放进嵌套段落 |
| toggle | `>>` 加空格，或 `/折叠` | `content`、`marks`、`collapsed`、`parentId` | 标题行可收起。`collapsed` 随页面保存，刷新后保持 |
| image | `/图片` | `src`、`width`、`content` | `content` 是替代文字。`width` 为 small / medium / large |

每个块还有 `id`、`type`、`position`。嵌套只允许挂在引用或折叠下面，`parentId` 指向那个块。指到别的类型、指向自己或形成环时，规范化会把 `parentId` 清掉，子块回到顶层，不会丢文字。

引用和折叠的「添加嵌套内容」会插入一个子段落，并在折叠处于收起时把它打开。Tab 在块首可以把当前块放进前一个引用或折叠；Shift+Tab 把它升一级。删除引用或折叠时，子树一起删除。页面里只剩这一棵时，仍留下一个空段落。

## 代码高亮

`highlightCode` 只改颜色，不改字重，所以等宽字体下光标和覆盖层对齐。支持的语言：

- JavaScript，以及 TypeScript（同一套关键字）
- Python
- CSS

其它语言选项仍然可以选，正文按纯文本显示。关键字、字符串、注释、数字四类 token 拼回去必须等于原文。

## 分割线

编辑器和分享页都渲染 `<hr class="folio-divider" data-testid="divider-rule">`。高度 1px，上下 14px，颜色 `rgba(55, 53, 47, 0.16)`。连续渲染两次标记相同。

## 图片上传

图片不进数据库正文的 base64。登录用户向 `POST /api/uploads` 提交 `multipart/form-data` 的 `file` 字段。服务端检查：

1. 必须已登录。
2. MIME 必须是 `image/png`、`image/jpeg`、`image/gif` 或 `image/webp`。
3. 体积大于 0 且不超过 2MB。
4. 文件头要和 MIME 一致（PNG / JPEG / GIF / WEBP 魔数）。改了扩展名的文本会被拒绝。

通过后交给图片存储。默认实现写到 `public/uploads/<uuid>.<ext>`，返回 `{ data: { url: "/uploads/<uuid>.<ext>" } }`。换成对象存储的方式见 [IMAGE_STORAGE.md](IMAGE_STORAGE.md)。页面把返回的地址存进块的 `src`，随原来的自动保存写入 SQLite。`public/uploads/*` 已忽略，不进 git。

用地址插入时，`imageUrlError` 只接受带主机名的 `http:` 和 `https:`。`notaurl`、`ftp:` 和空字符串会在块上显示「图片地址无效」或「请填写图片地址」，不会写入 `src`。图片加载失败时显示「图片无法显示」，地址仍保留，方便改。

宽度三档是固定布局宽度，不是原图像素：小 240px，中 480px，大 100%。都有 `max-width: 100%`。默认中。

## 已知限制

- 引用和折叠只嵌套块，不能把页面拖进块里。
- 折叠收起时子块不在 DOM 里，但数据还在。
- 代码高亮是关键字着色，不是完整语法树。SQL、Bash、JSON、Markdown 语言选项还没有着色。
- 上传文件用 UUID 文件名，知道地址的人可以打开。没有单独的鉴权读取。
- 单张图片上限 2MB。没有裁剪、对齐或图注编辑器；替代文字就是块的 `content`，当前图片面板没有单独的替代文字输入框。
- 斜体仍是视觉倾斜。占位宽度已经和光标一致，字形会略微探出格子。

## 测试记录

本阶段结束时全量结果：单元测试 **56 / 56**，端到端 **31 / 31**。原有用例都还在。

| 范围 | 新增 | 结果 |
| --- | --- | --- |
| 斜体占位（阶段 1 修正） | 单元 1，端到端 1 | 通过。样式表禁止 `font-style: italic`；「乙丙」的 `offsetWidth` 与正体测量差不超过 1px |
| 引用 | 单元 4 | 创建、编辑、渲染左边线、嵌套段落后出现在 `quote-children` 里 |
| 折叠 | 单元 4 | 创建、编辑标题、展开能看见子块而收起看不见、`collapsed` 和 `parentId` 经过 `normalizeBlocks` 仍在 |
| 分割线 | 单元 1 | 连续两次渲染的 HTML 相同，且包含 `folio-divider` |
| 高亮 | 单元 3 | JavaScript / TypeScript、Python、CSS；同一段源码换语言后关键字集合不同，且 token 拼回原文 |
| 图片校验 | 单元 3 | 合法 http(s)、无效地址、真 PNG 通过、文本和伪造 PNG 被拒绝 |
| 端到端 `e2e/editor-phase2.spec.ts` | 10 | 见下表 |

| 端到端 | 覆盖 |
| --- | --- |
| creates and edits a quote | 创建、编辑、刷新后仍是引用 |
| nests content inside a quote and keeps it after reload | 嵌套段落，刷新后外层和内层都在 |
| creates and edits a toggle title | 创建并编辑折叠标题 |
| remembers whether a toggle is collapsed | 收起后刷新仍收起，再展开能看见「藏起来」 |
| uploads a local image and shows it | 上传 1×1 PNG，预览地址为 `/uploads/*.png`，刷新后仍在 |
| shows an error when the upload is not an image | 上传 `note.txt`，接口失败，文案「只能上传图片」，没有预览 |
| rejects an invalid image url | 填 `notaurl`，文案「图片地址无效」，没有预览 |
| switches an image between small, medium, and large | 默认中，切到小，再切到大，刷新后仍是大 |
| highlights javascript, python, and css after the language changes | `const` 在 JavaScript 中是关键字，切到 CSS 后不是；Python 的 `def` / `return` 着色，刷新后仍在 |
| renders one stable divider | `---` 得到一条 `folio-divider`，刷新后仍是一条 |

相关说明：[EDITOR_RICH_TEXT.md](./EDITOR_RICH_TEXT.md)、[EDITOR_DRAG.md](./EDITOR_DRAG.md)、[PHASE1_TESTS.md](./PHASE1_TESTS.md)。
