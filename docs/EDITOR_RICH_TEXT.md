# 块内富文本

阶段 1.1 的实现说明。块的 `content` 仍然是纯文本，格式单独存在 `marks` 里。输入框的值和光标都按纯文本计算，已有的 `block-input` 断言不用改成带 `**` 的字符串。

## 数据结构

`BlockDTO.marks` 是 `InlineMark[]`：

```ts
type InlineMark = { type: "bold" | "italic" | "code" | "strike"; start: number; end: number }
```

`start` / `end` 是 UTF-16 下标，区间为左闭右开，作用在 `content` 上，不包含标记字符。同一段可以叠多种格式。代码块和分割线的 `marks` 固定是 `[]`。

数据库列是 `Block.marks`，SQLite 里存 JSON 字符串，默认 `"[]"`。读取时 `normalizeMarks` 会丢掉越界、空区间和重复区间。保存走原来的页面 PATCH：`pagePayload` 带上 `marks`，服务端 `createMany` 时 `JSON.stringify`。欢迎页第一段把「Folio」标成加粗，用来确认种子数据也能带格式。

## 渲染

编辑时，文本框和一层只读覆盖叠在同一个 grid 格子里，共用 `blockTextClass` 的字号和行高。文本框文字是透明的，光标仍用 `caret-color`。覆盖层按 `renderInline` 切成若干段，每段带 `data-inline-marks`。

- 加粗用 `text-shadow` 描边，不改成 `font-weight`，这样字宽不变，光标不会和覆盖层错位。
- 删除线用 `line-through`。
- 行内代码只加背景，不加内边距。
- 斜体用 `font-style: italic`。斜体的字宽和正体不完全一样，长段落里光标可能轻微漂移。这是当前已知限制。

只读视图和分享页用同一个 `InlineText`。Markdown 导出用 `serializeInlineMarkup`，外层到内层的顺序是加粗、斜体、删除线、行内代码，相邻片段会共用已经打开的标记。导回时 `parseInlineMarkup` 还原成纯文本加 `marks`。代码块正文不解析行内标记。

## 输入

`onChange` 先用 `applyTextChange` 按前缀 / 后缀差异移动已有区间，再跑 `consumeInlineMarkup`。用户直接打出成对标记时，标记字符会从正文里拿掉，光标用 `mapCaret` 放回新位置。

可被吃掉的写法：

| 格式 | 打出来的标记 | 要求 |
| --- | --- | --- |
| 加粗 | `**文字**` | 中间非空，且两端没有多余空格 |
| 斜体 | `*文字*` | 单个 `*`，不会把 `**` 误判成斜体 |
| 删除线 | `~~文字~~` | 同上 |
| 行内代码 | `` `文字` `` | 代码内部的 `*` 和 `~` 保持原样 |

光标没有选区时，Cmd/Ctrl 快捷键或 `/` 菜单会设置「接下来输入使用这些格式」。有选区时，对这段区间做切换：整段已经是该格式就取消，只盖住一部分就拆开区间。

## 快捷键

文本块（代码块除外）：

| 操作 | 快捷键 | 其他入口 |
| --- | --- | --- |
| 加粗 | Cmd/Ctrl+B | `/` 菜单「加粗」，选区浮动条 |
| 斜体 | Cmd/Ctrl+I | `/` 菜单「斜体」，选区浮动条 |
| 行内代码 | Cmd/Ctrl+E | `/` 菜单「行内代码」，选区浮动条 |
| 删除线 | Cmd/Ctrl+Shift+X | `/` 菜单「删除线」，选区浮动条 |

浮动条在选区非空时出现，按钮是 `format-bold`、`format-italic`、`format-code`、`format-strike`。`/` 菜单里格式项排在块类型前面，测试 id 是 `slash-format-*`。过滤词不含「待办」，所以原来的 `/待办` 仍然只命中待办块。

## 测试

解析、渲染、嵌套、取消和输入位移在 `src/lib/rich-text.test.ts`，9 个单元测试。保存后刷新在 `e2e/editor-phase1.spec.ts` 的「saves bold, italic, strike, and inline code, then reloads them」：快捷键加粗、`/斜体`、浮动条删除线、打出 `` `code` ``，刷新后四段格式都在；再按一次 Cmd/Ctrl+B 取消加粗，刷新后加粗消失。汇总表见 [PHASE1_TESTS.md](./PHASE1_TESTS.md)。
